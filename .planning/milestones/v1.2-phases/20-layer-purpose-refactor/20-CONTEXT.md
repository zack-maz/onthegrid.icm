# Phase 20: Layer Purpose Refactor - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the entity toggle system with a stackable visualization layer architecture. "Layers" become different ways to view the map (geographical, weather, threat, etc.) rather than entity visibility controls. All entities (flights, ships, events, sites) are always visible — search/filter is the only way to narrow data. This phase builds the layer framework and removes entity toggles. Individual visualization layers are built in sub-phases 20.1–20.5.

</domain>

<decisions>
## Implementation Decisions

### Layer Architecture
- Entity toggles (showFlights, showShips, showEvents, showSites, all sub-toggles) are removed entirely
- All entities are always rendered on the map — no visibility controls
- Search/filter system (`type:flight`, etc.) is the only way to narrow visible entities
- Layers are stackable overlays that blend via fixed semi-transparent opacity
- Each layer has a simple on/off toggle — no opacity sliders
- Layer state resets on page reload (no localStorage persistence)
- Toggling a layer uses ~300ms opacity fade in/out transition

### Sidebar Integration
- Replaces the current "Layers" section in the sidebar in-place
- Same UI slot, new content: visualization layer toggles instead of entity toggles
- Clean toggle rows for each visualization layer

### Inline Legends
- When a layer is active, a small color scale legend appears on the map (corner position)
- Multiple active layers stack their legends
- Legend disappears when layer is toggled off

### Phase Structure
- Phase 20: Layer architecture refactor (remove entity toggles, build layer toggle system, inline legend framework)
- Phase 20.1: Geographical + Weather layers
- Phase 20.2: Threat Heatmap layer
- Phase 20.3: Political Boundaries layer
- Phase 20.4: Satellite Imagery layer
- Phase 20.5: Infrastructure Focus layer

### Geographical Layer (Phase 20.1)
- Monochrome elevation gradient (dark to light gray/blue) for terrain tinting — fits dark theme
- Elevation contour lines overlaid at regular intervals
- Major geographic feature labels only (Zagros Mountains, Dasht-e Kavir, Tigris/Euphrates, etc.)
- Uses existing AWS Terrarium elevation tiles already in the project
- No entity color changes — just terrain visualization

### Weather Layer (Phase 20.1)
- Real-time temperature overlay from Open-Meteo API (free, no API key)
- Grid heatmap rendering (Deck.gl HeatmapLayer or GridLayer)
- Color scale: blue (cold) → green → yellow → red (hot)
- Polled every 30-60 min with server-side caching
- Legend shows both °C and °F (dual-unit, matching FlightDetail pattern)
- Adds server route `/api/weather` + Redis cache entry

### Threat Heatmap Layer (Phase 20.2)
- Color-codes regions by GDELT conflict event density
- Uses existing event data (no new API)
- Hot zones glow red, quiet areas stay dark

### Satellite Imagery Layer (Phase 20.4)
- Switches/overlays aerial tiles (ArcGIS World Imagery, already used for site thumbnails)
- Renders as semi-transparent overlay on top of Dark Matter basemap

### Political Boundaries Layer (Phase 20.3)
- Emphasizes country borders, disputed territories
- Color-codes countries by alliance/faction

### Infrastructure Focus Layer (Phase 20.5)
- Dims non-site entities, highlights sites with enhanced labels
- Infrastructure-only X-ray view of the region

### Claude's Discretion
- Exact legend positioning and stacking layout
- Contour line interval spacing
- Grid resolution for weather temperature sampling
- Transition animation easing curve
- How to handle the removal of entity toggle state from uiStore (cleanup approach)
- Which geographic features qualify as "major" for labels

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/map/layers/constants.ts`: Entity colors, icon sizes, altitude-to-opacity mapping — altitude logic reusable for geographical layer
- `src/components/map/constants.ts`: TERRAIN_SOURCE_TILES (AWS Terrarium) already configured — elevation data source for geographical layer
- `src/components/map/layers/icons.ts`: Canvas-generated icon atlas — entities continue using this as-is
- `src/hooks/useSiteImage.ts`: ArcGIS World Imagery tile URL pattern — reusable for satellite layer
- `src/stores/uiStore.ts`: All entity toggle state lives here — this is the primary file to refactor
- `src/components/layout/LayerTogglesSlot.tsx`: `LayerTogglesContent` and `ToggleRow` components — ToggleRow pattern reusable for new layer toggles
- `src/hooks/useEntityLayers.ts`: Reads toggle state to set Deck.gl layer visibility — needs refactoring to remove toggle gating
- `src/components/counters/useCounterData.ts`: Derives counts from toggle state — needs simplification
- `src/hooks/useFilteredEntities.ts`: Also reads toggle state — needs cleanup

### Established Patterns
- Zustand stores with curried `create<T>()()` pattern for all state
- OverlayPanel component for sidebar sections
- Deck.gl layers for all map rendering (IconLayer, HeatmapLayer available)
- Server adapters pattern (`server/adapters/*.ts`) for new data sources
- Redis cache-first pattern for API routes (`cacheGet`/`cacheSet`)
- Recursive setTimeout polling with tab visibility awareness

### Integration Points
- `src/stores/uiStore.ts` — remove ~18 entity toggle fields and their toggle functions
- `src/components/layout/LayerTogglesSlot.tsx` — replace content with visualization layer toggles
- `src/components/layout/Sidebar.tsx` — uses LayerTogglesContent
- `src/hooks/useEntityLayers.ts` — remove toggle-based visibility gating
- `src/hooks/useQuerySync.ts` — bidirectional sync references toggle state, needs updating
- `src/components/counters/useCounterData.ts` — toggle-gated counts simplified to always-visible
- `src/__tests__/entityLayers.test.ts`, `src/__tests__/uiStore.test.ts`, `src/__tests__/LayerToggles.test.tsx` — tests need updating

</code_context>

<specifics>
## Specific Ideas

- Layer concept is explicitly "different ways to view the map" — not data visibility controls
- Dark Matter basemap is always-on, never toggleable — it's the canvas, not a layer
- Geographical and Weather are separate layers (not fused) despite being in the same sub-phase
- User wants the feel of stacking transparent overlays on a light table

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-layer-purpose-refactor*
*Context gathered: 2026-03-22*
