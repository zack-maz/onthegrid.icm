import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'events' });
import { fetchEvents, backfillEvents } from '../adapters/gdelt.js';
import { isLLMConfigured } from '../adapters/llm-provider.js';
import { extractBellingcatGeo } from '../lib/eventScoring.js';
import { normalizeEventTypes } from '../lib/normalizeEventTypes.js';
import { groupGdeltRows } from '../lib/eventGrouping.js';
// Phase 27.4 Plan 08 D-21 — v2-only replay path re-extracts a single group
// without writing to cache (Pitfall 6 defense-in-depth).
import { processEventGroupsV2 } from '../lib/llmEventExtractor.v2.js';
// Phase 27.4.3 Plan 02b — v3 replay path mirrors v2: re-extracts a single
// group without writing to events:llm:v3 (Pitfall 6 defense-in-depth).
import { processEventGroupsV3 } from '../lib/llmEventExtractor.v3.js';
// Phase 27.4.3 Plan 02b B-3 — pipeline-flip audit log; canonical home is lib
// (routes is consumer, not provider). Cyclic-import fix in place.
import { appendPipelineAudit, listPipelineAudit } from '../lib/pipelineAudit.js';
// Phase 27.4.6 — entity adapters live with the cron-driven extraction
// helper. The legacy `enrichedToEntities` alias re-exported from this file
// pulls from there so existing import sites continue to type-check.
import { enrichedV1ToEntities } from '../lib/llmExtractionPipeline.js';
import { llmProgress } from '../lib/llmProgress.js';
import type { LLMRunSummary } from '../lib/llmProgress.js';
import {
  WAR_START,
  CACHE_TTL,
  getPipelineVersion,
  setPipelineOverride,
  getPipelineOverride,
} from '../config.js';
import { shouldPauseNewEvents } from '../lib/llmTokenBudget.js';
import { listDLQ } from '../lib/llmDLQ.js';
import type { GeocodeProvenance } from '../lib/llmSchema.js';
import { validateQuery } from '../middleware/validate.js';
import { dashboardAuth } from '../middleware/dashboardAuth.js';
import { sendValidated } from '../middleware/validateResponse.js';
import { AppError } from '../middleware/errorHandler.js';
import { eventsResponseSchema } from '../schemas/cacheResponse.js';
import type { ConflictEventEntity, NewsCluster } from '../types.js';
import { extractDomain, getSourceTier } from '../lib/sourceTiers.js';
import { loadDevLLMCache, loadDevLLMCacheV2 } from '../cache/devFileCache.js';

/** Zod schema for /api/events query params */
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

/** Redis key for LLM-enriched events (separate from raw GDELT) */
const LLM_EVENTS_KEY = 'events:llm';

/** Redis key storing last LLM processing Unix ms timestamp */
const LLM_PROCESS_KEY = 'events:llm-process-ts';

/** Logical TTL for LLM cache — 15 minutes */
const LLM_LOGICAL_TTL_MS = 900_000;

/** Hard Redis TTL for LLM cache — 2.5 hours (same as raw GDELT) */
const LLM_REDIS_TTL_SEC = 9000;

/** Redis key for LLM pipeline run summary (persisted on completion) */
const LLM_SUMMARY_KEY = 'events:llm-summary';

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
  // Phase 27.4.3 Plan 02b — read v3 cache when v3 is active. Falls back to v2
  // / v1 keys via the cache-fallback chain in the main GET handler; here we
  // only project the active version's terminal cache for the dev drill-down.
  const version = getPipelineVersion();
  const key =
    version === 'v3' ? 'events:llm:v3' : version === 'v2' ? 'events:llm:v2' : LLM_EVENTS_KEY;
  try {
    const cached = await cacheGetSafe<ConflictEventEntity[]>(key, 0);
    const events = toEntityArray(cached?.data);
    if (events.length === 0) return [];
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
          confidence: number;
          reasoning: string;
          weaponType: string | null;
          targetType: string | null;
          tokensIn: number | null;
          tokensOut: number | null;
          geocodeProvenance: GeocodeProvenance;
          sourceUrls: string[];
        }>;
        // The stable groupKey is embedded in the v2 id as `llm-v2-${key}`;
        // strip the prefix and any trailing index suffix we may add later.
        const groupKey = e.id.replace(/^llm-v2-/, '').replace(/-\d+$/, '');
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
          confidence: d.confidence ?? 0,
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

// Phase 27.4.6 — entity adapters (enrichedV1ToEntities / enrichedV2ToEntities
// / enrichedV3ToEntities) live with the cron-driven extraction helper at
// `server/lib/llmExtractionPipeline.ts`. They were imported above; the
// deprecated alias is preserved here for any external consumer that still
// imports `enrichedToEntities` directly.

