---
status: resolved
trigger: "Investigate why 3D terrain bumps are not visible on the MapLibre map"
created: 2026-03-14T00:00:00Z
updated: 2026-03-14T23:30:00Z
---

## Current Focus

hypothesis: CONFIRMED - DEM tile source has no coverage over Iran
test: HTTP HEAD requests to terrain tile URLs computed for Iran coordinates
expecting: 404 responses for Iran tiles, 200 for Alps tiles
next_action: Report root cause

## Symptoms

expected: 3D terrain extrusion visible for Zagros/Alborz mountains
actual: Flat map, no mountain bumps visible
errors: Unknown (user report only)
reproduction: Load map, look at Iran region - should see mountain range bumps
started: Never worked - data source doesn't cover region

## Eliminated

- hypothesis: Terrain prop not wired correctly in react-maplibre
  evidence: Inspected @vis.gl/react-maplibre v8.1 source - _updateStyleComponents correctly handles terrain prop, calls map.setTerrain() when source is available, retries on sourcedata events
  timestamp: 2026-03-14

- hypothesis: DEM tile source URL unreachable
  evidence: tiles.json returns HTTP 200 with valid TileJSON metadata; z0/0/0 tile returns 200
  timestamp: 2026-03-14

- hypothesis: Terrain exaggeration too low
  evidence: TERRAIN_CONFIG sets exaggeration to 1.5, which is reasonable; but irrelevant since no tiles exist for the region
  timestamp: 2026-03-14

## Evidence

- timestamp: 2026-03-14
  checked: DEM tile source URL reachability
  found: tiles.json returns HTTP 200, valid TileJSON with global bounds claim (-180 to 180, -85 to 85)
  implication: Source metadata claims global coverage but actual tile availability is limited

- timestamp: 2026-03-14
  checked: React-maplibre terrain prop handling in @vis.gl/react-maplibre v8.1
  found: _updateStyleComponents in maplibre.js correctly calls map.setTerrain() when source is available; sourcedata event retries terrain attachment; code path is correct
  implication: The wiring is correct -- this is not a code bug

- timestamp: 2026-03-14
  checked: Terrain tile availability for Iran (lon=53.7, lat=32.4) at z5, z6
  found: z5/20/12 returns 404, z6/41/25 returns 404 -- tiles for Iran DO NOT EXIST
  implication: DEM source has no elevation data for the map's viewport

- timestamp: 2026-03-14
  checked: Terrain tile availability for Alps (lon=11, lat=47) as control
  found: z5/16/11 returns 200, z5/17/11 returns 200, z6/33/22 returns 200
  implication: Tiles only exist in a small European region (Alps demo area)

- timestamp: 2026-03-14
  checked: Full z3 and z5 tile grid scan to map coverage
  found: Only z3/4/2 exists (covers 0-45E, 41-66.5N = central/northern Europe). Only z5/16/11 and z5/17/11 exist (covers 0-22.5E, 41-49N = Alps/central Europe). Iran is at 47-56E, 30-37N -- completely outside coverage.
  implication: The MapLibre demo tileset "jaxa_terrainrgb_N047E011" is a small Alps-only demo, NOT a global DEM tileset

- timestamp: 2026-03-14
  checked: TileJSON metadata name field
  found: "name": "jaxa_terrainrgb_N047E011" -- the N047E011 suffix indicates the tile covers a region centered around 47N 11E (Alps)
  implication: Despite claiming global bounds in metadata, this is a regional demo dataset

## Resolution

root_cause: The DEM tile source URL (https://demotiles.maplibre.org/terrain-tiles/tiles.json) is MapLibre's DEMO terrain tileset, which only contains elevation data for a small area around the European Alps (~0-22.5E, 41-49N). Iran's Zagros and Alborz mountain ranges (~47-56E, 30-37N) are completely outside the coverage area. All terrain tile requests for Iran return HTTP 404, so MapLibre has no elevation data to render 3D terrain bumps.
fix:
verification:
files_changed: []
