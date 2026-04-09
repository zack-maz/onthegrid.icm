import { Router } from 'express';
import { redis, cacheGetSafe } from '../cache/redis.js';

export const healthRouter = Router();

/** Cache keys for per-source freshness checks */
const SOURCE_KEYS: Record<string, string> = {
  flights: 'flights:adsblol',
  ships: 'ships:ais',
  events: 'events:gdelt',
  news: 'news:gdelt',
  markets: 'markets:yahoo:1d',
  weather: 'weather:open-meteo',
  sites: 'sites:v2',
  water: 'water:facilities',
};

/**
 * Estimated daily Redis commands based on known polling intervals:
 * flights ~2880/day, ships ~2880, events ~96, news ~96,
 * markets ~1440, weather ~48, sites ~1, sources ~100
 * Each operation = ~2 commands (get + set) = ~15,282/day
 */
const ESTIMATED_DAILY_COMMANDS = 15_282;

healthRouter.get('/', async (_req, res) => {
  let redisOk = false;
  let latencyMs = 0;

  // Ping Redis
  const start = Date.now();
  try {
    await redis.ping();
    redisOk = true;
    latencyMs = Date.now() - start;
  } catch {
    latencyMs = Date.now() - start;
  }

  // Query per-source freshness (use huge TTL to avoid marking stale)
  const sources: Record<string, number | null> = {};
  await Promise.all(
    Object.entries(SOURCE_KEYS).map(async ([name, key]) => {
      try {
        const entry = await cacheGetSafe(key, 999_999_999);
        sources[name] = entry?.lastFresh ?? null;
      } catch {
        sources[name] = null;
      }
    }),
  );

  res.json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    latencyMs,
    sources,
    estimatedDailyCommands: ESTIMATED_DAILY_COMMANDS,
  });
});
