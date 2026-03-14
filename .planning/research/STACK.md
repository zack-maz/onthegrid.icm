# Stack Research: Iran Conflict Monitor

## Frontend Framework

**React 19** — Confidence: High
- Component model fits the panel/toggle/filter UI perfectly
- Largest ecosystem for map visualization libraries
- Vite as build tool for fast dev iteration

**Why not:** Vue/Svelte have smaller Deck.gl ecosystems. Next.js adds SSR complexity unnecessary for a personal SPA.

## Map & Visualization

**Deck.gl 9.x + MapLibre GL JS 4.x** — Confidence: High
- Deck.gl: GPU-accelerated WebGL layers purpose-built for large-scale geospatial data
  - ScatterplotLayer for point entities (ships, flights)
  - ArcLayer for trajectories and missile paths
  - HexagonLayer / ColumnLayer for 2.5D data density visualization
  - IconLayer for typed markers (ship icon, plane icon, etc.)
- MapLibre GL JS: Free, open-source fork of Mapbox GL (no API key costs)
  - Vector tile rendering
  - Dark map styles available (e.g., MapTiler Dark Matter, or self-hosted)
- `@deck.gl/mapbox` or `react-map-gl` for integration

**Why not Mapbox GL JS:** Requires paid API key after free tier. MapLibre is functionally equivalent and free.
**Why not Leaflet:** No WebGL, can't handle thousands of moving points. No real 2.5D.
**Why not Three.js:** Would require rebuilding all map primitives (tiles, projections, interactions) from scratch.
**Why not CesiumJS:** Overkill 3D globe, heavy bundle, complex API for a 2.5D flat map.

## State Management

**Zustand** — Confidence: High
- Lightweight, no boilerplate
- Perfect for managing filter state, layer toggles, selected entity, panel state
- Works well with real-time data updates (mutable store)

**Why not Redux:** Too much boilerplate for a personal tool. No need for time-travel debugging.

## Real-Time Data

**WebSocket (native) + polling (fetch/axios)** — Confidence: High
- Flights (ADS-B/OpenSky): WebSocket or SSE for ~5s updates
- Ships (AIS): REST polling every 30-60s (most free AIS APIs don't offer WebSocket)
- Conflict events (ACLED): REST polling every 1-5 minutes
- No need for Socket.io — native WebSocket is sufficient for a single-user app

## Data Sources (APIs)

| Source | Data | Free Tier | Notes |
|--------|------|-----------|-------|
| OpenSky Network | Flight positions | Yes, rate-limited (anon: 10 req/10s) | Best free ADS-B. REST + WebSocket |
| ADS-B Exchange (RapidAPI) | Flight positions | Limited free tier | Backup/supplement to OpenSky |
| AISHub / Datalastic | Ship AIS positions | Free with contribution | AIS cooperative data sharing |
| MarineTraffic API | Ship positions | Paid (limited free) | Better coverage but costs money |
| ACLED API | Conflict events | Free (academic/research) | Requires registration, some delay |
| Natural Earth / OpenStreetMap | Base map tiles | Free | Via MapLibre + tile server |

## Backend / Data Layer

**Node.js + Express (minimal)** — Confidence: Medium
- Proxy layer to avoid CORS issues with public APIs
- API key management (keep keys server-side)
- Optional: aggregate/normalize data before sending to frontend
- Could start with just a Vite dev server proxy and add Express later

**SQLite (via better-sqlite3)** — Confidence: Medium
- For snapshot storage (JSON files initially, migrate if needed)
- For caching API responses to reduce rate limit pressure
- Lightweight, zero-config, file-based

## Styling

**Tailwind CSS 4** — Confidence: High
- Utility-first, fast iteration for dashboard layouts
- Dark theme via `dark:` variants or custom theme
- Grid layout utilities for the dashboard panels

## Dev Tooling

- **Vite 6** — Fast HMR, React plugin
- **TypeScript 5.x** — Type safety for complex data structures
- **ESLint + Prettier** — Standard formatting

## Versions Summary

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.x | UI framework |
| deck.gl | 9.x | GPU map layers |
| maplibre-gl | 4.x | Base map rendering |
| react-map-gl | 7.x | React wrapper for MapLibre |
| zustand | 5.x | State management |
| tailwindcss | 4.x | Styling |
| vite | 6.x | Build tool |
| typescript | 5.x | Type safety |
| express | 5.x | API proxy (optional) |
| better-sqlite3 | 11.x | Local data cache (optional) |
