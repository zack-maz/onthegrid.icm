import { Router } from 'express';
import { z } from 'zod';

import { fetchEvents, backfillEvents } from '../adapters/gdelt.js';
import { isLLMConfigured } from '../adapters/llm-provider.js';
import { loadDevLLMCacheV2 } from '../cache/devFileCache.js';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { WAR_START, CACHE_TTL } from '../config.js';
import { groupGdeltRows } from '../lib/eventGrouping.js';
import { extractBellingcatGeo } from '../lib/eventScoring.js';
import { listDLQ } from '../lib/llmDLQ.js';
import { processEventGroupsV3 } from '../lib/llmEventExtractor.v3.js';
import { enrichedV3ToEntities } from '../lib/llmExtractionPipeline.js';
import { llmProgress } from '../lib/llmProgress.js';
import { shouldPauseNewEvents } from '../lib/llmTokenBudget.js';
import { logger } from '../lib/logger.js';
import { normalizeEventTypes } from '../lib/normalizeEventTypes.js';
// Phase 27.4 Plan 08 D-21 — v2-only replay path re-extracts a single group
// without writing to cache (Pitfall 6 defense-in-depth).
// Phase 27.4.3 Plan 02b — v3 replay path mirrors v2: re-extracts a single
// group without writing to events:llm:v3 (Pitfall 6 defense-in-depth).
// Phase 27.4.3 Plan 02b B-3 — pipeline-flip audit log; canonical home is lib
// (routes is consumer, not provider). Cyclic-import fix in place.
import { appendOperatorAuditEntry, bearerFingerprint } from '../lib/operatorAudit.js';
import { listPipelineAudit } from '../lib/pipelineAudit.js';
// Phase 28.2 Plan 03 D-08 — operator-action audit log + per-Bearer replay
// quota guardrails on the dashboardAuth-gated /llm-pipeline + /llm-replay
// endpoints. Both helpers degrade open on Redis failure (logged, not thrown).
import { checkReplayQuota } from '../lib/replayQuota.js';
// Phase 27.4.6 — entity adapters live with the cron-driven extraction
// helper. The legacy `enrichedToEntities` alias re-exported from this file
// pulls from there so existing import sites continue to type-check.
import { extractDomain, getSourceTier } from '../lib/sourceTiers.js';
import { dashboardAuth } from '../middleware/dashboardAuth.js';
import { AppError } from '../middleware/errorHandler.js';
import { validateQuery } from '../middleware/validate.js';
import { sendValidated } from '../middleware/validateResponse.js';
import { eventsResponseSchema } from '../schemas/cacheResponse.js';

import type { LLMRunSummary } from '../lib/llmProgress.js';
import type { GeocodeProvenance } from '../lib/llmSchema.js';
import type { ConflictEventEntity, NewsCluster } from '../types.js';

/** Zod schema for /api/events query params */

const log = logger.child({ module: 'events' });

