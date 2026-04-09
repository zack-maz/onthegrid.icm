import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'events' });
import { fetchEvents, backfillEvents } from '../adapters/gdelt.js';
import { isLLMConfigured } from '../adapters/llm-provider.js';
import { extractBellingcatGeo } from '../lib/eventScoring.js';
import { groupGdeltRows } from '../lib/eventGrouping.js';
import { processEventGroups, geocodeEnrichedEvents } from '../lib/llmEventExtractor.js';
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
  geocoded: Array<{ groupKey: string; resolvedLat: number; resolvedLng: number; location: { name: string; precision: 'exact' | 'neighborhood' | 'city' | 'region' }; type: string; actors: string[]; severity: string; summary: string; casualties: { killed: number | null; injured: number | null; unknown: boolean }; sourceCount: number }>,
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

export const eventsRouter = Router();

eventsRouter.get('/', validateQuery(eventsQuerySchema), async (_req, res) => {
  const { backfill: forceBackfill } = res.locals.validatedQuery as z.infer<
    typeof eventsQuerySchema
  >;

  // --- LLM cache check (highest priority: serve enriched events if fresh) ---
  const llmCached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY, LLM_LOGICAL_TTL_MS);
  if (llmCached && !llmCached.stale) {
    return sendValidated(res, eventsResponseSchema, llmCached);
  }

  // Check raw GDELT cache (skip on forced backfill)
  const cached = forceBackfill
    ? null
    : await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale && !isLLMConfigured()) {
    return sendValidated(res, eventsResponseSchema, cached);
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

    // --- LLM processing layer (on top of raw GDELT) ---
    // Wrapped in try/catch: on ANY failure, fall through to serving raw GDELT.
    // The map NEVER goes blank.
    if (isLLMConfigured()) {
      try {
        if (await shouldRunLLM()) {
          const groups = groupGdeltRows(merged);

          // Diff: only process groups whose key doesn't match a cached LLM event
          const cachedLlmKeys = new Set<string>();
          if (llmCached?.data) {
            for (const e of llmCached.data) {
              if (e.id) cachedLlmKeys.add(e.id);
            }
          }
          const newGroups = cachedLlmKeys.size > 0
            ? groups.filter((g) => !cachedLlmKeys.has(g.key))
            : groups;

          if (newGroups.length > 0) {
            const enriched = await processEventGroups(newGroups);

            if (enriched) {
              const geocoded = await geocodeEnrichedEvents(enriched, newGroups);
              const llmEntities = enrichedToEntities(geocoded, newGroups);

              // Merge newly processed LLM events with existing cached LLM events
              const llmMergeMap = new Map<string, ConflictEventEntity>();
              if (llmCached?.data) {
                for (const e of llmCached.data) {
                  llmMergeMap.set(e.id, e);
                }
              }
              for (const e of llmEntities) {
                llmMergeMap.set(e.id, e);
              }
              const llmMerged = Array.from(llmMergeMap.values());

              await cacheSetSafe(LLM_EVENTS_KEY, llmMerged, LLM_REDIS_TTL_SEC);
              await recordLLMTimestamp();
              log.info({ count: llmEntities.length, total: llmMerged.length }, 'LLM: processed and cached enriched events');

              return sendValidated(res, eventsResponseSchema, {
                data: llmMerged,
                stale: false,
                lastFresh: Date.now(),
              });
            }
          } else {
            // No new groups to process — re-serve cached LLM data if available
            if (llmCached?.data) {
              await recordLLMTimestamp();
              return sendValidated(res, eventsResponseSchema, {
                data: llmCached.data,
                stale: false,
                lastFresh: Date.now(),
              });
            }
          }

          // LLM returned null (all batches failed) — fall through to raw GDELT
          log.warn('LLM processing returned null — falling back to raw GDELT');
        } else if (llmCached?.data) {
          // Cooldown not expired — serve stale LLM cache
          return sendValidated(res, eventsResponseSchema, {
            data: llmCached.data,
            stale: true,
            lastFresh: llmCached.lastFresh,
          });
        }
      } catch (llmErr) {
        // Any LLM pipeline failure — log and fall through to raw GDELT
        log.warn({ err: llmErr }, 'LLM processing failed — falling back to raw GDELT');
      }
    }

    // Serve raw GDELT events (default path / fallback)
    sendValidated(res, eventsResponseSchema, {
      data: merged,
      stale: false,
      lastFresh: Date.now(),
    });
  } catch (err) {
    log.error({ err }, 'upstream error');

    if (cached) {
      // Prune stale entries even on error
      const pruned = cached.data.filter((e) => e.timestamp >= WAR_START);
      sendValidated(res, eventsResponseSchema, {
        data: pruned,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      throw new AppError(502, 'UPSTREAM_FAIL', `gdelt fetch failed: ${(err as Error).message}`);
    }
  }
});
