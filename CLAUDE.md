# Iran Conflict Monitor

## Project Context

Personal real-time intelligence dashboard for monitoring the Iran conflict. 2.5D map with live data from public APIs. Numbers over narratives.

## Conventions

- **TypeScript strict mode** — always enabled
- **Zustand stores** — curried `create<T>()()` pattern for type inference
- **Zustand selectors** — `s => s.field` pattern to minimize re-renders
- **Tailwind CSS v4** — CSS-first `@theme` configuration, no tailwind.config.js
- **Z-index** — scale defined as CSS custom properties for consistent overlay layering
- **Commits** — conventional commits format (`feat(phase):`, `fix(phase):`, `docs(phase):`)
- **Branches** — one feature branch per phase (`feature/XX-description`), never commit to main directly
- **Phase boundaries** — before starting a new phase: commit, push, merge previous phase to main, update all docs, then create new branch from main
- **TypeScript** — pinned to ~5.9.3 to avoid TS 6.0 breaking changes

## Map Patterns

- **DeckGLOverlay** wraps MapboxOverlay via `useControl` hook from react-maplibre
- **Style customization** — imperative in `onLoad` with `getLayer()` guards, never pre-fetch/modify CARTO style.json
- **CompassControl** — renders null (behavior-only) using `useMap` hook and DOM querySelector
- **Terrain** — AWS Terrarium S3 tiles, `tiles` array + `encoding` prop pattern for raster-dem sources
- **Map mocks** — maplibre-gl and @deck.gl/mapbox mocked via `vite.config.ts` test.alias for jsdom

## Testing

- **Framework**: Vitest with jsdom (frontend), node (server)
- **Run**: `npx vitest run` (all), `npx vitest run server/` (server only)
- **Mocks**: `src/test/__mocks__/` for WebGL-dependent libraries
- **Stubs**: `it.todo()` for unimplemented test stubs

## Key Files

- `src/components/map/constants.ts` — map configuration (terrain, bounds, styles)
- `src/components/map/BaseMap.tsx` — main map component with all overlays
- `src/components/layout/AppShell.tsx` — root layout shell (wires all four polling hooks)
- `src/components/ui/StatusPanel.tsx` — HUD status panel (visible entity counts + connection dots)
- `src/components/layout/LayerTogglesSlot.tsx` — layer toggle panel (8 rows)
- `src/components/layout/DetailPanelSlot.tsx` — right-side detail panel (360px slide-out)
- `src/hooks/useSelectedEntity.ts` — cross-store entity lookup with lost contact tracking
- `src/components/map/EntityTooltip.tsx` — hover/click tooltip for all entity types
- `src/stores/mapStore.ts` — map state (loaded, cursor position)
- `src/stores/uiStore.ts` — UI state (panels, toggles)
- `src/stores/flightStore.ts` — flight data state (entities, connection health, metadata)
- `src/hooks/useFlightPolling.ts` — 5s recursive setTimeout with tab visibility awareness
- `src/stores/siteStore.ts` — site data state (entities, connection health)
- `src/stores/newsStore.ts` — news data state (clusters, connection health)
- `src/hooks/useNewsPolling.ts` — 15-min recursive setTimeout for news polling
- `src/hooks/useSiteFetch.ts` — one-time site fetch on mount
- `src/lib/attackStatus.ts` — cross-references sites with nearby GDELT events

## Data Model (Phase 3+)

- **MapEntity** — discriminated union with minimal shared fields (`id`, `type`, `lat`, `lng`, `timestamp`, `label`) + nested type-specific data
- **Entity types**: `flight`, `ship`, plus 11 `ConflictEventType` values, plus `site` (separate from MapEntity union)
- **FlightEntity.data** — includes `unidentified: boolean` flag for hex-only/no-callsign flights
- **API endpoints**: `/api/flights`, `/api/ships`, `/api/events`, `/api/sites`, `/api/news` (separate, independent caching)
- **IRAN_BBOX** — covers Greater Middle East (south:15, north:42, west:30, east:70), not just Iran
- **IRAN_CENTER** — (30.0, 50.0) with 500 NM radius for ADS-B queries

## Flight Data Patterns (Phase 4+)

