# Roadmap: Iran Conflict Monitor

## Milestones

- ✅ **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- ✅ **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- ✅ **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- ✅ **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)

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

<details>
<summary>✅ v1.1 Intelligence Layer (Phases 15-19.2) -- SHIPPED 2026-03-22</summary>

- [x] Phase 15: Key Sites Overlay (2/2 plans) -- completed 2026-03-20
- [x] Phase 16: News Feed (3/3 plans) -- completed 2026-03-20
- [x] Phase 17: Notification Center (4/4 plans) -- completed 2026-03-20
- [x] Phase 18: Oil Markets Tracker (2/2 plans) -- completed 2026-03-21
- [x] Phase 19: Search, Filter & UI Cleanup (4/4 plans) -- completed 2026-03-22
- [x] Phase 19.1: Advanced Search (5/5 plans) -- completed 2026-03-22
- [x] Phase 19.2: Counter Entity Dropdowns (2/2 plans) -- completed 2026-03-22

</details>

<details>
<summary>✅ v1.2 Visualization & Hardening (Phases 20-21.3) -- SHIPPED 2026-03-29</summary>

- [x] Phase 20: Layer Purpose Refactor (3/3 plans) -- completed 2026-03-23
- [x] Phase 20.1: Geographical & Weather Layers (3/3 plans) -- completed 2026-03-23
- [x] Phase 20.2: Threat Heatmap Layer (1/1 plans) -- completed 2026-03-23
- [ ] Phase 20.3: Political Boundaries Layer -- deferred
- [ ] Phase 20.4: Satellite Imagery Layer -- deferred
- [ ] Phase 20.5: Infrastructure Focus Layer -- deferred
- [x] Phase 21: Production Review & Deploy Sync (5/5 plans) -- completed 2026-03-25
- [x] Phase 21.1: GDELT News Relevance Filtering (2/2 plans) -- completed 2026-03-26
- [x] Phase 21.2: GDELT Event Quality Pipeline (2/2 plans) -- completed 2026-03-28
- [x] Phase 21.3: Multi-User Load Testing (3/3 plans) -- completed 2026-03-29

</details>

## Phase Details

<details>
<summary>v1.1 Phase Details (Phases 15-19.2) — archived</summary>

### Phase 15: Key Sites Overlay
**Goal**: Users can see and inspect key infrastructure sites across the Greater Middle East on the map
**Plans:** 2/2 complete | **Requirements**: SITE-01, SITE-02, SITE-03

### Phase 16: News Feed
**Goal**: System silently aggregates conflict-relevant news from three sources into a unified, deduplicated feed for downstream consumption
**Plans:** 3/3 complete | **Requirements**: NEWS-01, NEWS-02, NEWS-03

### Phase 17: Notification Center
**Goal**: Users receive proactive, severity-ranked intelligence alerts about conflict events, proximity threats, and correlated news
**Plans:** 4/4 complete | **Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05

### Phase 18: Oil Markets Tracker
**Goal**: Users can monitor oil and energy market prices alongside conflict data to draw their own correlations
**Plans:** 2/2 complete | **Requirements**: MRKT-01, MRKT-02, MRKT-03

### Phase 19: Search, Filter & UI Cleanup
**Goal**: Users can quickly find any entity and manage filters with a clean, organized interface
**Plans:** 4/4 complete | **Requirements**: SRCH-01, SRCH-02, SRCH-03

### Phase 19.1: Advanced Search
**Goal**: Users can compose structured tag-based queries with boolean logic, autocomplete, and bidirectional sync
**Plans:** 5/5 complete | **Requirements**: ASRCH-01 through ASRCH-06

### Phase 19.2: Counter Entity Dropdowns
**Goal**: Each counter row expands to list individual entities with click-to-fly-to and detail panel integration
**Plans:** 2/2 complete | **Requirements**: CNTR-01 through CNTR-06

</details>

