# Phase 5: Entity Rendering - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Type-specific entity markers rendered on the 2.5D map via Deck.gl layers. Each entity type (flight, ship, missile, drone) has a visually distinct icon, color, and behavior. Markers update position as new data arrives. No UI controls, toggles, or detail panels — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Marker shapes per entity type
- **Flights**: Directional chevron/arrow — filled triangle pointing in heading direction, ~12-16px
- **Ships**: Diamond shape — rotated square, naval chart convention, ~10-14px
- **Drones**: Starburst/asterisk — active threat indicator, static (no rotation), ~12-16px
- **Missiles**: X mark — strike/impact marker, static (no rotation), ~12-16px

### Color assignment
- **Flights (regular)**: Green (#22c55e) — "confirmed/safe" from palette
- **Flights (unidentified)**: Yellow (#eab308) — "warning/unconfirmed" from palette
- **Ships**: Blue (#3b82f6) — "naval/friendly" from palette
- **Drones**: Red (#ef4444) — "hostile/strikes" from palette
- **Missiles**: Red (#ef4444) — "hostile/strikes" from palette (same as drones, shape distinguishes)

### Heading & orientation
- Flight chevrons rotate to show actual heading direction (getAngle from FlightEntity.data.heading)
- Ship diamonds rotate to show course heading (getAngle from ShipEntity.data.courseOverGround)
- Conflict events (missiles/drones) are static — no rotation (point-in-time events, no heading)

### Marker sizing
- Fixed pixel size regardless of zoom level (Deck.gl sizeUnits: 'pixels')
- No scaling with zoom — keeps density readable at all zoom levels
- No trails or position history — clean markers only, fits atomic-replace data model

### Altitude indication
- Flight marker opacity varies by altitude — subtle depth cue
- Higher altitude = full opacity, lower altitude = reduced opacity (~0.6-1.0 range)
- Ships and conflict events: no altitude variation (surface/ground level)

### Unidentified flight treatment
- Yellow color (#eab308) — always visually distinct from regular green flights
- Soft glow pulse animation: opacity oscillates 0.7-1.0 over ~2 second cycle
- Pulse animation defaults to ON in Phase 5
- Pulse toggle deferred to Phase 7 (layer controls) — stored as boolean in uiStore for when toggle is built
- When pulse toggled off (future): unidentified flights remain yellow but static

### Claude's Discretion
- Exact SVG icon assets or Deck.gl layer type choice (IconLayer vs ScatterplotLayer vs custom)
- Altitude-to-opacity mapping curve (linear, logarithmic, banded)
- Pulse animation implementation (requestAnimationFrame, Deck.gl transitions, CSS)
- Layer ordering and z-index within DeckGLOverlay
- Null heading handling (when heading data is missing)
- Performance optimization for 200-500 simultaneous flight markers

</decisions>

<specifics>
## Specific Ideas

- Intelligence/HUD dashboard aesthetic — markers should feel tactical, not consumer-app
- Chevrons + diamonds + starbursts + X marks create a clear visual vocabulary: movement vs threat vs impact
- Unidentified flights are "the most interesting data points" — yellow + pulse makes them pop without being garish
- Drone starburst vs missile X mark: starburst = active/hovering threat, X = strike/impact location

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DeckGLOverlay` (`src/components/map/DeckGLOverlay.tsx`): Wraps MapboxOverlay via useControl — entity layers pass through `layers` prop
- `useFlightStore` (`src/stores/flightStore.ts`): Zustand store with `flights: FlightEntity[]`, `connectionStatus`, atomic replace on poll
- `FlightEntity` (`server/types.ts`): Has `data.heading`, `data.velocity`, `data.altitude`, `data.unidentified` — all needed for rendering
- `ShipEntity` / `ConflictEventEntity` (`server/types.ts`): Type definitions ready for when data feeds arrive in Phase 6

### Established Patterns
- Zustand selector pattern (`s => s.flights`) for minimal re-renders
- DeckGLOverlay currently receives `layers={[]}` in BaseMap — entity layers plug in here
- CSS custom properties for z-index layering (`--z-map`, `--z-overlay`, `--z-controls`)

### Integration Points
- `BaseMap.tsx` line 126: `<DeckGLOverlay layers={[]} />` — entity layers array goes here
- `flightStore.ts`: Flight data source — selector feeds into layer data prop
- `uiStore.ts`: Will need `pulseEnabled: boolean` state for unidentified flight pulse toggle (Phase 7 adds UI)
- Future ship/event stores (Phase 6) will follow same Zustand pattern

</code_context>

<deferred>
## Deferred Ideas

- Pulse toggle UI — Phase 7 (layer controls)
- Position trails / trajectory rendering — future phase (requires position history buffer)
- Country-based coloring — could revisit in Phase 9 (smart filters) as a filter-driven color mode

</deferred>

---

*Phase: 05-entity-rendering*
*Context gathered: 2026-03-15*
