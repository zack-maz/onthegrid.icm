---
phase: 02-base-map
plan: 03
subsystem: ui
tags: [maplibre, terrain, dem, terrarium, animation, css-keyframes]

# Dependency graph
requires:
  - phase: 02-base-map/02-02
    provides: BaseMap component, MapLoadingScreen, MapVignette, constants
provides:
  - Global terrain DEM via AWS Terrarium tiles with terrarium encoding
  - Full-screen expanding ripple loading animation
  - Very faint vignette overlay rendered on top of map
  - Dramatically exaggerated terrain for visible mountain ranges
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AWS Terrarium tiles array pattern (tiles prop) instead of TileJSON URL"
    - "CSS @keyframes ripple with vmax units for viewport-covering animations"

key-files:
  created: []
  modified:
    - src/components/map/constants.ts
    - src/components/map/BaseMap.tsx
    - src/components/map/MapLoadingScreen.tsx
    - src/components/map/MapVignette.tsx
    - src/styles/app.css

key-decisions:
  - "AWS Terrarium S3 tiles for global DEM coverage (MapLibre demo was Alps-only)"
  - "Terrain exaggeration 3.0 with pitch 50 for dramatically visible mountains"
  - "Hillshade exaggeration 0.6 with brighter highlights (#444444) for ridge contrast"
  - "Vignette opacity 0.25 per user feedback (was 0.6, too dark)"

patterns-established:
  - "tiles array + encoding prop pattern for raster-dem sources without TileJSON endpoints"

requirements-completed: [MAP-01]

# Metrics
duration: 7min
completed: 2026-03-14
---

# Phase 2 Plan 3: UAT Gap Closure Summary

**Global AWS Terrarium DEM tiles with 3x terrain exaggeration, full-screen ripple loading animation, and faint vignette overlay**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T22:59:32Z
- **Completed:** 2026-03-14T23:06:49Z
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 5

## Accomplishments
- Replaced broken Alps-only demo terrain tileset with AWS Terrarium global DEM tiles -- Iran mountains now load correctly
- Added terrarium encoding to Source component so MapLibre correctly interprets RGB elevation values
- Dramatically increased terrain visibility: exaggeration 3.0, pitch 50 degrees, stronger hillshade contrast
- Replaced tiny pulse dot with 3 concentric expanding ripple rings covering the full viewport on load
- Reduced vignette opacity from 0.6 to 0.25 and moved it after Map in DOM so it renders on top

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix terrain tiles and loading animation** - `b50fe75` (fix)
2. **Task 2: Fix BaseMap terrain source and vignette rendering order** - `a9c8952` (fix)
3. **Terrain enhancement (user feedback)** - `5948358` (fix)

## Files Created/Modified
- `src/components/map/constants.ts` - Replaced TERRAIN_SOURCE_URL with TERRAIN_SOURCE_TILES array + TERRAIN_ENCODING; increased exaggeration to 3.0, pitch to 50
- `src/components/map/BaseMap.tsx` - Switched Source from url to tiles+encoding props; moved MapVignette after Map; boosted hillshade exaggeration and highlights
- `src/components/map/MapLoadingScreen.tsx` - Replaced tiny pulse dot with 3 expanding ripple ring elements
- `src/components/map/MapVignette.tsx` - Reduced gradient opacity from 0.6 to 0.25
- `src/styles/app.css` - Added @keyframes ripple animation with vmax-based full-viewport coverage

## Decisions Made
- **AWS Terrarium over MapLibre demo tiles:** The demo tileset only covers the Alps region and returns 404 for Iran coordinates. AWS Terrarium has verified global coverage at all relevant zoom levels.
- **Terrain exaggeration 3.0:** User explicitly requested mountains be "MORE visually obvious" and "dramatically visible." Doubled from 1.5 to 3.0 so Zagros and Alborz ranges tower prominently.
- **Pitch 50 degrees:** Steeper initial camera angle (was 35) reveals elevation differences far more clearly at the default zoom level.
- **Hillshade boost:** Exaggeration 0.3->0.6, highlight #222222->#444444 to create stronger visual contrast between ridgelines and valleys on the dark base map.
- **Vignette opacity 0.25:** User said "keep it very faint" -- 0.6 was too dark and distracting.

## Deviations from Plan

### User-Requested Enhancement

**1. [User Feedback] Dramatically increased terrain visibility**
- **Found during:** Task 3 checkpoint (human-verify)
- **Issue:** User reviewed terrain and requested mountains be "MORE visually obvious" with "dramatically visible" mountain ranges
- **Fix:** Increased terrain exaggeration 1.5->3.0, pitch 35->50, hillshade exaggeration 0.3->0.6, hillshade highlights #222222->#444444
- **Files modified:** src/components/map/constants.ts, src/components/map/BaseMap.tsx
- **Verification:** User approved after visual inspection
- **Committed in:** 5948358

---

**Total deviations:** 1 user-requested enhancement
**Impact on plan:** Enhancement to planned terrain fix based on direct user feedback. No scope creep -- same files, same feature, stronger values.

## Issues Encountered
None -- all three UAT gaps resolved cleanly with the planned approach.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (Base Map) is now complete -- all 3 plans executed, all UAT gaps closed
- Interactive 2.5D map with dramatic terrain, loading animation, and vignette is ready
- Ready to proceed to Phase 3 (API Proxy) or Phase 4 (Flight Data Feed)

## Self-Check: PASSED

All 6 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 02-base-map*
*Completed: 2026-03-14*
