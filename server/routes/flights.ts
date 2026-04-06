import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'flights' });
import { fetchFlights as fetchOpenSky } from '../adapters/opensky.js';
import { fetchFlights as fetchAdsbLol } from '../adapters/adsb-lol.js';
import { IRAN_BBOX, CACHE_TTL } from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import { RateLimitError } from '../types.js';
import type { FlightEntity, FlightSource } from '../types.js';

/** Zod schema for /api/flights query params */
const flightsQuerySchema = z.object({
  source: z.enum(['opensky', 'adsblol']).default('adsblol'),
});

/** Redis key per flight source */
const CACHE_KEYS: Record<FlightSource, string> = {
  opensky: 'flights:opensky',
  adsblol: 'flights:adsblol',
};

/** Logical TTL (ms) -- used to compute staleness */
const LOGICAL_TTLS: Record<FlightSource, number> = {
  opensky: CACHE_TTL.flights,
  adsblol: CACHE_TTL.adsblolFlights,
};

function getFetcher(source: FlightSource): () => Promise<FlightEntity[]> {
  switch (source) {
    case 'opensky': return () => fetchOpenSky(IRAN_BBOX);
    case 'adsblol': return fetchAdsbLol;
  }
}

export const flightsRouter = Router();

flightsRouter.get('/', validateQuery(flightsQuerySchema), async (_req, res) => {
  const { source } = res.locals.validatedQuery as z.infer<typeof flightsQuerySchema>;
  const cacheKey = CACHE_KEYS[source];
  const logicalTtl = LOGICAL_TTLS[source];
  const redisTtl = Math.ceil((logicalTtl * 10) / 1000); // 10x multiplier, ms → seconds

  // Credential checks for sources that require API keys
  if (source === 'opensky' && !(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET)) {
    return res.status(503).json({ error: 'OpenSky credentials not configured' });
  }

  // Check cache first -- avoid unnecessary upstream calls (API credit conservation)
  const cached = await cacheGetSafe<FlightEntity[]>(cacheKey, logicalTtl);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    const flights = await getFetcher(source)();

    await cacheSetSafe(cacheKey, flights, redisTtl);
    res.json({ data: flights, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err, source }, 'upstream error');

    // Distinguish rate limit errors from generic errors
    if (err instanceof RateLimitError) {
      if (cached) {
        return res.json({ ...cached, rateLimited: true });
      }
      return res.status(429).json({ error: 'Rate limited', rateLimited: true });
    }

    if (cached) {
      res.json(cached); // Serve stale cache on error
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
