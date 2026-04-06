import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchWeather } from '../adapters/open-meteo.js';
import { WEATHER_CACHE_TTL, WEATHER_REDIS_TTL_SEC, WEATHER_CACHE_KEY } from '../config.js';
import type { WeatherGridPoint } from '../types.js';

export const weatherRouter = Router();

weatherRouter.get('/', async (_req, res) => {
  // 1. Check cache first
  const cached = await cacheGetSafe<WeatherGridPoint[]>(WEATHER_CACHE_KEY, WEATHER_CACHE_TTL);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    // 2. Fetch fresh data from Open-Meteo
    const points = await fetchWeather();

    // 3. Cache the fresh data
    await cacheSetSafe(WEATHER_CACHE_KEY, points, WEATHER_REDIS_TTL_SEC);

    log({ level: 'info', message: `[weather] fetched ${points.length} grid points` });

    // 4. Return fresh response
    res.json({ data: points, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log({ level: 'error', message: `[weather] upstream error: ${(err as Error).message}` });

    // Fall back to stale cache if available
    if (cached) {
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      throw err; // Express catches and forwards to errorHandler
    }
  }
});
