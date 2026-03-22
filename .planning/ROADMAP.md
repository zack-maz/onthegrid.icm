# Roadmap: Iran Conflict Monitor

## Milestones

- ✅ **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- ✅ **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- 🚧 **v1.1 Intelligence Layer** -- Phases 15-20 (in progress)

## Phases

<details>
<summary>✅ v0.9 MVP (Phases 1-12) -- SHIPPED 2026-03-19</summary>

- [x] Phase 1: Project Scaffolding & Theme (1/1 plans) -- completed 2026-03-14
- [x] Phase 2: Base Map (3/3 plans) -- completed 2026-03-14
- [x] Phase 3: API Proxy (3/3 plans) -- completed 2026-03-15
- [x] Phase 4: Flight Data Feed (2/2 plans) -- completed 2026-03-15
- [x] Phase 5: Entity Rendering (2/2 plans) -- completed 2026-03-16
- [x] Phase 6: ADS-B Exchange Data Source (2/3 plans) -- completed 2026-03-16
- [x] Phase 7: adsb.lol Data Source (2/2 plans) -- completed 2026-03-16
- [x] Phase 8: Ship & Conflict Data Feeds (1/2 plans) -- completed 2026-03-17
- [x] Phase 8.1: GDELT Event Source (2/2 plans) -- completed 2026-03-17
- [x] Phase 9: Layer Controls & News Toggle (1/2 plans) -- completed 2026-03-17
- [x] Phase 10: Detail Panel (2/2 plans) -- completed 2026-03-18
- [x] Phase 11: Smart Filters (3/3 plans) -- completed 2026-03-18
- [x] Phase 12: Analytics Dashboard (1/1 plans) -- completed 2026-03-19

</details>

<details>
<summary>✅ v1.0 Deployment (Phases 13-14) -- SHIPPED 2026-03-20</summary>

- [x] Phase 13: Serverless Cache Migration (4/4 plans) -- completed 2026-03-20
- [x] Phase 14: Vercel Deployment (2/2 plans) -- completed 2026-03-20

</details>

### v1.1 Intelligence Layer (Phases 15-20)

- [x] **Phase 15: Key Sites Overlay** - Infrastructure sites (nuclear, naval, oil, airbase, dam, port) on the map with per-type toggles and click-to-inspect (completed 2026-03-20)
- [x] **Phase 16: News Feed** - Multi-source news pipeline (GDELT DOC + BBC RSS + Al Jazeera RSS) with conflict filtering and deduplication (completed 2026-03-20)
- [x] **Phase 17: Notification Center** - Severity-scored conflict notifications with proximity alerts, news matching, and 24h event default (completed 2026-03-20)
- [x] **Phase 18: Oil Markets Tracker** - Oil/energy price panel (Brent, WTI, XLE, USO, XOM) with sparkline trends (completed 2026-03-21)
- [x] **Phase 19: Search, Filter & UI Cleanup** - Global search bar, Reset All, grouped filter sections, visual hierarchy (completed 2026-03-22)
- [ ] **Phase 20: Production Review & Deploy Sync** - Full verification, integration testing, Vercel deployment, git tag v1.1

## Phase Details

### Phase 15: Key Sites Overlay
**Goal**: Users can see and inspect key infrastructure sites across the Greater Middle East on the map
**Depends on**: Phase 14
**Requirements**: SITE-01, SITE-02, SITE-03
**Success Criteria** (what must be TRUE):
  1. User can see distinct icons for each site type (nuclear, naval, oil refinery, airbase, dam, port) on the map at their real-world positions
  2. User can toggle site visibility with a parent toggle and 6 individual sub-toggles per site type
  3. User can click any site marker and see its details (name, type, coordinates, operator, OSM link) in the detail panel
  4. Sites persist across page reloads without re-fetching (24h cache)
**Plans:** 2/2 plans complete
Plans:
- [ ] 15-01-PLAN.md -- Server data pipeline: SiteEntity types, Overpass adapter, /api/sites route with 24h Redis cache, siteStore, useSiteFetch hook
- [ ] 15-02-PLAN.md -- Client rendering: icon atlas extension, site IconLayer with attack coloring, toggle controls, tooltip, SiteDetail panel

### Phase 16: News Feed
**Goal**: System silently aggregates conflict-relevant news from three sources into a unified, deduplicated feed for downstream consumption
**Depends on**: Phase 15
**Requirements**: NEWS-01, NEWS-02, NEWS-03
**Success Criteria** (what must be TRUE):
  1. Server endpoint returns news articles merged from GDELT DOC API, BBC RSS, and Al Jazeera RSS
  2. Non-conflict articles are filtered out by keyword whitelist (Iran, Israel, airstrike, military, etc.)
  3. Duplicate articles (same URL across sources) appear only once in the feed
