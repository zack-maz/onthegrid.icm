# Changelog

All notable changes to the Iran Conflict Monitor project.

## [Unreleased]

## [v0.12.0] - 2026-03-18

### Phase 12: Analytics Dashboard

#### Added
- Counters panel (CountersSlot) with collapsible Flights + Events sections
- Flight counters: Iranian (originCountry) and Unidentified (hex-only) tallies
- Event counters: Airstrikes, Ground Combat, Targeted, Fatalities
- Visibility-aware counts: reflect only entities visible on the map (smart filters + toggle gating)
- Green +N delta animation with 3s fade (delta-fade keyframe in app.css)
- useCounterData hook deriving counts from flightStore, eventStore, uiStore, and useFilteredEntities
- CounterRow component with fixed-width label column for vertical value alignment
- 534 tests passing

## [v0.10.0] - 2026-03-18

### Phase 10: Detail Panel & GDELT Event Reclassification

#### Added
- Detail panel: 360px right-side slide-out with per-type content (FlightDetail, ShipDetail, EventDetail)
- Flight detail with dual units (ft/m, kn/m-s, ft-min/m-s) and data source label
- Event detail with Goldstein scale, CAMEO code, actors, "View source" link
- Flash-on-change animation for data values (DetailValue component)
- Cross-store entity lookup hook (useSelectedEntity) with lost contact tracking
- Copy-to-clipboard for coordinates with 2s "Copied!" feedback
- Lost contact state: grayscale overlay with "LOST CONTACT" banner
- Relative timestamp ticking "Updated Xs ago" every second
- 11 CAMEO-based ConflictEventType categories replacing drone/missile split
- 4 conflict toggle groups: Airstrikes, Ground Combat, Targeted, Other Conflict
- New map icons: explosion (8-point burst) and crosshair (targeting reticle)
- localStorage migration for old showDrones/showMissiles/showNews keys
- 365 tests passing

#### Fixed
- Unidentified flights now take precedence over Ground filter (visible when Ground OFF if pulse ON)
- Empty map click preserves detail panel selection (explicit close required)

#### Changed
- Entity types: `drone`/`missile` replaced with 11 granular ConflictEventType values
- Layer toggles: Drones/Missiles/News replaced with Airstrikes/Ground Combat/Targeted/Other Conflict
- Tooltip gating: per-category conflict toggles replace single showNews toggle
- GDELT classifier: classifyByBaseCode uses 3-digit EventBaseCode instead of root code

## [v0.9.0] - 2026-03-17

### Phase 9: Layer Controls & News Toggle

#### Added
- Layer toggles panel with 7 rows: Flights, Ground, Unidentified, Ships, Drones, Missiles, News
- Toggle opacity dimming (40% when OFF) with smooth transitions and localStorage persistence
- EntityTooltip component with per-type content (flight metadata, ship AIS data, GDELT event details)
- News toggle gates event tooltips (drone/missile hover tooltips hidden when News OFF)
- GDELT event deduplication by date/CAMEO code/location, keeping highest-mention row
- StatusPanel counts reflect only visible entities filtered by toggle state and entity type
- Zoom +/- controls enabled on NavigationControl
- Hover glow (2x) and highlight (1.2x) layers for active entity feedback
- 309 tests passing

#### Fixed
- Hover blink caused by glow/highlight layers intercepting picks (set pickable: false)
- Hover blink caused by active entity alpha=0 breaking deck.gl picking (keep full opacity)
- Duplicate GDELT markers for same real-world event with different actor fields

#### Changed
- "Pulse" toggle renamed to "Unidentified" for clarity
- showNews defaults to true (News ON by default)

## [v0.4.0] - 2026-03-15

### Phase 4: Flight Data Feed

#### Added
- Zustand flight store with connection health tracking (connected/stale/error/loading)
- `useFlightPolling` hook with recursive setTimeout (5s interval)
- Tab visibility awareness: polling pauses when hidden, immediate fetch on resume
- Stale data tracking with `lastFresh` timestamp and 60s drop threshold
- `unidentified` flag on FlightEntity for hex-only/no-callsign flights
- Cache-first server route to conserve OpenSky API credits
- onGround flight filtering at adapter level (airborne only)
- Vite dev proxy forwarding `/api` to Express on port 3001
- Flight polling wired into AppShell on mount
- 15 new tests (6 store, 5 polling hook, 3 adapter, 1 cache-first)

## [v0.3.0] - 2026-03-15

### Phase 3: API Proxy

#### Added
- Express 5 server on port 3001 with health check endpoint
- MapEntity discriminated union types (flight, ship, missile, drone)
- OpenSky Network adapter with OAuth2 client credentials and bbox filtering
- AISStream adapter with WebSocket connection for real-time ship data
- ACLED adapter for conflict events (last 7 days)
- In-memory entity cache with configurable TTLs per data source
- Security middleware: rate limiting, CORS, Helmet headers
- Environment-based configuration with .env support
- Routes: `/api/flights`, `/api/ships`, `/api/events`
- 37 server tests (adapters, cache, security, types)
- Concurrent dev workflow (Vite + Express via concurrently)

#### Fixed
- Handle Blob WebSocket messages in AISStream adapter
- Use `node --import tsx/esm` for dev scripts (ESM compatibility)
- Remove eager `loadConfig()` from server startup to prevent crashes with missing .env
- Use `--env-file-if-exists` flag to tolerate missing .env file

## [v0.2.0] - 2026-03-14

### Phase 2: Base Map

#### Added
- Interactive 2.5D map of Iran using Deck.gl + MapLibre with CARTO Dark Matter tiles
- DeckGLOverlay bridge component via MapboxOverlay + useControl hook
- Zustand map store (isMapLoaded, cursorPosition)
- CompassControl with double-click reset to default Iran view
- CoordinateReadout showing live lat/lon on cursor move
- Scale bar in bottom-right area
- MapVignette effect (faint dark gradient framing viewport edges)
- MapLoadingScreen with full-screen ripple animation and smooth map fade-in
- Map style customization: hidden road labels, brighter country borders, blue-tinted water
- Test mocks for maplibre-gl and @deck.gl/mapbox (jsdom compatibility)
- 30 tests passing across all map components

#### Fixed
- Switched terrain tiles from Alps-only MapLibre demo to global AWS Terrarium DEM
- Increased terrain exaggeration to 3.0 with pitch 50 for dramatically visible mountains
- Boosted hillshade exaggeration to 0.6 with brighter highlights for ridge contrast
- Fixed vignette rendering order (moved after Map in DOM to prevent occlusion)
- Set vignette opacity to 0.25 (was 0.6, too dark per user feedback)

## [v0.1.0] - 2026-03-14

### Phase 1: Project Scaffolding & Theme

#### Added
- Vite 6 + React 19 + TypeScript 5.9 project scaffold with ESM
- Tailwind CSS v4 dark theme with `@theme` semantic color tokens
- AppShell layout with full-viewport dark shell and z-indexed overlay regions
- Zustand UI store with panel visibility toggles
- OverlayPanel reusable component
- Vitest test infrastructure with jsdom and testing-library
- README and brainstorm notes

#### Fixed
- Moved filters to bottom-left and counters to top-right per layout feedback
