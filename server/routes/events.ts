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
import { processEventGroups, geocodeEnrichedEvents } from '../lib/llmEventExtractor.js';
import { llmProgress, resetProgress, updateProgress, buildSummary } from '../lib/llmProgress.js';
import type { LLMRunSummary } from '../lib/llmProgress.js';
import { WAR_START, CACHE_TTL } from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import { sendValidated } from '../middleware/validateResponse.js';
import { AppError } from '../middleware/errorHandler.js';
import { eventsResponseSchema } from '../schemas/cacheResponse.js';
import type { ConflictEventEntity, NewsCluster } from '../types.js';

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
 * Convert LLM-geocoded enriched events back to ConflictEventEntity format.
 * Merges LLM-extracted fields into the existing entity data structure.
 */
function enrichedToEntities(
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
  groups: Array<{ key: string; entities: ConflictEventEntity[] }>,
): ConflictEventEntity[] {
  const groupMap = new Map<string, ConflictEventEntity[]>();
  for (const g of groups) {
    groupMap.set(g.key, g.entities);
  }

  const results: ConflictEventEntity[] = [];
  for (const enriched of geocoded) {
    const entities = groupMap.get(enriched.groupKey);
    if (!entities || entities.length === 0) continue;

    // Use the first entity as a template, override with LLM data
    const template = entities[0];
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

export const eventsRouter = Router();

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

  // If in-memory progress is active (not idle), return it directly
  if (llmProgress.stage !== 'idle') {
    return res.json(llmProgress);
  }

  // Otherwise, fall back to Redis summary from last completed run
  try {
    const summary = await cacheGetSafe<LLMRunSummary>(LLM_SUMMARY_KEY, 0);
    if (summary?.data) {
      return res.json({ stage: 'idle' as const, lastRun: summary.data });
    }
  } catch {
    // Redis failure — return idle with no history
  }

  res.json({ stage: 'idle' as const, lastRun: null });
});

eventsRouter.get('/', validateQuery(eventsQuerySchema), async (_req, res) => {
  const { backfill: forceBackfill } = res.locals.validatedQuery as z.infer<
    typeof eventsQuerySchema
  >;

  // --- LLM cache check (highest priority: serve enriched events if fresh) ---
  const llmCached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY, LLM_LOGICAL_TTL_MS);
  if (llmCached && !llmCached.stale) {
    return sendNormalizedEvents(res, llmCached);
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
              await cacheSetSafe(LLM_SUMMARY_KEY, buildSummary(), LLM_SUMMARY_TTL_SEC);
            } catch {
              /* best-effort */
            }
            return;
          }

          updateProgress({
            stage: 'llm-processing',
            totalBatches: Math.ceil(newGroups.length / 8),
          });

          const enriched = await processEventGroups(newGroups, (completed, total) => {
            updateProgress({ completedBatches: completed, totalBatches: total });
          });

          if (!enriched || enriched.length === 0) {
            log.warn('LLM processing returned null — raw GDELT serving continues');
            updateProgress({
              stage: 'error',
              errorMessage: 'LLM returned null for all batches',
              completedAt: Date.now(),
              durationMs: Date.now() - (llmProgress.startedAt ?? Date.now()),
            });
            try {
              await cacheSetSafe(LLM_SUMMARY_KEY, buildSummary(), LLM_SUMMARY_TTL_SEC);
            } catch {
              /* best-effort */
            }
            return;
          }

          updateProgress({
            stage: 'geocoding',
            enrichedCount: enriched.length,
            totalGeocodes: enriched.length,
          });

          const geocoded = await geocodeEnrichedEvents(enriched, newGroups, (completed, total) => {
            updateProgress({ completedGeocodes: completed, totalGeocodes: total });
          });
          const llmEntities = enrichedToEntities(geocoded, newGroups);

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

          await cacheSetSafe(LLM_EVENTS_KEY, llmMerged, LLM_REDIS_TTL_SEC);
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
            await cacheSetSafe(LLM_SUMMARY_KEY, buildSummary(), LLM_SUMMARY_TTL_SEC);
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
            await cacheSetSafe(LLM_SUMMARY_KEY, buildSummary(), LLM_SUMMARY_TTL_SEC);
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
