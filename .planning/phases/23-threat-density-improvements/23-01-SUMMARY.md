---
phase: 23-threat-density-improvements
plan: 01
subsystem: ui
tags: [deck.gl, heatmap, threat-density, thermal-palette, P90-normalization]

# Dependency graph
requires:
  - phase: 22-gdelt-event-quality-osint
    provides: GDELT event pipeline with quality filtering and OSINT integration
provides:
  - 8-stop military thermal color palette for threat heatmap (THERMAL_COLOR_RANGE)
  - No-decay threat weight computation (age-independent scoring)
  - 0.25-degree grid resolution (~28km cells, ~9x spatial fidelity)
  - P90-based colorDomain normalization preventing high-activity zone washout
  - eventIds tracking on ThreatZoneData for cluster detail panel (Plan 02 dependency)
  - computeP90 utility function for percentile-based normalization
affects: [23-02, threat-heatmap, detail-panel, map-layers]

# Tech tracking
tech-stack:
  added: []
  patterns: [P90-normalization for heatmap color domain, eventIds array in grid cells for cross-referencing]

key-files:
  created: []
  modified:
    - src/components/map/layers/ThreatHeatmapOverlay.tsx
    - src/__tests__/ThreatHeatmapOverlay.test.tsx

key-decisions:
  - "Thermal palette uses 8 FLIR Ironbow-inspired stops: indigo->purple->violet->magenta->orange->amber->yellow->red"
  - "Legend endpoint colors: #1e0f50 (Low) and #ff2820 (High) matching first and last thermal stops"
  - "computeP90 floor-clamped to 1 to prevent degenerate zero-range colorDomain"

patterns-established:
  - "P90 normalization: compute 90th percentile of weights, set colorDomain=[0, p90] to prevent outlier washout"
  - "eventIds tracking: grid cells accumulate event IDs for downstream detail lookups"

requirements-completed: [P23-01, P23-02, P23-03, P23-04, P23-05, P23-09]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 23 Plan 01: Threat Heatmap Core Improvements Summary

**8-stop FLIR Ironbow thermal palette with P90 normalization, no temporal decay, 0.25-degree grid, and eventIds tracking for cluster detail panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T05:14:32Z
- **Completed:** 2026-04-02T05:19:50Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Replaced 5-stop red palette with 8-stop military thermal (FLIR Ironbow) for better threat intensity differentiation
- Removed temporal decay from computeThreatWeight so all events score equally regardless of age
- Increased grid resolution from 0.75-degree (~83km) to 0.25-degree (~28km) for ~9x spatial fidelity
- Added P90-based colorDomain normalization preventing high-activity zones from washing out quieter areas
- Added eventIds array to ThreatZoneData for Plan 02 cluster detail panel dependency
- Added computeP90 utility with floor clamp of 1

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: Update ThreatHeatmapOverlay core (palette, decay, grid, P90, eventIds)**
   - `5b5f1c8` (test) - RED: failing tests for all heatmap changes
   - `fe0ffdd` (feat) - GREEN: implementation passing all 30 tests

## Files Created/Modified
- `src/components/map/layers/ThreatHeatmapOverlay.tsx` - Updated heatmap with thermal palette, no decay, 0.25-deg grid, P90 normalization, eventIds tracking
- `src/__tests__/ThreatHeatmapOverlay.test.tsx` - Updated test suite: 30 tests covering computeP90, no-decay weight, 0.25-deg grid, eventIds, thermal palette, colorDomain

## Decisions Made
- Thermal palette colors chosen as FLIR Ironbow-inspired (deep indigo through bright red) -- provides better contrast than monochrome red at both low and high intensity
- Legend endpoint hex values (#1e0f50, #ff2820) derived from first and last THERMAL_COLOR_RANGE RGB stops
- computeP90 returns floor of 1 rather than 0 to prevent degenerate zero-range colorDomain that would make all cells render as maximum intensity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- eventIds field on ThreatZoneData is ready for Plan 02 (cluster detail panel navigation)
- THERMAL_COLOR_RANGE is exported for any downstream consumers needing palette reference
- computeP90 is exported and reusable for other normalization needs

## Self-Check: PASSED

- [x] ThreatHeatmapOverlay.tsx exists
- [x] ThreatHeatmapOverlay.test.tsx exists
- [x] 23-01-SUMMARY.md exists
- [x] Commit 5b5f1c8 (RED) exists
- [x] Commit fe0ffdd (GREEN) exists

---
*Phase: 23-threat-density-improvements*
*Completed: 2026-04-02*
