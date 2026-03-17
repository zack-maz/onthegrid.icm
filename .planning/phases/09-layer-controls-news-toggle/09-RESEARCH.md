# Phase 9: Layer Controls & News Toggle - Research

**Researched:** 2026-03-17
**Domain:** UI layer toggle controls, Deck.gl tooltip/picking, Zustand state persistence
**Confidence:** HIGH

## Summary

Phase 9 implements a layer visibility control panel and a news content tooltip system for conflict event markers. The work is entirely frontend -- no new API endpoints, no server changes (aside from passing through two additional GDELT metadata fields). The layer controls extend the existing `useUIStore` with six visibility booleans and a news toggle, persisted to localStorage. The tooltip leverages Deck.gl's built-in `getTooltip` callback on `MapboxOverlay`, which requires making the drone/missile `IconLayer` instances `pickable: true` and passing a `getTooltip` function through the `DeckGLOverlay` component.

The existing codebase already has the scaffolding for this: `LayerTogglesSlot` is a stub positioned in AppShell, `OverlayPanel` is the reusable dark container, `useEntityLayers` already filters ground traffic via `showGroundTraffic`, and `ENTITY_COLORS` provides the exact color values for toggle row dots. The localStorage persistence pattern from `flightStore.ts` (`loadPersistedSource`/`persistSource` with try/catch guards) is the established pattern to follow.

**Primary recommendation:** Extend `UIState` with 5 new visibility booleans + 1 news boolean, filter layers in `useEntityLayers` based on toggle state, pass `getTooltip` through `DeckGLOverlay` to `MapboxOverlay`, and build the toggle panel as labeled rows with opacity dimming inside the existing `LayerTogglesSlot` stub.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 6 independent toggles total: Flights, Ships, Drones, Missiles, Ground Traffic, Pulse
- All toggles are fully independent -- no parent/child gating
- Ground Traffic and Pulse are visually nested (indented) under Flights for grouping, but behave independently
- No "Events group" toggle -- drones and missiles are toggled individually
- News toggle is a separate control in the Layers panel
- Labeled rows with colored entity dots inside an OverlayPanel, matching StatusPanel HUD aesthetic
- Each row: colored dot (entity color from constants) + text label. Full row is clickable
- On/off state indicated by opacity: full brightness when on, ~40% opacity when off
- No checkbox widgets, no toggle switches -- dimming IS the state
- Sub-toggles (Ground, Pulse) visually indented under Flights with smaller text
- No entity counts in the Layers panel
- Panel starts expanded on page load, always visible (no collapse)
- "Layers" header at top (already stubbed in LayerTogglesSlot)
- Non-statistical news = GDELT event metadata shown as tooltips on event markers
- Tooltip appears on hover over drone/missile markers when news toggle is ON
- Tooltip shows: event type, actor names, location name, date, CAMEO code, Goldstein scale, source article URL
- News toggle defaults to OFF
- When OFF: event markers visible but no hover tooltips
- All toggle states persist via localStorage as single object (key: 'layerToggles')
- Same try/catch guard pattern as existing flight source persistence
- On load: read stored object, merge with defaults for any missing keys

### Claude's Discretion
- Default strategy for new toggle keys not yet in localStorage (sensible default approach)
- Exact tooltip component implementation (Deck.gl pickingInfo vs custom overlay)
- Which GDELT metadata fields are available in the normalized ConflictEventEntity (may need to pass through additional fields from adapter)
- Exact opacity values for dimmed state (~40% suggested, final tuning flexible)
- Keyboard accessibility for toggle rows

### Deferred Ideas (OUT OF SCOPE)
- Conflict event filtering by type (missiles vs drones) beyond simple show/hide -- Phase 11
- Collapsible/expandable Layers panel
- Entity count badges in toggle rows
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRL-01 | Layer toggles to show/hide each entity type (ships, flights, missiles, drones) | useEntityLayers conditional filtering + UIState toggle booleans (see Architecture Patterns) |
| CTRL-04 | Non-statistical news hidden by default with toggle to reveal | Deck.gl getTooltip on MapboxOverlay + showNews boolean + GDELT metadata passthrough (see Tooltip Pattern) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.x | Toggle state management | Already in use, curried `create<T>()()` pattern established |
| Deck.gl | 9.x | Tooltip via `getTooltip` on `MapboxOverlay` | Built-in picking/tooltip system, no extra dependency |
| React | 19.x | Toggle panel component | Already in use |
| Tailwind CSS | 4.x | Toggle row styling with opacity classes | Already in use, CSS-first `@theme` config |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| localStorage API | Browser | Toggle persistence | On toggle change (write) and app init (read) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deck.gl `getTooltip` | Custom React overlay with `onHover` | More control over styling, but requires manual positioning; `getTooltip` is simpler and sufficient for this use case |
| Opacity dimming | CSS checkbox/toggle switch | User decision: dimming IS the state indicator -- matches HUD aesthetic |

