---
status: testing
phase: 23-threat-density-improvements
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md]
started: 2026-04-02T06:00:00Z
updated: 2026-04-02T06:00:00Z
---

## Current Test

number: 2
name: P90 Normalization — Quieter Areas Visible
expected: |
  Toggle the threat layer ON. The heatmap should render with a military thermal (FLIR) color palette: dark indigo/purple for low-threat areas transitioning through magenta, orange, amber, yellow to bright red for high-threat hotspots. It should NOT be the old monochrome dark-red palette.
awaiting: user response

## Tests

### 1. Thermal Palette Visible
expected: Toggle the threat layer ON. The heatmap should render with a military thermal (FLIR) color palette: dark indigo/purple for low-threat areas transitioning through magenta, orange, amber, yellow to bright red for high-threat hotspots. It should NOT be the old monochrome dark-red palette.
result: issue
reported: "only seeing dark indigo/purple"
severity: major

### 2. P90 Normalization — Quieter Areas Visible
expected: With the threat layer ON, zoom out to see the full Middle East. Both high-activity areas (Syria/Iraq border) and lower-activity areas (Iran interior, Yemen) should show visible color variation. Quieter areas should NOT be invisible/black — they should show the cooler end of the thermal palette.
result: issue
reported: "All threat clusters are the same color regardless of details"
severity: major

### 3. Cluster Radius Differentiation
expected: Clusters with more events or higher threat weight should appear larger than single-event or low-threat clusters. Cluster sizes should vary across the map.
result: issue
reported: "All threat clusters are the same radius regardless of details"
severity: major

### 4. Static Cluster Size
expected: Cluster circles should stay the same screen-space size regardless of zoom level. They should NOT grow/shrink as you zoom in/out.
result: issue
reported: "They shouldn't scale with zoom — pick a static size"
severity: major

### 5. Finer Grid Resolution
expected: Zoom into a conflict area (e.g., Syria). The heatmap should show more granular spatial detail than before.
result: [pending]

### 6. Cluster Click Opens Detail Panel
expected: Click on a threat hotspot on the heatmap. The detail panel should open with "Threat Cluster — N events" header and summary stats.
result: [pending]

### 7. Event Drill-Down from Cluster
expected: Click an individual event in the cluster's event list. Map flies to event and opens EventDetail.
result: [pending]

### 8. Legend Updated
expected: Threat Density legend shows thermal palette endpoints (dark indigo/purple "Low", bright red "High").
result: [pending]

## Summary

total: 8
passed: 0
issues: 4
pending: 4
skipped: 0

## Gaps

- truth: "Heatmap renders full thermal palette from dark indigo through magenta/orange/yellow to bright red"
  status: failed
  reason: "User reported: only seeing dark indigo/purple"
  severity: major
  test: 1
- truth: "Clusters vary in color based on threat intensity"
  status: failed
  reason: "User reported: all threat clusters are the same color regardless of details"
  severity: major
  test: 2
- truth: "Clusters vary in radius based on event count/severity"
  status: failed
  reason: "User reported: all threat clusters are the same radius regardless of details"
  severity: major
  test: 3
- truth: "Cluster circles stay the same screen-space size regardless of zoom"
  status: failed
  reason: "User reported: clusters scale with zoom, should be static"
  severity: major
  test: 4
