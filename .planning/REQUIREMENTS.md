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

- [ ] **NOTF-01**: User can see a bell icon with unread count badge in the top-right corner
- [ ] **NOTF-02**: User can open a notification drawer showing severity-scored conflict events (type weight × log mentions × log sources × recency decay)
- [ ] **NOTF-03**: User sees 1-3 matched news headlines on each notification card (temporal + geographic/keyword matching)
- [ ] **NOTF-04**: User receives proximity alerts when tracked entities (flights, ships) approach key sites within 50km
- [ ] **NOTF-05**: Map shows only last 24h of conflict events by default when no custom date filter is set

### Oil Markets

- [ ] **MRKT-01**: User can see oil market prices (Brent Crude, WTI Crude, XLE, USO, XOM) in a collapsible overlay panel
- [ ] **MRKT-02**: User can see 5-day sparkline trend chart per instrument with color-coded direction (green up, red down)
- [ ] **MRKT-03**: User sees green delta animations on price changes matching the existing counter animation pattern

### Search & UI

- [ ] **SRCH-01**: User can search across all entity types via Cmd+K global search bar with fuzzy matching and fly-to-entity on selection
- [ ] **SRCH-02**: User can reset all active filters with a single "Reset All" button
- [ ] **SRCH-03**: Filter panel has grouped sections with scrollable layer toggles and visual hierarchy

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
| NOTF-01 | Phase 17 | Pending |
| NOTF-02 | Phase 17 | Pending |
| NOTF-03 | Phase 17 | Pending |
| NOTF-04 | Phase 17 | Pending |
| NOTF-05 | Phase 17 | Pending |
| MRKT-01 | Phase 18 | Pending |
| MRKT-02 | Phase 18 | Pending |
| MRKT-03 | Phase 18 | Pending |
| SRCH-01 | Phase 19 | Pending |
| SRCH-02 | Phase 19 | Pending |
| SRCH-03 | Phase 19 | Pending |

**Coverage:**
- v1.1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