**Installation:** No new dependencies required. All libraries already in project.

## Architecture Patterns

### Modified Files Overview
```
src/
├── types/ui.ts                          # Extend UIState with toggle fields
├── stores/uiStore.ts                    # Add toggle state + localStorage persistence
├── hooks/useEntityLayers.ts             # Filter layers by visibility + add pickable/getTooltip
├── components/map/DeckGLOverlay.tsx      # Pass getTooltip prop through to MapboxOverlay
├── components/layout/LayerTogglesSlot.tsx # Replace stub with full toggle panel
├── components/map/layers/constants.ts   # Add ENTITY_DOT_COLORS for CSS hex values
server/
├── adapters/gdelt.ts                    # Add Actor1Name, Actor2Name, GoldsteinScale columns
├── types.ts                             # Extend ConflictEventEntity.data with goldsteinScale
```

### Pattern 1: UIState Extension with localStorage Persistence
**What:** Add 6 visibility booleans (`showFlights`, `showShips`, `showDrones`, `showMissiles`, `showGroundTraffic` [existing], `pulseEnabled` [existing]) and 1 news boolean (`showNews`) to UIState. Persist all layer toggles to localStorage as a single JSON object.
**When to use:** App initialization and every toggle action.
**Example:**
```typescript
// src/types/ui.ts -- new toggle fields
export interface LayerToggles {
  showFlights: boolean;
  showShips: boolean;
  showDrones: boolean;
  showMissiles: boolean;
  showGroundTraffic: boolean; // already exists, move into persistence
  pulseEnabled: boolean;      // already exists, move into persistence
  showNews: boolean;
}

// Defaults: all entity types ON, news OFF
const LAYER_TOGGLE_DEFAULTS: LayerToggles = {
  showFlights: true,
  showShips: true,
  showDrones: true,
  showMissiles: true,
  showGroundTraffic: false,
  pulseEnabled: true,
  showNews: false,
};
```

**localStorage strategy:** Load stored object, spread defaults underneath to handle new keys gracefully:
```typescript
const STORAGE_KEY = 'layerToggles';

function loadPersistedToggles(): LayerToggles {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...LAYER_TOGGLE_DEFAULTS, ...JSON.parse(stored) };
    }
  } catch { /* localStorage unavailable */ }
  return { ...LAYER_TOGGLE_DEFAULTS };
}

function persistToggles(toggles: LayerToggles): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles)); } catch { /* silently fail */ }
}
```

This `{ ...defaults, ...stored }` merge pattern naturally handles new toggle keys not yet in localStorage -- they get the default value. This is the recommended approach for Claude's discretion on "default strategy for new keys."

### Pattern 2: Layer Filtering in useEntityLayers
**What:** Conditionally exclude layers from the returned array based on toggle state. Do NOT conditionally create/destroy layers -- always create them but return `null` or omit from array.
**When to use:** In `useEntityLayers` return statement.
**Example:**
```typescript
// In useEntityLayers:
const showFlights = useUIStore((s) => s.showFlights);
const showShips = useUIStore((s) => s.showShips);
const showDrones = useUIStore((s) => s.showDrones);
const showMissiles = useUIStore((s) => s.showMissiles);

// Filter: only include visible layers
const layers = [
  showShips ? shipLayer : null,
  showFlights ? flightLayer : null,
  showDrones ? droneLayer : null,
  showMissiles ? missileLayer : null,
].filter(Boolean);

return layers;
```

This follows the existing `showGroundTraffic` pattern -- client-side filtering, not server-side.

### Pattern 3: Deck.gl getTooltip via MapboxOverlay
**What:** Pass `getTooltip` callback through `DeckGLOverlay` to `MapboxOverlay`. Make drone/missile layers `pickable: true`. The tooltip renders HTML content when hovering over event markers AND `showNews` is true.
**When to use:** When news toggle is ON and user hovers over a conflict event marker.

**Key insight:** `MapboxOverlay` accepts all `Deck` props (except a few listed exceptions). `getTooltip` is a `Deck` prop, so it works directly.

**Example:**
```typescript
// DeckGLOverlay.tsx -- accept and pass getTooltip
import type { MapboxOverlayProps } from '@deck.gl/mapbox';

interface DeckGLOverlayProps extends MapboxOverlayProps {
  getTooltip?: MapboxOverlayProps['getTooltip'];
}

export function DeckGLOverlay(props: DeckGLOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}
```

