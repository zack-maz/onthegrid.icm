---
phase: 17-notification-center
plan: 04
subsystem: proximity-alerts
tags: [spatial, alerts, flight-tracking, infrastructure, proximity]
dependency_graph:
  requires: [flightStore, siteStore, geo]
  provides: [useProximityAlerts, ProximityAlertOverlay]
  affects: [BaseMap]
tech_stack:
  added: []
  patterns: [haversine-proximity, coarse-bbox-prefilter, map-project-html-overlay, raf-throttled-rerender]
key_files:
  created:
    - src/hooks/useProximityAlerts.ts
    - src/components/map/ProximityAlertOverlay.tsx
    - src/__tests__/proximityAlerts.test.ts
  modified:
    - src/components/map/BaseMap.tsx
decisions:
  - Pure computation function exported separately from hook for testability
  - Coarse 0.5 degree bbox pre-filter reuses attackStatus.ts pattern at 50km scale
  - HTML overlay via map.project() chosen over deck.gl layer for easy expand/collapse with React state
  - RAF-throttled move event subscription prevents excessive re-renders during pan/zoom
  - Deduplication keeps closest flight per site (most urgent threat)
metrics:
  duration: 4min
  completed: 2026-03-20
---

# Phase 17 Plan 04: Proximity Alerts Summary

Haversine-based proximity detection between unidentified flights and key infrastructure sites with map-rendered warning icons that expand on click to show threat details.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create useProximityAlerts hook (TDD) | 96a6e02 | src/hooks/useProximityAlerts.ts, src/__tests__/proximityAlerts.test.ts |
| 2 | Build ProximityAlertOverlay and wire into BaseMap | ce53e5f | src/components/map/ProximityAlertOverlay.tsx, src/components/map/BaseMap.tsx |

## Implementation Details

### useProximityAlerts Hook

- `computeProximityAlerts(flights, sites)` pure function exported for unit testing
- Filters to `data.unidentified === true` flights only
- 0.5 degree coarse bbox pre-filter before haversine computation (same pattern as attackStatus.ts)
- 50km haversine threshold for proximity detection
- Deduplicates by siteId keeping closest flight per site
- Returns `ProximityAlert[]` sorted by distance ascending (most urgent first)
- `ProximityAlert` interface: siteId, siteLat, siteLng, siteLabel, siteType, flightId, flightLabel, distanceKm, heading

### ProximityAlertOverlay Component

- HTML-based overlay using `map.project([lng, lat])` for screen coordinate projection
- Collapsed state: 24x24px amber pulsing warning triangle at site location
- Expanded state: detail card showing site name, flight label, distance (1 decimal km), heading
- RAF-throttled re-render on map move events for smooth position updates
- Auto-clears expanded state when alert resolves (flight exits 50km radius)
- Rendered as child of `<Map>` in BaseMap for `useMap()` context access

## Test Results

- 9 proximity alert tests passing (empty states, threshold, dedup, heading, sorting)
- 650 total tests passing across 53 test files (full suite green)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vitest run src/__tests__/proximityAlerts.test.ts` -- 9/9 pass
- `npx vitest run` -- 650/650 pass across 53 files

## Self-Check: PASSED
