# Features Research: Iran Conflict Monitor

## Table Stakes (Must Have)

These are features users expect from any geospatial intelligence dashboard. Without them, the tool isn't functional.

### Map & Navigation
- **Interactive 2.5D map** — Pan, zoom, rotate. Geographic context is the foundation. (Complexity: Medium)
- **Dark base map** — Standard for monitoring tools; reduces eye strain during extended use. (Complexity: Low)
- **Geographic boundaries** — Country borders, cities, water bodies for orientation. (Complexity: Low)

### Data Visualization
- **Entity markers on map** — Ships, flights, missiles, drones shown as distinct icons/points. (Complexity: Medium)
  - Depends on: data ingestion pipeline
- **Layer toggles** — Show/hide categories (ships, flights, missiles, drones). Standard in any multi-source map. (Complexity: Low)
  - Depends on: entity markers
- **Color coding by type/status** — Immediate visual differentiation. (Complexity: Low)
- **Real-time position updates** — Entities move on map as new data arrives. Core value prop. (Complexity: High)
  - Depends on: data ingestion, WebSocket/polling

### Data Detail
- **Detail panel on click** — Side panel showing entity metadata (speed, heading, origin, type). (Complexity: Medium)
  - Depends on: entity markers
- **Data freshness indicator** — How old is this data point? Critical for trust. (Complexity: Low)

### Data Ingestion
- **Flight data feed** — ADS-B/OpenSky integration. (Complexity: Medium)
- **Ship data feed** — AIS data integration. (Complexity: Medium)
- **Conflict event feed** — ACLED or equivalent. (Complexity: Medium)

## Differentiators (Competitive Advantage)

These features go beyond basic OSINT dashboards and align with the project's "numbers over narratives" philosophy.

### Intelligence-Grade Filtering
- **Smart filters** — Filter by nationality, speed, altitude, threat level, proximity to targets. Goes beyond simple layer toggles. (Complexity: Medium)
  - Depends on: normalized data model
- **Statistical data priority** — Hide non-quantitative news by default. Unique to this tool. (Complexity: Medium)
- **Data richness scoring** — Rate each data point by how much concrete data it contains. (Complexity: Medium)

### Analytical Visualization
- **2.5D data density columns** — Hexagonal columns showing strike/event density. Visual weight for hotspots. (Complexity: Medium)
  - Depends on: Deck.gl HexagonLayer
- **Trajectory arcs** — Flight paths, missile trajectories rendered as arcs on map. (Complexity: Medium)
  - Depends on: Deck.gl ArcLayer
- **Timeline view** — Event timestamps, intervals between strikes, escalation patterns displayed chronologically. (Complexity: High)
  - Depends on: event data with timestamps
- **Force posture overlay** — Carrier group positions, air defense coverage zones as map overlays. (Complexity: High)
  - Depends on: curated data, polygon rendering

### Persistence
- **User-saved snapshots** — Capture current map state + data as JSON for later reference. (Complexity: Medium)
- **Snapshot comparison** — Compare two saved states side-by-side. (Complexity: High)
  - Depends on: snapshot system

### Counts & Tallies Dashboard
- **Strike counter** — Running tallies of confirmed strikes, sorties, intercepts. (Complexity: Medium)
  - Depends on: conflict event data
- **Casualty tracking** — Numbers from verified sources. (Complexity: Medium)
  - Depends on: ACLED data quality

## Anti-Features (Do NOT Build)

| Feature | Why Not |
|---------|---------|
| Social/sharing features | Personal tool, adds auth complexity |
| News aggregation feed | Goes against "numbers over narratives" — would dilute core value |
| Prediction/forecasting | Unreliable without classified data; could mislead |
| Real-time chat | Solo tool, no collaboration needed |
| Mobile-responsive layout | Desktop monitoring tool, mobile adds complexity |
| User accounts/auth | Single user, unnecessary overhead |
| Automated alerts/notifications | User chose active monitoring over passive alerts |
| Historical replay/playback | Out of scope — snapshots cover the key moments use case |
| Sentiment analysis on news | Qualitative, contradicts the quantitative-first philosophy |

## Feature Dependencies Graph

```
Data Ingestion (flights, ships, events)
  └── Entity Markers on Map
       ├── Layer Toggles
       ├── Color Coding
       ├── Detail Panel
       │    └── Data Freshness Indicator
       ├── Smart Filters
       └── Real-time Updates
            ├── Trajectory Arcs
            └── 2.5D Density Columns

Event Data + Timestamps
  ├── Timeline View
  ├── Strike Counter / Tallies
  └── Force Posture Overlay

Snapshot System
  └── Snapshot Comparison
```
