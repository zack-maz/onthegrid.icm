---
phase: 27-conflict-geolocation-improvement
plan: 05
subsystem: ui
tags: [react, deck.gl, scatterplot, event-detail, tooltip, precision-ring, layer-toggles]

requires:
  - phase: 27-01
    provides: ConflictEventType 5-type taxonomy with LLM fields on ConflictEventData
  - phase: 27-04
    provides: Updated CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS, filterStore with 5 sub-toggles
provides:
  - Master + 5 sub-toggle event layer controls in LayerTogglesSlot
  - EVENT_TYPE_COLORS shared red-spectrum color mapping
  - Enriched EventDetail with summary, casualties, precision, LLM badge, source count
  - EntityTooltip precision indicator dots
  - PrecisionRingLayer for geolocation uncertainty visualization
affects: [useEntityLayers, BaseMap, threat-density, counters]

tech-stack:
  added: []
  patterns: [precision-ring-scatterplot, event-color-spectrum, master-sub-toggle]

key-files:
  created:
    - src/lib/eventColors.ts
    - src/components/map/PrecisionRingLayer.tsx
  modified:
    - src/components/layout/LayerTogglesSlot.tsx
    - src/components/detail/EventDetail.tsx
    - src/components/map/EntityTooltip.tsx
    - src/components/map/BaseMap.tsx
    - src/__tests__/LayerToggles.test.tsx
    - src/__tests__/DetailPanel.test.tsx

key-decisions:
  - "EVENT_TYPE_COLORS exported from src/lib/eventColors.ts as shared module for reuse across layers and toggles"
  - "Red spectrum colors chosen to avoid clash with yellow flights, purple ships, green sites"
  - "Precision rings use ScatterplotLayer with radiusUnits meters and pickable:false (visual-only, no click intercept)"
  - "Precision rings stacked below entity icons in both zoom crossover orderings"
  - "Summary/casualties sections hide entirely when not present (no 'No summary available' placeholder)"

patterns-established:
  - "Master + sub-toggle pattern: master dims all children when OFF, children retain individual state"
  - "Precision dot color coding: exact=green, neighborhood=yellow, city=orange, region=red"
  - "Event sub-toggle integration in LayerTogglesSlot separated by divider from visualization layers"

requirements-completed: [D-08, D-09, D-11, D-13, D-15, D-18, D-19]

duration: 6min
completed: 2026-04-09
---

# Phase 27 Plan 05: UI Features — Enriched Event Display Summary

**Master + 5 sub-toggle event controls, enriched EventDetail with LLM summary/casualties/precision, precision radius rings on map**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T20:08:12Z
- **Completed:** 2026-04-09T20:14:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- LayerTogglesSlot now shows Events master toggle + 5 indented sub-toggles (Airstrikes, Ground Combat, Explosions, Targeted, Other) with distinct red-spectrum colors
- EventDetail displays LLM-enriched data: summary block, casualties (killed/injured/unknown), precision indicator with color-coded dot, AI-enriched badge, source count
- EntityTooltip shows precision dot with distance label for LLM-enriched events
- PrecisionRingLayer renders translucent radius rings (1km/5km/25km) for neighborhood/city/region precision levels
- EVENT_TYPE_COLORS shared module for consistent color usage across layers

## Task Commits

Each task was committed atomically:

1. **Task 1: LayerTogglesSlot master + 5 sub-toggles and event type colors** - `6610e7f` (feat)
2. **Task 2: EventDetail enrichment + EntityTooltip + PrecisionRingLayer** - `3333d7d` (feat)

## Files Created/Modified
- `src/lib/eventColors.ts` - EVENT_TYPE_COLORS and EVENT_TYPE_RGBA shared color constants
- `src/components/map/PrecisionRingLayer.tsx` - ScatterplotLayer-based precision uncertainty rings
- `src/components/layout/LayerTogglesSlot.tsx` - Master + 5 sub-toggle event controls with color dots
- `src/components/detail/EventDetail.tsx` - Summary, casualties, precision indicator, LLM badge, source count
- `src/components/map/EntityTooltip.tsx` - Precision indicator dot with distance label in event tooltips
- `src/components/map/BaseMap.tsx` - PrecisionRingLayer integration in DeckGLOverlay layer stack
- `src/__tests__/LayerToggles.test.tsx` - 15 tests (up from 7) covering new toggle behavior
- `src/__tests__/DetailPanel.test.tsx` - 24 tests (up from 18) with 6 new LLM enrichment tests

## Decisions Made
- EVENT_TYPE_COLORS extracted to `src/lib/eventColors.ts` as a shared module rather than inline in LayerTogglesSlot, enabling reuse by entity layers and icon system
- Red spectrum colors: airstrike bright red (#ff3b30), on_ground dark red (#c0392b), explosion orange-red (#e74c3c), targeted crimson (#dc143c), other maroon (#800000) -- chosen to stay within the red family while being visually distinguishable
- Precision rings placed BEFORE conflict layers in both zoom orderings so rings render behind event markers
- Summary and casualties sections use conditional rendering that hides entirely when not present, avoiding "No data" placeholders
- LLM actors array preferred over legacy actor1/actor2 when available

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useFilteredEntities destructuring**
- **Found during:** Task 2 (PrecisionRingLayer)
- **Issue:** Used `filteredEvents` property name but `useFilteredEntities` returns `{ events }` not `{ filteredEvents }`
- **Fix:** Changed destructuring from `{ filteredEvents }` to `{ events: filteredEvents }`
- **Files modified:** src/components/map/PrecisionRingLayer.tsx
- **Verification:** All 782 client tests pass
- **Committed in:** 3333d7d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial naming mismatch, no scope change.

## Issues Encountered
- Server tests fail due to missing `openai` npm package (introduced by Wave 1-2 LLM work, not installed in worktree). This is pre-existing and unrelated to Plan 05 changes. All 782 client tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All UI features for the 5-type taxonomy and LLM enrichment are now in place
- Plan 06 (test suite updates) can proceed with these components available
- EVENT_TYPE_COLORS is ready for consumption by icon/entity layer coloring if needed

## Self-Check: PASSED

All 8 key files verified present. Both task commits (6610e7f, 3333d7d) verified in git log. 782/782 client tests passing. TypeScript compiles clean.

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
