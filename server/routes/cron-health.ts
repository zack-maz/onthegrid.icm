import { Router } from 'express';
import { redis, cacheGetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config.js';
import { runEval } from '../lib/llmEvalHarness.js';

const log = logger.child({ module: 'cron-health' });

export const cronHealthRouter = Router();

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

/** If a source's lastFresh is older than this, log a warning */
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

cronHealthRouter.get('/', async (req, res) => {
  // Phase 27.4.6 D-09 — auth gate added when CRON_SECRET is set. Empty env
  // preserves the existing un-authed dev behavior (matches cron-warm +
  // the original cron-health surface). Mirrors eval-cron.ts:33-40.
  if (env.CRON_SECRET) {
    const auth = req.header('Authorization') ?? req.header('authorization') ?? '';
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (auth !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  const now = Date.now();
  let redisOk = false;

  // Ping Redis
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    log.error('Redis ping failed');
  }

  // Query per-source freshness
  const sources: Record<string, { lastFresh: number | null; stale: boolean }> = {};
  const warnings: string[] = [];

  await Promise.all(
    Object.entries(SOURCE_KEYS).map(async ([name, key]) => {
      try {
        const entry = await cacheGetSafe(key, 999_999_999);
        const lastFresh = entry?.lastFresh ?? null;
        const stale = lastFresh !== null && now - lastFresh > STALE_THRESHOLD_MS;

        sources[name] = { lastFresh, stale };

        if (stale) {
          const ageMin = Math.round((now - lastFresh!) / 60_000);
          warnings.push(`${name}: stale (${ageMin}min old)`);
        } else if (lastFresh === null) {
          warnings.push(`${name}: no data`);
        }
      } catch {
        sources[name] = { lastFresh: null, stale: false };
        warnings.push(`${name}: fetch error`);
      }
    }),
  );

  // Log results
  if (warnings.length > 0) {
    log.warn({ warningCount: warnings.length, warnings }, 'source health warnings');
  } else {
    log.info('all sources healthy');
  }

  // Phase 27.4.6 D-09 — fold eval-drift into cron-health. Replaces the
  // dropped /api/cron/eval schedule (route file is preserved for manual
  // ops). Eval runs on cron-health's daily 0 0 * * * tick — decoupled from
  // refresh-events extraction success (D-08 NIM-throttle resilience). Wrap
  // in try/catch so an eval failure never degrades the health response.
  let evalScore: {
    within5km: number;
    within20km: number;
    within100km: number;
    total: number;
  } | null = null;
  let evalError: string | null = null;
  try {
    evalScore = await runEval();
    log.info({ evalScore }, 'eval drift check complete');
  } catch (err) {
    evalError = err instanceof Error ? err.message : String(err);
    log.warn({ err: evalError }, 'eval drift check threw — continuing health response');
  }

  res.json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk,
    timestamp: new Date().toISOString(),
    sources,
    warnings,
    evalScore,
    evalError,
  });
});
