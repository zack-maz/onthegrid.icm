---
phase: 19-search-filter-ui-cleanup
plan: 03
subsystem: ui
tags: [zustand, deck.gl, search, filter, escape-key, entity-layers]

# Dependency graph
requires:
  - phase: 19-search-filter-ui-cleanup
    provides: searchStore, searchUtils, useSearchResults (plan 02)
provides:
  - Search filter dimming in entity layers (SEARCH_DIM_ALPHA=15)
  - FilterChip component for active search query display
  - Centralized Escape key handler with priority stack
  - matchedIds refresh on entity data change during active filter
affects: [search, entity-layers, sidebar, detail-panel, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized escape key priority stack, search filter alpha dimming]

key-files:
  created:
    - src/components/ui/FilterChip.tsx
    - src/hooks/useEscapeKeyHandler.ts
  modified:
    - src/hooks/useEntityLayers.ts
    - src/hooks/useSearchResults.ts
    - src/components/map/BaseMap.tsx
    - src/components/layout/Sidebar.tsx
    - src/components/layout/AppShell.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - src/components/layout/NotificationBell.tsx
    - src/components/search/SearchModal.tsx

key-decisions:
  - "SEARCH_DIM_ALPHA=15 for near-invisible non-matching entities (distinct from DIM_ALPHA=40 active entity dimming)"
  - "Centralized useEscapeKeyHandler hook replaces per-component Escape listeners for conflict-free priority"
  - "Glow/highlight layers hidden for non-matched entities during search filter (not just dimmed)"
  - "Tooltip suppression for non-matching entities in BaseMap via searchStore state check"

patterns-established:
  - "Centralized Escape key handler: modal > filter > notification > detail panel priority stack"
  - "Search filter dimming: SEARCH_DIM_ALPHA check before activeId DIM_ALPHA check in getColor"

requirements-completed: [SRCH-01, SRCH-03]

# Metrics
duration: 7min
completed: 2026-03-22
---

# Phase 19 Plan 03: Search Filter Integration Summary

**Search-as-filter entity dimming with FilterChip display and centralized Escape key priority stack**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T20:01:15Z
- **Completed:** 2026-03-22T20:08:47Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Non-matching entities render at alpha 15 (near invisible) when search filter is active across all 6 entity layers
- FilterChip pill component shows active search query in sidebar Filters section with dismiss button
- Centralized Escape key handler implements priority: search modal > search filter > notification dropdown > detail panel
- matchedIds auto-refresh when entity data changes during active filter mode (poll cycle safety)
- Hover tooltips suppressed for non-matching entities; glow/highlight layers hidden for non-matched

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire search filter dimming into useEntityLayers and EntityTooltip** - `df0f31f` (feat)
2. **Task 2: Add FilterChip component and Escape key priority** - `ee5d966` (feat)

## Files Created/Modified
- `src/hooks/useEntityLayers.ts` - Added SEARCH_DIM_ALPHA and searchStore reads to all entity layer getColor accessors
- `src/components/map/BaseMap.tsx` - Added tooltip suppression for non-matching entities during search filter
- `src/hooks/useSearchResults.ts` - Added useEffect to refresh matchedIds when entity data changes during active filter
- `src/components/ui/FilterChip.tsx` - New pill component with magnifying glass icon, truncated label, X dismiss button
- `src/hooks/useEscapeKeyHandler.ts` - New centralized Escape key handler with 4-level priority stack
- `src/components/layout/Sidebar.tsx` - Renders FilterChip in Filters section when search filter active
- `src/components/layout/AppShell.tsx` - Wires useEscapeKeyHandler hook
- `src/components/layout/DetailPanelSlot.tsx` - Removed individual Escape handler (now centralized)
- `src/components/layout/NotificationBell.tsx` - Removed individual Escape handler (now centralized)
- `src/components/search/SearchModal.tsx` - Removed individual Escape handler (now centralized)
- `src/__tests__/DetailPanel.test.tsx` - Updated Escape test for centralized handler
- `src/__tests__/NotificationBell.test.tsx` - Updated Escape test for centralized handler
- `src/__tests__/SearchModal.test.tsx` - Updated Escape test for centralized handler

## Decisions Made
- SEARCH_DIM_ALPHA=15 chosen to be much dimmer than DIM_ALPHA=40 (active entity dimming), making non-matching entities near-invisible per locked decision "highly transparent"
- Centralized useEscapeKeyHandler reads store state directly via getState() (not selectors) to avoid subscription overhead and ensure priority ordering within a single event handler
- Glow/highlight layers set to invisible (not just dimmed) for non-matched entities -- cleaner visual since the glow effect at alpha 15 would be invisible anyway
- Tooltip suppression added in BaseMap.tsx (where tooltip gating already existed) rather than in EntityTooltip.tsx itself

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tests for centralized Escape handling**
- **Found during:** Task 2 (Escape key priority)
- **Issue:** 3 existing tests (DetailPanel, NotificationBell, SearchModal) fired Escape via component-level handlers that were removed
- **Fix:** Updated tests to verify store actions directly since Escape is now centralized in AppShell
- **Files modified:** src/__tests__/DetailPanel.test.tsx, src/__tests__/NotificationBell.test.tsx, src/__tests__/SearchModal.test.tsx
- **Verification:** All 689 tests pass
- **Committed in:** ee5d966 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test updates were necessary consequence of centralizing Escape handling. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Search/filter integration complete: all plan 19 tasks finished
- Phase 19 ready for merge to main
- All 689 tests passing

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 19-search-filter-ui-cleanup*
*Completed: 2026-03-22*
