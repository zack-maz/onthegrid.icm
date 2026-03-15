# Phase 5: Entity Rendering - Research

**Researched:** 2026-03-15
**Domain:** Deck.gl layer rendering, icon-based map markers, animation
**Confidence:** HIGH

## Summary

Phase 5 renders four entity types (flights, ships, missiles, drones) as visually distinct, type-specific markers on the 2.5D map using Deck.gl's IconLayer. The project already has `@deck.gl/layers@9.2.11` installed with `IconLayer` available, a `DeckGLOverlay` component wired into `BaseMap.tsx` with an empty `layers={[]}` array, and a fully functional flight data pipeline delivering `FlightEntity[]` to a Zustand store. The rendering work is primarily frontend: create SVG icon assets, build Deck.gl IconLayer instances with the correct accessors, wire store data into layers, and implement a pulse animation for unidentified flights.

The recommended approach is **IconLayer with a programmatically-generated canvas-based icon atlas** (pre-packed). There are only 4 icon shapes needed (chevron, diamond, starburst, X-mark), and pre-packed atlas is significantly more performant than auto-packing for the 200-500 simultaneous marker target. Icons use `mask: true` in the icon mapping so that `getColor` controls the tint color per-entity, enabling the full color scheme (green/yellow/blue/red) without separate icon variants. The `getAngle` accessor handles heading rotation for flights and ships.

