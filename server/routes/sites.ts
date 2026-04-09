import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'sites' });
import { fetchSites } from '../adapters/overpass.js';
import { SITES_CACHE_TTL } from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import type { SiteEntity } from '../types.js';

/** Zod schema for /api/sites query params */
const sitesQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Redis key for all cached infrastructure sites */
const SITES_KEY = 'sites:v2';

/** Logical TTL in ms -- 24 hours for static site data */
const LOGICAL_TTL_MS = SITES_CACHE_TTL;

/** Hard Redis TTL in seconds -- 3 days fallback window */
const REDIS_TTL_SEC = 259_200;

export const sitesRouter = Router();

sitesRouter.get('/', validateQuery(sitesQuerySchema), async (_req, res) => {
  const { refresh: forceRefresh } = res.locals.validatedQuery as z.infer<typeof sitesQuerySchema>;
  const cached = await cacheGetSafe<SiteEntity[]>(SITES_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale && !forceRefresh) {
    return res.json(cached);
  }

  try {
    const sites = await fetchSites();
    await cacheSetSafe(SITES_KEY, sites, REDIS_TTL_SEC);
    res.json({ data: sites, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'Overpass error');
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw new AppError(502, 'UPSTREAM_FAIL', `overpass fetch failed: ${(err as Error).message}`);
    }
  }
});
