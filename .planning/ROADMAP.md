# Roadmap: Iran Conflict Monitor

## Overview

This roadmap delivers a personal real-time intelligence dashboard for monitoring the Iran conflict. It starts with project scaffolding and the interactive 2.5D map, then builds the backend proxy and data adapters one source at a time, layers on entity rendering, and progressively adds UI controls (toggles, detail panels, filters) and analytics. Each phase delivers a coherent, verifiable capability -- from an empty dark map to a fully filterable, data-rich intelligence surface.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Scaffolding & Theme** - React/Vite/TypeScript project with dark theme layout shell
- [x] **Phase 2: Base Map** - Interactive 2.5D map of Iran with pan, zoom, rotate
- [ ] **Phase 3: API Proxy** - Express backend for CORS handling, API key management, data normalization
- [x] **Phase 4: Flight Data Feed** - Live flight tracking via OpenSky Network with ~5s refresh (completed 2026-03-15)
- [x] **Phase 5: Entity Rendering** - Type-specific entity markers on the map (completed 2026-03-15)
- [ ] **Phase 6: ADS-B Exchange Data Source** - ADS-B Exchange as alternative flight data source with UI toggle to switch between OpenSky and ADS-B
- [ ] **Phase 7: adsb.lol Data Source** - adsb.lol as third flight data source (free, no API key, 30s polling)
- [ ] **Phase 8: Ship & Conflict Data Feeds** - AIS ship tracking and ACLED conflict event data
- [ ] **Phase 9: Layer Controls & News Toggle** - Layer visibility toggles and news content control
- [x] **Phase 10: Detail Panel** - Click-to-inspect panel showing live entity stats (completed 2026-03-18)
- [x] **Phase 11: Smart Filters** - Advanced filtering by nationality, speed, altitude, proximity, date range (completed 2026-03-18)
- [ ] **Phase 12: Analytics Dashboard** - Running counters for strikes, sorties, and intercepts

## Phase Details

### Phase 1: Project Scaffolding & Theme
**Goal**: A runnable application shell exists with the dark theme layout, ready to receive map and data components
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-02
**Success Criteria** (what must be TRUE):
  1. Running `npm run dev` launches the app in a browser with hot reload working
  2. The app displays a dark-themed shell with the black/white grid layout and accent color variables (blue, red, green, yellow) defined
  3. TypeScript compilation passes with strict mode enabled
  4. The project structure has clear directories for components, hooks, stores, and API modules
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — Scaffold Vite project, dark theme, AppShell with floating overlay regions

### Phase 2: Base Map
**Goal**: Users see an interactive 2.5D map of Iran and can navigate it freely
**Depends on**: Phase 1
**Requirements**: MAP-01
**Success Criteria** (what must be TRUE):
  1. A 2.5D map renders centered on Iran using Deck.gl + MapLibre with the dark base style
  2. User can pan, zoom, and rotate/tilt the map smoothly with mouse and keyboard
  3. The map fills the main content area of the dark-themed layout
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Install map deps, create mapStore + DeckGLOverlay + test mocks + Wave 0 stubs
- [x] 02-02-PLAN.md — Build BaseMap with overlays (vignette, loading, coords, compass), wire into AppShell
- [x] 02-03-PLAN.md — Fix terrain tiles (global DEM), full-screen ripple loading, faint vignette (UAT gap closure)

### Phase 3: API Proxy
**Goal**: A backend proxy handles all external API calls, shielding the frontend from CORS issues and API key exposure
**Depends on**: Phase 1
**Requirements**: INFRA-01
**Success Criteria** (what must be TRUE):
  1. Express server runs and proxies requests to OpenSky, AIS, and ACLED APIs
  2. API keys are stored in environment variables and never exposed to the browser
  3. Proxy returns normalized data in a common `MapEntity` format
  4. CORS headers are correctly set so the React frontend can fetch from the proxy without errors
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Server foundation: Express 5 scaffold, MapEntity types, config, cache, dev workflow
- [x] 03-02-PLAN.md — Data adapters: OpenSky, AISStream, ACLED with routes, normalization, and tests
- [ ] 03-03-PLAN.md — Fix eager config crash and missing .env dev script failure (UAT gap closure)

