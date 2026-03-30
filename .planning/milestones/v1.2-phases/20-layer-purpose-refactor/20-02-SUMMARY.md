---
phase: 20-layer-purpose-refactor
plan: 02
subsystem: ui
tags: [zustand, react, visualization-layers, legend-framework, toggle-cleanup]

requires:
  - phase: 20-01
    provides: layerStore with VisualizationLayerId type and toggle API
provides:
  - UI components free of entity toggle references
  - Visualization layer toggle UI (6 layers) connected to layerStore
  - MapLegend component with LegendConfig interface and LEGEND_REGISTRY
  - Unconditional entity counts in StatusDropdown and StatusPanel
affects: [20-03, sub-phases 20.1-20.5]

tech-stack:
  added: []
  patterns:
    - LayerToggleRow component pattern for hooks-safe store access in .map() loops
    - LegendConfig registry pattern for sub-phase legend registration

key-files:
  created:
    - src/components/map/MapLegend.tsx
  modified:
    - src/components/map/BaseMap.tsx
    - src/components/layout/StatusDropdown.tsx
    - src/components/ui/StatusPanel.tsx
    - src/components/layout/FilterPanelSlot.tsx
    - src/components/layout/LayerTogglesSlot.tsx

key-decisions:
  - "LayerToggleRow wrapper component prevents hooks-in-loop violation when iterating LAYER_CONFIGS"
  - "VisibilityButton component file kept as dead code (not deleted) since it may be referenced by tests"
  - "Sites section removed entirely from FilterPanelSlot (no filter controls remain for sites)"

patterns-established:
  - "LayerToggleRow: Zustand hook wrapped in per-item component for .map() iteration safety"
  - "LEGEND_REGISTRY: empty array pattern for sub-phase registration of visualization legends"

requirements-completed: [LREF-03, LREF-04]

duration: 4min
completed: 2026-03-23
---

# Phase 20 Plan 02: UI Toggle Cleanup and Legend Framework Summary

**Removed all entity toggle consumption from UI components, replaced layer toggles with 6 visualization layer controls, and built MapLegend inline legend framework**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T05:13:36Z
- **Completed:** 2026-03-23T05:17:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Removed isEntityTooltipVisible gating from BaseMap -- tooltips now show for all entities
- Simplified StatusDropdown and StatusPanel to unconditional entity counts (no toggle gating)
- Removed all VisibilityButton usages and entity toggle selectors from FilterPanelSlot
- Replaced 18-row entity toggle UI with 6 visualization layer toggles connected to layerStore
- Created MapLegend component with LegendConfig interface and empty LEGEND_REGISTRY ready for sub-phases

## Task Commits

Each task was committed atomically:

1. **Task 1: Update components that consumed entity toggle state** - `e85ef3e` (feat)
2. **Task 2: Replace layer toggles UI + build legend framework** - `29e5e42` (feat)

## Files Created/Modified
- `src/components/map/MapLegend.tsx` - New legend framework with LegendConfig, LEGEND_REGISTRY, and MapLegend component
- `src/components/map/BaseMap.tsx` - Removed isEntityTooltipVisible, removed toggle imports, added MapLegend
- `src/components/layout/StatusDropdown.tsx` - Simplified to unconditional entity counts
- `src/components/ui/StatusPanel.tsx` - Simplified to unconditional entity counts
- `src/components/layout/FilterPanelSlot.tsx` - Removed VisibilityButton, BooleanToggle, and all toggle selectors
- `src/components/layout/LayerTogglesSlot.tsx` - Replaced entity toggles with 6 visualization layer toggles

## Decisions Made
- LayerToggleRow wrapper component created to prevent hooks-in-loop violation when iterating LAYER_CONFIGS with .map()
- VisibilityButton.tsx component file left in place (dead code) rather than deleted, since test files may import it
- Sites section removed entirely from FilterPanelSlot since no filter controls (only visibility toggles) existed for sites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hooks-in-loop violation in LayerTogglesContent**
- **Found during:** Task 2 (Replace layer toggles UI)
- **Issue:** Initial implementation called useLayerStore inside .map() callback, violating Rules of Hooks
- **Fix:** Extracted LayerToggleRow as a separate component that wraps the hook call
- **Files modified:** src/components/layout/LayerTogglesSlot.tsx
- **Verification:** TypeScript compiles clean, no React hook warnings
- **Committed in:** 29e5e42 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix for React hook rules compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UI components clean of entity toggle references
- LayerTogglesSlot connected to layerStore with 6 visualization layers
- MapLegend framework ready for sub-phases 20.1-20.5 to register their legends
- Plan 03 can proceed with useEntityLayers and rendering pipeline cleanup

---
*Phase: 20-layer-purpose-refactor*
*Completed: 2026-03-23*
