---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 12-01-PLAN.md
last_updated: "2026-03-19T02:05:25.104Z"
last_activity: 2026-03-18 -- Phase 12 Plan 01 completed (analytics counters dashboard)
progress:
  total_phases: 13
  completed_phases: 10
  total_plans: 28
  completed_plans: 25
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 12: Analytics Dashboard -- counters dashboard complete.

## Current Position

Phase: 12 (Analytics Dashboard)
Plan: 1 of 1 in current phase (COMPLETE)
Status: Counters dashboard plan complete. Phase 12 done.
Last activity: 2026-03-18 -- Phase 12 Plan 01 completed (analytics counters dashboard)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 26
- Average duration: 3.8min
- Total execution time: 1.64 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Project Scaffolding & Theme | 1 | 5min | 5min |
| 2. Base Map | 3 | 14min | 4.7min |
| 3. API Proxy | 3 | 11min | 3.7min |
| 4. Flight Data Feed | 2 | 5min | 2.5min |
| 5. Entity Rendering | 2 | 19min | 9.5min |
| 6. ADS-B Exchange | 1/3 | 3min | 3min |
| 7. adsb.lol | 2/2 | 8min | 4min |
| 8. Ship & Conflict Data | 1/2 | 6min | 6min |
| 8.1 GDELT Default Source | 2/3 | 6min | 3min |
| 9. Layer Controls & News | 1/2 | 12min | 12min |
| 10. Detail Panel | 2/2 | 7min | 3.5min |
| 11. Smart Filters | 3/3 | 21min | 7min |
| 12. Analytics Dashboard | 1/1 | 4min | 4min |

**Recent Trend:**
- Last 5 plans: 10-01 (4min), 10-02 (3min), 11-01 (4min), 11-02 (3min), 12-01 (4min)
- Trend: Stable

