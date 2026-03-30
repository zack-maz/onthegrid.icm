---
phase: 20-layer-purpose-refactor
plan: 03
subsystem: testing
tags: [vitest, zustand, react-testing-library, refactor, toggle-removal]

# Dependency graph
requires:
  - phase: 20-01
    provides: Toggle-free uiStore, layerStore, simplified hooks
  - phase: 20-02
    provides: Updated UI components, visualization layer toggles, MapLegend
provides:
  - "Full green test suite validating toggle-free architecture"
  - "New layerStore test suite (6 tests for Set-based toggle behavior)"
  - "New MapLegend test suite (3 tests for empty state and exports)"
  - "All 8 existing test files updated to match toggle-free interfaces"
affects: [sub-phases 20.1-20.5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Toggle-free test assertions: verify entities always visible, no toggle gating"
    - "SyncableState filter-only interface in test mocks"

key-files:
  created:
    - src/__tests__/layerStore.test.ts
    - src/__tests__/MapLegend.test.tsx
  modified:
    - src/__tests__/uiStore.test.ts
    - src/__tests__/entityLayers.test.ts
    - src/__tests__/useCounterData.test.ts
    - src/__tests__/LayerToggles.test.tsx
    - src/__tests__/BaseMap.test.tsx
    - src/__tests__/StatusPanel.test.tsx
    - src/__tests__/CountersSlot.test.tsx
    - src/hooks/useQuerySync.test.ts

key-decisions:
  - "Removed 717 lines of toggle-related test code across 8 files (net -717 LOC)"
  - "StatusPanel tests verify unconditional counts instead of toggle-gated zero counts"
  - "useQuerySync tests import buildASTFromFilters (renamed from buildASTFromToggles) and SyncableState (filter-only)"
  - "LayerToggles.test.tsx fully rewritten for 6 visualization layers via layerStore"

patterns-established:
  - "Test toggle-free stores: assert property absence with not.toHaveProperty for removed fields"
  - "Visualization layer tests: interact with layerStore directly rather than mocking uiStore"

requirements-completed: [LREF-01, LREF-02, LREF-03, LREF-04, LREF-05]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 20 Plan 03: Test Suite Update for Toggle-Free Architecture Summary

**Updated 8 existing test files and created 2 new test suites (layerStore, MapLegend) to validate toggle-free architecture with 787 tests passing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T05:20:24Z
- **Completed:** 2026-03-23T05:27:24Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Removed all entity toggle assertions from 8 existing test files (717 lines deleted)
- Created layerStore test suite with 6 tests verifying Set-based toggle add/remove/multiple/reset behavior
- Created MapLegend test suite with 3 tests verifying empty state, empty registry, and exports
- Full test suite passes: 787 tests across 64 files, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Update existing tests for toggle-free architecture** - `3e2c02d` (test)
2. **Task 2: Create new layerStore and MapLegend tests** - `ee20f7d` (test)

## Files Created/Modified
- `src/__tests__/layerStore.test.ts` - New: 6 tests for Set-based VisualizationLayerId toggle behavior
- `src/__tests__/MapLegend.test.tsx` - New: 3 tests for empty state, empty registry, exports
- `src/__tests__/uiStore.test.ts` - Removed toggle defaults/actions/persistence tests, added toggle absence assertions
- `src/__tests__/entityLayers.test.ts` - Removed visibility toggle describe block, added always-visible behavior tests
- `src/__tests__/useCounterData.test.ts` - Removed toggle-gated count tests (pulseEnabled, showGroundTraffic, showFlights, showShips, showEvents)
- `src/__tests__/LayerToggles.test.tsx` - Fully rewritten: 6 visualization layer toggles via layerStore instead of 18 entity toggles via uiStore
- `src/__tests__/BaseMap.test.tsx` - Removed toggle-gated tooltip suppression tests (showAirstrikes, showEvents), kept search filter suppression
- `src/__tests__/StatusPanel.test.tsx` - Removed 9 toggle-gated count tests, added 3 unconditional counting tests
- `src/__tests__/CountersSlot.test.tsx` - Removed toggle state setup from beforeEach
- `src/hooks/useQuerySync.test.ts` - Removed TYPE_TOGGLE_MAP, deriveTogglesFromAST, buildASTFromToggles tests; updated to buildASTFromFilters and filter-only SyncableState

## Decisions Made
- Removed 717 lines of toggle-related test code that asserted on deleted interfaces
- StatusPanel gets 3 new tests verifying unconditional counting (flights including ground, all ships, all events)
- LayerToggles test completely rewritten rather than patched, since the component was fully replaced in Plan 02
- useQuerySync test DEFAULT_STATE trimmed from 30+ fields to 17 filter-only fields matching new SyncableState
- BaseMap tooltip tests simplified to verify tooltips always show (no toggle gating) while keeping search filter suppression tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full test suite green (787 tests, 64 files)
- TypeScript compiles clean
- Phase 20 Layer Purpose Refactor is complete (all 3 plans done)
- Ready for sub-phases 20.1-20.5 to implement visualization layer content

## Self-Check: PASSED

All 10 files verified present. Both task commits (3e2c02d, ee20f7d) verified in git log.

---
*Phase: 20-layer-purpose-refactor*
*Completed: 2026-03-23*
