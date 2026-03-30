---
phase: 13-serverless-cache-migration
plan: 03
subsystem: infra
tags: [redis, upstash, events, gdelt, cleanup]

# Dependency graph
requires:
  - phase: 13-serverless-cache-migration
    provides: Redis cache module (cacheGet/cacheSet) from Plan 01
  - phase: 08-conflict-events
    provides: GDELT adapter, ConflictEventEntity type, events route structure
provides:
  - Events route with Redis accumulator pattern (merge/prune/fallback)
  - Clean server index with no startup side effects
  - EntityCache fully removed from codebase
affects: [14-vercel-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Redis accumulator with merge-by-ID and WAR_START pruning", "Stale cache fallback with pruning on error"]

key-files:
  created:
    - server/__tests__/routes/events.test.ts
  modified:
    - server/routes/events.ts
    - server/__tests__/server.test.ts
    - .env.example
  deleted:
    - server/cache/entityCache.ts

key-decisions:
  - "Events route merges fresh GDELT batch with cached events by ID (upsert), then prunes pre-war entries"
  - "REDIS_TTL_SEC = 9000 (2.5 hours) for events -- 10x of 15min logical TTL"
  - "Error fallback prunes stale cache data before serving (filters out pre-WAR_START events)"

patterns-established:
  - "Redis accumulator pattern: seed Map from cache, overwrite with fresh, prune, store back"
  - "All three data routes (flights, ships, events) now use Redis cacheGet/cacheSet"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 13 Plan 03: Events Route Migration + Cleanup Summary

**Events route migrated to Redis accumulator with merge/prune pattern, EntityCache deleted, server index cleaned of all startup side effects**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T00:21:31Z
- **Completed:** 2026-03-20T00:25:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Migrated events route from in-memory eventMap + filesystem backfill to Redis accumulator with merge-by-ID and WAR_START pruning
- Deleted EntityCache class (fully replaced by server/cache/redis.ts from Plan 01)
- Updated server.test.ts mocks to reflect new Redis-based architecture (removed old backfillEvents/acled mocks, added Redis mock)
- Added Upstash Redis credentials and AISStream collect window to .env.example
- All 138 server tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate events route to Redis accumulator** (TDD)
   - `8b14f2d` (test) - RED: 8 failing tests for events route Redis accumulator
   - `386d140` (feat) - GREEN: implement events route with cacheGet/cacheSet, merge/prune
2. **Task 2: Clean up server index, delete EntityCache, update env template** - `d50fc3e` (chore)

## Files Created/Modified

- `server/routes/events.ts` - Rewritten: Redis accumulator with events:gdelt key, merge/prune, no module-level side effects
- `server/__tests__/routes/events.test.ts` - New: 8 tests covering cache hit, miss, merge, upsert, prune, fallback, 500, no side effects
- `server/__tests__/server.test.ts` - Updated: Redis mock, aisstream mock, removed obsolete mocks
- `server/cache/entityCache.ts` - Deleted: fully replaced by Redis cache module
- `.env.example` - Added: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, AISSTREAM_COLLECT_MS

## Decisions Made

- Events route merges fresh GDELT batch with cached events by ID (upsert pattern), then prunes entries with timestamp before WAR_START -- ensures accumulation across polling intervals while preventing unbounded growth
- REDIS_TTL_SEC = 9000 (2.5 hours) for events, consistent with 10x multiplier pattern from Plan 01
- Error fallback path prunes stale cache before serving (filters pre-WAR_START events even when GDELT is down)
- connectAISStream removal from server/index.ts was already done in Plan 02 (collectShips migration) -- no additional changes needed

## Deviations from Plan

None -- plan executed exactly as written. The only note is that `connectAISStream` removal from `server/index.ts` was already completed by Plan 02, so no changes were needed to that file.

## Issues Encountered

None.

## User Setup Required

None -- Upstash credentials (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) added to .env.example as documentation, but actual credential setup is a deployment concern handled separately.

## Next Phase Readiness

- All three data routes (flights, ships, events) now use Redis via cacheGet/cacheSet
- EntityCache fully removed -- no in-memory caching remains
- Server has no startup side effects (no WebSocket connections, no file I/O, no backfill)
- Ready for Phase 14 Vercel deployment
- No blockers

## Self-Check: PASSED

- server/routes/events.ts: FOUND
- server/__tests__/routes/events.test.ts: FOUND
- server/cache/entityCache.ts: CONFIRMED DELETED
- .env.example: FOUND (contains UPSTASH_REDIS_REST_URL)
- Commit 8b14f2d: FOUND
- Commit 386d140: FOUND
- Commit d50fc3e: FOUND

---
*Phase: 13-serverless-cache-migration*
*Completed: 2026-03-20*
