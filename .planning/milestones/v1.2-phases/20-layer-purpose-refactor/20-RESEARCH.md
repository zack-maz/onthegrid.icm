# Phase 20: Layer Purpose Refactor - Research

**Researched:** 2026-03-22
**Domain:** Zustand state refactoring, Deck.gl layer architecture, visualization layer framework
**Confidence:** HIGH

## Summary

Phase 20 is a fundamental refactor that replaces the entity toggle system (18 visibility toggles controlling which entities appear on the map) with a new visualization layer architecture. "Layers" will become different rendering modes (geography, weather, threat heatmap, etc.) rather than entity visibility controls. All entities -- flights, ships, events, sites -- are always visible on the map. Search/filter is the only way to narrow visible data.

The scope of this refactor is well-defined: remove ~18 toggle fields and their ~18 toggle functions from `uiStore`, update ~20 files that reference these toggles, replace the LayerTogglesSlot content with visualization layer toggles, and build the inline legend framework. Individual visualization layers (geographic, weather, threat, etc.) are deferred to sub-phases 20.1-20.5.

**Primary recommendation:** Execute this as a surgical state removal + UI replacement. The `useEntityLayers` hook undergoes the most significant change -- removing all visibility gating so all entities always render. The `useQuerySync` bidirectional sync loses its toggle mapping but retains all filter sync. Counter data, status panel, and proximity alerts all simplify when toggle gating is removed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Entity toggles (showFlights, showShips, showEvents, showSites, all sub-toggles) are removed entirely
- All entities are always rendered on the map -- no visibility controls
- Search/filter system (`type:flight`, etc.) is the only way to narrow visible entities
- Layers are stackable overlays that blend via fixed semi-transparent opacity
- Each layer has a simple on/off toggle -- no opacity sliders
- Layer state resets on page reload (no localStorage persistence)
- Toggling a layer uses ~300ms opacity fade in/out transition
- Replaces the current "Layers" section in the sidebar in-place (same UI slot, new content)
- When a layer is active, a small color scale legend appears on the map (corner position)
- Multiple active layers stack their legends
- Legend disappears when layer is toggled off
- Phase 20 scope: remove entity toggles, build layer toggle system, inline legend framework
- Sub-phases 20.1-20.5 build individual visualization layers (out of scope for Phase 20)

### Claude's Discretion
- Exact legend positioning and stacking layout
- Contour line interval spacing (Phase 20.1)
- Grid resolution for weather temperature sampling (Phase 20.1)
- Transition animation easing curve
- How to handle the removal of entity toggle state from uiStore (cleanup approach)
- Which geographic features qualify as "major" for labels (Phase 20.1)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | existing | State management for layer toggles | Already used throughout; curried `create<T>()()` pattern |
| @deck.gl/layers | existing | Visualization layer rendering | Already used for entity layers |
| react | existing | UI components for toggle rows and legends | Already used throughout |
| tailwindcss v4 | existing | Styling for toggles, legends, transitions | Already used; CSS-first `@theme` config |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vis.gl/react-maplibre | existing | Map source/layer additions for raster overlays | Used in BaseMap.tsx for terrain/hillshade already |

### Alternatives Considered
No new libraries needed for Phase 20. The framework code (toggle store, legend component, transition animations) uses only existing dependencies. New libraries (e.g., Open-Meteo client) come in sub-phases 20.1+.

## Architecture Patterns

### Recommended Project Structure
```
src/
  stores/
    layerStore.ts          # NEW: Visualization layer state (replaces entity toggle portion of uiStore)
    uiStore.ts             # MODIFIED: Remove ~18 entity toggle fields + ~18 toggle functions
  components/
    layout/
      LayerTogglesSlot.tsx  # MODIFIED: New content -- visualization layer toggles
      Sidebar.tsx           # MODIFIED: LayerTogglesContent replaced with new layer content
    map/
      MapLegend.tsx         # NEW: Inline legend framework component
  hooks/
    useEntityLayers.ts      # MODIFIED: Remove toggle-based visibility gating
  types/
    ui.ts                   # MODIFIED: Remove LayerToggles interface, add VisualizationLayer type
```

