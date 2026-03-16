---
phase: 05-entity-rendering
plan: 01
subsystem: ui
tags: [deck.gl, IconLayer, canvas-atlas, zustand, animation, maplibre]

# Dependency graph
requires:
  - phase: 04-flight-data-feed
    provides: "FlightEntity[] in flightStore, useFlightPolling pipeline"
provides:
  - "Entity rendering layer with 4 IconLayer types (flight, ship, drone, missile)"
  - "Canvas icon atlas with chevron, diamond, starburst, xmark shapes"
  - "Pulse animation for unidentified flights (0.7-1.0 opacity, 2s period)"
  - "Altitude-based opacity for regular flights (0.6-1.0)"
  - "Entity color constants and icon size configuration"
affects: [entity-interaction, ship-data, conflict-events, ui-panels]

# Tech tracking
tech-stack:
  added: []
  patterns: [canvas-icon-atlas, mask-mode-tinting, rAF-throttled-animation, entity-layer-hook]

key-files:
  created:
    - src/components/map/layers/constants.ts
    - src/components/map/layers/icons.ts
    - src/hooks/useEntityLayers.ts
    - src/test/__mocks__/deck-gl-layers.ts
    - src/__tests__/entityLayers.test.ts
  modified:
    - src/types/ui.ts
    - src/stores/uiStore.ts
    - src/components/map/BaseMap.tsx
    - vite.config.ts

key-decisions:
  - "Canvas icon atlas with mask mode for getColor tinting instead of pre-colored PNGs"
  - "Graceful canvas fallback in jsdom (skip drawing, return blank canvas) instead of full canvas npm package"
  - "Explicit null check for heading instead of negation to avoid -0 vs 0 edge case"
  - "Static layers in separate useMemo with empty deps for ship/drone/missile (Phase 6 ready)"

patterns-established:
  - "Entity layer hook pattern: useEntityLayers() returns IconLayer[] for DeckGLOverlay"
  - "Canvas icon atlas: 128x32 sprite sheet with ICON_MAPPING for Deck.gl mask mode"
  - "Pulse animation: rAF loop throttled to ~15fps, controlled by pulseEnabled store toggle"
  - "Altitude opacity: linear 0.6-1.0 mapping from 0m-13000m ceiling"

requirements-completed: [MAP-02]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 5 Plan 1: Entity Rendering Summary

**Deck.gl IconLayer entity rendering with canvas icon atlas, altitude-based opacity, and pulse animation for unidentified flights**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T21:30:33Z
- **Completed:** 2026-03-15T21:34:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Flight entities render as green directional chevrons rotated to heading with altitude-based opacity
- Unidentified flights render as yellow chevrons with pulsing opacity animation (0.7-1.0 at 2s period)
- Ship, drone, and missile layer infrastructure in place with correct icons/colors (awaiting Phase 6 data)
- 37 unit tests covering constants, icon mapping, uiStore pulse, and hook layer configuration
- Full test suite passes (119 tests across 19 files) with TypeScript strict compilation clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Entity rendering constants, icon atlas, uiStore update, and unit tests** - `1926594` (test)
2. **Task 2: useEntityLayers hook with pulse animation and BaseMap wiring** - `7f1b877` (feat)

## Files Created/Modified
- `src/components/map/layers/constants.ts` - Entity colors, icon sizes, altitude-to-opacity, pulse config
- `src/components/map/layers/icons.ts` - Canvas icon atlas (chevron, diamond, starburst, xmark) with ICON_MAPPING
- `src/hooks/useEntityLayers.ts` - Hook returning 4 IconLayer instances driven by Zustand store
- `src/test/__mocks__/deck-gl-layers.ts` - Mock IconLayer for jsdom test compatibility
- `src/__tests__/entityLayers.test.ts` - 37 unit tests for constants, icons, store, and hook
- `src/types/ui.ts` - Added pulseEnabled and togglePulse to UIState
- `src/stores/uiStore.ts` - Added pulseEnabled (default true) and togglePulse action
- `src/components/map/BaseMap.tsx` - Wired useEntityLayers() into DeckGLOverlay layers prop
- `vite.config.ts` - Added @deck.gl/layers mock alias for tests

## Decisions Made
- Canvas icon atlas with Deck.gl mask mode for getColor tinting -- avoids pre-colored PNG assets, keeps all coloring dynamic
- Graceful canvas fallback in jsdom (return blank canvas) instead of requiring the canvas npm package -- keeps dev dependencies lean
- Explicit null check for heading (`heading === null ? 0 : -heading`) to avoid JavaScript's -0 edge case with negation
- Static ship/drone/missile layers in separate useMemo with empty deps -- ready for Phase 6 data without recalculating every render

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed -0 from negating null-coalesced heading**
- **Found during:** Task 2 (useEntityLayers hook)
- **Issue:** `-(d.data.heading ?? 0)` produces `-0` when heading is null, failing strict equality with `0`
- **Fix:** Changed to explicit null check: `d.data.heading === null ? 0 : -d.data.heading`
- **Files modified:** src/hooks/useEntityLayers.ts
- **Verification:** Test for null heading returns exactly `0` (not `-0`)
- **Committed in:** 7f1b877 (Task 2 commit)

**2. [Rule 3 - Blocking] Added graceful canvas context fallback for jsdom**
- **Found during:** Task 2 (useEntityLayers hook tests)
- **Issue:** `getIconAtlas()` threw "Canvas 2D context not available" in jsdom which lacks canvas
- **Fix:** Return blank cached canvas when 2D context is null instead of throwing
- **Files modified:** src/components/map/layers/icons.ts
- **Verification:** All 37 tests pass without canvas npm package
- **Committed in:** 7f1b877 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and test compatibility. No scope creep.

## Issues Encountered
- Vitest v4.1.0 does not support `-x` flag (used `--bail` equivalent or no flag) -- adjusted verification commands accordingly

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entity rendering layer fully operational for live flight data
- Ship/drone/missile layers ready -- just need store data from Phase 6
- Pulse animation toggle available via uiStore for future UI controls
- All 119 tests pass, TypeScript strict compilation clean

## Self-Check: PASSED

All created files verified on disk. Both task commits (1926594, 7f1b877) verified in git history.

---
*Phase: 05-entity-rendering*
*Completed: 2026-03-15*