**Primary recommendation:** Use a single IconLayer with pre-packed canvas atlas (4 icons with mask: true), one layer per entity type for independent update triggers and future toggle support, and requestAnimationFrame-driven opacity oscillation for the unidentified flight pulse.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Flights**: Directional chevron/arrow -- filled triangle pointing in heading direction, ~12-16px
- **Ships**: Diamond shape -- rotated square, naval chart convention, ~10-14px
- **Drones**: Starburst/asterisk -- active threat indicator, static (no rotation), ~12-16px
- **Missiles**: X mark -- strike/impact marker, static (no rotation), ~12-16px
- **Flights (regular)**: Green (#22c55e)
- **Flights (unidentified)**: Yellow (#eab308)
- **Ships**: Blue (#3b82f6)
- **Drones**: Red (#ef4444)
- **Missiles**: Red (#ef4444)
- Flight chevrons rotate to show actual heading direction (getAngle from FlightEntity.data.heading)
- Ship diamonds rotate to show course heading (getAngle from ShipEntity.data.courseOverGround)
- Conflict events (missiles/drones) are static -- no rotation
- Fixed pixel size regardless of zoom level (sizeUnits: 'pixels')
- No trails or position history
- Flight marker opacity varies by altitude (0.6-1.0 range)
- Unidentified flights get soft glow pulse animation: opacity oscillates 0.7-1.0 over ~2 second cycle
- Pulse animation defaults to ON in Phase 5
- Pulse toggle deferred to Phase 7

### Claude's Discretion
- Exact SVG icon assets or Deck.gl layer type choice (IconLayer vs ScatterplotLayer vs custom)
- Altitude-to-opacity mapping curve (linear, logarithmic, banded)
- Pulse animation implementation (requestAnimationFrame, Deck.gl transitions, CSS)
- Layer ordering and z-index within DeckGLOverlay
- Null heading handling (when heading data is missing)
- Performance optimization for 200-500 simultaneous flight markers

### Deferred Ideas (OUT OF SCOPE)
- Pulse toggle UI -- Phase 7 (layer controls)
- Position trails / trajectory rendering -- future phase
- Country-based coloring -- Phase 9
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-02 | Entity markers with type-specific icons (ships, flights, missiles, drones) | IconLayer with pre-packed atlas provides per-type shapes via iconMapping, per-entity color via mask+getColor, rotation via getAngle, and opacity via getColor alpha channel |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @deck.gl/layers | 9.2.11 | IconLayer for rendering markers | Already installed, GPU-accelerated, handles 1000s of instances |
| @deck.gl/core | 9.2.11 | Layer base class, types | Already installed, provides Accessor/Position/Color types |
| @deck.gl/mapbox | 9.2.11 | MapboxOverlay integration | Already wired via DeckGLOverlay component |
| zustand | 5.0.11 | Flight data store, UI state | Already in use, selector pattern for minimal re-renders |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @deck.gl/react | 9.2.11 | Not needed | DeckGLOverlay uses MapboxOverlay directly, not DeckGL component |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IconLayer (pre-packed) | IconLayer (auto-packing) | Auto-packing is simpler to set up but slower -- re-packs atlas on data changes. With only 4 icons, pre-packed is trivial and faster |
| IconLayer | ScatterplotLayer | ScatterplotLayer only renders circles -- no custom shapes (chevron, diamond, starburst, X). Would require 4 separate layers with different custom shaders |
| Canvas-generated atlas | Static PNG sprite sheet | Canvas generation keeps icons in code (versionable, adjustable), avoids binary asset management. 4 simple geometric shapes are easy to draw programmatically |

**Installation:**
```bash
# No new dependencies needed -- all packages already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    map/
      BaseMap.tsx              # Modified: passes entity layers to DeckGLOverlay
      DeckGLOverlay.tsx        # Unchanged
      layers/
        createEntityLayers.ts  # Main export: builds all entity layers from store data
        icons.ts               # Icon atlas generation + mapping constants
        constants.ts           # Entity colors, sizes, opacity ranges
  hooks/
    useEntityLayers.ts         # Hook: reads stores, returns Deck.gl Layer[], manages pulse animation
  stores/
    flightStore.ts             # Unchanged (data source)
    uiStore.ts                 # Modified: add pulseEnabled boolean
```

### Pattern 1: Hook-Driven Layer Construction
**What:** A custom React hook (`useEntityLayers`) reads entity data from Zustand stores, manages the pulse animation timer, and returns an array of Deck.gl Layer instances. BaseMap passes these layers to DeckGLOverlay.
**When to use:** Always -- this is the integration pattern between React state and Deck.gl's imperative layer system.
**Example:**
```typescript
// Source: Deck.gl MapboxOverlay pattern + project's existing DeckGLOverlay
import { useMemo, useState, useEffect, useRef } from 'react';
import { IconLayer } from '@deck.gl/layers';
import { useFlightStore } from '@/stores/flightStore';
import { ICON_ATLAS, ICON_MAPPING } from './layers/icons';
import { ENTITY_COLORS, ICON_SIZE } from './layers/constants';
import type { FlightEntity } from '@/types/entities';

export function useEntityLayers() {
  const flights = useFlightStore(s => s.flights);
  const [pulseOpacity, setPulseOpacity] = useState(1.0);

  // Pulse animation loop
  useEffect(() => {
    let animationId: number;
    const animate = () => {
      const t = (Date.now() % 2000) / 2000;  // 0-1 over 2 seconds
      const opacity = 0.7 + 0.3 * Math.sin(t * Math.PI * 2); // 0.7-1.0
      setPulseOpacity(opacity);
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const flightLayer = useMemo(() => new IconLayer<FlightEntity>({
    id: 'flights',
    data: flights,
    iconAtlas: ICON_ATLAS,
    iconMapping: ICON_MAPPING,
    getIcon: () => 'chevron',
    getPosition: (d) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight,
    sizeUnits: 'pixels',
    getAngle: (d) => -(d.data.heading ?? 0), // Negate: deck.gl rotates CCW, heading is CW
    getColor: (d) => {
      const [r, g, b] = d.data.unidentified
        ? ENTITY_COLORS.flightUnidentified
        : ENTITY_COLORS.flight;
      const alpha = d.data.unidentified
        ? pulseOpacity * 255
        : altitudeToOpacity(d.data.altitude) * 255;
      return [r, g, b, alpha];
    },
    billboard: false, // Rotate with map
    updateTriggers: {
      getColor: [pulseOpacity],
    },
  }), [flights, pulseOpacity]);

  return [flightLayer];
}
```

### Pattern 2: Pre-Packed Canvas Atlas with Mask
**What:** Generate a small canvas containing all 4 icon shapes as white silhouettes. Define an `iconMapping` object that marks each icon with `mask: true`. This lets `getColor` tint each marker independently.
**When to use:** When you have a fixed set of icon shapes and need per-instance coloring.
**Example:**
```typescript
// Source: Deck.gl IconLayer docs - iconAtlas + iconMapping with mask
const ICON_SIZE = 32; // px per icon cell
const ATLAS_WIDTH = ICON_SIZE * 4; // 4 icons side by side
const ATLAS_HEIGHT = ICON_SIZE;

function generateIconAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Icon 0: Chevron (flight) -- filled triangle pointing up
  ctx.fillStyle = 'white';
  ctx.beginPath();
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  ctx.moveTo(cx, 4);          // top point
  ctx.lineTo(cx + 8, cy + 8); // bottom right
  ctx.lineTo(cx, cy + 2);     // inner notch
  ctx.lineTo(cx - 8, cy + 8); // bottom left
  ctx.closePath();
  ctx.fill();

  // Icon 1: Diamond (ship) -- at offset ICON_SIZE
  // Icon 2: Starburst (drone) -- at offset ICON_SIZE * 2
  // Icon 3: X mark (missile) -- at offset ICON_SIZE * 3
  // ... similar drawing code

  return canvas;
}

const ICON_MAPPING = {
  chevron:   { x: 0,              y: 0, width: ICON_SIZE, height: ICON_SIZE, mask: true },
  diamond:   { x: ICON_SIZE,      y: 0, width: ICON_SIZE, height: ICON_SIZE, mask: true },
  starburst: { x: ICON_SIZE * 2,  y: 0, width: ICON_SIZE, height: ICON_SIZE, mask: true },
  xmark:     { x: ICON_SIZE * 3,  y: 0, width: ICON_SIZE, height: ICON_SIZE, mask: true },
};
```

### Pattern 3: Separate Layers Per Entity Type
**What:** Create one IconLayer per entity type (flights, ships, drones, missiles) rather than a single combined layer. All share the same atlas.
**When to use:** When entity types have different update frequencies, different data sources, or need independent visibility toggles (Phase 7).
**Why:**
- Flights update every 5s; ships every 30-60s; events rarely. Separate layers avoid re-processing all entities when only flights change.
- Phase 7 adds layer toggles -- separate layers make visibility trivial (`visible: showFlights`).
- Each layer has its own `updateTriggers` -- pulse animation only triggers flight layer re-render.

### Anti-Patterns to Avoid
- **Single mega-layer for all types:** Mixing entity types in one layer means every poll cycle forces re-computation of ALL entity accessors, even if only flights changed.
- **Auto-packing with data URIs:** With only 4 fixed icons, auto-packing adds unnecessary overhead (icon diffing, canvas re-packing) on every data update.
- **CSS animations on Deck.gl layers:** Deck.gl renders to WebGL canvas -- CSS transforms/animations cannot affect individual markers.
- **setInterval for pulse:** Creates timing drift and doesn't sync with frame rendering. requestAnimationFrame is correct.
- **Storing layer instances in Zustand:** Deck.gl layers are meant to be recreated each render. Store data, not layers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon rendering on map | Custom WebGL markers | Deck.gl IconLayer | GPU-instanced rendering, handles 10K+ markers, built-in picking |
| Icon atlas texture | Manual WebGL texture management | IconLayer's iconAtlas prop (accepts Canvas/Image) | Handles texture upload, mipmap generation, sampling |
| Position projection | lng/lat to pixel conversion | IconLayer's getPosition accessor | Deck.gl handles all map projection math with viewport |
| Rotation math | Manual heading-to-CSS-transform | IconLayer's getAngle accessor | GPU-accelerated rotation per instance |
| Hover/click detection | Distance-based picking | Deck.gl's built-in picking (future Phase 8) | Pixel-perfect GPU picking |

**Key insight:** Deck.gl's IconLayer handles the entire rendering pipeline (projection, rotation, coloring, GPU instancing) -- the implementation work is about data transformation and accessor functions, not rendering code.

## Common Pitfalls

### Pitfall 1: getAngle Rotation Direction
**What goes wrong:** Flight chevrons point the wrong direction -- 180 degrees off or mirrored.
**Why it happens:** Deck.gl's `getAngle` rotates counter-clockwise (mathematical convention), but aviation heading is clockwise from north. Additionally, the default icon orientation may not align with "pointing up = 0 degrees."
**How to avoid:** Negate the heading value: `getAngle: (d) => -(d.data.heading ?? 0)`. Test with known heading values (0 = north = up, 90 = east = right).
**Warning signs:** All markers point the same seemingly wrong direction; markers point opposite to their travel direction.

### Pitfall 2: Atlas Canvas Not Available in SSR/Tests
**What goes wrong:** `document.createElement('canvas')` fails in Node/jsdom test environment.
**Why it happens:** Canvas atlas generation requires DOM/Canvas API, which jsdom provides as a stub.
**How to avoid:** Lazy-initialize the atlas (generate on first render, not module load). In tests, mock the layer module or provide a test-only atlas. The existing mock for `@deck.gl/mapbox` already stubs out the overlay -- entity layer tests should test the data transformation functions (color mapping, angle calculation, opacity), not the Deck.gl rendering.
**Warning signs:** Tests fail with "canvas not supported" or "getContext is not a function."

### Pitfall 3: updateTriggers Missing for Dynamic Accessors
**What goes wrong:** Colors don't update when pulse opacity changes; markers appear frozen.
**Why it happens:** Deck.gl caches accessor results for performance. If an accessor's output depends on external state (like `pulseOpacity`), Deck.gl won't know to recalculate unless `updateTriggers` is set.
**How to avoid:** Always set `updateTriggers: { getColor: [pulseOpacity] }` when the color accessor depends on animation state.
**Warning signs:** Initial render looks correct but subsequent updates don't reflect changes.

### Pitfall 4: Opacity via Alpha Channel, Not Layer opacity
**What goes wrong:** Setting `opacity` prop dims the entire layer uniformly, losing per-entity altitude variation.
**Why it happens:** The `opacity` prop is a layer-wide uniform. Per-entity opacity requires the alpha channel of `getColor`.
**How to avoid:** Always use `getColor: (d) => [r, g, b, alpha]` with alpha as 0-255 integer. Do NOT use the layer `opacity` prop for per-entity effects.
**Warning signs:** All flights appear at the same opacity regardless of altitude.

### Pitfall 5: Pulse Animation Causes Excessive Re-Renders
**What goes wrong:** requestAnimationFrame fires 60fps, causing the entire component tree to re-render.
**Why it happens:** `useState` for pulseOpacity triggers React re-renders. If not isolated, this cascades.
**How to avoid:** Two options: (a) Use `useRef` for the opacity value and only trigger layer recreation via a coarser timer (e.g., 15fps is sufficient for a 2-second pulse), or (b) isolate the pulse state in a dedicated hook/store so only the layer-building code re-renders. Zustand's `useFlightStore` selectors already prevent cascade -- apply the same pattern to pulse state.
**Warning signs:** React DevTools shows 60fps re-renders; map interaction feels laggy.

### Pitfall 6: Null Heading Values
**What goes wrong:** Markers with null heading render at angle 0 (pointing north) instead of a sensible default.
**Why it happens:** Some flights have `heading: null` in the API data (ground stations with no velocity vector).
**How to avoid:** Use nullish coalescing: `d.data.heading ?? 0`. Heading 0 = north is the safest default for a directional chevron.
**Warning signs:** Clusters of markers all pointing north near airports.

## Code Examples

Verified patterns from official sources and project codebase:

### Entity Color Constants
```typescript
// Hex values from CONTEXT.md decisions, converted to RGB tuples for Deck.gl
export const ENTITY_COLORS = {
  flight:              [34, 197, 94] as const,   // #22c55e green
  flightUnidentified:  [234, 179, 8] as const,   // #eab308 yellow
  ship:                [59, 130, 246] as const,   // #3b82f6 blue
  drone:               [239, 68, 68] as const,    // #ef4444 red
  missile:             [239, 68, 68] as const,    // #ef4444 red
} as const;

export const ICON_SIZE = {
  flight: 14,   // ~12-16px per CONTEXT.md
  ship: 12,     // ~10-14px
  drone: 14,    // ~12-16px
  missile: 14,  // ~12-16px
} as const;
```

### Altitude-to-Opacity Mapping (Linear)
```typescript
// Source: CONTEXT.md specifies 0.6-1.0 range
// Linear mapping: 0m = 0.6, 13000m (typical cruise) = 1.0
const ALT_MIN_OPACITY = 0.6;
const ALT_MAX_OPACITY = 1.0;
const ALT_CEILING = 13000; // meters, typical cruise altitude

export function altitudeToOpacity(altitude: number | null): number {
  if (altitude === null || altitude <= 0) return ALT_MIN_OPACITY;
  const clamped = Math.min(altitude, ALT_CEILING);
  return ALT_MIN_OPACITY + (ALT_MAX_OPACITY - ALT_MIN_OPACITY) * (clamped / ALT_CEILING);
}
```

### Wiring Layers into BaseMap
```typescript
// Source: Existing BaseMap.tsx pattern + DeckGLOverlay component
// BaseMap.tsx modification
import { useEntityLayers } from '@/hooks/useEntityLayers';

export function BaseMap() {
  // ... existing code ...
  const entityLayers = useEntityLayers();

  return (
    // ... existing JSX ...
    <DeckGLOverlay layers={entityLayers} />
    // ...
  );
}
```

### Layer Ordering Convention
```typescript
// Deck.gl renders layers in array order (first = bottom, last = top)
// Ordering rationale: conflict events on top (rarest, most important),
// then flights (most numerous), ships at bottom
return [
  shipLayer,     // Bottom: blue diamonds
  flightLayer,   // Middle: green/yellow chevrons
  droneLayer,    // Top: red starbursts
  missileLayer,  // Top: red X marks
].filter(Boolean); // Filter out null layers when no data
```

### Adding pulseEnabled to uiStore
```typescript
// Source: Existing uiStore.ts pattern (Zustand curried create pattern)
// Add to UIState interface in src/types/ui.ts:
pulseEnabled: boolean;
togglePulse: () => void;

// Add to uiStore.ts create():
pulseEnabled: true, // ON by default per CONTEXT.md
togglePulse: () => set((s) => ({ pulseEnabled: !s.pulseEnabled })),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| deck.gl 8.x IconLayer | deck.gl 9.x IconLayer | 2024 (v9 release) | API stable; v9 uses luma.gl v9 internally, no breaking changes for IconLayer props |
| HTML/CSS markers on map | GPU-instanced Deck.gl layers | N/A (project uses Deck.gl from start) | 100x performance for 500+ markers |
| Image file atlas (PNG) | Canvas-generated atlas | N/A | Keeps assets in code, no binary files in repo |

**Deprecated/outdated:**
- `getColor` prop on ScatterplotLayer is deprecated -- use `getFillColor` and `getLineColor` instead (only relevant if ScatterplotLayer were used, which it should not be for this phase)

## Open Questions

1. **Canvas 2D availability in test environment**
   - What we know: jsdom's canvas support is limited; the `canvas` npm package adds full Canvas API but is a native dependency
   - What's unclear: Whether the existing jsdom setup handles `document.createElement('canvas').getContext('2d')` for atlas generation
   - Recommendation: Test atlas generation separately; if jsdom canvas fails, lazy-load atlas and mock in tests. The entity layer tests should focus on data transformation (color/opacity/angle calculations), not canvas rendering.

2. **Exact chevron/starburst/X geometry**
   - What we know: Shapes are decided (chevron, diamond, starburst, X), approximate pixel sizes given
   - What's unclear: Exact canvas draw coordinates for a "tactical/HUD" aesthetic
   - Recommendation: Start with simple geometric versions, iterate visually. The icon atlas can be regenerated without changing any layer code.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 with jsdom |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run src/__tests__/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-02a | Flight entities render with correct color (green for regular, yellow for unidentified) | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02b | Different entity types produce distinct icon names | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02c | Heading rotation: getAngle returns negated heading | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02d | Altitude-to-opacity: maps altitude range to 0.6-1.0 | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02e | Null heading defaults to 0 | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02f | Pulse opacity oscillates between 0.7-1.0 | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02g | Icon mapping contains all 4 entity types with mask: true | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02h | Layer IDs are unique per entity type | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |
| MAP-02i | Color constants match CONTEXT.md hex values | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/entityLayers.test.ts -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/entityLayers.test.ts` -- covers MAP-02a through MAP-02i
- [ ] Test mock for `@deck.gl/layers` (IconLayer constructor capture) -- verify layer props without WebGL
- [ ] Consider adding `@deck.gl/layers` to vite.config.ts test.alias if IconLayer import causes jsdom issues

## Sources

### Primary (HIGH confidence)
- `@deck.gl/layers@9.2.11` source code (`node_modules/@deck.gl/layers/src/icon-layer/`) -- IconLayer API, getAngle, mask, getColor, sizeUnits
- `@deck.gl/layers@9.2.11` source code (`node_modules/@deck.gl/layers/src/scatterplot-layer/`) -- confirmed circles only, no custom shapes
- Project source: `src/components/map/DeckGLOverlay.tsx` -- existing integration pattern
- Project source: `server/types.ts` -- FlightEntity.data.heading, .altitude, .unidentified fields
- Project source: `src/stores/flightStore.ts` -- Zustand store pattern, selector usage

### Secondary (MEDIUM confidence)
- [Deck.gl IconLayer docs](https://deck.gl/docs/api-reference/layers/icon-layer) -- mask behavior, auto-packing vs pre-packed, iconMapping schema
- [Deck.gl Animations docs](https://deck.gl/docs/developer-guide/animations-and-transitions) -- transitions prop, requestAnimationFrame pattern
- [Deck.gl GitHub Discussion #7449](https://github.com/visgl/deck.gl/discussions/7449) -- iconAtlas vs auto-packing performance comparison

### Tertiary (LOW confidence)
- [CodePen SVG icon layer example](https://codepen.io/AdriSolid/pen/KKqWNMr) -- SVG data URI approach (works but less performant than canvas atlas for our use case)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages already installed and verified in source code
- Architecture: HIGH - follows existing project patterns (DeckGLOverlay, Zustand selectors, hooks)
- Pitfalls: HIGH - verified against Deck.gl source code (getAngle direction, updateTriggers mechanism, mask behavior)
- Icon atlas approach: MEDIUM - canvas generation is standard but exact icon geometry will need visual iteration
- Pulse animation: MEDIUM - requestAnimationFrame is the correct approach per Deck.gl docs, but performance impact of setState at high frequency needs care

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- deck.gl 9.x API is mature)
