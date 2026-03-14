---
phase: 02-base-map
plan: 01
subsystem: map
tags: [maplibre-gl, deck.gl, react-maplibre, zustand, vitest, mocks]

# Dependency graph
requires:
  - phase: 01-project-scaffolding-theme
    provides: Vite + React + TypeScript scaffold, Zustand curried pattern, Vitest infrastructure
provides:
  - Map dependencies installed (maplibre-gl, @vis.gl/react-maplibre, deck.gl packages)
  - Zustand map store with cursor coordinates and load status
  - DeckGLOverlay bridge component (useControl + MapboxOverlay)
  - Test mocks for maplibre-gl and @deck.gl/mapbox in jsdom
  - Wave 0 test stubs for BaseMap, CoordinateReadout, MapLoadingScreen
affects: [base-map-plan-02, entity-rendering, layer-controls]

# Tech tracking
tech-stack:
  added: [maplibre-gl@5.20.1, "@vis.gl/react-maplibre@8.1.0", "@deck.gl/core@9.2.11", "@deck.gl/react@9.2.11", "@deck.gl/mapbox@9.2.11", "@deck.gl/layers@9.2.11"]
  patterns: [deckgl-overlay-via-useControl, maplibre-jsdom-mocking, wave-0-todo-stubs]

key-files:
  created:
    - src/stores/mapStore.ts
    - src/components/map/DeckGLOverlay.tsx
    - src/test/__mocks__/maplibre-gl.ts
    - src/test/__mocks__/deck-gl-mapbox.ts
    - src/test/__mocks__/maplibre-gl-css.ts
    - src/__tests__/mapStore.test.ts
    - src/__tests__/DeckGLOverlay.test.tsx
    - src/__tests__/BaseMap.test.tsx
    - src/__tests__/CoordinateReadout.test.tsx
    - src/__tests__/MapLoadingScreen.test.tsx
  modified:
    - package.json
    - vite.config.ts

key-decisions:
  - "Mocked maplibre-gl and @deck.gl/mapbox via vite.config.ts test.alias for jsdom compatibility"
  - "Used it.todo() for unimplemented component stubs to avoid import errors while keeping test presence"
  - "Created CSS import mock (maplibre-gl-css.ts) to suppress CSS import errors in test environment"

patterns-established:
  - "Test alias mocking: register WebGL-dependent libraries in vite.config.ts test.alias pointing to src/test/__mocks__/"
  - "Wave 0 stubs: use it.todo() for tests referencing unimplemented components -- Plan 02 will convert to real tests"
  - "MapboxOverlay bridge: DeckGLOverlay component wraps MapboxOverlay via useControl hook from react-maplibre"

requirements-completed: [MAP-01]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 2 Plan 01: Map Foundation Summary

**MapLibre + Deck.gl dependencies installed with Zustand map store, DeckGLOverlay bridge component, jsdom test mocks, and 5 Wave 0 test stubs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T22:13:33Z
- **Completed:** 2026-03-14T22:16:11Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Installed all 6 map packages (maplibre-gl, @vis.gl/react-maplibre, @deck.gl/core, @deck.gl/react, @deck.gl/mapbox, @deck.gl/layers)
- Created mapStore with cursor coordinates and load status following the established Zustand curried pattern
- Created DeckGLOverlay bridge component using useControl + MapboxOverlay pattern from deck.gl docs
- Built comprehensive test mocks for maplibre-gl (Map, NavigationControl, ScaleControl, Marker) and @deck.gl/mapbox (MapboxOverlay)
- Added 4 passing tests (3 mapStore + 1 DeckGLOverlay) and 5 todo stubs for Plan 02 components
- All 25 tests passing across the full suite (21 Phase 1 + 4 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install map dependencies, create mapStore and DeckGLOverlay** - `bc8ecd3` (feat)
2. **Task 2: Create test mocks and all Wave 0 test stubs** - `dc66f23` (test)

## Files Created/Modified

- `src/stores/mapStore.ts` - Zustand store for map state (isMapLoaded, cursorLng, cursorLat, actions)
- `src/components/map/DeckGLOverlay.tsx` - useControl wrapper bridging deck.gl MapboxOverlay into MapLibre
- `src/test/__mocks__/maplibre-gl.ts` - Mock Map, NavigationControl, ScaleControl, Marker for jsdom
- `src/test/__mocks__/deck-gl-mapbox.ts` - Mock MapboxOverlay with setProps for jsdom
- `src/test/__mocks__/maplibre-gl-css.ts` - Empty mock for maplibre-gl CSS import
- `src/__tests__/mapStore.test.ts` - 3 passing tests: initial state, setMapLoaded, setCursorPosition
- `src/__tests__/DeckGLOverlay.test.tsx` - 1 passing test: useControl + MapboxOverlay wiring
- `src/__tests__/BaseMap.test.tsx` - 2 todo stubs for MAP-01a, MAP-01d
- `src/__tests__/CoordinateReadout.test.tsx` - 1 todo stub for MAP-01e
- `src/__tests__/MapLoadingScreen.test.tsx` - 2 todo stubs for MAP-01f
- `package.json` - Added 6 map dependencies
- `vite.config.ts` - Added test.alias entries for maplibre-gl and @deck.gl/mapbox mocks

## Decisions Made

- Registered mocks via vite.config.ts test.alias rather than vi.mock() in each file -- cleaner, project-wide mock resolution
- Used it.todo() for unimplemented component stubs to avoid import errors while maintaining test file presence for Wave 0 compliance
- Created a separate CSS mock file for maplibre-gl/dist/maplibre-gl.css to prevent CSS import failures in jsdom

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Map dependencies installed and type-checked, ready for BaseMap component in Plan 02
- mapStore provides cursor and load state that BaseMap, CoordinateReadout, and MapLoadingScreen will consume
- DeckGLOverlay is ready to be placed inside the Map component as a child
- All test mocks in place so Plan 02 can write real tests for map components in jsdom
- 5 todo stubs serve as test contracts for Plan 02 to implement against

## Self-Check: PASSED

All 11 key files verified present. Both task commits (bc8ecd3, dc66f23) verified in git log.

---
*Phase: 02-base-map*
*Completed: 2026-03-14*
