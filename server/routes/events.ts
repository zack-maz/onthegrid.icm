import { Router } from 'express';
import { EntityCache } from '../cache/entityCache.js';
import { fetchEvents } from '../adapters/acled.js';
import { CACHE_TTL } from '../constants.js';
import type { ConflictEventEntity } from '../types.js';

const eventsCache = new EntityCache<ConflictEventEntity[]>(CACHE_TTL.events);

export const eventsRouter = Router();

eventsRouter.get('/', async (_req, res) => {
  try {
    const events = await fetchEvents();
    eventsCache.set(events);
    res.json({ data: events, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[events] upstream error:', (err as Error).message);
    const cached = eventsCache.get();
    if (cached) {
      res.json(cached);
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
