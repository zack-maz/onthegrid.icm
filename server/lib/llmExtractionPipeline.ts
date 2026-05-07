/**
 * Phase 27.4.6 (D-04 / D-10) — shared LLM extraction dispatch helper.
 *
 * `runRefreshExtraction` owns the v3 (or v2 / v1) extraction kick-off that
 * used to live as a fire-and-forget block inside `/api/events`. After the
 * cron-driven trigger phase shipped, the route is cache-only — every code
 * path that fires an extraction calls this helper instead.
 *
 * The function is fire-and-forget by design: the actual `processEventGroups`
 * + `geocodeEnrichedEvents` work is launched as a `void async () => {}` IIFE
 * so the caller's response cycle is not held open while the LLM pipeline runs
 * (~95 minutes worst-case at LLM_V3_CONCURRENCY=1).
 *
 * Decisions tracked:
 *   - D-04: verbatim port of the prior fire-and-forget body — zero re-implementation.
 *   - D-06: stamps `lastTriggerSource` into `llmProgress` so DevApiStatus can
 *     differentiate cron-fired runs from /api/events-fired runs (the latter
 *     no longer happens after Phase 27.4.6).
 *   - D-10: cold-cache probe BEFORE the cooldown check — when the active
 *     `events:llm:v*` key is empty, the cooldown is bypassed automatically so
 *     the first invocation after a fresh deploy always populates the cache.
 *   - D-11: `forceCooldown` opt-in lets the cron route's `?force=true` query
 *     param bypass the 15-min cooldown for operator-driven re-extractions.
 */

import { isLLMConfigured } from '../adapters/llm-provider.js';
import { saveDevLLMCache, saveDevLLMCacheV2 } from '../cache/devFileCache.js';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { env, getPipelineVersion } from '../config.js';

import { groupGdeltRows } from './eventGrouping.js';
import { runEval } from './llmEvalHarness.js';
import {
  processEventGroups,
  geocodeEnrichedEvents,
  type GeocodedEnrichedEventV2,
  type GeocodedEnrichedEventV3,
} from './llmEventExtractor.js';
import { BATCH_SIZE as BATCH_SIZE_V2 } from './llmEventExtractor.v2.js';
import { llmProgress, resetProgress, updateProgress, buildSummary } from './llmProgress.js';
import { shouldPauseNewEvents, prioritizeBySeverity } from './llmTokenBudget.js';
import { logger } from './logger.js';
import { safeWaitUntil } from './safeWaitUntil.js';
import { getHighestTier } from './sourceTiers.js';

import type { ConflictEventEntity } from '../types.js';
import type { GeocodeProvenance } from './llmSchema.js';

const log = logger.child({ module: 'llm-extraction-pipeline' });

// ---------------------------------------------------------------------------
// Cache keys + TTL constants (mirrors the values previously held in events.ts).
// ---------------------------------------------------------------------------

/** Redis key for raw GDELT events the helper reads as input. */
const EVENTS_KEY = 'events:gdelt';

/** Default v1 LLM cache key — used when active pipeline is v1. */
const LLM_EVENTS_KEY = 'events:llm';

/** Redis key tracking the last LLM run start time (15-min cooldown). */
const LLM_PROCESS_KEY = 'events:llm-process-ts';

/** 15 minute cooldown between LLM processing runs. */
const LLM_COOLDOWN_MS = 900_000;

/** Hard Redis TTL for LLM caches (2.5h, 10x logical). */
const LLM_REDIS_TTL_SEC = 9000;

/** Default v1 LLM run-summary key — used when active pipeline is v1. */
const LLM_SUMMARY_KEY = 'events:llm-summary';

/** 24-hour TTL for LLM run summary (retained across runs). */
const LLM_SUMMARY_TTL_SEC = 86_400;

/** v1 BATCH_SIZE used for progress math when v1 pipeline is active. */
const BATCH_SIZE_V1 = 8;