### Phase 4: Flight Data Feed
**Goal**: Live flight positions in the Iran region stream into the application at near-real-time refresh rates
**Depends on**: Phase 2, Phase 3
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):
  1. Flight positions within the Iran bounding box are fetched from OpenSky Network via the proxy
  2. Data refreshes approximately every 5 seconds without manual user action
  3. Flight data is stored in the Zustand state and available for rendering
  4. Stale or dropped connections are handled gracefully (auto-retry, no crash)
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Server-side: onGround filter, unidentified flag, cache-first route optimization
- [ ] 04-02-PLAN.md — Frontend: Zustand flight store, polling hook with tab visibility, Vite dev proxy

### Phase 5: Entity Rendering
**Goal**: All data entities appear on the map as visually distinct, type-specific markers
**Depends on**: Phase 4
**Requirements**: MAP-02
**Success Criteria** (what must be TRUE):
  1. Flight entities render on the map with an aircraft-style icon/marker
  2. Different entity types (ships, flights, missiles, drones) have visually distinct icons that are immediately distinguishable
  3. Markers update position on the map as new data arrives without full re-render
  4. Entity markers follow the color scheme (blue=naval/friendly, red=hostile/strikes, green=safe, yellow=warning)
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — Entity layer constants, canvas icon atlas, useEntityLayers hook, BaseMap wiring
- [x] 05-02-PLAN.md — Zoom-responsive icon sizing with meter-based sizeUnits (UAT gap closure)

### Phase 6: ADS-B Exchange Data Source
**Goal**: Users can switch between OpenSky and ADS-B Exchange as their flight data source via a simple toggle button
**Depends on**: Phase 4, Phase 5
**Requirements**: DATA-04
**Success Criteria** (what must be TRUE):
  1. ADS-B Exchange (free tier) is integrated as a second flight data source via the server proxy
  2. A toggle button in the UI switches the active flight data source between OpenSky and ADS-B Exchange
  3. Switching sources replaces flight data seamlessly — same entity rendering, same polling cadence
  4. If ADS-B Exchange rate limits are hit, the user is informed via a visible status message
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Server-side ADS-B Exchange adapter, route dispatch with per-source caching, rate limit handling
- [ ] 06-02-PLAN.md — Frontend flightStore source awareness, polling hook refactor for source-specific URL/interval
- [ ] 06-03-PLAN.md — SourceSelector UI dropdown with connection status badge, AppShell wiring

### Phase 7: adsb.lol Data Source
**Goal**: Users can select adsb.lol as a third flight data source — free, no API key, community-driven, 30s polling
**Depends on**: Phase 6
**Requirements**: DATA-04
**Success Criteria** (what must be TRUE):
  1. adsb.lol is integrated as a third flight data source via the server proxy (same V2 response format as ADS-B Exchange)
  2. The SourceSelector dropdown shows three options: OpenSky, ADS-B Exchange, adsb.lol
  3. No API key is required — adsb.lol is free and unauthenticated
  4. Polling interval is 30 seconds (respectful of community API with dynamic rate limits)
  5. Same 250 NM radius geographic query from Iran center as ADS-B Exchange
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Server-side: shared V2 normalizer extraction, adsb-lol adapter, /api/sources endpoint, route dispatch for 3 sources
- [ ] 07-02-PLAN.md — Frontend: FlightSource type extension, store default to adsblol, 30s polling, SourceSelector with 3 options and disabled state

### Phase 8: Ship & Conflict Data Feeds
**Goal**: Ship positions and conflict events flow into the application alongside flight data
**Depends on**: Phase 3, Phase 5
**Requirements**: DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Ship positions from AIS data appear on the map with ~30-60 second refresh
  2. Conflict events (missiles, drones, strikes) from ACLED appear on the map with 1-5 minute polling
  3. All three data sources (flights, ships, conflict events) render simultaneously on the map
  4. Each data source refreshes independently at its own rate without blocking the others
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Ship/event stores, polling hooks, entity layer wiring, ACLED country expansion
- [ ] 08-02-PLAN.md — HUD status panel replacing SourceSelector, AppShell wiring of all three polling hooks

### Phase 08.1: Add GDELT as default conflict event source (INSERTED)

**Goal:** GDELT v2 replaces ACLED as the default conflict event source -- free, no auth, 15-minute update cycle
**Requirements**: DATA-03
**Depends on:** Phase 8
**Success Criteria** (what must be TRUE):
  1. Conflict events are fetched from GDELT v2 exports (not ACLED) via the server proxy
  2. Events are filtered to Middle East conflict codes (CAMEO 18/19/20) and normalized to ConflictEventEntity[]
  3. Server starts without ACLED credentials (no crash)
  4. Event polling interval is 15 minutes (matching GDELT update cycle)
  5. All existing tests pass with updated data source
