---
phase: 21-production-review-deploy-sync
plan: 02
subsystem: server/cache, server/routes, frontend/stores
tags: [redis, health, degradation, monitoring, fallback]
dependency_graph:
  requires: []
  provides: [cacheGetSafe, cacheSetSafe, healthRouter, degraded-indicator]
  affects: [server/cache/redis.ts, server/routes/health.ts, server/index.ts, src/stores/flightStore.ts, src/stores/shipStore.ts, src/stores/eventStore.ts, src/components/ui/StatusPanel.tsx]
tech_stack:
  added: []
  patterns: [in-memory-fallback, graceful-degradation, rich-health-endpoint]
key_files:
  created:
    - server/routes/health.ts
    - server/__tests__/routes/health.test.ts
  modified:
    - server/cache/redis.ts
    - server/types.ts
    - server/index.ts
    - src/stores/flightStore.ts
    - src/stores/shipStore.ts
    - src/stores/eventStore.ts
    - src/components/ui/StatusPanel.tsx
    - server/__tests__/redis-cache.test.ts
    - server/__tests__/server.test.ts
    - server/__tests__/vercel-entry.test.ts
    - server/__tests__/rateLimit.test.ts
    - server/__tests__/routes/flights.test.ts
    - server/__tests__/routes/ships.test.ts
    - server/__tests__/routes/events.test.ts
    - server/__tests__/routes/news.test.ts
    - server/__tests__/routes/weather.test.ts
decisions:
  - "Module-level Map as memCache fallback (not LRU -- cache keys are bounded by polling source count)"
  - "cacheGetSafe/cacheSetSafe as separate exports (existing routes keep cacheGet/cacheSet for backward compat)"
  - "degraded flag tracked per-store (flight/ship/event) rather than global flag"
  - "All Redis mocks updated with ping() to support health router imported via index.ts"
metrics:
  duration: 8min
  completed: "2026-03-25T16:06:00Z"
---

# Phase 21 Plan 02: Redis Graceful Degradation & Health Endpoint Summary

In-memory Map fallback cache with cacheGetSafe/cacheSetSafe wrappers, rich /health endpoint returning Redis status + per-source freshness + budget estimate, and amber degraded indicator in StatusPanel.

## What Was Done

### Task 1: In-memory fallback and health endpoint (TDD)
- Added `memCache` Map to `server/cache/redis.ts` as fallback for Redis failures
- Exported `cacheGetSafe<T>()`: tries Redis, falls back to memCache with `degraded: true`
- Exported `cacheSetSafe<T>()`: writes to both Redis and memCache, swallows Redis errors
- Added `degraded?: boolean` to `CacheResponse` type in `server/types.ts`
- Created `server/routes/health.ts` with `healthRouter`:
  - Pings Redis with latency measurement
  - Queries 7 source cache keys for last-fresh timestamps
  - Returns status (ok/degraded), Redis health, uptime, sources, estimated daily commands (15,282)
- Tests: 6 new tests for cacheGetSafe/cacheSetSafe + 3 health endpoint tests

### Task 2: Wire health router and degraded indicator
- Replaced inline `app.get('/health', ...)` with `app.use('/health', healthRouter)` in `server/index.ts`
- Added `degraded: boolean` field to flightStore, shipStore, eventStore
- StatusPanel shows amber "Degraded" indicator when any source has `degraded: true`
- Updated 10 test files to add `ping()` to Redis mock objects (health router requires it)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated Redis mocks across all test files**
- **Found during:** Task 2
- **Issue:** Health router calls `redis.ping()`, but existing test files mock redis as `{}` without ping
- **Fix:** Added `ping: vi.fn(async () => 'PONG')` to all 10 test files that mock redis
- **Files modified:** server/__tests__/server.test.ts, vercel-entry.test.ts, rateLimit.test.ts, routes/flights.test.ts, routes/ships.test.ts, routes/events.test.ts, routes/news.test.ts, routes/weather.test.ts
- **Commits:** 5bf66cb

**2. [Rule 1 - Bug] Updated health endpoint test assertions**
- **Found during:** Task 2
- **Issue:** server.test.ts and vercel-entry.test.ts used `toEqual({ status: 'ok' })` which fails against rich health response
- **Fix:** Changed to check `body.status` and `body.redis` individually
- **Files modified:** server/__tests__/server.test.ts, server/__tests__/vercel-entry.test.ts
- **Commits:** 5bf66cb

## Verification

- `npx vitest run server/` -- 238/238 tests pass (27 test files)
- `npm run build` -- builds cleanly (frontend + server + typecheck)
- `npx vitest run src/__tests__/StatusPanel.test.tsx` -- 12/12 tests pass

## Commits

| Hash | Message |
|------|---------|
| 1981b33 | test(21-02): add failing tests for Redis fallback and health endpoint |
| 3ac5f69 | feat(21-02): add Redis graceful degradation and rich health endpoint |
| 5bf66cb | feat(21-02): wire health router and add degraded indicator to StatusPanel |

## Self-Check: PASSED

All files exist. All commits verified in git log.
