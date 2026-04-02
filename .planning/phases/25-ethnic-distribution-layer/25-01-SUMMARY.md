---
phase: 25-ethnic-distribution-layer
plan: 01
subsystem: data
tags: [geojson, ethnic-groups, geoepr, deck-gl-extensions, geospatial]

# Dependency graph
requires:
  - phase: 24-political-boundaries-layer
    provides: GeoJSON extraction pattern (extract-geo-data.ts), layerStore with ethnic VisualizationLayerId
provides:
  - ethnic-zones.json static GeoJSON data asset (9 single-group + 23 overlap features)
  - ethnicGroups.ts config module (EthnicGroup type, ETHNIC_GROUPS record, ETHNIC_GROUP_IDS)
  - @deck.gl/extensions installed with FillStyleExtension test mock
  - Wave 0 test stubs for Plan 02
affects: [25-ethnic-distribution-layer]

# Tech tracking
tech-stack:
  added: [@deck.gl/extensions@^9.2.11]
  patterns: [GeoEPR extraction pipeline, Douglas-Peucker polygon simplification, grid-based overlap detection]

key-files:
  created:
    - src/data/ethnic-zones.json
    - src/lib/ethnicGroups.ts
    - scripts/extract-ethnic-data.ts
    - src/__tests__/EthnicOverlay.test.tsx
    - src/test/__mocks__/deck-gl-extensions.ts
  modified:
    - vite.config.ts
    - package.json

key-decisions:
  - "GeoEPR-2021 from ETH Zurich as ethnic boundary data source (direct GeoJSON, 1685 features worldwide)"
  - "Douglas-Peucker simplification at epsilon=0.05 degrees to reduce file size from 580KB to 139KB"
  - "Yazidi group missing from GeoEPR dataset -- per CONTEXT.md policy, not hand-drawn"
  - "Grid-based overlap detection at 0.5-degree resolution identifies 23 overlap zones"

patterns-established:
  - "GeoEPR extraction: download -> filter bbox -> map group names -> merge cross-border -> simplify -> detect overlaps -> write GeoJSON"
  - "FillStyleExtension mock pattern: constructor captures props (matches deck-gl-layers.ts pattern)"

requirements-completed: [ETH-01, ETH-02, ETH-03]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 25 Plan 01: Ethnic Data Infrastructure Summary

**GeoEPR-2021 ethnic boundary extraction producing 139KB GeoJSON with 9 groups + 23 overlap zones, plus ethnicGroups.ts 10-group config and @deck.gl/extensions installed**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T22:46:35Z
- **Completed:** 2026-04-02T22:51:54Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Extracted GeoEPR-2021 ethnic boundaries for 9 Middle East groups with cross-border merging and Douglas-Peucker simplification (139KB, under 200KB target)
- Created ethnicGroups.ts config with 10-group taxonomy (colors, rgba, population, context) following factions.ts pattern
- Installed @deck.gl/extensions with FillStyleExtension test mock and vendor chunk entry
- Established Wave 0 test stubs (1 passing test, 7 todo) for Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs and dependency mock** - `c3cd69a` (test)
2. **Task 1: Ethnic group config and dependency install** - `cfb1674` (feat)
3. **Task 2: GeoEPR extraction script with overlap detection and ethnic-zones.json** - `703d283` (feat)

## Files Created/Modified
- `src/data/ethnic-zones.json` - Static GeoJSON FeatureCollection: 9 single-group + 23 overlap features
- `src/lib/ethnicGroups.ts` - EthnicGroup type, EthnicGroupConfig interface, ETHNIC_GROUPS record (10 entries)
- `scripts/extract-ethnic-data.ts` - GeoEPR download, filter, merge, simplify, overlap detection pipeline
- `src/__tests__/EthnicOverlay.test.tsx` - Wave 0 test stubs (1 passing, 7 todo)
- `src/test/__mocks__/deck-gl-extensions.ts` - FillStyleExtension mock for jsdom tests
- `vite.config.ts` - Added @deck.gl/extensions test alias and vendor chunk entry
- `package.json` - Added @deck.gl/extensions@^9.2.11

## Decisions Made
- Used GeoEPR-2021 from ETH Zurich as the authoritative ethnic boundary dataset (direct GeoJSON download, 1685 features worldwide, 596 in Middle East bbox)
- Applied Douglas-Peucker simplification at epsilon=0.05 degrees (~5km tolerance) to reduce file size from 580KB to 139KB while preserving recognizable boundaries
- Yazidi group is absent from GeoEPR dataset (GeoEPR maps "Kurds/Yezidis" as a single Kurdish entry) -- per CONTEXT.md policy ("only include groups covered by the dataset"), Yazidi polygons are not hand-drawn
- Grid-based overlap detection at 0.5-degree resolution successfully identifies 23 overlap zones including key areas like Kirkuk (Arab/Kurdish/Turkmen), NE Syria (Assyrian/Kurdish), and border regions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Douglas-Peucker polygon simplification to meet 200KB file size target**
- **Found during:** Task 2 (GeoEPR extraction)
- **Issue:** Raw GeoEPR data produced 580KB output, exceeding the 200KB target
- **Fix:** Implemented Ramer-Douglas-Peucker line simplification algorithm with 0.05-degree epsilon, reducing to 139KB
- **Files modified:** scripts/extract-ethnic-data.ts
- **Verification:** File size 139.4KB confirmed under 200KB target
- **Committed in:** 703d283 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Simplification was necessary to meet the stated file size requirement. No scope creep.

## Issues Encountered
- GeoEPR "Kurds/Yezidis" entry maps to kurdish (not yazidi), leaving Yazidi without dedicated polygons -- this is expected behavior per CONTEXT.md

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ethnic-zones.json ready for Plan 02 to consume via Vite static import
- ethnicGroups.ts provides all type/config infrastructure Plan 02 needs for rendering
- @deck.gl/extensions installed and mocked for FillStyleExtension hatched fill rendering
- Wave 0 test stubs ready for Plan 02 to implement
- 1107 existing tests pass with zero regressions
- Yazidi homeland (Sinjar area) would need to be added in a future patch if desired

## Self-Check: PASSED

All 5 created files verified present. All 3 task commits verified in git log.

---
*Phase: 25-ethnic-distribution-layer*
*Completed: 2026-04-02*
