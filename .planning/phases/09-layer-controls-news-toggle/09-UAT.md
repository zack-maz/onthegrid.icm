---
status: testing
phase: 09-layer-controls-news-toggle
source: [09-01-SUMMARY.md, 09-02 committed tasks]
started: 2026-03-18T00:45:00Z
updated: 2026-03-18T00:45:00Z
---

## Current Test

number: 1
name: Layers panel visible
expected: |
  Below the StatusPanel in the top-right, a "Layers" panel appears with the OverlayPanel style (dark, blurred background, rounded). It has a "Layers" header text.
awaiting: user response

## Tests

### 1. Layers panel visible
expected: Below the StatusPanel in the top-right, a "Layers" panel appears with the OverlayPanel style (dark, blurred background, rounded). It has a "Layers" header text.
result: PASS

### 2. Toggle row layout
expected: The Layers panel shows 7 toggle rows in this order: Flights, Ground (indented), Pulse (indented), Ships, Drones, Missiles, News. Each row has a colored dot and label text. Ground and Pulse are visually indented under Flights with smaller text.
result: PASS

### 3. Toggle dimming behavior
expected: Clicking any toggle row dims it to ~40% opacity (noticeably faded). Clicking again restores full opacity. The transition is smooth (not instant).
result: PASS

### 4. Flight layer toggle
expected: With Flights toggled OFF (dimmed), airborne flight markers disappear from the map. Toggling back ON makes them reappear.
result: PASS

### 5. Ship layer toggle
expected: With Ships toggled OFF, ship markers (gray chevrons) disappear from the map. Toggling back ON makes them reappear.
result: PASS

### 6. Independent flight/ground control
expected: Toggle Flights OFF, then toggle Ground ON. Only ground aircraft should be visible on the map (if any exist in the data). Airborne flights remain hidden.
result: PASS

### 7. News tooltips on hover
expected: Toggle News ON. Hover over a drone or missile marker (red starburst/xmark icons) on the map. A dark tooltip appears showing GDELT metadata: event type, location, actors, date, CAMEO code, Goldstein scale, and a clickable source link.
result: [pending]

### 8. News toggle hides tooltips
expected: Toggle News OFF. Hover over a drone or missile marker. No tooltip appears.
result: [pending]

### 9. localStorage persistence
expected: Set some toggles to OFF (e.g., Ships OFF, News ON). Refresh the page. After reload, the toggle states are preserved — Ships is still dimmed/OFF and News is still ON.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0

## Gaps

[none yet]
