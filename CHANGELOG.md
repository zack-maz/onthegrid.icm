# Changelog

All notable changes to the Iran Conflict Monitor project.

## [Unreleased]

## [v1.2.1] - 2026-03-28

### Phase 21.2: GDELT Event Quality Pipeline

#### Added
- Geo-validation module (`server/lib/geoValidation.ts`) — validates event coordinates against country polygons and FIPS mappings
- Event scoring engine (`server/lib/eventScoring.ts`) — composite confidence scoring with CAMEO specificity, Goldstein sanity check, NumSources >= 2 filter
- NLP extractor (`server/lib/nlpExtractor.ts`) — extracts structured data from GDELT event text
- Dev-mode confidence and geoPrecision display in EventDetail panel
- CAMEO 180 catch-all exclusion from conflict pipeline
- NumSources >= 2 requirement to filter single-source noise

### Phase 21.1: GDELT News Relevance Filtering

#### Added
- Relevance scoring engine (`server/lib/relevanceScorer.ts`) — multi-signal scoring for news article conflict relevance
- Configurable `newsRelevanceThreshold` in server config
- NLP-based keyword extraction for improved conflict detection

#### Changed
- News filter rewritten from keyword whitelist to relevance scoring approach
- Reduced false positive conflict news articles significantly

### Phase 21: Production Hardening & Deploy

#### Added
- Helmet security headers with Content-Security-Policy whitelist for map tiles, analytics, and API domains
- Per-endpoint Cache-Control middleware (`max-age=0, s-maxage=N` for CDN-only caching)
- Per-endpoint rate limiting via `createRateLimiter` factory (flights 30/min, events 10/min, etc.)
- Structured JSON logging (`server/lib/logger.ts`) replacing all console calls in server code
- Request logging middleware with method, path, status, and duration
- Redis graceful degradation: `cacheGetSafe`/`cacheSetSafe` with in-memory fallback on Redis failure
- Rich `/health` endpoint with Redis latency, per-source freshness timestamps, and command estimates
- Cron health endpoint (`/api/cron/health`) with stale source warnings, triggered every 6h via Vercel cron
- Production smoke test script (`scripts/smoke-test.ts`) validating all 9 endpoints
- Vercel Analytics and SpeedInsights integration
- 4 vendor chunks (react, maplibre, deckgl, app) for independent browser cache invalidation
- Rate limiter skips local dev (NODE_ENV !== production)
- All polling hooks check `res.ok` before parsing JSON
- ThreatHeatmapOverlay uses `useFilteredEntities` for consistent date/filter gating
- Vitest tuned: 10s timeout, forks pool (maxForks 4)

#### Changed
- All 7 data routes migrated to `cacheGetSafe`/`cacheSetSafe` for Redis graceful degradation
- All server adapter console calls replaced with structured `log()` calls
- Bundle splitting: vendor-react (~200KB), vendor-maplibre (~800KB), vendor-deckgl (~700KB), app
- 958 tests passing

### Phase 20: Visualization Layers & Filter Independence

#### Added
- Visualization layer system with `layerStore` (`Set<VisualizationLayerId>`) and LayerTogglesSlot with toggle rows
- Geographic overlay: elevation color-relief tinting, maplibre-contour lines, geographic feature labels (deserts, mountain ranges, seas)
- Weather overlay: Open-Meteo temperature heatmap (bilinear-interpolated canvas draped onto terrain), wind barb icons, weather grid tooltip
- Threat density heatmap: deck.gl HeatmapLayer with compound weight formula (type severity × log mentions × log sources × fatality boost × Goldstein hostility × temporal decay), SUM aggregation for proximity clustering, cluster tooltips with fatalities/mentions/hostility
- FilterButton component (pill toggle with color dot for entity categories)
- SliderToggle component (iOS-style switch for boolean filters)
- Weather store (`weatherStore`) and weather polling hook
- Contour tile protocol setup (`contourSetup.ts`) for maplibre-contour integration
- Geographic feature GeoJSON dataset (`geoFeatures.ts`)

#### Changed
- Entity filter toggles (flights, ships, events, sites) now operate independently from visualization layer toggles
- Layer stacking order: weather → threat → entities (threat tooltips supersede weather)
- Filter panel redesigned with FilterButton/SliderToggle components
- Sidebar layout updated for visualization layers section