// ---------------------------------------------------------------------------
// Phase 28.2.6 Plan 01 — incremental terminal-key write helpers.
// ---------------------------------------------------------------------------

/**
 * Phase 28.2.6 D-03 — cadence for incremental terminal-key writes.
 * Default 10 batches between flushes; env-override via LLM_FLUSH_EVERY_N_BATCHES
 * registered in server/config.ts envSchema. N=1 would clobber Redis under
 * concurrency=12; N=10 is the rationale-locked cadence per CONTEXT D-03.
 *
 * Read via the shared `env` object (NOT process.env) so test-time
 * vi.mock('../../config.js', () => ({ env: mockEnv })) propagates correctly
 * into the pipeline closure.
 */
const FLUSH_EVERY_N_BATCHES_DEFAULT = 10;
function getFlushEveryNBatches(): number {
  const parsed = env.LLM_FLUSH_EVERY_N_BATCHES;
  if (!Number.isFinite(parsed) || parsed < 1) return FLUSH_EVERY_N_BATCHES_DEFAULT;
  return parsed;
}

/**
 * Phase 28.2.6 Plan 01 — shared merge-and-persist helper.
 *
 * Wraps the prior L374-388 final-write pattern so it can be called BOTH
 * from the periodic flush hook (every N batches inside the IIFE — added in
 * Task 4b) AND from the original final-flush location after extraction
 * completes. Two-key discipline preserved (D-04 / D-11): writes
 * ConflictEventEntity[] to LLM_EVENTS_KEY_ACTIVE; the LLMCachePayload
 * envelope continues to land on `events:llm:v3:partial` via writePartialCache
 * (UNCHANGED — observability key, written by the v3 extractor only).
 *
 * Pitfall 4 — merge-by-id with prior cache. The first incremental flush of
 * a fresh cron tick must merge with llmCachedRef.data so events from earlier
 * ticks survive the write.
 *
 * Pitfall 8 — does NOT call runEval(). The eval harness stays at its
 * existing post-FINAL-geocode location (lines ~321 / ~353).
 */
