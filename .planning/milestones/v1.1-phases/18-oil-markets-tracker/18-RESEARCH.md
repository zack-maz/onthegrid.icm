# Phase 18: Oil Markets Tracker - Research

**Researched:** 2026-03-21
**Domain:** Financial market data integration (Yahoo Finance API), SVG charting, polling infrastructure
**Confidence:** HIGH

## Summary

Phase 18 adds an oil markets overlay panel showing real-time prices for Brent Crude (BZ=F), WTI Crude (CL=F), XLE, USO, and XOM. The technical challenge is modest: a new server adapter fetches Yahoo Finance v8 chart data, a Redis-cached route serves it, a Zustand store holds the state, a polling hook refreshes every 5 minutes, and an OverlayPanel renders inline SVG sparklines and expanded charts.

All infrastructure patterns already exist in the codebase. The server adapter follows the same raw `fetch` pattern used by every other adapter (adsb-exchange, gdelt-doc, rss, etc.). The cache-first route mirrors ships/events/news. The polling hook mirrors useFlightPolling/useShipPolling. The delta animation reuses the existing `animate-delta` CSS keyframes. No new dependencies are needed.

**Primary recommendation:** Use raw `fetch` to Yahoo Finance v8 chart API (no `yahoo-finance2` package), pure SVG for all charting (no charting library), and replicate existing adapter/route/store/hook patterns exactly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Top-right position, below the NotificationBell icon
- OverlayPanel wrapper matching existing pattern (rounded, border, backdrop-blur)
- Expanded by default on load, collapse state persisted to localStorage
- Each instrument as single row: ticker (left) + price + change delta + inline sparkline (right)
- Clicking row expands inline 5-day chart below (accordion, one at a time)
- Inline SVG sparkline (~60x16px), single polyline, no axis labels, no charting library
- Expanded SVG line chart with Y-axis price labels and X-axis day labels (Mon-Fri), shaded area
- Green/red color coding: green if today > yesterday's close, red if lower
- Global $/% toggle in panel header, default dollar change, persisted to localStorage
- Flat list: Brent, WTI, XLE, USO, XOM (commodities first, then ETFs, then stock)
- Yahoo Finance v8 chart API (unofficial) via server proxy
- 5-minute polling interval (recursive setTimeout)
- Redis cache with 5-min TTL, cache key `markets:yahoo`
- Cache-first route pattern
- Market closed: "MARKET CLOSED" label, no delta shown, show last available prices
- Graceful degradation: orange stale dot, "No data" per row
- Panel header: "MARKETS" label + [$/%] toggle + [-/+] collapse
- Delta animation reuses exact `animate-delta` CSS keyframes (3s fade)
- ConnectionStatus dot in panel header matches StatusPanel pattern

### Claude's Discretion
- Yahoo Finance API query parameters and response parsing
- Market hours detection logic (server-side vs client-side)
- Expanded chart SVG dimensions and scaling algorithm
- Exact positioning offset from NotificationBell
- Animation/transition for inline chart expand/collapse
- Tab visibility awareness for polling (reuse existing pattern)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MRKT-01 | User can see oil market prices (Brent Crude, WTI Crude, XLE, USO, XOM) in a collapsible overlay panel | Yahoo Finance v8 chart API provides `regularMarketPrice`, `previousClose` in meta; OverlayPanel + collapse pattern exists; 5 tickers confirmed on Yahoo Finance |
| MRKT-02 | User can see 5-day sparkline trend chart per instrument with color-coded direction (green up, red down) | Chart API with `range=5d&interval=1d` returns timestamp + close arrays; pure SVG polyline; green/red from comparing latest close to previousClose |
| MRKT-03 | User sees green delta animations on price changes matching the existing counter animation pattern | `animate-delta` keyframes + CounterRow prevRef pattern already exist; adapt for price values with formatting |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Raw `fetch` | Node built-in | Yahoo Finance API calls | Consistent with all existing adapters (adsb-exchange, gdelt-doc, rss, etc.); avoids adding dependency |
| `@upstash/redis` | ^1.37.0 | Cache market data | Already installed; `cacheGet`/`cacheSet` pattern in `server/cache/redis.ts` |
| `zustand` | ^5.0.11 | Client-side market state | Already installed; curried `create<T>()()` pattern |
| `express` Router | ^5.2.1 | `/api/markets` route | Already installed; matches all existing route patterns |
| Pure SVG | N/A | Sparklines + expanded charts | Locked decision: no charting library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | - | - | All dependencies already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch` | `yahoo-finance2` npm | Adds ~200KB dependency, handles cookie/crumb rotation; but project consistently uses raw fetch, and we only need the chart endpoint |
| Pure SVG | `recharts` / `visx` | Overkill for sparklines + one line chart; adds bundle weight; SVG path is ~20 lines of code |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  adapters/yahoo-finance.ts    # Fetch + normalize Yahoo v8 chart data
  routes/markets.ts            # Cache-first /api/markets route
  constants.ts                 # Add MARKETS_CACHE_TTL, MARKETS_REDIS_TTL_SEC
  types.ts                     # Add MarketQuote, MarketSnapshot types
src/
  stores/marketStore.ts        # Zustand store with ConnectionStatus
  hooks/useMarketPolling.ts    # 5-min recursive setTimeout
  components/
    layout/MarketsSlot.tsx     # Top-right panel container + collapse logic
    markets/MarketRow.tsx      # Single instrument row (ticker + price + delta + sparkline)
    markets/Sparkline.tsx      # Inline SVG sparkline (~60x16px)
    markets/ExpandedChart.tsx  # SVG line chart with axes + shaded area
```

