# Phase 26: Water Stress Layer - Research

**Researched:** 2026-04-02
**Domain:** Water stress visualization, Overpass API water infrastructure, WRI Aqueduct data, Open-Meteo precipitation, deck.gl GeoJsonLayer/IconLayer
**Confidence:** MEDIUM

## Summary

Phase 26 adds a toggleable water stress overlay showing resource scarcity at specific water infrastructure locations (dams, reservoirs, treatment plants, canals) with stress-colored markers, major river line features color-coded by watershed stress, and real-time precipitation integration. Desalination plants migrate from the Sites overlay to this new Water layer. Water facilities receive full entity treatment: clickable detail panel, counters, search tags -- all gated by the water layer being active.

The implementation requires three data sources: (1) Overpass API for water infrastructure locations (same pattern as Phase 15 sites), (2) WRI Aqueduct 4.0 for baseline water stress indicators per hydrological basin, and (3) Open-Meteo for 30-day precipitation anomaly data. River line features use Natural Earth 10m shapefile data, pre-extracted to static GeoJSON. The WRI Aqueduct data is a one-time download processed into a static lookup table keyed by basin ID.

**Primary recommendation:** Use a static pre-processed Aqueduct lookup JSON (basin ID -> stress indicators) combined with a coordinate-to-basin mapping script, rather than runtime API calls. River and basin data are extracted offline; only Overpass facility queries and Open-Meteo precipitation polling happen at runtime.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Point-based approach** -- water stress shown at specific facility locations, NOT blanket country/watershed polygon fills
- **WRI Aqueduct baseline stress** -- annual basin-level data; each facility gets stress level from its WRI watershed via coordinate-to-basin intersection
- **Multiple Aqueduct indicators** -- baseline water stress + drought risk + groundwater depletion + seasonal variability (all shown in detail panel)
- **Color ramp** -- continuous gradient from black (extreme stress / lowest water health) to light blue (healthy / low stress)
- **Facility markers** -- type-specific icons (dam, reservoir, plant, canal) tinted by stress color
- **Open-Meteo precipitation** -- real-time 30-day precipitation anomaly per facility, polled every 6 hours, Redis cache 6h TTL
- **Water Facility Data Source** -- Overpass API query for Middle East water infrastructure (same pattern as Phase 15)
- **Facility types** -- 4 types from OSM: Dams (waterway=dam), Reservoirs (natural=water + reservoir=*), Water treatment plants (man_made=water_works), Canals/Aqueducts (waterway=canal)
- **Desalination plants** -- moved entirely from Sites overlay to Water layer; remove desalination toggle from Sites section
- **Fetch pattern** -- one-time fetch on mount (same as useSiteFetch), Redis cache 24h TTL
- **Attack status** -- cross-reference facility locations with GDELT events within 5km
- **Rivers** -- major conflict-relevant rivers as line features: Tigris, Euphrates, Nile, Jordan, Karun, Litani
- **River extent** -- full river length (not clipped to IRAN_BBOX)
- **River color** -- stress-colored by watershed
- **Z-level** -- water facilities on the SAME 3D z-level as entities
- **Layer order** -- Political < Ethnic < Rivers < Water facilities = Entities
- **Legend** -- continuous gradient bar from black (extreme stress) to light blue (healthy)
- **Full integration** -- water facilities appear in Counters, are searchable, trigger proximity alerts -- but ONLY when Water layer is active
- **Search tags** -- type:dam/reservoir/plant/canal, stress:low/high/extreme, name:, near:

### Claude's Discretion
- River/lake label styling (font, size, italic -- must be visually distinct from ethnic labels)
- Overpass query optimization (canal size filtering to avoid excessive results)
- Composite water health formula (how WRI baseline + precipitation anomaly combine)
- Water facility icon designs per type
- Open-Meteo precipitation API endpoint specifics and batch strategy
- WRI Aqueduct data download/extraction approach

