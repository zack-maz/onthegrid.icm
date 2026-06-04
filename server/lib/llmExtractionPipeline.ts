/**
 * Phase 27.4.6 (D-04 / D-10) — shared LLM extraction dispatch helper.
 *
 * `runRefreshExtraction` owns the v3 extraction kick-off that used to
 * live as a fire-and-forget block inside `/api/events`. After the
 * cron-driven trigger phase shipped, the route is cache-only — every
 * code path that fires an extraction calls this helper instead.
 *
 * The function is fire-and-forget by design: the actual `processEventGroupsV3`
 * + `geocodeEnrichedEventsV3` work is launched as a `void async () => {}` IIFE
 * so the caller's response cycle is not held open while the LLM pipeline runs
 * (~13 minutes typical; bounded by the Vercel Pro 800s `maxDuration` ceiling).
 *
 * Decisions tracked:
 *   - D-04: verbatim port of the prior fire-and-forget body — zero re-implementation.
 *   - D-06: stamps `lastTriggerSource` into `llmProgress` so DevApiStatus can
 *     differentiate cron-fired runs from /api/events-fired runs (the latter
 *     no longer happens after Phase 27.4.6).
 *   - D-10: cold-cache probe BEFORE the cooldown check — when the active
 *     `events:llm:v3` key is empty, the cooldown is bypassed automatically so
 *     the first invocation after a fresh deploy always populates the cache.
 *   - D-11: `forceCooldown` opt-in lets the cron route's `?force=true` query
 *     param bypass the 15-min cooldown for operator-driven re-extractions.
 *
 * Phase 29 D-02 part C collapsed the v1/v2/v3 dispatch to v3-only:
 *   - `LLM_EVENTS_KEY_ACTIVE` is now the literal `'events:llm:v3'`.
 *   - `LLM_SUMMARY_KEY_ACTIVE` is now the literal `'events:llm-summary:v3'`.
 *   - `BATCH_SIZE_ACTIVE` is the v3 default (2; see llmEventExtractor.v3.ts).
 *   - The v1 + v2 entity adapters were deleted along with the extractor modules.
 *
 * Phase 38 LLM-PURGE-01 — the `llmEventExtractor.ts` v3-only re-export barrel
 * was deleted; this module imports `processEventGroupsV3` +
 * `geocodeEnrichedEventsV3` directly from `./llmEventExtractor.v3.js`.
 */

import { isLLMConfigured } from '../adapters/llm-provider.js';
import { saveDevLLMCacheV2 } from '../cache/devFileCache.js';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';

import { groupGdeltRows } from './eventGrouping.js';
import { runEval } from './llmEvalHarness.js';
import {
  processEventGroupsV3,
  geocodeEnrichedEventsV3,
  type GeocodedEnrichedEventV3,
} from './llmEventExtractor.v3.js';
import { llmProgress, resetProgress, updateProgress, buildSummary } from './llmProgress.js';
import { shouldPauseNewEvents, prioritizeBySeverity } from './llmTokenBudget.js';
import { logger } from './logger.js';
import { safeWaitUntil } from './safeWaitUntil.js';
import { getHighestTier } from './sourceTiers.js';
// Phase 32 Plan 32-03 Task 3 — cron post-step. After the existing
// extraction work resolves inside the safeWaitUntil IIFE, run the URL
// liveness probe sweep (Plan 32-02) and then the auto-prune helper
// (Plan 32-03 Task 1) — gated on a wall-clock deadline so we stay
// inside Vercel Pro's 800s `maxDuration` (Pitfall 1, RESEARCH A6).
//
// DIRECT helper invocation (NOT self-HTTP) per RESEARCH A4 / Discretion
// §3 — simpler tests, no env-dependent deployment URL, audit-log path
// is identical (helper writes `bearerFingerprint:'cron:refresh-events'`
// per RESEARCH A8). The HTTP route at POST /api/events/prune-dead-urls
// (Plan 32-03 Task 2) is for operator clicks only.
import {
  buildProbeCandidates,
  pruneDeadUrlEvents,
  runProbeSweep,
  SWEEP_SAFETY_MARGIN_MS,
} from './urlLiveness.js';

import type { ConflictEventEntity } from '../types.js';
import type { GeocodeProvenance } from './llmSchema.js';

const log = logger.child({ module: 'llm-extraction-pipeline' });

// ---------------------------------------------------------------------------
// Cache keys + TTL constants (mirrors the values previously held in events.ts).
// Phase 29 D-02 part C — `*_ACTIVE` inlined to v3 constants since v1+v2 are gone.
// ---------------------------------------------------------------------------

