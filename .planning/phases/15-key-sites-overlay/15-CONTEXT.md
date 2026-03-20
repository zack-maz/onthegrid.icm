# Phase 15: Key Sites Overlay - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Display key infrastructure sites (nuclear, naval, oil refinery, airbase, dam, port) on the map at their real-world positions via Overpass API. Users can toggle visibility per type, hover for quick info, and click for full detail panel. Sites have dynamic attacked/healthy status based on proximity to conflict events since war start (Feb 28, 2026). Does NOT include proximity alerts (Phase 17) or search integration (Phase 19).

</domain>

<decisions>
## Implementation Decisions

### Site icons & visual style
- 6 new canvas-drawn symbolic silhouettes added to existing icon atlas: atom (nuclear), anchor (naval), oil derrick (oil), jet silhouette (airbase), water waves (dam), ship's helm wheel (port)
- Same mask-mode approach as existing icons — white shapes tinted via `getColor`
- Two-state color: green (#22c55e) for healthy sites, orange (#f97316) for attacked sites
- "Attacked" = any GDELT conflict event within ~2km radius of the site at any point since Feb 28, 2026 (WAR_START)
- Attack status is computed client-side from event store data, respects date range filter temporally (rewinding before an attack shows green)
- Attack status uses ALL backfilled events, not just the default 24h view
- Sizing: 4000m base, minPixels:12, maxPixels:80 — smaller than events, sites are reference points not active threats

### Toggle structure
- Parent "Sites" toggle + 6 indented sub-toggles (Nuclear, Naval, Oil, Airbase, Dam, Port)
- Positioned after Events (bottom of Layers panel)
- All ON by default
- Parent toggle behavior matches Events: turning ON restores all sub-toggles
- NOT suppressed during custom date range mode — sites are static reference data, always toggleable
- Toggle state persisted to localStorage following existing pattern

### Detail panel content
- **Hover tooltip**: site name, location in Iran (city/region), attack status with date if attacked
- **Click detail panel**: new SiteDetail component with full info
  - Name, site type, operator, coordinates (with copy button)
  - Minimap preview (embedded) with small "Open in OSM" button for full page in new tab
  - Attack history section: summary count + latest event by default, expandable dropdown for full event list
  - Clicking an event in the dropdown cross-links to that GDELT event (selects it on map, swaps to EventDetail)

### Data fetching & caching
- Single fetch on app load — GET /api/sites, no polling
- Server: 24h Redis cache (key: `sites:all`), cache miss queries Overpass API
- Single combined Overpass QL query with OR clauses for all 6 site types, scoped to Greater Middle East bbox
- Separate SiteEntity type and siteStore (not part of MapEntity discriminated union)
  - SiteType = `'nuclear' | 'naval' | 'oil' | 'airbase' | 'dam' | 'port'`
  - SiteEntity has: id (OSM ID), type: 'site', siteType, lat, lng, label, operator?, osmId
- useSelectedEntity extended to include siteStore lookup
- Own Deck.gl IconLayer, own detail component (SiteDetail)

### Claude's Discretion
- Exact Overpass QL tag queries per site type (researcher should identify correct OSM tags)
- Canvas drawing details for the 6 new icon shapes
- Minimap embed implementation approach (static image vs iframe vs MapLibre mini instance)
- Attack status computation optimization (spatial index vs brute force — likely fine with ~100-200 sites)
- Error/loading states for initial site fetch

</decisions>

<specifics>
## Specific Ideas

- Attack detection radius of ~2km chosen to match realistic facility footprint and GDELT geocoding accuracy
- Date range filter rewinds attack status temporally — filtering to before an attack happened shows the site as green/healthy
- Hover tooltip should show location context within Iran (city, region) not just coordinates
- Attack event dropdown in detail panel is a drill-down: site → attack list → click event → navigate to GDELT event on map

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/map/layers/icons.ts`: Canvas icon atlas (224x32, 7 shapes) — extend with 6 new site shapes
- `src/components/map/layers/constants.ts`: ENTITY_COLORS, ENTITY_DOT_COLORS, ICON_SIZE — add site entries
- `src/components/detail/DetailValue.tsx`: Reusable value cell with flash-on-change for detail panel
- `src/components/ui/OverlayPanel.tsx`: Panel wrapper used by LayerTogglesSlot
- `server/cache/redis.ts`: cacheGet/cacheSet with CacheEntry<T> pattern — reuse for 24h site cache

### Established Patterns
- Zustand curried `create<T>()()` pattern for new siteStore
- LayerToggles interface + localStorage persistence + LAYER_TOGGLE_DEFAULTS for new site toggles
- ToggleRow component in LayerTogglesSlot for consistent toggle rendering
- IconLayer per entity category with mask mode, getColor tinting, activeId dimming
- useSelectedEntity cross-store lookup — needs siteStore added
- DetailPanelSlot per-type routing (FlightDetail/ShipDetail/EventDetail → add SiteDetail)

### Integration Points
- `server/types.ts`: New SiteEntity type (separate from MapEntity union)
- `server/adapters/`: New overpass.ts adapter
- `server/routes/`: New sites.ts route
- `src/stores/`: New siteStore.ts
- `src/types/ui.ts`: Add site toggle keys to LayerToggles interface
- `src/stores/uiStore.ts`: Add site toggle state and actions
- `src/components/layout/LayerTogglesSlot.tsx`: Add Sites toggle group after Events
- `src/hooks/useEntityLayers.ts`: Add site IconLayer(s)
- `src/hooks/useSelectedEntity.ts`: Add siteStore lookup
- `src/components/layout/DetailPanelSlot.tsx`: Add SiteDetail routing
- `src/components/map/layers/icons.ts`: Extend atlas canvas width, add 6 new icon drawings
- `src/components/layout/AppShell.tsx`: Add site fetch on mount

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-key-sites-overlay*
*Context gathered: 2026-03-20*
