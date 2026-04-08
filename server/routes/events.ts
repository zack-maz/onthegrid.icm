import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'events' });
import { fetchEvents, backfillEvents } from '../adapters/gdelt.js';
import { extractBellingcatGeo } from '../lib/eventScoring.js';
import { WAR_START, CACHE_TTL } from '../config.js';
import { validateQuery } from '../middleware/validate.js';
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

export const eventsRouter = Router();

eventsRouter.get('/', validateQuery(eventsQuerySchema), async (_req, res) => {
  const { backfill: forceBackfill } = res.locals.validatedQuery as z.infer<
    typeof eventsQuerySchema
  >;

  // Check cache first (skip on forced backfill)
  const cached = forceBackfill
    ? null
    : await cacheGetSafe<ConflictEventEntity[]>(EVENTS_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale) {
    return res.json(cached);
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
    res.json({ data: merged, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'upstream error');

    if (cached) {
      // Prune stale entries even on error
      const pruned = cached.data.filter((e) => e.timestamp >= WAR_START);
      res.json({ data: pruned, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
