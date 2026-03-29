---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Intelligence Layer
status: executing
stopped_at: Completed 21.3-01-PLAN.md
last_updated: "2026-03-29T17:48:01.255Z"
last_activity: 2026-03-29 -- Completed Phase 21.3 Plan 01 (load test scripts)
progress:
  total_phases: 17
  completed_phases: 12
  total_plans: 40
  completed_plans: 38
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 21.3 Multi-User Load Testing -- In Progress

## Current Position

Phase: 21.3 (Multi-User Load Testing)
Plan: 01 of 02 complete
Status: In Progress
Last activity: 2026-03-29 -- Completed Phase 21.3 Plan 01 (load test scripts)

Progress: [██████████] 96%

## Performance Metrics

**Velocity:**
- Total plans completed: 9 (v1.1)
- Average duration: 5min
- Total execution time: 45min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 15 | 2/2 | 15min | 7.5min |
| 16 | 3/3 | 12min | 4min |
| 17 | 4/4 | 13min | 3.25min |
| 18 | 2/2 | 4min | 2min |
| 19 | 4/4 | 29min | 7.25min |

*Updated after each plan completion*
| Phase 17 P01 | 3min | 1 tasks | 8 files |
| Phase 17 P03 | 6min | 2 tasks | 9 files |
| Phase 17 P04 | 4min | 2 tasks | 4 files |
| Phase 18 P01 | 2min | 2 tasks | 6 files |
| Phase 18 P02 | 2min | 2 tasks | 7 files |
| Phase 19 P01 | 6min | 2 tasks | 13 files |
| Phase 19 P02 | 5min | 2 tasks | 10 files |
| Phase 19 P03 | 7min | 2 tasks | 13 files |
| Phase 19 P04 | 11min | 2 tasks | 6 files |
| Phase 19.2 P01 | 4min | 2 tasks | 4 files |
| Phase 19.1 P02 | 3min | 1 tasks | 2 files |
| Phase 19.1 P01 | 5min | 3 tasks | 6 files |
| Phase 19.2 P02 | 4min | 2 tasks | 4 files |
| Phase 19.1 P04 | 4min | 2 tasks | 6 files |
| Phase 19.1 P03 | 5min | 2 tasks | 5 files |
| Phase 20 P01 | 6min | 2 tasks | 7 files |
| Phase 20 P02 | 4min | 2 tasks | 6 files |
| Phase 20 P03 | 7min | 2 tasks | 10 files |
| Phase 20.1 P02 | 3min | 2 tasks | 10 files |
| Phase 20.1 P01 | 3min | 2 tasks | 7 files |
| Phase 20.1 P03 | 6min | 2 tasks | 16 files |
| Phase 20.2 P01 | 10min | 2 tasks | 4 files |
| Phase 20.3 P01 | 7min | 2 tasks | 5 files |
| Phase 21 P03 | 3min | 2 tasks | 4 files |
| Phase 21 P01 | 6min | 2 tasks | 14 files |
| Phase 21 P02 | 8min | 2 tasks | 17 files |
| Phase 21 P04 | 47min | 2 tasks | 29 files |
| Phase 21 P05 | 5min | 2 tasks | 6 files |
| Phase 21.1 P01 | 7min | 2 tasks | 7 files |
| Phase 21.1 P02 | 4min | 2 tasks | 4 files |
| Phase 21.2 P01 | 11min | 2 tasks | 6 files |
| Phase 21.2 P02 | 4min | 2 tasks | 4 files |
| Phase 21.3 P01 | 2min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

