---
phase: 26-water-stress-layer
plan: 03
subsystem: api, data
tags: [overpass, open-meteo, precipitation, water-stress, wri-aqueduct, redis-cache, express-routes]

# Dependency graph
requires:
  - phase: 26-01
    provides: WaterFacility types, WaterStressIndicators, aqueduct-basins.json, compositeHealth formula
  - phase: 26-02
    provides: SiteType without desalination (clean separation)
provides:
  - fetchWaterFacilities Overpass adapter for 5 water facility types
  - assignBasinStress country-centroid basin stress lookup
  - fetchPrecipitation Open-Meteo 30-day batch adapter
  - /api/water and /api/water/precip Express routes with Redis caching
  - waterRouter registered in server index with rate limiting
affects: [26-04-water-map-layer, 26-05-water-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [country-centroid-basin-lookup, precipitation-anomaly-ratio, batch-api-requests]

key-files:
  created:
    - server/adapters/overpass-water.ts
    - server/adapters/open-meteo-precip.ts
    - server/lib/basinLookup.ts
    - server/routes/water.ts
    - server/__tests__/adapters/overpass-water.test.ts
    - server/__tests__/adapters/open-meteo-precip.test.ts
    - server/__tests__/lib/basinLookup.test.ts
    - server/__tests__/routes/water.test.ts
  modified:
    - server/constants.ts
    - server/index.ts
    - server/middleware/rateLimit.ts

key-decisions:
  - "Country-centroid basin lookup (not point-in-polygon): WRI Aqueduct CSV lacks lat/lng centroids, so basinLookup uses haversine distance to nearest country centroid then selects median-stress basin"
  - "Regional precipitation normals hardcoded: 20mm/month arid (default), 50mm/month Fertile Crescent (lat 30-40, lng 35-50)"
  - "2000km country-centroid threshold: generous radius since country centroids can be far from borders; country must have basin data"

patterns-established:
  - "Batch API pattern: Open-Meteo precipitation requests batched into groups of 100 locations"
  - "Dual-cache water pattern: water:facilities (24h) + water:precip (6h) as separate Redis keys"

requirements-completed: [WAT-01, WAT-02, WAT-03]

# Metrics
duration: 42min
completed: 2026-04-03
---

# Phase 26 Plan 03: Server-Side Water Infrastructure Summary

**Overpass water adapter (5 facility types), country-centroid basin stress lookup, Open-Meteo 30-day precipitation adapter, and /api/water routes with Redis caching**

## Performance

- **Duration:** 42 min
- **Started:** 2026-04-03T05:04:00Z
- **Completed:** 2026-04-03T05:46:28Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Overpass water adapter classifying dams, reservoirs, treatment plants, named canals, and desalination plants from Middle East OSM data
- Basin stress lookup assigning WRI Aqueduct indicators via country-centroid nearest-match (haversine distance)
- Open-Meteo precipitation adapter with 100-location batching and anomaly ratio computation
- Two API routes with cache-first pattern: /api/water (24h) and /api/water/precip (6h)
- 32 new tests passing, 1183 total tests passing, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Overpass water adapter and basin stress lookup**
   - `652faad` (test: failing tests for overpass water adapter and basin lookup)
   - `5f64d4b` (feat: implement overpass water adapter and basin stress lookup)

2. **Task 2: Open-Meteo precipitation adapter and /api/water routes**
   - `83f8848` (test: failing tests for precipitation adapter and water routes)
   - `9024d5e` (feat: implement precipitation adapter, water routes, and route registration)

## Files Created/Modified
- `server/adapters/overpass-water.ts` - Overpass query for 5 water facility types with primary/fallback
- `server/adapters/open-meteo-precip.ts` - 30-day precipitation with 100-location batching
- `server/lib/basinLookup.ts` - Country-centroid nearest-match basin stress assignment
- `server/routes/water.ts` - /api/water and /api/water/precip cache-first routes
- `server/constants.ts` - WATER_CACHE_TTL (24h), WATER_PRECIP_CACHE_TTL (6h) and Redis TTL constants
- `server/index.ts` - Water route registration at /api/water
- `server/middleware/rateLimit.ts` - Water rate limiter (10 req/min)
- `server/__tests__/adapters/overpass-water.test.ts` - 14 tests for classification and normalization
- `server/__tests__/lib/basinLookup.test.ts` - 6 tests for basin lookup and fallback
- `server/__tests__/adapters/open-meteo-precip.test.ts` - 6 tests for precipitation adapter
- `server/__tests__/routes/water.test.ts` - 6 tests for water routes
- 10 existing test files updated with water adapter mocks

## Decisions Made
- **Country-centroid basin lookup**: WRI Aqueduct 4.0 CSV has no lat/lng centroids for basins (only pfaf_id and country name). Instead of point-in-polygon with the GeoPackage, basinLookup uses haversine distance to find the nearest country centroid, then selects the median-stress basin for that country. This provides reasonable stress indicators without requiring polygon geometry.
- **Regional precipitation normals**: Hardcoded 20mm/month for arid regions (default) and 50mm/month for Fertile Crescent (lat 30-40, lng 35-50). This gives useful relative signal without needing a separate climate normals API.
- **2000km centroid threshold**: Country centroids can be far from borders (e.g., Saudi Arabia centroid is in the middle of the desert). The 2000km radius is generous enough to catch all Middle East facilities while still excluding truly distant coordinates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Country-centroid approach instead of basin-centroid matching**
- **Found during:** Task 1 (basin lookup implementation)
- **Issue:** Plan specified "nearest-centroid matching (haversine distance to basin centroids)" but WRI Aqueduct basins.json has no lat/lng coordinates (Plan 01 SUMMARY noted: "WRI Aqueduct CSV has no lat/lng columns for basin centroids")
- **Fix:** Implemented country-centroid approach: find nearest country by haversine to known centroids, then select median-stress basin from that country's basins
- **Files modified:** server/lib/basinLookup.ts
- **Verification:** 6 tests passing for known coordinates (Baghdad, Tehran, Cairo) and fallback cases
- **Committed in:** 5f64d4b

**2. [Rule 1 - Bug] Updated 10 existing test files with water adapter mocks**
- **Found during:** Task 2 (route registration)
- **Issue:** Adding waterRouter to createApp() broke all test files that spin up the full Express app via `createApp()` because they didn't mock the new overpass-water.js and open-meteo-precip.js adapters, and didn't include `water` in the rateLimiters mock
- **Fix:** Added `water: _passThrough` to rateLimiters mock and added vi.mock for both new adapters in all 10 affected test files
- **Files modified:** server/__tests__/{server,vercel-entry,security}.test.ts, server/__tests__/routes/{events,flights,geocode,news,ships,sources,weather}.test.ts
- **Verification:** Full test suite (1183 tests) passes
- **Committed in:** 9024d5e

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Aqueduct basins data lacks geographic coordinates, requiring country-centroid fallback approach (documented as deviation above)
- Open-Meteo returns single object (not array) for single-location requests; handled with Array.isArray check

## User Setup Required

None - no external service configuration required. Open-Meteo is a free API with no authentication.

## Next Phase Readiness
- Water facility API routes ready for client-side waterStore and useWaterFetch hook (Plan 04)
- Precipitation API route ready for useWaterPrecipPolling hook (Plan 04)
- All 5 facility types classified and enriched with stress indicators
- Redis keys: water:facilities (24h) and water:precip (6h) -- minimal command budget impact
- All 1183 tests passing, TypeScript compiles cleanly

## Self-Check: PASSED

All 8 created files verified on disk. All 4 task commits verified in git log.

---
*Phase: 26-water-stress-layer*
*Completed: 2026-04-03*