### Pattern 1: Yahoo Finance v8 Chart API Adapter
**What:** Server-side adapter fetching 5-day daily chart data for all 5 instruments in parallel
**When to use:** Every cache miss on `/api/markets`

The Yahoo Finance v8 chart API endpoint:
```
GET https://query2.finance.yahoo.com/v8/finance/chart/{TICKER}?range=5d&interval=1d&includePrePost=false
```

**Response structure (verified from multiple sources):**
```typescript
interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        currency: string;
        regularMarketPrice: number;    // Current/last price
        previousClose: number;          // Yesterday's close
        regularMarketTime: number;      // Unix timestamp of last trade
        currentTradingPeriod: {
          pre: { start: number; end: number; timezone: string };
          regular: { start: number; end: number; timezone: string };
          post: { start: number; end: number; timezone: string };
        };
        exchangeName: string;
      };
      timestamp: number[];              // Daily timestamps
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error: null | { code: string; description: string };
  };
}
```

**Ticker symbols (confirmed on Yahoo Finance):**
| Display Name | Yahoo Ticker | Type | Exchange |
|-------------|-------------|------|----------|
| Brent Crude | `BZ=F` | Commodity future | NYMEX |
| WTI Crude | `CL=F` | Commodity future | NYMEX |
| XLE | `XLE` | ETF (Energy Select Sector) | NYSE |
| USO | `USO` | ETF (US Oil Fund) | NYSE |
| XOM | `XOM` | Stock (Exxon Mobil) | NYSE |

**Key implementation detail:** Fetch all 5 tickers in parallel with `Promise.allSettled`, normalize each result independently. A single failed ticker should not block the others.

### Pattern 2: Normalized Market Data Shape
**What:** Flatten Yahoo response into a clean typed object for frontend consumption

```typescript
// server/types.ts additions
interface MarketQuote {
  symbol: string;           // "BZ=F", "CL=F", "XLE", "USO", "XOM"
  displayName: string;      // "Brent", "WTI", "XLE", "USO", "XOM"
  price: number;            // regularMarketPrice
  previousClose: number;    // For delta calculation
  change: number;           // price - previousClose
  changePercent: number;    // ((price - previousClose) / previousClose) * 100
  currency: string;         // "USD"
  marketOpen: boolean;      // Derived from currentTradingPeriod
  lastTradeTime: number;    // regularMarketTime (Unix seconds -> ms)
  history: {                // 5-day daily data
    timestamps: number[];   // Unix ms
    closes: number[];       // Daily close prices
    highs: number[];        // Daily high prices
    lows: number[];         // Daily low prices
  };
}

interface MarketSnapshot {
  quotes: MarketQuote[];
  fetchedAt: number;        // Unix ms
}
```