/** Deprecated alias — re-exports the v1 adapter from the helper module so
 *  any legacy importer continues to type-check. Remove in 27.5 cleanup. */
export const enrichedToEntities = enrichedV1ToEntities;

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
 * `events:llm:v2` is owned by the terminal route write below (~line 1016)
 * which stores a ConflictEventEntity[] array. Plan 03 briefly wrote an
 * LLMCachePayload envelope to the same key which crashed every consumer
 * (events.map is not a function; llmCachedRef.data is not iterable); the
 * writer is fixed in a5c8846 to target events:llm:v2:partial instead.
 *
 * This guard is belt-and-suspenders — if any future regression reintroduces
 * an envelope write to the terminal key, the synchronous HTTP path and
 * the fire-and-forget background task both degrade to "serve empty /
 * recompute from scratch" instead of throwing 500. The Pitfall 1 bridge
 * then kicks in and maps users to v1 cache where possible.
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

// ---------------------------------------------------------------------------
// Phase 27.4 post-debug 2026-04-21 — runtime v1/v2 override
//
// The in-memory override in config.ts takes precedence over the env default.
// It's hydrated from Redis on each /api/events request so multi-worker
// deployments share a single source of truth, and updated immediately on
// POST /llm-pipeline so the caller sees the new version on their next poll.
//
// Redis key: events:llm-pipeline-override ∈ {'v1', 'v2'} | absent
// When absent → env default wins. When set → override wins until cleared
// (POST body: {version: null}) or Redis TTL expires (7 days).
// ---------------------------------------------------------------------------

/** Redis key for the in-memory override. 7-day TTL so orphaned flips expire. */
const PIPELINE_OVERRIDE_KEY = 'events:llm-pipeline-override';
const PIPELINE_OVERRIDE_TTL_SEC = 7 * 24 * 3600;

/**
 * Refresh the in-memory pipeline override from Redis. Called at the top of
 * every /api/events handler so downstream sync `isPipelineV2()` reads see
 * the latest toggle value. Graceful on Redis failure: keeps current cache.
 */
async function refreshPipelineOverride(): Promise<void> {
  try {
    const v = await redis.get<string>(PIPELINE_OVERRIDE_KEY);
    // Phase 27.4.3 (D-07): widened to accept 'v3' alongside the existing
    // 'v1' / 'v2' override values from setPipelineOverride.
    if (v === 'v1' || v === 'v2' || v === 'v3') {
      setPipelineOverride(v);
    } else {
      setPipelineOverride(null);
    }
  } catch {
    // Keep existing cache on Redis failure — the env fallback is still active.
  }
}

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

  // Post-debug 2026-04-21: refresh in-memory override so the status endpoint
  // reflects the latest Topbar-pill setting across workers.
  await refreshPipelineOverride();

  // Phase 27.4 D-24/D-37 + 27.4.3 Plan 02b: request-time flag read via the
  // 3-way getPipelineVersion helper so operators can flip LLM_PIPELINE_V2 /
  // LLM_PIPELINE_V3 / runtime override without a rebuild. Summary key
  // branches accordingly; v1 + v2 keys left alone for rollback (D-21).
  const version = getPipelineVersion();
  const LLM_SUMMARY_KEY_ACTIVE =
    version === 'v3'
      ? 'events:llm-summary:v3'
      : version === 'v2'
        ? 'events:llm-summary:v2'
        : LLM_SUMMARY_KEY;

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
 * Re-extracts a single cached v2 event group with the CURRENT prompt and
 * returns `{ old, new }` so the operator can iterate on prompt wording
 * side-by-side without waiting for the full pipeline cycle.
 *
 * CRITICAL (threat T-27.4-08-05 / Pitfall 6): the handler MUST NOT write
 * back to `events:llm:v2`. It is strictly read-only vs. the cache. Any
 * `cacheSetSafe('events:llm:v2', ...)` call here is a bug.
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

    // Phase 27.4.3 Plan 02b — route the replay path against the active
    // pipeline version. v3 reads from `events:llm:v3` and re-extracts via
    // processEventGroupsV3; v2 stays on the existing v2 path. v1 isn't
    // covered by /llm-replay (the v1 cache shape doesn't carry per-group
    // ids replay can target).
    const replayVersion = getPipelineVersion();
    const cacheKey = replayVersion === 'v3' ? 'events:llm:v3' : 'events:llm:v2';
    const cached = await cacheGetSafe<ConflictEventEntity[]>(cacheKey, 0);
    const existing = toEntityArray(cached?.data).find((e) => e.id.includes(groupKey));
    if (!existing) return res.status(404).json({ error: 'not_found' });

    // Reconstruct the target group from the raw GDELT cache — the extractor
    // needs an EventGroup, not a ConflictEventEntity.
    const rawCache = await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, 0);
    if (!rawCache?.data) return res.status(404).json({ error: 'gdelt_cache_empty' });
    const groups = groupGdeltRows(rawCache.data);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return res.status(404).json({ error: 'group_gone' });

    // Re-extract a SINGLE group — processEventGroupsV2/V3 itself does not
    // write to cache; the only caller that does is the fire-and-forget block
    // above. This is the Pitfall 6 "cache-read-only" invariant — preserved
    // verbatim for v3.
    try {
      if (replayVersion === 'v3') {
        const extraction = await processEventGroupsV3([group]);
        const first = extraction?.events?.[0] ?? null;
        return res.json({ old: existing, new: first });
      }
      const extraction = await processEventGroupsV2([group]);
      const first = extraction?.events?.[0] ?? null;
      return res.json({ old: existing, new: first });
    } catch (err) {
      return res.status(500).json({
        error: 'extract_failed',
        detail: String(err).slice(0, 200),
      });
    }
  });
}

