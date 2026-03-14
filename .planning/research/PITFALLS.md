# Pitfalls Research: Iran Conflict Monitor

## 1. API Rate Limits Will Hit You Fast

**The problem:** OpenSky free tier allows ~10 requests per 10 seconds (anonymous), ~1 request/second (authenticated). AIS APIs have similar constraints. Polling naively at high frequency burns through limits within minutes.

**Warning signs:**
- HTTP 429 responses in console
- Data stops updating without error
- API returns empty/cached results

**Prevention:**
- Implement exponential backoff with jitter on 429s
- Cache responses server-side in SQLite — only hit API when cache is expired
- Use WebSocket/SSE where available (OpenSky) instead of polling
- Batch requests: OpenSky's `/states/all` returns ALL aircraft in one call (within bounding box)
- Register for authenticated access (higher limits)

**Phase to address:** Phase 2-3 (data adapter implementation)

## 2. CORS Will Block Direct Browser API Calls

**The problem:** Most public APIs (OpenSky, ACLED, AIS) don't set CORS headers for browser origins. Direct `fetch()` from React will fail silently or with opaque errors.

**Warning signs:**
- `Access-Control-Allow-Origin` errors in console
- Requests work in Postman/curl but fail in browser
- "Network Error" with no response body

**Prevention:**
- Always route through the Express proxy — never call external APIs from the browser
- Proxy adds its own CORS headers for the frontend origin
- This also keeps API keys server-side

**Phase to address:** Phase 1 (project scaffolding — proxy must exist from day one)

## 3. Rendering Thousands of Moving Points Kills Frame Rate

**The problem:** Naively re-rendering 5,000+ flight markers every 5 seconds causes GPU memory pressure and dropped frames. React re-renders on every data update compound the issue.

**Warning signs:**
- FPS drops below 30 during data updates
- Browser tab memory exceeds 1GB
- Map becomes unresponsive during zoom/pan

**Prevention:**
- Use Deck.gl's `data` prop efficiently — pass flat arrays, not nested objects
- Use `getPosition` accessor functions, not pre-computed position arrays
- Enable Deck.gl's built-in data diffing (`dataComparator` prop)
- Limit visible entities by map viewport bounds (only render what's on screen)
- Use `useMemo` / `useCallback` to prevent unnecessary layer recreation
- Consider `IconLayer` with texture atlas over individual SVG markers

**Phase to address:** Phase 4-5 (map rendering + optimization)

## 4. Heterogeneous Data Models Cause Subtle Bugs

**The problem:** ADS-B gives speed in knots, AIS in knots but sometimes m/s, ACLED gives lat/lng with varying precision. Mixing these without normalization leads to wrong display values, filter mismatches, and confusing UX.

**Warning signs:**
- Speed values look wrong (mixing knots/km/h/m/s)
- Entities appear at wrong positions (lat/lng precision issues)
- Filters don't match expected results

**Prevention:**
- Define a strict `MapEntity` interface at the proxy level
- All adapters normalize to the same units (knots for speed, degrees for coordinates, meters for altitude)
- Add unit tests for each adapter's normalization logic
- Include `source` field so you can debug which API produced bad data

**Phase to address:** Phase 2-3 (data adapters)

## 5. WebSocket Connections Drop Without Recovery

**The problem:** WebSocket connections to OpenSky or your proxy will drop due to network hiccups, server restarts, or idle timeouts. Without reconnection logic, the dashboard silently stops updating.

**Warning signs:**
- Flight data freezes while ships/events still update
- No errors in console (WebSocket closes silently)
- Data becomes increasingly stale

**Prevention:**
- Implement automatic reconnection with exponential backoff
- Track connection state in Zustand — show "disconnected" indicator in UI
- Heartbeat/ping mechanism to detect dead connections early
- Fall back to polling if WebSocket fails repeatedly

**Phase to address:** Phase 3 (data service layer)

## 6. Stale Data Without Visual Indication Misleads

**The problem:** If an API stops returning data for an entity (plane landed, ship moved out of range), the marker stays on the map at its last known position. User assumes it's current.

**Warning signs:**
- Entities "stuck" at fixed positions for minutes
- Count of entities on map grows unboundedly
- User makes decisions based on outdated positions

**Prevention:**
- Track `lastUpdated` timestamp per entity
- Compute `stale` flag based on per-type thresholds (30s for flights, 5min for ships)
- Visually dim or pulse stale entities (reduced opacity, gray color)
- Auto-remove entities after extended staleness (e.g., 10 minutes for flights)
- Show data freshness timestamp in detail panel

**Phase to address:** Phase 5-6 (UI polish, detail panel)

## 7. Map Tile Loading Blocks Initial Render

**The problem:** MapLibre needs to download vector tiles before anything renders. On first load or cold cache, users see a blank/loading map for 2-5 seconds before any data appears.

**Warning signs:**
- White/black screen on first load
- Data entities appear before map tiles (floating in void)
- Long time-to-interactive

**Prevention:**
- Use a fast, CDN-hosted tile source (MapTiler, Protomaps)
- Show a loading skeleton/spinner while tiles load
- Load entity data in parallel with tiles (don't wait for map to be ready)
- Consider self-hosting a minimal tileset for the Iran region only

**Phase to address:** Phase 4 (map setup)

## 8. ACLED Data Has Inherent Delays

**The problem:** ACLED conflict data is curated, not real-time. Events may appear hours or days after they occur. Users expecting "real-time missile launches" will be disappointed.

**Warning signs:**
- Conflict events are consistently hours/days old
- User sees no events during active conflict reported on news

**Prevention:**
- Display the event timestamp prominently (not just "new")
- Add a "data delay" disclaimer for ACLED-sourced events
- Supplement with faster OSINT sources if available (Twitter/X feeds, Telegram)
- Consider adding a manual event entry feature for breaking events
- Set expectations in the UI: "Conflict events update with 1-24 hour delay"

**Phase to address:** Phase 3 (ACLED adapter) and Phase 6 (UI indicators)

## 9. Bounding Box Queries Return Too Much Data

**The problem:** Querying OpenSky for all flights in a bounding box that covers Iran + surrounding seas returns thousands of commercial flights. Most are irrelevant (overflying airlines).

**Warning signs:**
- 5,000+ markers cluttering the map
- Commercial flights overwhelm military/significant ones
- Performance degrades with entity count

**Prevention:**
- Start with a tight bounding box (Iran + Persian Gulf + Gulf of Oman)
- Implement altitude/speed filters at the proxy level (filter out high-altitude cruising airliners)
- Tag known military callsigns/hex codes if available
- Allow user to adjust bounding box
- Consider filtering by registration country

**Phase to address:** Phase 2-3 (adapter implementation) and Phase 7 (filters)

## 10. JSON Snapshot Files Grow Large

**The problem:** Saving 5,000 entities with full metadata per snapshot creates 5-10MB JSON files. After 50 snapshots, you're at 500MB of local storage.

**Warning signs:**
- Snapshot save takes >1 second
- `snapshots/` directory exceeds 1GB
- Loading snapshot list is slow

**Prevention:**
- Store only entity positions + essential fields, not full metadata
- Compress snapshots (gzip JSON)
- Limit retained snapshots (e.g., 100, FIFO)
- Show file size in snapshot list
- Option to export/archive old snapshots

**Phase to address:** Phase 10+ (snapshot system)
