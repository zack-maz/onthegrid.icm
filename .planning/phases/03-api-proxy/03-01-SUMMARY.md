---
phase: 03-api-proxy
plan: 01
subsystem: api
tags: [express, cors, typescript, cache, discriminated-union]

# Dependency graph
requires:
  - phase: 02-base-map
    provides: Frontend scaffold, Vite dev server, TypeScript config
provides:
  - MapEntity discriminated union types (FlightEntity, ShipEntity, ConflictEventEntity)
  - Express 5 server with CORS and health endpoint
  - In-memory EntityCache with TTL-based staleness tracking
  - Environment config validation with lazy loading
  - Concurrent dev script (Vite + Express)
  - Frontend re-export of entity types
affects: [03-02-data-adapters, 04-frontend-integration]

# Tech tracking
tech-stack:
  added: [express@5, cors, concurrently, tsx]
  patterns: [discriminated-union, lazy-config, entity-cache-with-staleness, createApp-factory]

key-files:
  created:
    - server/types.ts
    - server/config.ts
    - server/constants.ts
    - server/cache/entityCache.ts
    - server/middleware/errorHandler.ts
    - server/index.ts
    - src/types/entities.ts
    - tsconfig.server.json
    - .env.example
    - server/__tests__/types.test.ts
    - server/__tests__/cache.test.ts
    - server/__tests__/server.test.ts
  modified:
    - package.json
    - tsconfig.json
    - .gitignore

key-decisions:
  - "Lazy config loading via loadConfig() to allow tests to run without env vars"
  - "Proxy object for config convenience access with cached lazy evaluation"
  - "createApp() factory pattern for Express app to enable test isolation"
  - "erasableSyntaxOnly compatibility: explicit field + constructor assignment instead of parameter properties"
  - "vitest-environment node directive per test file instead of workspace config"

patterns-established:
  - "EntityCache<T>: generic in-memory cache with TTL and stale/lastFresh response"
  - "createApp() factory: returns configured Express app, listen() only when run directly"
  - "loadConfig() lazy validation: env vars validated on first call, not module import"
  - "@vitest-environment node: inline directive for server test files"

requirements-completed: [INFRA-01]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 3 Plan 1: Server Foundation Summary

**Express 5 server with MapEntity discriminated union, EntityCache with TTL staleness, lazy config validation, and concurrent dev workflow**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T03:35:48Z
- **Completed:** 2026-03-15T03:40:19Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- MapEntity discriminated union with FlightEntity, ShipEntity, ConflictEventEntity types shared between server and frontend
- Express 5 server on port 3001 with CORS, health endpoint, and error handling middleware
- EntityCache with TTL-based staleness detection for upstream API data
- Environment config with lazy validation -- clear error messages for missing API keys
- Concurrent dev script: `npm run dev` starts both Vite and Express via concurrently
- .env protection and .env.example template documenting all 7 required variables

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, create MapEntity types, config, constants, and project configuration** - `5cc0182` (feat)
2. **Task 2: Create cache module, error handler, and Express server entry point with health check** - `b7ea42f` (feat)

## Files Created/Modified
- `server/types.ts` - MapEntity discriminated union (FlightEntity, ShipEntity, ConflictEventEntity), BoundingBox, CacheResponse
- `server/config.ts` - Lazy environment config validation with loadConfig(), getConfig(), and Proxy-based config alias
- `server/constants.ts` - IRAN_BBOX bounding box and CACHE_TTL values per data source
- `server/cache/entityCache.ts` - Generic in-memory cache with TTL and staleness tracking
- `server/middleware/errorHandler.ts` - Global Express error handler returning 500 JSON
- `server/index.ts` - Express 5 entry point with createApp() factory, CORS, health check, conditional listen
- `src/types/entities.ts` - Frontend re-export of MapEntity types from server
- `tsconfig.server.json` - TypeScript config targeting Node.js with ES2023 and erasableSyntaxOnly
- `.env.example` - Template for all 7 environment variables with source documentation
- `server/__tests__/types.test.ts` - 8 tests verifying discriminated union narrowing and type shapes
- `server/__tests__/cache.test.ts` - 5 tests for cache get/set/clear/stale behavior
- `server/__tests__/server.test.ts` - 3 tests for health check, 404, and CORS headers
- `package.json` - Added express, cors, concurrently, tsx; updated scripts
- `tsconfig.json` - Added tsconfig.server.json reference
- `.gitignore` - Added .env, .env.* protection with .env.example exception

## Decisions Made
- Used lazy config loading via `loadConfig()` function (not top-level execution) so tests can import server modules without requiring env vars
- Used Proxy-based `config` convenience alias that lazily calls `getConfig()` on property access
- Used `createApp()` factory pattern so tests get isolated Express instances without port conflicts
- Used explicit field assignment in EntityCache constructor instead of TypeScript parameter properties (required by `erasableSyntaxOnly`)
- Used `// @vitest-environment node` inline directive per server test file instead of creating a vitest workspace

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed erasableSyntaxOnly incompatibility in EntityCache**
- **Found during:** Task 2 (cache module)
- **Issue:** TypeScript parameter property `constructor(private ttlMs: number)` is not erasable syntax, causing tsc error with `erasableSyntaxOnly: true` in tsconfig.server.json
- **Fix:** Changed to explicit field declaration (`private ttlMs: number`) with manual assignment in constructor body
- **Files modified:** server/cache/entityCache.ts
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` passes cleanly
- **Committed in:** b7ea42f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor syntax adjustment required by strict TypeScript config. No scope creep.

## Issues Encountered
None

## User Setup Required

**External services require manual configuration before the server can start.** Users must:
- Register at OpenSky Network and create OAuth2 client credentials
- Register at AISStream.io and copy API key
- Register at ACLED and use account credentials
- Copy `.env.example` to `.env` and fill in all values

See `.env.example` for detailed instructions on where to obtain each credential.

## Next Phase Readiness
- Server foundation complete: Express 5 running, types defined, cache ready, config validates
- Plan 02 (data adapters) can build against: EntityCache, MapEntity types, config, constants, and server entry point
- All 46 tests pass (16 server + 30 frontend) -- no regressions

## Self-Check: PASSED

All 12 created files verified on disk. Both task commits (5cc0182, b7ea42f) verified in git log.

---
*Phase: 03-api-proxy*
*Completed: 2026-03-14*
