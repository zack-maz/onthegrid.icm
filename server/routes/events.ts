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
import {
  processEventGroups,
  geocodeEnrichedEvents,
  type GeocodedEnrichedEventV2,
} from '../lib/llmEventExtractor.js';
// Phase 27.4 Plan 08 D-21 — v2-only replay path re-extracts a single group
// without writing to cache (Pitfall 6 defense-in-depth).
import { processEventGroupsV2, BATCH_SIZE as BATCH_SIZE_V2 } from '../lib/llmEventExtractor.v2.js';
// Phase 27.4 WR-03 — use v1 BATCH_SIZE (8) for progress math when v2 is off.
const BATCH_SIZE_V1 = 8;
// Phase 27.4 Plan 08 D-20 — resolver-only eval harness. Called inside the v2
// fire-and-forget block AFTER geocodeEnrichedEvents returns and BEFORE
// cache-set so the evalScore flows to buildSummary() on the same run.
import { runEval } from '../lib/llmEvalHarness.js';
import { llmProgress, resetProgress, updateProgress, buildSummary } from '../lib/llmProgress.js';
import type { LLMRunSummary } from '../lib/llmProgress.js';
import {
  WAR_START,
  CACHE_TTL,
  isPipelineV2,
  setPipelineOverride,
  getPipelineOverride,
} from '../config.js';
import { shouldPauseNewEvents, prioritizeBySeverity } from '../lib/llmTokenBudget.js';
import { listDLQ } from '../lib/llmDLQ.js';
import type { GeocodeProvenance } from '../lib/llmSchema.js';
import { validateQuery } from '../middleware/validate.js';
import { sendValidated } from '../middleware/validateResponse.js';
import { AppError } from '../middleware/errorHandler.js';
import { eventsResponseSchema } from '../schemas/cacheResponse.js';
import type { ConflictEventEntity, NewsCluster } from '../types.js';
import { getHighestTier, extractDomain, getSourceTier } from '../lib/sourceTiers.js';
import {
  saveDevLLMCache,
  loadDevLLMCache,
  saveDevLLMCacheV2,
  loadDevLLMCacheV2,
} from '../cache/devFileCache.js';

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

/** 15 minute cooldown between LLM processing runs */
const LLM_COOLDOWN_MS = 900_000;

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
  const pipelineV2 = isPipelineV2();
  const key = pipelineV2 ? 'events:llm:v2' : LLM_EVENTS_KEY;
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

/**
 * Check whether the LLM processing pipeline should run.
 * Returns true if never run or cooldown (15 minutes) has expired.
 *
 * Same resilience pattern as shouldBackfill: Redis failure allows the run
 * (the LLM pipeline has its own error handling).
 */