```typescript
// In BaseMap.tsx -- pass getTooltip
const showNews = useUIStore((s) => s.showNews);

const getTooltip = useCallback((info: PickingInfo) => {
  if (!showNews || !info.object) return null;
  const entity = info.object as ConflictEventEntity;
  if (entity.type !== 'drone' && entity.type !== 'missile') return null;
  return {
    html: `<div>...</div>`,
    style: { /* dark theme styles */ }
  };
}, [showNews]);

// ...
<DeckGLOverlay layers={entityLayers} getTooltip={getTooltip} />
```

### Pattern 4: Toggle Row Component
**What:** Reusable row component for the Layers panel with colored dot, label, click handler, and opacity dimming.
**When to use:** Each toggle in the panel.
**Example:**
```typescript
function ToggleRow({
  color,
  label,
  active,
  onToggle,
  indent = false,
}: {
  color: string; // CSS hex color
  label: string;
  active: boolean;
  onToggle: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-2 text-xs transition-opacity
        ${active ? 'opacity-100' : 'opacity-40'}
        ${indent ? 'pl-4 text-[10px]' : ''}`}
      role="switch"
      aria-checked={active}
      aria-label={`Toggle ${label} visibility`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-text-secondary">{label}</span>
    </button>
  );
}
```

**Keyboard accessibility:** Using `<button>` with `role="switch"` and `aria-checked` gives keyboard focus, Enter/Space activation, and screen reader support for free. This is the recommended approach for Claude's discretion on keyboard accessibility.

### Anti-Patterns to Avoid
- **Don't gate sub-toggles on parent toggle:** User explicitly decided Ground Traffic ON with Flights OFF should show ground aircraft. All toggles are independent.
- **Don't conditionally create/destroy layers:** Always create all layers, then filter the returned array. Conditional layer creation causes unnecessary re-instantiation.
- **Don't use separate localStorage keys per toggle:** Single object makes reads/writes atomic and simpler.
- **Don't add a custom tooltip div with manual positioning:** Use Deck.gl's built-in `getTooltip` which handles positioning, show/hide, and DOM management automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip positioning | Manual absolute-positioned div tracking mouse | Deck.gl `getTooltip` | Handles viewport edge clamping, z-index, show/hide lifecycle |
| Toggle state sync | Custom pub/sub or context | Zustand store with selectors | Already established pattern, minimizes re-renders |
| Persistence merge | Manual key-by-key comparison | `{ ...defaults, ...JSON.parse(stored) }` spread | Automatically handles new keys, single expression |

**Key insight:** Deck.gl's `getTooltip` on `MapboxOverlay` is the zero-dependency solution. It renders a styled tooltip div that follows the cursor, appears/disappears based on picking, and accepts custom HTML+CSS. No React portal, no manual positioning.

## Common Pitfalls

### Pitfall 1: MapboxOverlay getTooltip Not Working
**What goes wrong:** `getTooltip` callback is passed but tooltip never appears.
**Why it happens:** Layers must have `pickable: true` for the picking engine to detect objects under the cursor. By default, `pickable` is `false`.
**How to avoid:** Add `pickable: true` to drone and missile `IconLayer` constructors in `useEntityLayers`.
**Warning signs:** Hover events fire but `info.object` is always `undefined`.

### Pitfall 2: Stale showNews in getTooltip Closure
**What goes wrong:** Toggling news off doesn't immediately hide tooltips because `showNews` is captured in a stale closure.
**Why it happens:** `getTooltip` callback is memoized with `useCallback` but `showNews` isn't in the dependency array, or `MapboxOverlay.setProps` isn't called when it changes.
**How to avoid:** Include `showNews` in the `useCallback` dependency array AND ensure it flows through `DeckGLOverlay`'s `setProps`. The current `DeckGLOverlay` pattern already calls `overlay.setProps(props)` on every render, which handles this.
**Warning signs:** Tooltip persists after toggling news off.

### Pitfall 3: GDELT Metadata Missing from Entity
**What goes wrong:** Tooltip tries to display actor names and Goldstein scale but they are empty/undefined.
**Why it happens:** `normalizeGdeltEvent` in `server/adapters/gdelt.ts` currently sets `actor1: ''` and `actor2: ''` hardcoded. GoldsteinScale is extracted in COL but not passed through to the entity.
**How to avoid:** Add `Actor1Name` (column 6) and `Actor2Name` (column 16) to the COL constant. Pass `GoldsteinScale` (already in COL at index 30), `Actor1Name`, and `Actor2Name` through `normalizeGdeltEvent` into the entity's data fields.
**Warning signs:** Tooltip shows empty actor fields and no Goldstein scale.

### Pitfall 4: Opacity Transition Not Smooth
**What goes wrong:** Toggle state changes cause a jarring snap between full and dimmed opacity.
**Why it happens:** No CSS transition on the toggle row elements.
**How to avoid:** Add `transition-opacity` Tailwind class to toggle rows. The class applies a smooth 150ms transition by default.
**Warning signs:** Visual jump when clicking toggles.

### Pitfall 5: localStorage Deserialization Crash
**What goes wrong:** App crashes on load because corrupted localStorage value can't be parsed.
**Why it happens:** `JSON.parse` throws on malformed strings.
**How to avoid:** Wrap in try/catch (established pattern from `loadPersistedSource`). Return defaults on any error.
**Warning signs:** White screen on app load for users with existing localStorage data.

### Pitfall 6: Flight Layer Visibility vs Ground Traffic/Pulse Independence
**What goes wrong:** Turning off Flights also hides ground traffic and pulse animation, breaking the "fully independent" requirement.
**Why it happens:** Ground traffic and pulse are currently filtered/controlled within the flight layer. If `showFlights` removes the entire flight layer, ground-only aircraft and pulse disappear too.
**How to avoid:** `showFlights` controls airborne flight visibility. `showGroundTraffic` independently controls ground aircraft. The filtering logic must apply both independently. When `showFlights=false` and `showGroundTraffic=true`, show only `onGround` flights. When both are false, show nothing.
**Warning signs:** Ground aircraft disappear when Flights toggle is turned off.

## Code Examples

### GDELT Metadata Passthrough (Server-Side)
```typescript
// server/adapters/gdelt.ts -- add column indices
export const COL = {
  // ... existing
  Actor1Name: 6,
  Actor2Name: 16,
  // GoldsteinScale: 30 already exists
} as const;