### Deferred Ideas (OUT OF SCOPE)
- Threat cluster hover/unhover bug -- from Phase 25 discussion
- Southern Lebanon disputed zone -- needs better boundary data (from Phase 24)
- Yazidi ethnic zone -- absent from GeoEPR, deferred from Phase 25
- Real-time reservoir level data -- satellite-based reservoir monitoring (NASA/ESA)
- Groundwater depletion animation -- GRACE satellite data
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @deck.gl/layers | existing | GeoJsonLayer for rivers, IconLayer for facilities | Already used for all overlays |
| @vis.gl/react-maplibre | existing | Map component integration | Already the map framework |
| zustand | existing | waterStore for facility state | Project store pattern |
| @upstash/redis | existing | Server-side caching | Already the cache layer |
| express | existing | API route for /api/water | Already the server framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Natural Earth 10m rivers | 5.0.0 | Static river line GeoJSON | Pre-extracted during build script |
| WRI Aqueduct 4.0 | latest | Basin-level water stress data | Pre-processed to static JSON lookup |
| Open-Meteo Forecast API | free tier | 30-day precipitation anomaly | Polled every 6h server-side |
| shapefile (npm) | ^0.6 | Parse Natural Earth .shp to GeoJSON | One-time extraction script only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static Aqueduct JSON | Earth Engine runtime API | Earth Engine requires auth + Google Cloud; static JSON is zero-dependency |
| Natural Earth rivers | OSM Overpass river query | Overpass would return too many segments; NE has named rivers as single features |
| shapefile npm | ogr2ogr CLI | ogr2ogr requires GDAL install; shapefile npm is pure JS |

**No new npm production dependencies needed.** The `shapefile` npm package is a dev-only dependency for the one-time extraction script.

## Architecture Patterns

### Recommended Project Structure
```
src/
  stores/waterStore.ts                    # Water facility state (facilities, connectionStatus, precipitation)
  hooks/useWaterFetch.ts                  # One-time facility fetch on mount (mirrors useSiteFetch)
  hooks/useWaterPrecipPolling.ts          # 6h precipitation polling
  hooks/useWaterLayers.ts                 # deck.gl layers (rivers + facility markers)
  components/detail/WaterFacilityDetail.tsx  # Detail panel for water facilities
  components/map/layers/WaterOverlay.tsx  # Tooltip component for water hover
  data/rivers.json                        # Static GeoJSON (6 rivers, pre-extracted)
  data/aqueduct-basins.json              # Static basin lookup (pfaf_id -> stress indicators)
  lib/waterStress.ts                     # Stress computation, color interpolation, composite formula

server/
  adapters/overpass-water.ts             # Overpass query for water infrastructure
  adapters/open-meteo-precip.ts          # Open-Meteo precipitation fetcher
  routes/water.ts                        # /api/water endpoint (facilities + stress + precipitation)
  lib/basinLookup.ts                     # Coordinate-to-basin assignment

scripts/
  extract-rivers.ts                      # One-time: NE shapefile -> rivers.json
  extract-aqueduct-basins.ts             # One-time: Aqueduct CSV -> aqueduct-basins.json
```

### Pattern 1: Static Data Pre-Processing (WRI Aqueduct + Rivers)
**What:** Download WRI Aqueduct 4.0 data and Natural Earth 10m rivers once. Run extraction scripts to produce compact static JSON files that ship with the app.
**When to use:** Data that changes annually (Aqueduct) or never (river geometry).
**Approach:**

1. **Aqueduct extraction script** (`scripts/extract-aqueduct-basins.ts`):
   - Download `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip`
   - Extract CSV baseline annual data
   - Filter to Middle East basins (bounding box lat 0-50, lng 20-80)
   - Output `src/data/aqueduct-basins.json`: array of `{ pfaf_id, bws_raw, bws_score, bws_cat, bws_label, drr_raw, drr_score, gtd_raw, gtd_score, sev_raw, sev_score, iav_raw, iav_score, area_km2, name_0 }`
   - Include basin polygon centroids (or bounding boxes) for coordinate-to-basin lookup