### Pattern 3: Market Hours Detection (Server-Side)
**What:** Derive `marketOpen` from `currentTradingPeriod.regular` in the Yahoo response
**When to use:** Each fetch cycle, set once per response

```typescript
function isMarketOpen(meta: YahooMeta): boolean {
  const now = Math.floor(Date.now() / 1000); // Unix seconds
  const { start, end } = meta.currentTradingPeriod.regular;
  return now >= start && now <= end;
}
```

**Recommendation:** Server-side detection using Yahoo's own trading period data. This avoids client-side timezone logic and leverages Yahoo's authoritative market schedule (includes holidays). The `marketOpen` boolean is included in the cached response so all clients see the same value.

### Pattern 4: Polling Hook (Reuse useFlightPolling Pattern)
**What:** Recursive setTimeout with tab visibility awareness
**When to use:** 5-minute interval, same lifecycle pattern

```typescript
// Same structure as useFlightPolling:
// - useEffect with cancelled flag
// - fetchMarkets -> schedulePoll loop
// - handleVisibilityChange (pause on hidden, immediate fetch on visible)
// - cleanup: cancelled = true, clearTimeout, removeEventListener
```

### Pattern 5: Pure SVG Sparkline
**What:** Inline SVG polyline from close price array
**When to use:** Each MarketRow

```typescript
// Generate SVG path from closes array
function buildSparklinePath(closes: number[], width: number, height: number): string {
  if (closes.length < 2) return '';
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1; // Avoid division by zero
  const step = width / (closes.length - 1);

  return closes
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
```

### Anti-Patterns to Avoid
- **Fetching on the client side:** Yahoo Finance blocks CORS. All requests MUST go through the server proxy.
- **Using `setInterval`:** Project uses recursive `setTimeout` everywhere to prevent overlapping async fetches.
- **Adding a charting library:** Decision is locked: pure SVG for both sparklines and expanded charts.
- **Merging market data across polls:** Unlike ships, market data is a full snapshot replacement each time (no merge-by-ID needed).
- **Using `yahoo-finance2` package:** Adds unnecessary dependency. The project pattern is raw `fetch` + manual normalization in adapters.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delta animation | Custom animation logic | Existing `animate-delta` CSS class + CounterRow prevRef pattern | Already battle-tested, 3s fade, key-based reset |
| Connection health dot | Custom status rendering | StatusPanel's `STATUS_DOT_CLASS` pattern | Green/orange/red/loading states already mapped |
| Panel collapse | Custom accordion | OverlayPanel + localStorage pattern from CountersSlot/LayerTogglesSlot | Consistent UX, persistence already works |
| Polling lifecycle | Custom polling | useFlightPolling pattern (setTimeout + visibilitychange) | Tab-aware, cancellation-safe, proven |
| Cache-first route | Custom caching | `cacheGet`/`cacheSet` from `server/cache/redis.ts` | CacheResponse<T> shape already consumed by frontend |
| Number formatting | Custom formatters | `Intl.NumberFormat` (already used in CounterRow) | Locale-aware, handles edge cases |

**Key insight:** This phase introduces zero new patterns. Every server + client component has a direct analog in the existing codebase. The risk is deviation from established patterns, not technical difficulty.

## Common Pitfalls

### Pitfall 1: Yahoo Finance CORS / Cookie Blocking
**What goes wrong:** Direct browser requests to Yahoo Finance are blocked by CORS and cookie requirements.
**Why it happens:** Yahoo Finance has no official API; the v8 endpoint requires server-side access.
**How to avoid:** All requests go through Express server adapter. Include `User-Agent` header to avoid bot detection.
**Warning signs:** 403 or empty responses from Yahoo.

### Pitfall 2: Yahoo Finance Rate Limiting / IP Blocking
**What goes wrong:** Too-frequent requests from the same IP get 429 or silently blocked.
**Why it happens:** Yahoo enforces undocumented rate limits per IP.
**How to avoid:** 5-min polling interval + Redis cache means ~1 upstream request per 5 minutes (for all 5 tickers). This is very conservative. Use `Promise.allSettled` so one blocked ticker doesn't fail the batch.
**Warning signs:** Intermittent 429 responses, empty data arrays.