**Plans:** 3/3 plans complete
Plans:
- [x] 16-01-PLAN.md -- Server pipeline: NewsArticle/NewsCluster types, GDELT DOC adapter, RSS adapter, keyword filter, dedup/clustering, cache-first /api/news route
- [x] 16-02-PLAN.md -- Client integration: newsStore, useNewsPolling hook, AppShell wiring
- [ ] 16-03-PLAN.md -- Gap closure: add sourceCountry metadata to articles, filter GDELT to English-only

### Phase 17: Notification Center
**Goal**: Users receive proactive, severity-ranked intelligence alerts about conflict events, proximity threats, and correlated news
**Depends on**: Phase 15, Phase 16
**Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05
**Success Criteria** (what must be TRUE):
  1. User sees a bell icon in the top-right corner with a badge showing unread notification count
  2. User can open a notification drawer showing conflict events ranked by severity score (type weight x log mentions x log sources x recency decay)
  3. Each notification card shows 1-3 matched news headlines from the news feed (temporal + geographic/keyword matching)
  4. User receives proximity alerts when tracked flights or ships approach key sites within 50km
  5. Map shows only the last 24 hours of conflict events by default when no custom date filter is active
**Plans:** 4/4 plans complete
Plans:
- [x] 17-01-PLAN.md -- Data layer: GDELT numMentions/numSources extension, severity scoring, news matching, time grouping libs
- [x] 17-02-PLAN.md -- 24h default event window in useFilteredEntities with "Showing last 24h" label
- [x] 17-03-PLAN.md -- Notification UI: store, bell icon, dropdown drawer, time-grouped event cards with news matching
- [x] 17-04-PLAN.md -- Proximity alerts: useProximityAlerts hook, map overlay with expand/collapse warning icons

### Phase 18: Oil Markets Tracker
**Goal**: Users can monitor oil and energy market prices alongside conflict data to draw their own correlations
**Depends on**: Phase 14 (no dependency on 15-17)
**Requirements**: MRKT-01, MRKT-02, MRKT-03
**Success Criteria** (what must be TRUE):
  1. User can see current prices for Brent Crude, WTI Crude, XLE, USO, and XOM in a collapsible overlay panel
  2. Each instrument shows a 5-day sparkline trend chart with green (up) or red (down) color coding
  3. Price changes trigger green delta animations matching the existing counter animation pattern
**Plans:** 2/2 plans complete
Plans:
- [ ] 18-01-PLAN.md -- Server pipeline: MarketQuote types, Yahoo Finance v8 adapter, cache-first /api/markets route with 5-min Redis cache
- [ ] 18-02-PLAN.md -- Client panel: marketStore, useMarketPolling hook, Sparkline/ExpandedChart SVG components, MarketRow with delta animation, MarketsSlot overlay panel, AppShell wiring

### Phase 19: Search, Filter & UI Cleanup
**Goal**: Users can quickly find any entity and manage filters with a clean, organized interface
**Depends on**: Phase 15, Phase 16, Phase 17, Phase 18
**Requirements**: SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):
  1. User can press Cmd+K to open a global search bar, type a query, and see fuzzy-matched results across all entity types (flights, ships, events, sites)
  2. User can select a search result and the map flies to that entity with the detail panel opening
  3. User can reset all active filters (date range, proximity, nationality, speed, altitude) with a single "Reset All" button
  4. Filter panel displays grouped sections with scrollable layer toggles and clear visual hierarchy
**Plans:** 4/4 plans complete
Plans:
- [x] 19-01-PLAN.md -- Layout shell: Topbar (title, status dropdown, search hint, notification bell) + Sidebar (icon strip, counters/layers/filters sections) + AppShell restructure
- [ ] 19-02-PLAN.md -- Search: searchStore, searchUtils, useSearchResults hook, Cmd+K SearchModal with grouped results and fly-to-entity
- [ ] 19-03-PLAN.md -- Search/filter unification: entity dimming in useEntityLayers, FilterChip, Escape key priority
- [ ] 19-04-PLAN.md -- Polish: draggable markets panel, ship color change to purple, visual consistency pass

### Phase 19.1: Advanced search with tag and entity type filtering (INSERTED)

**Goal:** Users can compose structured tag-based queries with boolean logic, autocomplete, and bidirectional sync between the search bar and sidebar filter controls
**Requirements**: ASRCH-01, ASRCH-02, ASRCH-03, ASRCH-04, ASRCH-05, ASRCH-06
**Depends on:** Phase 19
**Success Criteria** (what must be TRUE):
  1. User can type tag-based queries (e.g., `type:flight AND country:iran`) with full boolean expression support (AND/OR/NOT/parentheses)
  2. Tags are syntax-highlighted with per-prefix colors in the search input
  3. Two-stage autocomplete suggests tag prefixes then known values with counts from live entity data
  4. Search bar and sidebar filters sync bidirectionally (typing `type:flight` activates Flights toggle; toggling Flights ON adds `type:flight` to search)
  5. Clickable chips [Events] [Sites] [Iran] [US] above the input provide quick access to common queries
  6. Plain text queries still work as freeform substring search (backward compat with Phase 19)
