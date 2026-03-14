---
status: resolved
trigger: "Investigate why the vignette edge effect is not visible on the map"
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T23:30:00Z
---

## Current Focus

hypothesis: MapVignette is rendered BEFORE the Map component in DOM order, and the Map's canvas likely paints over it
test: Check DOM order and z-index stacking
expecting: If vignette div sits behind the maplibre canvas, gradient is hidden
next_action: Verify z-index stacking context and DOM order

## Symptoms

expected: Dark gradient vignette around viewport edges
actual: No visible gradient at all
errors: None reported
reproduction: Load the map — no dark edges visible
started: Unknown

## Eliminated

## Evidence

- timestamp: 2026-03-14T00:01:00Z
  checked: MapVignette.tsx component code
  found: Component renders a div with radial-gradient, z-[var(--z-overlay)] (z-index 10), pointer-events-none, absolute inset-0
  implication: Component itself looks correct in isolation

- timestamp: 2026-03-14T00:02:00Z
  checked: BaseMap.tsx render order (lines 86-131)
  found: MapVignette is rendered at line 89, BEFORE the <Map> component at line 90. The Map component renders a full canvas element. The CoordinateReadout div at line 128 is rendered AFTER the Map and uses z-[var(--z-controls)] (z-index 30).
  implication: DOM order places MapVignette BEFORE Map. The Map canvas will paint on top of MapVignette. Even though MapVignette has z-index 10, the maplibre-gl canvas inside <Map> creates its own stacking context and paints over earlier siblings.

- timestamp: 2026-03-14T00:03:00Z
  checked: app.css z-index scale
  found: --z-overlay: 10, --z-controls: 30. The vignette uses z-overlay (10).
  implication: Z-index value is fine IF the element is positioned after the map in DOM order. Currently it is before.

- timestamp: 2026-03-14T00:04:00Z
  checked: maplibre-gl.css stacking behavior
  found: .maplibregl-map has "position: relative; overflow: hidden". .maplibregl-canvas has "position: absolute". The Map component creates a positioned stacking context that naturally paints over earlier siblings in DOM order.
  implication: Confirms that DOM order is the issue. The Map's positioned container covers the vignette div that precedes it. Z-index 10 on the vignette does not help because it comes before the Map in the DOM and the Map container is also positioned.

## Resolution

root_cause: MapVignette is rendered BEFORE the <Map> component in the JSX (line 89 vs line 90-127). The maplibre-gl canvas creates its own stacking context and renders on top of the vignette div. The vignette needs to be AFTER the Map in DOM order so it sits on top visually.
fix:
verification:
files_changed: []
