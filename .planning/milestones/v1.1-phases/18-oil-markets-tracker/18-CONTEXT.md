# Phase 18: Oil Markets Tracker - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can monitor oil and energy market prices (Brent Crude, WTI Crude, XLE, USO, XOM) alongside conflict data in a collapsible overlay panel with sparkline trends, delta animations, and click-to-expand charts. Does NOT include configurable instruments (v1.2+), market-closed dimming (deferred to PLAT-02), or historical correlation analysis.

</domain>

<decisions>
## Implementation Decisions

### Panel placement & layout
- Top-right position, below the NotificationBell icon
- OverlayPanel wrapper matching existing pattern (rounded, border, backdrop-blur)
- Expanded by default on load — user collapses to reclaim map space
- Collapse state persisted to localStorage
- Each instrument rendered as a single row: ticker (left) + price + change delta + inline sparkline (right)

### Row interaction
- Clicking an instrument row expands an inline 5-day chart below the row, pushing other rows down
- Click again or X button to collapse the expanded chart
- Only one instrument expanded at a time (accordion behavior)

### Sparkline design
- Inline SVG path (~60x16px), single polyline, no axis labels
- Color based on latest day's change: green if today > yesterday's close, red if lower
- Both sparkline stroke AND delta text use the same directional color
- No charting library — pure SVG for inline sparklines

### Expanded chart
- SVG line chart with Y-axis price labels and X-axis day labels (Mon-Fri)
- Shaded area below line for high/low range
- Same green/red color coding as inline sparkline

### Change display format
- Global toggle button ($/%) in panel header switches all instruments between dollar change and percentage change
- Default: dollar change with green delta animation matching CounterRow pattern (3s fade)
- Toggle state persisted to localStorage

### Instrument list
- Flat list, no grouping: Brent, WTI, XLE, USO, XOM (in that order)
- Commodities first (Brent, WTI), then ETFs (XLE, USO), then stock (XOM)

### Data source & polling
- Yahoo Finance v8 chart API (unofficial) via server proxy
- 5-minute polling interval (recursive setTimeout, same pattern as flight/ship/event polling)
- Redis cache with 5-min TTL, cache key `markets:yahoo`
- Cache-first route: check Redis, return cached if fresh, fetch upstream if stale

### Market-closed behavior
- Show last available prices with "MARKET CLOSED" label at top of panel
- Sparklines show full 5-day history as normal
- No delta shown when market is closed (no change occurring)
- Polling continues but server returns cached data (Yahoo returns last close)

### Graceful degradation
- If Yahoo Finance API fails: show last cached prices with orange stale dot (ConnectionStatus pattern)
- If no data ever fetched: show "No data" per row
- Panel stays visible regardless of API health

### Claude's Discretion
- Yahoo Finance API query parameters and response parsing
- Market hours detection logic (server-side vs client-side)
- Expanded chart SVG dimensions and scaling algorithm
- Exact positioning offset from NotificationBell
- Animation/transition for inline chart expand/collapse
- Tab visibility awareness for polling (reuse existing pattern)

</decisions>

<specifics>
## Specific Ideas

- Panel header layout: "MARKETS" label + [$/%] toggle button + [-/+] collapse button
- Delta animation reuses the exact `animate-delta` CSS keyframes from CounterRow (3s fade)
- ConnectionStatus dot in panel header matches StatusPanel pattern (green/orange/red)
- "MARKET CLOSED" label is subtle muted text, not an alert — the data is still valid

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/OverlayPanel.tsx`: Panel wrapper (rounded, border, backdrop-blur) — use for markets panel shell
- `src/components/counters/CounterRow.tsx`: Delta animation pattern (prevRef, 3s timeout, animate-delta class) — reuse for price change display
- `src/components/counters/useCounterData.ts`: Derived data hook pattern — model useMarketData similarly
- `src/components/ui/StatusPanel.tsx`: ConnectionStatus dot rendering (green/orange/red) — reuse for market health indicator
- `server/cache/redis.ts`: cacheGet/cacheSet with CacheEntry<T> — reuse for `markets:yahoo` cache key
- `app.css`: `@keyframes delta-fade` and `animate-delta` class — reuse directly

### Established Patterns
- Zustand curried `create<T>()()` for new marketStore
- ConnectionStatus type (`'connected' | 'stale' | 'error' | 'loading'`) for store health
- Recursive setTimeout polling with tab visibility awareness (useFlightPolling pattern)
- localStorage persistence for UI state (collapse, toggle preferences)
- Cache-first server route pattern (check Redis → return or fetch upstream → cache → return)

### Integration Points
- `src/components/layout/AppShell.tsx`: Add MarketsSlot in top-right area below NotificationBell, wire useMarketPolling hook
- `server/app.ts`: Register `/api/markets` route
- `server/adapters/`: New `yahoo-finance.ts` adapter
- `server/routes/`: New `markets.ts` route
- New: `src/stores/marketStore.ts`, `src/hooks/useMarketPolling.ts`, `src/components/layout/MarketsSlot.tsx`, `src/components/markets/MarketRow.tsx`, `src/components/markets/Sparkline.tsx`, `src/components/markets/ExpandedChart.tsx`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-oil-markets-tracker*
*Context gathered: 2026-03-21*
