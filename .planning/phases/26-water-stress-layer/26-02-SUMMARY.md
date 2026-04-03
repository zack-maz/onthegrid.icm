---
phase: 26-water-stress-layer
plan: 02
subsystem: data-model, ui
tags: [site-types, overpass, desalination, migration]

# Dependency graph
requires:
  - phase: 15-key-sites
    provides: SiteType union, Overpass adapter, site toggles and counters
provides:
  - SiteType union without desalination (5 types: nuclear, naval, oil, airbase, port)
  - Overpass query without desalination nwr lines
  - Client UI cleaned of all desalination site references
affects: [26-03-water-facilities-overlay, 26-04-water-map-layer]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - server/types.ts
    - server/adapters/overpass.ts
    - src/stores/filterStore.ts
    - src/hooks/useEntityLayers.ts
    - src/components/counters/useCounterData.ts
    - src/components/layout/CountersSlot.tsx
    - src/components/layout/Sidebar.tsx
    - src/types/ui.ts
    - src/lib/tagRegistry.ts
    - src/components/map/layers/constants.ts

key-decisions:
  - "Only removed desalination from SiteType, left WaterFacilityType (added by 26-01) untouched -- clean parallel execution"

patterns-established: []

requirements-completed: [WAT-07]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 26 Plan 02: Remove Desalination from Sites Overlay Summary

**Surgical removal of desalination from SiteType union, Overpass adapter, and all client UI (toggles, counters, labels, icons) -- preparing for re-addition under Water layer in Plan 03**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T04:45:55Z
- **Completed:** 2026-04-03T04:49:55Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Removed 'desalination' from SiteType union in server/types.ts (now 5 types)
- Removed 3 desalination Overpass nwr query lines and all classification logic
- Cleaned all 8 client files: filterStore, useEntityLayers, useCounterData, CountersSlot, Sidebar, ui.ts labels, tagRegistry, layer constants

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove desalination from server types and Overpass adapter** - `aa9827d` (feat)
2. **Task 2: Update all client references to desalination and fix tests** - `ab16d72` (feat)

## Files Created/Modified
- `server/types.ts` - SiteType union narrowed to 5 types (removed 'desalination')
- `server/adapters/overpass.ts` - Removed desalination nwr queries, SITE_TYPE_LABELS entry, and classifySiteType cases
- `src/stores/filterStore.ts` - Removed 'desalination' from ALL_SITE_TYPES
- `src/hooks/useEntityLayers.ts` - Removed desalination from SITE_ICON_MAP
- `src/components/counters/useCounterData.ts` - Removed desalination from SiteCounts interface and initializers
- `src/components/layout/CountersSlot.tsx` - Removed Desalination CounterRow
- `src/components/layout/Sidebar.tsx` - Removed Desalination CounterRow
- `src/types/ui.ts` - Removed desalination from SITE_TYPE_LABELS
- `src/lib/tagRegistry.ts` - Updated site: tag description
- `src/components/map/layers/constants.ts` - Removed desalination color entry

## Decisions Made
- Only removed desalination from SiteType, left WaterFacilityType (added by Plan 01 in parallel) untouched for clean parallel execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SiteType is clean (5 types) and ready for Plan 03 to introduce WaterFacility overlay
- WaterFacilityType already added by Plan 01 with 'desalination' as one of its types
- All 1134 tests passing, TypeScript compiles cleanly

## Self-Check: PASSED

- All 10 modified files exist on disk
- Both task commits verified (aa9827d, ab16d72)
- Zero desalination references remain in src/

---
*Phase: 26-water-stress-layer*
*Completed: 2026-04-03*