/** Redis key for raw GDELT events the helper reads as input. */
const EVENTS_KEY = 'events:gdelt';

/**
 * Active terminal LLM cache key. v3-only post-Phase-29.
 *
 * Phase 32 Plan 32-03 exports this so `pruneDeadUrlEvents`
 * (server/lib/urlLiveness.ts) shares one truth source on the v3 key
 * literal — the splice writer would otherwise hand-roll the string,
 * which is the exact drift class CLAUDE.md §"Serverless Cache" warns
 * against.
 */
export const LLM_EVENTS_KEY_ACTIVE = 'events:llm:v3';

/** Active LLM run-summary key. v3-only post-Phase-29. */
const LLM_SUMMARY_KEY_ACTIVE = 'events:llm-summary:v3';

// Phase 30 D-04 (SIMPLIFY-01): the local `PARTIAL_KEY_ACTIVE` const was
// retired here when the periodic-flush callback (its sole reader) was
// deleted.
// Phase 35 D-12 (SIMPLIFY-02): the `events:llm:v3:partial` observability key
// has now been retired in the v3 extractor too. The v3 extractor's
// writePartialCache writer was deleted in this phase; the terminal-key write
// at end of run is the sole canonical shape going forward.

/** Redis key tracking the last LLM run start time (15-min cooldown). */
const LLM_PROCESS_KEY = 'events:llm-process-ts';

/** 15 minute cooldown between LLM processing runs. */
const LLM_COOLDOWN_MS = 900_000;

/**
 * Hard Redis TTL for LLM caches (2.5h, 10x logical).
 *
 * Phase 32 Plan 32-03 exports this so `pruneDeadUrlEvents`'s
 * cacheSetSafe write-back uses the same TTL the cron writer uses —
 * the splice-back must not silently re-TTL the v3 cache.
 */
export const LLM_REDIS_TTL_SEC = 9000;

/** 24-hour TTL for LLM run summary (retained across runs). */
const LLM_SUMMARY_TTL_SEC = 86_400;

/** v3 BATCH_SIZE used for progress math. v2's BATCH_SIZE=2 is gone; v3 also uses 2. */
const BATCH_SIZE_ACTIVE = 2;

// ---------------------------------------------------------------------------
// Phase 30 D-04 (SIMPLIFY-01) — incremental flush retired. The Pro 800s
// ceiling makes the prior Hobby-era 300s-budget crash-protection rationale
// obsolete (Plan 06 Run 2 validated 0 watchdog hard-kills inside budget).
// The terminal write at the end of `runRefreshExtraction`'s IIFE is now
// the canonical (and only) writer of `events:llm:v3`.
// ---------------------------------------------------------------------------

/**
 * Phase 28.2.6 Plan 01 — shared merge-and-persist helper.
 *
 * Single-purpose: end-of-run terminal write of `ConflictEventEntity[]` to
 * the active LLM cache key (`events:llm:v3`). Sole writer of the terminal
 * key (Phase 35 D-12 / SIMPLIFY-02 retired the partial-key observability
 * envelope; the previous two-key discipline collapses to one-key discipline).
 *
 * Phase 30 D-04: single callsite (end-of-run terminal write only). Periodic
 * flush retired (SIMPLIFY-01). The earlier periodic-flush hook inside the
 * onBatchComplete callback was removed because the Pro 800s ceiling makes
 * the prior Hobby-era crash-protection rationale obsolete.
 *
 * Pitfall 4 — merge-by-id with prior cache. The terminal flush merges with
 * llmCachedRef.data so events from earlier cron ticks survive the write.
 *
 * Pitfall 8 — does NOT call runEval(). The eval harness stays at its
 * existing post-FINAL-geocode location.
 *
 * Phase 29 D-02 part C — `pipelineV2 / pipelineV3` params dropped; the dev
 * file cache helper is unconditionally `saveDevLLMCacheV2` (the v3 path also
 * uses the v2 dev-file shape per the helper's documented contract).
 */
