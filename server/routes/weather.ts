import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'weather' });
import { fetchWeather } from '../adapters/open-meteo.js';
import { WEATHER_CACHE_TTL, WEATHER_REDIS_TTL_SEC, WEATHER_CACHE_KEY } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
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

    log.info({ count: points.length }, 'fetched grid points');

    // 4. Return fresh response
    res.json({ data: points, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'upstream error');

    // Fall back to stale cache if available
    if (cached) {
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      throw new AppError(
        502,
        'UPSTREAM_FAIL',
        `open-meteo fetch failed: ${(err as Error).message}`,
      );
    }
  }
});
