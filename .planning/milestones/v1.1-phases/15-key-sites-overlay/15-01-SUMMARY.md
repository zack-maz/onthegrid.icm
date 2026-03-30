---
phase: 15-key-sites-overlay
plan: 01
subsystem: api, data
tags: [overpass, osm, redis, zustand, infrastructure, sites]

# Dependency graph
requires:
  - phase: 13-serverless-cache
    provides: Redis cacheGet/cacheSet for 24h site cache
  - phase: 08-event-data
    provides: Server route/adapter pattern (events.ts as template)
provides:
  - SiteEntity and SiteType types (server + client)
  - Overpass API adapter with fallback
  - GET /api/sites route with 24h Redis cache
  - siteStore (Zustand) for client-side site data
  - useSiteFetch hook (single fetch on mount)
affects: [15-02-PLAN (rendering, toggles, detail panel)]

# Tech tracking
tech-stack:
  added: [Overpass API (external, no package)]
  patterns: [single-fetch hook (no polling), static reference data store with idle state]

key-files:
  created:
    - server/adapters/overpass.ts
    - server/routes/sites.ts
    - src/stores/siteStore.ts
    - src/hooks/useSiteFetch.ts
  modified:
    - server/types.ts
    - src/types/entities.ts
    - server/constants.ts
    - server/index.ts
    - src/components/layout/AppShell.tsx

key-decisions:
  - "SiteEntity separate from MapEntity union (static reference data, different lifecycle)"
  - "Single fetch on mount via useSiteFetch (no polling -- sites are static infrastructure)"
  - "SiteConnectionStatus includes 'idle' state for pre-fetch (unlike polling stores that start as 'loading')"
  - "Overpass QL union query fetches all 6 site types in one request with fallback URL"

patterns-established:
  - "Single-fetch hook pattern: useEffect with empty deps, no polling, no visibility tracking"
  - "Idle connection status: pre-fetch state distinct from loading for static data"

requirements-completed: [SITE-01]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 15 Plan 01: Key Sites Data Pipeline Summary

**Overpass API adapter, /api/sites route with 24h Redis cache, siteStore, and useSiteFetch hook for static infrastructure data**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T16:16:49Z
- **Completed:** 2026-03-20T16:21:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- SiteEntity and SiteType types defined in server/types.ts, re-exported from src/types/entities.ts
- Overpass API adapter fetches all 6 site types (nuclear, naval, oil, airbase, dam, port) in one union query with primary/fallback URLs
- /api/sites route with 24h logical cache TTL and 3-day hard Redis TTL, stale-but-servable fallback
- siteStore holds site data with idle/loading/connected/stale/error connection status
- useSiteFetch hook fetches once on mount, wired in AppShell alongside existing polling hooks

## Task Commits

Each task was committed atomically:

1. **Task 1: SiteEntity types + Overpass adapter + /api/sites route** - `7257455` (feat)
2. **Task 2: siteStore + useSiteFetch hook + AppShell wiring** - `caa02da` (feat)

## Files Created/Modified
- `server/types.ts` - Added SiteType and SiteEntity types (separate from MapEntity union)
- `src/types/entities.ts` - Re-exported SiteEntity and SiteType
- `server/constants.ts` - Added SITES_CACHE_TTL (86,400,000ms = 24h)
- `server/adapters/overpass.ts` - Overpass API adapter with classifySiteType, normalizeElement, fetchSites
- `server/routes/sites.ts` - GET /api/sites route with Redis cache and stale fallback
- `server/index.ts` - Registered sitesRouter at /api/sites
- `src/stores/siteStore.ts` - Zustand store with sites[], connectionStatus, setSiteData/setError/setLoading
- `src/hooks/useSiteFetch.ts` - Single-fetch hook (no polling for static data)
- `src/components/layout/AppShell.tsx` - Wired useSiteFetch() alongside existing polling hooks

## Decisions Made
- SiteEntity kept separate from MapEntity union -- different lifecycle (static vs live telemetry), no polling, no stale clearing
- Added 'idle' connection status for siteStore (pre-fetch state, distinct from 'loading')
- Single fetch on mount with no polling or tab visibility tracking -- sites are static infrastructure data
- Overpass QL union query fetches all 6 site types in one request for efficiency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Overpass API is free with no authentication.

## Next Phase Readiness
- Data pipeline complete: types, adapter, route, cache, store, fetch hook all in place
- Plan 02 can build rendering (IconLayer), toggles, tooltip, and detail panel on top of this foundation
- Pre-existing test failures (3 in entityLayers.test.ts for conflict icon sizing) documented in deferred-items.md -- unrelated to Phase 15

## Self-Check: PASSED

- All 4 created files exist on disk
- Both task commits (7257455, caa02da) found in git log
- TypeScript compiles clean (tsc --noEmit)
- 556/559 tests pass (3 pre-existing failures in entityLayers.test.ts)

---
*Phase: 15-key-sites-overlay*
*Completed: 2026-03-20*
