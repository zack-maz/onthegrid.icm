# Phase 2: Base Map - Research

**Researched:** 2026-03-14
**Domain:** Interactive 2.5D map rendering with Deck.gl + MapLibre GL JS in React
**Confidence:** HIGH

## Summary

This phase adds an interactive 2.5D map of Iran to the existing AppShell, replacing the placeholder `<div>` inside the `data-testid="map-container"` element. The map uses CARTO Dark Matter vector tiles as the base style, MapLibre GL JS for rendering, and Deck.gl as the GPU-accelerated visualization overlay (needed for future data layers). The React integration uses `@vis.gl/react-maplibre` (the dedicated MapLibre React wrapper from the vis.gl ecosystem) with `@deck.gl/mapbox`'s `MapboxOverlay` wired through the `useControl` hook.

The CARTO Dark Matter style provides a free, no-API-key vector tile base with country labels, borders, and water features. Style customization (hiding road labels, brightening borders, tinting water) is achieved via the `transformStyle` callback on the Map component or by modifying layers on the `onLoad` event. 3D terrain uses MapLibre's built-in terrain support with a free raster-DEM source from the MapLibre demo tiles server.

**Primary recommendation:** Use `@vis.gl/react-maplibre` as the React wrapper (not `react-map-gl/maplibre`) since it is the dedicated MapLibre-first package. Wire Deck.gl via `MapboxOverlay` + `useControl` in overlaid mode. Customize the CARTO Dark Matter style imperatively in `onLoad` to hide road labels and enhance borders/water. Add terrain declaratively via the Map component's `terrain` prop with a `Source` for the DEM tiles.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- CARTO dark-matter base tiles (free, no API key)
- Country and city labels visible; road names and minor features hidden
- Emphasized country borders (brighter/thicker lines than CARTO default), including Iran and all neighbors
- Subtle dark blue tint for water bodies (Persian Gulf, Caspian Sea, Gulf of Oman)
- Low-exaggeration 3D terrain (1-2x) so Zagros/Alborz ridgelines are visible bumps without dominating
- Centered on Iran (~32.4N, 53.7E) at zoom ~5-6
- Slight initial pitch (~30-40 degrees) to show 2.5D perspective immediately
- Hard bounds locked to wider Middle East region (~15N-45N, 30E-70E)
- Zoom limits: min ~3, max ~15
- Minimal navigation -- compass indicator only, no zoom buttons
- Double-click compass to reset to default view (animated)
- Right-click drag to rotate bearing, Ctrl+click+drag to adjust pitch
- Standard MapLibre defaults for scroll-to-zoom, click+drag to pan
- Subtle vignette edge effect (dark gradient around viewport edges) for 'looking through a scope' feel
- Compass and map UI elements use neutral gray/white -- accent colors reserved for data entities only
- Small lat/lon coordinate readout in bottom-right, updating on cursor move
- Small scale bar (km/miles) in bottom-right near coordinate readout
- Dark bg-surface with subtle pulse/breathing animation while tiles load
- Map fades in over ~300-500ms once tiles are ready