### Pattern 1: Layer Store (New Zustand Store)
**What:** A new `layerStore` manages visualization layer on/off state. No localStorage persistence (resets on reload per locked decision).
**When to use:** For all visualization layer toggle state.
**Example:**
```typescript
// src/stores/layerStore.ts
import { create } from 'zustand';

export type VisualizationLayerId =
  | 'geographic'
  | 'weather'
  | 'threat'
  | 'political'
  | 'satellite'
  | 'infrastructure';

interface LayerState {
  activeLayers: Set<VisualizationLayerId>;
  toggleLayer: (id: VisualizationLayerId) => void;
  isLayerActive: (id: VisualizationLayerId) => boolean;
}

export const useLayerStore = create<LayerState>()((set, get) => ({
  activeLayers: new Set<VisualizationLayerId>(),
  toggleLayer: (id) =>
    set((s) => {
      const next = new Set(s.activeLayers);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { activeLayers: next };
    }),
  isLayerActive: (id) => get().activeLayers.has(id),
}));
```

### Pattern 2: Entity Toggle Removal from uiStore
**What:** Remove all 18 entity toggle fields (`showFlights`, `showShips`, etc.) and their 18 toggle functions from `UIState` interface and `useUIStore`. Remove `LayerToggles` interface, `LAYER_TOGGLE_DEFAULTS`, `loadPersistedToggles()`, `persistToggles()`, `getToggles()`.
**When to use:** Phase 20 core refactor task.
**Key insight:** The `uiStore` retains all non-toggle state: `isDetailPanelOpen`, `selectedEntityId`, `hoveredEntityId`, panel collapse states, sidebar state, markets state. Only entity toggle fields are removed.