*Updated after each plan completion*
| Phase 07 P01 | 5min | 2 tasks | 14 files |
| Phase 07 P02 | 3min | 2 tasks | 7 files |
| Phase 08 P01 | 6min | 2 tasks | 12 files |
| Phase 08.1 P01 | 3min | 2 tasks | 4 files |
| Phase 08.1 P02 | 3min | 2 tasks | 8 files |
| Phase 09 P01 | 12min | 2 tasks | 11 files |
| Phase 10 P01 | 4min | 2 tasks | 9 files |
| Phase 10 P02 | 3min | 2 tasks | 5 files |
| Phase 11 P01 | 4min | 2 tasks | 8 files |
| Phase 11 P02 | 3min | 2 tasks | 4 files |
| Phase 11 P03 | 14min | 2 tasks | 17 files |
| Phase 12 P01 | 4min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Deck.gl + MapLibre for 2.5D map (GPU-accelerated, free)
- React 19 + Vite 6 + TypeScript 5 + Tailwind CSS 4 (from research)
- Zustand 5 for state management
- Express 5 as API proxy
- Common MapEntity interface to normalize all data sources
- Used Tailwind CSS v4 CSS-first @theme configuration (no tailwind.config.js)
- Pinned TypeScript to ~5.9.3 to avoid TS 6.0 breaking changes
- Zustand store uses curried create<UIState>()() pattern for type inference
- Z-index scale defined as CSS custom properties for consistent overlay layering
- Mocked maplibre-gl and @deck.gl/mapbox via vite.config.ts test.alias for jsdom compatibility
- Used it.todo() for unimplemented component stubs to avoid import errors while keeping test presence
- DeckGLOverlay wraps MapboxOverlay via useControl hook from react-maplibre
- Imperative style customization in onLoad with getLayer() guards -- never pre-fetch/modify CARTO style.json
- CompassControl renders null (behavior-only) using useMap hook and DOM querySelector for compass button
- Zustand selector pattern (s => s.field) in BaseMap components to minimize re-renders
- AWS Terrarium S3 tiles for global DEM coverage (MapLibre demo was Alps-only)
- Terrain exaggeration 3.0 with pitch 50 for dramatically visible mountains
- Hillshade exaggeration 0.6 with brighter highlights (#444444) for ridge contrast
- Vignette opacity 0.25 per user feedback (was 0.6, too dark)
- tiles array + encoding prop pattern for raster-dem sources without TileJSON endpoints
- Lazy config loading via loadConfig() to allow tests to run without env vars
- Proxy object for config convenience access with cached lazy evaluation
- createApp() factory pattern for Express app to enable test isolation
- erasableSyntaxOnly compatibility: explicit field + constructor assignment instead of parameter properties
- vitest-environment node directive per test file instead of workspace config
- UTC date formatting in ACLED adapter to avoid timezone-dependent date drift
- Mock adapter modules in security tests instead of mocking fetch globally, to test actual HTTP responses
- AISStream reconnect uses simple 5s setTimeout (not exponential backoff) matching plan spec
- Inline process.env reads for PORT/CORS_ORIGIN instead of getServerConfig() helper -- simpler, no unnecessary abstraction
- Node --env-file-if-exists=.env flag (Node 22.14+) instead of dotenv dependency for optional .env loading
- Guard connectAISStream() with env var presence check -- explicit opt-in for optional services
- onGround filter as early return null in normalizeFlightState for efficiency
- unidentified flag derived from empty trimmed callsign at adapter level
- Cache-first route pattern: check cache freshness before upstream call, conserve API credits
- Recursive setTimeout (not setInterval) for polling -- waits for async completion before scheduling next
- 60s stale threshold based on flight drift: 250m/s aircraft moves ~15km in 60s
- Zustand getState() for staleness check in setTimeout callback avoids stale closures
- Polling hook is behavior-only -- no return value, writes directly to Zustand store
- Canvas icon atlas with mask mode for getColor tinting instead of pre-colored PNGs
- Graceful canvas fallback in jsdom (return blank canvas) instead of requiring canvas npm package
- Explicit null check for heading to avoid -0 vs 0 edge case from negation
- Static ship/drone/missile layers in separate useMemo with empty deps (Phase 6 ready)
- Pulse animation: rAF loop throttled to ~15fps, controlled by pulseEnabled store toggle
- @deck.gl/layers mock added to vite.config.ts test aliases for jsdom compatibility
- Meter-based sizeUnits with min/max pixel bounds for zoom-responsive entity icons
- Icon sizes 3x plan values after user feedback: flight/drone/missile 2400m/15min/96max, ship 1800m/12min/84max
- FlightSource type in ui.ts to avoid circular imports with server types
- 260s ADS-B polling interval based on RapidAPI free-tier rate limits
- setFlightData accepts extended CacheResponse with optional rateLimited flag
- POLL_INTERVAL renamed to OPENSKY_POLL_INTERVAL for clarity
- localStorage persistence with loadPersistedSource/persistSource helpers and try/catch guards
- Source-specific polling: activeSource in useEffect dependency array triggers cleanup + restart
- Shared V2 normalizer extracted to adsb-v2-normalize.ts for code reuse between adsb-exchange and adsb-lol adapters
- adsblol as default flight source (no API key required, best out-of-box experience)
- 30s cache TTL for adsb.lol (respectful of community API with dynamic rate limits)
- parseSource/getCache/getFetcher helper pattern for clean 3-source dispatch
- adsb.lol adapter calls fetch(url) with no options object (credential-free)
- [Phase 07]: Shared V2 normalizer extracted to adsb-v2-normalize.ts for code reuse between adapters
- [Phase 07]: adsblol as default flight source (no API key required, best out-of-box experience)
- [Phase 07]: 30s cache TTL for adsb.lol (respectful of community API)
- [Phase 07]: parseSource/getCache/getFetcher helper pattern for clean 3-source dispatch
- [Phase 07]: Record-based INTERVAL_MAP for polling intervals instead of ternary chain
- [Phase 07]: Optimistic defaults (all sources enabled) until /api/sources responds
- [Phase 07]: aria-disabled attribute on unconfigured source options for accessibility
- Expanded IRAN_BBOX to Greater Middle East coverage (south:15 north:42 west:30 east:70) for all data sources
- Ground traffic filtering moved from server-side (early return null) to client-side (useEntityLayers + showGroundTraffic toggle)
- OpenSky adapter throws RateLimitError on 429 for consistent rate-limit handling across all sources
- IRAN_CENTER repositioned to (30.0, 50.0) with 500 NM radius for broader ADS-B coverage
- [Phase 08]: 120s stale threshold for ships (~1km drift at 15 knots)
- [Phase 08]: No stale clearing for conflict events (historical ACLED data never goes stale)
- [Phase 08]: Separate useMemo per entity layer with individual deps for efficient re-rendering
- [Phase 08]: ACLED expanded to 16 pipe-separated countries for Greater Middle East coverage
- [Phase 08.1]: adm-zip for ZIP decompression (zlib cannot handle ZIP archives, only gzip/deflate)
- [Phase 08.1]: HTTP (not HTTPS) for GDELT URLs due to TLS cert issues on data.gdeltproject.org
- [Phase 08.1]: FIPS 10-4 country codes (IZ not IQ, TU not TR, IS not IL) for GDELT filtering
- [Phase 08.1]: CAMEO classification: 18->drone, 19/20->missile
- [Phase 08.1]: Tab delimiter for GDELT CSV parsing despite .CSV extension
- [Phase 08.1]: ACLED credentials optional via nullish coalescing (preserves config shape for future use)
- [Phase 08.1]: 15-minute intervals (900s) for both cache TTL and frontend polling to match GDELT update cadence
- [Phase 09]: All 7 layer toggles persist atomically under single 'layerToggles' localStorage key
- [Phase 09]: showFlights and showGroundTraffic are fully independent (2x2 matrix: both ON, flights-only, ground-only, none)
- [Phase 09]: showNews defaults to false per CTRL-04, all entity toggles default to true
- [Phase 09]: Drone and missile layers set pickable=true preemptively for tooltip support
- [Phase 10]: Empty map click does NOT dismiss detail panel -- panel persists until explicitly closed
- [Phase 10]: Removed pinned tooltip (clickState) in favor of detail panel for selected entity display
- [Phase 10]: Hover tooltip remains for quick entity identification, detail panel for deep inspection
- [Phase 10]: useRef for last-known entity tracking to survive store updates without extra renders
- [Phase 10]: Inline useRelativeTime hook with 1s interval for live timestamp ticking
- [Phase 10]: Copy-to-clipboard with 2s "Copied!" feedback timeout
- [Phase 10]: Lost contact banner + content grayout (opacity-50 grayscale) preserving last-known data
- [Phase 10]: Panel slides from right side (top-0 right-0, translate-x-full when hidden) with border-l
- [Phase 11]: Filter store uses no localStorage persistence (transient state per user decision)
- [Phase 11]: clearFilter(proximity) resets both pin AND radius to default 100km
- [Phase 11]: Pure entityPassesFilters predicate: non-applicable filters include (not exclude) the entity
- [Phase 11]: Null/unknown velocity/altitude pass through range filters (include unknowns)
- [Phase 11]: Native dual-range inputs with CSS pointer-events trick for filter sliders (no library)
- [Phase 11]: Datalist-based country autocomplete (native browser UX)
- [Phase 11]: isSettingPin mode pattern: crosshair cursor + DeckGLOverlay guard + Map onClick for pin placement
- [Phase 11]: Consolidated showOtherConflict into showGroundCombat (3 toggle groups, 3 event layers)
- [Phase 12]: CounterRow delta tracking via useRef + 3s setTimeout, CSS animation restart via key prop
- [Phase 12]: Event filtered counts require BOTH smart filter passing AND toggle gating
- [Phase 12]: Flight counters derive from raw flights (no filter/toggle narrowing per user decision)

### Roadmap Evolution

- Phase 08.1 inserted after Phase 08: Add GDELT as default conflict event source (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- API rate limits on free tiers (OpenSky, AIS) may constrain refresh rates
- ACLED data has inherent delay (hours/days) -- set user expectations in UI
- 5K+ simultaneous entities may impact frame rate -- plan for viewport culling

## Session Continuity

Last session: 2026-03-19T02:05:25.095Z
Stopped at: Completed 12-01-PLAN.md
Resume file: None
