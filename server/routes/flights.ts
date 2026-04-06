import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchFlights as fetchOpenSky } from '../adapters/opensky.js';
import { fetchFlights as fetchAdsbLol } from '../adapters/adsb-lol.js';
import { IRAN_BBOX, CACHE_TTL } from '../config.js';
import { RateLimitError } from '../types.js';
import type { FlightEntity, FlightSource } from '../types.js';

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

function parseSource(raw: unknown): FlightSource {
  if (raw === 'opensky') return 'opensky';
  if (raw === 'adsblol') return 'adsblol';
  return 'adsblol';
}

function getFetcher(source: FlightSource): () => Promise<FlightEntity[]> {
  switch (source) {
    case 'opensky': return () => fetchOpenSky(IRAN_BBOX);
    case 'adsblol': return fetchAdsbLol;
  }
}

export const flightsRouter = Router();

flightsRouter.get('/', async (req, res) => {
  const source = parseSource(req.query.source);
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
    log({ level: 'error', message: `[flights:${source}] upstream error: ${(err as Error).message}` });

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
