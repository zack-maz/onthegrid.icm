---
phase: 21-production-review-deploy-sync
plan: 01
subsystem: api
tags: [helmet, cache-control, rate-limiting, structured-logging, express-middleware]

# Dependency graph
requires:
  - phase: 14
    provides: Vercel deployment with Express createApp factory
provides:
  - Cache-Control middleware factory for per-route CDN caching
  - Structured JSON request logger middleware
  - Per-endpoint rate limiters with tuned limits
  - Helmet security headers with CSP directives
affects: [21-02, 21-04, 21-05]

# Tech tracking
tech-stack:
  added: [helmet]
  patterns: [createRateLimiter factory, cacheControl factory, structured JSON logging]

key-files:
  created:
    - server/middleware/cacheControl.ts
    - server/middleware/requestLogger.ts
  modified:
    - server/index.ts
    - server/middleware/rateLimit.ts
    - server/middleware/errorHandler.ts
    - server/lib/logger.ts

key-decisions:
  - "createRateLimiter factory pattern for per-endpoint rate limit configuration"
  - "Helmet CSP whitelists map tiles, Vercel analytics, Open-Meteo, ArcGIS, CARTO"
  - "max-age=0 with s-maxage for CDN-only caching (browser always revalidates)"
  - "rateLimitMiddleware kept as deprecated export for backward compatibility"

patterns-established:
  - "cacheControl(sMaxAge, swr) factory: returns Express middleware setting Cache-Control header"
  - "requestLogger: level derived from status code (500+=error, 400+=warn, else info)"
  - "Per-route middleware chaining: rateLimiters.X, cacheControl(X, Y), router"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-25
---

# Phase 21 Plan 01: Server Middleware Hardening Summary

**Helmet security headers, per-route Cache-Control with CDN s-maxage, per-endpoint Upstash rate limits, and structured JSON request logging**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-25T15:00:46Z
- **Completed:** 2026-03-25T15:06:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Cache-Control middleware factory produces correct headers for all 8 API endpoints (s-maxage from 5s to 3600s)
- Helmet wired with full CSP directives whitelisting all external tile/API/analytics domains
- Rate limits tuned per endpoint: flights 120/60s, ships 60/60s, events/news 20/60s, markets 30/60s, weather/sites 10/60s
- Structured JSON request logging with level-based routing (error/warn/info by status code)
- All 229 server tests pass, build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests** - `500b12d` (test) - _prior session_
2. **Task 1 (GREEN): Implement cache-control and request-logger middleware** - `aaa0ec8` (feat)
3. **Task 2: Wire helmet, cache-control, per-endpoint rate limits, and logging into createApp** - `bc15e90` (feat)

_Note: TDD Task 1 had RED committed in a prior session, GREEN completed in this session._

## Files Created/Modified
- `server/middleware/cacheControl.ts` - Cache-Control header factory (s-maxage + stale-while-revalidate or no-store)
- `server/middleware/requestLogger.ts` - Structured JSON request logging on res finish
- `server/lib/logger.ts` - LogEntry interface + JSON.stringify to stdout/stderr by level
- `server/index.ts` - Wired helmet, requestLogger, per-route rateLimiters + cacheControl
- `server/middleware/rateLimit.ts` - createRateLimiter factory + rateLimiters record (8 endpoints)
- `server/middleware/errorHandler.ts` - Replaced console.error with structured log()
- `server/__tests__/middleware/cacheControl.test.ts` - 4 tests for cache header generation
- `server/__tests__/middleware/requestLogger.test.ts` - 4 tests for structured logging output
- 8 test files updated to mock new rateLimiters export

## Decisions Made
- **createRateLimiter factory**: Allows per-endpoint configuration with separate Upstash Ratelimit instances per route, preserving identifier extraction logic
- **Helmet CSP whitelists**: Includes OpenStreetMap tiles, AWS terrain tiles, ArcGIS imagery, CARTO basemaps, Open-Meteo API, and Vercel analytics scripts
- **max-age=0 with s-maxage**: Browser always revalidates with origin/CDN, CDN serves from cache -- prevents stale browser cache for real-time data
- **Deprecated rateLimitMiddleware**: Kept as export for backward compat with existing rateLimit.test.ts; new code uses rateLimiters record

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 8 test file mocks for new rateLimiters export**
- **Found during:** Task 2 (wiring middleware into createApp)
- **Issue:** 7 route test files + vercel-entry test mock rateLimitMiddleware but not rateLimiters; createApp now imports rateLimiters causing undefined errors in all route tests
- **Fix:** Added rateLimiters passthrough mock alongside existing rateLimitMiddleware mock in all 8 test files
- **Files modified:** server/__tests__/routes/{flights,ships,events,sources,news,weather}.test.ts, server/__tests__/{server,vercel-entry}.test.ts
- **Verification:** All 229 server tests pass
- **Committed in:** bc15e90 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test mock update was necessary for correctness. No scope creep.

## Issues Encountered
- server/lib/logger.ts existed from prior session but was not committed (only test files were in 500b12d). Included in Task 2 commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All middleware in place for production traffic
- Cache-Control headers ready for Vercel CDN edge caching
- Per-endpoint rate limits will protect upstream API budgets
- Structured logging foundation for observability

## Self-Check: PASSED

- [x] server/middleware/cacheControl.ts exists
- [x] server/middleware/requestLogger.ts exists
- [x] server/lib/logger.ts exists
- [x] Commit aaa0ec8 found
- [x] Commit bc15e90 found

---
*Phase: 21-production-review-deploy-sync*
*Completed: 2026-03-25*