### Pitfall 3: Futures vs Stock Ticker Behavior
**What goes wrong:** Commodity futures (BZ=F, CL=F) trade nearly 24 hours on NYMEX, while stocks/ETFs (XLE, USO, XOM) trade 9:30-16:00 ET.
**Why it happens:** Different exchanges have different trading hours.
**How to avoid:** Use `currentTradingPeriod.regular` from each ticker's individual response to determine market-open status. Don't assume all 5 share the same schedule. The `marketOpen` flag is per-quote, not global.
**Warning signs:** "MARKET CLOSED" showing for commodities during extended hours.

### Pitfall 4: Null Values in History Arrays
**What goes wrong:** Yahoo sometimes returns `null` for close/high/low on specific days (e.g., holidays, partial data).
**Why it happens:** Trading halts, missing data in Yahoo's backend.
**How to avoid:** Filter nulls from history arrays before rendering sparklines. Use `closes.filter((v): v is number => v !== null)`.
**Warning signs:** SVG path renders NaN coordinates, sparkline disappears.

### Pitfall 5: Weekend / Holiday Data Gaps
**What goes wrong:** `range=5d` returns 5 calendar days, but weekends have no trading data. The result may have fewer than 5 data points.
**Why it happens:** Yahoo returns only trading days in the history arrays.
**How to avoid:** Design sparkline and chart to work with 1-5 data points. Don't hardcode "5 points" assumption. Handle gracefully when only 1-2 points exist (straight line or no sparkline).
**Warning signs:** Sparkline renders a single dot or crashes on empty array.

### Pitfall 6: Price Formatting Differences
**What goes wrong:** Oil prices (e.g., $67.42) need 2 decimal places. Stock prices also 2 decimals. Percentage changes need 2 decimals with sign.
**Why it happens:** Different formatting requirements for dollar vs percent mode.
**How to avoid:** Use `Intl.NumberFormat` with `{ minimumFractionDigits: 2, maximumFractionDigits: 2 }` for prices. Prefix with +/- for changes.
**Warning signs:** Prices showing too many or too few decimal places.

## Code Examples

### Yahoo Finance Adapter (server/adapters/yahoo-finance.ts)
```typescript
// Source: Yahoo Finance v8 chart API (unofficial, verified via multiple sources)

const YAHOO_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart';
const TICKERS = ['BZ=F', 'CL=F', 'XLE', 'USO', 'XOM'] as const;
const DISPLAY_NAMES: Record<string, string> = {
  'BZ=F': 'Brent',
  'CL=F': 'WTI',
  'XLE': 'XLE',
  'USO': 'USO',
  'XOM': 'XOM',
};

async function fetchTicker(symbol: string): Promise<MarketQuote | null> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return null;

  const json = await res.json() as YahooChartResponse;
  const result = json.chart?.result?.[0];
  if (!result) return null;

  const { meta } = result;
  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp ?? [];
  const closes = (quote?.close ?? []).filter((v): v is number => v !== null);
  const highs = (quote?.high ?? []).filter((v): v is number => v !== null);
  const lows = (quote?.low ?? []).filter((v): v is number => v !== null);

  const now = Math.floor(Date.now() / 1000);
  const { start, end } = meta.currentTradingPeriod.regular;

  return {
    symbol,
    displayName: DISPLAY_NAMES[symbol] ?? symbol,
    price: meta.regularMarketPrice,
    previousClose: meta.previousClose ?? meta.chartPreviousClose,
    change: meta.regularMarketPrice - (meta.previousClose ?? meta.chartPreviousClose),
    changePercent:
      ((meta.regularMarketPrice - (meta.previousClose ?? meta.chartPreviousClose)) /
        (meta.previousClose ?? meta.chartPreviousClose)) * 100,
    currency: meta.currency ?? 'USD',
    marketOpen: now >= start && now <= end,
    lastTradeTime: meta.regularMarketTime * 1000,
    history: {
      timestamps: timestamps.map((t) => t * 1000),
      closes,
      highs,
      lows,
    },
  };
}

export async function fetchMarkets(): Promise<MarketQuote[]> {
  const results = await Promise.allSettled(
    TICKERS.map((t) => fetchTicker(t)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<MarketQuote | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((q): q is MarketQuote => q !== null);
}
```