- **15-01:** SiteEntity separate from MapEntity union (static reference data, different lifecycle)
- **15-01:** Single fetch on mount via useSiteFetch (no polling -- sites are static infrastructure)
- **15-01:** SiteConnectionStatus includes 'idle' state for pre-fetch (unlike polling stores)
- **15-01:** Overpass QL union query fetches all 6 site types in one request with fallback URL
- **15-02:** SiteEntity types widened throughout UI (MapEntity | SiteEntity) rather than adding to MapEntity union
- **15-02:** Attack status computed client-side with coarse bbox pre-filter + haversine
- **15-02:** Site toggles NOT suppressed during custom date range mode (static reference data)
- **15-02:** Glow/highlight layers widened to AnyEntity type alias for clean SiteEntity support
- **16-01:** GDELT DOC 2.0 ArtList mode with 250 maxrecords and 24h timespan for article discovery
- **16-01:** Jaccard similarity threshold 0.8 with 5-token minimum for fuzzy title clustering
- **16-01:** 7-day sliding window for news retention, 15-min cache TTL matching GDELT update frequency
- **16-02:** newsStore ConnectionStatus defined locally (same type as eventStore) to avoid cross-store coupling
- **16-02:** articleCount derived field sums articles across all clusters for aggregate stats
- **16-02:** 15-min polling interval matches GDELT DOC update frequency and server cache TTL
- **16-03:** GDELT sourcelang:english appended as inline query modifier (not separate param)
- **16-03:** RSS country mapping uses static config per feed (not runtime detection)
- **17-01:** numMentions/numSources as optional ConflictEventEntity.data fields (backward compat)
- **17-01:** Severity formula: typeWeight * log2(1+mentions) * log2(1+sources) * recencyDecay (~24h half-life)
- **17-01:** News matching uses 3-signal relevance: temporal (24h), geographic (100km haversine), keyword overlap
- **17-01:** parseInt || undefined for GDELT fields to distinguish missing from zero
- **17-02:** isDefaultWindowActive is a pure derived getter (dateStart===null && dateEnd===null, no new stored state)
- **17-02:** 24h window applies to both events AND news clusters (per locked decision scope)
- **17-02:** useFilteredEntities return type extended to include clusters (backward-compatible)
- **17-03:** FlyToHandler as null-rendering child of Map (uses useMap hook) for notification fly-to
- **17-03:** NotificationBell absolute positioning with detail panel offset matching FilterPanelSlot pattern
- **17-03:** readIds persisted to localStorage as JSON array, loaded on store init with try/catch safety
- **17-03:** markRead is idempotent (no-op if already read, prevents double-decrement)
- **17-04:** Pure computeProximityAlerts function exported separately from hook for testability
- **17-04:** HTML overlay via map.project() chosen over deck.gl layer for easy expand/collapse with React state
- **17-04:** RAF-throttled move event subscription prevents excessive re-renders during pan/zoom
- **17-04:** Coarse 0.5 degree bbox pre-filter reuses attackStatus.ts pattern at 50km scale

- **18-01:** Yahoo Finance v8 chart API with User-Agent header for bot detection avoidance
- **18-01:** Per-ticker fault isolation via Promise.allSettled (0-5 partial results)
- **18-01:** 5-min logical cache TTL matching planned client polling interval
- **18-01:** MarketQuote re-exported from src/types/entities.ts for frontend consumption
- **18-02:** ConnectionStatus defined locally in marketStore (same pattern as newsStore, no cross-store coupling)
- **18-02:** Delta animation reuses existing animate-delta CSS class from CounterRow (no new CSS)
- **18-02:** MarketsSlot positioned at top-14 below NotificationBell with detail-panel-aware right offset
- **18-02:** Accordion expand uses CSS max-height transition (0 to 160px) for smooth animation

- **19-01:** NotificationBell moved from absolute positioning to topbar flex layout
- **19-01:** LayerTogglesContent and FilterPanelContent extracted as separate exports for sidebar reuse
- **19-01:** Iranian flights counter row removed per locked decision
- **19-01:** Sidebar overlays map with absolute positioning (does not resize map)
- **19-01:** Icon strip always visible; content panel slides with translate-x transition
- **19-01:** StatusDropdown shows aggregate health dot plus per-source breakdown in dropdown
- **19-02:** useSearchResults uses useRef for entity arrays to avoid recomputing on every poll cycle
- **19-02:** SearchModal rendered inside Topbar; closeSearchModal preserves query for re-open
- **19-02:** filterStore.clearAll extended to also call searchStore.clearSearch (Reset All clears search)
- **19-03:** SEARCH_DIM_ALPHA=15 for near-invisible non-matching entities (distinct from DIM_ALPHA=40)
- **19-03:** Centralized useEscapeKeyHandler replaces per-component Escape listeners for conflict-free priority
- **19-03:** Glow/highlight layers hidden for non-matched entities during search filter
- **19-03:** Tooltip suppression for non-matching entities via searchStore state check in BaseMap
- **19-04:** useDraggable hook: pointer-events drag with setPointerCapture, viewport clamping, localStorage persistence
- **19-04:** Tooltip #9ca3af color kept as-is (generic type label color, not ship-specific identity)
- **19-04:** clampPosition exported as pure helper for independent unit testing without pointer event simulation

