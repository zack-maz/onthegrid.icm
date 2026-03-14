# Roadmap: Iran Conflict Monitor

## Overview

This roadmap delivers a personal real-time intelligence dashboard for monitoring the Iran conflict. It starts with project scaffolding and the interactive 2.5D map, then builds the backend proxy and data adapters one source at a time, layers on entity rendering, and progressively adds UI controls (toggles, detail panels, filters) and analytics. Each phase delivers a coherent, verifiable capability -- from an empty dark map to a fully filterable, data-rich intelligence surface.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Scaffolding & Theme** - React/Vite/TypeScript project with dark theme layout shell
- [ ] **Phase 2: Base Map** - Interactive 2.5D map of Iran with pan, zoom, rotate
- [ ] **Phase 3: API Proxy** - Express backend for CORS handling, API key management, data normalization
- [ ] **Phase 4: Flight Data Feed** - Live flight tracking via OpenSky Network with ~5s refresh
- [ ] **Phase 5: Entity Rendering** - Type-specific entity markers on the map
- [ ] **Phase 6: Ship & Conflict Data Feeds** - AIS ship tracking and ACLED conflict event data
- [ ] **Phase 7: Layer Controls & News Toggle** - Layer visibility toggles and news content control
- [ ] **Phase 8: Detail Panel** - Click-to-inspect panel showing live entity stats
- [ ] **Phase 9: Smart Filters** - Advanced filtering by nationality, speed, altitude, proximity, date range
- [ ] **Phase 10: Analytics Dashboard** - Running counters for strikes, sorties, and intercepts

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
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Install map deps, create mapStore + DeckGLOverlay + test mocks + Wave 0 stubs
- [ ] 02-02-PLAN.md — Build BaseMap with overlays (vignette, loading, coords, compass), wire into AppShell

### Phase 3: API Proxy
**Goal**: A backend proxy handles all external API calls, shielding the frontend from CORS issues and API key exposure
**Depends on**: Phase 1
**Requirements**: INFRA-01
**Success Criteria** (what must be TRUE):
  1. Express server runs and proxies requests to OpenSky, AIS, and ACLED APIs
  2. API keys are stored in environment variables and never exposed to the browser
  3. Proxy returns normalized data in a common `MapEntity` format
  4. CORS headers are correctly set so the React frontend can fetch from the proxy without errors
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Flight Data Feed
**Goal**: Live flight positions in the Iran region stream into the application at near-real-time refresh rates
**Depends on**: Phase 2, Phase 3
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):
  1. Flight positions within the Iran bounding box are fetched from OpenSky Network via the proxy
  2. Data refreshes approximately every 5 seconds without manual user action
  3. Flight data is stored in the Zustand state and available for rendering
  4. Stale or dropped connections are handled gracefully (auto-retry, no crash)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Entity Rendering
**Goal**: All data entities appear on the map as visually distinct, type-specific markers
**Depends on**: Phase 4
**Requirements**: MAP-02
**Success Criteria** (what must be TRUE):
  1. Flight entities render on the map with an aircraft-style icon/marker
  2. Different entity types (ships, flights, missiles, drones) have visually distinct icons that are immediately distinguishable
  3. Markers update position on the map as new data arrives without full re-render
  4. Entity markers follow the color scheme (blue=naval/friendly, red=hostile/strikes, green=safe, yellow=warning)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Ship & Conflict Data Feeds
**Goal**: Ship positions and conflict events flow into the application alongside flight data
**Depends on**: Phase 3, Phase 5
**Requirements**: DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Ship positions from AIS data appear on the map with ~30-60 second refresh
  2. Conflict events (missiles, drones, strikes) from ACLED appear on the map with 1-5 minute polling
  3. All three data sources (flights, ships, conflict events) render simultaneously on the map
  4. Each data source refreshes independently at its own rate without blocking the others
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Layer Controls & News Toggle
**Goal**: Users can show or hide entire categories of data and control non-statistical content visibility
**Depends on**: Phase 6
**Requirements**: CTRL-01, CTRL-04
**Success Criteria** (what must be TRUE):
  1. Toggle buttons exist for each entity type: ships, flights, missiles, drones
  2. Toggling a layer off immediately hides all entities of that type from the map; toggling on restores them
  3. Non-statistical news content is hidden by default
  4. A dedicated toggle reveals/hides non-statistical news content
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Detail Panel
**Goal**: Users can click any entity on the map and see its live stats in a detail panel
**Depends on**: Phase 7
**Requirements**: CTRL-02
**Success Criteria** (what must be TRUE):
  1. Clicking an entity on the map opens a detail panel showing live stats (speed, heading, origin, coordinates, metadata)
  2. The detail panel updates in real-time as new data arrives for the selected entity
  3. Clicking elsewhere on the map or pressing a close button dismisses the panel
  4. The detail panel does not obscure the selected entity on the map
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Smart Filters
**Goal**: Users can narrow the displayed data using advanced multi-criteria filters
**Depends on**: Phase 8
**Requirements**: CTRL-03
**Success Criteria** (what must be TRUE):
  1. Filter controls exist for nationality, speed range, altitude range, proximity radius, and date range
  2. Applying filters immediately updates which entities are visible on the map
  3. Multiple filters can be combined (e.g., nationality=Iran AND speed>500)
  4. Clearing all filters restores the full unfiltered view
  5. Active filter state is visible to the user (they can see what filters are applied)
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

### Phase 10: Analytics Dashboard
**Goal**: Users see running numerical counters that summarize conflict activity at a glance
**Depends on**: Phase 9
**Requirements**: STAT-01
**Success Criteria** (what must be TRUE):
  1. A counters dashboard displays running tallies for strikes, sorties, and intercepts
  2. Counters update automatically as new conflict event data arrives
  3. The dashboard is visible alongside the map without requiring navigation away from the map view
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10
(Phases 2 and 3 can execute in parallel as they are independent.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Scaffolding & Theme | 1/1 | Complete | 2026-03-14 |
| 2. Base Map | 1/2 | In progress | - |
| 3. API Proxy | 0/? | Not started | - |
| 4. Flight Data Feed | 0/? | Not started | - |
| 5. Entity Rendering | 0/? | Not started | - |
| 6. Ship & Conflict Data Feeds | 0/? | Not started | - |
| 7. Layer Controls & News Toggle | 0/? | Not started | - |
| 8. Detail Panel | 0/? | Not started | - |
| 9. Smart Filters | 0/? | Not started | - |
| 10. Analytics Dashboard | 0/? | Not started | - |
