import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'water' });
import { fetchWaterFacilities } from '../adapters/overpass-water.js';
import { fetchPrecipitation } from '../adapters/open-meteo-precip.js';
import {
  WATER_CACHE_TTL,
  WATER_REDIS_TTL_SEC,
  WATER_PRECIP_CACHE_TTL,
  WATER_PRECIP_REDIS_TTL_SEC,
} from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import type { WaterFacility } from '../types.js';
import type { PrecipitationData } from '../adapters/open-meteo-precip.js';

/** Zod schema for /api/water and /api/water/precip query params */
const waterQuerySchema = z.object({
  refresh: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

/** Redis key for cached water facilities */
const FACILITIES_KEY = 'water:facilities';

/** Redis key for cached precipitation data */
const PRECIP_KEY = 'water:precip';

export const waterRouter = Router();

/**
 * GET /api/water
 * Returns water infrastructure facilities with WRI stress indicators.
 * Cache-first with 24h logical TTL.
 *
 * ?refresh=true triggers a forced cache refresh. In production, only Vercel cron
 * (identified by user-agent) can trigger this. In dev, it always works.
 * The Vercel function timeout (60s maxDuration) provides the hard cap in production;
 * in local dev, the 90s per-query Overpass timeout handles it.
 */
waterRouter.get('/', validateQuery(waterQuerySchema), async (req, res) => {
  log.info('GET /api/water hit');
  const isCron = req.headers['user-agent']?.includes('vercel-cron');
  const { refresh } = res.locals.validatedQuery as z.infer<typeof waterQuerySchema>;
  const forceRefresh = refresh && (isCron || process.env.NODE_ENV !== 'production');
  const cached = await cacheGetSafe<WaterFacility[]>(FACILITIES_KEY, WATER_CACHE_TTL);
  log.info({ cacheHit: !!cached, count: cached?.data.length, stale: cached?.stale }, 'cache result');

  if (cached && !cached.stale && !forceRefresh) {
    return res.json(cached);
  }

  try {
    const facilities = await fetchWaterFacilities();
    await cacheSetSafe(FACILITIES_KEY, facilities, WATER_REDIS_TTL_SEC);
    res.json({ data: facilities, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'Overpass error');
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      log.warn('Overpass failed, returning empty');
      res.json({ data: [], stale: true, lastFresh: 0 });
    }
  }
});

/**
 * GET /api/water/precip
 * Returns 30-day precipitation data for cached water facilities.
 * Cache-first with 6h logical TTL.
 */
waterRouter.get('/precip', validateQuery(waterQuerySchema), async (_req, res) => {
  const { refresh: forceRefresh } = res.locals.validatedQuery as z.infer<typeof waterQuerySchema>;
  const cachedPrecip = await cacheGetSafe<PrecipitationData[]>(PRECIP_KEY, WATER_PRECIP_CACHE_TTL);

  if (cachedPrecip && !cachedPrecip.stale && !forceRefresh) {
    return res.json(cachedPrecip);
  }

  try {
    // Load facilities from cache (or fetch if needed)
    let facilities: WaterFacility[] = [];
    const cachedFacilities = await cacheGetSafe<WaterFacility[]>(FACILITIES_KEY, WATER_CACHE_TTL);
    if (cachedFacilities) {
      facilities = cachedFacilities.data;
    } else {
      facilities = await fetchWaterFacilities();
      await cacheSetSafe(FACILITIES_KEY, facilities, WATER_REDIS_TTL_SEC);
    }

    // Extract coordinates and fetch precipitation
    const locations = facilities.map(f => ({ lat: f.lat, lng: f.lng }));
    const precipData = await fetchPrecipitation(locations);

    // Only cache non-empty results — empty means all batches failed
    if (precipData.length > 0) {
      await cacheSetSafe(PRECIP_KEY, precipData, WATER_PRECIP_REDIS_TTL_SEC);
    }
    res.json({ data: precipData, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'precipitation fetch error');
    if (cachedPrecip) {
      res.json({ data: cachedPrecip.data, stale: true, lastFresh: cachedPrecip.lastFresh });
    } else {
      throw err;
    }
  }
});