- **19.2-01:** Backward-compatible return type via spread: { ...countValues, entities } preserves existing .airstrikes etc access
- **19.2-01:** CounterEntity normalized shape with id/label/metric/lat/lng/type avoids leaking raw entity types to UI
- **19.2-01:** Hit sites sorted by attackCount descending (not proximity) since attack frequency is more actionable
- [Phase 19.1-02]: Tag registry uses Tailwind text color classes for direct className usage in syntax highlighting
- [Phase 19.1-02]: Squawk prefix registered but no-op (data not in FlightEntity model yet)
- [Phase 19.1-02]: Value extractors sort by frequency descending for autocomplete relevance
- [Phase 19.1]: QueryNode uses 5-variant discriminated union (tag, text, and, or, not) for type-safe AST
- [Phase 19.1]: Implicit AND display in serializer (space-separated) for natural query readability
- [Phase 19.1]: Haversine inlined in evaluator rather than importing from attackStatus.ts (avoid circular)
- [Phase 19.1]: Evaluator supports 22 tag prefixes with range operators (6 forms) and temporal parsing (relative + absolute)
- [Phase 19.2]: Entire counter row is click target (button element) for expand/collapse, not just the chevron
- [Phase 19.2]: Dropdown stays open after entity click for quick jumping between entities
- [Phase 19.2]: Ref-based scroll range indicator avoids setState re-render cascade on scroll
- [Phase 19.2]: CountersSlot marked deprecated (dead code) but kept synced for test coverage
- [Phase 19.2]: Ships count derived from entities.ships.length (no separate counter field)
- [Phase 19.1]: Transparent input overlay pattern: text-transparent + caret-white input over SyntaxOverlay div
- [Phase 19.1]: Autocomplete debounced at 100ms with entity data pre-computed via useMemo
- [Phase 19.1]: Escape key priority stack: cheat sheet > autocomplete > modal close
- [Phase 19.1]: Triple-ref pattern (syncSourceRef + prevQueryRef + prevTogglesRef) for bidirectional sync loop prevention
- [Phase 19.1]: Text-only queries don't alter sidebar toggles; sidebar sync only fires with non-empty query
- [Phase 19.1]: buildASTFromToggles uses first type value per group for concise query serialization

- [Phase 20-02]: LayerToggleRow wrapper component prevents hooks-in-loop violation when iterating LAYER_CONFIGS
- [Phase 20-02]: VisibilityButton component file kept as dead code (not deleted) since tests may import it
- [Phase 20-02]: Sites section removed entirely from FilterPanelSlot (no filter controls remain for sites)
- [Phase 20-01]: readBool kept in uiStore for isMarketsCollapsed persistence (only remaining localStorage usage)
- [Phase 20-01]: Pulse animation always active (no pulseEnabled toggle) since unidentified flights always render
- [Phase 20-01]: CONFLICT_TOGGLE_GROUPS keys preserved as event type grouping constants (structural, not visibility)
- [Phase 20-01]: buildASTFromToggles renamed to buildASTFromFilters to reflect new filter-only scope
- [Phase 20-01]: SyncableState stripped of all 15 toggle fields, keeping only filter fields
- [Phase 20]: Removed 717 lines of toggle-related test code across 8 files (net -717 LOC)
- [Phase 20]: LayerToggles test fully rewritten for 6 visualization layers via layerStore (not patched)
- [Phase 20]: StatusPanel gets unconditional count tests replacing 9 toggle-gated zero-count tests
- [Phase 20.1-02]: color-relief layer uses type assertion for react-maplibre type gap
- [Phase 20.1-02]: contour protocol registered once via module-level initialized guard (idempotent)
- [Phase 20.1-02]: elevation legend registered via LEGEND_REGISTRY.push at module scope (first consumer of registry pattern)
- [Phase 20.1-01]: 2-band latitude split at lat 28 keeps each Open-Meteo request under 574 locations
- [Phase 20.1-01]: Promise.all for parallel band fetching to minimize weather data latency
- [Phase 20.1-01]: 30-min weather cache TTL matches Open-Meteo hourly update frequency with margin
- [Phase 20.1]: Wind barb SVG pre-cached for 0-100 knots in 5-knot steps using Map<number, string> for O(1) lookup
- [Phase 20.1]: Weather picker uses invisible ScatterplotLayer (50km radius) for tooltip picking separate from heatmap
- [Phase 20.1]: Wind barbs filtered to 3-degree spacing via lat/lng modulo for clean visual density
- [Phase 20.1]: Weather tooltip shows dual-unit temperature (C/F) and compass direction matching EntityTooltip style
- [Phase 20.2]: Exponential decay with 6h half-life for threat weight (distinct from severity.ts rational decay)
- [Phase 20.2]: Date range filtering uses filterStore dateStart/dateEnd (always numbers, not nullable)
- [Phase 20.2]: Layer stacking: threat below weather below entities in DeckGLOverlay
- [Phase 20.2]: Tooltip priority: entity > threat > weather