async function mergeAndPersistLlmEntities(
  newlyEnriched: ConflictEventEntity[],
  llmCachedRef: { data: ConflictEventEntity[] } | null,
  key: string,
  pipelineV2: boolean,
  pipelineV3: boolean,
): Promise<{ writtenCount: number; total: number }> {
  const llmMergeMap = new Map<string, ConflictEventEntity>();
  if (llmCachedRef?.data) {
    for (const e of llmCachedRef.data) llmMergeMap.set(e.id, e);
  }
  for (const e of newlyEnriched) llmMergeMap.set(e.id, e);
  const llmMerged = Array.from(llmMergeMap.values());
  await cacheSetSafe(key, llmMerged, LLM_REDIS_TTL_SEC);
  if (pipelineV3 || pipelineV2) saveDevLLMCacheV2(llmMerged);
  else saveDevLLMCache(llmMerged);
  log.info(
    { count: newlyEnriched.length, total: llmMerged.length },
    'LLM: persisted enriched events to terminal cache (Plan 01 helper)',
  );
  return { writtenCount: newlyEnriched.length, total: llmMerged.length };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface RunRefreshOpts {
  /** Provenance label stamped onto `llmProgress.lastTriggerSource` (D-06). */
  triggeredBy: 'cron' | 'manual';
  /** When true, bypass the 15-min `events:llm-process-ts` cooldown.
   *  Wired from `?force=true` (D-11) and from the cold-cache self-heal (D-10). */
  forceCooldown?: boolean;
}

export interface RunRefreshResult {
  /** true if a fresh extraction was kicked off (fire-and-forget). */
  dispatched: boolean;
  /** Populated when `dispatched=false`. */
  reason?: 'cooldown' | 'llm_unconfigured' | 'no_raw_events' | 'pipeline_busy';
  /** Set when the cold-cache probe forced a bypass (D-10). */
  coldCacheBypass?: boolean;
  /** Schema version of the active pipeline at dispatch time (D-06). */
  schemaVersion?: 'v1' | 'v2' | 'v3';
}

/**
 * Kick off a new LLM extraction run if the cooldown / cold-cache / busy /
 * configured / raw-events guards permit. The actual work runs as a
 * fire-and-forget IIFE; this function returns synchronously after the
 * dispatch decision is made.
 */
export async function runRefreshExtraction(opts: RunRefreshOpts): Promise<RunRefreshResult> {
  // 1. Resolve active pipeline keys (mirrors events.ts request handler).
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

  // 2. D-10 cold-cache probe — BEFORE the cooldown check. If the active LLM
  //    cache is empty (no entry OR zero events), bypass the cooldown so the
  //    first invocation after a fresh deploy always populates the cache.
  let isColdCache = false;
  try {
    const cachedLLM = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999);
    isColdCache = !cachedLLM?.data || cachedLLM.data.length === 0;
  } catch {
    // Treat Redis hiccup as NOT cold — preserve cooldown so we don't
    // hammer the LLM provider when Redis is flapping.
    isColdCache = false;
  }
  const effectiveForceCooldown = opts.forceCooldown === true || isColdCache;

  // 3. Cooldown check (mirrors the prior `shouldRunLLM` helper inline).
  if (!effectiveForceCooldown) {
    try {
      const lastTs = await redis.get<number>(LLM_PROCESS_KEY);
      if (lastTs !== null && lastTs !== undefined) {
        if (Date.now() - lastTs <= LLM_COOLDOWN_MS) {
          return { dispatched: false, reason: 'cooldown', schemaVersion: version };
        }
      }
    } catch {
      // Redis hiccup → treat as cooldown elapsed (matches existing
      // shouldRunLLM resilience behavior — better to attempt and fail than
      // silently skip).
    }
  }

  // 4. LLM-configured guard.
  if (!isLLMConfigured()) {
    return { dispatched: false, reason: 'llm_unconfigured', schemaVersion: version };
  }

  // 5. Read raw GDELT — the v3 extractor needs the raw rows to group; the
  //    cron path has no incoming request to seed from. Use a permissive max
  //    age so we accept any cached GDELT data (the route's polling already
  //    keeps it warm).
  let rawCached: { data: ConflictEventEntity[] } | null = null;
  try {
    rawCached = await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, 999_999_999);
  } catch {
    rawCached = null;
  }
  if (!rawCached?.data || rawCached.data.length === 0) {
    return { dispatched: false, reason: 'no_raw_events', schemaVersion: version };
  }
  const merged = rawCached.data;

  // 6. Pipeline-busy guard — preserves single-flight semantics so we never
  //    stack two parallel extractor runs (anti-pattern #18).
  if (
    llmProgress.stage !== 'idle' &&
    llmProgress.stage !== 'done' &&
    llmProgress.stage !== 'error'
  ) {
    return { dispatched: false, reason: 'pipeline_busy', schemaVersion: version };
  }

  // 7. Stamp the cooldown timestamp BEFORE spawning so concurrent dispatches
  //    short-circuit on the cooldown (best-effort on Redis errors).
  try {
    await redis.set(LLM_PROCESS_KEY, Date.now(), { ex: LLM_REDIS_TTL_SEC });
  } catch {
    /* best-effort */
  }

  // 8. D-06 — stamp triggerBy on the live progress singleton so DevApiStatus
  //    can differentiate cron-fired runs from manual-fired runs.
  updateProgress({ lastTriggerSource: opts.triggeredBy });

  // 9. Spawn the fire-and-forget body — verbatim port of the prior block at
  //    server/routes/events.ts:1063-1306, adapted to use the local KEYs and
  //    the helper's `merged` raw GDELT input.
  const llmCachedRef = await cacheGetSafe<ConflictEventEntity[]>(
    LLM_EVENTS_KEY_ACTIVE,
    LLM_COOLDOWN_MS,
  );

  // Phase 28.2.6 Plan 02 (D-09 / D-10 / D-12) — wrap the fire-and-forget
  // body in safeWaitUntil so the function instance survives past res.end()
  // on Vercel Fluid Compute. NEVER await this call — D-12 hard block;
  // safeWaitUntil's `void` return type makes `await` a TypeScript error.
  safeWaitUntil(
    (async () => {
      resetProgress(); // sets stage='grouping', startedAt=now
      // Stamp schemaVersion + lastTriggerSource onto the freshly-reset
      // progress singleton (resetProgress() wipes optional fields).
      updateProgress({ schemaVersion: version, lastTriggerSource: opts.triggeredBy });

      try {
        const groups = groupGdeltRows(merged);
        updateProgress({ totalGroups: groups.length, stage: 'grouping' });

        // Diff: only process groups whose key isn't already in the LLM cache.
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

        // D-33 soft-cap gate. When either provider is ≥80% of daily budget,
        // skip new extractions this cycle and keep serving cached LLM entities.
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

        // D-35: prioritize highest-severity groups first so the BATCH_SIZE slice
        // consumed on each cycle contains the highest-impact events.
        const prioritizedGroups = await prioritizeBySeverity(newGroups);

        // v2 + v3 use BATCH_SIZE=2; v1 uses BATCH_SIZE=8.
        const effectiveBatchSize = pipelineV3 || pipelineV2 ? BATCH_SIZE_V2 : BATCH_SIZE_V1;
        updateProgress({
          stage: 'llm-processing',
          totalBatches: Math.ceil(prioritizedGroups.length / effectiveBatchSize),
        });

        // Phase 28.2.6 Plan 01 Task 4b — periodic-flush wiring inside the
        // existing onBatchComplete callback chain.
        //
        // Cadence (D-03): every N=getFlushEveryNBatches() completed batches
        // trigger a geocode-then-persist of the just-completed window. The
        // counter MUST live inside this callback closure so concurrency=12
        // batch-completion ordering races are serialized through finishBatch's
        // monotonic ++completedBatchesCounter (Pitfall 2).
        //
        // Snapshot-the-array (Pitfall 3): we read the partial-cache envelope
        // (writePartialCache writes after every batch in v3) and slice from
        // lastFlushedEventCount → current to grab only events pushed since the
        // last flush. This avoids reconstructing the slice from prioritizedGroups
        // (which doesn't track completion order under concurrency=12).
        //
        // Two-key discipline (D-04 / D-11): periodic write → terminal key
        // (`events:llm:v3` ConflictEventEntity[]); partial-key writes are
        // owned by the v3 extractor's writePartialCache — UNCHANGED.
        //
        // Pitfall 8: runEval() is NOT called here. It stays at its existing
        // post-FINAL-geocode location.
        const flushEvery = getFlushEveryNBatches();
        let batchesSinceLastFlush = 0;
        let lastFlushedEventCount = 0;

        const PARTIAL_KEY_ACTIVE = pipelineV3
          ? 'events:llm:v3:partial'
          : pipelineV2
            ? 'events:llm:v2:partial'
            : 'events:llm:partial';

        const extractResult = await processEventGroups(
          prioritizedGroups,
          async (completed, total) => {
            updateProgress({ completedBatches: completed, totalBatches: total });

            batchesSinceLastFlush++;
            if (batchesSinceLastFlush < flushEvery) return;
            batchesSinceLastFlush = 0;

            // Periodic flush — geocode the just-completed window and persist
            // to the terminal key. Best-effort: any failure is logged and
            // swallowed so the extraction loop continues. The final-flush at
            // end-of-pipeline will still attempt a full-cache write.
            try {
              const partialCached = await cacheGetSafe<{
                events: unknown[];
                progress?: string;
                complete?: boolean;
                generatedAt?: string;
              }>(PARTIAL_KEY_ACTIVE, 999_999_999);
              const partialEvents = partialCached?.data?.events;
              if (!Array.isArray(partialEvents) || partialEvents.length <= lastFlushedEventCount) {
                return; // nothing new since the last flush
              }
              const window = partialEvents.slice(lastFlushedEventCount);

              // Geocode the window via the schema-version-aware barrel.
              // matchedNewsByGroup / bellingcatByGroup are not yet exposed
              // per-batch — periodic flushes pass empty Maps so the resolver's
              // POI-amenity-disambiguation branch falls back to gdelt-actiongeo
              // for groups missing context. Geocode quality on periodic-flush
              // slices remains valid; final flush picks up any richer context
              // from the run-result Maps (D-05). Future work could plumb the
              // accumulators per-batch if quality drift becomes measurable.
              let adapted: ConflictEventEntity[] = [];
              if (pipelineV3) {
                const geo = await geocodeEnrichedEvents(
                  {
                    schemaVersion: 'v3',
                    events: window as never,
                    matchedNewsByGroup: new Map(),
                    bellingcatByGroup: new Map(),
                  },
                  prioritizedGroups,
                );
                if (geo.schemaVersion === 'v3') {
                  adapted = enrichedV3ToEntities(geo.events, prioritizedGroups);
                }
              } else if (pipelineV2) {
                const geo = await geocodeEnrichedEvents(
                  {
                    schemaVersion: 'v2',
                    events: window as never,
                    matchedNewsByGroup: new Map(),
                    bellingcatByGroup: new Map(),
                  },
                  prioritizedGroups,
                );
                if (geo.schemaVersion === 'v2') {
                  adapted = enrichedV2ToEntities(geo.events, prioritizedGroups);
                }
              } else {
                const geo = await geocodeEnrichedEvents(
                  { schemaVersion: 'v1', events: window as never },
                  prioritizedGroups,
                );
                if (geo.schemaVersion === 'v1') {
                  adapted = enrichedV1ToEntities(geo.events, prioritizedGroups);
                }
              }

              if (adapted.length > 0) {
                await mergeAndPersistLlmEntities(
                  adapted,
                  llmCachedRef,
                  LLM_EVENTS_KEY_ACTIVE,
                  pipelineV2,
                  pipelineV3,
                );
                lastFlushedEventCount = partialEvents.length;
                log.info(
                  { completed, total, windowSize: window.length, flushed: adapted.length },
                  'Plan 01 periodic-flush: incremental terminal-key write',
                );
              }
            } catch (flushErr) {
              // Best-effort — periodic flush failure must NOT abort the
              // extraction loop. The final flush at end-of-pipeline will
              // still attempt a full-cache write.
              log.warn(
                { err: flushErr, completed, total },
                'Plan 01 periodic-flush failed (continuing)',
              );
            }
          },
        );

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

        let llmEntities: ConflictEventEntity[];
        if (extractResult.schemaVersion === 'v3') {
          const geoResult = await geocodeEnrichedEvents(
            {
              schemaVersion: 'v3',
              events: extractResult.events,
              matchedNewsByGroup: extractResult.matchedNewsByGroup,
              bellingcatByGroup: extractResult.bellingcatByGroup,
            },
            prioritizedGroups,
            (completed, total) => {
              updateProgress({ completedGeocodes: completed, totalGeocodes: total });
            },
          );
          if (geoResult.schemaVersion !== 'v3') {
            throw new Error('geocoder schemaVersion mismatch (expected v3)');
          }
          const provenanceCounts: Partial<Record<GeocodeProvenance, number>> = {};
          let suspectCount = 0;
          for (const e of geoResult.events) {
            provenanceCounts[e.geocodeProvenance] =
              (provenanceCounts[e.geocodeProvenance] ?? 0) + 1;
            if (e.suspect) suspectCount++;
          }
          updateProgress({ provenanceCounts, suspectCount });

          try {
            const evalScore = await runEval();
            log.info({ evalScore, schemaVersion: 'v3' }, 'eval harness completed');
          } catch (evalErr) {
            log.warn({ err: evalErr }, 'eval harness threw; continuing pipeline');
          }

          llmEntities = enrichedV3ToEntities(geoResult.events, prioritizedGroups);
        } else if (extractResult.schemaVersion === 'v2') {
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
            throw new Error('geocoder schemaVersion mismatch (expected v2)');
          }
          const provenanceCounts: Partial<Record<GeocodeProvenance, number>> = {};
          let suspectCount = 0;
          for (const e of geoResult.events) {
            provenanceCounts[e.geocodeProvenance] =
              (provenanceCounts[e.geocodeProvenance] ?? 0) + 1;
            if (e.suspect) suspectCount++;
          }
          updateProgress({ provenanceCounts, suspectCount });

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

        // Phase 28.2.6 Plan 01 Task 4a — final flush via shared helper.
        // Same merge-and-persist semantics as the periodic flush (Task 4b);
        // pure refactor, no behavior change at this site.
        await mergeAndPersistLlmEntities(
          llmEntities,
          llmCachedRef,
          LLM_EVENTS_KEY_ACTIVE,
          pipelineV2,
          pipelineV3,
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
    })(),
  );

  return {
    dispatched: true,
    coldCacheBypass: isColdCache,
    schemaVersion: version,
  };
}

// ---------------------------------------------------------------------------
// Entity adapters — moved verbatim from server/routes/events.ts so the helper
// is fully self-contained. Exported so the legacy `enrichedToEntities` alias
// in events.ts (kept for backward compatibility) and any direct importer
// continues to type-check.
// ---------------------------------------------------------------------------

/**
 * Convert v1 LLM-geocoded enriched events back to ConflictEventEntity format.
 */
export function enrichedV1ToEntities(
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

    const sourceUrls = groupSourceUrls.get(enriched.groupKey) ?? [];
    const sourceTier = getHighestTier(sourceUrls) ?? undefined;

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
 */
export function enrichedV2ToEntities(
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

    const placeLabel =
      enriched.location.landmark ||
      enriched.location.city ||
      enriched.location.admin1 ||
      enriched.location.country ||
      enriched.displayName ||
      'unknown';

    results.push({
      ...template,
      id: `llm-v2-${enriched.groupKey}`,
      lat: enriched.resolvedLat,
      lng: enriched.resolvedLng,
      type: enriched.type,
      label: `${placeLabel}: ${enriched.summary.slice(0, 60)}`,
      data: {
        ...template.data,
        locationName: placeLabel,
        summary: enriched.summary,
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

/**
 * Convert v3 LLM-geocoded enriched events into ConflictEventEntity format.
 * Mirrors enrichedV2ToEntities but stamps the entity id with `llm-v3-`.
 */
export function enrichedV3ToEntities(
  geocoded: GeocodedEnrichedEventV3[],
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

    const placeLabel =
      enriched.location.landmark ||
      enriched.location.city ||
      enriched.location.admin1 ||
      enriched.location.country ||
      enriched.displayName ||
      'unknown';

    results.push({
      ...template,
      id: `llm-v3-${enriched.groupKey}`,
      lat: enriched.resolvedLat,
      lng: enriched.resolvedLng,
      type: enriched.type,
      label: `${placeLabel}: ${enriched.summary.slice(0, 60)}`,
      data: {
        ...template.data,
        locationName: placeLabel,
        summary: enriched.summary,
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
        severity: enriched.severity,
        suspect: enriched.suspect,
        geocodeProvenance: enriched.geocodeProvenance,
        weaponType: enriched.weaponType,
        targetType: enriched.targetType,
        timeOfDay: enriched.timeOfDay,
        durationMinutes: enriched.durationMinutes,
        reasoning: enriched.reasoning,
        geocodeDisplayName: enriched.displayName,
      },
    });
  }
  return results;
}
