# Phase 24: Political Boundaries Layer - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Toggleable political overlay showing country borders color-coded by alliance/faction alignment (US-aligned, Iran-aligned, neutral). Includes disputed territory hatching for contested zones. Non-interactive background layer with a discrete faction legend.

</domain>

<decisions>
## Implementation Decisions

### Faction Assignments
- 3-tier model: US-aligned, Iran-aligned, Neutral
- US-aligned (blue): Israel, Saudi Arabia, UAE, Bahrain, Jordan, Kuwait, Egypt
- Iran-aligned (red): Iran, Syria, Yemen
- Neutral (gray): Turkey, Qatar, Oman, Pakistan, Afghanistan, Iraq, Lebanon, Turkmenistan, Azerbaijan, Armenia, Georgia + all others in region
- Faction data stored in a separate TypeScript `Record<string, Faction>` keyed by ISO A3 code — not baked into GeoJSON properties

### Data Delivery
- Natural Earth 110m country polygons (~50KB after simplification)
- Static bundle: TypeScript import as .json module (Vite handles natively), not runtime fetch
- Middle East countries only (within IRAN_BBOX region)
- Join key: ISO A3 codes (IRN, ISR, SAU, etc.) from Natural Earth `ISO_A3` property

### Visual Presentation
- Fill opacity: very subtle ~15% — tinted wash, map details show through
- Faction colors (muted military palette):
  - US-aligned: steel blue `#3b82f6`
  - Iran-aligned: muted red `#dc2626`
  - Neutral: slate `#64748b`
- Borders: faction-colored, thin (1px), ~60% opacity — reinforces faction identity at boundaries
- Non-interactive: no hover, no click, no tooltips on country polygons (entity tooltips remain primary interaction)

### Disputed Territories
- 3 disputed zones with diagonal line hatching in yellow/amber: West Bank, Golan Heights, Gaza
- Southern Lebanon deferred (no authoritative polygon source; UNIFIL zone doesn't map to a single boundary)
- Data source: Natural Earth `ne_10m_admin_0_disputed_areas.geojson` — public domain, deterministic, version-pinned
  - Filter by `NAME` property: "Gaza", "West Bank", "Golan Heights"
  - One-time extraction at dev time, baked into static repo asset
- Hover exception: disputed zones show label (zone name) on hover — only interactive element in the political layer

### Legend & Toggle Behavior
- Discrete swatch legend in bottom-left corner, visible only when political layer is active
- 3 faction swatches (blue/red/gray) + 1 hatched swatch for disputed territories
- Layer stacking: below all other visualization layers (geographic, weather, threat) and all entity markers — background context only. May adjust during visual testing.
- Instant toggle (no fade transition)
- Remove `comingSoon: true` from the Political toggle row in LayerTogglesSlot as part of this phase

### Claude's Discretion
- Exact hatching pattern parameters (line spacing, angle, stroke width)
- Coordinate rounding/simplification strategy for the Natural Earth polygons
- Legend component layout and typography
- How to render the disputed territory hover label (tooltip vs inline label)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `layerStore.ts`: `political` already registered as `VisualizationLayerId`, toggle infrastructure exists
- `LayerTogglesSlot.tsx`: Political row exists with `comingSoon: true` — just remove the flag
- `GeographicOverlay.tsx`: Established pattern for visualization layers (Source + Layer as Map children, gated by `isActive` from layerStore)
- `@vis.gl/react-maplibre` Source/Layer components for declarative MapLibre layer rendering

### Established Patterns
- Visualization layers: React component renders null when `!isActive`, returns Source + Layer JSX when active
- Layer state: `useLayerStore(s => s.activeLayers.has('political'))` selector pattern
- Static data: GeoJSON imported as TypeScript module (Vite JSON import)
- Map children: overlay components rendered inside `<Map>` in BaseMap.tsx

### Integration Points
- `BaseMap.tsx`: new `<PoliticalOverlay />` component rendered as Map child
- `LayerTogglesSlot.tsx`: remove `comingSoon` flag from political entry
- `src/components/map/layers/`: new `PoliticalOverlay.tsx` alongside existing overlay files
- `src/data/`: new directory for static GeoJSON assets (country polygons, disputed territories)
- Legend component: new positioned element in the map overlay area (bottom-left)

</code_context>

<specifics>
## Specific Ideas

- Muted military palette chosen deliberately — "professional, not cartoonish"
- Yellow hatching for disputed territories to read as "contested" instantly
- Political layer is pure background context — never competes with entity data for attention
- Disputed zone hover labels are the one exception to the non-interactive rule

</specifics>

<deferred>
## Deferred Ideas

- Southern Lebanon / UNIFIL zone — needs better boundary data source; could revisit with OSM governorate union approach or manual polygon in a future patch
- Kurdish regions as a disputed territory — more relevant for Phase 25 (Ethnic Distribution Layer) since it's an ethnic-military factor, not a state boundary dispute

</deferred>

---

*Phase: 24-political-boundaries-layer*
*Context gathered: 2026-04-02*
