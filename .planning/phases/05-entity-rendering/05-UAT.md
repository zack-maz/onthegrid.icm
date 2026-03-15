---
status: complete
phase: 05-entity-rendering
source: [05-01-SUMMARY.md]
started: 2026-03-15T22:00:00Z
updated: 2026-03-15T22:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Flight Chevrons on Map
expected: Green chevron icons appear on the map for flight entities, rotated to match each aircraft's heading direction.
result: pass

### 2. Altitude-Based Opacity
expected: Flights at higher altitudes appear more opaque (brighter) while flights at lower altitudes appear more transparent. Compare a high-altitude flight to a low-altitude one — there should be a visible opacity difference.
result: issue
reported: "Make the icons bigger as I zoom in. It's hard to tell"
severity: minor

### 3. Unidentified Flight Pulse Animation
expected: Any unidentified flights (shown as yellow chevrons instead of green) should visibly pulse — their opacity oscillates between dim and bright on roughly a 2-second cycle, making them stand out from regular flights.
result: skipped
reason: No unidentified flights available to test

### 4. Live Position Updates
expected: Watch the map for ~10-15 seconds. Flight chevrons should shift position as new polling data arrives (~5s intervals), reflecting real-time aircraft movement.
result: skipped
reason: Not enough flight data available to observe movement

## Summary

total: 4
passed: 1
issues: 1
pending: 0
skipped: 2

## Gaps

- truth: "Icons scale with zoom level so altitude opacity differences are visible when zoomed in"
  status: failed
  reason: "User reported: Make the icons bigger as I zoom in. It's hard to tell"
  severity: minor
  test: 2
  artifacts: []
  missing: []
  debug_session: ""
