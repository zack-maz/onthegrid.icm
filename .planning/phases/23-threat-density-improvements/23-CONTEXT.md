# Phase 23: Threat Density Improvements - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the threat heatmap more accurate and visually useful with a military thermal color palette, finer grid resolution, P90 global normalization, adjacent-cell cluster merging with clickable detail panel, and weight formula cleanup. Zoom-responsive radius is dropped (static-sized heatmap preferred). Temporal pulse/glow is dropped (date range filter handles recency).

</domain>

<decisions>
## Implementation Decisions

### Color Palette — Military Thermal
- Switch from 5-stop all-red palette to 8-stop military thermal: dark blue/purple (cold/low) → yellow → orange → bright red (hot/high)
- Like FLIR/thermal imaging — intuitive: warm = dangerous
- Opacity stays at 45% uniform (no density-scaled opacity)
- Legend keeps minimal 2-stop format (Low / High) with new start/end colors
- Thermal palette applies to heatmap overlay only — event entity icons keep their existing red-family colors

### Temporal Behavior — Simplified
- Remove 6h temporal decay from `computeThreatWeight` — with date range filtering, all visible events are equally relevant
- Weight is purely severity-based: typeWeight × log2(mentions) × log2(sources) × fatalityBoost × goldsteinHostility
- No pulse/glow animation for recent events (dropped from deliverables)

### Normalization — Global P90
- Use 90th percentile of all visible event weights as the color scale max (globally across Middle East, not per-country)
- Events above P90 all render at max thermal color
- P90 recomputes dynamically when filters/search change
- P90 does NOT change with zoom or viewport — based on full filtered event set

### Zoom Behavior — Static
- Drop zoom-responsive `radiusPixels` from deliverables — heatmap stays static-sized
- Drop zoom-responsive picker radius — keep static
- User prefers predictable, non-shifting visual at all zoom levels

### Grid & Clustering
- Reduce grid resolution from 0.75° to 0.25° (~28km cells) for higher spatial fidelity
- Merge adjacent non-empty cells into connected-component clusters
- Each cluster is one pickable entity with aggregated tooltip data

### Cluster Interaction
- Clicking a threat cluster opens the existing DetailPanelSlot (360px right slide-out)
- Header: "Threat Cluster — N events"
- Scrollable list of individual event cards within the cluster
- Clicking an individual event flies to it and opens that event's detail panel (replaces cluster panel — no back button in this phase)

### Claude's Discretion
- Specific 8-color hex values for the thermal palette
- Grid cell merging algorithm (flood fill, union-find, etc.)
- Exact radiusPixels value (currently 40, may tune)
- HeatmapLayer configuration tuning (intensity, threshold)
- How to compute P90 efficiently in the useMemo chain

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/map/layers/ThreatHeatmapOverlay.tsx`: Full heatmap implementation — HeatmapLayer, ScatterplotLayer picker, `computeThreatWeight`, `aggregateToGrid`, `ThreatTooltip`, legend registration
- `src/components/layout/DetailPanelSlot.tsx`: 360px slide-out detail panel — reuse for cluster detail
- `src/components/detail/DetailValue.tsx`: Reusable value cell with flash animation
- `src/hooks/useFilteredEntities.ts`: Already filters events and applies client-side dispersion — heatmap consumes from here
- `src/lib/severity.ts`: `TYPE_WEIGHTS` for event type severity scoring

### Established Patterns
- deck.gl layers returned from `useMemo` hooks — existing pattern in `useThreatHeatmapLayers`
- `LEGEND_REGISTRY.push()` for legend entries — module-scope registration
- `CONFLICT_TOGGLE_GROUPS` for per-category visibility gating
- Entity click → `selectEntity` + `openDetailPanel` pattern from BaseMap onClick handler

### Integration Points
- `ThreatHeatmapOverlay.tsx` — primary file to modify (palette, grid, normalization, clustering)
- `DetailPanelSlot.tsx` — add cluster detail content type
- `useSelectedEntity.ts` — may need to handle "cluster" as a pseudo-entity type
- `uiStore.ts` — may need cluster selection state alongside entity selection
- `BaseMap.tsx` — onClick handler for cluster picker layer

</code_context>

<specifics>
## Specific Ideas

- "Military thermal" look — like FLIR imagery, dark blue/purple cold end, bright red/white hot end
- Cluster click interaction should mirror the attacked-site detail pattern with scrollable event list
- P90 normalization should make quieter areas visible while Syria/Iraq border still reads as "hot"

</specifics>

<deferred>
## Deferred Ideas

- **Detail panel navigation stack / back button** — Phase 23.1 (INSERTED). When drilling from cluster → individual event, a back button would return to the cluster view. Benefits all entity types, not just threat clusters.

</deferred>

---

*Phase: 23-threat-density-improvements*
*Context gathered: 2026-04-02*
