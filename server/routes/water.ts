import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchWaterFacilities } from '../adapters/overpass-water.js';
import { fetchPrecipitation } from '../adapters/open-meteo-precip.js';
import {
  WATER_CACHE_TTL,
  WATER_REDIS_TTL_SEC,
  WATER_PRECIP_CACHE_TTL,
  WATER_PRECIP_REDIS_TTL_SEC,
} from '../config.js';
import type { WaterFacility } from '../types.js';
import type { PrecipitationData } from '../adapters/open-meteo-precip.js';

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
waterRouter.get('/', async (req, res) => {
  log({ level: 'info', message: '[water] GET /api/water hit' });
  const isCron = req.headers['user-agent']?.includes('vercel-cron');
  const forceRefresh = req.query.refresh === 'true' && (isCron || process.env.NODE_ENV !== 'production');
  const cached = await cacheGetSafe<WaterFacility[]>(FACILITIES_KEY, WATER_CACHE_TTL);
  log({ level: 'info', message: `[water] cache result: ${cached ? `${cached.data.length} facilities, stale=${cached.stale}` : 'miss'}` });

  if (cached && !cached.stale && !forceRefresh) {
    return res.json(cached);
  }

  try {
    const facilities = await fetchWaterFacilities();
    await cacheSetSafe(FACILITIES_KEY, facilities, WATER_REDIS_TTL_SEC);
    res.json({ data: facilities, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log({ level: 'error', message: `[water] Overpass error: ${(err as Error).message}` });
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      log({ level: 'warn', message: '[water] Overpass failed, returning empty' });
      res.json({ data: [], stale: true, lastFresh: 0 });
    }
  }
});

/**
 * GET /api/water/precip
 * Returns 30-day precipitation data for cached water facilities.
 * Cache-first with 6h logical TTL.
 */
waterRouter.get('/precip', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
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
    log({ level: 'error', message: `[water/precip] Error: ${(err as Error).message}` });
    if (cachedPrecip) {
      res.json({ data: cachedPrecip.data, stale: true, lastFresh: cachedPrecip.lastFresh });
    } else {
      throw err;
    }
  }
});