### Pattern 3: useEntityLayers Simplification
**What:** Remove toggle-based `visible` props and data filtering from every Deck.gl layer. All entities are always visible. The flight filtering (ground/airborne/unidentified classification) is removed -- all flights render with their existing color/opacity rules.
**When to use:** After entity toggle state is removed from uiStore.
**Key complexity:**
- `showFlights`, `showGroundTraffic`, `pulseEnabled` currently gate which flights appear in the data array AND the layer visibility
- `showEvents && showAirstrikes` gates airstrike layer visibility
- `showSites` + sub-type toggles gate site filtering
- All these become unconditional: all data, always visible
- Pulse animation for unidentified flights STAYS (it's a visual effect, not a visibility toggle)
- Altitude-to-opacity mapping STAYS (visual effect)
- Search filter dimming STAYS (it's from searchStore, not toggle state)
- Active entity highlighting STAYS

### Pattern 4: Inline Legend Framework
**What:** A map overlay component that renders color scale legends for active visualization layers. Positioned in a corner, stacks vertically when multiple layers are active.
**When to use:** Each visualization layer (20.1-20.5) registers its legend configuration.
**Example:**
```typescript
// Legend configuration registered per visualization layer
interface LegendConfig {
  layerId: VisualizationLayerId;
  title: string;
  colorStops: Array<{ color: string; label: string }>;
}
```

### Pattern 5: ~300ms Opacity Fade Transition
**What:** Layer toggle uses CSS opacity transition (not Deck.gl layer visibility). When toggling a visualization layer, the layer fades in/out over ~300ms.
**When to use:** For all visualization layer toggles in sub-phases 20.1+.
**Implementation:** Use Tailwind `transition-opacity duration-300` on the Deck.gl layer wrapper or map Source/Layer elements. For Deck.gl layers, use the `opacity` prop with a transition value. For MapLibre layers, use `map.setPaintProperty()` with `*-opacity` properties.

### Anti-Patterns to Avoid
- **Moving entity toggles to filterStore:** Entity toggles are being REMOVED, not relocated. The search/filter system is the only way to narrow data.
- **Keeping backward compatibility shims:** Old toggle state should not be preserved in any form. This is a clean break.
- **Building visualization layer rendering in Phase 20:** Phase 20 only builds the FRAMEWORK (store, toggle UI, legend container). Actual layer rendering happens in 20.1-20.5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS transitions | Custom JS animation | Tailwind `transition-opacity duration-300` | Built-in, GPU-accelerated |
| Legend color gradients | Canvas-based gradient renderer | CSS `linear-gradient` backgrounds | Simple, performant, declarative |
| Layer toggle state | Complex reducer | Zustand `Set<VisualizationLayerId>` | Already the project pattern, minimal code |

**Key insight:** Phase 20 is about REMOVING complexity (entity toggles), not adding it. The new visualization layer framework should be minimal -- just a store with Set state and toggle UI.

## Common Pitfalls

### Pitfall 1: Missing Toggle References in Downstream Files
**What goes wrong:** Remove entity toggle fields from `uiStore` but miss references in 20 files.
**Why it happens:** Toggle state is deeply threaded through `useEntityLayers`, `useCounterData`, `useQuerySync`, `StatusPanel`, `FilterPanelSlot`, `BaseMap`, `StatusDropdown`, `useProximityAlerts`, and 8 test files.
**How to avoid:** Use the complete surface area map (see Integration Impact below). TypeScript strict mode will catch missing fields at compile time.
**Warning signs:** TypeScript errors after removing fields from UIState interface.

### Pitfall 2: Breaking Search/Filter Bidirectional Sync
**What goes wrong:** `useQuerySync` deeply references entity toggles in both directions (search->sidebar and sidebar->search). Removing toggles without updating sync logic causes crashes.
**Why it happens:** `TYPE_TOGGLE_MAP`, `SITE_TOGGLE_MAP`, `BOOL_TAG_MAP`, `deriveTogglesFromAST`, `buildASTFromToggles`, and `SyncableState` all reference entity toggles.
**How to avoid:** Remove all toggle-related sync logic from `useQuerySync`. Search tags like `type:flight` still work for FILTERING (via `filterStore`/`searchStore`), but they no longer control VISIBILITY toggles. The `deriveTogglesFromAST` and `buildASTFromToggles` functions need to be stripped of toggle references while preserving filter sync (dates, countries, proximity, severity, text search fields).
**Warning signs:** Infinite sync loops, search bar showing stale tags.

### Pitfall 3: Counter Data Showing Zero Counts
**What goes wrong:** `useCounterData` gates counts on toggle state (`showEvents && showAirstrikes ? countByGroup(...) : 0`). After removing toggles, if the gating logic is not removed, counts show 0.
**Why it happens:** Toggle removal without updating the gating conditionals.
**How to avoid:** Remove all toggle gating from `useCounterData`. Counts should always reflect all entities (subject to filter store predicates only).

### Pitfall 4: StatusPanel Showing Zero Counts
**What goes wrong:** Same as Pitfall 3 but in `StatusPanel.tsx` and `StatusDropdown.tsx`. Both compute visible counts using toggle state.
**Why it happens:** Same pattern -- toggle-gated counting.
**How to avoid:** Remove toggle gating from count computation.

### Pitfall 5: Tooltip Suppression Breaking
**What goes wrong:** `BaseMap.tsx` has `isEntityTooltipVisible()` that checks `showEvents`, `showAirstrikes`, etc. to suppress tooltips for toggled-off events.
**Why it happens:** Without entity toggles, there's no reason to suppress tooltips for any entity type.
**How to avoid:** Remove the `isEntityTooltipVisible()` function entirely. Tooltips always show for all entities (search filter suppression via `searchStore` still works independently).

### Pitfall 6: Proximity Alerts Not Showing Sites
**What goes wrong:** `useProximityAlerts.ts` checks `showSites` and sub-type toggles to filter which sites participate in proximity alerts.
**Why it happens:** Toggle gating of site visibility.
**How to avoid:** Remove toggle gating from proximity alert computation. All sites always participate.

### Pitfall 7: localStorage Migration
**What goes wrong:** Old `layerToggles` localStorage key persists with entity toggle data, but new code doesn't expect it.
**Why it happens:** Users upgrading from old version retain localStorage.
**How to avoid:** Remove the localStorage reading/writing code entirely (new visualization layer state doesn't persist per locked decision). Old `layerToggles` key becomes harmless dead data.

## Code Examples

### Integration Impact Map (Complete Surface Area)

All 20 files that reference entity toggles, categorized by change type:

**Store/Type definitions (remove fields):**
1. `src/types/ui.ts` -- remove `LayerToggles` interface, `LAYER_TOGGLE_DEFAULTS`, toggle fields from `UIState`, toggle functions from `UIState`
2. `src/stores/uiStore.ts` -- remove 18 toggle fields, 18 toggle functions, `loadPersistedToggles`, `persistToggles`, `getToggles`

**Hooks (remove toggle gating):**
3. `src/hooks/useEntityLayers.ts` -- remove all `visible: show*` props, remove flight classification filter, remove site type toggle filter. Keep: pulse animation, altitude opacity, search dimming, highlight/glow, proximity circle
4. `src/hooks/useQuerySync.ts` -- remove `TYPE_TOGGLE_MAP`, `SITE_TOGGLE_MAP`, `BOOL_TAG_MAP`, `deriveTogglesFromAST` toggle logic, `buildASTFromToggles` toggle logic, `SyncableState` toggle fields. Keep: all filter sync (dates, countries, ranges, text, severity, proximity)
5. `src/hooks/useProximityAlerts.ts` -- remove `showSites` and sub-type toggle checks

**Components (remove toggle consumption):**
6. `src/components/map/BaseMap.tsx` -- remove `isEntityTooltipVisible()` function and the toggle selectors it uses
7. `src/components/ui/StatusPanel.tsx` -- remove toggle-gated counting, show all entity counts
8. `src/components/layout/StatusDropdown.tsx` -- remove toggle-gated counting
9. `src/components/layout/LayerTogglesSlot.tsx` -- REPLACE content with visualization layer toggles
10. `src/components/layout/Sidebar.tsx` -- update import from `LayerTogglesContent`
11. `src/components/layout/FilterPanelSlot.tsx` -- remove `showFlights`/`showShips` toggle selectors and `VisibilityButton` usage
12. `src/components/counters/useCounterData.ts` -- remove all toggle gating from count computation

**Test files (update to match new behavior):**
13. `src/__tests__/entityLayers.test.ts` -- remove visibility toggle tests, update to expect all entities always visible
14. `src/__tests__/uiStore.test.ts` -- remove toggle tests
15. `src/__tests__/LayerToggles.test.tsx` -- REWRITE for new visualization layer toggles
16. `src/__tests__/StatusPanel.test.tsx` -- remove toggle expectations
17. `src/__tests__/CountersSlot.test.tsx` -- remove toggle expectations
18. `src/__tests__/BaseMap.test.tsx` -- remove toggle expectations
19. `src/__tests__/useCounterData.test.ts` -- remove toggle gating tests
20. `src/hooks/useQuerySync.test.ts` -- remove toggle sync tests

### New Layer Toggle Row Component
```typescript
// Reuse existing ToggleRow pattern but with new data
interface VisualizationToggleRowProps {
  layerId: VisualizationLayerId;
  label: string;
  icon: string; // emoji or SVG
  description: string;
  active: boolean;
  onToggle: () => void;
}
```

### New Legend Container Component
```typescript
// src/components/map/MapLegend.tsx
// Positioned absolute in bottom-left corner of map
// Each active layer pushes a legend block
interface LegendEntry {
  layerId: VisualizationLayerId;
  title: string;
  gradient: string; // CSS linear-gradient
  labels: { position: string; text: string }[];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Entity toggles for visibility | Search/filter for data narrowing | Phase 20 | Layers become visualization modes, not entity controls |
| ~18 toggle fields in uiStore | Layer store with Set<VisualizationLayerId> | Phase 20 | Dramatically simpler state management |
| Toggle-gated counting | Always-show all entities | Phase 20 | Counters, status panel, proximity alerts all simplify |

**Deprecated/outdated (after Phase 20):**
- `LayerToggles` interface in `types/ui.ts`
- `LAYER_TOGGLE_DEFAULTS` constant
- `loadPersistedToggles()`, `persistToggles()`, `getToggles()` functions in `uiStore.ts`
- `TYPE_TOGGLE_MAP`, `SITE_TOGGLE_MAP`, `BOOL_TAG_MAP` in `useQuerySync.ts`
- `isEntityTooltipVisible()` in `BaseMap.tsx`

## Open Questions

1. **Flight sub-categories (ground/airborne/unidentified) after toggle removal**
   - What we know: Currently `showFlights`, `showGroundTraffic`, `pulseEnabled` control which flight sub-categories are visible. After removal, ALL flights are always visible.
   - What's unclear: Should unidentified pulse animation continue for ALL unidentified flights (no toggle to disable)?
   - Recommendation: Keep pulse animation active by default (it's a visual cue, not a hide/show). The search filter can still narrow with `unidentified:true`/`ground:true` tags. The question is whether pulseEnabled should remain as a visual effect toggle (not a visibility toggle) or be fully removed.

2. **VisibilityButton in FilterPanelSlot**
   - What we know: FilterPanelSlot has `VisibilityButton` components for Flights and Ships that reference `showFlights`/`showShips` toggles.
   - What's unclear: Should these UI elements be removed entirely, or converted to filter presets?
   - Recommendation: Remove the `VisibilityButton` components entirely. Entity type filtering is done via search tags (`type:flight`, `type:ship`).

3. **Legend positioning with existing HUD elements**
   - What we know: Bottom-right has NavigationControl, ScaleControl, UtcClock, CoordinateReadout. Bottom-left is empty.
   - Recommendation: Position legends in bottom-left corner, stacking vertically upward.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom |
| Config file | vite.config.ts (test section) |
| Quick run command | `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts src/__tests__/LayerToggles.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
Phase 20 does not have formal requirement IDs (marked as TBD in REQUIREMENTS.md). Testing maps to functional behaviors:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Entity toggles removed from uiStore | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Exists, needs update |
| All entities always visible (no toggle gating) | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Exists, needs update |
| New visualization layer store | unit | `npx vitest run src/__tests__/layerStore.test.ts -x` | Wave 0 |
| New layer toggle UI renders | component | `npx vitest run src/__tests__/LayerToggles.test.tsx -x` | Exists, needs rewrite |
| Counter data shows all entities | unit | `npx vitest run src/__tests__/useCounterData.test.ts -x` | Exists, needs update |
| Legend framework renders when layer active | component | `npx vitest run src/__tests__/MapLegend.test.tsx -x` | Wave 0 |
| TypeScript compilation passes | typecheck | `npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + `npx tsc --noEmit` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/layerStore.test.ts` -- covers new visualization layer store
- [ ] `src/__tests__/MapLegend.test.tsx` -- covers legend framework rendering

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of 20 affected files in the codebase
- CONTEXT.md user decisions (locked constraints)
- Existing test suite (851 tests, all passing)

### Secondary (MEDIUM confidence)
- Zustand patterns used throughout the project (consistent `create<T>()()` curried pattern)
- Deck.gl layer `visible` and `opacity` prop behavior (used extensively in existing code)
- Tailwind CSS v4 transition utilities (used in existing codebase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all existing patterns
- Architecture: HIGH - based on exhaustive analysis of 20 affected files
- Pitfalls: HIGH - based on line-by-line reading of all toggle references

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- internal refactor, no external dependencies)
