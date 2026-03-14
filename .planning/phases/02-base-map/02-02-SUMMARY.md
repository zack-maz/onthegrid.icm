---
phase: 02-base-map
plan: 02
subsystem: map
tags: [maplibre-gl, react-maplibre, deck.gl, terrain, carto-dark-matter, zustand, overlay-ui]

# Dependency graph
requires:
  - phase: 02-base-map-plan-01
    provides: Map dependencies, mapStore, DeckGLOverlay bridge, test mocks, Wave 0 test stubs
provides:
  - BaseMap component with CARTO Dark Matter tiles, 3D terrain, style customization
  - MapLoadingScreen with pulse animation and fade-out transition
  - MapVignette with radial gradient scope effect
  - CoordinateReadout displaying live cursor lat/lon from mapStore
  - CompassControl with double-click reset to default view
  - Map constants (view state, bounds, style URL, terrain config, layer IDs)
  - AppShell wired with BaseMap replacing placeholder
  - 5 activated tests replacing Wave 0 todo stubs (MAP-01a, MAP-01d, MAP-01e, MAP-01f)
affects: [base-map-plan-03, entity-rendering, layer-controls, detail-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [imperative-style-customization-in-onLoad, terrain-dem-source-with-hillshade, overlaid-deckgl-mode, useMap-hook-for-compass-reset]

key-files:
  created:
    - src/components/map/constants.ts
    - src/components/map/BaseMap.tsx
    - src/components/map/MapLoadingScreen.tsx
    - src/components/map/MapVignette.tsx
    - src/components/map/CoordinateReadout.tsx
    - src/components/map/CompassControl.tsx
  modified:
    - src/components/layout/AppShell.tsx
    - src/__tests__/BaseMap.test.tsx
    - src/__tests__/CoordinateReadout.test.tsx
    - src/__tests__/MapLoadingScreen.test.tsx

key-decisions:
  - "Imperative style customization in onLoad callback with getLayer() guards for safe property modification"
  - "Separate waterway line-color vs fill-color handling for correct CARTO Dark Matter layer types"
  - "Zustand selector pattern (s => s.field) in BaseMap to minimize re-renders"
  - "CoordinateReadout positioned as sibling after Map element for z-index stacking"
  - "CompassControl uses useMap hook with DOM querySelector for compass button double-click binding"

patterns-established:
  - "Map style customization: hide/modify layers imperatively in onLoad, never pre-fetch/modify style.json"
  - "Overlay component pattern: behavior-only components (render null) mounted inside Map children"
  - "Map constant extraction: all view state, bounds, layer IDs in constants.ts to prevent re-render allocations"
  - "Mock Map onLoad capture: test mock captures onLoad callback via __capturedOnLoad for simulating map load events"

requirements-completed: [MAP-01]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 2 Plan 02: Base Map Components Summary

**Interactive 2.5D CARTO Dark Matter map of Iran with terrain, style customization (hidden road labels, bright borders, blue water), compass reset, coordinate readout, vignette, and loading screen -- all wired into AppShell with 5 passing component tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T22:52:43Z
- **Completed:** 2026-03-14T22:56:46Z
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 10

## Accomplishments

- Built BaseMap with CARTO Dark Matter tiles, 3D terrain (raster-dem + hillshade), deck.gl overlay, and imperative style customization (hidden road labels/minor features, brightened borders, blue-tinted water)
- Created 4 overlay components: MapLoadingScreen (pulse + fade), MapVignette (radial gradient), CoordinateReadout (live lat/lon from store), CompassControl (double-click reset via useMap)
- Wired BaseMap into AppShell replacing the placeholder div, with NavigationControl (compass only), ScaleControl, and all overlays
- Activated 5 real tests from Wave 0 todo stubs: BaseMap renders (MAP-01a), road labels hidden (MAP-01d), DeckGLOverlay wired (MAP-01b), CoordinateReadout displays coords (MAP-01e), MapLoadingScreen fades (MAP-01f)
- All 30 tests passing across the full suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Create map constants, BaseMap, and all overlay components** - `2abf9ff` (feat)
2. **Task 2: Wire BaseMap into AppShell and activate test stubs** - `59603cd` (feat)
3. **Task 3: Visual verification of interactive 2.5D map** - Human-verified (approved)

## Files Created/Modified

- `src/components/map/constants.ts` - Map configuration: initial view state, max bounds, CARTO style URL, terrain config, layer ID arrays
- `src/components/map/BaseMap.tsx` - Main map component with Map, Source, Layer, controls, deck.gl overlay, and onLoad style customization
- `src/components/map/MapLoadingScreen.tsx` - Absolute overlay with pulse animation, opacity transition on load
- `src/components/map/MapVignette.tsx` - Pointer-events-none radial gradient for scope effect
- `src/components/map/CoordinateReadout.tsx` - Live lat/lon readout from mapStore with N/S/E/W formatting
- `src/components/map/CompassControl.tsx` - Behavior-only component binding double-click on compass to flyTo reset
- `src/components/layout/AppShell.tsx` - Replaced placeholder div with BaseMap import and render
- `src/__tests__/BaseMap.test.tsx` - 2 tests: renders container, hides road labels on load
- `src/__tests__/CoordinateReadout.test.tsx` - 1 test: displays formatted coordinates from store
- `src/__tests__/MapLoadingScreen.test.tsx` - 2 tests: shows loading state, fades out when loaded

## Decisions Made

- Used imperative style customization in onLoad with getLayer() guards rather than pre-fetching/modifying the CARTO style.json -- follows research anti-pattern guidance
- Handled waterway as line layer (line-color) vs water/water_shadow as fill layers (fill-color) for correct CARTO Dark Matter layer types
- Used Zustand selector pattern (`s => s.field`) for each field in BaseMap to minimize re-renders
- Positioned CoordinateReadout as a sibling div after Map (not inside Map children) for independent z-index stacking
- CompassControl renders null (behavior-only) and uses DOM querySelector for `.maplibregl-ctrl-compass` button

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BaseMap fully functional with all overlay UI, ready for terrain tile fix and polish in Plan 03 (gap closure)
- DeckGLOverlay mounted with empty layers array, ready to receive entity layers in Phase 5
- mapStore cursor position flowing to CoordinateReadout, ready for entity click events in Phase 8
- All test infrastructure active with 30 passing tests, ready for Plan 03 regression checks

## Self-Check: PASSED

All 10 key files verified present. Both task commits (2abf9ff, 59603cd) verified in git log. SUMMARY.md created.

---
*Phase: 02-base-map*
*Completed: 2026-03-14*
