---
phase: 19-search-filter-ui-cleanup
plan: 01
subsystem: ui
tags: [react, zustand, tailwind, sidebar, topbar, layout]

# Dependency graph
requires:
  - phase: 17-notification-center
    provides: NotificationBell component, notification store
  - phase: 18-oil-markets-tracker
    provides: MarketsSlot component, market store
provides:
  - Topbar component with title, status dropdown, search hint, notification bell
  - Sidebar component with icon strip and expandable content panel
  - SidebarSection reusable collapsible wrapper
  - StatusDropdown showing 6 data source health dots
  - UtcClock bottom-left component
  - UIState sidebar state (isSidebarOpen, activeSidebarSection, sidebar actions)
  - CSS theme variables for layout dimensions
affects: [19-02-PLAN, 19-03-PLAN, 19-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [sidebar icon-strip + content-panel pattern, extracted content components for reuse]

key-files:
  created:
    - src/components/layout/Topbar.tsx
    - src/components/layout/StatusDropdown.tsx
    - src/components/layout/Sidebar.tsx
    - src/components/layout/SidebarSection.tsx
    - src/components/layout/UtcClock.tsx
  modified:
    - src/components/layout/AppShell.tsx
    - src/components/layout/NotificationBell.tsx
    - src/components/layout/LayerTogglesSlot.tsx
    - src/components/layout/FilterPanelSlot.tsx
    - src/stores/uiStore.ts
    - src/types/ui.ts
    - src/styles/app.css
    - src/__tests__/AppShell.test.tsx

key-decisions:
  - "NotificationBell moved from absolute positioning to topbar flex layout (no longer detail-panel-aware)"
  - "LayerTogglesContent and FilterPanelContent extracted as separate exports for sidebar reuse"
  - "Iranian flights counter row removed per locked decision"
  - "Sidebar overlays map with absolute positioning (does not resize map)"
  - "Icon strip always visible; content panel slides with translate-x transition"
  - "StatusDropdown shows aggregate health dot plus per-source breakdown in dropdown"

patterns-established:
  - "Extracted content pattern: Slot components export inner Content component for sidebar embedding"
  - "Sidebar icon-strip: 48px icon column with accent highlight for active section"

requirements-completed: [SRCH-03]

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 19 Plan 01: Layout Restructure Summary

**Topbar + Sidebar layout replacing floating overlay panels, with StatusDropdown, icon strip navigation, and grouped Counters/Layers/Filters sections**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T19:36:19Z
- **Completed:** 2026-03-22T19:42:35Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Restructured AppShell from floating panel stack to Topbar + Sidebar + Map layout
- Created StatusDropdown with 6 data source health dots (flights, ships, events, sites, news, markets)
- Built Sidebar with icon strip (always visible) and expandable content panel containing Counters, Layers, and Filters sections
- Moved NotificationBell into topbar, UTC clock to bottom-left corner
- Removed "Iranian flights" counter row per locked decision
- All 54 test files and 652 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend uiStore + create Topbar, StatusDropdown, Sidebar, SidebarSection, UtcClock** - `d9360a3` (feat)
2. **Task 2: Restructure AppShell layout and update tests** - `bd7b280` (feat)

## Files Created/Modified
- `src/components/layout/Topbar.tsx` - Full-width topbar with StatusDropdown, Cmd+K search hint, NotificationBell
- `src/components/layout/StatusDropdown.tsx` - Clickable title with dropdown showing 6 data source health dots
- `src/components/layout/Sidebar.tsx` - Left sidebar with 48px icon strip and 280px expandable content panel
- `src/components/layout/SidebarSection.tsx` - Reusable collapsible section wrapper with icon, title, chevron
- `src/components/layout/UtcClock.tsx` - UTC clock in bottom-left corner
- `src/components/layout/AppShell.tsx` - Restructured to Topbar + Sidebar + Map + DetailPanel + MarketsSlot + UtcClock
- `src/components/layout/NotificationBell.tsx` - Removed absolute positioning for topbar flex layout
- `src/components/layout/LayerTogglesSlot.tsx` - Extracted LayerTogglesContent for sidebar reuse
- `src/components/layout/FilterPanelSlot.tsx` - Extracted FilterPanelContent for sidebar reuse
- `src/stores/uiStore.ts` - Added isSidebarOpen, activeSidebarSection, toggleSidebar, openSidebarSection, closeSidebar
- `src/types/ui.ts` - Added SidebarSection type and sidebar state/actions to UIState interface
- `src/styles/app.css` - Added --width-sidebar, --width-icon-strip, --height-topbar CSS vars
- `src/__tests__/AppShell.test.tsx` - Updated to validate new layout structure (topbar, sidebar, icon strip)

## Decisions Made
- NotificationBell moved from absolute positioning to topbar flex layout (no longer independently detail-panel-aware)
- LayerTogglesContent and FilterPanelContent extracted as separate exports so Sidebar can embed them without duplicating code
- Iranian flights counter row removed per locked decision
- Sidebar overlays map with absolute positioning (does not resize the map container)
- Icon strip always visible (48px); content panel slides in/out with CSS translate-x transition
- StatusDropdown shows aggregate health dot in collapsed state plus per-source breakdown in dropdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated AppShell test for combobox assertion**
- **Found during:** Task 2 (AppShell test update)
- **Issue:** Original test `queryByRole('combobox')` finding multiple combobox elements from FilterPanelContent country filter inputs now rendered inside Sidebar
- **Fix:** Changed test to assert old TitleSlot is not rendered instead of checking for SourceSelector combobox
- **Files modified:** src/__tests__/AppShell.test.tsx
- **Verification:** All 11 AppShell tests pass
- **Committed in:** bd7b280 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test adjustment necessary for correctness. No scope creep.

## Issues Encountered
None beyond the test adjustment documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Layout restructure complete, ready for Plan 02 (search modal with Cmd+K)
- Topbar search hint button exists as placeholder for Plan 02 to wire click handler
- Sidebar infrastructure ready for any future section additions

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 19-search-filter-ui-cleanup*
*Completed: 2026-03-22*