**Plans:** 2/2 plans complete

Plans:
- [x] 08.1-01-PLAN.md — GDELT v2 adapter with TDD (fetch, unzip, parse, filter, normalize)
- [x] 08.1-02-PLAN.md — Wire GDELT into system (route swap, config fix, cache/polling interval updates)

### Phase 9: Layer Controls & News Toggle
**Goal**: Users can show or hide entire categories of data and control non-statistical content visibility
**Depends on**: Phase 8
**Requirements**: CTRL-01, CTRL-04
**Success Criteria** (what must be TRUE):
  1. Toggle buttons exist for each entity type: ships, flights, missiles, drones
  2. Toggling a layer off immediately hides all entities of that type from the map; toggling on restores them
  3. Non-statistical news content is hidden by default
  4. A dedicated toggle reveals/hides non-statistical news content
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Toggle state + localStorage persistence, GDELT metadata passthrough, entity layer filtering
- [ ] 09-02-PLAN.md — LayerTogglesSlot UI panel, DeckGL tooltip wiring for GDELT event metadata

### Phase 10: Detail Panel
**Goal**: Users can click any entity on the map and see its live stats in a detail panel
**Depends on**: Phase 9
**Requirements**: CTRL-02
**Success Criteria** (what must be TRUE):
  1. Clicking an entity on the map opens a detail panel showing live stats (speed, heading, origin, coordinates, metadata)
  2. The detail panel updates in real-time as new data arrives for the selected entity
  3. Clicking elsewhere on the map or pressing a close button dismisses the panel
  4. The detail panel does not obscure the selected entity on the map
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md — Foundation: useSelectedEntity hook, DetailValue flash component, CSS animation, AppShell layout repositioning (panels to left), BaseMap click handler fix
- [ ] 10-02-PLAN.md — Detail panel content: FlightDetail, ShipDetail, EventDetail sections, DetailPanelSlot rewrite with dismiss, clipboard, relative time, lost contact

### Phase 11: Smart Filters
**Goal**: Users can narrow the displayed data using advanced multi-criteria filters
**Depends on**: Phase 10
**Requirements**: CTRL-03
**Success Criteria** (what must be TRUE):
  1. Filter controls exist for nationality, speed range, altitude range, proximity radius, and date range
  2. Applying filters immediately updates which entities are visible on the map
  3. Multiple filters can be combined (e.g., nationality=Iran AND speed>500)
  4. Clearing all filters restores the full unfiltered view
  5. Active filter state is visible to the user (they can see what filters are applied)
**Plans**: 3 plans

Plans:
- [x] 11-01-PLAN.md — Filter store, types, haversine utility, pure filter predicate with TDD
- [x] 11-02-PLAN.md — useFilteredEntities hook, useEntityLayers refactor, StatusPanel filter awareness, proximity circle layer
- [x] 11-03-PLAN.md — Filter panel UI (country, speed, altitude, proximity, date), BaseMap pin placement, AppShell wiring

### Phase 12: Analytics Dashboard
**Goal**: Users see running numerical counters that summarize conflict activity at a glance
**Depends on**: Phase 11
**Requirements**: STAT-01
**Success Criteria** (what must be TRUE):
  1. A counters dashboard displays running tallies for strikes, sorties, and intercepts
  2. Counters update automatically as new conflict event data arrives
  3. The dashboard is visible alongside the map without requiring navigation away from the map view
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12
(Phases 2 and 3 can execute in parallel as they are independent.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Scaffolding & Theme | 1/1 | Complete | 2026-03-14 |
| 2. Base Map | 3/3 | Complete | 2026-03-14 |
| 3. API Proxy | 2/3 | In progress (gap closure) | - |
| 4. Flight Data Feed | 0/2 | Complete | 2026-03-15 |
| 5. Entity Rendering | 2/2 | Complete | 2026-03-16 |
| 6. ADS-B Exchange Data Source | 0/3 | Not started | - |
| 7. adsb.lol Data Source | 0/2 | Not started | - |
| 8. Ship & Conflict Data Feeds | 0/2 | Not started | - |
| 08.1. GDELT Event Source | 2/2 | Complete    | 2026-03-17 |
| 9. Layer Controls & News Toggle | 0/2 | Not started | - |
| 10. Detail Panel | 2/2 | Complete    | 2026-03-18 |
| 11. Smart Filters | 3/3 | Complete    | 2026-03-18 |
| 12. Analytics Dashboard | 0/? | Not started | - |
