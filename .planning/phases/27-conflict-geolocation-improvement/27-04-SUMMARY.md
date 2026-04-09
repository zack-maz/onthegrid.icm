---
phase: 27-conflict-geolocation-improvement
plan: 04
subsystem: ui
tags: [zustand, typescript, conflict-events, toggle-groups, severity, deck.gl]

# Dependency graph
requires:
  - phase: 27-01
    provides: 5-type ConflictEventType union in server/types.ts
provides:
  - Updated CONFLICT_TOGGLE_GROUPS with 5 entries (showAirstrikes, showOnGround, showExplosions, showTargeted, showOther)
  - Updated EVENT_TYPE_LABELS for 5 new types
  - Master showEvents toggle + 5 sub-toggles in filterStore
  - Updated TYPE_WEIGHTS with 5 entries in severity.ts
  - Updated entity layers, counters, threat heatmap, and all UI consumers for 5-type taxonomy
affects: [27-05, 27-06, LayerTogglesSlot, useQuerySync, NotificationCard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Master + sub-toggle pattern for event visibility (showEvents gates all, sub-toggles refine)"
    - "eventToggleMap Record<string, boolean> for per-type toggle lookups replacing CONFLICT_TOGGLE_GROUPS casts"

key-files:
  created: []
  modified:
    - src/types/ui.ts
    - src/stores/filterStore.ts
    - src/lib/severity.ts
    - src/hooks/useEntityLayers.ts
    - src/components/counters/useCounterData.ts
    - src/components/map/layers/ThreatHeatmapOverlay.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - src/components/layout/FilterPanelSlot.tsx
    - src/components/search/SearchResultItem.tsx
    - src/components/detail/WaterFacilityDetail.tsx
    - src/hooks/useWaterLayers.ts

key-decisions:
  - "GROUND_COMBAT_TYPES counter group combines on_ground + explosion + other (3 of 5 new types) to preserve the existing 3-row counter layout (Airstrikes, Ground Combat, Targeted)"
  - "DESTRUCTIVE_EVENT_TYPES simplified from [airstrike,bombing,shelling,wmd] to [airstrike,explosion] for water facility attack status"
  - "Master showEvents toggle gates all event visibility; sub-toggles only refine within that gate"
  - "eventToggleMap pattern in useEntityLayers/ThreatHeatmapOverlay replaces verbose CONFLICT_TOGGLE_GROUPS.showXxx cast lookups"

patterns-established:
  - "Master + sub-toggle: showEvents boolean gates all events, 5 sub-booleans gate per-type"
  - "eventToggleMap: Record<string, boolean> built from toggle store for clean per-type visibility checks"

requirements-completed: [D-08, D-09]

# Metrics
duration: 9min
completed: 2026-04-09
---

# Phase 27 Plan 04: Client-Side Type Cascade Summary

**5-type ConflictEventType cascaded through all client stores, hooks, layers, counters, and 18 test files with master+sub-toggle pattern**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-09T19:55:24Z
- **Completed:** 2026-04-09T20:04:34Z
- **Tasks:** 2
- **Files modified:** 21 (3 source + 1 test in Task 1, 11 source + 7 tests in Task 2)

## Accomplishments
- Replaced 11-type CONFLICT_TOGGLE_GROUPS (3 groups) with 5-type layout (5 groups, 1:1 with types)
- Added master showEvents toggle to filterStore with 5 sub-toggles, replacing old showGroundCombat
- Updated TYPE_WEIGHTS from 11 entries to 5 entries with recalibrated weights
- Cascaded new types through useEntityLayers, useCounterData, ThreatHeatmapOverlay, FilterPanelSlot, DetailPanelSlot, SearchResultItem, WaterFacilityDetail, useWaterLayers
- Updated 10 test files with new type values, all 769 client tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS, and filterStore** - `419c176` (feat)
2. **Task 2: Update severity, search, counters, entity layers, threat heatmap, and all client tests** - `d16cf00` (feat)

## Files Created/Modified
- `src/types/ui.ts` - CONFLICT_TOGGLE_GROUPS (5 entries), EVENT_TYPE_LABELS (5 entries), isConflictEventType (unchanged, auto-derives)
- `src/stores/filterStore.ts` - showEvents master toggle + showOnGround/showExplosions/showOther sub-toggles + actions
- `src/lib/severity.ts` - TYPE_WEIGHTS with 5 entries (airstrike:10, explosion:8, targeted:8, on_ground:6, other:3)
- `src/hooks/useEntityLayers.ts` - eventToggleMap pattern, updated icon/color switches, master gate
- `src/components/counters/useCounterData.ts` - GROUND_COMBAT_TYPES array (on_ground+explosion+other), master gate
- `src/components/map/layers/ThreatHeatmapOverlay.tsx` - toggleMap pattern replacing CONFLICT_TOGGLE_GROUPS lookups
- `src/components/layout/FilterPanelSlot.tsx` - Master Events button + 5 sub-type filter buttons
- `src/components/layout/DetailPanelSlot.tsx` - Updated dot color lookups for new toggle group names
- `src/components/search/SearchResultItem.tsx` - Updated entity color for 'targeted' type
- `src/components/detail/WaterFacilityDetail.tsx` - DESTRUCTIVE_EVENT_TYPES = [airstrike, explosion]
- `src/hooks/useWaterLayers.ts` - DESTRUCTIVE_EVENT_TYPES = [airstrike, explosion]
- 10 test files updated with new type values

## Decisions Made
- GROUND_COMBAT_TYPES combines on_ground + explosion + other into one counter row to preserve existing 3-row layout
- DESTRUCTIVE_EVENT_TYPES simplified to [airstrike, explosion] since bombing/shelling/wmd no longer exist as separate types
- Master showEvents toggle added above sub-toggles in FilterPanelSlot for quick all-events on/off
- eventToggleMap Record pattern preferred over repeated CONFLICT_TOGGLE_GROUPS cast lookups

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated FilterPanelSlot, DetailPanelSlot, SearchResultItem, WaterFacilityDetail, useWaterLayers**
- **Found during:** Task 2
- **Issue:** Plan only listed 10 files but grep found 6 additional source files referencing old types (showGroundCombat, assassination, abduction, bombing, shelling, wmd)
- **Fix:** Updated all 6 additional files to use new type names
- **Files modified:** FilterPanelSlot.tsx, DetailPanelSlot.tsx, SearchResultItem.tsx, WaterFacilityDetail.tsx, useWaterLayers.ts, tagRegistry.test.ts
- **Verification:** npx tsc --noEmit passes, all 769 client tests pass
- **Committed in:** d16cf00

**2. [Rule 2 - Missing Critical] Updated additional test files (StatusPanel, eventStore, ThreatClusterDetail, tagRegistry)**
- **Found during:** Task 2
- **Issue:** Plan listed 4 test files but grep found 4 additional test files with old type references
- **Fix:** Updated all additional test files
- **Files modified:** StatusPanel.test.tsx, eventStore.test.ts, ThreatClusterDetail.test.tsx, tagRegistry.test.ts
- **Verification:** All tests pass
- **Committed in:** d16cf00

---

**Total deviations:** 2 auto-fixed (both missing critical -- files not listed in plan that referenced old types)
**Impact on plan:** Essential for correctness. Without these fixes, tests would fail and runtime would show wrong type colors/icons. No scope creep.

## Issues Encountered
- Pre-existing server test failure (llm-provider.test.ts) due to missing `openai` npm dependency from Wave 1 server changes -- out of scope for this client-only plan

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All client-side code now uses the 5-type taxonomy consistently
- Ready for Plan 05 (UI component updates for LayerTogglesSlot, CountersSlot, etc.)
- Ready for Plan 06 (search/filter integration with new types)

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
