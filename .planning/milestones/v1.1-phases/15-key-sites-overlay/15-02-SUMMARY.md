---
phase: 15-key-sites-overlay
plan: 02
subsystem: ui, map, rendering
tags: [deck.gl, IconLayer, canvas, zustand, toggles, tooltip, detail-panel, attack-status, haversine]

# Dependency graph
requires:
  - phase: 15-key-sites-overlay
    provides: SiteEntity types, siteStore, /api/sites route, useSiteFetch hook
  - phase: 08-event-data
    provides: eventStore with ConflictEventEntity data for attack status computation
  - phase: 09-layer-controls
    provides: ToggleRow component, LayerTogglesSlot pattern, EntityTooltip structure
  - phase: 10-detail-panel
    provides: DetailPanelSlot routing, DetailValue component, useSelectedEntity hook
provides:
  - Extended icon atlas (416px, 13 icons) with 6 site-type shapes
  - Site IconLayer with attack-based green/orange coloring
  - 7 site toggle keys (parent + 6 sub-toggles) in uiStore
  - computeAttackStatus utility for proximity-based event detection
  - SiteDetail component with attack history and GDELT cross-links
  - EntityTooltip SiteContent with attack status
  - useSelectedEntity extended to search siteStore
affects: [16-price-ticker, 17-news-feed, future phases using entity layer pattern]

# Tech tracking
tech-stack:
  added: []
  patterns: [attack-status proximity computation with haversine, site sub-toggle parent/child pattern, widened entity types for non-MapEntity data]

key-files:
  created:
    - src/lib/attackStatus.ts
    - src/components/detail/SiteDetail.tsx
  modified:
    - src/components/map/layers/icons.ts
    - src/components/map/layers/constants.ts
    - src/types/ui.ts
    - src/stores/uiStore.ts
    - src/hooks/useEntityLayers.ts
    - src/hooks/useSelectedEntity.ts
    - src/components/layout/LayerTogglesSlot.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - src/components/map/EntityTooltip.tsx
    - src/components/map/BaseMap.tsx

key-decisions:
  - "SiteEntity types widened throughout UI (MapEntity | SiteEntity) rather than adding to MapEntity union -- preserves static vs live data distinction"
  - "Attack status computed client-side with coarse bbox pre-filter + haversine for performance on large event sets"
  - "Site toggles NOT suppressed during custom date range mode -- static reference data always toggleable"
  - "Glow/highlight layers widened to AnyEntity type alias for clean SiteEntity support"

patterns-established:
  - "Widened entity type pattern: MapEntity | SiteEntity throughout tooltip, detail panel, hover state, selected entity"
  - "Sub-toggle parent/child: parent ON restores all children, parent OFF hides all but preserves individual states"
  - "Client-side attack status: proximity-based event detection with temporal filtering from filterStore"

requirements-completed: [SITE-01, SITE-02, SITE-03]

# Metrics
duration: 11min
completed: 2026-03-20
---

# Phase 15 Plan 02: Key Sites Rendering Summary

**6 site-type IconLayer with canvas-drawn icons, green/orange attack status coloring, 7 toggle controls, hover tooltip, and SiteDetail panel with GDELT attack history cross-links**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T16:23:42Z
- **Completed:** 2026-03-20T16:35:26Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Extended icon atlas from 224px to 416px with 6 new canvas-drawn site shapes (atom/nuclear, anchor/naval, oil derrick, jet/airbase, waves/dam, helm wheel/port)
- Site IconLayer with per-type icons colored green (healthy) or orange (attacked) based on GDELT event proximity within 2km
- 7 site toggles in LayerTogglesSlot (Sites parent + Nuclear, Naval, Oil, Airbase, Dam, Port sub-toggles) with parent/child restore behavior
- computeAttackStatus utility with haversine distance, coarse bbox pre-filter, and temporal date range support
- SiteDetail component with type, operator, OSM link, and attack history section with expand and cross-link to GDELT events
- EntityTooltip extended with SiteContent showing name, operator, and attack status
- useSelectedEntity extended to search siteStore for cross-store entity lookup

## Task Commits

Each task was committed atomically:

1. **Task 1: Icon atlas, constants, toggle types, uiStore, attack status utility** - `bee36b2` (feat)
2. **Task 2: Site IconLayer, toggles UI, tooltip, detail panel, selectedEntity** - `a26cb2c` (feat)

## Files Created/Modified
- `src/lib/attackStatus.ts` - Haversine proximity-based attack status computation with temporal filtering
- `src/components/detail/SiteDetail.tsx` - Detail panel content for sites with attack history and OSM link
- `src/components/map/layers/icons.ts` - Extended to 416px with 6 new site-type icon shapes (13 total)
- `src/components/map/layers/constants.ts` - Added siteHealthy/siteAttacked colors, sites dot color, site icon sizing
- `src/types/ui.ts` - 7 new site toggle keys in LayerToggles, SITE_TYPE_LABELS mapping
- `src/stores/uiStore.ts` - Site toggle state and actions with parent/child restore behavior
- `src/hooks/useEntityLayers.ts` - Site IconLayer with attack-based coloring, visibleSites/siteAttackMap memos
- `src/hooks/useSelectedEntity.ts` - Extended to search siteStore, widened entity type to MapEntity | SiteEntity
- `src/components/layout/LayerTogglesSlot.tsx` - 7 site toggle rows after Events section
- `src/components/layout/DetailPanelSlot.tsx` - Routes site entities to SiteDetail, widened type helpers
- `src/components/map/EntityTooltip.tsx` - SiteContent component with attack status display
- `src/components/map/BaseMap.tsx` - Widened HoverState and picker types for SiteEntity
- `src/__tests__/entityLayers.test.ts` - Updated for 13 icons, 9 layers
- `src/__tests__/LayerToggles.test.tsx` - Updated for 15 toggle rows with site toggles

## Decisions Made
- Widened entity types throughout the UI stack (`MapEntity | SiteEntity`) rather than adding SiteEntity to the MapEntity union -- preserves the fundamental distinction between static reference data and live telemetry
- Attack status computed entirely client-side using event store data with coarse bbox pre-filter + haversine for O(sites * nearby_events) performance
- Site toggles explicitly not suppressed during custom date range mode per user constraint (sites are static reference data)
- Added `AnyEntity` type alias in useEntityLayers for clean glow/highlight layer typing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing tests for new icon/layer/toggle counts**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** Existing tests expected 7 icon keys, 8 layers, and 8 toggle rows -- now 13, 9, and 15
- **Fix:** Updated entityLayers.test.ts and LayerToggles.test.tsx assertions to match new counts
- **Files modified:** src/__tests__/entityLayers.test.ts, src/__tests__/LayerToggles.test.tsx
- **Verification:** All tests pass (except 3 pre-existing ICON_SIZE failures)
- **Committed in:** bee36b2, a26cb2c

**2. [Rule 3 - Blocking] Widened BaseMap types for SiteEntity picking**
- **Found during:** Task 2 (type checking after EntityTooltip changes)
- **Issue:** BaseMap HoverState, handleDeckHover/Click casts, and isEntityTooltipVisible used strict MapEntity type -- SiteEntity picking would fail type checks
- **Fix:** Imported SiteEntity, widened HoverState, casts, and visibility function to accept MapEntity | SiteEntity
- **Files modified:** src/components/map/BaseMap.tsx
- **Verification:** TypeScript compiles clean (tsc --noEmit)
- **Committed in:** a26cb2c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 (Key Sites Overlay) is complete: data pipeline + rendering + UI integration
- All site types visible on map with per-type icons and attack-based coloring
- Site toggles, tooltip, and detail panel fully functional
- 3 pre-existing test failures in entityLayers.test.ts (ICON_SIZE for airstrike/groundCombat/targeted) remain from earlier phases -- documented in deferred-items.md

## Self-Check: PASSED

- All 2 created files exist on disk (attackStatus.ts, SiteDetail.tsx)
- Both task commits (bee36b2, a26cb2c) found in git log
- TypeScript compiles clean (tsc --noEmit)
- 568/571 tests pass (3 pre-existing ICON_SIZE failures)

---
*Phase: 15-key-sites-overlay*
*Completed: 2026-03-20*