#### Removed
- Political overlay (deferred — planned but not shipped)
- Political data module and canvas pattern generation files

## [v1.1.0] - 2026-03-22

### Phase 19.2: Counter Entity Dropdowns

#### Added
- Click-to-expand counter rows showing individual entities with label + key metric per type
- Accordion behavior (only one row expanded at a time)
- Fly-to-entity on click (map flies to entity and opens detail panel)
- Proximity sorting per category (flights/events from Tehran, ships from Strait of Hormuz, sites by attack count)
- Zero-count rows disabled and non-expandable; expanded rows that drop to 0 show empty state
- Scrollable entity lists with "Showing X-Y of Z" range indicator for 8+ items
- Ships counter row in CountersSlot

### Phase 19.1: Advanced Search with Tag & Entity Type Filtering

#### Added
- Tag-based query language with ~25 prefixes (type:, site:, country:, near:, callsign:, icao:, mmsi:, cameo:, etc.)
- Implicit OR evaluation across all entity types
- Bidirectional sync between search bar and sidebar filters via `useQuerySync`
- Two-stage autocomplete: tag prefix suggestions → known values with live entity counts
- TagChipRow, SyntaxOverlay, AutocompleteDropdown components
- Cheat sheet popover with full tag vocabulary reference
- `near:` queries support site names and cities, drops proximity pin with 100km radius
- `near:` auto-opens filters panel to show proximity controls
- Negated tag wildcards (`!site:`, `!type:`) for toggle control

#### Changed
- Search parser simplified to implicit OR (removed AND/NOT/parentheses)
- Search evaluator rewritten for OR-only evaluation
- Removed goldstein, vertical, squawk from tag registry

### Phase 19: Search, Filter & UI Cleanup

#### Added
- Global Cmd+K search bar with fuzzy matching across all entity types
- SearchModal with keyboard navigation and fly-to-entity on selection
- Filter panel redesign with per-entity grouped sections (Flights, Ships, Events, Sites)
- Reusable filter UI components (FilterSection, FilterToggle, FilterSlider)
- "Reset All" button to clear all active filters
- Severity filtering for events, health filtering for sites
- New filter predicates: callsign, ICAO, MMSI, name, CAMEO, mentions, heading

#### Changed
- Filter panel reordered with logical grouping
- Removed hit-only toggle (replaced by site health filtering)
- Simplified filterStore with per-entity filter fields
- Counter data hook updated for new filter system
- Sidebar layout refined with search integration

### Phase 18: Oil Markets Tracker

#### Added
- Yahoo Finance adapter (`server/adapters/yahoo-finance.ts`) for commodity prices
- `/api/markets` route with Redis cache (60s TTL)
- `marketStore` Zustand store with ConnectionStatus tracking
- `useMarketPolling` hook — 60s recursive setTimeout
- MarketsSlot collapsible overlay panel with 5 instruments (Brent, WTI, XLE, USO, XOM)
- 5-day sparkline SVG charts with color-coded direction (green up, red down)
- Green delta animations on price changes matching counter animation pattern
- 851 tests passing

## [v1.1.0-alpha.3] - 2026-03-20

### Phase 17: Notification Center

#### Added
- Severity scoring library (`src/lib/severity.ts`) — type weight × log(mentions) × log(sources) × recency decay
- News matching library (`src/lib/newsMatching.ts`) — temporal + geographic/keyword correlation between GDELT events and news clusters
- Time grouping library (`src/lib/timeGroup.ts`) — groups notifications into "Last hour", "Last 6 hours", "Last 24 hours"
- Notification store (`src/stores/notificationStore.ts`) — derives scored notifications from eventStore + newsStore with flyToTarget action
- `useNotifications` hook — connects stores, derives notifications, provides mark-read and fly-to actions
- NotificationBell component (`src/components/layout/NotificationBell.tsx`) — bell icon with unread badge count
- NotificationDropdown component — time-grouped notification cards with news headline previews
- NotificationCard component — severity-scored card with event type, matched news, click-to-fly-to-event
- `useProximityAlerts` hook — detects flights/ships within 50km of key sites, fires proximity notifications
- ProximityAlertOverlay component — animated warning badges on map at alert locations with expand/collapse
- 24h default event window in `useFilteredEntities` when no custom date filter is active
- "Showing last 24h" label in FilterPanelSlot
- `numMentions` and `numSources` fields added to GDELT event pipeline
- `useSiteImage` hook — ArcGIS satellite thumbnail URLs for site detail panels
- 647 tests passing (29 new)

