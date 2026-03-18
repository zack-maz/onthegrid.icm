import { Router } from 'express';
import { fetchEvents } from '../adapters/gdelt.js';
import type { ConflictEventEntity } from '../types.js';

const EVENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Accumulated events map, keyed by entity ID */
const eventMap = new Map<string, ConflictEventEntity>();

/** Merge new events into accumulator and prune old ones */
function mergeEvents(incoming: ConflictEventEntity[]): ConflictEventEntity[] {
  for (const event of incoming) {
    eventMap.set(event.id, event);
  }
  const cutoff = Date.now() - EVENT_WINDOW_MS;
  for (const [id, event] of eventMap) {
    if (event.timestamp < cutoff) {
      eventMap.delete(id);
    }
  }
  return Array.from(eventMap.values());
}

export const eventsRouter = Router();

eventsRouter.get('/', async (_req, res) => {
  try {
    const fresh = await fetchEvents();
    const all = mergeEvents(fresh);
    res.json({ data: all, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[events] upstream error:', (err as Error).message);
    if (eventMap.size > 0) {
      // Prune stale entries even on error
      const cutoff = Date.now() - EVENT_WINDOW_MS;
      for (const [id, event] of eventMap) {
        if (event.timestamp < cutoff) eventMap.delete(id);
      }
      res.json({ data: Array.from(eventMap.values()), stale: true, lastFresh: Date.now() });
    } else {
      throw err;
    }
  }
});
