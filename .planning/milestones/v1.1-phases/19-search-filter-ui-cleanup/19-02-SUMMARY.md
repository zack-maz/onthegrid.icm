---
phase: 19-search-filter-ui-cleanup
plan: 02
subsystem: ui
tags: [react, zustand, search, cmd-k, spotlight, cross-store]

# Dependency graph
requires:
  - phase: 19-search-filter-ui-cleanup
    provides: Topbar with search hint placeholder, sidebar layout, uiStore sidebar state
provides:
  - searchStore with query, modal open/close, filter mode, matchedIds
  - searchUtils pure functions for cross-entity substring matching
  - useSearchResults hook returning grouped results from all 4 entity stores
  - SearchModal Spotlight-style Cmd+K overlay with grouped results
  - SearchResultGroup and SearchResultItem display components
  - Topbar search hint wired to open modal
  - filterStore.clearAll extended to clear search state
affects: [19-03-PLAN, 19-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [cross-store search with useRef to avoid poll-cycle recomputation, TDD RED-GREEN for store+component]

key-files:
  created:
    - src/stores/searchStore.ts
    - src/lib/searchUtils.ts
    - src/hooks/useSearchResults.ts
    - src/components/search/SearchModal.tsx
    - src/components/search/SearchResultGroup.tsx
    - src/components/search/SearchResultItem.tsx
    - src/__tests__/searchStore.test.ts
    - src/__tests__/SearchModal.test.tsx
  modified:
    - src/stores/filterStore.ts
    - src/components/layout/Topbar.tsx

key-decisions:
  - "useSearchResults uses useRef for entity arrays to avoid recomputing on every poll cycle (only recomputes on query change)"
  - "SearchModal rendered inside Topbar component (uses z-modal to overlay everything)"
  - "closeSearchModal preserves query so user can re-open and see previous search"
  - "applyAsFilter closes modal and keeps query for filter mode"
  - "filterStore.clearAll extended to also call searchStore.clearSearch (Reset All clears search)"
  - "Results capped at 10 per entity type (40 total max) to prevent UI overflow"

patterns-established:
  - "Cross-store search pattern: useRef for latest entity data + useMemo keyed on query only"
  - "Spotlight modal pattern: fixed backdrop + centered container + global keydown listener"

requirements-completed: [SRCH-01, SRCH-02]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 19 Plan 02: Global Search Modal Summary

**Cmd+K Spotlight-style search modal with cross-store substring matching, grouped results by entity type, fly-to-entity selection, and Enter-to-filter mode**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T19:46:16Z
- **Completed:** 2026-03-22T19:51:54Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Implemented searchStore managing query state, modal open/close, filter mode, and matchedIds
- Built pure searchUtils functions for cross-entity substring matching (flights, ships, events, sites)
- Created useSearchResults hook with useRef pattern to avoid recomputing on every poll cycle
- Built SearchModal with Spotlight-style centered overlay, grouped results, fly-to-entity on click, Enter-to-filter
- Wired Topbar search hint button and Cmd+K global shortcut to open modal
- Extended filterStore.clearAll to also clear search state (Reset All behavior)
- Full TDD cycle: 19 store/util tests + 6 SearchModal component tests = 25 new tests, 689 total passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create searchStore, searchUtils, useSearchResults hook, and test stubs** - `cd08185` (feat)
2. **Task 2: Create SearchModal UI and wire Cmd+K shortcut + Topbar hint** - `1159741` (feat)

## Files Created/Modified
- `src/stores/searchStore.ts` - Search query, modal state, filter mode, matched entity IDs
- `src/lib/searchUtils.ts` - Pure search/matching functions for all entity types
- `src/hooks/useSearchResults.ts` - Cross-store entity search hook with useRef optimization
- `src/components/search/SearchModal.tsx` - Cmd+K Spotlight-style search modal with keyboard handling
- `src/components/search/SearchResultGroup.tsx` - Grouped results section with type header and count badge
- `src/components/search/SearchResultItem.tsx` - Individual result row with entity color dot and type badge
- `src/__tests__/searchStore.test.ts` - 19 tests for store, utils, and filterStore integration
- `src/__tests__/SearchModal.test.tsx` - 6 tests for modal rendering, keyboard shortcuts, input behavior
- `src/stores/filterStore.ts` - Extended clearAll to call searchStore.clearSearch
- `src/components/layout/Topbar.tsx` - Wired search hint onClick and renders SearchModal

## Decisions Made
- useSearchResults uses useRef for entity arrays to avoid recomputing on every poll cycle (only recomputes on query change) -- follows research Pitfall 2 guidance
- SearchModal rendered inside Topbar component rather than AppShell -- uses z-modal (40) to overlay everything regardless of parent position
- closeSearchModal preserves query so user can re-open and see previous search
- Results capped at 10 per entity type (40 total max) to keep the dropdown manageable
- filterStore.clearAll extended to also call searchStore.clearSearch for consistent Reset All behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Search infrastructure complete, ready for Plan 03 (smart filter presets)
- searchStore.isFilterMode and matchedIds available for useEntityLayers to consume in future plan
- SearchModal component can be extended with arrow key navigation as a stretch goal

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 19-search-filter-ui-cleanup*
*Completed: 2026-03-22*
