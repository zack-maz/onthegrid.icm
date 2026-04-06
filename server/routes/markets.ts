import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'markets' });
import { fetchMarkets } from '../adapters/yahoo-finance.js';
import { MARKETS_CACHE_TTL, MARKETS_REDIS_TTL_SEC } from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import type { MarketQuote } from '../types.js';

/** Zod schema for /api/markets query params */
const marketsQuerySchema = z.object({
  range: z.enum(['1d', '5d', '1mo', 'ytd']).default('1d'),
});

export const marketsRouter = Router();

marketsRouter.get('/', validateQuery(marketsQuerySchema), async (_req, res) => {
  const { range } = res.locals.validatedQuery as z.infer<typeof marketsQuerySchema>;

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

      log.info({ count: quotes.length, total: 5, range, tickers: quotes.map((q) => q.symbol) }, 'fetched tickers');

      // 4. Return fresh response
      res.json({ data: quotes, stale: false, lastFresh: Date.now() });
    } else if (cached) {
      // All tickers failed but we have stale cache
      log.warn('all tickers failed, serving stale cache');
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      // No data at all
      log.error('all tickers failed with no cache available');
      res.status(502).json({ error: 'No market data available', code: 'UPSTREAM_ERROR', statusCode: 502 });
    }
  } catch (err) {
    log.error({ err }, 'upstream error');

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
