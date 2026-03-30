---
phase: 13-serverless-cache-migration
plan: 01
subsystem: infra
tags: [redis, upstash, caching, serverless]

# Dependency graph
requires:
  - phase: 04-flight-data-pipeline
    provides: EntityCache pattern, CacheResponse type, flights route structure
  - phase: 06-multi-source-flights
    provides: Multi-source flight dispatch (opensky, adsb, adsblol)
provides:
  - Shared Upstash Redis client (server/cache/redis.ts)
  - cacheGet/cacheSet helper functions with CacheResponse contract
  - Redis-backed flights route with source-prefixed keys
affects: [13-02, 13-03, 14-vercel-deployment]

# Tech tracking
tech-stack:
  added: ["@upstash/redis"]
  patterns: ["Redis cache-first with logical TTL + hard TTL", "Source-prefixed Redis keys"]

key-files:
  created:
    - server/cache/redis.ts
    - server/__tests__/redis-cache.test.ts
  modified:
    - server/routes/flights.ts
    - server/__tests__/routes/flights.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Upstash Redis with REST-based client for serverless compatibility"
  - "Redis hard TTL = 10x logical TTL for stale-but-servable fallback data"
  - "CacheEntry<T> wraps {data, fetchedAt} in Redis for age computation"

patterns-established:
  - "Redis cache pattern: cacheGet(key, logicalTtlMs) returns CacheResponse or null"
  - "Redis cache pattern: cacheSet(key, data, redisTtlSec) stores CacheEntry with hard TTL"
  - "Source-prefixed keys: flights:opensky, flights:adsb, flights:adsblol"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 13 Plan 01: Redis Cache Module + Flights Migration Summary

**Upstash Redis cache module with cacheGet/cacheSet helpers, flights route migrated from in-memory EntityCache to Redis with source-prefixed keys**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T00:14:56Z
- **Completed:** 2026-03-20T00:18:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created shared Redis cache module (server/cache/redis.ts) with cacheGet/cacheSet that preserves CacheResponse<T> contract
- Migrated flights route from 3 EntityCache instances to Redis with keys flights:opensky, flights:adsb, flights:adsblol
- Established Redis cache pattern (logical TTL for staleness, 10x hard TTL for fallback) reusable by Plans 02 and 03
- All 16 tests pass (5 redis-cache + 11 flights route)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Redis cache module and tests** (TDD)
   - `266d6cb` (test) - RED: failing tests for cacheGet/cacheSet
   - `ef0526b` (feat) - GREEN: implement redis.ts, delete old cache.test.ts
2. **Task 2: Migrate flights route from EntityCache to Redis** - `7d13610` (feat)

## Files Created/Modified

- `server/cache/redis.ts` - Shared Upstash Redis client with cacheGet/cacheSet helpers
- `server/__tests__/redis-cache.test.ts` - Unit tests for Redis cache module (5 tests)
- `server/routes/flights.ts` - Flights route now uses Redis instead of EntityCache
- `server/__tests__/routes/flights.test.ts` - Updated tests mocking Redis cache module (11 tests)
- `package.json` - Added @upstash/redis dependency
- `server/__tests__/cache.test.ts` - Deleted (tested old EntityCache)

## Decisions Made

- Used Upstash REST-based Redis client for serverless compatibility (HTTP transport, no persistent connections)
- Redis hard TTL set to 10x logical TTL converted to seconds (e.g., 10s logical = 100s Redis EX) to keep stale data available for upstream error fallback
- CacheEntry<T> stores {data, fetchedAt} so staleness can be computed from fetchedAt age vs logical TTL
- Mock strategy: in-memory Map<string, unknown> backing mock Redis get/set operations, no vi.resetModules() needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this plan. Upstash credentials (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) will be needed at runtime but are an existing deployment concern.

## Next Phase Readiness

- Redis cache module ready for reuse by Plan 02 (events/ships migration) and Plan 03 (EntityCache deletion)
- cacheGet/cacheSet pattern proven with flights route; same pattern applies to events and ships routes
- No blockers

## Self-Check: PASSED

- server/cache/redis.ts: FOUND
- server/__tests__/redis-cache.test.ts: FOUND
- server/__tests__/cache.test.ts: CONFIRMED DELETED
- Commit 266d6cb: FOUND
- Commit ef0526b: FOUND
- Commit 7d13610: FOUND

---
*Phase: 13-serverless-cache-migration*
*Completed: 2026-03-20*