### Phase 20: Layer Purpose Refactor
**Goal**: Replace entity toggle system with stackable visualization layer architecture -- all entities always visible, layers become rendering overlays (geographic, weather, threat, etc.)
**Depends on**: Phase 19
**Requirements**: LREF-01, LREF-02, LREF-03, LREF-04, LREF-05
**Success Criteria** (what must be TRUE):
  1. All entities (flights, ships, events, sites) are always rendered on the map -- no visibility toggle state exists
  2. Sidebar "Layers" section shows 6 visualization layer toggles (geographic, weather, threat, political, satellite, infrastructure)
  3. A layerStore manages visualization layer on/off state with no localStorage persistence
  4. An inline legend framework renders in the bottom-left map corner when visualization layers are active
  5. Search/filter is the only way to narrow visible entity data
**Plans:** 3/3 plans complete

Plans:
- [ ] 20-01-PLAN.md -- State refactor: remove entity toggles from types/uiStore, create layerStore, simplify useEntityLayers/useCounterData/useProximityAlerts/useQuerySync
- [ ] 20-02-PLAN.md -- UI components: update BaseMap/StatusDropdown/FilterPanelSlot, replace LayerTogglesSlot content, build MapLegend framework
- [ ] 20-03-PLAN.md -- Test updates: update 8 existing test files, create layerStore.test.ts and MapLegend.test.tsx

### Phase 20.1: Geographical & Weather Layers (INSERTED)
**Goal**: Users can toggle a terrain elevation overlay and a real-time temperature heatmap as visualization layers on the map
**Depends on**: Phase 20
**Requirements**: LREF-01 (layer architecture)
**Success Criteria** (what must be TRUE):
  1. User can toggle a Geographical layer that renders monochrome elevation gradient tinting with contour lines using existing AWS Terrarium tiles
  2. User can toggle a Weather layer that renders a temperature heatmap from Open-Meteo API data
  3. Both layers have inline legends that appear/disappear with the toggle
  4. Server provides `/api/weather` endpoint with Redis-cached Open-Meteo data (30-60 min polling)
  5. Major geographic feature labels (Zagros Mountains, Dasht-e Kavir, etc.) appear when Geographical layer is active
**Plans:** 3/3 plans complete

Plans:
- [ ] 20.1-01-PLAN.md -- Server pipeline: WeatherGridPoint types, Open-Meteo adapter with 2-band request splitting, cache-first /api/weather route
- [ ] 20.1-02-PLAN.md -- Geographic overlay: color-relief elevation tinting, maplibre-contour contour lines, geographic feature labels, elevation legend
- [ ] 20.1-03-PLAN.md -- Weather overlay: weatherStore, useWeatherPolling, HeatmapLayer temperature heatmap, wind barb IconLayer, weather tooltip, temperature legend

### Phase 20.2: Threat Heatmap Layer (INSERTED)
**Goal**: Users can toggle a threat heatmap that color-codes regions by GDELT conflict event density
**Depends on**: Phase 20
**Requirements**: LREF-01 (layer architecture)
**Success Criteria** (what must be TRUE):
  1. User can toggle a Threat Heatmap layer that visualizes conflict event density across the map
  2. Hot zones glow red, quiet areas stay dark — uses existing GDELT event data (no new API)
  3. Inline legend shows density scale when layer is active
**Plans:** 1/1 plans complete

Plans:
- [ ] 20.2-01-PLAN.md -- ThreatHeatmapOverlay: severity-weighted HeatmapLayer with 6h recency decay, ScatterplotLayer picker grid for zone tooltips, BaseMap wiring with correct layer stacking and tooltip priority

### Phase 20.3: Political Boundaries Layer (INSERTED)
**Goal**: Users can toggle a political boundaries overlay that emphasizes country borders and faction alignment
**Depends on**: Phase 20
**Requirements**: LREF-01 (layer architecture)
**Success Criteria** (what must be TRUE):
  1. User can toggle a Political Boundaries layer that renders country borders and disputed territories
  2. Countries are color-coded by alliance/faction
  3. Inline legend shows faction color key when layer is active
**Plans:** 2 plans

Plans:
- [x] 20.3-01-PLAN.md -- Data and infrastructure: politicalData.ts (faction assignments, GeoJSON, disputed zones), politicalPatterns.ts (canvas hatching), MapLegend discrete-swatch extension, LayerTogglesSlot political toggle enabled
- [ ] 20.3-02-PLAN.md -- Overlay component and tests: PoliticalOverlay.tsx (fill layers, borders, disputed outlines), BaseMap wiring, test updates for LayerToggles/MapLegend/PoliticalOverlay