- **Polling** — recursive `setTimeout` (not `setInterval`) to avoid overlapping async fetches
- **Tab visibility** — polling pauses on `document.visibilitychange` hidden, immediate fetch on visible
- **Cache-first route** — server checks Redis cache before upstream call to conserve API credits
- **Connection state** — `ConnectionStatus` type: `'connected' | 'stale' | 'error' | 'loading'`
- **Stale threshold** — 60s of no fresh data → clear flights entirely (prevents showing dangerously outdated positions)
- **Full replace** — each poll replaces entire flights array atomically (no merge-by-ID)
- **Ground traffic filtering** — moved from server to client-side (`useEntityLayers` filters by `showGroundTraffic` toggle)
- **RateLimitError** — OpenSky adapter throws `RateLimitError` on 429 responses (consistent with ADS-B Exchange pattern)

## Multi-Source Flight Data (Phase 6-7)

- **Three flight sources**: OpenSky, ADS-B Exchange (RapidAPI), adsb.lol (free, default)
- **FlightSource type** — defined in `src/types/ui.ts` to avoid circular imports with server types
- **Polling intervals** — OpenSky 5s, ADS-B Exchange 260s, adsb.lol 30s
- **V2 normalizer** — shared normalizer in `server/adapters/adsb-v2-normalize.ts` for ADS-B Exchange and adsb.lol
- **StatusPanel** — replaces SourceSelector, shows 3-line HUD (flights/ships/events with colored health dots)
- **/api/sources** — returns per-source configuration status
- **Persistence** — selected flight source stored in `localStorage`

## Ship & Event Data (Phase 8+)

