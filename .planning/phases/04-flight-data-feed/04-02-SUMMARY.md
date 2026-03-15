---
phase: 04-flight-data-feed
plan: 02
subsystem: frontend
tags: [zustand, polling, react-hooks, flight-data, vite-proxy]

# Dependency graph
requires:
  - phase: 04-flight-data-feed
    provides: Filtered flight pipeline with onGround filter, unidentified flag, cache-first route
  - phase: 03-api-proxy
    provides: Express server with /api/flights endpoint and EntityCache
provides:
  - Zustand flight store (useFlightStore) with FlightEntity array and connection metadata
  - Polling hook (useFlightPolling) with 5s interval, tab visibility awareness, stale data clearing
  - Vite dev proxy forwarding /api to localhost:3001
  - AppShell wired to start flight polling on mount
affects: [05-entity-rendering, flight-layer, counters, detail-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [recursive setTimeout polling, tab visibility API for pause/resume, Zustand getState() for staleness checks]

key-files:
  created:
    - src/stores/flightStore.ts
    - src/hooks/useFlightPolling.ts
    - src/__tests__/flightStore.test.ts
    - src/__tests__/useFlightPolling.test.ts
  modified:
    - vite.config.ts
    - src/components/layout/AppShell.tsx

key-decisions:
  - "Recursive setTimeout (not setInterval) for polling -- waits for async completion before scheduling next"
  - "60s stale threshold based on flight drift: 250m/s aircraft moves ~15km in 60s"
  - "Zustand getState() for staleness check avoids stale closures in setTimeout callback"
  - "Polling hook is behavior-only -- no return value, writes directly to Zustand store"

patterns-established:
  - "Recursive setTimeout polling pattern: fetchFlights().then(schedulePoll) for async-safe intervals"
  - "Tab visibility pause/resume: clear timeout on hidden, immediate fetch + resume on visible"
  - "Stale data clearing: automatic cache invalidation when lastFresh exceeds threshold"

requirements-completed: [DATA-01]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 4 Plan 2: Frontend Flight Polling Pipeline Summary

**Zustand flight store with 5s recursive polling, tab visibility pause/resume, and 60s stale data clearing via useFlightPolling hook**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T16:24:51Z
- **Completed:** 2026-03-15T16:27:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Zustand flight store with FlightEntity array, connection status (connected/stale/error/loading), and metadata (lastFetchAt, lastFresh, flightCount)
- Polling hook with recursive setTimeout at 5s interval, tab visibility awareness (pause on hidden, immediate fetch on visible), and automatic stale data clearing after 60s
- Vite dev proxy forwarding /api requests to localhost:3001 for seamless frontend-backend development
- AppShell wired to start polling on mount -- no manual user action needed
- 11 new tests (6 store state transitions, 5 polling lifecycle behaviors)
- All 82 tests pass across 18 test files, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Create flight store and polling hook with tests** - `b52fd73` (feat, TDD)
2. **Task 2: Add Vite dev proxy and wire polling into AppShell** - `9db03d4` (feat)

## Files Created/Modified
- `src/stores/flightStore.ts` - Zustand store with flight array, connection status, and state transition actions
- `src/hooks/useFlightPolling.ts` - Polling hook with 5s setTimeout, visibility API, staleness clearing
- `src/__tests__/flightStore.test.ts` - 6 tests for store state transitions (initial, connected, stale, error, loading, clear)
- `src/__tests__/useFlightPolling.test.ts` - 5 tests for polling lifecycle (mount fetch, interval, pause, resume, cleanup)
- `vite.config.ts` - Added server.proxy config forwarding /api to localhost:3001
- `src/components/layout/AppShell.tsx` - Added useFlightPolling() hook invocation

## Decisions Made
- Recursive setTimeout instead of setInterval -- waits for async fetch completion before scheduling next poll, preventing request pile-up
- 60s stale threshold based on flight physics: aircraft at 250m/s drift ~15km in 60s, making positions meaningfully outdated for intelligence use
- Used Zustand getState() inside setTimeout callback for staleness check -- avoids stale closure issue with captured React state
- Polling hook is behavior-only (no return value) -- writes directly to Zustand store, consumed by downstream components via selectors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Flight store populated automatically when both dev servers run (npm run dev + server)
- useFlightStore available for downstream phases: entity rendering layer, counters, detail panel
- ConnectionStatus type exported for UI indicators (connected/stale/error/loading)
- FlightEntity data includes unidentified flag for military/hex-only flight highlighting

## Self-Check: PASSED

- All 6 files verified present on disk
- Both task commits verified in git log (b52fd73, 9db03d4)
- All 82 tests passing across 18 test files
- TypeScript compiles with zero errors

---
*Phase: 04-flight-data-feed*
*Completed: 2026-03-15*
