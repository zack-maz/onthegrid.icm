---
phase: 14-vercel-deployment
plan: 01
subsystem: infra
tags: [express, rate-limiting, cors, upstash-ratelimit, serverless]

# Dependency graph
requires:
  - phase: 13-serverless-cache-migration
    provides: Upstash Redis client and cacheGet/cacheSet infrastructure
provides:
  - Graceful server boot without external API keys
  - Rate limiting middleware on /api/* routes
  - Production-first wildcard CORS default
  - Documented .env.example with required/optional sections
affects: [14-vercel-deployment]

# Tech tracking
tech-stack:
  added: ["@upstash/ratelimit"]
  patterns: ["sliding-window rate limiting per IP", "graceful degradation for optional API keys"]

key-files:
  created:
    - server/middleware/rateLimit.ts
    - server/__tests__/rateLimit.test.ts
  modified:
    - server/config.ts
    - server/index.ts
    - .env.example
    - server/__tests__/server.test.ts
    - server/__tests__/routes/flights.test.ts
    - server/__tests__/routes/ships.test.ts
    - server/__tests__/routes/events.test.ts
    - server/__tests__/routes/sources.test.ts

key-decisions:
  - "All API keys optional with ?? '' fallback for serverless cold start"
  - "CORS defaults to wildcard * (production-first; local dev overrides via .env)"
  - "Rate limiting 60 req/60s sliding window per IP on /api/* only (not /health)"

patterns-established:
  - "Rate limiter pass-through mock pattern for route tests"
  - "Graceful degradation: server boots cleanly without external API keys"

requirements-completed: [DEPLOY-02, DEPLOY-03, DEPLOY-04]

# Metrics
duration: 12min
completed: 2026-03-20
---

# Phase 14 Plan 01: Server Hardening Summary

**Serverless-ready Express server with graceful API key degradation, @upstash/ratelimit sliding window (60 req/60s), and wildcard CORS default**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-20T02:26:59Z
- **Completed:** 2026-03-20T02:39:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Server boots without crashing when OpenSky/AISStream/ACLED API keys are absent
- Rate limiting middleware returns 429 with X-RateLimit-* headers on excess requests
- CORS defaults to wildcard `*` (overridable via CORS_ORIGIN env var)
- .env.example restructured into REQUIRED/OPTIONAL/SERVER CONFIG sections
- All 150 server tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Graceful config + rate limiting middleware + tests** - `f8c9143` (feat)
2. **Task 2: Wire rate limiter into createApp + update .env.example** - `e0c27b8` (feat)

_Note: Task 1 was TDD with RED+GREEN phases combined in single commit._

## Files Created/Modified
- `server/config.ts` - Removed required() function; all API keys optional with ?? '' fallback
- `server/middleware/rateLimit.ts` - Rate limiting middleware using @upstash/ratelimit sliding window
- `server/index.ts` - Wired rateLimitMiddleware on /api/* routes, CORS default changed to *
- `server/__tests__/rateLimit.test.ts` - 5 tests: under limit, 429, headers, IP fallback chain
- `server/__tests__/server.test.ts` - Updated config mock, added CORS wildcard + graceful boot tests
- `server/__tests__/routes/flights.test.ts` - Added rateLimitMiddleware pass-through mock
- `server/__tests__/routes/ships.test.ts` - Added rateLimitMiddleware pass-through mock
- `server/__tests__/routes/events.test.ts` - Added rateLimitMiddleware pass-through mock
- `server/__tests__/routes/sources.test.ts` - Added rateLimitMiddleware pass-through mock
- `.env.example` - Restructured into REQUIRED/OPTIONAL/SERVER CONFIG sections

## Decisions Made
- All API keys optional with `?? ''` fallback -- server boots cleanly for serverless cold starts
- CORS defaults to wildcard `*` (production-first; local dev sets `CORS_ORIGIN` via .env)
- Rate limiting at 60 requests per 60 seconds sliding window per IP
- Rate limiting applied only to `/api/*` routes (not `/health`)
- Identifier chain: `req.ip ?? x-forwarded-for ?? 'anonymous'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added rateLimitMiddleware mock to 4 route test files**
- **Found during:** Task 2 (wiring rate limiter into createApp)
- **Issue:** Route tests (flights, ships, events, sources) failed because createApp now imports rateLimitMiddleware, which wasn't mocked in those test files
- **Fix:** Added pass-through mock `(_req, _res, next) => next()` to all 4 route test files
- **Files modified:** server/__tests__/routes/flights.test.ts, ships.test.ts, events.test.ts, sources.test.ts
- **Verification:** All 150 server tests pass
- **Committed in:** e0c27b8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for test compatibility. No scope creep.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server hardened for serverless deployment -- ready for Vercel configuration (Plan 02)
- @upstash/ratelimit installed and wired
- All API keys gracefully degrade when absent

## Self-Check: PASSED

All 7 files verified present. Both task commits (f8c9143, e0c27b8) verified in git log.

---
*Phase: 14-vercel-deployment*
*Completed: 2026-03-20*
