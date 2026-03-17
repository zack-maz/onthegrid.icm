---
phase: 08-ship-conflict-data-feeds
plan: 01
subsystem: data
tags: [zustand, polling, acled, ships, events, deck.gl]

# Dependency graph
requires:
  - phase: 04-flight-data-feed
    provides: "Polling hook pattern (recursive setTimeout, tab visibility, stale threshold)"
  - phase: 05-entity-rendering
    provides: "useEntityLayers hook with static ship/drone/missile layers"
  - phase: 03-api-proxy
    provides: "ACLED adapter, /api/events endpoint, CacheResponse type"
provides:
  - "shipStore Zustand store with connection status and stale clearing"
  - "eventStore Zustand store for conflict events (no stale clearing)"
  - "useShipPolling hook (30s interval, 120s stale threshold)"
  - "useEventPolling hook (300s interval, no stale clearing)"
  - "Dynamic entity layers wired to real store data"
  - "ACLED multi-country query (16 Greater Middle East countries)"
affects: [08-02, entity-rendering, map-layers, data-feeds]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ship/event stores follow flightStore pattern (curried create, ConnectionStatus)"
    - "Polling hooks follow useFlightPolling pattern (recursive setTimeout, tab visibility)"
    - "Event type filtering via useMemo for drone/missile layer separation"

key-files:
  created:
    - src/stores/shipStore.ts
    - src/stores/eventStore.ts
    - src/hooks/useShipPolling.ts
    - src/hooks/useEventPolling.ts
    - src/__tests__/shipStore.test.ts
    - src/__tests__/eventStore.test.ts
    - src/__tests__/useShipPolling.test.ts
    - src/__tests__/useEventPolling.test.ts
  modified:
    - src/hooks/useEntityLayers.ts
    - server/adapters/acled.ts
    - server/__tests__/adapters/acled.test.ts
    - src/__tests__/entityLayers.test.ts

key-decisions:
  - "120s stale threshold for ships (slower than flights, positions drift ~1km at 15 knots)"
  - "No stale clearing for events (historical data never goes stale)"
  - "Separate useMemo per entity layer (ships, drones, missiles) with individual dependencies"
  - "ACLED expanded to 16 pipe-separated countries covering Greater Middle East"

patterns-established:
  - "Ship/event store pattern: simplified flightStore without activeSource or localStorage"
  - "Polling hook pattern: empty dependency array for non-source-specific hooks"
  - "Event type filtering: useMemo filter by type for drone/missile separation"

requirements-completed: [DATA-02, DATA-03]

# Metrics
duration: 6min
completed: 2026-03-17
---

# Phase 8 Plan 01: Ship & Event Data Feeds Summary

**Ship and event Zustand stores with 30s/300s polling hooks, dynamic entity layers wired to real data, and ACLED expanded to 16 Greater Middle East countries**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-17T02:03:01Z
- **Completed:** 2026-03-17T02:09:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created shipStore and eventStore Zustand stores with connection status tracking
- Built useShipPolling (30s interval, 120s stale threshold) and useEventPolling (300s, no stale clearing) hooks
- Wired real store data into entity layers (ship, drone, missile) replacing empty stub arrays
- Expanded ACLED adapter from Iran-only to 16 Greater Middle East countries
- 75 tests pass across 6 test files (33 new tests added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Ship and event stores, polling hooks, and ACLED expansion**
   - `5186f68` (test): add failing tests for ship/event stores and polling hooks
   - `f8248e5` (feat): add ship/event stores, polling hooks, and ACLED multi-country expansion
2. **Task 2: Wire entity layers to real store data** - `82ab9d0` (feat)

## Files Created/Modified
- `src/stores/shipStore.ts` - Zustand store for ship data with stale clearing
- `src/stores/eventStore.ts` - Zustand store for conflict events (no stale clearing)
- `src/hooks/useShipPolling.ts` - 30s recursive setTimeout polling with tab visibility
- `src/hooks/useEventPolling.ts` - 300s recursive setTimeout polling with tab visibility
- `src/hooks/useEntityLayers.ts` - Dynamic entity layers with real store data
- `server/adapters/acled.ts` - Expanded to 16 Greater Middle East countries
- `src/__tests__/shipStore.test.ts` - 7 tests for ship store
- `src/__tests__/eventStore.test.ts` - 6 tests for event store
- `src/__tests__/useShipPolling.test.ts` - 7 tests for ship polling hook
- `src/__tests__/useEventPolling.test.ts` - 6 tests for event polling hook
- `server/__tests__/adapters/acled.test.ts` - Updated multi-country query tests
- `src/__tests__/entityLayers.test.ts` - Updated entity layer data flow tests

## Decisions Made
- 120s stale threshold for ships (slower-moving than aircraft, positions drift ~1km at 15 knots)
- No stale clearing for conflict events (historical data from ACLED never goes stale)
- Separate useMemo per entity layer with individual dependency arrays for efficient re-rendering
- ACLED expanded to 16 pipe-separated countries for Greater Middle East coverage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- ACLED test used `decodeURIComponent` which does not decode `+` to space (URLSearchParams encoding). Fixed by adding `.replace(/\+/g, ' ')` before assertions.
- Ship polling stale threshold test used exactly 120s (4 cycles of 30s) but the check is `> 120_000` (strictly greater). Fixed by adding a 5th poll cycle to push past the threshold.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ship and event data plumbing complete, ready for Plan 02 (AppShell wiring)
- Polling hooks need to be wired into AppShell (like useFlightPolling)
- Store data flows through entity layers automatically

---
*Phase: 08-ship-conflict-data-feeds*
*Completed: 2026-03-17*