2. **River extraction script** (`scripts/extract-rivers.ts`):
   - Download Natural Earth 10m rivers+lake centerlines shapefile
   - Filter to 6 named rivers: Tigris, Euphrates, Nile, Jordan, Karun, Litani
   - Output `src/data/rivers.json`: GeoJSON FeatureCollection with LineString/MultiLineString features
   - Each feature has `properties.name` and optionally `properties.pfaf_ids` (basin IDs the river passes through)

### Pattern 2: Coordinate-to-Basin Assignment
**What:** Map each water facility (lat/lng) to its WRI Aqueduct basin to get stress indicators.
**When to use:** Server-side when building the water facility response.
**Approach:**

The WRI Aqueduct data uses HydroBASINS Level 6 (Pfafstetter codes). For coordinate-to-basin lookup:

- **Option A (Recommended):** The Aqueduct GeoPackage contains basin polygons. Extract a simplified polygon set for the Middle East during the build script, then do point-in-polygon at runtime on the server.
- **Option B (Simpler fallback):** Use the Aqueduct CSV + a nearest-basin approach: for each facility coordinate, find the closest basin centroid. Less precise but avoids polygon geometry in the build.
- **Option C (Hybrid):** Pre-compute basin assignments for well-known facility locations and store them in the static JSON. For new facilities, fall back to nearest-centroid.

**Recommendation:** Option A if the GeoPackage is available and basin polygons can be extracted to a reasonable size (< 2MB for ME region). Otherwise Option C -- pre-compute assignments in the extraction script using the full GeoPackage, then ship only the lookup table (no runtime polygon intersection needed).

### Pattern 3: Composite Water Health Score
**What:** Combine WRI Aqueduct baseline stress with Open-Meteo precipitation anomaly into a single 0-1 health score.
**When to use:** Color-coding facility markers and river segments.
**Formula (recommended):**

```typescript
// WRI baseline stress score is 0-5 (0=low stress, 5=extremely high)
// Normalize to 0-1 where 0 = worst health (extreme stress), 1 = best health
const baselineHealth = 1 - (bws_score / 5);

// Precipitation anomaly: ratio of actual 30-day precip to climatological normal
// < 1.0 = drier than normal (stress), > 1.0 = wetter than normal (relief)
// Clamp to [0.5, 1.5] range, then normalize to [-0.25, +0.25] modifier
const precipModifier = Math.max(-0.25, Math.min(0.25, (precipRatio - 1.0) * 0.5));

// Composite: baseline dominates (75%), precipitation adjusts (25%)
const compositeHealth = Math.max(0, Math.min(1, baselineHealth + precipModifier));
```

### Pattern 4: Desalination Migration
**What:** Move desalination plants from siteStore/Sites overlay to waterStore/Water layer.
**When to use:** During the store and adapter refactoring.
**Approach:**

1. Remove desalination from the Overpass query in `server/adapters/overpass.ts` (remove 3 `nwr` lines)
2. Remove `'desalination'` from `SiteType` union in `server/types.ts`
3. Add desalination to the new water Overpass query in `server/adapters/overpass-water.ts`
4. Remove the desalination toggle from the Sites section in toggle UI
5. Update `useCounterData` to remove desalination from site counts
6. Update `filterStore` `enabledSiteTypes` default to remove desalination

### Pattern 5: River Line Rendering
**What:** Render 6 major rivers as stress-colored GeoJsonLayer lines.
**When to use:** When water layer is active.
**Example:**

```typescript
// Source: deck.gl GeoJsonLayer docs
const riverLayer = new GeoJsonLayer({
  id: 'water-rivers',
  data: riversGeoJson,
  getLineColor: (f: Feature) => {
    // Map basin stress to color on black->light blue gradient
    const health = f.properties.compositeHealth ?? 0.5;
    return stressToColor(health); // [r, g, b, 200]
  },
  getLineWidth: (f: Feature) => {
    // Major rivers wider than tributaries
    const scale = f.properties.scalerank ?? 3;
    return Math.max(1, 6 - scale) * 500; // meters
  },
  lineWidthUnits: 'meters',
  lineWidthMinPixels: 1,
  lineWidthMaxPixels: 6,
  pickable: false, // Rivers are display-only, not interactive
});
```

