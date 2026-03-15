import { Router } from 'express';
import { EntityCache } from '../cache/entityCache.js';
import { fetchFlights } from '../adapters/opensky.js';
import { IRAN_BBOX, CACHE_TTL } from '../constants.js';
import type { FlightEntity } from '../types.js';

const flightCache = new EntityCache<FlightEntity[]>(CACHE_TTL.flights);

export const flightsRouter = Router();

flightsRouter.get('/', async (_req, res) => {
  try {
    const flights = await fetchFlights(IRAN_BBOX);
    flightCache.set(flights);
    res.json({ data: flights, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[flights] upstream error:', (err as Error).message);
    const cached = flightCache.get();
    if (cached) {
      res.json(cached);
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