**Plans:** 2/5 plans executed

Plans:
- [ ] 19.1-01-PLAN.md -- Core engine: query parser (tokenizer + recursive descent AST), evaluator (AST walker against entity data), serializer (AST to display string)
- [ ] 19.1-02-PLAN.md -- Tag registry: centralized vocabulary with metadata, value extractors, display colors for all ~25 tag prefixes
- [ ] 19.1-03-PLAN.md -- Data integration: extend searchStore with parsed AST, rewrite useSearchResults with evaluator, bidirectional useQuerySync hook
- [ ] 19.1-04-PLAN.md -- Search UI: TagChipRow, SyntaxOverlay, AutocompleteDropdown, CheatSheet components integrated into SearchModal
- [ ] 19.1-05-PLAN.md -- Wiring and verification: wire useQuerySync into AppShell, full integration test, visual checkpoint

### Phase 19.2: Counter Entity Dropdowns (INSERTED)

**Goal:** Each counter row in the Counters panel expands to list individual entities, with click-to-fly-to and detail panel integration
**Requirements**: CNTR-01, CNTR-02, CNTR-03, CNTR-04, CNTR-05, CNTR-06
**Depends on:** Phase 19
**Success Criteria** (what must be TRUE):
  1. User can click any counter row to expand a dropdown showing individual entities with label + key metric
  2. Only one counter row can be expanded at a time (accordion)
  3. Clicking an entity flies the map to it and opens the detail panel
  4. Entities sorted by proximity per category
  5. Zero-count rows are disabled; dropdown shows empty state if count drops to 0
  6. Overflow lists show scrollable container with "Showing X-Y of Z" range indicator
**Plans:** 2/2 plans complete

Plans:
- [ ] 19.2-01-PLAN.md -- Data layer: extend useCounterData to return entity arrays with proximity sorting, create EntityListItem component
- [ ] 19.2-02-PLAN.md -- UI layer: refactor CounterRow with expand/collapse dropdown, accordion in CountersContent, fly-to wiring, scroll range indicator

### Phase 20: Production Review & Deploy Sync
**Goal**: v1.1 is verified end-to-end and deployed to production
**Depends on**: Phase 19
**Requirements**: None (verification phase)
**Success Criteria** (what must be TRUE):
  1. All v1.1 features function correctly together in the deployed Vercel environment
  2. All overlay panels (notifications, markets, counters, toggles, detail, search) coexist without z-index or layout conflicts
  3. Redis command budget remains within free-tier limits under normal usage
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 15 -> 16 -> 17 -> 18 -> 19 -> 20

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Project Scaffolding & Theme | v0.9 | 1/1 | Complete | 2026-03-14 |
| 2. Base Map | v0.9 | 3/3 | Complete | 2026-03-14 |
| 3. API Proxy | v0.9 | 3/3 | Complete | 2026-03-15 |
| 4. Flight Data Feed | v0.9 | 2/2 | Complete | 2026-03-15 |
| 5. Entity Rendering | v0.9 | 2/2 | Complete | 2026-03-16 |
| 6. ADS-B Exchange Data Source | v0.9 | 2/3 | Complete | 2026-03-16 |
| 7. adsb.lol Data Source | v0.9 | 2/2 | Complete | 2026-03-16 |
| 8. Ship & Conflict Data Feeds | v0.9 | 1/2 | Complete | 2026-03-17 |
| 8.1. GDELT Event Source | v0.9 | 2/2 | Complete | 2026-03-17 |
| 9. Layer Controls & News Toggle | v0.9 | 1/2 | Complete | 2026-03-17 |
| 10. Detail Panel | v0.9 | 2/2 | Complete | 2026-03-18 |
| 11. Smart Filters | v0.9 | 3/3 | Complete | 2026-03-18 |
| 12. Analytics Dashboard | v0.9 | 1/1 | Complete | 2026-03-19 |
| 13. Serverless Cache Migration | v1.0 | 4/4 | Complete | 2026-03-20 |
| 14. Vercel Deployment | v1.0 | 2/2 | Complete | 2026-03-20 |
| 15. Key Sites Overlay | 2/2 | Complete    | 2026-03-20 | - |
| 16. News Feed | 3/3 | Complete    | 2026-03-20 | - |
| 17. Notification Center | 4/4 | Complete    | 2026-03-20 | - |
| 18. Oil Markets Tracker | 2/2 | Complete    | 2026-03-21 | - |
| 19. Search, Filter & UI Cleanup | 4/4 | Complete    | 2026-03-22 | - |
| 19.1. Advanced Search | 2/5 | In Progress|  | - |
| 19.2. Counter Entity Dropdowns | 2/2 | Complete    | 2026-03-22 | - |
| 20. Production Review & Deploy Sync | v1.1 | 0/TBD | Not started | - |