- [Phase 20.3]: Egypt placed US-aligned per Camp David Accords / US military aid
- [Phase 20.3]: ADM0_A3 as primary lookup key (not ISO_A3) since some countries have -99 for ISO_A3
- [Phase 20.3]: Natural Earth 110m coordinates rounded to 2dp for bundle size reduction (51KB)
- [Phase 20.3]: Canvas-generated fill patterns via createHatchPattern/createDualHatchPattern returning ImageData
- [Phase 20.3]: Discrete-swatch legend mode: LegendConfig.mode='discrete' renders colored dots with labels
- [Phase 21]: Three vendor chunks (react, maplibre, deckgl) for independent browser cache invalidation
- [Phase 21]: Vercel Analytics and SpeedInsights rendered as App-level siblings (no-op in dev/test)
- [Phase 21]: createRateLimiter factory pattern for per-endpoint rate limit configuration
- [Phase 21]: Helmet CSP whitelists map tiles, Vercel analytics, Open-Meteo, ArcGIS, CARTO domains
- [Phase 21]: max-age=0 with s-maxage for CDN-only caching (browser always revalidates)
- [Phase 21]: Module-level Map as memCache fallback (bounded by polling source count, not LRU)
- [Phase 21]: cacheGetSafe/cacheSetSafe as additive exports (backward compat with existing cacheGet/cacheSet)
- [Phase 21]: degraded flag tracked per-store (flight/ship/event) rather than global UI flag
- [Phase 21]: All 7 data routes use cacheGetSafe/cacheSetSafe; health route keeps cacheGet (diagnostic)
- [Phase 21]: isMainModule console.log preserved (local dev only, not serverless)
- [Phase 21-05]: Cron schedule set to daily (0 0 * * *) for Vercel Hobby plan (one daily invocation limit)
- [Phase 21-05]: Smoke test checks /api/sources for {sources: object} shape (not {data: array})
- [Phase 21-05]: CDN cache header check accepts Cache-Control or CDN-Cache-Control (Vercel edge variation)

- [Phase 21.1-01]: compromise NLP library chosen: self-contained (~250KB), pattern matching syntax, no model download
- [Phase 21.1-01]: 3-factor additive scoring: triple completeness (0-0.45), negativity/conflict verbs (0-0.35), source reliability (0-0.20)
- [Phase 21.1-01]: Source reliability 4-tier: major international (1.0), regional quality (0.9-0.95), state-affiliated (0.8), unknown GDELT (0.6)
- [Phase 21.1-01]: 24 conflict verbs with compromise root normalization for negativity detection
- [Phase 21.1-01]: 50+ exclusion patterns across 7 categories (historical, entertainment, sports, education, tech, weather, existing)

- [Phase 21.1-02]: Keyword reclassification: only 7 non-ambiguous terms (airstrike, missile, bombing, shelling, casualties, invasion, drone); all others ambiguous
- [Phase 21.1-02]: Dual gate: articles must pass BOTH keyword match (>= 1 non-ambiguous) AND relevance score (>= 0.7)
- [Phase 21.1-02]: filterConflictArticles preserved as deprecated backward-compat export delegating to filterAndScoreArticles
- [Phase 21.1-02]: Exclusion patterns imported from relevanceScorer (single source of truth) instead of duplicated in newsFilter
- [Phase 21.2]: eventConfidenceThreshold default 0.35 per user decision (not spec's 0.15)
- [Phase 21.2]: 42 city centroids (30 major + 12 conflict hotspots) for centroid detection
- [Phase 21.2]: FIPS contradiction check only applies when last segment starts uppercase with no digits
- [Phase 21.2]: Goldstein consistency signal uses linear decay over 6 points outside ceiling range
- [Phase 21.2]: 5-signal weighted confidence scoring: media(0.30), sources(0.20), actors(0.20), geo(0.15), goldstein(0.15)
- [Phase 21.2]: Phase A/B pipeline architecture: geo cross-validation before actor checks, then normalize/score/threshold
- [Phase 21.3]: k6 scenarios use ramping-vus executor with shared ramp-up stages across all polling scenarios
- [Phase 21.3]: 429 responses tracked via custom Counter metric (not counted as errors) since all VUs share one IP
- [Phase 21.3]: Slow-poll endpoints fire once per VU then sleep for test duration (15-30min intervals exceed 5-min test window)

### Roadmap Evolution

- Phase 19.1 inserted after Phase 19: Advanced search with tag and entity type filtering (URGENT)

Decisions are logged in PROJECT.md Key Decisions table.
Full v0.9 + v1.0 decision history archived in previous STATE.md.

### Pending Todos

None.

### Blockers/Concerns

- Overpass API rate limits may require caching strategy (mitigated: 24h cache + split queries)
- Yahoo Finance v8 chart API is unofficial (mitigated: graceful degradation + provider interface)
- GDELT DOC API noise filtering must be tuned for conflict relevance
- Redis command budget at ~92% capacity after 6 polling sources (monitor during Phase 18)

## Session Continuity

Last session: 2026-03-29T17:48:01.251Z
Stopped at: Completed 21.3-01-PLAN.md
Resume file: None