### Claude's Discretion
- Tile load fallback strategy
- Attribution placement and styling (must satisfy CARTO/OSM license requirements)
- Exact vignette gradient intensity
- Compass size and exact placement
- Coordinate readout and scale bar exact styling

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-01 | Interactive 2.5D dark map with pan, zoom, rotate (Deck.gl + MapLibre) | Full stack identified: `@vis.gl/react-maplibre` + `maplibre-gl` + `@deck.gl/mapbox` + CARTO Dark Matter tiles. Terrain via MapLibre DEM. All interaction handlers via MapLibre defaults. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `maplibre-gl` | ^5.20.1 | WebGL2 vector map renderer | Free, open-source fork of Mapbox GL JS. Supports 3D terrain, globe view, vector tiles. Active maintenance (latest release days ago). |
| `@vis.gl/react-maplibre` | ^8.1.0 | React wrapper for MapLibre GL JS | Official vis.gl ecosystem React wrapper. Provides declarative Map, Source, Layer, NavigationControl, ScaleControl components and useControl/useMap hooks. |
| `@deck.gl/core` | ^9.2.11 | Deck.gl core engine | GPU-accelerated WebGL2 visualization framework. Required foundation for all deck.gl layers. |
| `@deck.gl/react` | ^9.2.11 | Deck.gl React bindings | Provides useWidget hook and React widget wrappers. Not used for map integration (MapboxOverlay handles that) but needed for future deck.gl widget components. |
| `@deck.gl/mapbox` | ^9.2.11 | MapboxOverlay control | Implements IControl interface for MapLibre/Mapbox. Bridges deck.gl layer rendering into the MapLibre canvas. This is the glue between deck.gl and MapLibre. |
| `@deck.gl/layers` | ^9.2.11 | Standard deck.gl layers | ScatterplotLayer, IconLayer, ArcLayer, etc. Not immediately needed for Phase 2 but should be installed now since future phases depend on them. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CARTO Dark Matter tiles | N/A (CDN) | Base map style | Style URL: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` -- free, no API key, vector tiles with labels |
| MapLibre Demo Terrain Tiles | N/A (CDN) | 3D DEM elevation data | Tile URL: `https://demotiles.maplibre.org/terrain-tiles/tiles.json` -- free raster-dem source, 256px tiles, ALOS World 3D data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@vis.gl/react-maplibre` | `react-map-gl/maplibre` | `react-map-gl` v8.0+ exports a `/maplibre` endpoint, but `@vis.gl/react-maplibre` is the dedicated MapLibre-first package with native types. Prefer the dedicated package. |
| CARTO tiles | MapTiler | MapTiler requires API key (free tier available). CARTO is simpler for this use case. |
| MapLibre Demo DEM | AWS Terrain Tiles | AWS tiles are higher resolution but require more configuration. Demo tiles are sufficient for low-exaggeration terrain at zoom 3-15. |

**Installation:**
```bash
npm install maplibre-gl @vis.gl/react-maplibre @deck.gl/core @deck.gl/react @deck.gl/mapbox @deck.gl/layers
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── map/
│       ├── BaseMap.tsx          # Main map component (Map + DeckGLOverlay + terrain)
│       ├── DeckGLOverlay.tsx    # useControl wrapper for MapboxOverlay
│       ├── MapLoadingScreen.tsx # Pulse animation + fade-in transition
│       ├── MapVignette.tsx      # CSS vignette overlay
│       ├── CoordinateReadout.tsx # Lat/lon display, updates on mouse move
│       └── CompassControl.tsx   # Custom compass with reset-on-double-click
├── stores/
│   └── mapStore.ts             # Zustand store for map state (cursor coords, isLoaded, etc.)
└── styles/
    └── app.css                 # Add maplibre-gl CSS import + vignette styles
```

### Pattern 1: DeckGLOverlay via useControl
**What:** A React component that wraps `MapboxOverlay` from `@deck.gl/mapbox` using the `useControl` hook from `@vis.gl/react-maplibre`.
**When to use:** Always -- this is the standard pattern for wiring deck.gl into a react-maplibre Map.
**Example:**
```typescript
// Source: deck.gl official docs + react-maplibre useControl API
import { useControl } from '@vis.gl/react-maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapboxOverlayProps } from '@deck.gl/mapbox';

export function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// Usage inside <Map>:
// <DeckGLOverlay layers={[]} interleaved={false} />
```

### Pattern 2: Declarative Map with Terrain
**What:** The Map component from react-maplibre with terrain configured declaratively via the `terrain` prop and a `Source` for DEM tiles.
**When to use:** For the base map setup with 3D elevation.
**Example:**
```typescript
// Source: react-maplibre Map API + MapLibre 3D terrain docs
import { Map, Source, Layer, NavigationControl, ScaleControl } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW = {
  longitude: 53.7,
  latitude: 32.4,
  zoom: 5.5,
  pitch: 35,
  bearing: 0,
};

const MAX_BOUNDS: [number, number, number, number] = [30, 15, 70, 45]; // [west, south, east, north]

<Map
  initialViewState={INITIAL_VIEW}
  style={{ width: '100%', height: '100%' }}
  mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
  maxBounds={MAX_BOUNDS}
  minZoom={3}
  maxZoom={15}
  maxPitch={60}
  terrain={{ source: 'terrain-dem', exaggeration: 1.5 }}
  onLoad={handleStyleCustomization}
  onMouseMove={handleCursorCoords}
>
  <Source
    id="terrain-dem"
    type="raster-dem"
    url="https://demotiles.maplibre.org/terrain-tiles/tiles.json"
    tileSize={256}
  />
  <Layer
    id="terrain-hillshade"
    type="hillshade"
    source="terrain-dem"
    paint={{
      'hillshade-exaggeration': 0.3,
      'hillshade-shadow-color': '#000000',
      'hillshade-highlight-color': '#222222',
    }}
  />
  <NavigationControl showZoom={false} showCompass={true} visualizePitch={true} position="bottom-right" />
  <ScaleControl unit="metric" position="bottom-right" />
  <DeckGLOverlay layers={[]} />
</Map>
```