### Anti-Patterns to Avoid
- **Runtime polygon intersection on client:** Never ship basin polygons to the frontend for point-in-polygon. All basin assignment happens server-side or at build time.
- **Polling Aqueduct API:** WRI Aqueduct data is annual. Never poll it. Use static pre-extracted JSON.
- **Merging water facilities into siteStore:** Water facilities need their own store because they have different data shape (stress indicators, precipitation) and their visibility is gated by a different mechanism (visualization layer toggle vs entity toggle).
- **Fetching rivers from Overpass:** River geometry from Overpass comes as disconnected segments. Use Natural Earth for clean, named, full-length river features.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shapefile parsing | Custom binary parser | `shapefile` npm package | SHP format is complex with DBF companion files |
| Point-in-polygon | Manual ray casting | Pre-computed basin assignments | Runtime polygon intersection is expensive and unnecessary for static basins |
| Stress color interpolation | Manual RGB math | Simple linear lerp between color stops | Black-to-blue is a simple 2-stop gradient |
| Overpass query structure | New query builder | Follow existing `server/adapters/overpass.ts` pattern | Proven query structure with country filtering + fallback |
| Cache pattern | Custom Redis wrapper | Existing `cacheGetSafe`/`cacheSetSafe` | Already handles Redis failures with in-memory fallback |
| Attack status | New proximity logic | Existing `computeAttackStatus` from `src/lib/attackStatus.ts` | Same 5km radius cross-reference with GDELT events |

**Key insight:** The hardest part of this phase is data preparation (Aqueduct extraction, river extraction, basin assignment), not runtime rendering. Invest in the extraction scripts; the runtime code follows established project patterns.

## Common Pitfalls

### Pitfall 1: Overpass Canal Query Returning Too Many Results
**What goes wrong:** `waterway=canal` in the Middle East returns thousands of small irrigation channels, overwhelming the map with markers.
**Why it happens:** OSM tags irrigation ditches and small channels the same as major aqueducts.
**How to avoid:** Filter by name tag presence (`["name"]` selector) or by minimum way length. Only show canals that have names in OSM -- this naturally filters to significant infrastructure.
**Warning signs:** Overpass query returning 1000+ canal features; map becoming cluttered with tiny markers.

### Pitfall 2: WRI Aqueduct Data Format Surprise
**What goes wrong:** The downloaded ZIP may contain GeoPackage (spatial) and/or CSV (tabular). The CSV lacks geometry; the GeoPackage requires spatial library support.
**Why it happens:** WRI provides data in multiple formats but the exact contents of the ZIP are not documented clearly.
**How to avoid:** Download the ZIP first, inspect contents, then write the extraction script. If GeoPackage is available, use it for polygon extraction (basin assignment). If only CSV, use nearest-centroid fallback for basin assignment.
**Warning signs:** Script fails to find expected file format in ZIP.

### Pitfall 3: Open-Meteo 1000-Location Limit
**What goes wrong:** If there are more than ~200 water facilities, the batch precipitation request exceeds the 1000-location API limit (since `past_days=30` with `daily` variables carries higher API weight).
**Why it happens:** Open-Meteo's free tier weighs requests by data volume. 200 locations x 30 days x daily variables may hit internal limits.
**How to avoid:** Batch precipitation requests into groups of 100 locations max. Use the existing pattern from `server/adapters/open-meteo.ts` (split into bands). Cache aggressively with 6h TTL since precipitation data changes slowly.
**Warning signs:** 429 rate limit errors from Open-Meteo; API responses timing out.

### Pitfall 4: Redis Command Budget at ~92%
**What goes wrong:** Adding new cache keys (water facilities, precipitation) pushes Redis command usage over the Upstash free tier limit.
**Why it happens:** STATE.md notes Redis at ~92% command budget. New polling adds more reads/writes.
**How to avoid:** Use generous cache TTLs (24h for facilities, 6h for precipitation). Avoid per-facility cache keys -- cache the entire response as a single key. Minimize Redis round-trips.
**Warning signs:** Upstash dashboard showing >95% command usage; `cacheGetSafe` returning `degraded: true` frequently.

