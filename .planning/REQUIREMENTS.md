# Requirements: Iran Conflict Monitor

**Defined:** 2026-03-19
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## v1.1 Requirements

Requirements for the Intelligence Layer milestone. Each maps to roadmap phases.

### Key Sites

- [x] **SITE-01**: User can see key infrastructure sites (nuclear, naval, oil refinery, airbase, dam, port) on the map via Overpass API with distinct icons per type
- [x] **SITE-02**: User can toggle site visibility per type (parent toggle + 6 sub-toggles: nuclear, oil, naval, airbase, dam, port)
- [x] **SITE-03**: User can click a site marker to inspect its details (name, type, coordinates, operator, OSM link) in the detail panel

### News Feed

- [x] **NEWS-01**: System aggregates conflict news from GDELT DOC API, BBC RSS, and Al Jazeera RSS into a unified feed
- [x] **NEWS-02**: System filters non-conflict articles using keyword whitelist (Iran, Israel, airstrike, military, etc.)
- [x] **NEWS-03**: System deduplicates articles by URL hash across sources

### Notifications

- [x] **NOTF-01**: User can see a bell icon with unread count badge in the top-right corner
- [x] **NOTF-02**: User can open a notification drawer showing severity-scored conflict events (type weight x log mentions x log sources x recency decay)
- [x] **NOTF-03**: User sees 1-3 matched news headlines on each notification card (temporal + geographic/keyword matching)
- [x] **NOTF-04**: User receives proximity alerts when tracked entities (flights, ships) approach key sites within 50km
- [x] **NOTF-05**: Map shows only last 24h of conflict events by default when no custom date filter is set

### Oil Markets

- [x] **MRKT-01**: User can see oil market prices (Brent Crude, WTI Crude, XLE, USO, XOM) in a collapsible overlay panel
- [x] **MRKT-02**: User can see 5-day sparkline trend chart per instrument with color-coded direction (green up, red down)
- [x] **MRKT-03**: User sees green delta animations on price changes matching the existing counter animation pattern

### Search & UI

- [x] **SRCH-01**: User can search across all entity types via Cmd+K global search bar with fuzzy matching and fly-to-entity on selection
- [x] **SRCH-02**: User can reset all active filters with a single "Reset All" button
- [x] **SRCH-03**: Filter panel has grouped sections with scrollable layer toggles and visual hierarchy

### Advanced Search

- [x] **ASRCH-01**: User can type tag-based queries with full boolean expression support (AND/OR/NOT/parentheses)
- [x] **ASRCH-02**: Tags are evaluated against all entity types with the full tag vocabulary (~25 prefixes)
- [x] **ASRCH-03**: Search bar and sidebar filters sync bidirectionally (typing tags activates toggles; toggling adds/removes tags)
- [x] **ASRCH-04**: Two-stage autocomplete suggests tag prefixes then known values with counts from live entity data
- [x] **ASRCH-05**: SearchModal includes chip row, syntax highlighting, autocomplete dropdown, and cheat sheet popover
- [x] **ASRCH-06**: Plain text queries still work as freeform substring search (backward compat with Phase 19)

### Counter Dropdowns

- [x] **CNTR-01**: User can click a counter row to expand a dropdown showing individual entities with label + key metric per type
- [x] **CNTR-02**: Only one counter row can be expanded at a time (accordion behavior)
- [x] **CNTR-03**: User can click an entity in the dropdown to fly the map to it and open the detail panel
- [x] **CNTR-04**: Entities are sorted by proximity per category (flights/events from Tehran, ships from Strait of Hormuz, sites by attack count)
- [x] **CNTR-05**: Zero-count counter rows are disabled and non-expandable; expanded rows that drop to 0 show empty state
- [x] **CNTR-06**: Lists exceeding 8 items show a scrollable container with "Showing X-Y of Z" range indicator

### Layer Purpose Refactor

- [ ] **LREF-01**: All entities (flights, ships, events, sites) are always visible on the map -- entity toggle state is fully removed
- [ ] **LREF-02**: New visualization layer store exists with on/off toggle state for 6 layer types (geographic, weather, threat, political, satellite, infrastructure)
- [ ] **LREF-03**: Sidebar "Layers" section replaced with visualization layer toggles instead of entity visibility toggles
- [ ] **LREF-04**: Inline legend framework renders color scale legends for active visualization layers in the bottom-left map corner
- [ ] **LREF-05**: Search/filter system is the only mechanism to narrow visible entities on the map

## v1.2+ Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Intelligence

- **INTL-01**: AI-generated situation briefs using Claude API
- **INTL-02**: Configurable severity weights for notification scoring
- **INTL-03**: Desktop push notifications for critical events

### Visualization

- **VIZL-01**: Historical replay / event timeline with playback controls
- **VIZL-02**: Trajectory arc rendering for flight and missile paths
- **VIZL-03**: 2.5D hexagonal density columns for strike hotspots

### Platform

- **PLAT-01**: Mobile-responsive layout
- **PLAT-02**: Market-closed state dimming with schedule awareness

## Out of Scope

| Feature | Reason |
|---------|--------|
| Standalone news feed UI | Contradicts "numbers over narratives" core value — news is infrastructure for notifications only |
| Real-time WebSocket for notifications | Polling is sufficient for single-user tool; WebSocket adds serverless complexity |
| Paid market data APIs | Free-tier constraint; Yahoo Finance unofficial API with graceful degradation |
| Full-text article scraping | Copyright concerns; title + URL linking is sufficient |
| User-configurable alert thresholds | Over-engineering for single user; hardcoded thresholds in v1.1, configurable in v1.2+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SITE-01 | Phase 15 | Complete |
| SITE-02 | Phase 15 | Complete |
| SITE-03 | Phase 15 | Complete |
| NEWS-01 | Phase 16 | Complete |
| NEWS-02 | Phase 16 | Complete |
| NEWS-03 | Phase 16 | Complete |
| NOTF-01 | Phase 17 | Complete |
| NOTF-02 | Phase 17 | Complete |
| NOTF-03 | Phase 17 | Complete |
| NOTF-04 | Phase 17 | Complete |
| NOTF-05 | Phase 17 | Complete |
| MRKT-01 | Phase 18 | Complete |
| MRKT-02 | Phase 18 | Complete |
| MRKT-03 | Phase 18 | Complete |
| SRCH-01 | Phase 19 | Complete |
| SRCH-02 | Phase 19 | Complete |
| SRCH-03 | Phase 19 | Complete |
| ASRCH-01 | Phase 19.1 | Complete |
| ASRCH-02 | Phase 19.1 | Complete |
| ASRCH-03 | Phase 19.1 | Complete |
| ASRCH-04 | Phase 19.1 | Complete |
| ASRCH-05 | Phase 19.1 | Complete |
| ASRCH-06 | Phase 19.1 | Complete |
| CNTR-01 | Phase 19.2 | Complete |
| CNTR-02 | Phase 19.2 | Complete |
| CNTR-03 | Phase 19.2 | Complete |
| CNTR-04 | Phase 19.2 | Complete |
| CNTR-05 | Phase 19.2 | Complete |
| CNTR-06 | Phase 19.2 | Complete |
| LREF-01 | Phase 20 | Planned |
| LREF-02 | Phase 20 | Planned |
| LREF-03 | Phase 20 | Planned |
| LREF-04 | Phase 20 | Planned |
| LREF-05 | Phase 20 | Planned |

**Coverage:**
- v1.1 requirements: 29 total, 29 complete
- v1.2 (Phase 20) requirements: 5 total, 0 complete
- Mapped to phases: 34
- Complete: 29

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-22 — Phase 20 requirements added*