async function shouldRunLLM(): Promise<boolean> {
  try {
    const lastTs = await redis.get<number>(LLM_PROCESS_KEY);
    if (lastTs === null || lastTs === undefined) return true;
    return Date.now() - lastTs > LLM_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/**
 * Persist the LLM processing timestamp without throwing on Redis failure.
 * Best-effort: if Redis is dead, the next request may re-trigger LLM
 * (rate-limited by the LLM providers themselves, not catastrophic).
 */
async function recordLLMTimestamp(): Promise<void> {
  try {
    await redis.set(LLM_PROCESS_KEY, Date.now(), { ex: LLM_REDIS_TTL_SEC });
  } catch {
    /* best-effort */
  }
}

/**
 * Convert v1 LLM-geocoded enriched events back to ConflictEventEntity format.
 * Merges LLM-extracted fields into the existing entity data structure.
 *
 * Renamed from enrichedToEntities → enrichedV1ToEntities in Plan 06 to make
 * the v1/v2 branching explicit; a deprecated alias is exported below for
 * any legacy non-test consumer that hasn't migrated.
 */
function enrichedV1ToEntities(
  geocoded: Array<{
    groupKey: string;
    resolvedLat: number;
    resolvedLng: number;
    location: { name: string; precision: 'exact' | 'neighborhood' | 'city' | 'region' };
    type: string;
    actors: string[];
    severity: string;
    summary: string;
    casualties: { killed: number | null; injured: number | null; unknown: boolean };
    sourceCount: number;
  }>,
  groups: Array<{ key: string; entities: ConflictEventEntity[]; sourceUrls: string[] }>,
): ConflictEventEntity[] {
  const groupMap = new Map<string, ConflictEventEntity[]>();
  const groupSourceUrls = new Map<string, string[]>();
  for (const g of groups) {
    groupMap.set(g.key, g.entities);
    groupSourceUrls.set(g.key, g.sourceUrls);
  }

  const results: ConflictEventEntity[] = [];
  for (const enriched of geocoded) {
    const entities = groupMap.get(enriched.groupKey);
    if (!entities || entities.length === 0) continue;

    // Compute best source tier from the group's source URLs
    const sourceUrls = groupSourceUrls.get(enriched.groupKey) ?? [];
    const sourceTier = getHighestTier(sourceUrls) ?? undefined;

    // Use the first entity as a template, override with LLM data
    const template = entities[0];
    if (!template) continue;
    results.push({
      ...template,
      lat: enriched.resolvedLat,
      lng: enriched.resolvedLng,
      type: enriched.type as ConflictEventEntity['type'],
      label: `${enriched.location.name}: ${enriched.summary.slice(0, 60)}`,
      data: {
        ...template.data,
        locationName: enriched.location.name,
        summary: enriched.summary,
        precision: enriched.location.precision,
        llmProcessed: true,
        actors: enriched.actors,
        sourceCount: enriched.sourceCount,
        sourceTier,
        casualties: {
          killed: enriched.casualties.killed ?? undefined,
          injured: enriched.casualties.injured ?? undefined,
          unknown: enriched.casualties.unknown,
        },
      },
    });
  }
  return results;
}

/**
 * Convert v2 LLM-geocoded enriched events into ConflictEventEntity format.
 *
 * Plan 06: unlike v1, v2 carries a structured location hierarchy, confidence,
 * reasoning, weapon/target, time-of-day, duration, geocode provenance, and a
 * derived suspect flag. All attach to `data.*` so the frontend can render
 * them in the detail panel (Plan 09 onwards) without a schema migration.
 *
 * The entity's label combines the resolver's displayName with the summary
 * so existing client label rendering keeps working. `label` is intentionally
 * a free-form string — the detail panel reads `data.location.*` for
 * structured display.
 */
function enrichedV2ToEntities(
  geocoded: GeocodedEnrichedEventV2[],
  groups: Array<{ key: string; entities: ConflictEventEntity[]; sourceUrls: string[] }>,
): ConflictEventEntity[] {
  const groupMap = new Map<string, ConflictEventEntity[]>();
  const groupSourceUrls = new Map<string, string[]>();
  for (const g of groups) {
    groupMap.set(g.key, g.entities);
    groupSourceUrls.set(g.key, g.sourceUrls);
  }

  const results: ConflictEventEntity[] = [];
  for (const enriched of geocoded) {
    const entities = groupMap.get(enriched.groupKey);
    if (!entities || entities.length === 0) continue;

    const sourceUrls = groupSourceUrls.get(enriched.groupKey) ?? [];
    const sourceTier = getHighestTier(sourceUrls) ?? undefined;

    const template = entities[0];
    if (!template) continue;

    // Prefer landmark → city → admin1 → country as the human-readable place;
    // fall back to the resolver's displayName so events that resolved solely
    // via Nominatim still get a label.
    const placeLabel =
      enriched.location.landmark ||
      enriched.location.city ||
      enriched.location.admin1 ||
      enriched.location.country ||
      enriched.displayName ||
      'unknown';

    results.push({
      ...template,
      // llm-v2 id prefix so merge-by-id can distinguish new v2 entries from
      // pre-existing v1 cache entries during the rollout window.
      id: `llm-v2-${enriched.groupKey}`,
      lat: enriched.resolvedLat,
      lng: enriched.resolvedLng,
      type: enriched.type,
      label: `${placeLabel}: ${enriched.summary.slice(0, 60)}`,
      data: {
        ...template.data,
        locationName: placeLabel,
        summary: enriched.summary,
        // server-derived precision (Pitfall 5 — LLM never emits this)
        precision: enriched.precision,
        llmProcessed: true,
        actors: enriched.actors,
        sourceCount: enriched.sourceCount,
        sourceTier,
        casualties: {
          killed: enriched.casualties.killed ?? undefined,
          injured: enriched.casualties.injured ?? undefined,
          unknown: enriched.casualties.unknown,
        },
      },
    });
  }
  return results;
}

/** Deprecated alias — kept so any non-test consumer that imports
 *  enrichedToEntities directly still type-checks. Remove in 27.5 cleanup. */
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
eventsRouter.get('/llm-status', async (_req, res) => {
  // DEV-ONLY: return 404 in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  // Post-debug 2026-04-21: refresh in-memory override so the status endpoint
  // reflects the latest Topbar-pill setting across workers.
  await refreshPipelineOverride();

  // Phase 27.4 D-24/D-37: request-time flag read via isPipelineV2 helper (W4
  // fix) so operators can flip LLM_PIPELINE_V2 without a rebuild. Summary key
  // branches accordingly; v1 key left alone for rollback (D-40).
  const pipelineV2 = isPipelineV2();
  const LLM_SUMMARY_KEY_ACTIVE = pipelineV2 ? 'events:llm-summary:v2' : LLM_SUMMARY_KEY;

  // Phase 27.4 Plan 09 — assemble the full v2 observability payload:
  //   * DLQ recent entries (D-30) — bounded at 50
  //   * Projected recent enriched events (B4 / D-18)
  //   * Soft-cap pause flag (B5 surface / D-33)
  //
  // Each is try/caught internally; a degraded signal returns [] or false
  // rather than throwing. The /llm-status endpoint is the single pane of
  // glass ops relies on before the D-25 prod flip, so availability matters
  // more than any single block being populated.
  const [dlqRecent, recentEvents, paused] = await Promise.all([
    listDLQ(50).catch(() => []),
    loadRecentEnrichedEvents(50).catch(() => []),
    shouldPauseNewEvents().catch(() => false),
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
if (process.env.NODE_ENV !== 'production') {
  eventsRouter.post('/llm-replay/:groupKey', async (req, res) => {
    // Defense-in-depth gate — matches /llm-status above.
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }

    const { groupKey } = req.params;
    // T-27.4-08-02 — length cap + type guard. Express populates req.params
    // as string but an attacker could force unexpected shapes via malformed
    // URLs; the typeof check is belt-and-braces.
    if (!groupKey || typeof groupKey !== 'string' || groupKey.length > 200) {
      return res.status(400).json({ error: 'invalid_group_key' });
    }

    // Find the existing cached v2 entity by id containing the groupKey.
    // (v2 ids are formed as `llm-v2-${groupKey}` in enrichedV2ToEntities.)
    const cached = await cacheGetSafe<ConflictEventEntity[]>('events:llm:v2', 0);
    const existing = toEntityArray(cached?.data).find((e) => e.id.includes(groupKey));
    if (!existing) return res.status(404).json({ error: 'not_found' });

    // Reconstruct the target group from the raw GDELT cache — the extractor
    // needs an EventGroup, not a ConflictEventEntity.
    const rawCache = await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, 0);
    if (!rawCache?.data) return res.status(404).json({ error: 'gdelt_cache_empty' });
    const groups = groupGdeltRows(rawCache.data);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return res.status(404).json({ error: 'group_gone' });

    // Re-extract a SINGLE group — processEventGroupsV2 itself does not write
    // to cache; the only caller that does is the fire-and-forget block above.
    // This is the Pitfall 6 "cache-read-only" invariant.
    try {
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
if (process.env.NODE_ENV !== 'production') {
  eventsRouter.get('/llm-pipeline', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    await refreshPipelineOverride();
    const override = getPipelineOverride();
    const effective = isPipelineV2() ? 'v2' : 'v1';
    return res.json({ effective, override, source: override ? 'override' : 'env' });
  });

  eventsRouter.post('/llm-pipeline', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const body = (req.body ?? {}) as { version?: unknown };
    const version = body.version;
    if (version !== 'v1' && version !== 'v2' && version !== null) {
      return res.status(400).json({ error: 'version must be "v1", "v2", or null' });
    }
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
    const effective = isPipelineV2() ? 'v2' : 'v1';
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

  // Phase 27.4 D-24/D-37: request-time flag read via isPipelineV2 helper (W4
  // fix) so operators can flip LLM_PIPELINE_V2 without a rebuild. Cache keys
  // branch accordingly; v1 keys are left alone for rollback (D-40).
  const pipelineV2 = isPipelineV2();
  const LLM_EVENTS_KEY_ACTIVE = pipelineV2 ? 'events:llm:v2' : LLM_EVENTS_KEY;
  const LLM_SUMMARY_KEY_ACTIVE = pipelineV2 ? 'events:llm-summary:v2' : LLM_SUMMARY_KEY;

  // --- LLM cache check (highest priority: serve enriched events if fresh) ---
  // Post-ship defense-in-depth 2026-04-24: coerce to array-shape immediately
  // so the sync HTTP path (sendNormalizedEvents → normalizeEventTypes.map),
  // the Pitfall 1 bridge assignment below, and the fire-and-forget background
  // task's llmCachedRef iterations (lines ~854, ~1007) all see a guaranteed
  // ConflictEventEntity[] regardless of what shape the cache holds.
  let llmCached = await cacheGetSafe<ConflictEventEntity[]>(
    LLM_EVENTS_KEY_ACTIVE,
    LLM_LOGICAL_TTL_MS,
  );
  if (llmCached) llmCached = coerceCachedEvents(llmCached);
  if (llmCached && !llmCached.stale) {
    return sendNormalizedEvents(res, llmCached);
  }

  // Phase 27.4 Pitfall 1: during rollout, v2 cache may be empty while v1 is
  // populated. Serve v1 as a bridge — Plan 02 wires v2 writes so v2 fills in.
  if (pipelineV2 && !llmCached?.data) {
    const llmCachedV1 = await cacheGetSafe<ConflictEventEntity[]>(
      LLM_EVENTS_KEY,
      LLM_LOGICAL_TTL_MS,
    );
    if (llmCachedV1 && !llmCachedV1.stale) {
      return sendNormalizedEvents(res, llmCachedV1);
    }
    // If v1 has stale data but v2 has none, promote v1 to the local `llmCached`
    // var so the stale-serve path at the bottom of the handler still works.
    if (llmCachedV1?.data && !llmCached?.data) {
      llmCached = llmCachedV1;
    }
  }

  // Dev fallback: if Redis LLM cache is empty, try local file cache to avoid re-processing
  if (!llmCached?.data) {
    const devData = pipelineV2
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
        schemaVersion: pipelineV2 ? 'v2' : 'v1',
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

    // --- LLM processing layer (fire-and-forget) ---
    // Always serve raw GDELT immediately. If LLM is configured and cooldown
    // expired, kick off enrichment in the background. The NEXT request will
    // pick up the enriched cache from the top-of-route LLM cache check.
    if (isLLMConfigured() && (await shouldRunLLM())) {
      // Record timestamp BEFORE spawning to prevent concurrent triggers
      await recordLLMTimestamp();

      // Fire-and-forget: don't await — runs after response is sent
      const llmCachedRef = llmCached;
      void (async () => {
        // Prevent concurrent pipeline runs corrupting shared progress state
        if (
          llmProgress.stage !== 'idle' &&
          llmProgress.stage !== 'done' &&
          llmProgress.stage !== 'error'
        ) {
          log.info('LLM pipeline already running, skipping');
          return;
        }

        resetProgress(); // sets stage='grouping', startedAt=now
        // Phase 27.4 D-39: stamp schemaVersion on the run summary so
        // /api/events/llm-status surfaces which extractor wrote the payload.
        updateProgress({ schemaVersion: pipelineV2 ? 'v2' : 'v1' });

        try {
          const groups = groupGdeltRows(merged);
          updateProgress({ totalGroups: groups.length, stage: 'grouping' });

          // Diff: only process groups whose key doesn't match a cached LLM event
          const cachedLlmKeys = new Set<string>();
          if (llmCachedRef?.data) {
            for (const e of llmCachedRef.data) {
              if (e.id) cachedLlmKeys.add(e.id);
            }
          }
          const newGroups =
            cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(g.key)) : groups;

          updateProgress({ newGroups: newGroups.length });

          if (newGroups.length === 0) {
            log.info('LLM: no new groups to process');
            updateProgress({
              stage: 'done',
              completedAt: Date.now(),
              durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
            });
            try {
              await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, buildSummary(), LLM_SUMMARY_TTL_SEC);
            } catch {
              /* best-effort */
            }
            return;
          }

          // Phase 27.4 Plan 06 / B5 fix — D-33 soft-cap gate. When either
          // provider is ≥80% of daily budget, skip new extractions this cycle
          // and keep serving cached LLM entities. Hard cap (D-34) is already
          // handled inside callLLM returning null → raw GDELT fallback.
          const paused = await shouldPauseNewEvents();
          if (paused) {
            log.info('LLM_PAUSED_SOFT_CAP');
            updateProgress({
              stage: 'done',
              completedAt: Date.now(),
              durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
            });
            try {
              await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, buildSummary(), LLM_SUMMARY_TTL_SEC);
            } catch {
              /* best-effort */
            }
            return;
          }

          // B5 fix — D-35: prioritize highest-severity groups first so the
          // BATCH_SIZE slice consumed on each cycle contains the highest-impact
          // events. No-op when not soft-capped (helper returns input ref).
          const prioritizedGroups = await prioritizeBySeverity(newGroups);

          // WR-03: v2 uses BATCH_SIZE=2; v1 uses BATCH_SIZE=8. Using a
          // hard-coded 8 when v2 is active produced totalBatches 4x too
          // high, making the /api/events/llm-status progress ratio
          // appear to stall.
          const effectiveBatchSize = pipelineV2 ? BATCH_SIZE_V2 : BATCH_SIZE_V1;
          updateProgress({
            stage: 'llm-processing',
            totalBatches: Math.ceil(prioritizedGroups.length / effectiveBatchSize),
          });

          const extractResult = await processEventGroups(prioritizedGroups, (completed, total) => {
            updateProgress({ completedBatches: completed, totalBatches: total });
          });

          if (!extractResult.events || extractResult.events.length === 0) {
            log.warn('LLM processing returned null — raw GDELT serving continues');
            updateProgress({
              stage: 'error',
              errorMessage: 'LLM returned null for all batches',
              completedAt: Date.now(),
              durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
            });
            try {
              await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, buildSummary(), LLM_SUMMARY_TTL_SEC);
            } catch {
              /* best-effort */
            }
            return;
          }

          updateProgress({
            stage: 'geocoding',
            enrichedCount: extractResult.events.length,
            totalGeocodes: extractResult.events.length,
          });

          // Plan 06: branch on schemaVersion so v1 and v2 both flow through
          // their respective geocoder + entity-adapter paths. The extractor
          // barrel produced a tagged union; each arm carries the shape the
          // geocoder needs.
          let llmEntities: ConflictEventEntity[];
          if (extractResult.schemaVersion === 'v2') {
            const geoResult = await geocodeEnrichedEvents(
              {
                schemaVersion: 'v2',
                events: extractResult.events,
                matchedNewsByGroup: extractResult.matchedNewsByGroup,
                bellingcatByGroup: extractResult.bellingcatByGroup,
              },
              prioritizedGroups,
              (completed, total) => {
                updateProgress({ completedGeocodes: completed, totalGeocodes: total });
              },
            );
            if (geoResult.schemaVersion !== 'v2') {
              // Type-narrowing sanity — the barrel preserves the discriminator.
              throw new Error('geocoder schemaVersion mismatch (expected v2)');
            }
            // Aggregate v2-specific observability metrics: per-provenance
            // counts feed Plan 09's pie chart, suspectCount feeds the
            // outlier badge (D-22 / D-23).
            const provenanceCounts: Partial<Record<GeocodeProvenance, number>> = {};
            let suspectCount = 0;
            for (const e of geoResult.events) {
              provenanceCounts[e.geocodeProvenance] =
                (provenanceCounts[e.geocodeProvenance] ?? 0) + 1;
              if (e.suspect) suspectCount++;
            }
            updateProgress({ provenanceCounts, suspectCount });

            // Phase 27.4 Plan 08 D-20/D-25: run the resolver-only accuracy
            // eval AFTER geocodeEnrichedEvents returns and BEFORE we build
            // the run summary / cache-set. runEval writes evalScore via
            // updateProgress so buildSummary() picks it up on the same run.
            // Failure is non-fatal — the real pipeline continues either way
            // (A6 / Pitfall 8: resolver-only so no token budget impact).
            try {
              const evalScore = await runEval();
              log.info({ evalScore }, 'eval harness completed');
            } catch (evalErr) {
              log.warn({ err: evalErr }, 'eval harness threw; continuing pipeline');
            }

            llmEntities = enrichedV2ToEntities(geoResult.events, prioritizedGroups);
          } else {
            const geoResult = await geocodeEnrichedEvents(
              { schemaVersion: 'v1', events: extractResult.events },
              prioritizedGroups,
              (completed, total) => {
                updateProgress({ completedGeocodes: completed, totalGeocodes: total });
              },
            );
            if (geoResult.schemaVersion !== 'v1') {
              throw new Error('geocoder schemaVersion mismatch (expected v1)');
            }
            llmEntities = enrichedV1ToEntities(geoResult.events, prioritizedGroups);
          }

          // Merge newly processed LLM events with existing cached LLM events
          const llmMergeMap = new Map<string, ConflictEventEntity>();
          if (llmCachedRef?.data) {
            for (const e of llmCachedRef.data) {
              llmMergeMap.set(e.id, e);
            }
          }
          for (const e of llmEntities) {
            llmMergeMap.set(e.id, e);
          }
          const llmMerged = Array.from(llmMergeMap.values());

          await cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, llmMerged, LLM_REDIS_TTL_SEC);
          if (pipelineV2) saveDevLLMCacheV2(llmMerged);
          else saveDevLLMCache(llmMerged);
          log.info(
            { count: llmEntities.length, total: llmMerged.length },
            'LLM: processed and cached enriched events (background)',
          );

          updateProgress({
            stage: 'done',
            completedAt: Date.now(),
            durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
          });
          try {
            await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, buildSummary(), LLM_SUMMARY_TTL_SEC);
          } catch {
            /* best-effort */
          }
        } catch (llmErr) {
          updateProgress({
            stage: 'error',
            errorMessage: llmErr instanceof Error ? llmErr.message : 'Unknown LLM error',
            completedAt: Date.now(),
            durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
          });
          try {
            await cacheSetSafe(LLM_SUMMARY_KEY_ACTIVE, buildSummary(), LLM_SUMMARY_TTL_SEC);
          } catch {
            /* best-effort */
          }
          log.warn({ err: llmErr }, 'LLM background processing failed');
        }
      })();
    }

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