- **Ship store** — `src/stores/shipStore.ts` with 120s stale threshold
- **Event store** — `src/stores/eventStore.ts` with no stale clearing (historical data)
- **Polling hooks** — `useShipPolling` (30s), `useEventPolling` (900s / 15 min)
- **AppShell** — wires all four: `useFlightPolling()`, `useShipPolling()`, `useEventPolling()`, `useSiteFetch()`
- **Entity colors** — flights yellow (#eab308), unidentified red (#ef4444), ships purple (#a78bfa), airstrikes bright red (#ff3b30), ground combat red (#ef4444), targeted dark red (#8b1e1e), other conflict red (#ef4444)
- **Entity icons** — flights/ships use chevron, airstrikes use starburst, ground combat uses explosion, targeted uses crosshair, other conflict uses xmark
- **Icon sizing** — flights/ships 4000m base (minPixels:24, maxPixels:160); events 3000m base (minPixels:16, maxPixels:120); sites 2000m base (minPixels:12, maxPixels:80)

## Conflict Event Data (Phase 8.1+)

- **GDELT v2** — default conflict event source (free, no auth, 15-min updates)
- **ACLED** — adapter preserved in `server/adapters/acled.ts` but not active (requires account approval)
- **GDELT adapter** — `server/adapters/gdelt.ts`, fetches lastupdate.txt → downloads ZIP → parses CSV → filters Middle East conflicts
- **GDELT endpoint** — `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` (HTTP, not HTTPS — TLS cert issues)
- **ConflictEventType** — 5 attack-vector types: `airstrike`, `on_ground`, `explosion`, `targeted`, `other` (Phase 27 replaced 11 CAMEO types)
- **classifyByBaseCode** — maps CAMEO EventBaseCode (3-digit) → ConflictEventType, retained as fallback when LLM unavailable
- **CONFLICT_TOGGLE_GROUPS** — 5 groups: showAirstrikes (`airstrike`), showGroundCombat (`on_ground`), showExplosions (`explosion`), showTargeted (`targeted`), showOther (`other`)
- **isConflictEventType** — type guard derived from CONFLICT_TOGGLE_GROUPS (single source of truth)
- **EVENT_TYPE_LABELS** — human-readable display labels for all 5 types
- **FIPS codes** — GDELT uses FIPS 10-4 (IZ=Iraq, TU=Turkey, IS=Israel), not ISO
- **adm-zip** — required for ZIP decompression (Node zlib only handles gzip/deflate)
- **Deduplication** — GDELT rows deduplicated by date+CAMEO+lat/lng, keeping highest NumMentions row

## LLM Event Pipeline (Phase 27)

- **Providers** — Cerebras primary (gpt-oss-120b, 1M TPD free), Groq fallback (openai/gpt-oss-120b, 200K TPD free)
- **LLM adapter** — `server/adapters/llm-provider.ts`, OpenAI SDK with baseURL swap for both providers
- **Event grouping** — `server/lib/eventGrouping.ts`, clusters GDELT rows by date + CAMEO root + 50km proximity
- **LLM extractor** — `server/lib/llmEventExtractor.ts`, batch processing (8 groups/call), Zod-validated output
- **Forward geocoding** — Nominatim search API via `server/adapters/nominatim.ts` `forwardGeocode()`, 1 req/s, Redis-cached 30d
- **Processing trigger** — Lazy on `/api/events` cache miss, 15-min cooldown (`events:llm-process-ts` Redis key)
- **Dual cache** — `events:llm` (LLM-enriched, preferred) + `events:gdelt` (raw fallback)
- **Graceful degradation** — LLM down -> serve raw GDELT -> same as pre-Phase-27 behavior. Map never goes blank.
- **5-type ontology** — `airstrike`, `on_ground`, `explosion`, `targeted`, `other` (replaces 11 CAMEO types)
- **Precision** — `exact` | `neighborhood` | `city` | `region`, shown as radius rings on map
- **PrecisionRingLayer** — `src/components/map/PrecisionRingLayer.tsx`, ScatterplotLayer with radiusUnits: 'meters'
- **Toggle system** — master `showEvents` + 5 sub-toggles (one per type) in filterStore
- **Event colors** — red spectrum: airstrike bright red (#ff3b30), on_ground dark red (#c0392b), explosion orange-red (#e74c3c), targeted crimson (#dc143c), other maroon (#800000)
- **EVENT_TYPE_COLORS** — `src/lib/eventColors.ts`, shared color constants for layers/toggles/icons

## Layer Controls & Tooltips (Phase 9-10)

- **LayerTogglesSlot** — `src/components/layout/LayerTogglesSlot.tsx`, toggle rows in OverlayPanel
- **Toggle rows** — Flights, Ground (indented), Unidentified (indented), Ships, Events (master) + 5 sub-toggles (Airstrikes, Ground Combat, Explosions, Targeted, Other), Sites, Nuclear/Naval/Oil/Airbase/Port (indented), Hit Only (indented)
- **Toggle behavior** — opacity dims to 40% when OFF, smooth transition, persisted to localStorage
- **Layer visibility** — `useEntityLayers` sets `visible` prop per toggle; ground/airborne filtering in `useMemo`
- **Unidentified filter precedence** — unidentified flights stay visible when Ground is OFF (if pulse toggle ON)
- **Conflict toggle gating** — per-category toggles gate tooltips (replaces old showNews toggle)
- **EntityTooltip** — `src/components/map/EntityTooltip.tsx`, renders per-type content (flight metadata, ship AIS, GDELT event data with source link)
- **Hover/highlight** — glow (2x, alpha 60) + highlight (1.2x, full alpha) layers with `pickable: false` to prevent blink
- **Active entity dimming** — non-active entities dim to alpha 80; active entity stays full opacity (no alpha=0)
- **StatusPanel counts** — derived from actual entity arrays filtered by toggle state and entity type
- **Zoom controls** — NavigationControl showZoom enabled
- **localStorage migration** — old showDrones/showMissiles/showNews keys auto-detected and reset to new defaults

## Detail Panel (Phase 10)

- **DetailPanelSlot** — `src/components/layout/DetailPanelSlot.tsx`, 360px right-side slide-out
- **Per-type content** — FlightDetail, ShipDetail, EventDetail with section headings
- **FlightDetail** — dual units (ft/m, kn/m-s, ft-min/m-s), data source from flightStore.activeSource
- **ShipDetail** — name, MMSI, speed, course, heading, "AISStream" source
- **EventDetail** — type label (EVENT_TYPE_LABELS), CAMEO code, Goldstein scale, actors, "GDELT v2" source, "View source" link
- **DetailValue** — `src/components/detail/DetailValue.tsx`, reusable value cell with flash-on-change animation
- **useSelectedEntity** — `src/hooks/useSelectedEntity.ts`, cross-store lookup with lost contact tracking via useRef
- **Dismiss** — Close button (×) and Escape key both call closeDetailPanel + selectEntity(null)
- **Copy coordinates** — clipboard button with 2s "Copied!" feedback
- **Lost contact** — grayscale + opacity-50 overlay with "LOST CONTACT" banner when entity disappears
- **Relative timestamp** — "Updated Xs ago" ticking every second
- **Instant swap** — content changes on entity switch, slide animation only on open/close

## Analytics Counters (Phase 12)

- **CountersSlot** — `src/components/layout/CountersSlot.tsx`, collapsible OverlayPanel with Flights + Events sections
- **CounterRow** — `src/components/counters/CounterRow.tsx`, label + value with fixed-width label column (w-24) for vertical alignment, green +N delta with 3s fade animation
- **useCounterData** — `src/components/counters/useCounterData.ts`, derives visible-only counts from filtered entities + toggle state
- **Visibility-aware** — counters reflect only visible entities (smart filters + toggle gating matching useEntityLayers logic)
- **Flight counters** — Iranian (originCountry === 'Iran'), Unidentified (data.unidentified flag); gated by showFlights/showGroundTraffic/pulseEnabled
- **Event counters** — Airstrikes, Ground Combat, Targeted, Fatalities; gated by showEvents + per-category toggles
- **Delta animation** — `@keyframes delta-fade` in app.css, 3s ease-out forwards via `animate-delta` class

## Serverless Cache (Phase 13)

- **Upstash Redis** — REST-based client (`@upstash/redis`) for serverless compatibility
- **CacheEntry<T>** — stores `{data, fetchedAt}` for staleness computation; hard Redis TTL = 10x logical TTL
- **Cache keys** — `flights:SOURCE`, `ships:ais`, `events:gdelt`, `sites:overpass`, `news:gdelt`, `markets:yahoo`, `geocode:LAT,LON`
- **Redis module** — `server/cache/redis.ts` exports `cacheGet<T>`, `cacheSet<T>`, `redis` instance
- **AISStream on-demand** — connect, collect for N ms, close per request (no persistent WebSocket)
- **Ship merge/prune** — fresh ships merged with cached by MMSI, 10 min stale threshold
- **Events accumulator** — merge-by-ID upsert with WAR_START pruning
- **GDELT backfill** — lazy on-demand via `backfillEvents()` on cache miss; direct URL construction (4 files/day sampling), batched concurrent downloads; `?backfill=true` query param forces re-run
- **Backfill cooldown** — 1 hour via `events:backfill-ts` Redis key
- **parseSqlDate** — uses `Date.UTC()` (not local time) for consistent timestamp comparisons

## Vercel Deployment (Phase 14)

- **Entry point** — `server/vercel.ts` exports Express app via `createApp()` factory in `server/app.ts`
- **Bundle** — tsup bundles `server/vercel.ts` → `dist-server/vercel.cjs` (CommonJS for Vercel)
- **vercel.json** — rewrites `/api/*` → serverless function, everything else → SPA `index.html`
- **Rate limiting** — `express-rate-limit` middleware in `server/middleware/rateLimiter.ts`
- **Graceful config** — `loadConfig()` returns defaults for missing env vars instead of throwing
- **Node engine** — pinned `>=20` in package.json
- **Build** — `npm run build` runs Vite (frontend) + tsup (server) + tsc (typecheck)

## Key Sites Overlay (Phase 15)

- **Overpass adapter** — `server/adapters/overpass.ts`, queries OpenStreetMap for infrastructure sites across Middle East
- **Site types** — `SiteType`: `nuclear`, `naval`, `oil`, `airbase`, `desalination`, `port`
- **SiteEntity** — separate from MapEntity union (not a discriminated union member); has `siteType`, `operator`, `osmId` fields
- **One-time fetch** — `useSiteFetch` hook fetches once on mount (sites are static infrastructure, no polling)
- **Redis cache** — 24h TTL for site data via `sites:overpass` cache key
- **Overpass fallback** — primary API → `private.coffee` mirror on failure
- **Country filtering** — Overpass area union with `ISO3166-1` tags for Middle East countries
- **Attack status** — `src/lib/attackStatus.ts` cross-references site locations with recent GDELT events within 5km radius
- **Site toggles** — 6 category toggles (Nuclear, Naval, Oil, Airbase, Desalination, Port) + "Hit Only" filter
- **Site icons** — 6 distinct icons: nuclear hazard, anchor, oil drop, jet, water drop, bollard
- **Site colors** — healthy green (#22c55e), attacked orange (#f97316)
- **Icon sizing** — sites 2000m base (minPixels:12, maxPixels:80); flights/ships reduced to 4000m; events to 3000m
- **SiteDetail** — detail panel with site type, operator, coordinates, attack status
- **siteStore** — `src/stores/siteStore.ts` with `SiteConnectionStatus` including `'idle'` state
- **CONFLICT_TOGGLE_GROUPS** — simplified to 3 groups (showOtherConflict types merged into showGroundCombat)

## News Feed (Phase 16)

- **GDELT DOC adapter** — `server/adapters/gdelt-doc.ts`, fetches GDELT DOC 2.0 ArtList mode for conflict news articles
- **RSS adapter** — `server/adapters/rss.ts`, fetches from 5 feeds (BBC, Al Jazeera, Tehran Times, Times of Israel, Middle East Eye)
- **NewsArticle** — `server/types.ts`, includes `sourceCountry?: string` field populated from GDELT `sourcecountry` or RSS feed config
- **English filter** — GDELT queries include `sourcelang:english` inline modifier
- **Keyword filter** — `server/lib/newsFilter.ts`, conflict-relevant keyword filtering
- **Dedup/clustering** — `server/lib/newsClustering.ts`, Jaccard similarity (threshold 0.8, 5-token min) with 7-day sliding window
- **Cache** — `news:gdelt` Redis key, 15-min TTL matching GDELT DOC update frequency
- **Route** — `/api/news` returns `CacheResponse<NewsCluster[]>`
- **newsStore** — `src/stores/newsStore.ts`, Zustand store with ConnectionStatus
- **useNewsPolling** — `src/hooks/useNewsPolling.ts`, 15-min polling interval
- **RSS_FEEDS** — each entry has `country` field for sourceCountry tagging

## Notification Center (Phase 17)

- **Severity scoring** — `src/lib/severity.ts`, formula: typeWeight × log(mentions+1) × log(sources+1) × recencyDecay
- **Type weights** — airstrike 10, wmd 10, ground_combat 8, shelling 8, bombing 8, mass_violence 9, assassination 7, others 3-5
- **Recency decay** — exponential decay over 24h (halfLife = 6h)
- **News matching** — `src/lib/newsMatching.ts`, correlates GDELT events with news clusters by temporal proximity (±6h) + geographic/keyword overlap
- **Time grouping** — `src/lib/timeGroup.ts`, buckets: "Last hour", "Last 6 hours", "Last 24 hours"
- **notificationStore** — `src/stores/notificationStore.ts`, derives scored notifications from eventStore + newsStore
- **useNotifications** — `src/hooks/useNotifications.ts`, connects stores, derives notifications, provides mark-read and fly-to actions
- **NotificationBell** — `src/components/layout/NotificationBell.tsx`, bell icon with unread badge, click opens dropdown
- **NotificationCard** — `src/components/notifications/NotificationCard.tsx`, severity-scored card with event type and matched news headlines
- **Proximity alerts** — `src/hooks/useProximityAlerts.ts`, detects flights/ships within 50km of key sites
- **ProximityAlertOverlay** — `src/components/map/ProximityAlertOverlay.tsx`, animated warning badges on map with expand/collapse popover
- **24h default window** — `useFilteredEntities` applies 24h recency filter when no custom date range is active
- **Fly-to-event** — clicking notification flies map to event coordinates and opens detail panel
- **useSiteImage** — `src/hooks/useSiteImage.ts`, ArcGIS World Imagery tile URLs for satellite thumbnails
- **Dev score display** — NotificationCard shows severity score in dev mode only (hidden in production)

## Oil Markets Tracker (Phase 18)

- **Yahoo Finance adapter** — `server/adapters/yahoo-finance.ts`, unofficial API for commodity prices
- **Instruments** — Brent Crude (BZ=F), WTI Crude (CL=F), XLE, USO, XOM
- **marketStore** — `src/stores/marketStore.ts`, Zustand store with ConnectionStatus
- **useMarketPolling** — 60s recursive setTimeout
- **MarketsSlot** — `src/components/layout/MarketsSlot.tsx`, collapsible overlay panel with sparkline charts
- **Cache** — `markets:yahoo` Redis key, 60s TTL
- **Route** — `/api/markets` returns market data with sparkline history

## Search & Filter System (Phase 19+)

- **searchStore** — `src/stores/searchStore.ts`, raw query string, parsed AST, recent tags
- **SearchModal** — `src/components/search/SearchModal.tsx`, Cmd+K activated, keyboard navigation
- **Tag language** — ~25 prefixes: `type:`, `site:`, `country:`, `near:`, `callsign:`, `icao:`, `mmsi:`, `name:`, `cameo:`, `mentions:`, `heading:`, `speed:`, `altitude:`, `severity:`, etc.
- **Implicit OR** — all tags evaluated as OR across entity types (no AND/NOT operators)
- **Bidirectional sync** — `src/hooks/useQuerySync.ts` syncs search bar tags ↔ sidebar filter toggles
- **Autocomplete** — `src/components/search/AutocompleteDropdown.tsx`, two-stage (prefix → values with counts)
- **near: queries** — supports site names and cities, drops proximity pin with 100km radius, auto-opens filter panel
- **filterStore** — `src/stores/filterStore.ts`, per-entity filter fields (flights, ships, events, sites)
- **FilterPanelSlot** — `src/components/layout/FilterPanelSlot.tsx`, grouped sections with Reset All
- **useFilteredEntities** — `src/hooks/useFilteredEntities.ts`, applies all active filters to entity arrays
- **useSearchResults** — `src/hooks/useSearchResults.ts`, evaluates search AST against entities

## Visualization Layers (Phase 20)

- **layerStore** — `src/stores/layerStore.ts`, `Set<VisualizationLayerId>` for active layers
- **VisualizationLayerId** — `geographic`, `weather`, `threat`, `political`, `ethnic`, `satellite`, `water`
- **LayerTogglesSlot** — `src/components/layout/LayerTogglesSlot.tsx`, toggle rows with color dots and "coming soon" labels
- **Geographic overlay** — `src/components/map/layers/GeographicOverlay.tsx`, elevation color-relief tinting, maplibre-contour lines, geographic feature labels (deserts, ranges, seas)
- **Weather overlay** — `src/components/map/layers/WeatherOverlay.tsx`, Open-Meteo grid with wind barbs (deck.gl IconLayer) + invisible picker for tooltips
- **WeatherHeatmap** — `src/components/map/layers/WeatherHeatmap.tsx`, MapLibre image source with bilinear-interpolated temperature canvas, drapes onto terrain
- **Threat clusters** — `src/components/map/layers/ThreatHeatmapOverlay.tsx`, ScatterplotLayer with RadialGradientExtension (custom GLSL shader), BFS cluster merging on 0.25° grid
- **Threat weight formula** — `computeThreatWeight`: typeWeight × log2(mentions) × log2(sources) × fatalityFactor × goldsteinHostility (no temporal decay)
- **Layer stacking** — zoom-dependent: `[...threatLayers, ...entityLayers]` below zoom 9, `[...entityLayers, ...threatLayers]` above zoom 9
- **Filter independence** — entity toggles (flights, ships, events, sites) operate independently from visualization layer toggles
- **FilterButton** — `src/components/filter/FilterButton.tsx`, pill toggle with color dot for entity category filters
- **SliderToggle** — `src/components/filter/SliderToggle.tsx`, iOS-style switch for boolean filter options

## Counter Entity Dropdowns (Phase 19.2)

- **CountersSlot** — accordion dropdowns showing individual entities per counter row
- **Fly-to** — clicking entity in dropdown flies map and opens detail panel
- **Proximity sorting** — flights/events sorted by distance from Tehran, ships from Strait of Hormuz, sites by attack count
- **Scrollable lists** — 8+ items show scrollable container with "Showing X-Y of Z" indicator

## Date Range Filter (Phase 11+13)

- **filterStore** — `dateStart: null` and `dateEnd: null` defaults (no filtering)
- **Custom range mode** — activates when either dateStart or dateEnd becomes non-null; saves and suppresses flight/ship toggles
- **Deactivation** — both must return to null (via Clear button or slider reset)
- **Lo slider at WAR_START** — sends `null` dateStart (no lower bound)
- **Hi slider at "now"** — sends `null` dateEnd (NOW_THRESHOLD_MS = 60s snap)
- **DateRangeFilter** — custom pointer-based dual-thumb slider with granularity toggle (Min/Hr/Day)
- **Granularity** — `STEP_MS` record, `snapToStep` floors timestamps to step boundary

## Threat Density Improvements (Phase 23+23.2)

- **RadialGradientExtension** — `src/components/map/layers/RadialGradientExtension.ts`, deck.gl LayerExtension with GLSL fragment shader injecting radial alpha falloff via `fs:DECKGL_FILTER_COLOR`
- **Gradient falloff** — `smoothstep(0.3, 1.0, dist)`: center 30% at full opacity, soft fade to transparent edge
- **Additive blending** — `blendColorDstFactor: 'one'` makes overlapping clusters intensify naturally
- **4-stop thermal palette** — deep purple → magenta → orange → bright red (simplified from 8-stop FLIR Ironbow)
- **Dual-dimension encoding** — radius = geographic spread (bbox diagonal + sqrt(eventCount) density boost), color = threat weight (P90 normalized)
- **Meter-based radius** — `radiusUnits: 'meters'` with `radiusMinPixels: 20`, `radiusMaxPixels: 200`; 30km floor for single-cell clusters
- **Cluster centroid** — bounding box center (not weight-averaged) for visual centering on event dispersion
- **Zoom z-order crossover** — clusters on top below zoom 9, behind event markers above zoom 9; `isBelowZoom9` boolean in mapStore with ref-based threshold crossing
- **Hover dimming** — hovered cluster 255 alpha, non-hovered 102 (40%); managed as local state in BaseMap
- **Cluster selection dimming** — selecting a cluster grays out all non-cluster events + flights/ships/sites via `clusterEventIds` Set in useEntityLayers
- **ThreatClusterDetail enrichment** — type breakdown bars (horizontal, sorted by count), geographic context (site-in-bbox first → Nominatim fallback), events sorted by threat weight
- **useGeoContext** — `src/hooks/useGeoContext.ts`, two-tier: synchronous siteStore bbox check → async `/api/geocode` Nominatim fallback
- **Nominatim geocoding** — `server/adapters/nominatim.ts` + `server/routes/geocode.ts`, coordinate quantization (2 decimal places), Redis cache 30-day logical / 90-day hard TTL
- **Cache key** — `geocode:${lat},${lon}` with quantized coordinates

## Detail Panel Navigation Stack (Phase 23.1)

- **PanelView** — `src/types/ui.ts`, `{ entityId, cluster, breadcrumbLabel }` — represents a saved detail panel state
- **navigationStack** — `uiStore.navigationStack: PanelView[]`, push/pop actions for back navigation
- **pushView** — saves current panel state (entity or cluster) before navigating to a new entity; called from 8 sites (ThreatClusterDetail, CountersSlot, SearchModal, Sidebar, SiteDetail, ProximityAlertOverlay, plus BaseMap click)
- **popView** — restores previous panel state from stack; wired to back button in BreadcrumbRow
- **BreadcrumbRow** — `src/components/detail/BreadcrumbRow.tsx`, shows breadcrumb trail with back arrow + label from `panelLabel.ts`
- **panelLabel** — `src/lib/panelLabel.ts`, `getCurrentPanelView()` derives breadcrumb label from current entity/cluster state across all stores
- **slideDirection** — `uiStore.slideDirection: 'forward' | 'back' | null`, drives CSS slide-in/slide-out animations
- **CSS animations** — `@keyframes slide-in-right`, `slide-out-left`, `slide-in-left`, `slide-out-right` in `app.css`
- **Escape key** — pops navigation stack if non-empty, otherwise closes panel (existing behavior)

## Political Boundaries Layer (Phase 24)

- **deck.gl GeoJsonLayer** — country fills rendered via `usePoliticalLayers` hook (not MapLibre fill layers — those are invisible with terrain)
- **3-tier factions** — US-aligned (blue #3b82f6), Iran-aligned (red #dc2626), Neutral (gray #64748b)
- **US-aligned** — ISR, SAU, ARE, BHR, JOR, KWT, EGY
- **Iran-aligned** — IRN, SYR, YEM
- **Neutral** — all others in region (TUR, QAT, OMN, PAK, AFG, IRQ, LBN, TKM, AZE, ARM, GEO, etc.)
- **Faction data** — `src/lib/factions.ts`, `Record<string, Faction>` keyed by ISO A3 code, separate from GeoJSON
- **GeoJSON sources** — Natural Earth 110m (countries) + 10m disputed areas, static imports via Vite
- **Fill opacity** — ~15% (alpha 38/255), borders ~60% (alpha 153/255), faction-colored
- **Disputed territories** — Gaza, West Bank, Golan Heights from Natural Earth `ne_10m_admin_0_disputed_areas`; amber fill (#f59e0b)
- **Non-interactive** — no hover/click on country polygons; entity tooltips remain primary
- **Layer stacking** — political layers first in DeckGLOverlay array (renders below all entity/weather/threat layers)
- **Legend** — discrete swatch legend in bottom-left via LEGEND_REGISTRY (4 swatches: US, Iran, Neutral, Disputed)
- **Toggle** — `comingSoon` removed from political entry in LayerTogglesSlot; instant toggle (no fade)
- **Threat centroid fix** — cluster centroids now use mean of actual event coordinates (`realLatSum`/`realLngSum` in ThreatZoneData) instead of bounding box center of grid cells

## Ethnic Distribution Layer (Phase 25)

- **deck.gl GeoJsonLayer + FillStyleExtension** — hatched polygon fills via `useEthnicLayers` hook with `fillPatternMask: true`
- **10 ethnic zones** — Kurdish, Arab, Persian, Baloch, Turkmen, Druze, Alawite, Yazidi, Assyrian, Pashtun
- **Data source** — GeoEPR 2021 (ETH Zurich), extracted via `scripts/extract-ethnic-data.ts`, static `src/data/ethnic-zones.json`
- **Overlap zones** — 23 multi-group features with `properties.groups: string[]`; rendered as stacked GeoJsonLayers with `getFillPatternOffset` for interleaved colored stripes
- **Single-group features** — `properties.group: string` + `properties.label: string`
- **Canvas hatch atlas** — 32x32 diagonal line pattern (4px width, 10px spacing), `fillPatternScale: 200`, created once at module load
- **RGBA alpha** — 140/255 (~55%) for visible hatching; thicker lines than political layer's solid fills
- **Labels** — TextLayer at polygon centroids, zoom-responsive (10-24px), single-group zones only (no labels on overlap areas)
- **Hover tooltips** — `EthnicTooltip` component shows group name, population, context; overlap zones list all groups
- **Tooltip priority** — Entity > Threat > Ethnic > Weather; ethnic tooltip only on empty map areas
- **Click guard** — `handleDeckClick` returns early for `ethnic-*` layer IDs to prevent crash
- **Layer stacking** — ethnic layers after political in DeckGLOverlay array (ethnic hatching on top of political fills)
- **Legend** — discrete 10-swatch entry via `LEGEND_REGISTRY`
- **Ethnic group config** — `src/lib/ethnicGroups.ts`, `EthnicGroup` type, `ETHNIC_GROUPS` record with color/rgba/population/context
- **Yazidi absent** — GeoEPR maps Yazidi under Kurdish ("Kurds/Yezidis"); deferred to future patch

## Water Stress Layer (Phase 26)

- **Point-based approach** — stress shown at specific water facilities (dams, reservoirs, treatment plants, canals, desalination), NOT polygon fills
- **WRI Aqueduct 4.0** — baseline water stress + drought risk + groundwater depletion + seasonal variability; basin-level data in `src/data/aqueduct-basins.json` (6377 entries)
- **Basin lookup** — `server/lib/basinLookup.ts`, assigns WRI stress to each facility by nearest country-centroid basin match
- **Composite health** — `src/lib/waterStress.ts`, combines WRI baseline stress + Open-Meteo precipitation anomaly into health score
- **Color ramp** — continuous gradient from black (extreme stress) to light blue (healthy); `stressToRGBA()` interpolation
- **Open-Meteo precipitation** — `server/adapters/open-meteo-precip.ts`, 30-day anomaly with 100-location batching, 6h polling
- **Overpass water adapter** — `server/adapters/overpass-water.ts`, queries 5 facility types with `["name"]` filter (~4300 named facilities), 120s timeout
- **Desalination migrated** — removed from SiteType/siteStore, now exclusively under Water layer
- **Rivers** — 6 major rivers (Tigris, Euphrates, Nile, Jordan, Karun, Litani) as GeoJSON line features in `src/data/rivers.json`, stress-colored by watershed
- **waterStore** — `src/stores/waterStore.ts`, Zustand store with facility lifecycle and precipitation merge
- **useWaterFetch** — one-time fetch on mount via `/api/water` (24h Redis cache)
- **useWaterPrecipPolling** — 6h recursive setTimeout for `/api/water/precip`
- **useWaterLayers** — deck.gl GeoJsonLayer (rivers) + IconLayer (facilities) + TextLayer (river labels in italic)
- **WaterFacilityDetail** — detail panel with all Aqueduct indicators, precipitation, attack status, coordinates
- **Full integration** — counters, search (type:dam, stress:high, name:, near:), proximity alerts — gated by water layer active
- **Attack status** — cross-references water facilities with GDELT events within 5km
- **Legend** — gradient bar from black to light blue via LEGEND_REGISTRY
- **Click guard** — `handleDeckClick` returns early for `water-river*` layer IDs
- **Layer stacking** — rivers after ethnic, water facilities at same z-level as entities
