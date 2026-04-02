# Phase 25: Ethnic Distribution Layer - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Toggleable overlay showing major ethnic/sectarian zones as labeled hatched regions. Users can identify which ethnic groups are predominant in any area of the Middle East, with hover tooltips providing group context. Distinct visual treatment from the political layer (hatching vs solid fills).

</domain>

<decisions>
## Implementation Decisions

### Zone Definitions
- 10 ethnic zones (dropped Shia/Sunni corridors from roadmap, added Arabs, Persians, Yazidi, Assyrian, Pashtun):
  1. Kurdish — unified cross-border zone (SE Turkey, N Iraq, NE Syria, W Iran)
  2. Arab — one continuous polygon across Arab-majority regions
  3. Persian — central/eastern Iran
  4. Baloch — SE Iran, SW Pakistan
  5. Turkmen — NE Iran, Turkmenistan, pockets in N Iraq/Syria
  6. Druze — S Lebanon, SW Syria, N Israel
  7. Alawite — NW Syria coast
  8. Yazidi — Sinjar area (N Iraq), core homeland only
  9. Assyrian — Nineveh Plains (N Iraq) + Khabur triangle (NE Syria), core homeland only
  10. Pashtun — E/S Afghanistan, NW Pakistan
- All zones treated equally (same rendering approach for major and minor groups)
- Kurdish zone is one unified polygon spanning 4 countries (not split per country)
- Small groups (Yazidi, Assyrian) show core homelands only, no diaspora pockets
- Arab zone is one continuous polygon, not sub-divided by country/culture

### Visual Differentiation
- Diagonal line hatching — distinct from political layer's solid fills
- deck.gl + canvas texture approach (canvas-generated hatch patterns applied via deck.gl pipeline for terrain compatibility)
- Mixed hatching pattern in overlap zones — interleaved colored stripes from each group present (not blended)
- Opacity: moderate ~25-30% for hatching lines (more prominent than political's 15%, since hatching is inherently lighter)
- Zone labels: always visible when layer is active, rendered at polygon centroids, zoom-responsive

### Zone Interactions
- Hover shows tooltip with group name, approximate population, and brief context
- Entity tooltips take priority over ethnic tooltips (ethnic tooltip only on empty map areas within a zone)
- Overlap zone tooltips list all groups present (e.g., "Kurdish · Turkmen · Arab")
- Not clickable — no detail panel integration
- Ethnic layer stacks on top of political layer when both active

### Data Sourcing
- Research published ethnic distribution datasets first (GREG, EPR-GeoEthnic, Weidmann, etc.)
- Detailed boundaries preferred (district/governorate-level ethnic composition data if available)
- Only include groups covered by the dataset — do NOT hand-draw missing groups
- Single GeoJSON file with `group` property per feature (same pattern as countries.json)
- Static bundle via Vite import

### Claude's Discretion
- 10-color palette selection (must work on dark base map and be distinguishable from political faction colors)
- Hatch pattern parameters (line spacing, angle, stroke width per group)
- Canvas texture generation approach
- Zoom thresholds for label visibility
- Tooltip content details (population figures, context text)
- How to implement mixed hatching in overlap zones via canvas textures

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `usePoliticalLayers()` hook pattern: deck.gl GeoJsonLayer returned from hook, fed into DeckGLOverlay
- `LEGEND_REGISTRY` with `mode: 'discrete'` for ethnic group legend
- `layerStore.ts`: `ethnic` already registered as VisualizationLayerId
- `LayerTogglesSlot.tsx`: Ethnic row exists with `comingSoon: true`
- `src/data/` directory for static GeoJSON assets

### Established Patterns
- deck.gl GeoJsonLayer for polygon rendering (proven to work with terrain — MapLibre fill layers don't)
- `useLayerStore(s => s.activeLayers.has('ethnic'))` selector pattern
- Static JSON import via Vite
- DeckGLOverlay layers array: political first, then weather/threat/entity layers

### Integration Points
- `BaseMap.tsx`: new `useEthnicLayers()` hook, layers inserted after politicalLayers in DeckGLOverlay array
- `LayerTogglesSlot.tsx`: remove `comingSoon` flag from ethnic entry
- `src/data/`: new `ethnic-zones.json` static GeoJSON asset
- `src/lib/`: new ethnic zone config (colors, labels, hatch params)
- Legend: new discrete entry in LEGEND_REGISTRY with 10 swatches

</code_context>

<specifics>
## Specific Ideas

- Mixed hatching in overlap zones (interleaved colored stripes) is a key visual requirement — Kirkuk area should show Kurdish + Turkmen + Arab stripes
- All 10 zones treated equally — Arabs/Persians rendered same as minorities, just bigger polygons
- Kurdish zone deliberately unified across 4 countries — ethnic identity crosses political borders
- Research published datasets before hand-drawing — accuracy matters ("detailed boundaries" requested)

</specifics>

<deferred>
## Deferred Ideas

- **Threat cluster hover/unhover bug** — after unhovering a threat cluster, highlight persists and other entities stay grayed out. Highlight should only persist if cluster is selected. Not Phase 25 scope — file as bug fix.
- **Southern Lebanon disputed zone** — deferred from Phase 24, still needs better boundary data
- **Hand-drawn polygons for groups not in dataset** — if published data misses Yazidi/Assyrian, defer to a future patch rather than hand-draw

</deferred>

---

*Phase: 25-ethnic-distribution-layer*
*Context gathered: 2026-04-02*
