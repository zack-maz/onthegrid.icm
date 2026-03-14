---
status: resolved
phase: 02-base-map
source: [02-01-SUMMARY.md, 02-02-PLAN.md must_haves]
started: 2026-03-14T23:00:00Z
updated: 2026-03-14T23:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Map Renders Centered on Iran
expected: Open the app. A 2.5D dark map appears centered on Iran with slight tilt and visible terrain bumps on mountain ranges (Zagros, Alborz).
result: issue
reported: "I'm not seeing any mountain range bumps"
severity: major

### 2. Map Fills Viewport
expected: The map fills the entire browser viewport inside the dark-themed AppShell. No gaps or scrollbars.
result: pass

### 3. Pan and Zoom
expected: Click+drag to pan (smooth movement, bounded to wider Middle East). Scroll wheel to zoom in/out (min ~3, max ~15).
result: pass

### 4. Rotate and Tilt
expected: Right-click drag rotates the map bearing. Ctrl+click+drag adjusts pitch/tilt.
result: pass

### 5. Labels — Roads Hidden, Countries Visible
expected: Country names and major city labels are visible. Road name labels are NOT visible.
result: pass

### 6. Emphasized Borders
expected: Country borders are brighter/thicker than typical CARTO dark map borders. Clearly distinguishable.
result: pass

### 7. Water Bodies Tinted Blue
expected: Persian Gulf, Caspian Sea, and Gulf of Oman have a subtle dark blue tint distinguishing them from land.
result: pass

### 8. Compass Control
expected: A compass indicator is visible (no zoom +/- buttons). Double-clicking it animates the map back to the default centered-on-Iran view.
result: pass

### 9. Coordinate Readout
expected: Moving the cursor over the map updates a lat/lon readout in the bottom-right corner.
result: pass

### 10. Scale Bar
expected: A scale bar showing distance (km) is visible in the bottom-right area.
result: pass

### 11. Vignette Effect
expected: A subtle dark gradient frames the viewport edges, giving a 'looking through a scope' feel.
result: issue
reported: "No subtle gradient. If you make one, keep it very faint"
severity: minor

### 12. Loading Screen
expected: Reload the page. A brief loading pulse animation appears on the dark background, then the map fades in smoothly (~300-500ms).
result: issue
reported: "Make the pulse ripple across the entire screen while loading"
severity: minor

### 13. Existing Overlays Intact
expected: Title, counters, layer toggles, and filter overlays still float above the map in their correct positions.
result: pass

## Summary

total: 13
passed: 10
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "User sees a 2.5D dark map centered on Iran with visible terrain bumps on mountain ranges (Zagros, Alborz)"
  status: resolved
  reason: "User reported: I'm not seeing any mountain range bumps"
  severity: major
  test: 1
  root_cause: "DEM tile source URL in constants.ts points to MapLibre demo tileset (jaxa_terrainrgb_N047E011) which only covers the European Alps. All terrain tile requests for Iran return HTTP 404."
  artifacts:
    - path: "src/components/map/constants.ts"
      issue: "TERRAIN_SOURCE_URL points to Alps-only demo tileset"
  missing:
    - "Replace demo terrain URL with global DEM tileset (AWS Terrarium tiles or MapTiler)"
  debug_session: ".planning/debug/terrain-bumps-not-visible.md"
- truth: "Loading screen pulse animation ripples across entire screen while map loads"
  status: resolved
  reason: "User reported: Make the pulse ripple across the entire screen while loading"
  severity: minor
  test: 12
  root_cause: "Current animation is a tiny 12px dot with Tailwind animate-pulse (opacity oscillation only). No scale/ripple keyframes exist. User wants full-screen expanding ripple rings."
  artifacts:
    - path: "src/components/map/MapLoadingScreen.tsx"
      issue: "Inner element is a small dot with animate-pulse instead of full-screen ripple"
    - path: "src/styles/app.css"
      issue: "No custom @keyframes ripple animation defined"
  missing:
    - "Add @keyframes ripple with scale + opacity animation to app.css"
    - "Replace small dot with expanding ripple ring elements in MapLoadingScreen"
  debug_session: ""
- truth: "A subtle dark gradient frames the viewport edges, giving a looking through a scope feel"
  status: resolved
  reason: "User reported: No subtle gradient. If you make one, keep it very faint"
  severity: minor
  test: 11
  root_cause: "MapVignette rendered before Map component in BaseMap.tsx DOM order. MapLibre's positioned container (.maplibregl-map) paints on top of earlier siblings, occluding the vignette despite z-index."
  artifacts:
    - path: "src/components/map/BaseMap.tsx"
      issue: "MapVignette at line 89 rendered before Map (lines 90-127) — should be after"
  missing:
    - "Move MapVignette after the closing Map tag in BaseMap.tsx"
    - "Ensure vignette gradient is very faint per user preference"
  debug_session: ".planning/debug/vignette-not-visible.md"
