# Phase 12: Analytics Dashboard - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Running numerical counters that summarize conflict activity and key flight metrics at a glance. The counters panel lives alongside the map in the existing CountersSlot (left overlay). No navigation away from the map view. No new data sources — counters derive from existing event and flight stores.

</domain>

<decisions>
## Implementation Decisions

### Counter Categories
- Three conflict counter groups matching existing CONFLICT_TOGGLE_GROUPS: Airstrikes (airstrike), Ground Combat (ground_combat, shelling, bombing, assault, blockade, ceasefire_violation, mass_violence, wmd), Targeted (assassination, abduction)
- Total row summing all three groups
- Fatalities total row summing fatalities field across all events
- Two flight-derived counters: Iranian flights (originCountry === 'Iran') and Unidentified flights (unidentified === true)
- No ship metrics — StatusPanel already covers entity counts

### Counter Layout
- Two sections with visual divider: FLIGHTS section on top (Iranian, Unidentified), EVENTS section below (Airstrikes, Ground Combat, Targeted, Total, Fatalities)
- Event counter rows use colored dots matching layer toggle colors (airstrikes #ff3b30, ground combat #ef4444, targeted #8b1e1e)

### Filter-Aware Counters
- Event counters show x/total ratio with percentage when filters are active (both layer toggles AND smart filters narrow x; total is always unfiltered)
- When no filters are active (x equals total), show just the number — no ratio, no percentage
- Date range filter affects counters (consistent with smart filter integration)
- Flight counters (Iranian, Unidentified) always show just the count — no ratios

### Update Behavior
- Counters recompute reactively when store data updates (event store every 15 min, flight store per polling interval)
- No animated count-up, no polling countdown
- Green +N delta text appears next to changed values, fades out after 3 seconds
- Delta shows difference from previous value (not session accumulation)

### Time Window
- Counters reflect all events in the current dataset (whatever GDELT returns), not cumulative across refreshes

### Claude's Discretion
- Exact delta fade animation (CSS transition or keyframe)
- Number formatting for large values (comma separators, etc.)
- Section header styling (FLIGHTS/EVENTS labels)
- Whether to use the existing DetailValue flash-on-change pattern or a new delta component

</decisions>

<specifics>
## Specific Ideas

- CountersSlot is already scaffolded with collapse/expand toggle and "No data yet" placeholder — replace the placeholder content
- The inline ratio format: "Airstrikes  8/12  67%" when filtered, "Airstrikes  12" when unfiltered
- Green +N delta text mirrors the DetailValue flash-on-change pattern already used in the detail panel

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CountersSlot` (`src/components/layout/CountersSlot.tsx`): Already scaffolded with OverlayPanel, collapse toggle, wired into AppShell
- `OverlayPanel` (`src/components/ui/OverlayPanel.tsx`): Shared panel wrapper used by all left-side overlay panels
- `DetailValue` (`src/components/detail/DetailValue.tsx`): Flash-on-change animation component — pattern can inform delta flash
- `CONFLICT_TOGGLE_GROUPS` (`src/types/ui.ts`): Defines the 3 event groupings — reuse for counter categorization
- `ENTITY_DOT_COLORS` (`src/components/map/layers/constants.ts`): Dot colors for airstrikes, ground combat, targeted
- `entityPassesFilters` (`src/lib/filters.ts`): Pure predicate for smart filter evaluation — reuse for filtered counts
- `useFilteredEntities` (`src/hooks/useFilteredEntities.ts`): Already filters entities by active filters — can derive filtered counts

### Established Patterns
- Zustand selectors (`s => s.field`) for minimal re-renders — use same pattern for counter computations
- `useMemo` for derived data (see `useEntityLayers.ts`) — compute counter values as memos
- OverlayPanel collapse/expand pattern with `isCountersCollapsed` / `toggleCounters` already in uiStore

### Integration Points
- `useEventStore` provides `events: ConflictEventEntity[]` with `type`, `data.fatalities`
- `useFlightStore` provides flights with `data.originCountry` and `data.unidentified`
- `useFilterStore` provides active filter state for determining if filters are active
- `useUIStore` provides layer toggle state (showAirstrikes, showGroundCombat, showTargeted, showEvents)
- CountersSlot already rendered in AppShell between StatusPanel and LayerTogglesSlot

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-analytics-dashboard*
*Context gathered: 2026-03-18*
