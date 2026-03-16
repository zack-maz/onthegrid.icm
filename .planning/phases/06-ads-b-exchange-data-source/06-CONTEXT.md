# Phase 6: ADS-B Exchange Data Source - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

ADS-B Exchange as a second flight data source alongside OpenSky, with a UI toggle to switch between them. Server-side adapter normalizes ADS-B data to the same FlightEntity format. Frontend source selector with connection health display. No new entity types, no new map layers — same flight rendering, different data pipe.

</domain>

<decisions>
## Implementation Decisions

### Source switching behavior
- Flush and refetch on toggle — clear all flights immediately, show loading state, fetch from new source
- No auto-fallback — stay on selected source when it fails, show error status. User manually switches if needed
- Selected source persists in localStorage across page reloads
- Single endpoint with query param: `/api/flights?source=adsb` or `?source=opensky` (default)

### Rate limit handling
- Server distinguishes rate limit (429) from other errors in response to frontend — enables specific "Rate limited" badge
- ADS-B Exchange gets its own polling interval tuned to avoid hitting free-tier rate limits (Claude determines exact cadence based on RapidAPI tier limits during research — NOT the same 5s as OpenSky)
- Serve stale cache when rate limited — keep showing last-known positions with rate limited indicator
- Claude's discretion on whether OpenSky also gets backoff behavior on 429

### Toggle UI
- Top-right floating dropdown control on the map overlay
- Dropdown shows current source name with chevron
- Connection status integrated below dropdown: colored dot + flight count (e.g., "247 flights")
- Status states: connected (green), stale (yellow), error (red), rate limited (red + "Rate limited" text), loading (gray/pulsing)

### ADS-B Exchange API
- RapidAPI free tier for ADS-B Exchange access
- API key required at startup (`ADSB_EXCHANGE_API_KEY` in .env — server fails without it)
- Same Iran bounding box coverage as OpenSky (adapt query format if API uses radius-based instead of bbox)
- Normalize to identical FlightEntity shape — fields ADS-B doesn't provide become null
- Same ground traffic filter (onGround=false only) and unidentified flag logic as OpenSky adapter

### Claude's Discretion
- Exact ADS-B Exchange polling interval (based on free-tier rate limits)
- OpenSky backoff behavior on rate limit (or keep fixed 5s)
- Dropdown component implementation details (custom vs native select)
- How to wire source selection into the existing polling hook
- Cache strategy per source (shared cache or separate caches)
- Exact status dot colors and styling within the dark theme

</decisions>

<specifics>
## Specific Ideas

- ADS-B Exchange polling should be tuned to avoid hitting rate limits entirely — not a 5s interval with backoff, but a sustainable base rate from the start
- Status badge below the dropdown combines connection health + flight count in one line — compact HUD aesthetic
- "Rate limited" is a distinct state from "error" — user can tell the difference between "API is down" and "we're hitting limits"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/adapters/opensky.ts`: Full adapter pattern — new ADS-B adapter follows same structure (fetchFlights with bbox, returns FlightEntity[])
- `server/routes/flights.ts`: Currently hardcoded to opensky adapter — needs source param routing
- `server/cache/entityCache.ts`: Reusable for ADS-B Exchange data caching
- `server/config.ts`: Lazy config with `required()` helper — add `adsbExchange.apiKey` section
- `server/types.ts`: FlightEntity already defined — ADS-B adapter normalizes to same type
- `src/stores/flightStore.ts`: Source-agnostic store (just stores FlightEntity[]) — needs `activeSource` and `connectionStatus` per-source awareness
- `src/hooks/useFlightPolling.ts`: Recursive setTimeout pattern — needs source param in fetch URL and source-specific interval

### Established Patterns
- Zustand 5 curried `create<T>()()` for type inference
- Zustand selector `s => s.field` for minimal re-renders
- CacheResponse<T> with `stale: boolean` and `lastFresh: number`
- `IRAN_BBOX` constant in `server/constants.ts`
- `CACHE_TTL.flights = 10_000` (10s server-side cache)
- Recursive setTimeout (not setInterval) for polling
- Tab visibility pause on hidden, immediate fetch on visible

### Integration Points
- `server/routes/flights.ts` line 4: `import { fetchFlights } from '../adapters/opensky.js'` — needs conditional import based on source param
- `src/hooks/useFlightPolling.ts` line 21: `fetch('/api/flights')` — needs `?source=` query param
- `src/components/map/BaseMap.tsx`: Top-right overlay area for new dropdown component
- `src/stores/uiStore.ts` or new store: Track `activeSource` and persist to localStorage

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-ads-b-exchange-data-source*
*Context gathered: 2026-03-15*