#### Changed
- EventDetail, FlightDetail, SiteDetail panels gain satellite imagery and enhanced formatting
- News keyword filter upgraded with word-boundary matching and ambiguous-keyword gating
- Port icon changed from helm wheel to bollard (cleaner at small sizes)
- Proximity alert badges sized down for less visual clutter

## [v1.1.0-alpha.2] - 2026-03-20

### Phase 16: News Feed

#### Added
- GDELT DOC 2.0 adapter (`server/adapters/gdelt-doc.ts`) for conflict news articles
- RSS adapter (`server/adapters/rss.ts`) — 5 feeds: BBC, Al Jazeera, Tehran Times, Times of Israel, Middle East Eye
- Conflict keyword filter (`server/lib/newsFilter.ts`) with whitelist matching
- Jaccard dedup/clustering (`server/lib/newsClustering.ts`) — 0.8 similarity threshold, 7-day sliding window
- `/api/news` route with Redis cache (15-min TTL)
- `newsStore` Zustand store with ConnectionStatus tracking
- `useNewsPolling` hook — 15-min recursive setTimeout
- `sourceCountry` metadata tagging from GDELT `sourcecountry` field and RSS feed config
- English-only filter for GDELT DOC queries (`sourcelang:english`)
- 618 tests passing

## [v1.1.0-alpha.1] - 2026-03-20

### Phase 15: Key Sites Overlay

#### Added
- Overpass/OSM adapter (`server/adapters/overpass.ts`) querying nuclear, naval, oil, airbase, desalination, port sites across Middle East
- SiteEntity type with `siteType` discriminant and OSM metadata (operator, osmId)
- `siteStore` Zustand store with connection status tracking
- `useSiteFetch` one-time fetch hook (sites are static infrastructure, no polling)
- `/api/sites` route with Redis cache (24h TTL)
- Site IconLayer with 6 distinct icons (nuclear hazard, anchor, oil drop, jet, water drop, crane)
- Attack status detection (`src/lib/attackStatus.ts`) — cross-references site locations with recent conflict events within 5km
- 6 site category toggles in LayerTogglesSlot (Nuclear, Naval, Oil, Airbase, Desalination, Port)
- "Hit Only" toggle to show only recently-attacked sites
- Site row in StatusPanel with connection health dot
- Site counts in CountersSlot (per-category + total)
- SiteDetail panel with site type, operator, coordinates, and attack status
- Site tooltip in EntityTooltip
- Overpass API fallback (primary → private.coffee mirror)
- 571 tests passing (15 new)

#### Changed
- Icon sizes reduced: flights/ships 4000m (was 8000m), events 3000m (was 5000m), to accommodate site markers
- `useEntityLayers` expanded with site layer generation and category filtering
- `useSelectedEntity` extended for site entity lookup from siteStore
- CONFLICT_TOGGLE_GROUPS simplified to 3 groups (showOtherConflict merged into showGroundCombat)

## [v1.0.0] - 2026-03-20

### Phase 14: Vercel Deployment

#### Added
- Vercel serverless entry point (`server/vercel.ts`) with tsup bundling
- `vercel.json` configuration routing SPA + API functions
- Rate limiting middleware (configurable per-route limits)
- Graceful config: server boots without crashing when optional API keys are absent
- Node engine pin (>=20) in package.json

#### Changed
- Express app extracted to `createApp()` factory in `server/app.ts`
- TypeScript build excludes test files from production bundle

### Phase 13: Serverless Cache Migration

#### Added
- Upstash Redis cache (`@upstash/redis`) replacing in-memory EntityCache
- `CacheEntry<T>` pattern with `fetchedAt` for staleness computation (hard TTL = 10x logical TTL)
- AISStream on-demand connection model (connect-collect-close per request)
- Ship merge/prune by MMSI with 10-min stale threshold
- Events accumulator with merge-by-ID upsert and WAR_START pruning
- GDELT backfill: lazy on-demand via direct URL construction, 4 files/day sampling, 1hr cooldown
- `parseSqlDate` using `Date.UTC()` for consistent timestamp comparisons
- 556 tests passing

#### Removed
- In-memory EntityCache class (replaced by Redis)
- Persistent WebSocket connection for AISStream

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
