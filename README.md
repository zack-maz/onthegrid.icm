# Iran Conflict Monitor

A personal real-time intelligence dashboard for monitoring the Iran conflict. Displays a 2.5D map of the Greater Middle East with live flights, ships, and conflict events sourced from public APIs. Prioritizes concrete mathematical data — movement vectors, strike counts, timelines, force posture — over qualitative news reporting.

## Quick Start

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Current State

Interactive 2.5D map of the Greater Middle East with live flights (3 sources), ships (AIS), conflict events (GDELT), and key infrastructure sites (Overpass/OSM). Layer toggles with 4 conflict categories + 6 site categories, entity tooltips, click-to-inspect detail panel with live stats, hover/click highlighting, smart filters (nationality, speed, altitude, proximity, date range), analytics counters dashboard, and a real-time status HUD. Deployed on Vercel with Upstash Redis cache. 571 tests passing.

**Milestone:** v0.9 MVP shipped 2026-03-19 | v1.0 Deployment shipped 2026-03-20 | v1.1 Intelligence Layer in progress

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 6 |
| Styling | Tailwind CSS v4 (dark theme, CSS-first @theme) |
| State | Zustand 5 |
| Map | Deck.gl + MapLibre GL JS (2.5D rendering) |
| Backend | Express 5 (API proxy, port 3001) |
| Cache | Upstash Redis (serverless-compatible) |
| Hosting | Vercel (serverless functions + CDN) |
| Data Sources | OpenSky, ADS-B Exchange, adsb.lol, AISStream.io, GDELT v2, Overpass/OSM |
| Testing | Vitest + Testing Library |

## Project Structure

```
src/
├── components/
│   ├── layout/     # AppShell, overlay regions
│   ├── map/        # BaseMap, overlays (compass, coords, vignette, loading)
│   └── ui/         # Reusable UI components
├── hooks/          # Custom hooks (useFlightPolling)
├── stores/         # Zustand stores (mapStore, uiStore, flightStore)
├── styles/         # Global CSS, animations
├── types/          # TypeScript interfaces
└── __tests__/      # Component and store tests
server/
├── adapters/       # OpenSky, ADS-B Exchange, adsb.lol, AISStream, GDELT, Overpass adapters
├── cache/          # Upstash Redis cache module (cacheGet/cacheSet)
├── routes/         # /api/flights, /api/ships, /api/events, /api/sites, /api/sources
├── middleware/      # Error handler, rate limiting
├── __tests__/      # Adapter, cache, security, and type tests
├── config.ts       # Environment-based configuration (graceful degradation)
├── constants.ts    # Bbox, cache TTLs, polling intervals
├── types.ts        # MapEntity discriminated union
├── app.ts          # Express app factory (createApp)
├── vercel.ts       # Vercel serverless entry point
└── index.ts        # Local dev server entry point
```

## Design

- **Theme:** Dark background, white grid, restrained color accents
- **Colors:** Blue (naval/friendly), Red (hostile/strikes), Green (safe), Yellow (warning)
- **Map:** CARTO Dark Matter base, 3D terrain with 3x exaggeration, 50-degree pitch
- **News:** Non-statistical content hidden by default

## Testing

```bash
npx vitest run              # Run all tests (571 tests)
npx vitest run src/         # Frontend tests only
npx vitest run server/      # Server tests only
npx vitest run --watch      # Watch mode
```

## License

Private — personal tool.
