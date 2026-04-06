import { Router } from 'express';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { log } from '../lib/logger.js';
import { fetchMarkets, isValidRange } from '../adapters/yahoo-finance.js';
import { MARKETS_CACHE_TTL, MARKETS_REDIS_TTL_SEC } from '../config.js';
import type { MarketQuote } from '../types.js';

export const marketsRouter = Router();

marketsRouter.get('/', async (req, res) => {
  const rangeParam = typeof req.query.range === 'string' ? req.query.range : '1d';
  const range = isValidRange(rangeParam) ? rangeParam : '1d';

  const cacheKey = `markets:yahoo:${range}`;

  // 1. Check cache first
  const cached = await cacheGetSafe<MarketQuote[]>(cacheKey, MARKETS_CACHE_TTL);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    // 2. Fetch fresh data from Yahoo Finance
    const quotes = await fetchMarkets(range);

    if (quotes.length > 0) {
      // 3. Cache the fresh data
      await cacheSetSafe(cacheKey, quotes, MARKETS_REDIS_TTL_SEC);

      log({ level: 'info', message: `[markets] fetched ${quotes.length}/${5} tickers (${range}): ${quotes.map((q) => q.symbol).join(', ')}` });

      // 4. Return fresh response
      res.json({ data: quotes, stale: false, lastFresh: Date.now() });
    } else if (cached) {
      // All tickers failed but we have stale cache
      log({ level: 'warn', message: '[markets] all tickers failed, serving stale cache' });
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      // No data at all
      log({ level: 'error', message: '[markets] all tickers failed with no cache available' });
      res.status(502).json({ error: 'No market data available' });
    }
  } catch (err) {
    log({ level: 'error', message: `[markets] upstream error: ${(err as Error).message}` });

    // Fall back to stale cache if available
    if (cached) {
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      throw err; // Express catches and forwards to errorHandler
    }
  }
});
