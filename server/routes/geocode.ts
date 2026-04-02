import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { reverseGeocode } from '../adapters/nominatim.js';
import type { GeocodedLocation } from '../adapters/nominatim.js';

/** Cache key prefix for geocode results */
const GEOCODE_CACHE_PREFIX = 'geocode:';

/** Logical TTL: 30 days (geographic names don't change) */
const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Hard Redis TTL: 90 days */
const GEOCODE_REDIS_TTL_SEC = 90 * 24 * 60 * 60;

export const geocodeRouter = Router();

geocodeRouter.get('/', async (req, res) => {
  const latRaw = req.query.lat;
  const lonRaw = req.query.lon;

  if (latRaw == null || lonRaw == null) {
    res.status(400).json({ error: 'lat and lon query parameters are required' });
    return;
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon must be valid numbers' });
    return;
  }

  // Quantize to 2 decimal places for cache key consistency
  const qLat = Math.round(lat * 100) / 100;
  const qLon = Math.round(lon * 100) / 100;
  const cacheKey = `${GEOCODE_CACHE_PREFIX}${qLat},${qLon}`;

  // Check cache first
  const cached = await cacheGetSafe<GeocodedLocation>(cacheKey, GEOCODE_TTL_MS);
  if (cached) {
    res.json(cached);
    return;
  }

  // Cache miss -- call Nominatim (adapter quantizes internally too)
  const result = await reverseGeocode(qLat, qLon);
  await cacheSetSafe(cacheKey, result, GEOCODE_REDIS_TTL_SEC);

  res.json({ data: result, stale: false, lastFresh: Date.now() });
});