// normalizeGdeltEvent -- pass through metadata
return {
  // ... existing fields
  data: {
    eventType: describeEvent(eventRootCode),
    subEventType: `CAMEO ${eventCode}`,
    fatalities: 0,
    actor1: cols[COL.Actor1Name] || '',
    actor2: cols[COL.Actor2Name] || '',
    notes: '',
    source: cols[COL.SOURCEURL] ?? '',
    goldsteinScale: parseFloat(cols[COL.GoldsteinScale]) || 0,
    locationName: cols[COL.ActionGeo_FullName] || '',
    cameoCode: eventCode,
  },
};
```

### ConflictEventEntity Type Extension
```typescript
// server/types.ts -- extend data interface
export interface ConflictEventEntity extends MapEntityBase {
  type: 'missile' | 'drone';
  data: {
    eventType: string;
    subEventType: string;
    fatalities: number;
    actor1: string;
    actor2: string;
    notes: string;
    source: string;
    goldsteinScale: number;    // NEW: GDELT Goldstein conflict scale (-10 to +10)
    locationName: string;      // NEW: ActionGeo_FullName
    cameoCode: string;         // NEW: CAMEO event code (e.g. "190")
  };
}
```

### Tooltip HTML Content
```typescript
// Tooltip getTooltip callback example
function buildEventTooltip(entity: ConflictEventEntity): string {
  const lines = [
    `<strong>${entity.data.eventType}</strong>`,
    entity.data.locationName && `Location: ${entity.data.locationName}`,
    entity.data.actor1 && `Actor 1: ${entity.data.actor1}`,
    entity.data.actor2 && `Actor 2: ${entity.data.actor2}`,
    `Date: ${new Date(entity.timestamp).toISOString().slice(0, 10)}`,
    `CAMEO: ${entity.data.cameoCode}`,
    `Goldstein: ${entity.data.goldsteinScale.toFixed(1)}`,
    entity.data.source && `<a href="${entity.data.source}" target="_blank" rel="noopener">Source</a>`,
  ].filter(Boolean);
  return lines.join('<br/>');
}
```

### Toggle Row Dot Colors (CSS Hex)
```typescript
// Map from ENTITY_COLORS RGB tuples to CSS hex for dot styling
export const ENTITY_DOT_COLORS = {
  flights: '#eab308',
  ships: '#9ca3af',
  drones: '#ef4444',
  missiles: '#ef4444',
  ground: '#eab308',   // same as flights
  pulse: '#ef4444',     // same as unidentified
  news: '#60a5fa',      // blue accent for info/content toggle
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom React tooltip with onHover + state | Deck.gl `getTooltip` on Deck/MapboxOverlay | Deck.gl 8.x+ | No manual positioning, built-in show/hide |
| Individual localStorage keys | Single JSON object with spread merge | Common pattern | Atomic persistence, graceful new-key handling |
| Checkbox/switch widgets | Opacity dimming as state indicator | User decision | Matches dark HUD aesthetic |

**Deprecated/outdated:**
- `onHover` + manual tooltip div: Still works but `getTooltip` is the recommended approach for simple tooltips
- Per-key localStorage: Works but more code, harder to manage defaults

## Open Questions

1. **Tooltip styling in dark theme**
   - What we know: `getTooltip` accepts a `style` object for CSS. The app uses a dark theme with specific colors (`bg-surface-overlay`, `border-border`, etc.)
   - What's unclear: Exact Tailwind theme color values as raw CSS hex for the `style` object (since `getTooltip` uses inline styles, not class names)
   - Recommendation: Use the same dark background/border approach as `OverlayPanel` (`bg-surface-overlay` with `backdrop-blur-sm`). Extract raw color values from the CSS custom properties.

2. **Flight visibility with independent ground/pulse toggles**
   - What we know: User wants Flights/Ground/Pulse fully independent. Currently `showGroundTraffic` filters within the flight layer.
   - What's unclear: Exact filtering logic when Flights=OFF but Ground=ON (show only onGround flights?)
   - Recommendation: When `showFlights=false`, filter OUT airborne flights. When `showGroundTraffic=false`, filter OUT ground flights. Both false = empty flight layer. This preserves independence.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom (frontend), node (server) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-01 | showFlights toggle hides flight layer | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| CTRL-01 | showShips toggle hides ship layer | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| CTRL-01 | showDrones toggle hides drone layer | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| CTRL-01 | showMissiles toggle hides missile layer | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| CTRL-01 | UIState has all 6 toggle booleans + showNews | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |
| CTRL-01 | Toggle actions flip each boolean | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |
| CTRL-01 | localStorage persistence roundtrip | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |
| CTRL-01 | LayerTogglesSlot renders toggle rows | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx -x` | Wave 0 |
| CTRL-04 | showNews=false: no pickable on event layers | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing |
| CTRL-04 | GDELT entity has goldsteinScale/locationName/cameoCode | unit | `npx vitest run server/__tests__/gdelt.test.ts -x` | Extend existing |
| CTRL-04 | News toggle defaults to OFF | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/LayerToggles.test.tsx` -- covers CTRL-01 toggle panel rendering and click behavior
- [ ] Extend `src/__tests__/entityLayers.test.ts` with layer filtering tests
- [ ] Extend `src/__tests__/uiStore.test.ts` with new toggle state tests
- [ ] Extend `server/__tests__/gdelt.test.ts` with metadata passthrough tests (if exists)

## Sources

### Primary (HIGH confidence)
- Deck.gl official docs: [MapboxOverlay](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay) -- accepts all Deck props including getTooltip
- Deck.gl official docs: [Interactivity](https://deck.gl/docs/developer-guide/interactivity) -- PickingInfo object, getTooltip signature, pickable requirement
- Deck.gl official docs: [Deck](https://deck.gl/docs/api-reference/core/deck) -- getTooltip returns null/string/object with html+style
- Deck.gl official docs: [IconLayer](https://deck.gl/docs/api-reference/layers/icon-layer) -- pickable prop, picking behavior
- Existing codebase -- `useEntityLayers.ts`, `uiStore.ts`, `flightStore.ts`, `gdelt.ts`, `types.ts` (direct inspection)

### Secondary (MEDIUM confidence)
- [GDELT 2.0 Events Column Headers](https://github.com/linwoodc3/gdelt2HeaderRows) -- Actor1Name at column 6, Actor2Name at column 16 (verified against existing adapter COL constants which are proven to work)
- [GDELT Event Codebook V2.0](http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf) -- column definitions (TLS cert prevented direct fetch, cross-referenced with header CSV)

### Tertiary (LOW confidence)
- None -- all findings verified with primary sources or existing working code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing dependencies
- Architecture: HIGH -- extends established patterns (Zustand store, useEntityLayers filtering, OverlayPanel styling, localStorage persistence)
- Tooltip pattern: HIGH -- Deck.gl getTooltip is well-documented, MapboxOverlay explicitly inherits all Deck props
- GDELT metadata columns: MEDIUM -- Actor1Name/Actor2Name indices verified via community schema CSV but not directly from GDELT codebook (TLS cert issue); however, existing COL constants prove the column numbering scheme
- Pitfalls: HIGH -- identified from direct code inspection and Deck.gl documentation

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable domain -- no fast-moving dependencies)
