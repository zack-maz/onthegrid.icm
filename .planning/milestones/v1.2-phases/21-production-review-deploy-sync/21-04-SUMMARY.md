---
phase: 21-production-review-deploy-sync
plan: 04
subsystem: server, frontend
tags: [cacheGetSafe, structured-logging, redis-degradation, code-polish, test-fixes]

# Dependency graph
requires:
  - phase: 21
    provides: "cacheGetSafe/cacheSetSafe wrappers (Plan 02), structured log() (Plan 01)"
provides:
  - All 7 data routes use Redis graceful degradation via cacheGetSafe
  - Zero console.log/error in production server code (structured logging only)
  - All 859 tests passing (including 6 previously-failing ThreatHeatmapOverlay tests)
  - Dead code and unused imports removed from frontend
affects: [21-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [cacheGetSafe route pattern, structured log() in adapters]

key-files:
  created: []
  modified:
    - server/routes/flights.ts
    - server/routes/ships.ts
    - server/routes/events.ts
    - server/routes/news.ts
    - server/routes/markets.ts
    - server/routes/weather.ts
    - server/routes/sites.ts
    - server/adapters/gdelt.ts
    - server/adapters/rss.ts
    - server/adapters/yahoo-finance.ts
    - server/adapters/overpass.ts
    - server/adapters/opensky.ts
    - server/adapters/adsb-lol.ts
    - server/adapters/adsb-exchange.ts
    - server/adapters/acled.ts
    - src/__tests__/ThreatHeatmapOverlay.test.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - src/components/map/BaseMap.tsx
    - src/components/map/layers/WeatherOverlay.tsx
    - src/components/markets/ExpandedChart.tsx
    - src/components/search/SearchResultItem.tsx
    - src/lib/tagRegistry.ts

key-decisions:
  - "cacheGetSafe/cacheSetSafe replaces cacheGet/cacheSet in all data routes (backward-compat exports preserved)"
  - "health route keeps cacheGet (diagnostic, should not fall back to memCache)"
  - "events route keeps direct redis import for backfill timestamp (not cache pattern)"
  - "server/index.ts isMainModule console.log kept (local dev only, not serverless)"
  - "ENTITY_DOT_COLORS.sites -> .siteHealthy (pre-existing bug fix)"

patterns-established:
  - "All server routes import cacheGetSafe/cacheSetSafe from cache/redis.js"
  - "All server files import log from lib/logger.js for console output"
  - "Test mock pattern: extract _mockCacheGet/_mockCacheSet and alias to both cacheGet/cacheGetSafe"

requirements-completed: []

# Metrics
duration: 47min
completed: 2026-03-25
---

# Phase 21 Plan 04: Codebase Polish Summary

**All 7 data routes migrated to cacheGetSafe for Redis graceful degradation, all server console calls replaced with structured logging, 6 pre-existing ThreatHeatmapOverlay test failures fixed, and unused imports/dead code removed**

## Performance

- **Duration:** 47 min
- **Started:** 2026-03-25T16:10:01Z
- **Completed:** 2026-03-25T16:57:04Z
- **Tasks:** 2
- **Files modified:** 29

## Accomplishments
- All 7 data routes (flights, ships, events, news, markets, weather, sites) migrated from cacheGet/cacheSet to cacheGetSafe/cacheSetSafe
- All 27 console.log/error/warn calls in 15 server files replaced with structured log() calls
- 7 test files updated with cacheGetSafe/cacheSetSafe mock exports
- 6 pre-existing ThreatHeatmapOverlay tooltip tests fixed (stale assertions from component evolution)
- 4 computeThreatWeight tests updated for compound formula (typeWeight * media * fatality * goldstein * decay)
- 1 aggregateToGrid test fixed for 0.75-degree cell size
- 6 unused imports and 1 dead function removed from frontend code
- 2 ENTITY_DOT_COLORS.sites type errors fixed (pre-existing bug: key didn't exist)
- 859/859 tests pass, build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate server routes to cacheGetSafe and structured logging** - `90f5a90` (feat)
2. **Task 2: Fix pre-existing test failures and frontend polish** - `7242f3a` (fix)

## Files Created/Modified
- `server/routes/{flights,ships,events,news,markets,weather,sites}.ts` - cacheGetSafe/cacheSetSafe + structured logging
- `server/adapters/{gdelt,rss,yahoo-finance,overpass,opensky,adsb-lol,adsb-exchange,acled}.ts` - structured logging
- `server/__tests__/routes/{flights,ships,events,news,weather}.test.ts` - cacheGetSafe/cacheSetSafe mock exports
- `server/__tests__/{server,vercel-entry}.test.ts` - cacheGetSafe/cacheSetSafe mock exports
- `src/__tests__/ThreatHeatmapOverlay.test.tsx` - Fixed 11 stale test assertions
- `src/components/layout/DetailPanelSlot.tsx` - Removed unused SITE_TYPE_LABELS import, fixed .sites -> .siteHealthy
- `src/components/map/BaseMap.tsx` - Removed unused useRef import
- `src/components/map/layers/WeatherOverlay.tsx` - Removed unused tempToColor function
- `src/components/markets/ExpandedChart.tsx` - Fixed unused variable (l -> _l)
- `src/components/search/SearchResultItem.tsx` - Fixed .sites -> .siteHealthy
- `src/lib/tagRegistry.ts` - Removed unused ConflictEventType/EntityType imports

## Decisions Made
- **health route keeps cacheGet**: Health endpoint is a diagnostic tool that should report actual Redis status, not fall back to memCache silently
- **events route keeps direct redis**: The `redis.get`/`redis.set` calls for backfill timestamps are simple key-value operations, not the cache pattern -- no need for Safe wrappers
- **isMainModule console.log preserved**: The startup message in `server/index.ts` only runs in local dev (not serverless), explicitly excluded per plan
- **ENTITY_DOT_COLORS.sites -> .siteHealthy**: Pre-existing bug where `sites` key didn't exist on the color map; `siteHealthy` is the correct default for site entity dots

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ENTITY_DOT_COLORS.sites type error in DetailPanelSlot and SearchResultItem**
- **Found during:** Task 2 (frontend audit)
- **Issue:** `ENTITY_DOT_COLORS.sites` referenced a non-existent key (TS2339), causing type error
- **Fix:** Changed to `ENTITY_DOT_COLORS.siteHealthy` which is the correct green color for site entities
- **Files modified:** src/components/layout/DetailPanelSlot.tsx, src/components/search/SearchResultItem.tsx
- **Verification:** TypeScript errors resolved, build clean
- **Committed in:** 7242f3a

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor color key fix. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors (35 total) exist across the codebase, mostly from deck.gl type gaps (`HTMLCanvasElement` not assignable to `Texture`), SiteEntity missing `timestamp` field, and vite.config.ts type mismatch. These are structural/library-level issues that require broader refactoring beyond this polish pass. Fixed the 6 that were simple unused imports/dead code.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All routes now gracefully degrade when Redis is unavailable
- Structured logging enables log-based observability in production
- All 859 tests green, ready for final deployment in Plan 05

---
*Phase: 21-production-review-deploy-sync*
*Completed: 2026-03-25*