async function mergeAndPersistLlmEntities(
  newlyEnriched: ConflictEventEntity[],
  llmCachedRef: { data: ConflictEventEntity[] } | null,
  key: string,
): Promise<{ writtenCount: number; total: number }> {
  const llmMergeMap = new Map<string, ConflictEventEntity>();
  if (llmCachedRef?.data) {
    for (const e of llmCachedRef.data) llmMergeMap.set(e.id, e);
  }
  for (const e of newlyEnriched) llmMergeMap.set(e.id, e);
  const llmMerged = Array.from(llmMergeMap.values());
  await cacheSetSafe(key, llmMerged, LLM_REDIS_TTL_SEC);
  saveDevLLMCacheV2(llmMerged);
  log.info(
    { count: newlyEnriched.length, total: llmMerged.length },
    'LLM: persisted enriched events to terminal cache (Plan 01 helper)',
  );
  return { writtenCount: newlyEnriched.length, total: llmMerged.length };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/** Options for `runRefreshExtraction` — caller-supplied trigger metadata + cooldown override. */
export interface RunRefreshOpts {
  /** Provenance label stamped onto `llmProgress.lastTriggerSource` (D-06). */
  triggeredBy: 'cron' | 'manual';
  /** When true, bypass the 15-min `events:llm-process-ts` cooldown.
   *  Wired from `?force=true` (D-11) and from the cold-cache self-heal (D-10). */
  forceCooldown?: boolean;
}

/** Result of `runRefreshExtraction` — dispatch decision + skip reason if not dispatched. */
export interface RunRefreshResult {
  /** true if a fresh extraction was kicked off (fire-and-forget). */
  dispatched: boolean;
  /** Populated when `dispatched=false`. */
  reason?: 'cooldown' | 'llm_unconfigured' | 'no_raw_events' | 'pipeline_busy';
  /** Set when the cold-cache probe forced a bypass (D-10). */
  coldCacheBypass?: boolean;
  /** Schema version of the active pipeline at dispatch time (D-06). v3-only post-Phase-29. */
  schemaVersion?: 'v3';
}

/**
 * Kick off a new LLM extraction run if the cooldown / cold-cache / busy /
 * configured / raw-events guards permit. The actual work runs as a
 * fire-and-forget IIFE; this function returns synchronously after the
 * dispatch decision is made.
 */
export async function runRefreshExtraction(opts: RunRefreshOpts): Promise<RunRefreshResult> {
  // Phase 32 Plan 32-03 Task 3 — wall-clock start captured at function
  // entry. The post-extraction probe sweep computes its deadline as
  // `cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS` so we stay inside
  // Vercel Pro's 800s `maxDuration` with a 60s safety margin reserved
  // for the prune + audit-log writes (Pitfall 1 / RESEARCH A6). One
  // truth source across handler boundary — the SWEEP_SAFETY_MARGIN_MS
  // constant is exported from urlLiveness.ts (Plan 32-02).
  const cronStart = Date.now();

  // 1. Active pipeline is v3-only post-Phase-29 — no version dispatch needed.

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
          return { dispatched: false, reason: 'cooldown', schemaVersion: 'v3' };
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
    return { dispatched: false, reason: 'llm_unconfigured', schemaVersion: 'v3' };
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
    return { dispatched: false, reason: 'no_raw_events', schemaVersion: 'v3' };
  }
  const merged = rawCached.data;

  // 6. Pipeline-busy guard — preserves single-flight semantics so we never
  //    stack two parallel extractor runs (anti-pattern #18).
  if (
    llmProgress.stage !== 'idle' &&
    llmProgress.stage !== 'done' &&
    llmProgress.stage !== 'error'
  ) {
    return { dispatched: false, reason: 'pipeline_busy', schemaVersion: 'v3' };
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
      updateProgress({ schemaVersion: 'v3', lastTriggerSource: opts.triggeredBy });

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
          cachedLlmKeys.size > 0
            ? groups.filter((g) => !cachedLlmKeys.has(`llm-v3-${g.key}`))
            : groups;

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

        // v3 BATCH_SIZE=2 (the v1 BATCH_SIZE=8 path is gone post-Phase-29).
        const effectiveBatchSize = BATCH_SIZE_ACTIVE;
        updateProgress({
          stage: 'llm-processing',
          totalBatches: Math.ceil(prioritizedGroups.length / effectiveBatchSize),
        });

        const extractResult = await processEventGroupsV3(
          prioritizedGroups,
          async (completed, total) => {
            updateProgress({ completedBatches: completed, totalBatches: total });
            // Phase 30 D-04 (SIMPLIFY-01): incremental flush retired. Terminal
            // write at the mergeAndPersistLlmEntities call below is canonical.
            // Phase 35 D-12 (SIMPLIFY-02): writePartialCache was deleted from the
            // v3 extractor; there is no partial-cache write anywhere.
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

        // geocodeEnrichedEventsV3 takes the v3-native signature: a flat events
        // array + a groupsByKey map + the per-group news/bellingcat maps
        // threaded straight from the extractor run (no tagged-shape wrapper —
        // the Phase 38 LLM-PURGE-01 stub barrel that wrapped this was deleted).
        const groupsByKey = new Map(prioritizedGroups.map((g) => [g.key, g] as const));
        const geocodedEvents = await geocodeEnrichedEventsV3(
          extractResult.events,
          groupsByKey,
          extractResult.matchedNewsByGroup,
          extractResult.bellingcatByGroup,
          (completed, total) => {
            updateProgress({ completedGeocodes: completed, totalGeocodes: total });
          },
        );
        const provenanceCounts: Partial<Record<GeocodeProvenance, number>> = {};
        let suspectCount = 0;
        for (const e of geocodedEvents) {
          provenanceCounts[e.geocodeProvenance] = (provenanceCounts[e.geocodeProvenance] ?? 0) + 1;
          if (e.suspect) suspectCount++;
        }
        updateProgress({ provenanceCounts, suspectCount });

        try {
          const evalScore = await runEval();
          log.info({ evalScore, schemaVersion: 'v3' }, 'eval harness completed');
        } catch (evalErr) {
          log.warn({ err: evalErr }, 'eval harness threw; continuing pipeline');
        }

        const llmEntities = enrichedV3ToEntities(geocodedEvents, prioritizedGroups);

        // Phase 30 D-04 (SIMPLIFY-01) — sole / terminal write of the
        // canonical `events:llm:v3` key for this cron run. The Phase 28.2.6
        // Plan 01 Task 4b periodic-flush callsite (formerly inside the
        // onBatchComplete callback above) was retired here.
        await mergeAndPersistLlmEntities(llmEntities, llmCachedRef, LLM_EVENTS_KEY_ACTIVE);

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
      } finally {
        // Phase 32 Plan 32-03 Task 3 — cron post-step. Runs AFTER the
        // existing extraction work resolves (success OR error path) so
        // probe+prune cleanup happens regardless of whether LLM
        // extraction itself dispatched fresh enrichments this tick.
        //
        // Deadline budget plumbing (Pitfall 1 / RESEARCH A6):
        //   deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS
        // — passed into runProbeSweep so each task short-circuits past
        // the cutoff. After the sweep returns, the auto-prune ONLY fires
        // if `Date.now() < deadlineMs` so we don't kick off the splice
        // mid-`cacheSet` and get killed by Vercel's maxDuration.
        //
        // Direct helper invocation (NOT self-HTTP) per RESEARCH A4 /
        // Discretion §3 — the prune helper writes the audit-log entry
        // with `bearerFingerprint:'cron:refresh-events'` (RESEARCH A8)
        // so the source remains unambiguous.
        //
        // Wrapped in its own try/catch — probe/prune failures must NOT
        // break the extraction outcome. log.error surfaces the failure
        // via the standard pino observability path.
        try {
          const deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS;
          const candidates = await buildProbeCandidates();
          const sweep = await runProbeSweep({
            eventIdsWithUrls: candidates,
            deadlineMs,
          });
          log.info(
            { probed: sweep.probed, skippedBudget: sweep.skippedBudget },
            'phase 32 probe sweep complete',
          );
          if (Date.now() < deadlineMs) {
            const pruneResult = await pruneDeadUrlEvents({ trigger: 'cron' });
            log.info(
              { prunedCount: pruneResult.prunedCount, prunedIds: pruneResult.prunedIds },
              'phase 32 cron auto-prune complete',
            );
          } else {
            log.warn(
              { deadlineMs, now: Date.now() },
              'phase 32 deadline elapsed; skipping cron auto-prune for this tick',
            );
          }
        } catch (probePruneErr) {
          log.error({ err: probePruneErr }, 'phase 32 probe/prune post-step failed');
        }
      }
    })(),
  );

  return {
    dispatched: true,
    coldCacheBypass: isColdCache,
    schemaVersion: 'v3',
  };
}

// ---------------------------------------------------------------------------
// Entity adapters — moved verbatim from server/routes/events.ts so the helper
// is fully self-contained. The v1 + v2 adapters were deleted in Phase 29 D-02
// part C alongside the v1+v2 extractor modules; only enrichedV3ToEntities
// remains as the active adapter.
// ---------------------------------------------------------------------------

/**
 * Convert v3 LLM-geocoded enriched events into ConflictEventEntity format.
 * Stamps the entity id with `llm-v3-` so the dev drill-down can recover the
 * stable groupKey via prefix strip.
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
