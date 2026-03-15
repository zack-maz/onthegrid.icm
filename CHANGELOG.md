# Changelog

All notable changes to the Iran Conflict Monitor project.

## [Unreleased]

### Phase 3: API Proxy (Planned)
- Express 5 backend with CORS handling and API key management
- MapEntity discriminated union types (flight, ship, missile, drone)
- OpenSky adapter (OAuth2, ~15s polling, bbox filter)
- AISStream adapter (WebSocket, real-time ship data)
- ACLED adapter (conflict events, last 7 days)
- In-memory cache with staleness indicators
- Separate endpoints: /api/flights, /api/ships, /api/events
- Concurrent dev workflow (Vite + Express via concurrently)

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