### Pattern 3: Style Customization via onLoad
**What:** Imperatively modify CARTO Dark Matter layers after style loads to hide road labels, brighten borders, and tint water.
**When to use:** When you need to customize a third-party base style without hosting your own style JSON.
**Example:**
```typescript
// Source: MapLibre GL JS Map API (setPaintProperty, setLayoutProperty, getStyle)
import type { MapEvent } from '@vis.gl/react-maplibre';

function handleStyleCustomization(e: MapEvent) {
  const map = e.target;

  // Hide road name labels
  const roadLabelLayers = ['roadname_minor', 'roadname_sec', 'roadname_pri', 'roadname_major'];
  roadLabelLayers.forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', 'none');
    }
  });

  // Brighten country borders
  const borderLayers = ['boundary_country_outline', 'boundary_country_inner'];
  borderLayers.forEach(id => {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, 'line-color', '#888888');
      map.setPaintProperty(id, 'line-width', 1.5);
    }
  });

  // Tint water bodies dark blue
  if (map.getLayer('water')) {
    map.setPaintProperty('water', 'fill-color', '#0a1628');
  }
}
```

### Pattern 4: Zustand Map Store
**What:** A Zustand store for map-related state (cursor coordinates, load status, view state).
**When to use:** For sharing map state across non-map UI components (coordinate readout, loading screen).
**Example:**
```typescript
// Follows existing curried create<Type>()() pattern from uiStore.ts
import { create } from 'zustand';

interface MapState {
  isMapLoaded: boolean;
  cursorLng: number;
  cursorLat: number;
  setMapLoaded: () => void;
  setCursorPosition: (lng: number, lat: number) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  isMapLoaded: false,
  cursorLng: 0,
  cursorLat: 0,
  setMapLoaded: () => set({ isMapLoaded: true }),
  setCursorPosition: (lng, lat) => set({ cursorLng: lng, cursorLat: lat }),
}));
```

### Pattern 5: Vignette Overlay
**What:** A CSS-only vignette effect using a pointer-events-none div with radial gradient, placed over the map.
**When to use:** For the "looking through a scope" aesthetic effect.
**Example:**
```typescript
export function MapVignette() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--z-overlay)]"
      style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
      }}
    />
  );
}
```

### Pattern 6: Compass Reset on Double-Click
**What:** Custom behavior where double-clicking the compass resets bearing and pitch to defaults with animation.
**When to use:** Per user decision -- compass double-click resets to initial view.
**Example:**
```typescript
// Access the NavigationControl's container via useControl or a ref,
// then attach a dblclick listener that calls map.flyTo()
function handleCompassReset(map: maplibregl.Map) {
  map.flyTo({
    center: [53.7, 32.4],
    zoom: 5.5,
    pitch: 35,
    bearing: 0,
    duration: 1000,
  });
}
```

