# Research Summary: Iran Conflict Monitor

## Stack

**Frontend:** React 19 + Vite 6 + TypeScript 5 + Tailwind CSS 4
**Map:** Deck.gl 9 + MapLibre GL JS 4 (GPU-accelerated 2.5D, free)
**State:** Zustand 5
**Backend:** Express 5 (API proxy, CORS, key management)
**Storage:** SQLite via better-sqlite3 (cache + optional persistence)
**Data:** OpenSky (flights), AIS Hub (ships), ACLED (conflict events)

## Table Stakes

- Interactive 2.5D dark map with pan/zoom/rotate
- Entity markers for ships, flights, missiles, drones
- Layer toggles per entity type
- Real-time position updates (mixed: WebSocket for flights, polling for ships/events)
- Detail panel on entity click
- Data freshness indicators

## Key Differentiators

- Statistical data priority — hide non-quantitative news by default
- Smart filters (nationality, speed, altitude, proximity)
- 2.5D data density visualization (hexagonal columns for hotspots)
- Trajectory arc rendering
- Timeline and escalation pattern visualization
- User-saved snapshots as JSON files
- Counts/tallies dashboard (strikes, sorties, intercepts)

## Architecture

Three-tier: External APIs → Express proxy (normalize, cache) → React SPA (render, interact)

Common `MapEntity` interface normalizes all sources into a uniform format. WebSocket for high-frequency data (flights), polling for lower-frequency (ships, events). Zustand store manages entities, filters, layers, selections.

**Build order:** Scaffolding → Proxy → First adapter (flights) → Base map → Entity rendering → UI controls → More adapters → Filters → 2.5D viz → Stats → Snapshots → Polish

## Watch Out For

1. **API rate limits** — Cache aggressively, use WebSocket over polling, register for auth tokens
2. **CORS blocking** — Always proxy; never call external APIs from browser
3. **Frame rate with 5K+ entities** — Use Deck.gl data diffing, viewport culling, flat arrays
4. **Unit mismatches** — Normalize all adapters to consistent units at proxy level
5. **WebSocket drops** — Auto-reconnect with backoff, connection state in UI
6. **Stale data without indicators** — Per-type staleness thresholds, visual dimming
7. **ACLED delays** — Events are hours/days old; set expectations in UI
8. **Bounding box returns too much** — Filter irrelevant commercial flights at adapter level
9. **Snapshot file size** — Store minimal fields, compress, limit count
