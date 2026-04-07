import type { MarketQuote } from '../types.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'yahoo-finance' });

/** Tickers to fetch from Yahoo Finance v8 chart API */
export const TICKERS = ['BZ=F', 'CL=F', 'XLE', 'USO', 'XOM'] as const;

/** Human-readable display names for each ticker */
export const DISPLAY_NAMES: Record<string, string> = {
  'BZ=F': 'Brent',
  'CL=F': 'WTI',
  XLE: 'XLE',
  USO: 'USO',
  XOM: 'XOM',
};

/** Valid market timeframe ranges */
export type MarketRange = '1d' | '5d' | '1mo' | 'ytd';

/** Yahoo Finance range/interval mapping
 * 1d uses 5d range to ensure commodity futures (BZ=F, CL=F) have
 * enough data points on weekends/holidays when the 1d window is sparse.
 */
const RANGE_CONFIG: Record<MarketRange, { range: string; interval: string }> = {
  '1d': { range: '5d', interval: '2m' },
  '5d': { range: '5d', interval: '15m' },
  '1mo': { range: '1mo', interval: '30m' },
  ytd: { range: 'ytd', interval: '1d' },
};

/** Shape of the Yahoo Finance v8 chart API response */
interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency: string;
        currentTradingPeriod: {
          regular: {
            start: number; // Unix seconds
            end: number; // Unix seconds
          };
        };
        regularMarketTime: number; // Unix seconds
      };
      timestamp: number[]; // Unix seconds
      indicators: {
        quote: Array<{
          close: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
        }>;
      };
    }>;
    error: unknown;
  };
}

/**
 * Fetch a single ticker's chart data from Yahoo Finance v8 API.
 * Returns null on any failure (non-ok status, missing data, parse error).
 */
async function fetchTicker(symbol: string, range: MarketRange = '1d'): Promise<MarketQuote | null> {
  try {
    const cfg = RANGE_CONFIG[range];
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      log.warn({ symbol, status: resp.status }, 'HTTP error');
      return null;
    }

    const json = (await resp.json()) as YahooChartResponse;

    const result = json.chart?.result?.[0];
    if (!result) {
      log.warn({ symbol }, 'no chart result');
      return null;
    }

    const { meta, timestamp: rawTimestamps, indicators } = result;
    const quote = indicators?.quote?.[0];

    if (!meta || !rawTimestamps || !quote) {
      log.warn({ symbol }, 'missing meta/timestamps/quote');
      return null;
    }

    const price = meta.regularMarketPrice;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? price;

    // Determine if market is currently open
    const nowSec = Math.floor(Date.now() / 1000);
    const tradingPeriod = meta.currentTradingPeriod?.regular;
    const marketOpen = tradingPeriod
      ? nowSec >= tradingPeriod.start && nowSec <= tradingPeriod.end
      : false;

    // Filter null values from OHLC arrays and convert timestamps to ms
    const timestamps: number[] = [];
    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];

    for (let i = 0; i < rawTimestamps.length; i++) {
      const ts = rawTimestamps[i];
      const c = quote.close?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      // Only include entries where all four values are present
      if (ts != null && c != null && h != null && l != null) {
        timestamps.push(ts * 1000);
        closes.push(c);
        highs.push(h);
        lows.push(l);
      }
    }

    return {
      symbol,
      displayName: DISPLAY_NAMES[symbol] ?? symbol,
      price,
      previousClose,
      change: price - previousClose,
      changePercent: previousClose !== 0 ? ((price - previousClose) / previousClose) * 100 : 0,
      currency: meta.currency ?? 'USD',
      marketOpen,
      lastTradeTime: meta.regularMarketTime * 1000,
      history: { timestamps, closes, highs, lows },
    };
  } catch (err) {
    log.warn({ err, symbol }, 'fetch error');
    return null;
  }
}

/**
 * Fetch all tickers in parallel with per-ticker fault isolation.
 * Returns 0-5 MarketQuotes depending on individual ticker success.
 */
export async function fetchMarkets(range: MarketRange = '1d'): Promise<MarketQuote[]> {
  const results = await Promise.allSettled(TICKERS.map((t) => fetchTicker(t, range)));

  return results
    .filter((r): r is PromiseFulfilledResult<MarketQuote | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((q): q is MarketQuote => q !== null);
}