### Phase 20.4: Satellite Imagery Layer (INSERTED)
**Goal**: Users can toggle a satellite imagery overlay using ArcGIS World Imagery tiles
**Depends on**: Phase 20
**Requirements**: LREF-01 (layer architecture)
**Success Criteria** (what must be TRUE):
  1. User can toggle a Satellite Imagery layer that renders ArcGIS World Imagery as a semi-transparent overlay
  2. Overlay blends on top of Dark Matter basemap at fixed opacity
  3. Inline legend or label indicates satellite imagery source when layer is active
**Plans**: TBD

### Phase 20.5: Infrastructure Focus Layer (INSERTED)
**Goal**: Users can toggle an infrastructure focus mode that highlights key sites and dims other entities
**Depends on**: Phase 20
**Requirements**: LREF-01 (layer architecture)
**Success Criteria** (what must be TRUE):
  1. User can toggle an Infrastructure Focus layer that dims non-site entities
  2. Sites are highlighted with enhanced labels and visibility
  3. Provides an infrastructure-only "X-ray" view of the region
**Plans**: TBD

### Phase 21: Production Review & Deploy Sync
**Goal**: Harden the application for 1000+ concurrent users, comprehensive code polish, and deploy v1.2 to production
**Depends on**: Phase 20
**Requirements**: None (verification phase)
**Success Criteria** (what must be TRUE):
  1. All features function correctly together in the deployed Vercel environment
  2. All overlay panels coexist without z-index or layout conflicts
  3. Redis command budget remains within free-tier limits under normal usage
**Plans:** 4/5 plans executed

Plans:
- [ ] 21-01-PLAN.md -- Server middleware stack: helmet security, Cache-Control edge caching, per-endpoint rate limits, structured JSON logging
- [ ] 21-02-PLAN.md -- Redis resilience & health: in-memory fallback with degraded flag, rich /health endpoint with per-source timestamps and budget estimate
- [ ] 21-03-PLAN.md -- Bundle optimization & analytics: manualChunks vendor splitting, rollup-plugin-visualizer, @vercel/analytics, @vercel/speed-insights
- [ ] 21-04-PLAN.md -- Code polish: migrate routes to cacheGetSafe, replace console.log with structured logger, fix pre-existing test failures, full codebase audit
- [ ] 21-05-PLAN.md -- Deploy verification: smoke test script, cron health endpoint, env var audit, doc sync, production deploy with visual checkpoint

### Phase 21.1: GDELT News Relevance Filtering (INSERTED)

**Goal:** Reduce false positive conflict news by replacing binary keyword filter with NLP-based relevance scoring that extracts actor-action-target triples and assigns confidence scores
**Depends on:** Phase 16 (News Feed), Phase 21 (Production Review)
**Requirements**: None (quality improvement)
**Success Criteria** (what must be TRUE):
  1. Articles that mention a location (e.g., "Tehran") without describing a conflict event AT that location are filtered out or not geolocated there
  2. Keyword filter rejects articles where conflict terms appear only in passing context (e.g., "Tehran condemns attack in Yemen" does not mark Tehran)
  3. False positive rate for conflict news is meaningfully reduced compared to current keyword-only approach
**Plans:** 2/2 plans complete

Plans:
- [x] 21.1-01-PLAN.md -- Core engine: compromise NLP library, NewsArticle type extension, nlpExtractor (triple extraction), relevanceScorer (0-1 scoring), config threshold, unit tests
- [ ] 21.1-02-PLAN.md -- Integration: keyword reclassification (7 non-ambiguous, all others ambiguous), newsFilter overhaul with NLP scoring pipeline, news route wiring, test updates

### Phase 21.2: GDELT Event Quality Pipeline (INSERTED)

