# Phase 9: Layer Controls & News Toggle - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Toggle controls for showing/hiding entity categories on the map, plus a news content toggle that enables GDELT event description tooltips. Users can independently control visibility of flights, ships, drones, missiles, ground traffic, and the unidentified flight pulse animation. Non-statistical news content (GDELT event metadata tooltips) is hidden by default with a toggle to reveal. No new data sources, no detail panel, no filtering — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Toggle granularity
- 6 independent toggles total: Flights, Ships, Drones, Missiles, Ground Traffic, Pulse
- All toggles are fully independent — no parent/child gating (e.g. Ground Traffic ON with Flights OFF shows only ground aircraft)
- Flights = airborne flights, Ground Traffic = ground-level aircraft, Pulse = unidentified flight animation
- Ground Traffic and Pulse are visually nested (indented) under Flights for grouping, but behave independently
- No "Events group" toggle — drones and missiles are toggled individually
- News toggle is a separate control (see News content section below)

### Toggle visual design
- Labeled rows with colored entity dots inside an OverlayPanel, matching StatusPanel HUD aesthetic
- Each row: colored dot (entity color from constants) + text label. Full row is clickable
- On/off state indicated by opacity: full brightness when on, ~40% opacity when off
- No checkbox widgets, no toggle switches — dimming IS the state
- Sub-toggles (Ground, Pulse) visually indented under Flights with smaller text
- No entity counts in the Layers panel (StatusPanel already shows counts)
- Panel starts expanded on page load, always visible (no collapse)
- "Layers" header at top (already stubbed in LayerTogglesSlot)

### News content (CTRL-04)
- "Non-statistical news" = GDELT event metadata shown as tooltips on event markers
- Tooltip appears on hover over drone/missile markers when news toggle is ON
- Tooltip shows full GDELT metadata: event type, actor names, location name, date, CAMEO code, Goldstein scale, source article URL
- News toggle defaults to OFF — matches "numbers over narratives" core value
- When OFF: event markers visible on map but no hover tooltips (just positional dots)
- News toggle appears in the Layers panel alongside entity toggles

### Toggle persistence
- All toggle states persist via localStorage as a single object (key: 'layerToggles')
- Same try/catch guard pattern as existing flight source persistence
- On load: read stored object, merge with defaults for any missing keys
- Default values: entities ON, news OFF (matching CTRL-04 requirement)

### Claude's Discretion
- Default strategy for new toggle keys not yet in localStorage (sensible default approach)
- Exact tooltip component implementation (Deck.gl pickingInfo vs custom overlay)
- Which GDELT metadata fields are available in the normalized ConflictEventEntity (may need to pass through additional fields from adapter)
- Exact opacity values for dimmed state (~40% suggested, final tuning flexible)
- Keyboard accessibility for toggle rows

</decisions>

<specifics>
## Specific Ideas

- Labeled rows with dots should feel like the StatusPanel — tactical HUD readout, not a settings menu
- Opacity dimming as on/off state is more elegant than checkboxes for the dark theme aesthetic
- Sub-toggle indentation creates visual hierarchy without creating behavioral dependency
- GDELT tooltips are the bridge between "numbers only" default and "narrative available on demand"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LayerTogglesSlot` (`src/components/layout/LayerTogglesSlot.tsx`): Stub component already positioned in AppShell, wraps OverlayPanel with "Layers" header
- `OverlayPanel` (`src/components/ui/OverlayPanel.tsx`): Dark panel container used by StatusPanel — reuse for consistent styling
- `useUIStore` (`src/stores/uiStore.ts`): Already has `pulseEnabled`, `showGroundTraffic` with toggle actions — extend with new layer visibility booleans
- `UIState` (`src/types/ui.ts`): Type interface for uiStore — add new toggle fields here
- `ENTITY_COLORS` (`src/components/map/layers/constants.ts`): Color values for each entity type — use for colored dots in toggle rows
- `loadPersistedSource`/`persistSource` (`src/stores/flightStore.ts`): localStorage pattern to follow for toggle persistence

### Established Patterns
- Zustand curried `create<T>()()` with selector pattern `s => s.field`
- OverlayPanel component for dark overlay containers
- localStorage persistence with try/catch guards (flightStore pattern)
- useEntityLayers hook conditionally includes layers — add visibility filtering here

### Integration Points
- `src/hooks/useEntityLayers.ts`: Filter returned layers array based on toggle state (conditionally exclude layers)
- `src/stores/uiStore.ts`: Add showFlights, showShips, showDrones, showMissiles, showNews booleans
- `src/types/ui.ts`: Extend UIState interface with new toggle fields
- `src/components/layout/LayerTogglesSlot.tsx`: Replace stub with full toggle panel component
- GDELT adapter (`server/adapters/gdelt.ts`): May need to pass through additional metadata fields for tooltip content

</code_context>

<deferred>
## Deferred Ideas

- Conflict event filtering by type (missiles vs drones) beyond simple show/hide — belongs in Phase 11 (Smart Filters)
- Collapsible/expandable Layers panel — could add later if screen space becomes an issue
- Entity count badges in toggle rows — redundant with StatusPanel but could revisit

</deferred>

---

*Phase: 09-layer-controls-news-toggle*
*Context gathered: 2026-03-17*