/**
 * DEV-ONLY: runtime v1/v2 pipeline toggle (post-debug 2026-04-21).
 *
 * GET returns the currently-effective version + source ('override' or 'env').
 * POST {version: 'v1' | 'v2' | null} sets the in-memory override AND writes
 * it through to Redis so multi-worker deployments stay coherent; `null`
 * clears the override and reverts to the env default.
 *
 * Dual-gate per Pitfall 6: route registered only in non-prod, AND each
 * handler re-checks NODE_ENV before acting in case env flips after boot.
 */
// Phase 27.4.4 Plan 02 — register unconditionally. See comment above the
// /llm-replay block for the same NODE_ENV-wrap removal rationale.
{
  eventsRouter.get('/llm-pipeline', dashboardAuth, async (_req, res) => {
    // Phase 27.4.4 Plan 02 — dashboardAuth middleware replaces the prior
    // `NODE_ENV === 'production'` 404 gate. The endpoint leaks the active
    // pipeline override which is a low-sensitivity signal but still
    // operator-grade telemetry; gating keeps it consistent with the POST.
    await refreshPipelineOverride();
    const override = getPipelineOverride();
    const effective = getPipelineVersion();
    return res.json({ effective, override, source: override ? 'override' : 'env' });
  });

  eventsRouter.post('/llm-pipeline', dashboardAuth, async (req, res) => {
    // Phase 27.4.4 Plan 02 — dashboardAuth middleware replaces the prior
    // `NODE_ENV === 'production'` 404 gate. THIS is the cutover endpoint
    // (Plan 02 Task 5) — must be reachable from the operator's laptop in
    // production. Bearer-token gate keeps unauthenticated callers out.
    const body = (req.body ?? {}) as { version?: unknown; reason?: unknown };
    const version = body.version;
    // Phase 27.4.3 Plan 02b — accept 'v3' alongside the existing 'v1' / 'v2'
    // / null values. The validator must stay tight (no string coercion) so
    // an attacker can't smuggle a free-text override into setPipelineOverride.
    if (version !== 'v1' && version !== 'v2' && version !== 'v3' && version !== null) {
      return res.status(400).json({ error: 'version must be "v1", "v2", "v3", or null' });
    }

    // Capture pre-flip version for the audit-log entry.
    await refreshPipelineOverride();
    const fromVersion = getPipelineVersion();

    try {
      if (version === null) {
        await redis.del(PIPELINE_OVERRIDE_KEY);
        setPipelineOverride(null);
      } else {
        await redis.set(PIPELINE_OVERRIDE_KEY, version, { ex: PIPELINE_OVERRIDE_TTL_SEC });
        setPipelineOverride(version);
      }
    } catch (err) {
      return res.status(500).json({
        error: 'override_write_failed',
        detail: String(err).slice(0, 200),
      });
    }

    // Phase 27.4.3 Plan 02b D-15 / B-3 — append audit entry on every successful
    // version flip. appendPipelineAudit is try/caught internally so a Redis
    // failure here doesn't unwind the override write above.
    const toVersion = getPipelineVersion();
    if (fromVersion !== toVersion) {
      await appendPipelineAudit({
        ts: Date.now(),
        from: fromVersion,
        to: toVersion,
        trigger: 'manual:operator_post',
        operator: process.env.NODE_ENV === 'production' ? 'production' : 'dev',
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
      });
    }

    const effective = getPipelineVersion();
    return res.json({
      effective,
      override: getPipelineOverride(),
      source: version ? 'override' : 'env',
    });
  });
}

