# Phase 10: Detail Panel - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Click-to-inspect panel showing live entity stats. Users click any entity on the map and see its detailed, real-time-updating data in a side panel. Panel shows expanded information beyond the hover tooltip. This phase also repositions the UI layout: StatusPanel, CountersSlot, and LayerTogglesSlot move from top-right to top-left. No new data sources, no filtering, no analytics counters — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Content depth
- Expanded view: everything from tooltip PLUS coordinates (lat/lng), last-updated relative timestamp, and data source label
- Dual units for flights: show both metric and aviation units (altitude: ft / m, speed: kn / m/s, vertical rate: ft/min / m/s)
- Coordinates shown with copy-to-clipboard button for cross-referencing in other tools
- Conflict events: source article link style is Claude's discretion (button vs inline URL)

### Live update behavior
- Flash on change: values that changed on poll refresh briefly flash a highlight color then fade back
- Relative timestamp: "Updated Xs ago" ticking up between polls, resets on each successful poll
- Lost contact state: if entity disappears from data, panel stays open with last known data grayed out + "Lost contact" indicator. User must manually close
- Tooltip coexistence: Claude's discretion whether hover tooltip remains visible while detail panel is open

### Click & dismiss interaction
- Single click on entity opens the detail panel (or swaps content instantly if already open with a different entity)
- Instant content swap — no slide-out/slide-in animation when switching entities
- Dismiss methods: Close button, Escape key, or clicking the same entity again
- Clicking empty map does NOT dismiss the panel — panel persists until explicitly closed
- No camera movement on selection — user controls the viewport

### Panel layout
- Right-side slide-out panel (moved from original left-side stub), 360px width
- Overlay on top of map (consistent with other overlay panels), not pushing viewport
- Full height, same slide-in animation as existing stub
- Header: colored dot (entity color) + type label (FLIGHT / SHIP / DRONE / MISSILE) + entity name/callsign
- Data grouped into labeled sections (e.g. "Position", "Movement", "Identity") for scannability

### UI repositioning
- StatusPanel, CountersSlot, and LayerTogglesSlot all move from top-right to top-left
- Left-side vertical stack order: TitleSlot → StatusPanel → CountersSlot → LayerTogglesSlot
- Right side exclusively reserved for the detail panel
- Update CSS variable: `--width-detail-panel: 360px` (was 320px)

### Claude's Discretion
- Source article link style for conflict events (button vs inline URL)
- Whether hover tooltip remains visible while detail panel is open for a different entity
- Exact section groupings per entity type (e.g. "Position", "Movement", "Identity" for flights)
- Flash highlight color and animation duration
- "Lost contact" visual treatment (grayed out approach)
- Close button style (X icon vs text)

</decisions>

<specifics>
## Specific Ideas

- Panel should maintain the tactical HUD aesthetic — monospace, dark, minimal — matching StatusPanel and LayerToggles
- Dual units for flights mirrors real aviation tools (FlightRadar24 shows both)
- "Lost contact" state prevents jarring auto-close when an entity temporarily drops from a single poll cycle
- Copy-to-clipboard on coordinates is a power-user feature for cross-referencing with other OSINT tools
- Flash-on-change gives the panel a "live feed" feel without being distracting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DetailPanelSlot` (`src/components/layout/DetailPanelSlot.tsx`): Stub component with slide-in/out transition, close button, reads `isDetailPanelOpen` from uiStore — needs repositioning to right side and content implementation
- `EntityTooltip` (`src/components/map/EntityTooltip.tsx`): Per-type content renderers (FlightContent, ShipContent, EventContent) — content patterns to expand upon
- `OverlayPanel` (`src/components/ui/OverlayPanel.tsx`): Dark panel container — may inform styling
- `useUIStore` (`src/stores/uiStore.ts`): Already has `selectedEntityId`, `isDetailPanelOpen`, `selectEntity`, `openDetailPanel`, `closeDetailPanel` actions
- `ENTITY_COLORS` (`src/components/map/layers/constants.ts`): Color values for header dot

### Established Patterns
- Zustand curried `create<T>()()` with selector pattern `s => s.field`
- OverlayPanel for dark overlay containers
- `--z-panel: 20` for panel z-index layering
- Slide-in/out via CSS transform + transition

### Integration Points
- `src/components/layout/AppShell.tsx`: Reposition StatusPanel/CountersSlot/LayerTogglesSlot to left, DetailPanelSlot to right
- `src/styles/app.css`: Update `--width-detail-panel` to 360px
- `src/stores/uiStore.ts`: May need to look up entity data from flight/ship/event stores by `selectedEntityId`
- `src/components/map/BaseMap.tsx` or `DeckGLOverlay`: Wire click handler to `selectEntity` + `openDetailPanel`
- `src/stores/flightStore.ts`, `src/stores/shipStore.ts`, `src/stores/eventStore.ts`: Read entity arrays to find selected entity by ID

</code_context>

<deferred>
## Deferred Ideas

- Nearby entities section in detail panel (flights within X km) — could be a future enhancement
- Raw data dump toggle for power users — potential future addition
- Map camera pan-to-entity on selection — decided against for now, could revisit

</deferred>

---

*Phase: 10-detail-panel*
*Context gathered: 2026-03-17*
