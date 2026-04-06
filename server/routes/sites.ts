import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchSites } from '../adapters/overpass.js';
import { SITES_CACHE_TTL } from '../config.js';
import type { SiteEntity } from '../types.js';

/** Redis key for all cached infrastructure sites */
const SITES_KEY = 'sites:v2';

/** Logical TTL in ms -- 24 hours for static site data */
const LOGICAL_TTL_MS = SITES_CACHE_TTL;

/** Hard Redis TTL in seconds -- 3 days fallback window */
const REDIS_TTL_SEC = 259_200;

export const sitesRouter = Router();

sitesRouter.get('/', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const cached = await cacheGetSafe<SiteEntity[]>(SITES_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale && !forceRefresh) {
    return res.json(cached);
  }

  try {
    const sites = await fetchSites();
    await cacheSetSafe(SITES_KEY, sites, REDIS_TTL_SEC);
    res.json({ data: sites, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log({ level: 'error', message: `[sites] Overpass error: ${(err as Error).message}` });
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