const eventsQuerySchema = z.object({
  backfill: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Redis key for accumulated GDELT events */
const EVENTS_KEY = 'events:gdelt';

/** Logical TTL in ms -- used to compute staleness (15 minutes) */
const LOGICAL_TTL_MS = CACHE_TTL.events;

/** Hard Redis TTL in seconds -- 10x logical TTL (2.5 hours) for stale-but-servable data */
const REDIS_TTL_SEC = 9000;

/** Redis key storing last backfill Unix ms timestamp */
const BACKFILL_KEY = 'events:backfill-ts';

/** 1 hour cooldown to prevent hammering GDELT master list */
const BACKFILL_COOLDOWN_MS = 3_600_000;

/** Redis key for LLM-enriched events (separate from raw GDELT).
 *  Phase 29 D-02 part C — collapsed to v3-only; v1 + v2 keys retired. */
const LLM_EVENTS_KEY_ACTIVE = 'events:llm:v3';

/** Redis key for the active LLM run summary. v3-only post-Phase-29. */
const LLM_SUMMARY_KEY_ACTIVE_NAME = 'events:llm-summary:v3';

/** Redis key storing last LLM processing Unix ms timestamp */
const LLM_PROCESS_KEY = 'events:llm-process-ts';

/** Logical TTL for LLM cache — 15 minutes */
const LLM_LOGICAL_TTL_MS = 900_000;

/** Hard Redis TTL for LLM cache — 2.5 hours (same as raw GDELT) */
const LLM_REDIS_TTL_SEC = 9000;

/** 24-hour TTL for LLM summary — retained across multiple pipeline runs */
const LLM_SUMMARY_TTL_SEC = 86_400;

/**
 * Phase 27.4 Plan 09 B4 — dev-only projected shape consumed by
 * DevApiStatus DrillDownBlock. Matches RecentEnrichedEvent on the client
 * side (src/hooks/useLLMStatusPolling.ts).
 *
 * The v2 extractor's richer fields (full location hierarchy, weapon/target,
 * confidence, reasoning, per-event token counts, geocode provenance) are
 * not yet persisted onto the cached ConflictEventEntity.data envelope —
 * only locationName/summary/precision/sourceCount survive the
 * enrichedV2ToEntities projection. We therefore populate what we can and
 * null out the rest so the client renderer degrades gracefully; richer
 * per-event persistence is a follow-up (noted in the plan's pattern map).
 */
export interface RecentEnrichedEvent {
  groupKey: string;
  location: {
    country: string | null;
    admin1: string | null;
    city: string | null;
    neighborhood: string | null;
    landmark: string | null;
  };
  precision: 'exact' | 'neighborhood' | 'city' | 'region';
  confidence: number;
  reasoning: string;
  weaponType: string | null;
  targetType: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  provenance: GeocodeProvenance;
  sources: string[];
  fetchedAt: number;
}

/**
 * Read the active v2 LLM cache and project the last N entries into
 * RecentEnrichedEvent shape for DevApiStatus DrillDownBlock.
 *
 * Graceful degradation (D-29 / CLAUDE.md): any error returns [] so the
 * /llm-status endpoint never crashes because the cache is unreachable.
 */
async function loadRecentEnrichedEvents(limit: number): Promise<RecentEnrichedEvent[]> {
  // Phase 29 D-02 part C — v3-only terminal cache. The Pitfall 1 bridge in
  // the main GET handler now falls through directly to raw GDELT when v3 is
  // empty (v2/v1 read legs were deleted alongside the v1+v2 extractor
  // modules — see L501-507 below). The dev drill-down projects only the
  // active v3 key; if it is empty, an empty array is returned and the
  // drawer renders the empty-state placeholder rather than attempting any
  // legacy-cache promotion.
  try {
    const cached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 0);
    const events = toEntityArray(cached?.data);
    if (events.length === 0) return [];

    // Phase 29 WR-05: source `confidence` from llmProgress.recentEvents
    // (populated by llmEventExtractor.v3.ts:839 with confidence:
    // enrichedEvt.confidence) instead of from the cached entity.
    // enrichedV3ToEntities never writes confidence onto template.data,
    // so the prior `d.confidence ?? 0` always rendered 0 in the dev
    // drill-down even when the LLM emitted a valid 0-1 score. Indexing
    // by groupKey avoids a cache-shape bump.
    const confidenceByGroupKey = new Map<string, number>();
    const recentEvents = llmProgress.recentEvents ?? [];
    for (const r of recentEvents) {
      if (r.groupKey && typeof r.confidence === 'number') {
        confidenceByGroupKey.set(r.groupKey, r.confidence);
      }
    }

    // Most recent first — entity.timestamp is the event timestamp.
    return events
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((e): RecentEnrichedEvent => {
        const d = (e.data ?? {}) as {
          locationName?: string;
          summary?: string;
          precision?: 'exact' | 'neighborhood' | 'city' | 'region';
          sourceCount?: number;
          source?: string;
        } & Partial<{
          location: RecentEnrichedEvent['location'];
          reasoning: string;
          weaponType: string | null;
          targetType: string | null;
          tokensIn: number | null;
          tokensOut: number | null;
          geocodeProvenance: GeocodeProvenance;
          sourceUrls: string[];
        }>;
        // The stable groupKey is embedded in the v3 id as `llm-v3-${key}`;
        // strip the prefix and any trailing index suffix we may add later.
        const groupKey = e.id.replace(/^llm-v3-/, '').replace(/-\d+$/, '');
        return {
          groupKey,
          location: d.location ?? {
            // Best-effort: if the entity only carries locationName we
            // surface it in the city slot so the summary row is useful.
            country: null,
            admin1: null,
            city: d.locationName ?? null,
            neighborhood: null,
            landmark: null,
          },
          precision: d.precision ?? 'region',
          // WR-05: fallback to 0 ONLY when no recent-events entry exists
          // for this groupKey (e.g., cold start / progress singleton was
          // cleared between runs while v3 cache survived).
          confidence: confidenceByGroupKey.get(groupKey) ?? 0,
          reasoning: d.reasoning ?? '',
          weaponType: d.weaponType ?? null,
          targetType: d.targetType ?? null,
          tokensIn: d.tokensIn ?? null,
          tokensOut: d.tokensOut ?? null,
          provenance: d.geocodeProvenance ?? 'gdelt-actiongeo-fallback',
          sources: d.sourceUrls ?? (d.source ? [d.source] : []),
          fetchedAt: e.timestamp,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Check whether a backfill should run.
 * Returns true if never backfilled or cooldown has expired.
 *
 * Resilient to Redis death: if the redis client throws (e.g. Upstash REST is
 * down), we allow the backfill attempt rather than crashing the request. The
 * backfill itself is wrapped in its own try/catch by the caller, so a
 * subsequent redis.set failure is also non-fatal.
 */
async function shouldBackfill(): Promise<boolean> {
  try {
    const lastTs = await redis.get<number>(BACKFILL_KEY);
    if (lastTs === null || lastTs === undefined) return true;
    return Date.now() - lastTs > BACKFILL_COOLDOWN_MS;
  } catch {
    // Redis unreachable -- allow backfill, it has its own error handling
    return true;
  }
}

/**
 * Persist the backfill timestamp without throwing on Redis failure.
 * Best-effort: if Redis is dead, the next request will simply re-attempt
 * the backfill (rate-limited by GDELT itself, not catastrophic).
 */
async function recordBackfillTimestamp(): Promise<void> {
  try {
    await redis.set(BACKFILL_KEY, Date.now(), { ex: REDIS_TTL_SEC });
  } catch {
    // Swallow: cooldown tracking is non-critical
  }
}

// Phase 27.4.6 — the prior 15-min cooldown gate (formerly a local
// `shouldRun…` helper) has been removed: the cache-only /api/events path no
// longer triggers extractions, and the cron-driven helper inlines its own
// cooldown check inside `runRefreshExtraction()` over at
// `server/lib/llmExtractionPipeline.ts`.
//
// `recordLLMTimestamp()` is preserved (below) because the dev-file-cache
// hydration path stamps the cooldown after populating Redis from disk so a
// cron tick fired moments later doesn't redundantly extract the same data.

/**
 * Persist the LLM processing timestamp without throwing on Redis failure.
 * Best-effort: if Redis is dead, the next dev-file-cache hydration may
 * re-stamp the cooldown — non-catastrophic.
 */
async function recordLLMTimestamp(): Promise<void> {
  try {
    await redis.set(LLM_PROCESS_KEY, Date.now(), { ex: LLM_REDIS_TTL_SEC });
  } catch {
    /* best-effort */
  }
}

// Phase 27.4.6 — entity adapters live with the cron-driven extraction
// helper at `server/lib/llmExtractionPipeline.ts`. Phase 29 D-02 part C
// removed the v1 + v2 adapters alongside their extractor modules; only
// the v3 adapter remains as the active path.

/** Deprecated alias — re-exports the v3 adapter from the helper module so
 *  any legacy importer continues to type-check. Remove in 27.5 cleanup. */
export const enrichedToEntities = enrichedV3ToEntities;

/**
 * Wrap sendValidated to normalize event types before Zod validation.
 * Remaps old 11-type taxonomy (ground_combat, shelling, etc.) cached in Redis
 * to the new 5-type system so conflictEventEntitySchema doesn't reject them.
 */
function sendNormalizedEvents(
  res: import('express').Response,
  payload: {
    data: ConflictEventEntity[];
    stale: boolean;
    lastFresh: number;
    rateLimited?: boolean;
    degraded?: boolean;
  },
): void {
  sendValidated(res, eventsResponseSchema, {
    ...payload,
    data: normalizeEventTypes(payload.data),
  });
}

/**
 * Phase 27.4.1 post-ship defense-in-depth (2026-04-24).
 *
 * The active LLM cache key is owned by the cron-driven extraction helper
 * (server/lib/llmExtractionPipeline.ts) which stores a ConflictEventEntity[]
 * array. Earlier work briefly wrote an LLMCachePayload envelope to the
 * terminal key which crashed every consumer (events.map is not a function;
 * llmCachedRef.data is not iterable); the writer is fixed in a5c8846 to
 * target the :partial sibling key instead.
 *
 * This guard is belt-and-suspenders — if any future regression reintroduces
 * an envelope write to the terminal key, the synchronous HTTP path
 * degrades to "serve empty / recompute from scratch" instead of throwing
 * 500. Control falls through to the raw GDELT path below so the map
 * never goes blank.
 *
 * Callers should apply at the read site so downstream consumers (iteration
 * loops, .find, .map, sendNormalizedEvents payload) can trust the shape.
 */
function toEntityArray(data: unknown): ConflictEventEntity[] {
  return Array.isArray(data) ? (data as ConflictEventEntity[]) : [];
}

function coerceCachedEvents<C extends { data: unknown }>(
  cached: C,
): Omit<C, 'data'> & { data: ConflictEventEntity[] } {
  return { ...cached, data: toEntityArray(cached.data) };
}

export const eventsRouter = Router();

// override endpoint removed Phase 29 D-02 — pipeline pin surface deleted.
// Phase 29 D-02 part C — pipeline-version branching collapsed to v3-only.

/**
 * DEV-ONLY: LLM pipeline status endpoint.
 * Returns live in-memory progress when pipeline is active, or Redis summary
 * from the last completed run when idle. Gated by NODE_ENV in production.
 */
eventsRouter.get('/llm-status', dashboardAuth, async (_req, res) => {
  // Phase 27.4.4 Plan 02 — dashboardAuth middleware replaces the prior
  // `NODE_ENV === 'production'` 404 gate. /llm-status surfaces operator-grade
  // telemetry (DLQ, watchdog timeouts, eval scores, routing trace) — same
  // sensitivity as /llm-pipeline, so same Bearer gate.

  // Phase 29 D-02 part C — single active key for v3 summary cache.
  const LLM_SUMMARY_KEY_ACTIVE = LLM_SUMMARY_KEY_ACTIVE_NAME;

  // Phase 27.4 Plan 09 — assemble the full v2/v3 observability payload:
  //   * DLQ recent entries (D-30) — bounded at 50
  //   * Projected recent enriched events (B4 / D-18)
  //   * Soft-cap pause flag (B5 surface / D-33)
  //   * Pipeline-flip audit log (B-3 / D-15) — 50 most recent entries
  //
  // Each is try/caught internally; a degraded signal returns [] or false
  // rather than throwing. The /llm-status endpoint is the single pane of
  // glass ops relies on before the D-25 prod flip, so availability matters
  // more than any single block being populated.
  const [dlqRecent, recentEvents, paused, pipelineFlips] = await Promise.all([
    listDLQ(50).catch(() => []),
    loadRecentEnrichedEvents(50).catch(() => []),
    shouldPauseNewEvents().catch(() => false),
    listPipelineAudit(50).catch(() => []),
  ]);

  const common = {
    schemaVersion: llmProgress.schemaVersion,
    callHistory: llmProgress.callHistory,
    tokenCounters: llmProgress.tokenCounters,
    dlqCount: llmProgress.dlqCount ?? dlqRecent.length,
    dlqRecent,
    recentEvents,
    paused,
    breakerState: llmProgress.breakerState,
    evalScore: llmProgress.evalScore,
    provenanceCounts: llmProgress.provenanceCounts,
    suspectCount: llmProgress.suspectCount,
    // ===== Phase 27.4.3 Plan 02b — v3 observability fields =====
    routingTrace: llmProgress.routingTrace,
    // I-9 inline naming asymmetry note: server uses `latencyHistogram` (with
    // the `samples` ring buffer); the wire contract drops `samples` and
    // renames to `latency` to match the UI-SPEC client field. See
    // useLLMStatusPolling.ts.
    latency: llmProgress.latencyHistogram,
    rateLimit: llmProgress.rateLimit,
    schemaFailures: llmProgress.schemaFailures,
    errorTaxonomy: llmProgress.errorTaxonomy,
    costShadow: llmProgress.costShadow,
    pipelineFlips,
  };

  // If in-memory progress is active (not idle), return it merged with the
  // v2 observability common block so DevApiStatus sees DLQ / drill-down
  // even mid-run.
  if (llmProgress.stage !== 'idle') {
    return res.json({ ...llmProgress, ...common });
  }

  // Otherwise, fall back to Redis summary from last completed run
  try {
    const summary = await cacheGetSafe<LLMRunSummary>(LLM_SUMMARY_KEY_ACTIVE, 0);
    if (summary?.data) {
      return res.json({ stage: 'idle' as const, lastRun: summary.data, ...common });
    }
  } catch {
    // Redis failure — return idle with no history but still surface the
    // v2 observability common block.
  }

  res.json({ stage: 'idle' as const, lastRun: null, ...common });
});

/**
 * Phase 27.4 Plan 08 D-21 — dev-only prompt replay endpoint.
 *
 * Re-extracts a single cached event group with the CURRENT prompt and
 * returns `{ old, new }` so the operator can iterate on prompt wording
 * side-by-side without waiting for the full pipeline cycle.
 *
 * CRITICAL (threat T-27.4-08-05 / Pitfall 6): the handler MUST NOT write
 * back to the terminal LLM cache key. It is strictly read-only vs. the
 * cache. Any `cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, ...)` call here is a bug.
 *
 * CRITICAL (threat T-27.4-08-01 / Pitfall 6): dual-layer dev gate —
 *   1. Route registered ONLY when NODE_ENV !== 'production' so the endpoint
 *      is not even mounted in prod (defense-in-depth).
 *   2. In-handler 404 check in case NODE_ENV changes post-registration.
 *
 * groupKey is sanitized (length cap + typeof string) per T-27.4-08-02.
 */
// Phase 27.4.4 Plan 02 — register unconditionally. The previous
// `if (process.env.NODE_ENV !== 'production')` wrapper made the route
// physically absent from the prod app object, which 404'd before the
// dashboardAuth middleware could ever evaluate the Bearer header. The
// middleware itself now enforces the prod gate (NODE_ENV !== 'production'
// → bypass; prod + matching Bearer → next; prod + bad → 401).
{
  eventsRouter.post('/llm-replay/:groupKey', dashboardAuth, async (req, res) => {
    // Phase 27.4.4 Plan 02 — dashboardAuth middleware replaces the prior
    // `NODE_ENV === 'production'` 404 gate. In dev the middleware bypasses;
    // in prod the operator's Bearer token must match DASHBOARD_PASSWORD.
    const { groupKey } = req.params;
    // T-27.4-08-02 — length cap + type guard. Express populates req.params
    // as string but an attacker could force unexpected shapes via malformed
    // URLs; the typeof check is belt-and-braces.
    if (!groupKey || typeof groupKey !== 'string' || groupKey.length > 200) {
      return res.status(400).json({ error: 'invalid_group_key' });
    }

    // Phase 28.2 Plan 03 D-08 / AI-SPEC §6 — per-Bearer replay quota check
    // BEFORE any LLM token spend. 50 calls / UTC day per Bearer fingerprint.
    // The INCR + key check is ~1ms; the LLM call below is ~27s. Beyond the
    // cap, return 429 + Retry-After so a compromised Bearer cannot drain the
    // daily token budget within minutes (T-28.2-03-02 mitigation).
    const fingerprint = bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '');
    const quota = await checkReplayQuota(fingerprint);
    if (!quota.allowed) {
      res.set('Retry-After', String(quota.retryAfterSeconds));
      return res.status(429).json({
        error: 'replay_quota_exceeded',
        message: `Replay quota reached: ${quota.cap} of ${quota.cap} in last 24h.`,
        resetsAt: quota.resetsAt,
      });
    }

    // Phase 29 D-02 part C — v3-only replay path. v1 + v2 extractor modules
    // are gone; the cache is exclusively the `events:llm:v3` terminal key.
    const cached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 0);
    const existing = toEntityArray(cached?.data).find((e) => e.id.includes(groupKey));
    if (!existing) return res.status(404).json({ error: 'not_found' });

    // Reconstruct the target group from the raw GDELT cache — the extractor
    // needs an EventGroup, not a ConflictEventEntity.
    const rawCache = await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, 0);
    if (!rawCache?.data) return res.status(404).json({ error: 'gdelt_cache_empty' });
    const groups = groupGdeltRows(rawCache.data);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return res.status(404).json({ error: 'group_gone' });

    // Re-extract a SINGLE group — processEventGroupsV3 itself does not write
    // to cache; the only caller that does is the cron-driven extraction
    // helper. This is the Pitfall 6 "cache-read-only" invariant.
    try {
      const extraction = await processEventGroupsV3([group]);
      const first = extraction?.events?.[0] ?? null;
      const diffPayload: { old: ConflictEventEntity; new: unknown } = {
        old: existing,
        new: first,
      };

      // Phase 28.2 Plan 03 D-08 / AI-SPEC §5 — append audit entry BEFORE
      // responding so "synchronous before HTTP response" (the AWAIT contract,
      // not the Redis-success guarantee — appendOperatorAuditEntry degrades
      // open on Redis failure).
      await appendOperatorAuditEntry({
        timestamp: Date.now(),
        bearerFingerprint: fingerprint,
        operation: 'replay',
        args: { groupKey, replayVersion: 'v3' },
        result: 'ok',
      });

      return res.json(diffPayload);
    } catch (err) {
      return res.status(500).json({
        error: 'extract_failed',
        detail: String(err).slice(0, 200),
      });
    }
  });
}

// override endpoint removed Phase 29 D-02 — operator pin-pipeline surface
// (set/get/clear + audit-log entry on flip) deleted. Pipeline version is
// now fixed by env at deploy time. UI deletion of the Pin-to-v1/v2/v3
// buttons + PipelineVersionPill lands in Plan 08 so an intermediate
// "buttons present, route 404" state never ships.

eventsRouter.get('/', validateQuery(eventsQuerySchema), async (_req, res) => {
  const { backfill: forceBackfill } = res.locals.validatedQuery as z.infer<
    typeof eventsQuerySchema
  >;

  // Pitfall 1 bridge simplified Phase 29 D-02 — v3 cache → raw GDELT only.
  // v1 + v2 read legs deleted alongside the v1+v2 extractor modules. If the
  // v3 primary is empty or stale, control falls through to the raw GDELT
  // fetch path below; the "map never goes blank" contract is preserved by
  // that terminal fallback (docs/degradation.md cache-layer + data-source
  // layer sections — the LLM bridge specifics were never part of the
  // documented contract).
  const LLM_SUMMARY_KEY_ACTIVE = LLM_SUMMARY_KEY_ACTIVE_NAME;

  // --- LLM cache check (highest priority: serve enriched events if fresh) ---
  // Post-ship defense-in-depth 2026-04-24: coerce to array-shape immediately
  // so the sync HTTP path (sendNormalizedEvents → normalizeEventTypes.map),
  // and any downstream iteration see a guaranteed ConflictEventEntity[]
  // regardless of what shape the cache holds.
  let llmCached = await cacheGetSafe<ConflictEventEntity[]>(
    LLM_EVENTS_KEY_ACTIVE,
    LLM_LOGICAL_TTL_MS,
  );
  if (llmCached) llmCached = coerceCachedEvents(llmCached);
  if (llmCached && !llmCached.stale) {
    return sendNormalizedEvents(res, llmCached);
  }

  // Dev fallback: if Redis LLM cache is empty, try local file cache to avoid
  // re-processing. v3 reuses the v2 dev file cache shape post-Phase-29 so
  // dev environments without Redis still hydrate something useful.
  if (!llmCached?.data) {
    const devData = loadDevLLMCacheV2<ConflictEventEntity[]>();
    if (devData) {
      // Seed Redis from file so subsequent requests are fast
      await cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, devData, LLM_REDIS_TTL_SEC);
      // Write synthetic summary so LLM Pipeline section shows "loaded from file cache"
      const geocoded = devData.filter(
        (e) => e.data.precision && e.data.precision !== 'region',
      ).length;
      const summary: LLMRunSummary = {
        lastRun: Date.now(),
        groupCount: devData.length,
        batchCount: 0,
        geocodeCount: geocoded,
        enrichedCount: devData.length,
        durationMs: 0,
        error: null,
        source: 'dev-file-cache',
        schemaVersion: 'v3',
      };
      await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, summary, LLM_SUMMARY_TTL_SEC);
      // Set cooldown so the pipeline doesn't re-trigger on the next request
      await recordLLMTimestamp();
      log.info({ count: devData.length }, 'served LLM events from dev file cache');
      return sendNormalizedEvents(res, { data: devData, stale: false, lastFresh: Date.now() });
    }
  }

  // Check raw GDELT cache (skip on forced backfill)
  const cached = forceBackfill
    ? null
    : await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale && !isLLMConfigured()) {
    return sendNormalizedEvents(res, cached);
  }

  try {
    // Extract Bellingcat articles from news cache for corroboration boost (opportunistic)
    let bellingcatArticles: {
      title: string;
      url: string;
      publishedAt: number;
      lat?: number;
      lng?: number;
    }[] = [];
    try {
      const newsCache = await cacheGetSafe<NewsCluster[]>('news:gdelt', 0);
      if (newsCache?.data) {
        bellingcatArticles = newsCache.data
          .flatMap((cluster) => cluster.articles)
          .filter((a) => a.source === 'Bellingcat')
          .map((a) => ({
            title: a.title,
            url: a.url,
            publishedAt: a.publishedAt,
            ...extractBellingcatGeo(a.title),
          }));
      }
    } catch {
      // Non-fatal: if news cache is unavailable, proceed without corroboration
      log.warn('failed to fetch Bellingcat articles for corroboration');
    }

    const fresh = await fetchEvents(bellingcatArticles);

    // Merge: seed with cached data (if any), then overwrite with fresh events
    const eventMap = new Map<string, ConflictEventEntity>();
    if (cached) {
      for (const event of cached.data) {
        eventMap.set(event.id, event);
      }
    }

    // Lazy backfill: seed historical events when cache is empty or forced
    if ((!cached || forceBackfill) && (forceBackfill || (await shouldBackfill()))) {
      try {
        const backfillDays = Math.ceil((Date.now() - WAR_START) / 86_400_000);
        const backfillData = await backfillEvents(backfillDays);
        // Merge backfill first so fresh events overwrite any duplicates
        for (const event of backfillData) {
          eventMap.set(event.id, event);
        }
        await recordBackfillTimestamp();
        log.info({ count: backfillData.length }, 'backfill: merged historical events');
      } catch (backfillErr) {
        log.warn({ err: backfillErr }, 'backfill failed (non-fatal)');
      }
    }

    for (const event of fresh) {
      eventMap.set(event.id, event);
    }

    // Prune events with timestamp before WAR_START
    for (const [id, event] of eventMap) {
      if (event.timestamp < WAR_START) {
        eventMap.delete(id);
      }
    }

    const merged = Array.from(eventMap.values());

    // Inject sourceTier on raw events that don't already have it
    for (const event of merged) {
      if (event.data.sourceTier === undefined && event.data.source) {
        const domain = extractDomain(event.data.source);
        const tier = domain ? getSourceTier('', domain) : null;
        if (tier !== null) {
          event.data.sourceTier = tier;
        }
      }
    }

    // Store raw (undispersed) coordinates — dispersion is applied client-side
    // in useFilteredEntities so it dynamically adjusts when filters change.
    await cacheSetSafe(EVENTS_KEY, merged, REDIS_TTL_SEC);

    // Phase 27.4.6 — cache-only path. Pipeline triggers are now cron-driven
    // via /api/cron/refresh-events (server/routes/refresh-events-cron.ts →
    // server/lib/llmExtractionPipeline.ts:runRefreshExtraction). The prior
    // fire-and-forget block (~265 lines) has been removed in line with
    // anti-pattern #17: do NOT re-introduce extraction triggers on the read
    // path. See CLAUDE.md "Cron-Driven Pipeline Trigger (Phase 27.4.6)".

    // Serve immediately: stale LLM cache if available, otherwise raw GDELT
    if (llmCached?.data) {
      return sendNormalizedEvents(res, {
        data: llmCached.data,
        stale: true,
        lastFresh: llmCached.lastFresh,
      });
    }
    sendNormalizedEvents(res, {
      data: merged,
      stale: false,
      lastFresh: Date.now(),
    });
  } catch (err) {
    log.error({ err }, 'upstream error');

    if (cached) {
      // Prune stale entries even on error
      const pruned = cached.data.filter((e) => e.timestamp >= WAR_START);
      sendNormalizedEvents(res, {
        data: pruned,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      throw new AppError(502, 'UPSTREAM_FAIL', `gdelt fetch failed: ${(err as Error).message}`);
    }
  }
});
