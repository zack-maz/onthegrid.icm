import { Router } from 'express';
import { EntityCache } from '../cache/entityCache.js';
import { fetchFlights as fetchOpenSky } from '../adapters/opensky.js';
import { fetchFlights as fetchAdsbExchange } from '../adapters/adsb-exchange.js';
import { IRAN_BBOX, CACHE_TTL } from '../constants.js';
import { RateLimitError } from '../types.js';
import type { FlightEntity, FlightSource } from '../types.js';

const openskyCache = new EntityCache<FlightEntity[]>(CACHE_TTL.flights);
const adsbCache = new EntityCache<FlightEntity[]>(CACHE_TTL.adsbFlights);

export const flightsRouter = Router();

flightsRouter.get('/', async (req, res) => {
  const source: FlightSource = req.query.source === 'adsb' ? 'adsb' : 'opensky';
  const cache = source === 'adsb' ? adsbCache : openskyCache;

  // For ADS-B source, check API key is configured
  if (source === 'adsb' && !process.env.ADSB_EXCHANGE_API_KEY) {
    return res.status(503).json({ error: 'ADS-B Exchange API key not configured' });
  }

  // Check cache first -- avoid unnecessary upstream calls (API credit conservation)
  const cached = cache.get();
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    const flights = source === 'adsb'
      ? await fetchAdsbExchange()
      : await fetchOpenSky(IRAN_BBOX);

    cache.set(flights);
    res.json({ data: flights, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error(`[flights:${source}] upstream error:`, (err as Error).message);

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