### Pitfall 5: Desalination Migration Breaking Existing Tests
**What goes wrong:** Removing `desalination` from `SiteType` breaks type checks and tests that reference it.
**Why it happens:** Desalination is referenced in `useCounterData`, `filterStore`, `LayerTogglesSlot`, and potentially test fixtures.
**How to avoid:** Grep for all references to `desalination` in the codebase before removing. Update test fixtures, type definitions, and UI components in a single coordinated change.
**Warning signs:** TypeScript compilation errors after removing from SiteType union; test failures in counter or filter tests.

### Pitfall 6: River GeoJSON File Size
**What goes wrong:** Natural Earth 10m river data for 6 rivers could be large (especially the Nile at full length), inflating bundle size.
**Why it happens:** High-resolution river geometry has many coordinate points.
**How to avoid:** Apply Douglas-Peucker simplification during extraction (same pattern as Phase 25 ethnic zones at epsilon=0.05). Target < 200KB for all 6 rivers combined.
**Warning signs:** rivers.json exceeding 500KB; Vite bundle size warnings.

## Code Examples

### Water Facility Store Pattern
```typescript
// Follows siteStore.ts pattern
import { create } from 'zustand';
import type { CacheResponse } from '@/types/entities';

export type WaterFacilityType = 'dam' | 'reservoir' | 'treatment_plant' | 'canal' | 'desalination';

export interface WaterFacility {
  id: string;           // "water-{osmId}"
  type: 'water';
  facilityType: WaterFacilityType;
  lat: number;
  lng: number;
  label: string;
  operator?: string;
  osmId: number;
  // WRI Aqueduct indicators (assigned server-side via basin lookup)
  stress: {
    bws_score: number;  // 0-5 baseline water stress
    bws_label: string;  // "Low", "Medium", "High", "Extremely High"
    drr_score: number;  // drought risk
    gtd_score: number;  // groundwater table decline
    sev_score: number;  // seasonal variability
    compositeHealth: number; // 0-1 computed health (0=worst, 1=best)
  };
  // Precipitation (updated via polling)
  precipitation?: {
    last30DaysMm: number;
    anomalyRatio: number; // actual/normal, <1 = drier than usual
    updatedAt: number;
  };
}

export type WaterConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

interface WaterState {
  facilities: WaterFacility[];
  connectionStatus: WaterConnectionStatus;
  setWaterData: (response: CacheResponse<WaterFacility[]>) => void;
  updatePrecipitation: (data: Map<string, WaterFacility['precipitation']>) => void;
  setError: () => void;
  setLoading: () => void;
}
```

### Stress-to-Color Interpolation
```typescript
// Black (#000000) = extreme stress (health=0) to Light Blue (#7dd3fc) = healthy (health=1)
const STRESS_COLORS: [number, number, number][] = [
  [0, 0, 0],         // health=0: black (extreme stress)
  [30, 58, 95],      // health=0.33: dark blue
  [59, 130, 180],    // health=0.66: medium blue
  [125, 211, 252],   // health=1.0: light blue (healthy)
];

export function stressToRGBA(health: number, alpha = 200): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, health));
  const segment = t * (STRESS_COLORS.length - 1);
  const i = Math.floor(segment);
  const f = segment - i;
  const c0 = STRESS_COLORS[Math.min(i, STRESS_COLORS.length - 1)];
  const c1 = STRESS_COLORS[Math.min(i + 1, STRESS_COLORS.length - 1)];
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
    alpha,
  ];
}
```