### Anti-Patterns to Avoid
- **Using DeckGL component as root with Map as child (reverse-controlled mode):** This blocks MapLibre interaction handlers and controls. Use the overlaid pattern (MapboxOverlay via useControl) instead.
- **Fetching and modifying the CARTO style JSON before passing to Map:** Introduces a loading delay and complexity. Modify layers imperatively in `onLoad` instead.
- **Creating a custom NavigationControl from scratch:** MapLibre's built-in NavigationControl with `showZoom: false` provides the compass. Add a dblclick listener for reset behavior.
- **Inline object definitions in Map props:** Causes unnecessary re-renders. Define `initialViewState`, `maxBounds`, and `terrain` as module-level constants.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Map rendering | Custom WebGL map renderer | MapLibre GL JS | Tile loading, WebGL state, projection math, gesture handling -- enormous complexity |
| deck.gl/MapLibre bridge | Custom canvas overlay sync | `@deck.gl/mapbox` MapboxOverlay | Camera sync, WebGL context sharing, layer interleaving handled automatically |
| React map wrapper | Imperative MapLibre in useEffect | `@vis.gl/react-maplibre` Map component | Handles lifecycle, prop diffing, controlled/uncontrolled state, cleanup |
| Scale bar | Manual distance calculation | MapLibre ScaleControl (via react-maplibre) | Projection-aware distance calculation, auto-updates on zoom/pan |
| Compass | Custom compass SVG + rotation | MapLibre NavigationControl (showZoom: false) | Syncs with map bearing automatically, visualizes pitch |
| 3D terrain | Custom elevation shading | MapLibre terrain + raster-dem source | GPU-accelerated terrain mesh from DEM tiles, built-in hillshading |
| Vignette | Complex canvas post-processing | CSS radial-gradient overlay | Pure CSS, zero performance cost, pointer-events-none passes clicks through |

**Key insight:** MapLibre GL JS and deck.gl together handle all the GPU-accelerated rendering, gesture handling, and tile management. The React layer (`@vis.gl/react-maplibre`) handles lifecycle. Custom code should focus on style customization, UI overlays, and state management.

## Common Pitfalls

### Pitfall 1: MapLibre CSS Not Imported
**What goes wrong:** Map renders but controls are unstyled, map canvas has no dimensions, layout breaks.
**Why it happens:** MapLibre GL JS requires its stylesheet for proper rendering.
**How to avoid:** Import `maplibre-gl/dist/maplibre-gl.css` in the map component file or in app.css.
**Warning signs:** Navigation controls render as plain text, map has 0x0 dimensions.

### Pitfall 2: Terrain Source Not Ready Before terrain Prop
**What goes wrong:** Console error about missing terrain source, terrain doesn't render.
**Why it happens:** The `terrain` prop references a source ID that must exist in the style.
**How to avoid:** Define the `Source` component with the DEM URL inside the Map. The react-maplibre Source component registers the source before the Map applies the terrain prop. Alternatively, set terrain in `onLoad` after calling `addSource`.
**Warning signs:** Console warnings about unknown source "terrain-dem".

### Pitfall 3: Inline Objects Causing Re-renders
**What goes wrong:** Map "jumps" or resets, excessive re-renders, poor performance.
**Why it happens:** React creates new object references on each render for inline `initialViewState`, `maxBounds`, `terrain` objects, causing react-maplibre to re-apply them.
**How to avoid:** Define view state, bounds, and terrain config as module-level constants outside the component.
**Warning signs:** Map re-centers unexpectedly, frame drops, React DevTools showing frequent Map re-renders.

### Pitfall 4: TypeScript IControl Mismatch (Older deck.gl)
**What goes wrong:** TypeScript error "Type 'MapboxOverlay' does not satisfy the constraint 'IControl'".
**Why it happens:** In deck.gl versions before 9.0.37, MapboxOverlay imported IControl types from mapbox-gl, which conflicted with maplibre-gl's IControl.
**How to avoid:** Use deck.gl >= 9.0.37 (current is 9.2.11). The PR #9279 removed the mapbox-gl type dependency.
**Warning signs:** TS error on the `useControl<MapboxOverlay>()` call.

### Pitfall 5: maxBounds Too Tight Prevents Terrain View
**What goes wrong:** User hits the bounds constraint at high zoom and pitch, feels restrictive.
**Why it happens:** maxBounds constrains the visible viewport edges, not the center. At high pitch, the top of the viewport looks far ahead.
**How to avoid:** Set bounds slightly wider than the intended region. The proposed [30E-70E, 15N-45N] is generous enough. Test at max zoom + max pitch to ensure usability.
**Warning signs:** Map "snaps" when panning near edges at tilted views.

### Pitfall 6: Layer IDs Change Between CARTO Style Versions
**What goes wrong:** `map.getLayer('roadname_minor')` returns undefined, style customization silently fails.
**Why it happens:** CARTO may update their style JSON and rename layers.
**How to avoid:** Always check `map.getLayer(id)` before calling `setLayoutProperty` or `setPaintProperty`. Log warnings for missing layers. Current known layer IDs are documented in this research.
**Warning signs:** Road labels still visible despite customization code.

