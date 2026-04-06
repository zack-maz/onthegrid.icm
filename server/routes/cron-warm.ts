import { Router } from 'express';
import { cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchSites } from '../adapters/overpass.js';
import { fetchWaterFacilities } from '../adapters/overpass-water.js';
import { WATER_REDIS_TTL_SEC } from '../config.js';

/** Hard Redis TTL for sites (3 days) */
const SITES_REDIS_TTL_SEC = 259_200;

/** Redis keys matching the data routes */
const SITES_KEY = 'sites:v2';
const WATER_KEY = 'water:facilities';

export const cronWarmRouter = Router();

/**
 * GET /api/cron/warm
 * Pre-warms Redis caches for sites and water facilities.
 * Called by Vercel cron every 12h so users never hit a cold Overpass fetch.
 * Runs both fetches in parallel to stay within the 60s function timeout.
 */
cronWarmRouter.get('/', async (_req, res) => {
  const start = Date.now();
  log({ level: 'info', message: '[cron-warm] Starting cache pre-warm' });

  const results = await Promise.allSettled([
    (async () => {
      const sites = await fetchSites();
      await cacheSetSafe(SITES_KEY, sites, SITES_REDIS_TTL_SEC);
      return sites.length;
    })(),
    (async () => {
      const facilities = await fetchWaterFacilities();
      await cacheSetSafe(WATER_KEY, facilities, WATER_REDIS_TTL_SEC);
      return facilities.length;
    })(),
  ]);

  const summary = {
    sites: results[0].status === 'fulfilled'
      ? { ok: true, count: results[0].value }
      : { ok: false, error: String((results[0] as PromiseRejectedResult).reason) },
    water: results[1].status === 'fulfilled'
      ? { ok: true, count: results[1].value }
      : { ok: false, error: String((results[1] as PromiseRejectedResult).reason) },
    durationMs: Date.now() - start,
  };

  const allOk = results.every((r) => r.status === 'fulfilled');
  log({
    level: allOk ? 'info' : 'warn',
    message: `[cron-warm] Done in ${summary.durationMs}ms — sites: ${JSON.stringify(summary.sites)}, water: ${JSON.stringify(summary.water)}`,
  });

  res.json({ status: allOk ? 'ok' : 'partial', ...summary });
});