### Cache-First Route (server/routes/markets.ts)
```typescript
// Source: Follows exact pattern of server/routes/ships.ts and server/routes/news.ts
import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { fetchMarkets } from '../adapters/yahoo-finance.js';
import type { MarketQuote } from '../types.js';

export const marketsRouter = Router();

const MARKETS_KEY = 'markets:yahoo';
const LOGICAL_TTL_MS = 300_000;    // 5 min -- same as client polling
const REDIS_TTL_SEC = 3_000;       // 50 min -- 10x logical TTL

marketsRouter.get('/', async (_req, res) => {
  const cached = await cacheGet<MarketQuote[]>(MARKETS_KEY, LOGICAL_TTL_MS);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    const quotes = await fetchMarkets();
    await cacheSet(MARKETS_KEY, quotes, REDIS_TTL_SEC);
    res.json({ data: quotes, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[markets] upstream error:', (err as Error).message);
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      res.status(500).json({ error: 'Market data unavailable' });
    }
  }
});
```

### Market Store (src/stores/marketStore.ts)
```typescript
// Source: Follows exact pattern of src/stores/eventStore.ts
import { create } from 'zustand';
import type { CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface MarketState {
  quotes: MarketQuote[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  setMarketData: (response: CacheResponse<MarketQuote[]>) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useMarketStore = create<MarketState>()((set) => ({
  quotes: [],
  connectionStatus: 'loading',
  lastFetchAt: null,

  setMarketData: (response) =>
    set({
      quotes: response.data,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
    }),

  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
}));
```

