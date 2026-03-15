# Iran Conflict Monitor — Project Status

**Last updated:** 2026-03-14

## Progress

```
[████░░░░░░░░░░░░░░░░] 2/10 phases complete (20%)
```

## Phase Status

| Phase | Name | Status | Date |
|-------|------|--------|------|
| 1 | Project Scaffolding & Theme | Done | 2026-03-14 |
| 2 | Base Map | Done | 2026-03-14 |
| 3 | API Proxy | Planned (2 plans ready) | — |
| 4 | Flight Data Feed | Not started | — |
| 5 | Entity Rendering | Not started | — |
| 6 | Ship & Conflict Data Feeds | Not started | — |
| 7 | Layer Controls & News Toggle | Not started | — |
| 8 | Detail Panel | Not started | — |
| 9 | Smart Filters | Not started | — |
| 10 | Analytics Dashboard | Not started | — |

## Current Focus

**Phase 3: API Proxy** — Express 5 backend for CORS handling, API key management, and data normalization into MapEntity format. Requires OpenSky, AISStream.io, and ACLED API accounts.

## What's Been Built

### Phase 1: Project Scaffolding & Theme (Complete)
- Vite 6 + React 19 + TypeScript 5.9 scaffold
- Tailwind CSS v4 dark theme with semantic color tokens
- AppShell layout with full-viewport dark shell and z-indexed overlay regions
- Zustand UI store with panel visibility toggles
- OverlayPanel reusable component
- Vitest test infrastructure with jsdom + testing-library

### Phase 2: Base Map (Complete)
- Interactive 2.5D map centered on Iran using Deck.gl + MapLibre
- CARTO Dark Matter base tiles with style customization (hidden road labels, bright borders, blue-tinted water)
- AWS Terrarium DEM terrain with 3x exaggeration and boosted hillshade for dramatic mountain visibility
- Compass control with double-click reset to default Iran view
- Coordinate readout showing live lat/lon on cursor move
- Scale bar in bottom-right
- Vignette effect (faint dark gradient framing viewport edges)
- Full-screen ripple loading animation with smooth map fade-in
- DeckGLOverlay bridge component via MapboxOverlay + useControl hook
- Zustand map store for map state (loaded, cursor position)
- 30 tests passing

## Blockers

None.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Deck.gl + MapLibre | GPU-accelerated 2.5D, free, native layer system |
| React 19 + Vite 6 | Fast HMR, modern component model |
| Zustand 5 | Lightweight state with curried create pattern for type inference |
| Express 5 API proxy | CORS handling, API key protection, data normalization |
| Minimal MapEntity model | Discriminated union — shared base fields + nested type-specific data |
| Separate API endpoints | /api/flights, /api/ships, /api/events with independent cache TTLs |
| OpenSky OAuth2 + 15s polling | Free tier rate limits prevent 5s refresh |
| AISStream.io WebSocket | Real-time push for ship data, no polling needed |
| In-memory cache + stale serving | Simple, refills on restart, serves stale data with staleness indicator on outages |
| AWS Terrarium DEM | Global coverage for Iran mountains (MapLibre demo was Alps-only) |
| Terrain exaggeration 3.0 | Dramatically visible mountain ranges per user preference |

## Repository

- **Remote**: https://github.com/zack-maz/irt.git
- **Branch strategy**: Feature branches, never commit to main directly
