# Roadmap: Iran Conflict Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- **v1.3 Data Quality & Layers** -- Phases 22-27 (active)

## Phase Summary

| Phase | Name | Milestone | Plans | Completed |
|-------|------|-----------|-------|-----------|
| 1 | Project Scaffolding & Theme | v0.9 | 1/1 | 2026-03-14 |
| 2 | Base Map | v0.9 | 3/3 | 2026-03-14 |
| 3 | API Proxy | v0.9 | 3/3 | 2026-03-15 |
| 4 | Flight Data Feed | v0.9 | 2/2 | 2026-03-15 |
| 5 | Entity Rendering | v0.9 | 2/2 | 2026-03-16 |
| 6 | ADS-B Exchange Data Source | v0.9 | 2/3 | 2026-03-16 |
| 7 | adsb.lol Data Source | v0.9 | 2/2 | 2026-03-16 |
| 8 | Ship & Conflict Data Feeds | v0.9 | 1/2 | 2026-03-17 |
| 8.1 | GDELT Event Source | v0.9 | 2/2 | 2026-03-17 |
| 9 | Layer Controls & News Toggle | v0.9 | 1/2 | 2026-03-17 |
| 10 | Detail Panel | v0.9 | 2/2 | 2026-03-18 |
| 11 | Smart Filters | v0.9 | 3/3 | 2026-03-18 |
| 12 | Analytics Dashboard | v0.9 | 1/1 | 2026-03-19 |
| 13 | Serverless Cache Migration | v1.0 | 4/4 | 2026-03-20 |
| 14 | Vercel Deployment | v1.0 | 2/2 | 2026-03-20 |
| 15 | Key Sites Overlay | v1.1 | 2/2 | 2026-03-20 |
| 16 | News Feed | v1.1 | 3/3 | 2026-03-20 |
| 17 | Notification Center | v1.1 | 4/4 | 2026-03-20 |
| 18 | Oil Markets Tracker | v1.1 | 2/2 | 2026-03-21 |
| 19 | Search, Filter & UI Cleanup | v1.1 | 4/4 | 2026-03-22 |
| 19.1 | Advanced Search | v1.1 | 5/5 | 2026-03-22 |
| 19.2 | Counter Entity Dropdowns | v1.1 | 2/2 | 2026-03-22 |
| 20 | Layer Purpose Refactor | v1.2 | 3/3 | 2026-03-23 |
| 20.1 | Geographical & Weather Layers | v1.2 | 3/3 | 2026-03-23 |
| 20.2 | Threat Heatmap Layer | v1.2 | 1/1 | 2026-03-23 |
| 20.3 | Political Boundaries Layer | v1.2 | -- | Deferred |
| 20.4 | Satellite Imagery Layer | v1.2 | -- | Deferred |
| 20.5 | Infrastructure Focus Layer | v1.2 | -- | Deferred |
| 21 | Production Review & Deploy Sync | v1.2 | 5/5 | 2026-03-25 |
| 21.1 | GDELT News Relevance Filtering | v1.2 | 2/2 | 2026-03-26 |
| 21.2 | GDELT Event Quality Pipeline | v1.2 | 2/2 | 2026-03-28 |
| 21.3 | Multi-User Load Testing | v1.2 | 3/3 | 2026-03-29 |

**v0.9-v1.2 Totals:** 30 phases (27 shipped, 3 deferred) | 72/72 plans executed

---

## v1.3 Data Quality & Layers

### Phase 22: GDELT Event Quality & OSINT Integration
**Goal**: Eliminate false positives/negatives in the conflict event pipeline, add Bellingcat OSINT signal, fix location stacking, and produce a verified event audit trail
**Depends on**: Phase 21.2 (existing quality pipeline)
**Requirements:** [EQ-01, EQ-02, EQ-03, EQ-04, EQ-05, EQ-06, EQ-07, EQ-08, EQ-09]
**Plans:** 3 plans

Plans:
- [ ] 22-01-PLAN.md -- ActionGeo_Type parsing, concentric ring dispersion, config-driven thresholds, pipeline trace types
- [ ] 22-02-PLAN.md -- Bellingcat RSS feed integration and event confidence corroboration boost
- [ ] 22-03-PLAN.md -- CLI event audit dump script and fixture-based test suite

### Phase 23: Threat Density Improvements
**Goal**: Make the threat heatmap more accurate and visually useful with zoom-responsive radius, temporal emphasis, finer grid resolution, and regional normalization
**Depends on**: Phase 22 (better event data feeds into heatmap)
**Key deliverables:**
- Zoom-responsive `radiusPixels` scaling with map zoom level
- Temporal clustering: recent events pulse/glow distinctly from older ones
- Grid resolution 0.75° → 0.25° for higher spatial fidelity in tooltips
- Expanded color palette (5 → 8 stops with yellow/orange mid-range)
- Percentile-based regional normalization (prevents Syria from dominating scale)
- Zoom-responsive picker radius (meters-based instead of fixed pixels)

### Phase 24: Political Boundaries Layer
**Goal**: Users can toggle a political overlay showing country borders color-coded by alliance/faction alignment
**Depends on**: Phase 20 (layer architecture)
**Key deliverables:**
- Natural Earth 110m country polygons (~50KB after coordinate rounding)
- Faction color assignments: US-aligned (blue), Iran-aligned (red), neutral/contested (gray)
- MapLibre fill layers with semi-transparent country fills + emphasized borders
- Disputed territory hatching (Golan Heights, West Bank, Kurdish regions)
- Discrete-swatch legend per faction

### Phase 25: Ethnic Distribution Layer
**Goal**: Users can toggle an overlay showing major ethnic/sectarian zones as labeled hatched regions
**Depends on**: Phase 24 (political layer patterns)
**Key deliverables:**
- Hatched overlay polygons for major zones: Kurdish areas, Shia/Sunni corridors, Baloch region, Druze, Alawite, Turkmen
- Canvas-generated hatch patterns (distinct from political fill — lines vs solid)
- Labeled region names with zoom-responsive visibility
- Discrete legend with ethnic group colors/patterns
- Data: hand-drawn approximate GeoJSON from published ethnic maps

### Phase 26: Water Stress Layer
**Goal**: Users can toggle a water stress overlay showing resource scarcity as a conflict multiplier
**Depends on**: Phase 20 (layer architecture)
**Key deliverables:**
- WRI Aqueduct water stress index data as GeoJSON
- Color scale: blue (low stress) → yellow → red (extreme stress)
- Major water infrastructure labels (Tigris, Euphrates, dams, aquifers)
- Cross-reference with existing desalination site data from siteStore
- Inline legend with stress scale

### Phase 27: Performance & Load Testing
**Goal**: Optimize initial load time and validate production handles 250 concurrent users
**Depends on**: All other v1.3 phases complete
**Key deliverables:**
- Staggered API calls on mount (priority: flights → ships/events → rest)
- Lazy-load visualization layer components (only load when toggled)
- Code-splitting evaluation for maplibre chunk (282KB gzipped)
- k6 test scaled to 250 VUs with thundering herd mitigation
- Request coalescing for concurrent identical requests (flights especially)
- CDN cache tuning (s-maxage optimization per endpoint)
- Vercel warm-up cron frequency evaluation

## Deferred Work

Carried from v1.2:
- **Satellite Imagery** — ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:
- **GDELT BigQuery adapter** — SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** — GramJS/TGSTAT for OSINT early-warning signals
