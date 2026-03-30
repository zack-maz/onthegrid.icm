# Phase 19: Search, Filter & UI Cleanup - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Major UI restructure: replace floating overlay panels with a slide-out sidebar (left) and a topbar (top). Add Cmd+K global search with unified search/filter behavior. Make markets panel draggable. Update ship colors to purple. General polish pass. Does NOT include new data sources, new entity types, or new analytical features.

</domain>

<decisions>
## Implementation Decisions

### Sidebar
- Left edge slide-out with thin icon strip always visible when collapsed
- Icon strip has one icon per section (counters, layers, filters) — clicking opens sidebar scrolled to that section
- Expanded sidebar is ~280px, overlays the map (no map resize)
- Contains: Counters section, Layers section, Filters section — each expandable/collapsible internally
- Coexists with right-side detail panel — both can be open simultaneously
- Remove "Iranian flights" counter; keep all other counters (Flights, Unidentified, Airstrikes, Ground Combat, Targeted, Fatalities)
- Layers section stays at bottom of sidebar for now (search/filter taking its functional place, but keep for testing)

### Topbar
- Full-width bar spanning viewport, same backdrop-blur style as OverlayPanel
- Left: "Iran Conflict Monitor" title with status dropdown — dropdown reveals connection health dots + total count per data source (Flights, Ships, Events, Sites, News, Markets)
- Center: Cmd+K search hint (small magnifying glass icon + "Cmd+K" badge) — clicking also opens search modal
- Right: Notification bell button (moved from floating position)
- Current time display moved OUT of status section, into bottom-left alongside zoom controls and coordinates

### Search (Cmd+K modal)
- Cmd+K opens a centered modal/palette (Spotlight-style), NOT an inline search bar
- Results displayed as grouped list by entity type (Flights, Ships, Events, Sites) with type headers
- Searchable by any tag/field of any entity: callsign, country, event type, site name, MMSI, timestamp, etc.
- Dual behavior on selection:
  - **Enter on query**: applies as filter — all matching entities stay visible, non-matches gray out and become transparent
  - **Click specific result**: fly-to entity location + open detail panel, search modal closes

### Search/Filter unification
- Search and filters are two views of the same state: searching populates filters, and filter settings populate the search bar text
- Non-matching entities are grayed out + made highly transparent + unhoverable — but still clickable (user can click to select and open detail panel)
- Active search/filter clearable via: filter chip visible in sidebar filter section (click X to remove), OR Escape key / clear icon in search area
- Clearing must not conflict with detail panel being open (Escape should close search filter, not the detail panel, when search is active)

### Markets panel
- Remains a floating expandable panel (not moved into sidebar)
- Draggable — user can drag to any position on screen, free-float (no snapping)
- Default position: top-right (current location)
- Position persisted to localStorage; restored on reload
- Reset position button to return to default top-right

### General UI
- Ship color changed from gray (#9ca3af) to soft purple (#a78bfa / violet-400)
- Current time moved from StatusPanel to bottom-left corner alongside zoom controls and coordinates
- Polish pass: consistent font sizes, spacing alignment across panels, opacity/blur consistency

### Claude's Discretion
- Icon choices for sidebar strip (counters, layers, filter icons)
- Sidebar expand/collapse animation timing and easing
- Search modal dimensions and max result count
- Fuzzy matching algorithm implementation (client-side, likely simple substring/token matching across entity fields)
- How filter chips display in sidebar when search-as-filter is active
- Escape key priority resolution (search filter vs detail panel vs notification dropdown)
- Drag handle design for markets panel (grab cursor area)
- Polish pass specifics (which font sizes/spacings to adjust)

</decisions>

<specifics>
## Specific Ideas

- The sidebar slide-out pattern: thin icon strip always visible, clicking any icon opens the full sidebar scrolled to that section — similar to VS Code activity bar
- Search/filter unification is the core UX insight: they're the same thing expressed differently. Typing "iran" in search = setting a country filter. Setting a country filter = showing "iran" in the search bar.
- Non-matching entities gray out but remain clickable — preserves spatial context while focusing attention on matches
- Markets panel stays floating because it's supplementary data, not a core map control — it shouldn't compete for sidebar real estate

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/OverlayPanel.tsx`: Panel wrapper with backdrop-blur — reuse for sidebar and topbar styling
- `src/components/layout/CountersSlot.tsx`: Counter display with delta animation — move into sidebar section
- `src/components/layout/LayerTogglesSlot.tsx`: 17 toggle rows — move into sidebar section
- `src/components/layout/FilterPanelSlot.tsx`: Filter controls — move into sidebar section
- `src/stores/filterStore.ts`: Already has `clearAll()`, `activeFilterCount()`, per-filter `clearFilter()` — extend with search query state
- `src/stores/uiStore.ts`: Toggle state for all layers — will need sidebar open/collapsed state
- `src/components/ui/StatusPanel.tsx`: Connection dots + counts — refactor into topbar status dropdown
- `src/components/layout/NotificationBell.tsx`: Move into topbar right side
- `src/components/layout/MarketsSlot.tsx`: Add drag behavior, position persistence
- `app.css`: `@keyframes delta-fade` and `animate-delta` — keep for counter animations in sidebar

### Established Patterns
- Zustand curried `create<T>()()` for any new store state
- localStorage persistence for UI preferences (collapse state, toggle state, market position)
- OverlayPanel for consistent panel chrome (rounded, border, backdrop-blur)
- Recursive setTimeout polling (unchanged — hooks stay in AppShell)

### Integration Points
- `src/components/layout/AppShell.tsx`: Major restructure — replace floating panel stack with Topbar + Sidebar + Map + DetailPanel layout
- All entity stores (flight, ship, event, site): search needs to read from all of them for cross-entity matching
- `src/components/map/layers/`: Layer visibility will need to respect search/filter gray-out state (reduce alpha for non-matches, disable hover picking)
- `src/components/map/EntityTooltip.tsx`: Disable tooltip for non-matching entities when filter is active

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-search-filter-ui-cleanup*
*Context gathered: 2026-03-22*
