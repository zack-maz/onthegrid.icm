---
phase: 14-vercel-deployment
plan: 02
subsystem: infra
tags: [vercel, serverless, express, tsup, deployment]

# Dependency graph
requires:
  - phase: 14-vercel-deployment plan 01
    provides: Server hardening (graceful config, rate limiting, CORS wildcard)
  - phase: 13-serverless-cache
    provides: Upstash Redis cache for stateless serverless compatibility
provides:
  - Vercel serverless entry point (server/vercel-entry.ts bundled via tsup)
  - Vercel deployment configuration (vercel.json with rewrites and function config)
  - Node 22.x engine pin in package.json
  - Production deployment at https://myworld-liard.vercel.app
affects: []

# Tech tracking
tech-stack:
  added: [tsup]
  patterns: [tsup-bundled serverless entry point, Vercel rewrites for API + SPA fallback]

key-files:
  created:
    - server/vercel-entry.ts
    - vercel.json
    - server/__tests__/vercel-entry.test.ts
  modified:
    - package.json
    - tsconfig.server.json
    - tsconfig.app.json
    - .gitignore

key-decisions:
  - "Moved entry point from api/index.ts to server/vercel-entry.ts bundled with tsup for Vercel ESM compatibility"
  - "Node 22.x pinned via package.json engines field"
  - "vercel.json uses framework: vite with 60s maxDuration for AISStream headroom"
  - "tsup bundles server code into api/index.js CJS output for reliable Vercel function loading"

patterns-established:
  - "tsup bundle pattern: server code bundled to api/index.js for serverless deployment"
  - "Vercel rewrite ordering: /api/:path* first, then SPA fallback to /index.html"

requirements-completed: [DEPLOY-01, DEPLOY-05]

# Metrics
duration: 25min
completed: 2026-03-20
---

# Phase 14 Plan 02: Vercel Deployment Summary

**Vercel serverless deployment with tsup-bundled Express entry point, API rewrites, and verified production at myworld-liard.vercel.app**

## Performance

- **Duration:** 25 min (including deployment verification checkpoint)
- **Started:** 2026-03-20T02:45:00Z
- **Completed:** 2026-03-20T03:15:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created Vercel serverless entry point wrapping createApp() with tsup bundling for ESM compatibility
- Configured vercel.json with Vite framework detection, API rewrites, SPA fallback, and 60s function timeout
- Pinned Node 22.x in package.json engines field
- Verified full production deployment: frontend, health check, all 4 API routes returning live data (73 flights, 2,506 events, 226 ships)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing test for Vercel entry point** - `b28bd84` (test)
2. **Task 1 (GREEN): Create Vercel entry point + config + test** - `bbdaa0a` (feat)
3. **Task 1 (fix): Exclude test files from production build** - `84134de` (fix)
4. **Task 1 (fix): Bundle with tsup for Vercel compatibility** - `bea41fc` (fix)
5. **Task 2: Verify live Vercel deployment** - checkpoint approved (no code commit)

## Files Created/Modified
- `server/vercel-entry.ts` - Serverless entry point importing createApp(), bundled by tsup to api/index.js
- `vercel.json` - Deployment config: framework vite, 60s maxDuration, API rewrites + SPA fallback
- `server/__tests__/vercel-entry.test.ts` - Unit tests for entry point (default export, GET /health)
- `package.json` - Added engines.node 22.x, tsup dependency, vercel-build script
- `tsconfig.server.json` - Added "api" to include array for TypeScript coverage
- `tsconfig.app.json` - Excluded test files from production build
- `.gitignore` - Added api/ build output directory
- `package-lock.json` - Updated with tsup dependencies

## Decisions Made
- **tsup bundling:** Initial api/index.ts approach failed on Vercel because ESM imports with .js extensions weren't resolved in the serverless environment. Switched to tsup bundling server/vercel-entry.ts into api/index.js (CJS) for reliable function loading.
- **Moved entry to server/vercel-entry.ts:** Keeps source code in the server directory; tsup outputs to api/ which Vercel discovers as the function.
- **Excluded test files from build:** tsconfig.app.json updated to prevent test files from being included in Vite production builds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded test files from production build**
- **Found during:** Task 1 (deployment attempt)
- **Issue:** TypeScript test files were being included in the Vite production build, causing build errors on Vercel
- **Fix:** Updated tsconfig.app.json to exclude test directories; separated typecheck script
- **Files modified:** tsconfig.app.json, package.json
- **Verification:** Clean Vite build succeeds
- **Committed in:** 84134de

**2. [Rule 3 - Blocking] Bundled entry point with tsup for Vercel compatibility**
- **Found during:** Task 1 (deployment attempt)
- **Issue:** Vercel couldn't resolve ESM imports with .js extensions in the api/index.ts entry point
- **Fix:** Moved entry to server/vercel-entry.ts, added tsup config to bundle into api/index.js (CJS), updated vercel.json to point to bundled output
- **Files modified:** server/vercel-entry.ts, package.json, vercel.json, .gitignore
- **Verification:** Successful Vercel deployment with all routes working
- **Committed in:** bea41fc

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both fixes were necessary to resolve Vercel's serverless function bundling constraints. The core architecture (Express app wrapped as serverless function) remains as planned; only the bundling mechanism changed.

## Issues Encountered
- Vercel's Node.js serverless runtime doesn't natively resolve ESM relative imports with .js extensions. Solved by bundling with tsup into a single CJS file.

## User Setup Required
None - Vercel environment variables (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) were already configured during deployment verification.

## Next Phase Readiness
- v1.0 deployment is complete -- application is live at https://myworld-liard.vercel.app
- All data sources operational: flights (adsb.lol), ships (AISStream), events (GDELT v2)
- No further phases planned in the current roadmap

## Self-Check: PASSED

All files verified present, all commit hashes confirmed in git log.

---
*Phase: 14-vercel-deployment*
*Completed: 2026-03-20*
