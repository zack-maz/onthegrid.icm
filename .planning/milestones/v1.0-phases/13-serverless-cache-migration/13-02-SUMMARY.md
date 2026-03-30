---
phase: 13-serverless-cache-migration
plan: 02
subsystem: infra
tags: [redis, aisstream, websocket, serverless, ships]

# Dependency graph
requires:
  - phase: 13-serverless-cache-migration
    provides: Redis cache module (cacheGet/cacheSet) from Plan 01
  - phase: 08-ship-ais-data
    provides: AISStream adapter, ships route, ShipEntity type
provides:
  - On-demand collectShips() replacing persistent WebSocket
  - Redis-backed ships route with merge/prune logic
  - Stateless ship data fetching for serverless compatibility
affects: [13-03, 14-vercel-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: ["On-demand WebSocket connect-collect-close", "Redis merge/prune accumulator for ship data"]

key-files:
  created:
    - server/__tests__/routes/ships.test.ts
  modified:
    - server/adapters/aisstream.ts
    - server/routes/ships.ts
    - server/index.ts
    - server/__tests__/adapters/aisstream.test.ts
    - server/__tests__/routes/flights.test.ts

key-decisions:
  - "On-demand WebSocket pattern: connect, collect for N ms, close -- no persistent connections"
  - "Ship merge/prune: fresh ships merged with cached by ID, ships older than 10 min pruned"
  - "30s logical TTL / 300s Redis hard TTL for ships cache"

patterns-established:
  - "On-demand WebSocket: open, collect for configurable window (AISSTREAM_COLLECT_MS), close and return"
  - "Redis merge/prune: seed Map from cached data, overwrite with fresh, prune by timestamp age"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 13 Plan 02: AISStream + Ships Route Migration Summary

**On-demand WebSocket collectShips() replacing persistent connection, ships route migrated to Redis cache with merge/prune accumulator**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T00:21:19Z
- **Completed:** 2026-03-20T00:25:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Rewrote AISStream adapter from persistent WebSocket to stateless connect-collect-close pattern (collectShips())
- Migrated ships route to Redis cache with cacheGet/cacheSet using 'ships:ais' key
- Implemented ship merge/prune logic: fresh ships merged with cached by ID, ships older than 10 minutes pruned
- Removed connectAISStream import and startup call from server/index.ts (no persistent connections)
- All 14 tests pass (7 adapter + 7 route), plus 138 total server tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite AISStream adapter to on-demand collectShips()** (TDD)
   - `261ee61` (test) - RED: failing tests for collectShips()
   - `8046244` (feat) - GREEN: implement collectShips(), remove persistent WS, update index.ts
2. **Task 2: Migrate ships route to Redis cache with merge/prune** (TDD)
   - `b16810e` (test) - RED: failing tests for Redis-backed ships route
   - `9a5f149` (feat) - GREEN: implement Redis cache ships route with merge/prune

_Note: TDD tasks have separate test and implementation commits_

## Files Created/Modified

- `server/adapters/aisstream.ts` - Rewritten: exports only collectShips(), no persistent WebSocket
- `server/routes/ships.ts` - Rewritten: Redis cache-first with merge/prune, stale fallback
- `server/index.ts` - Removed connectAISStream import and startup call
- `server/__tests__/adapters/aisstream.test.ts` - Rewritten: 7 tests for collectShips() (subscription, normalization, dedup, timeout, error, env)
- `server/__tests__/routes/ships.test.ts` - Created: 7 tests for Redis-backed ships route (cache hit, miss, merge, prune, fallback, error, shape)
- `server/__tests__/routes/flights.test.ts` - Updated: aisstream mock changed from old exports to collectShips

## Decisions Made

- On-demand WebSocket pattern: connect, collect for AISSTREAM_COLLECT_MS (default 5000ms, env configurable), close -- eliminates persistent connection incompatible with serverless
- Ship merge/prune: seed Map from cached data, overwrite with fresh, prune entries with timestamp older than 10 minutes (STALE_THRESHOLD_MS = 600_000)
- 30s logical TTL (same as client polling interval), 300s Redis hard TTL (10x for stale-but-servable fallback)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed connectAISStream from server/index.ts**
- **Found during:** Task 1 (collectShips implementation)
- **Issue:** server/index.ts imported connectAISStream which no longer exists after adapter rewrite
- **Fix:** Removed import and startup code that called connectAISStream()
- **Files modified:** server/index.ts
- **Verification:** All 138 server tests pass
- **Committed in:** 8046244 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Updated flights test aisstream mock**
- **Found during:** Task 1 (collectShips implementation)
- **Issue:** flights.test.ts mocked old exports (getShips, getLastMessageTime, connectAISStream) that no longer exist
- **Fix:** Changed mock to export collectShips instead
- **Files modified:** server/__tests__/routes/flights.test.ts
- **Verification:** All 11 flights tests pass
- **Committed in:** 8046244 (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to prevent import/mock errors from renamed exports. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no new external service configuration required. AISStream API key (AISSTREAM_API_KEY) and Upstash Redis credentials are existing deployment concerns.

## Next Phase Readiness

- Ships data pipeline fully stateless -- no persistent WebSocket connections
- Redis cache pattern proven for flights (Plan 01) and ships (this plan)
- Plan 03 (events route migration and EntityCache deletion) ready to proceed
- No blockers

## Self-Check: PASSED

- server/adapters/aisstream.ts: FOUND
- server/routes/ships.ts: FOUND
- server/index.ts: FOUND
- server/__tests__/adapters/aisstream.test.ts: FOUND
- server/__tests__/routes/ships.test.ts: FOUND
- server/__tests__/routes/flights.test.ts: FOUND
- Commit 261ee61: FOUND
- Commit 8046244: FOUND
- Commit b16810e: FOUND
- Commit 9a5f149: FOUND

---
*Phase: 13-serverless-cache-migration*
*Completed: 2026-03-20*
