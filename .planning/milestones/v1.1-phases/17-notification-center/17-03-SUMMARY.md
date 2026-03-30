---
phase: 17-notification-center
plan: 03
subsystem: ui
tags: [zustand, react, notifications, bell-icon, dropdown, fly-to-event, severity-ranking, news-matching]

# Dependency graph
requires:
  - phase: 17-01
    provides: "severity scoring (computeSeverityScore), news matching (matchNewsToEvent), time grouping (getTimeGroup)"
  - phase: 16
    provides: "newsStore with clusters for news headline matching"
  - phase: 8.1
    provides: "eventStore with ConflictEventEntity data"
provides:
  - "notificationStore with notifications array, readIds, unreadCount, flyToTarget"
  - "useNotifications hook deriving scored notifications from events + news"
  - "NotificationBell component with unread badge and dropdown"
  - "NotificationDropdown with time-grouped notification cards"
  - "NotificationCard with event info, coordinates, matched news headlines"
  - "FlyToHandler for map fly-to animation on notification click"
affects: [phase-19, phase-20]

# Tech tracking
tech-stack:
  added: []
  patterns: ["FlyToHandler child component inside Map for map.flyTo via useMap hook", "Outside-click + Escape dismiss pattern for dropdowns", "localStorage-persisted readIds surviving notification regeneration"]

key-files:
  created:
    - src/stores/notificationStore.ts
    - src/hooks/useNotifications.ts
    - src/components/layout/NotificationBell.tsx
    - src/components/notifications/NotificationDropdown.tsx
    - src/components/notifications/NotificationCard.tsx
    - src/__tests__/notificationStore.test.ts
    - src/__tests__/NotificationBell.test.tsx
  modified:
    - src/components/layout/AppShell.tsx
    - src/components/map/BaseMap.tsx

key-decisions:
  - "FlyToHandler as child of Map component (uses useMap hook, renders null) rather than ref-based approach"
  - "NotificationBell absolute positioning with detail panel offset transition matching FilterPanelSlot pattern"
  - "readIds persisted to localStorage as JSON array, loaded on store init with try/catch"
  - "markRead is idempotent (no-op if already read, no double-decrement)"

patterns-established:
  - "FlyToHandler pattern: null-rendering child component inside Map for imperative map operations"
  - "Dropdown dismiss pattern: mousedown + keydown listeners only active when dropdown is open"

requirements-completed: [NOTF-01, NOTF-02, NOTF-03]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 17 Plan 03: Notification Center UI Summary

**Notification bell with severity-ranked, time-grouped dropdown showing conflict events with matched news headlines and fly-to-event navigation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T22:28:10Z
- **Completed:** 2026-03-20T22:35:04Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Notification store with readIds persistence, unreadCount derivation, and flyToTarget for map animation
- useNotifications hook that derives scored, news-matched notifications from eventStore + newsStore
- Bell icon with unread badge (99+ cap), time-grouped dropdown, and notification cards with event info + matched news
- Click-to-navigate flow: markRead -> closeDropdown -> selectEntity -> openDetailPanel -> flyTo
- FlyToHandler child component in BaseMap for smooth map animation on notification click

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification store with flyToTarget and derivation hook** - `3d2b8ca` (feat)
2. **Task 2: Build bell icon, dropdown, notification cards, and wire fly-to into BaseMap** - `616e1f9` (feat)

## Files Created/Modified
- `src/stores/notificationStore.ts` - Zustand store with notifications, readIds, unreadCount, flyToTarget, localStorage persistence
- `src/hooks/useNotifications.ts` - Derives scored notifications from events + news with 7-day window
- `src/components/layout/NotificationBell.tsx` - Bell button with unread badge, outside-click/Escape dismiss, detail panel offset
- `src/components/notifications/NotificationDropdown.tsx` - Dropdown with time-grouped sections, "Mark all read" link, empty state
- `src/components/notifications/NotificationCard.tsx` - Card with event type icon/label, location, coords, 0-3 matched news headlines
- `src/components/layout/AppShell.tsx` - Added useNotifications hook call and NotificationBell component
- `src/components/map/BaseMap.tsx` - Added FlyToHandler child component for map.flyTo animation
- `src/__tests__/notificationStore.test.ts` - 9 store tests (set, markRead, markAllRead, persistence, flyTo)
- `src/__tests__/NotificationBell.test.tsx` - 7 component tests (aria-label, badge, toggle, dismiss)

## Decisions Made
- FlyToHandler as child of Map component: uses useMap() hook which only works inside Map context; renders null (behavior-only), following CompassControl/ProximityAlertOverlay pattern
- NotificationBell absolute positioning with detail panel offset transition: matches FilterPanelSlot's right offset pattern for consistent layout behavior
- readIds persisted as JSON array in localStorage: loaded on store init, persisted on markRead/markAllRead, survives notification regeneration cycles
- markRead idempotent: checks readIds.has() before decrementing to prevent double-decrement bugs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing flaky test in severity.test.ts ("ranks wmd and airstrike equally") fails intermittently due to Date.now() timing difference between two makeEvent() calls causing recency decay divergence. Not caused by this plan's changes. Out of scope per deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Notification center UI complete with all core interactions
- Plan 17-04 (proximity alerts) already completed in wave 1
- Phase 17 is now fully complete, ready for Phase 18 (Oil Markets Tracker)

---
*Phase: 17-notification-center*
*Completed: 2026-03-20*