### Sparkline Component (src/components/markets/Sparkline.tsx)
```typescript
// Pure SVG sparkline -- no charting library
interface SparklineProps {
  closes: number[];
  previousClose: number;
  width?: number;
  height?: number;
}

export function Sparkline({ closes, previousClose, width = 60, height = 16 }: SparklineProps) {
  if (closes.length < 2) return null;

  const lastClose = closes[closes.length - 1];
  const color = lastClose >= previousClose ? 'var(--color-accent-green)' : 'var(--color-accent-red)';

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step = width / (closes.length - 1);

  const path = closes
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1; // 1px padding
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Yahoo Finance v7 API | Yahoo Finance v8 chart API | ~2023 | v7 deprecated; v8 is current |
| `yahoo-finance` npm (v1) | `yahoo-finance2` npm (v2) or raw fetch | 2021 | v1 abandoned; v2 handles cookie rotation but adds weight |
| Charting libraries for simple viz | Pure SVG / Canvas | Always | Sparklines are 10-20 lines of SVG path code; library is overkill |
| Server-side timezone logic for market hours | Yahoo `currentTradingPeriod` field | Available in v8 | Yahoo provides authoritative schedule including holidays |

**Deprecated/outdated:**
- Yahoo Finance v7 endpoints: replaced by v8
- Yahoo Finance official API: never existed; all access is unofficial
- `yahoo-finance` npm v1: abandoned, use v2 or raw fetch

## Open Questions

1. **Yahoo Finance Cookie/Crumb Rotation**
   - What we know: Yahoo sometimes requires a crumb token for API access, obtained via a consent cookie flow. The `yahoo-finance2` library handles this automatically.
   - What's unclear: Whether the v8 chart endpoint currently requires crumb authentication for server-side requests with User-Agent header. Reports are inconsistent.
   - Recommendation: Start with raw fetch + User-Agent header. If we hit 401/403 consistently, consider adding the cookie/crumb flow or falling back to `yahoo-finance2`. Build the adapter with a clear interface so the implementation can be swapped.

2. **Yahoo Finance Uptime/Reliability**
   - What we know: Yahoo Finance is unofficial and has had outages. The project REQUIREMENTS.md lists "Paid market data APIs" as out of scope.
   - What's unclear: Current reliability level in March 2026.
   - Recommendation: Graceful degradation is already a locked decision. Stale cache + orange dot handles this. Redis TTL of 50 minutes means cached data survives moderate outages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run server/__tests__/routes/markets.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MRKT-01 | /api/markets returns prices for 5 instruments | integration | `npx vitest run server/__tests__/routes/markets.test.ts -x` | Wave 0 |
| MRKT-01 | Market store handles CacheResponse correctly | unit | `npx vitest run src/__tests__/stores/marketStore.test.ts -x` | Wave 0 |
| MRKT-01 | Yahoo adapter normalizes response | unit | `npx vitest run server/__tests__/adapters/yahoo-finance.test.ts -x` | Wave 0 |
| MRKT-02 | Sparkline renders SVG path from closes array | unit | `npx vitest run src/__tests__/components/markets/Sparkline.test.tsx -x` | Wave 0 |
| MRKT-02 | Sparkline color is green when up, red when down | unit | `npx vitest run src/__tests__/components/markets/Sparkline.test.tsx -x` | Wave 0 |
| MRKT-03 | Price delta animation matches CounterRow pattern | unit | `npx vitest run src/__tests__/components/markets/MarketRow.test.tsx -x` | Wave 0 |
| MRKT-01 | Cache-first route returns cached data on hit | integration | `npx vitest run server/__tests__/routes/markets.test.ts -x` | Wave 0 |
| MRKT-01 | Route falls back to stale cache on upstream error | integration | `npx vitest run server/__tests__/routes/markets.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run server/__tests__/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/adapters/yahoo-finance.test.ts` -- covers MRKT-01 (adapter normalization)
- [ ] `server/__tests__/routes/markets.test.ts` -- covers MRKT-01 (cache-first route, all test cases from ships.test.ts pattern)
- [ ] `src/__tests__/components/markets/Sparkline.test.tsx` -- covers MRKT-02 (SVG path generation, color coding)
- [ ] `src/__tests__/components/markets/MarketRow.test.tsx` -- covers MRKT-03 (delta animation)

## Sources

### Primary (HIGH confidence)
- Yahoo Finance v8 chart API endpoint structure -- verified via [Scrapfly guide](https://scrapfly.io/blog/posts/guide-to-yahoo-finance-api), [GitHub gist](https://gist.github.com/daverich204/a9351caa678a96dd5eaccf048942890a), and [yahoo-finance2 JSR docs](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/chart)
- Yahoo Finance ticker symbols BZ=F, CL=F confirmed via [Yahoo Finance BZ=F](https://finance.yahoo.com/quote/BZ=F/), [Yahoo Finance CL=F](https://finance.yahoo.com/quote/CL=F/)
- Response structure (meta.regularMarketPrice, meta.previousClose, meta.currentTradingPeriod, indicators.quote) -- cross-verified across 3+ sources
- Existing codebase patterns -- direct code inspection of server/routes/ships.ts, server/adapters/adsb-exchange.ts, src/stores/eventStore.ts, src/hooks/useFlightPolling.ts, src/components/counters/CounterRow.tsx

### Secondary (MEDIUM confidence)
- CORS blocking requires server proxy -- verified via [npm yahoo-finance2](https://www.npmjs.com/package/yahoo-finance2) and [DigitalPoint forum](https://forums.digitalpoint.com/threads/cors-problem-yahoo-finance-api.2868661/)
- Rate limiting behavior -- verified via [yfinance GitHub issue](https://github.com/ranaroussi/yfinance/issues/2518) and [Medium article](https://medium.com/@trading.dude/why-yfinance-keeps-getting-blocked-and-what-to-use-instead-92d84bb2cc01)
- currentTradingPeriod for market hours detection -- verified via [AlgoTrading101](https://algotrading101.com/learn/yahoo-finance-api-guide/) and [MarketCalls](https://www.marketcalls.in/intraday/exploring-yahoo-finance-realtime-quotes-and-historical-data-feed-api.html)

### Tertiary (LOW confidence)
- Cookie/crumb requirements: inconsistent reports; may or may not be needed for v8 chart endpoint from server-side. Flagged for validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns copied from existing code
- Architecture: HIGH - direct analogs for every component (adapter, route, store, hook, panel)
- Pitfalls: HIGH - CORS, rate limiting, null values all well-documented in community
- Yahoo Finance API specifics: MEDIUM - unofficial API, response structure verified across multiple sources but can change without notice
- Cookie/crumb requirements: LOW - reports conflict; needs runtime validation

**Research date:** 2026-03-21
**Valid until:** 2026-04-07 (14 days -- Yahoo Finance API is unofficial and can change)