### Pitfall 7: Map Component Not Filling Container
**What goes wrong:** Map renders at 0x0 or fixed pixel size instead of filling the AppShell container.
**Why it happens:** MapLibre needs explicit dimensions. The `style` prop must have width and height.
**How to avoid:** Pass `style={{ width: '100%', height: '100%' }}` and ensure the parent container has explicit dimensions (the AppShell's `absolute inset-0` already handles this).
**Warning signs:** Blank area where map should be, map renders but is tiny.

## Code Examples

Verified patterns from official sources:

### Complete BaseMap Component (Recommended Structure)
```typescript
// Combines: react-maplibre docs, deck.gl MapboxOverlay docs, MapLibre terrain docs
import { useCallback, useState } from 'react';
import {
  Map,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
} from '@vis.gl/react-maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapboxOverlayProps } from '@deck.gl/mapbox';
import { useControl } from '@vis.gl/react-maplibre';
import type { MapEvent } from '@vis.gl/react-maplibre';
import type { MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// --- Module-level constants (avoid re-render issues) ---
const INITIAL_VIEW_STATE = {
  longitude: 53.7,
  latitude: 32.4,
  zoom: 5.5,
  pitch: 35,
  bearing: 0,
};

const MAX_BOUNDS: [number, number, number, number] = [30, 15, 70, 45];
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const TERRAIN_SOURCE_URL = 'https://demotiles.maplibre.org/terrain-tiles/tiles.json';
const TERRAIN_CONFIG = { source: 'terrain-dem', exaggeration: 1.5 };

// --- DeckGL Overlay component ---
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// --- Main BaseMap ---
export function BaseMap() {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback((e: MapEvent) => {
    const map = e.target;
    // Hide road labels
    ['roadname_minor', 'roadname_sec', 'roadname_pri', 'roadname_major'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
    // Brighten borders
    ['boundary_country_outline', 'boundary_country_inner'].forEach(id => {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, 'line-color', '#888888');
        map.setPaintProperty(id, 'line-width', 1.5);
      }
    });
    // Tint water
    if (map.getLayer('water')) map.setPaintProperty(water, 'fill-color', '#0a1628');
    setIsLoaded(true);
  }, []);

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    // Update coordinate readout store
  }, []);

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      maxBounds={MAX_BOUNDS}
      minZoom={3}
      maxZoom={15}
      maxPitch={60}
      terrain={TERRAIN_CONFIG}
      onLoad={handleLoad}
      onMouseMove={handleMouseMove}
    >
      <Source id="terrain-dem" type="raster-dem" url={TERRAIN_SOURCE_URL} tileSize={256} />
      <Layer
        id="terrain-hillshade"
        type="hillshade"
        source="terrain-dem"
        paint={{
          'hillshade-exaggeration': 0.3,
          'hillshade-shadow-color': '#000000',
          'hillshade-highlight-color': '#222222',
        }}
      />
      <NavigationControl showZoom={false} showCompass visualizePitch position="bottom-right" />
      <ScaleControl unit="metric" position="bottom-right" />
      <DeckGLOverlay layers={[]} />
    </Map>
  );
}
```

### CARTO Dark Matter Layer IDs (for style customization)
```typescript
// Source: Fetched from https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json
// Border layers (customize: brighten/thicken)
const BORDER_LAYERS = ['boundary_county', 'boundary_state', 'boundary_country_outline', 'boundary_country_inner'];

// Road label layers (customize: hide)
const ROAD_LABEL_LAYERS = ['roadname_minor', 'roadname_sec', 'roadname_pri', 'roadname_major'];

// Water layers (customize: tint dark blue)
const WATER_LAYERS = ['water', 'water_shadow', 'waterway'];

// Water label layers (keep visible)
const WATER_LABEL_LAYERS = ['watername_ocean', 'watername_sea', 'watername_lake', 'waterway_label'];

// Place labels (keep visible -- country and city names)
const PLACE_LABEL_LAYERS = [
  'place_continent', 'place_country_1', 'place_country_2', 'place_state',
  'place_city_dot_z7', 'place_city_dot_r2', 'place_city_dot_r4', 'place_city_dot_r7',
  'place_city_r5', 'place_city_r6', 'place_town', 'place_villages',
];

// Additional minor features to potentially hide
const MINOR_FEATURE_LAYERS = ['place_suburbs', 'place_hamlet', 'poi'];
```

### Loading Screen with Fade Transition
```typescript
// Approach: Conditional rendering + CSS transition
export function MapLoadingScreen({ isLoaded }: { isLoaded: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-surface transition-opacity duration-500 ${
        isLoaded ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="h-4 w-4 animate-pulse rounded-full bg-text-muted" />
    </div>
  );
}
```

### Coordinate Readout Component
```typescript
// Updates from Zustand store, positioned in bottom-right overlay
import { useMapStore } from '@/stores/mapStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';

export function CoordinateReadout() {
  const { cursorLng, cursorLat } = useMapStore();
  return (
    <OverlayPanel className="text-xs font-mono text-text-secondary">
      {cursorLat.toFixed(4)}N, {cursorLng.toFixed(4)}E
    </OverlayPanel>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-map-gl` with MapLibre adapter | `@vis.gl/react-maplibre` dedicated package | 2024 (v8.0+) | Native MapLibre types, no Mapbox type conflicts |
| deck.gl MapboxOverlay with mapbox-gl type dep | MapboxOverlay with no mapbox-gl type dep | deck.gl 9.0.37+ (2024) | No TypeScript IControl mismatch with MapLibre |
| MapLibre terrain via imperative addSource/setTerrain | Declarative `terrain` prop on Map + Source component | react-maplibre 8.x | Cleaner React integration, automatic cleanup |
| CARTO raster tiles (PNG) | CARTO vector GL style (style.json) | Available for years, now standard | Crisp at all zooms, customizable layers, smaller payload |
| deck.gl v8 with separate canvas | deck.gl v9.2 with MapboxOverlay (interleaved or overlaid) | 2023-2024 | Better performance, proper z-ordering, shared WebGL context |

**Deprecated/outdated:**
- `react-map-gl` (without /maplibre endpoint): Still works but typed for Mapbox. Use `@vis.gl/react-maplibre` instead.
- deck.gl `DeckGL` component as root with `Map` child: "Reverse-controlled" mode blocks MapLibre controls. Use MapboxOverlay pattern instead.
- CARTO raster tile URLs (`{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`): Still work but vector style is preferred for customizability.

## Open Questions

1. **Terrain Source Reliability**
   - What we know: MapLibre demo terrain tiles (`demotiles.maplibre.org`) are free and work well.
   - What's unclear: SLA/uptime guarantees for the demo tile server in production use.
   - Recommendation: Use demo tiles for now. If reliability issues arise, switch to AWS Open Data Terrain Tiles (higher quality but more config). For this personal tool, demo tiles are fine.

2. **CARTO Style Layer ID Stability**
   - What we know: Current layer IDs fetched and documented above.
   - What's unclear: Whether CARTO updates these IDs without notice.
   - Recommendation: Guard all `setLayoutProperty`/`setPaintProperty` calls with `getLayer()` checks. Log warnings for missing IDs.

3. **Hillshade + Terrain Interaction**
   - What we know: MapLibre supports both hillshade layers and 3D terrain from the same DEM source.
   - What's unclear: Whether enabling both causes visual doubling of terrain effect.
   - Recommendation: Start with terrain only (via `terrain` prop). Add hillshade layer only if terrain alone doesn't give enough visual depth at low exaggeration. Test visually.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + @testing-library/react 16.3.2 |
| Config file | `vite.config.ts` (test block) + `src/test/setup.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01a | BaseMap component renders inside map-container | unit | `npx vitest run src/__tests__/BaseMap.test.tsx -t "renders"` | No -- Wave 0 |
| MAP-01b | DeckGLOverlay creates MapboxOverlay via useControl | unit | `npx vitest run src/__tests__/DeckGLOverlay.test.tsx` | No -- Wave 0 |
| MAP-01c | Map store initializes with correct defaults | unit | `npx vitest run src/__tests__/mapStore.test.ts` | No -- Wave 0 |
| MAP-01d | Style customization hides road labels | unit | `npx vitest run src/__tests__/BaseMap.test.tsx -t "road labels"` | No -- Wave 0 |
| MAP-01e | Coordinate readout displays formatted coordinates | unit | `npx vitest run src/__tests__/CoordinateReadout.test.tsx` | No -- Wave 0 |
| MAP-01f | Loading screen fades out when map loads | unit | `npx vitest run src/__tests__/MapLoadingScreen.test.tsx` | No -- Wave 0 |
| MAP-01g | 2.5D map renders with terrain, correct zoom/pitch, pan/zoom/rotate works | manual-only | Visual verification in browser | N/A -- MapLibre canvas not testable in jsdom |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/BaseMap.test.tsx` -- covers MAP-01a, MAP-01d (mocks maplibre-gl, tests component renders + style customization calls)
- [ ] `src/__tests__/DeckGLOverlay.test.tsx` -- covers MAP-01b (mocks @deck.gl/mapbox, verifies useControl called)
- [ ] `src/__tests__/mapStore.test.ts` -- covers MAP-01c (Zustand store defaults and actions)
- [ ] `src/__tests__/CoordinateReadout.test.tsx` -- covers MAP-01e (renders lat/lon from store)
- [ ] `src/__tests__/MapLoadingScreen.test.tsx` -- covers MAP-01f (opacity class based on isLoaded prop)
- [ ] Mock setup: `maplibre-gl` and `@deck.gl/mapbox` must be mocked in jsdom (no WebGL)

**Note on testing MapLibre in jsdom:** MapLibre GL JS requires WebGL and a real DOM canvas. Unit tests must mock `maplibre-gl` -- test that React components render correctly, that callbacks are wired, and that style modification functions are called with correct arguments. Visual/interaction testing (MAP-01g) is manual.

## Sources

### Primary (HIGH confidence)
- [deck.gl official docs - Using with MapLibre](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) - Integration patterns, MapboxOverlay usage
- [deck.gl official docs - MapboxOverlay API](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay) - Constructor options, interleaved mode, React useControl example
- [react-maplibre official docs - Map API](https://visgl.github.io/react-maplibre/docs/api-reference/map) - Map props, terrain, maxBounds, callbacks
- [react-maplibre official docs - useControl](https://visgl.github.io/react-maplibre/docs/api-reference/use-control) - Hook signatures, IControl pattern
- [react-maplibre official docs - ScaleControl](https://visgl.github.io/react-maplibre/docs/api-reference/scale-control) - Unit, position, maxWidth props
- [MapLibre GL JS docs - NavigationControlOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/NavigationControlOptions/) - showZoom, showCompass, visualizePitch, visualizeRoll
- [MapLibre GL JS docs - 3D Terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/) - raster-dem source, terrain config, exaggeration
- [CARTO Dark Matter style.json](https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json) - Fetched and analyzed layer IDs

### Secondary (MEDIUM confidence)
- [npm: maplibre-gl v5.20.1](https://www.npmjs.com/package/maplibre-gl) - Version verified via npm view
- [npm: @vis.gl/react-maplibre v8.1.0](https://www.npmjs.com/package/@vis.gl/react-maplibre) - Version verified via npm view
- [npm: deck.gl v9.2.11](https://www.npmjs.com/package/deck.gl) - Version verified via npm view
- [deck.gl GitHub Issue #9211](https://github.com/visgl/deck.gl/issues/9211) - TypeScript IControl fix confirmed in PR #9279, resolved in v9.0.37+
- [MapLibre Demo Terrain Tiles](https://demotiles.maplibre.org/terrain-tiles/) - ALOS World 3D data, free DEM tiles

### Tertiary (LOW confidence)
- Hillshade + terrain visual interaction: Based on MapLibre documentation descriptions, not hands-on testing. May need visual tuning.
- CARTO layer ID stability: Layer IDs extracted from current style.json. No guarantee of forward stability.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified on npm, official docs cross-referenced, TypeScript compatibility confirmed
- Architecture: HIGH - Integration patterns from official deck.gl and react-maplibre documentation, verified against latest versions
- Pitfalls: HIGH - TypeScript issue verified fixed, layer IDs extracted from live style.json, common react-maplibre issues documented
- Terrain: MEDIUM - DEM source and terrain prop documented officially, but visual tuning (exaggeration value, hillshade interaction) needs hands-on testing
- CARTO style customization: MEDIUM - Layer IDs confirmed from fetched style.json, but customization approach (imperative in onLoad) is standard practice, not explicitly documented for this specific style

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (30 days -- stable ecosystem, all major versions recently released)
