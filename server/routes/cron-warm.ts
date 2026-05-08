import { Router } from 'express';

import { fetchWaterFacilities } from '../adapters/overpass-water.js';
import { fetchSites } from '../adapters/overpass.js';
import { cacheSetSafe } from '../cache/redis.js';
import { WATER_REDIS_TTL_SEC } from '../config.js';
import { CRON_LASTTICK_TTL_SEC } from '../lib/healthSources.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'cron-warm' });

/** Hard Redis TTL for sites (3 days) */
const SITES_REDIS_TTL_SEC = 259_200;

/**
 * Redis keys matching the data routes.
 *
 * Phase 28.1 W7 sub-4 alignment: previously this module wrote to `sites:v2`
 * and `water:facilities`, while the read-side route handlers (sites.ts:56 and
 * water.ts:120) read from `sites:v3` and `water:facilities:v3`. The mismatch
 * meant the cron pre-warm never warmed the live cache — every warm landed in
 * a key no reader consumed. See .planning/phases/28.1-cleanup-sweep/28.1-W7-REDIS-AUDIT.md.
 *
 * The payload shapes also need to match: the route handlers persist
 * `{ sites|facilities, filterStats }` envelopes (Plan 11 G3/G4); writing bare
 * arrays would corrupt downstream cache reads.
 */
const SITES_KEY = 'sites:v3';
const WATER_KEY = 'water:facilities:v3';

export const cronWarmRouter = Router();

/**
 * GET /api/cron/warm
 * Pre-warms Redis caches for sites and water facilities.
 * Called by Vercel cron every 12h so users never hit a cold Overpass fetch.
 * Runs both fetches in parallel to stay within the 60s function timeout.
 */
cronWarmRouter.get('/', async (_req, res) => {
  const start = Date.now();
  log.info('starting cache pre-warm');

  const results = await Promise.allSettled([
    (async () => {
      const { sites, stats } = await fetchSites();
      // Plan 11 G4 envelope shape — sites.ts route handler reads
      // SitesCachePayload = { sites, filterStats } and surfaces filterStats
      // to DevApiStatus. Writing a bare array here would mean the first
      // post-warm cache hit returns `cached.data.sites === undefined`.
      await cacheSetSafe(SITES_KEY, { sites, filterStats: stats }, SITES_REDIS_TTL_SEC);
      return sites.length;
    })(),
    (async () => {
      const { facilities, stats } = await fetchWaterFacilities();
      // Plan 11 G3 envelope shape — water.ts route handler reads
      // WaterCachePayload = { facilities, filterStats }.
      await cacheSetSafe(WATER_KEY, { facilities, filterStats: stats }, WATER_REDIS_TTL_SEC);
      return facilities.length;
    })(),
  ]);

  const summary = {
    sites:
      results[0].status === 'fulfilled'
        ? { ok: true, count: results[0].value }
        : { ok: false, error: String((results[0] as PromiseRejectedResult).reason) },
    water:
      results[1].status === 'fulfilled'
        ? { ok: true, count: results[1].value }
        : { ok: false, error: String((results[1] as PromiseRejectedResult).reason) },
    durationMs: Date.now() - start,
  };

  const allOk = results.every((r) => r.status === 'fulfilled');
  const logLevel = allOk ? 'info' : 'warn';
  log[logLevel](summary, 'cache pre-warm complete');

  // Phase 28.2.7 R1 D-04 — cron:lastTick:warm writer. Tick fires on
  // partial-or-better (at least one Promise.allSettled entry fulfilled).
  // Both rejected → no tick → probe stays 'unknown' (correct: cron didn't
  // do its job). Per-source freshness already covered by the 8 cache-backed
  // probes in TIER_BY_ENDPOINT. D-11: bare Date.now() value.
  const partialOrBetter = results.some((r) => r.status === 'fulfilled');
  if (partialOrBetter) {
    await cacheSetSafe('cron:lastTick:warm', Date.now(), CRON_LASTTICK_TTL_SEC);
  }

  res.json({ status: allOk ? 'ok' : 'partial', ...summary });
});
