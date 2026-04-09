---
phase: 27-conflict-geolocation-improvement
plan: 08
subsystem: ui
tags: [react, zustand, layer-toggles, filter-panel]

# Dependency graph
requires:
  - phase: 27-conflict-geolocation-improvement (plan 05)
    provides: EventMasterToggle + EventSubToggle components added to LayerTogglesSlot
  - phase: 27-conflict-geolocation-improvement (plan 04)
    provides: 5-type event taxonomy cascaded through filterStore and FilterPanelSlot
provides:
  - Clean LayerTogglesSlot with only 6 visualization layer toggles (no event toggles)
  - Single source of truth for event toggles in FilterPanelSlot
affects: [layer-controls, filter-panel, ui-consistency]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Visualization layers and entity filters are separate UI concerns in separate panels"

key-files:
  created: []
  modified:
    - src/components/layout/LayerTogglesSlot.tsx
    - src/__tests__/LayerToggles.test.tsx

key-decisions:
  - "Event toggles are entity filters, not visualization layers -- removed from Layers panel, kept solely in Filter panel"
  - "Test suite updated to assert absence of event toggles (negative assertions) and correct 6-toggle count"

patterns-established:
  - "LayerTogglesSlot only renders VisualizationLayerId toggles (geographic, weather, water, threat, political, ethnic)"
  - "Event type filtering lives exclusively in FilterPanelSlot via filterStore"

requirements-completed: [D-12]

# Metrics
duration: 2min
completed: 2026-04-09
---

# Phase 27 Plan 08: Remove Duplicate Event Toggles Summary

**Removed duplicate event toggles from LayerTogglesSlot, leaving only 6 visualization layer rows -- event toggles remain solely in FilterPanelSlot**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-09T20:50:09Z
- **Completed:** 2026-04-09T20:51:57Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed EventMasterToggle, EventSubToggle, and EVENT_SUB_TOGGLES config array from LayerTogglesSlot.tsx
- Removed unused imports (useFilterStore, EVENT_TYPE_COLORS) and separator div
- Updated test suite: replaced 12-toggle assertions with 6-toggle assertions plus negative event toggle checks
- File reduced from 240 lines to 115 lines (52% reduction)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove duplicate event toggles from LayerTogglesSlot** - `578f432` (fix)

## Files Created/Modified
- `src/components/layout/LayerTogglesSlot.tsx` - Removed all event toggle code (EventMasterToggle, EventSubToggle, EVENT_SUB_TOGGLES, filterStore/eventColors imports, separator)
- `src/__tests__/LayerToggles.test.tsx` - Updated to assert 6 viz-only toggles, added negative assertions for absent event toggles, removed filterStore setup

## Decisions Made
- Test file rewritten rather than patched -- cleaner to remove all event-toggle test cases and add explicit "does not render event toggles" negative assertions
- eventColors.ts module left in place (not deleted) since the plan scope is LayerTogglesSlot cleanup only; it is now an orphan import-wise but may be used by future code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test file to match component changes**
- **Found during:** Task 1 (Remove duplicate event toggles)
- **Issue:** Test file asserted 12 switch roles and presence of event toggles that no longer exist
- **Fix:** Rewrote test to assert 6 switches, added negative assertions for event toggle absence, removed filterStore beforeEach setup
- **Files modified:** src/__tests__/LayerToggles.test.tsx
- **Verification:** All 11 tests pass
- **Committed in:** 578f432 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Test update was necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LayerTogglesSlot is clean with only visualization layer toggles
- Event toggles exist solely in FilterPanelSlot (lines 316-364)
- Plan 07 (event type normalization / cache migration) addresses the remaining blocker (events not visible)

## Self-Check: PASSED

- All modified files exist on disk
- Task commit 578f432 found in git log
- Zero references to EventMasterToggle, useFilterStore, EVENT_TYPE_COLORS in LayerTogglesSlot.tsx
- 778 tests passing across 54 test files
- TypeScript typecheck clean (zero errors)

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
