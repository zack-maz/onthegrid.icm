import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { fetchMarkets } from '../adapters/yahoo-finance.js';
import { MARKETS_CACHE_TTL, MARKETS_REDIS_TTL_SEC } from '../constants.js';
import type { MarketQuote } from '../types.js';

/** Redis key for market data */
const MARKETS_KEY = 'markets:yahoo';

export const marketsRouter = Router();

marketsRouter.get('/', async (_req, res) => {
  // 1. Check cache first
  const cached = await cacheGet<MarketQuote[]>(MARKETS_KEY, MARKETS_CACHE_TTL);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    // 2. Fetch fresh data from Yahoo Finance
    const quotes = await fetchMarkets();

    if (quotes.length > 0) {
      // 3. Cache the fresh data
      await cacheSet(MARKETS_KEY, quotes, MARKETS_REDIS_TTL_SEC);

      console.log(
        `[markets] fetched ${quotes.length}/${5} tickers: ${quotes.map((q) => q.symbol).join(', ')}`,
      );

      // 4. Return fresh response
      res.json({ data: quotes, stale: false, lastFresh: Date.now() });
    } else if (cached) {
      // All tickers failed but we have stale cache
      console.warn('[markets] all tickers failed, serving stale cache');
      res.json({
        data: cached.data,
        stale: true,
        lastFresh: cached.lastFresh,
      });
    } else {
      // No data at all
      console.error('[markets] all tickers failed with no cache available');
      res.status(502).json({ error: 'No market data available' });
    }
  } catch (err) {
    console.error('[markets] upstream error:', (err as Error).message);

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
