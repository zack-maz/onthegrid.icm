# Requirements: Iran Conflict Monitor

**Defined:** 2026-03-13
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## v1 Requirements

### Map & Visualization

- [x] **MAP-01**: Interactive 2.5D dark map with pan, zoom, rotate (Deck.gl + MapLibre)
- [x] **MAP-02**: Entity markers with type-specific icons (ships, flights, missiles, drones)

### Data Feeds

- [x] **DATA-01**: Flight tracking via OpenSky/ADS-B (~5s refresh)
- [x] **DATA-02**: Ship tracking via AIS data (~30-60s refresh)
- [x] **DATA-03**: Conflict event data via ACLED API (1-5 min polling)

### Controls & Filtering

- [ ] **CTRL-01**: Layer toggles to show/hide each entity type (ships, flights, missiles, drones)
- [ ] **CTRL-02**: Detail panel on entity click showing live stats (speed, heading, origin, metadata)
- [ ] **CTRL-03**: Smart filters by nationality, speed, altitude, proximity, and date range
- [ ] **CTRL-04**: Non-statistical news hidden by default with toggle to reveal

### Analytics

- [ ] **STAT-01**: Strike/sortie/intercept running counters dashboard

### Infrastructure

- [x] **INFRA-01**: Express API proxy for CORS handling, API key management, and data normalization
- [x] **INFRA-02**: Dark theme with clean grid layout (black/white primary, blue/red/green/yellow accents only)

## v2 Requirements

### Real-Time Enhancement

- **RT-01**: Real-time position updates with entities moving on map as data arrives
- **RT-02**: Data freshness indicators per entity (visual staleness cues)

### Advanced Visualization

- **VIZ-01**: 2.5D hexagonal density columns showing strike/event hotspots
- **VIZ-02**: Trajectory arc rendering for flight paths and missile paths
- **VIZ-03**: Force posture overlay (carrier groups, air defense coverage zones)

### Analytics & Persistence

- **ANLYT-01**: Timeline view with event timestamps, intervals, escalation patterns
- **SNAP-01**: User-saved snapshots stored as local JSON files
- **SNAP-02**: Snapshot comparison (side-by-side state comparison)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Significant persons tracking | Dropped — unclear data sources, high complexity |
| Push/desktop notifications | User monitors actively, no passive alerts |
| User authentication | Personal tool, single user |
| Historical replay/playback | Live + snapshots covers the use case |
| Mobile app | Web-first desktop monitoring tool |
| Real-time chat/collaboration | Solo tool |
| News aggregation feed | Contradicts "numbers over narratives" core value |
| Prediction/forecasting | Unreliable without classified data |
| Sentiment analysis | Qualitative, contradicts quantitative-first philosophy |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAP-01 | Phase 2 | Complete |
| MAP-02 | Phase 5 | Complete |
| DATA-01 | Phase 4 | Complete |
| DATA-02 | Phase 8 | Complete |
| DATA-03 | Phase 8 | Complete |
| CTRL-01 | Phase 7 | Pending |
| CTRL-02 | Phase 8 | Pending |
| CTRL-03 | Phase 9 | Pending |
| CTRL-04 | Phase 7 | Pending |
| STAT-01 | Phase 10 | Pending |
| INFRA-01 | Phase 3 | Complete |
| INFRA-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