### Overpass Water Infrastructure Query
```typescript
// Follows server/adapters/overpass.ts pattern
const WATER_QUERY = `
[out:json][timeout:60];
(${areaUnion};)->.searchArea;
(
  nwr["waterway"="dam"](area.searchArea);
  nwr["natural"="water"]["water"="reservoir"](area.searchArea);
  nwr["man_made"="water_works"](area.searchArea);
  nwr["waterway"="canal"]["name"](area.searchArea);
  nwr["man_made"="desalination_plant"](area.searchArea);
  nwr["water_works"="desalination"](area.searchArea);
);
out center tags;
`;
```
Note: Canal query includes `["name"]` filter to exclude unnamed irrigation channels.

### Open-Meteo Precipitation Batch Request
```typescript
// Batch locations into groups of 100 to stay under API limits
// Use past_days=30 to get 30-day precipitation history
const url = `https://api.open-meteo.com/v1/forecast?` +
  `latitude=${lats.join(',')}&longitude=${lngs.join(',')}&` +
  `daily=precipitation_sum&past_days=30&forecast_days=0&timezone=UTC`;
```

### Legend Registration
```typescript
// Register water stress legend in MapLegend.tsx pattern
LEGEND_REGISTRY.push({
  layerId: 'water',
  title: 'Water Health',
  mode: 'gradient',
  colorStops: [
    { color: '#000000', label: 'Extreme Stress' },
    { color: '#1e3a5f', label: '' },
    { color: '#3b82b4', label: '' },
    { color: '#7dd3fc', label: 'Healthy' },
  ],
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Aqueduct 3.0 | Aqueduct 4.0 | 2023 | New HydroBASINS L6 unit; CMIP6 projections; 13 indicators |
| Country-level stress | Basin-level stress | Aqueduct 4.0 | Much finer granularity per hydrological basin |
| Shapefile-only downloads | CSV + GeoPackage | Aqueduct 4.0 | Easier programmatic access |
| Open-Meteo history API | Forecast API with past_days | 2024 | Simpler for recent precipitation -- single endpoint |

**Deprecated/outdated:**
- Aqueduct 3.0 data format (different column names, different basin system) -- use 4.0
- Open-Meteo `archive` endpoint for recent data -- use `forecast` with `past_days` instead

## Open Questions

1. **WRI Aqueduct ZIP contents**
   - What we know: Direct download at `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip`; contains baseline annual data with pfaf_id + indicator columns
   - What's unclear: Exact file formats in ZIP (CSV vs GeoPackage vs both); whether basin polygon geometry is included
   - Recommendation: Download and inspect before writing extraction script. If no polygons, use nearest-centroid basin assignment with pre-computed centroids from Earth Engine metadata.

2. **Canal count in Middle East**
   - What we know: `waterway=canal` with `["name"]` filter should reduce results significantly
   - What's unclear: Exact count of named canals in the region; whether it's manageable (< 200) or still overwhelming
   - Recommendation: Test the Overpass query on overpass-turbo.eu before implementing. If > 300 results, add additional filtering (e.g., minimum length or exclude irrigation-tagged canals).

3. **Precipitation climatological normals**
   - What we know: Open-Meteo provides actual precipitation; anomaly ratio needs a "normal" baseline
   - What's unclear: Whether Open-Meteo provides historical normals, or if we need a separate climate dataset
   - Recommendation: Use Open-Meteo Climate API (`https://climate-api.open-meteo.com/v1/climate`) for 30-year normals, or hardcode regional monthly averages from published climate data. Keep it simple -- even approximate normals give useful relative signal.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom (frontend) / node (server) |
| Config file | vite.config.ts (test section) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| W-01 | Overpass water query returns facilities | unit | `npx vitest run server/__tests__/adapters/overpass-water.test.ts -x` | Wave 0 |
| W-02 | Basin lookup assigns stress to facility | unit | `npx vitest run server/__tests__/lib/basinLookup.test.ts -x` | Wave 0 |
| W-03 | waterStore state management | unit | `npx vitest run src/__tests__/waterStore.test.ts -x` | Wave 0 |
| W-04 | Stress-to-color interpolation | unit | `npx vitest run src/__tests__/waterStress.test.ts -x` | Wave 0 |
| W-05 | Composite health formula | unit | `npx vitest run src/__tests__/waterStress.test.ts -x` | Wave 0 |
| W-06 | Desalination removed from siteStore | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Existing (update) |
| W-07 | Water legend registers correctly | unit | `npx vitest run src/__tests__/MapLegend.test.ts -x` | Existing (update) |
| W-08 | /api/water route returns facilities | unit | `npx vitest run server/__tests__/routes/water.test.ts -x` | Wave 0 |
| W-09 | Open-Meteo precip adapter | unit | `npx vitest run server/__tests__/adapters/open-meteo-precip.test.ts -x` | Wave 0 |
| W-10 | LayerTogglesSlot water no longer comingSoon | unit | `npx vitest run src/__tests__/LayerToggles.test.ts -x` | Existing (update) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/adapters/overpass-water.test.ts` -- covers W-01
- [ ] `server/__tests__/lib/basinLookup.test.ts` -- covers W-02
- [ ] `src/__tests__/waterStore.test.ts` -- covers W-03
- [ ] `src/__tests__/waterStress.test.ts` -- covers W-04, W-05
- [ ] `server/__tests__/routes/water.test.ts` -- covers W-08
- [ ] `server/__tests__/adapters/open-meteo-precip.test.ts` -- covers W-09
- [ ] `scripts/extract-rivers.ts` -- data extraction (manual verification)
- [ ] `scripts/extract-aqueduct-basins.ts` -- data extraction (manual verification)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `server/adapters/overpass.ts`, `src/stores/siteStore.ts`, `src/hooks/useSiteFetch.ts`, `src/lib/attackStatus.ts` -- proven patterns for site fetching, caching, attack status
- Existing codebase: `src/components/map/layers/WeatherOverlay.tsx`, `server/adapters/open-meteo.ts` -- Open-Meteo integration pattern
- Existing codebase: `src/stores/layerStore.ts` -- `water` already registered as VisualizationLayerId
- Existing codebase: `src/components/map/MapLegend.tsx` -- LEGEND_REGISTRY with gradient mode support
- deck.gl GeoJsonLayer docs -- `getLineColor` accessor for feature-based line coloring

### Secondary (MEDIUM confidence)
- [WRI Aqueduct 4.0 Data Dictionary](https://github.com/wri/Aqueduct40/blob/master/data_dictionary_water-risk-atlas.md) -- field names: bws_raw, bws_score, bws_cat, drr_score, gtd_score, sev_score, pfaf_id
- [WRI Aqueduct 4.0 Download](https://www.wri.org/data/aqueduct-global-maps-40-data) -- direct download link at files.wri.org
- [Google Earth Engine Aqueduct catalog](https://developers.google.com/earth-engine/datasets/catalog/WRI_Aqueduct_Water_Risk_V4_baseline_annual) -- confirmed field names and data structure
- [Open-Meteo Forecast API docs](https://open-meteo.com/en/docs) -- `past_days=30`, `daily=precipitation_sum`, comma-separated lat/lng, 1000 location limit
- [Open-Meteo Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api) -- `historical-forecast-api.open-meteo.com` for archived data
- [Natural Earth 10m rivers](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/) -- named river features with scale ranks

### Tertiary (LOW confidence)
- WRI Aqueduct ZIP file contents -- needs validation by actually downloading the file
- Open-Meteo free tier exact rate limits (10K calls/day, 5K/hour, 600/min reported) -- needs verification against actual usage
- Canal count from Overpass with name filter -- needs empirical testing on overpass-turbo

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use; only `shapefile` npm added as devDependency
- Architecture: MEDIUM - data extraction approach needs validation (Aqueduct ZIP contents, basin assignment method)
- Pitfalls: HIGH - Redis budget concern is documented in STATE.md; Overpass query patterns well-established
- Data sources: MEDIUM - WRI Aqueduct download link found but ZIP contents unverified; Open-Meteo precipitation pattern extrapolated from existing weather adapter

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days -- Aqueduct data is stable; Open-Meteo API is stable)
