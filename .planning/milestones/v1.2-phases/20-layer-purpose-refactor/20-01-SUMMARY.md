---
phase: 20-layer-purpose-refactor
plan: 01
subsystem: ui
tags: [zustand, react-hooks, state-management, refactor]

# Dependency graph
requires:
  - phase: 19.1-advanced-search
    provides: Query sync bidirectional system, filterStore
provides:
  - "Entity toggle state fully removed from UIState and uiStore"
  - "New layerStore with Set-based VisualizationLayerId state"
  - "Simplified useEntityLayers rendering all entities unconditionally"
  - "Simplified useCounterData counting all entities unconditionally"
  - "Simplified useProximityAlerts using all sites"
  - "Simplified useQuerySync syncing only filter state (no toggle mapping)"
affects: [20-02-PLAN, 20-03-PLAN, LayerTogglesSlot, FilterPanelSlot, StatusPanel, BaseMap, Topbar, Sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Set-based layer toggle pattern in layerStore (add/delete on new Set)"
    - "Always-visible entity rendering (no toggle gating on Deck.gl layers)"

key-files:
  created:
    - src/stores/layerStore.ts
  modified:
    - src/types/ui.ts
    - src/stores/uiStore.ts
    - src/hooks/useEntityLayers.ts
    - src/hooks/useProximityAlerts.ts
    - src/components/counters/useCounterData.ts
    - src/hooks/useQuerySync.ts

key-decisions:
  - "readBool kept in uiStore for isMarketsCollapsed persistence (only remaining localStorage usage)"
  - "Pulse animation always active (no pulseEnabled toggle) since unidentified flights always render"
  - "CONFLICT_TOGGLE_GROUPS keys preserved as event type grouping constants (structural, not visibility)"
  - "buildASTFromToggles renamed to buildASTFromFilters to reflect new purpose"
  - "SyncableState stripped of all 15 toggle fields, keeping only filter fields"

patterns-established:
  - "Always-visible entities: Deck.gl layers never use visible prop for toggle gating"
  - "Filter-only narrowing: search/filter system is the only way to reduce visible entities"

requirements-completed: [LREF-01, LREF-02, LREF-05]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 20 Plan 01: Toggle Removal and LayerStore Summary

**Removed 18 entity toggle fields from UIState/uiStore, created Set-based layerStore for visualization layers, and simplified 4 hooks to render all entities unconditionally**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T05:04:34Z
- **Completed:** 2026-03-23T05:10:34Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Deleted LayerToggles interface, LAYER_TOGGLE_DEFAULTS, and all 18 toggle fields/functions from UIState
- Created layerStore.ts with VisualizationLayerId type and Set-based toggle state
- Simplified useEntityLayers to render all entity types unconditionally (flights, ships, events, sites)
- Simplified useCounterData to count all entities without toggle gating
- Simplified useProximityAlerts to check all sites (not just toggle-visible ones)
- Stripped useQuerySync of all toggle sync maps, derivation functions, and SyncableState toggle fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove entity toggles from types/uiStore + create layerStore** - `d316498` (feat)
2. **Task 2: Simplify hooks that consumed toggle state** - `35125dc` (refactor)

## Files Created/Modified
- `src/stores/layerStore.ts` - New visualization layer store with Set-based VisualizationLayerId state
- `src/types/ui.ts` - Removed LayerToggles interface, LAYER_TOGGLE_DEFAULTS, 18 toggle fields/functions from UIState
- `src/stores/uiStore.ts` - Stripped toggle state, persistence functions, initialization from store
- `src/hooks/useEntityLayers.ts` - All entities always visible, pulse always active, sites filtered by proximity only
- `src/hooks/useProximityAlerts.ts` - Uses all sites directly (removed toggle filtering and useUIStore import)
- `src/components/counters/useCounterData.ts` - Counts all entities unconditionally (removed useUIStore import)
- `src/hooks/useQuerySync.ts` - Removed toggle sync maps/derivation, renamed buildASTFromToggles to buildASTFromFilters

## Decisions Made
- Kept readBool in uiStore since it's still used for isMarketsCollapsed persistence
- Pulse animation runs unconditionally (no early return when disabled) since unidentified flights always render
- CONFLICT_TOGGLE_GROUPS preserved as event type grouping constants for splitting events into separate Deck.gl layers
- Renamed buildASTFromToggles to buildASTFromFilters to clarify its new scope
- Removed TYPE_TOGGLE_MAP, TOGGLE_TYPE_MAP, SITE_TOGGLE_MAP, BOOL_TAG_MAP, CONFLICT_EVENT_TYPES, and deriveTogglesFromAST entirely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Component files (LayerTogglesSlot, FilterPanelSlot, StatusPanel, BaseMap, Topbar, StatusDropdown) still reference removed toggle state and will fail TypeScript compilation
- These are expected errors addressed in Plan 02 (UI component updates)
- Test files (uiStore.test.ts, LayerToggles.test.tsx) also need updating in Plan 02

## Self-Check: PASSED

All 7 files verified present. Both task commits (d316498, 35125dc) verified in git log.

---
*Phase: 20-layer-purpose-refactor*
*Completed: 2026-03-23*