eventsRouter.get('/', validateQuery(eventsQuerySchema), async (_req, res) => {
  const { backfill: forceBackfill } = res.locals.validatedQuery as z.infer<
    typeof eventsQuerySchema
  >;

  // Post-debug 2026-04-21 — hydrate the in-memory pipeline override from
  // Redis at the request boundary so downstream sync `isPipelineV2()` reads
  // see the latest toggle value across workers.
  await refreshPipelineOverride();

  // Phase 27.4 D-24/D-37 + Phase 27.4.3 Plan 02b: request-time flag read via
  // the 3-way getPipelineVersion helper so operators can flip LLM_PIPELINE_V2
  // / LLM_PIPELINE_V3 / runtime override without a rebuild. Cache keys
  // branch accordingly; v1 + v2 keys are left alone for rollback (D-21).
  const version = getPipelineVersion();
  const pipelineV2 = version === 'v2';
  const pipelineV3 = version === 'v3';
  const LLM_EVENTS_KEY_ACTIVE = pipelineV3
    ? 'events:llm:v3'
    : pipelineV2
      ? 'events:llm:v2'
      : LLM_EVENTS_KEY;
  const LLM_SUMMARY_KEY_ACTIVE = pipelineV3
    ? 'events:llm-summary:v3'
    : pipelineV2
      ? 'events:llm-summary:v2'
      : LLM_SUMMARY_KEY;

  // --- LLM cache check (highest priority: serve enriched events if fresh) ---
  // Post-ship defense-in-depth 2026-04-24: coerce to array-shape immediately
  // so the sync HTTP path (sendNormalizedEvents → normalizeEventTypes.map),
  // the Pitfall 1 bridge assignment below, and the fire-and-forget background
  // task's llmCachedRef iterations all see a guaranteed
  // ConflictEventEntity[] regardless of what shape the cache holds.
  let llmCached = await cacheGetSafe<ConflictEventEntity[]>(
    LLM_EVENTS_KEY_ACTIVE,
    LLM_LOGICAL_TTL_MS,
  );
  if (llmCached) llmCached = coerceCachedEvents(llmCached);
  if (llmCached && !llmCached.stale) {
    return sendNormalizedEvents(res, llmCached);
  }

  // Phase 27.4 Pitfall 1 + Phase 27.4.3 Plan 02b D-05 — extended cache
  // fallback chain v3 → v2 → v1 → raw GDELT. During v3 rollout the v3 cache
  // may be empty while v2 / v1 are populated; we bridge to whichever earlier
  // version has fresh data so the map never goes blank during cutover.
  if (pipelineV3 && !llmCached?.data) {
    let bridgeV2 = await cacheGetSafe<ConflictEventEntity[]>('events:llm:v2', LLM_LOGICAL_TTL_MS);
    if (bridgeV2) bridgeV2 = coerceCachedEvents(bridgeV2);
    if (bridgeV2 && !bridgeV2.stale) {
      return sendNormalizedEvents(res, bridgeV2);
    }
    let bridgeV1 = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY, LLM_LOGICAL_TTL_MS);
    if (bridgeV1) bridgeV1 = coerceCachedEvents(bridgeV1);
    if (bridgeV1 && !bridgeV1.stale) {
      return sendNormalizedEvents(res, bridgeV1);
    }
    // Promote whichever stale bridge has data so the stale-serve path at the
    // bottom of the handler still works (priority v2 > v1).
    if (bridgeV2?.data) {
      llmCached = bridgeV2;
    } else if (bridgeV1?.data) {
      llmCached = bridgeV1;
    }
  }

  // Phase 27.4 Pitfall 1 (preserved): v2 → v1 bridge when v2 cache is empty.
  if (pipelineV2 && !llmCached?.data) {
    let llmCachedV1 = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY, LLM_LOGICAL_TTL_MS);
    if (llmCachedV1) llmCachedV1 = coerceCachedEvents(llmCachedV1);
    if (llmCachedV1 && !llmCachedV1.stale) {
      return sendNormalizedEvents(res, llmCachedV1);
    }
    if (llmCachedV1?.data && !llmCached?.data) {
      llmCached = llmCachedV1;
    }
  }

  // Dev fallback: if Redis LLM cache is empty, try local file cache to avoid
  // re-processing. v3 has no dedicated dev file cache yet (the v3 pipeline is
  // expected to land its own cache fixtures in Plan 03+); we fall back to the
  // v2 dev cache when v3 is the active pipeline so dev environments without
  // Redis still hydrate something useful.
  if (!llmCached?.data) {
    const devData =
      pipelineV3 || pipelineV2
        ? loadDevLLMCacheV2<ConflictEventEntity[]>()
        : loadDevLLMCache<ConflictEventEntity[]>();
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
        schemaVersion: version,
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
