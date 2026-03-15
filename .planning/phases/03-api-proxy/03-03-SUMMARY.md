---
phase: 03-api-proxy
plan: 03
subsystem: infra
tags: [express, startup, env, gap-closure]

# Dependency graph
requires:
  - phase: 03-api-proxy (plans 01-02)
    provides: Express server with API proxy endpoints and data adapters
provides:
  - Graceful server startup without API credentials
  - Dev scripts that tolerate missing .env files
  - UAT-unblocking fixes for server boot path
affects: [04-data-layer, uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy credential validation -- server boots with just PORT, credentials checked at request time"
    - "Node --env-file-if-exists flag for optional .env loading"
    - "AISStream WebSocket guarded by env var presence check"

key-files:
  created: []
  modified:
    - server/index.ts
    - package.json

key-decisions:
  - "Inline process.env reads instead of getServerConfig() helper -- simpler, avoids unnecessary abstraction"
  - "Node --env-file-if-exists=.env flag (Node 22.14+) instead of dotenv dependency or shell conditionals"
  - "Guard connectAISStream() with env var check rather than try/catch -- fail-fast is wrong pattern for optional services"

patterns-established:
  - "Lazy credential pattern: server startup reads only PORT/CORS_ORIGIN, API credentials deferred to adapter call time"
  - "Optional service pattern: check env var presence before connecting optional services like WebSocket"

requirements-completed: [INFRA-01]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 3 Plan 3: Gap Closure Summary

**Graceful server startup without API credentials using lazy config and --env-file-if-exists flag**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T15:20:32Z
- **Completed:** 2026-03-15T15:21:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Server boots and serves /health without any API credentials configured
- Dev scripts no longer crash when .env file is missing
- AISStream WebSocket connection only attempted when AISSTREAM_API_KEY is set
- All 67 tests pass (37 server + 30 frontend)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove eager loadConfig() from server/index.ts** - `ff4287c` (fix)
2. **Task 2: Make dev scripts tolerate missing .env file** - `c0f4193` (fix)

## Files Created/Modified
- `server/index.ts` - Removed eager loadConfig() calls, read PORT/CORS_ORIGIN from process.env directly, guarded AISStream behind env var check
- `package.json` - Changed --env-file .env to --env-file-if-exists=.env in dev and dev:server scripts

## Decisions Made
- Used inline process.env reads (PORT, CORS_ORIGIN) instead of creating a getServerConfig() helper -- the plan considered and rejected the helper as unnecessary abstraction
- Used Node's --env-file-if-exists=.env flag (available since Node 22.14) instead of adding dotenv as a dependency or using shell conditionals
- Guarded connectAISStream() with a simple env var presence check rather than wrapping in try/catch -- explicit opt-in is clearer than catching credential errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (API Proxy) is now fully complete with all gap closure fixes applied
- Server boots gracefully, all endpoints functional, UAT tests unblocked
- Ready for Phase 4 (Data Layer) implementation

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 03-api-proxy*
*Completed: 2026-03-15*