**Goal:** Improve GDELT event data accuracy with geo-validation (discard misplaced events, detect city centroids), expanded CAMEO classification, Goldstein sanity checks, and composite confidence scoring
**Depends on:** Phase 8.1 (GDELT Event Source), Phase 21 (Production Review)
**Requirements**: None (quality improvement)
**Success Criteria** (what must be TRUE):
  1. Events geocoded to non-Middle-East countries (e.g., NYC assassination pinned to Israel) are discarded via text-geo cross-validation
  2. Events at known city centroids are flagged with `geoPrecision: 'centroid'` for downstream use
  3. All CAMEO base codes in the 180-200 range have explicit ConflictEventType mappings (no silent fallthrough to generic types)
  4. Events with Goldstein scores inconsistent with their classified type are reclassified to a lower-severity type
  5. Each event carries a 0-1 `confidence` score based on media coverage, source diversity, actor specificity, geo precision, and Goldstein consistency
  6. Events below a configurable confidence threshold are discarded (default 0.35)
**Plans:** 2/2 plans complete

Plans:
- [ ] 21.2-01-PLAN.md -- Core engine: type extensions (geoPrecision, confidence), config (eventConfidenceThreshold), geoValidation module (isGeoValid, detectCentroid, city centroids), eventScoring module (computeEventConfidence, applyGoldsteinSanity), unit tests
- [ ] 21.2-02-PLAN.md -- Integration: refactor parseAndFilter into Phase A/B pipeline, wire geo-validation + scoring + threshold filter, expanded CAMEO verification, pipeline observability logging, EventDetail dev-mode confidence display, integration tests

### Phase 21.3: Multi-User Load Testing

**Goal:** Validate that the production deployment handles multiple concurrent users without degradation — test rate limiting, Redis connection pooling, Vercel cold starts, and client-side polling under real multi-user load
**Depends on:** Phase 21 (Production Review)
**Requirements**: None (testing/validation phase)
**Success Criteria** (what must be TRUE):
  1. Production handles N concurrent users without 5xx errors or rate limit exhaustion
  2. Redis command budget stays within free-tier limits under concurrent load
  3. Client polling from multiple tabs/browsers doesn't cause cascading failures
  4. Performance bottlenecks are identified and documented
**Plans:** 3/3 plans complete

Plans:
- [x] 21.3-01-PLAN.md -- Test authoring: k6 load test script (100 VUs, realistic polling patterns, custom metrics) + Playwright browser validation test
- [x] 21.3-02-PLAN.md -- Test execution: run k6 + Playwright against local server, analyze results, calibrate thresholds
- [x] 21.3-03-PLAN.md -- Gap closure: re-run k6 against production (not localhost), Playwright with 3 concurrent workers, pre-flight API smoke test

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
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
| 15. Key Sites Overlay | v1.1 | 2/2 | Complete | 2026-03-20 |
| 16. News Feed | v1.1 | 3/3 | Complete | 2026-03-20 |
| 17. Notification Center | v1.1 | 4/4 | Complete | 2026-03-20 |
| 18. Oil Markets Tracker | v1.1 | 2/2 | Complete | 2026-03-21 |
| 19. Search, Filter & UI Cleanup | v1.1 | 4/4 | Complete | 2026-03-22 |
| 19.1. Advanced Search | v1.1 | 5/5 | Complete | 2026-03-22 |
| 19.2. Counter Entity Dropdowns | v1.1 | 2/2 | Complete | 2026-03-22 |
| 20. Layer Purpose Refactor | v1.2 | 3/3 | Complete | 2026-03-23 |
| 20.1. Geographical & Weather Layers | v1.2 | 3/3 | Complete | 2026-03-23 |
| 20.2. Threat Heatmap Layer | v1.2 | 1/1 | Complete | 2026-03-23 |
| 20.3. Political Boundaries Layer | v1.2 | 1/2 | Deferred | - |
| 20.4. Satellite Imagery Layer | v1.2 | 0/0 | Deferred | - |
| 20.5. Infrastructure Focus Layer | v1.2 | 0/0 | Deferred | - |
| 21. Production Review & Deploy Sync | v1.2 | 5/5 | Complete | 2026-03-25 |
| 21.1. GDELT News Relevance Filtering | v1.2 | 2/2 | Complete | 2026-03-26 |
| 21.2. GDELT Event Quality Pipeline | v1.2 | 2/2 | Complete | 2026-03-28 |
| 21.3. Multi-User Load Testing | v1.2 | 3/3 | Complete | 2026-03-29 |
