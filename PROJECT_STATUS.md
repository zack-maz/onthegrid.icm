# Iran Conflict Monitor — Project Status

**Last updated:** 2026-03-20

## Progress

```
v0.9 MVP:              [████████████████████] 12/12 phases (shipped 2026-03-19)
v1.0 Deployment:       [████████████████████]  2/2  phases (shipped 2026-03-20)
v1.1 Intelligence Layer: [██                  ]  1/6  phases (in progress)
```

## Phase Status

| Phase | Name | Milestone | Status | Date |
|-------|------|-----------|--------|------|
| 1 | Project Scaffolding & Theme | v0.9 | Done | 2026-03-14 |
| 2 | Base Map | v0.9 | Done | 2026-03-14 |
| 3 | API Proxy | v0.9 | Done | 2026-03-15 |
| 4 | Flight Data Feed | v0.9 | Done | 2026-03-15 |
| 5 | Entity Rendering | v0.9 | Done | 2026-03-15 |
| 6 | Multi-Source Flight Data | v0.9 | Done | 2026-03-16 |
| 7 | StatusPanel & Source Config | v0.9 | Done | 2026-03-16 |
| 8 | Ship & Conflict Data | v0.9 | Done | 2026-03-16 |
| 8.1 | GDELT Conflict Events | v0.9 | Done | 2026-03-17 |
| 9 | Layer Controls & News Toggle | v0.9 | Done | 2026-03-17 |
| 10 | Detail Panel & Event Reclassification | v0.9 | Done | 2026-03-18 |
| 11 | Smart Filters | v0.9 | Done | 2026-03-18 |
| 12 | Analytics Dashboard | v0.9 | Done | 2026-03-18 |
| 13 | Serverless Cache Migration | v1.0 | Done | 2026-03-20 |
| 14 | Vercel Deployment | v1.0 | Done | 2026-03-20 |
| 15 | Key Sites Overlay | v1.1 | Done | 2026-03-20 |

## Current Focus

Phase 15 (Key Sites Overlay) complete. Next: Phase 16+ of v1.1 Intelligence Layer milestone.

## What's Been Built

### v0.9 MVP (Phases 1-12)

**Phase 1: Project Scaffolding & Theme** — Vite 6 + React 19 + TypeScript 5.9 scaffold, Tailwind CSS v4 dark theme, AppShell layout with z-indexed overlay regions.

**Phase 2: Base Map** — Interactive 2.5D map centered on Iran using Deck.gl + MapLibre, CARTO Dark Matter base tiles, AWS Terrarium DEM terrain (3x exaggeration), compass, coordinates, scale bar, vignette, loading animation.

**Phase 3: API Proxy** — Express 5 server with OpenSky, AISStream, ACLED adapters, in-memory cache with TTLs, security middleware.

**Phase 4: Flight Data Feed** — Recursive setTimeout polling with tab visibility awareness, connection health tracking, stale data clearing (60s threshold).

**Phase 5: Entity Rendering** — Deck.gl IconLayer markers with type-specific icons and colors, altitude-based opacity, zoom-responsive sizing.

**Phase 6-7: Multi-Source Flights & StatusPanel** — Three flight sources (OpenSky, ADS-B Exchange, adsb.lol), StatusPanel HUD with connection health dots, source persistence in localStorage.

**Phase 8-8.1: Ship & Conflict Data** — Ship polling (30s), event polling (15min), GDELT v2 adapter with ZIP download → CSV parse → FIPS/CAMEO filtering, event deduplication.

**Phase 9: Layer Controls & News Toggle** — 8-row layer toggles panel, EntityTooltip with per-type content, hover glow/highlight feedback, zoom +/- controls.

**Phase 10: Detail Panel** — 360px right-side slide-out with FlightDetail, ShipDetail, EventDetail, flash-on-change values, lost contact state, 11 CAMEO-based ConflictEventTypes, 4 conflict toggle groups.

**Phase 11: Smart Filters** — Advanced filtering by nationality, speed, altitude, proximity, date range with dual-thumb slider and granularity toggle.

**Phase 12: Analytics Dashboard** — Counters panel with visibility-aware flight/event counts and green +N delta animations.

### v1.0 Deployment (Phases 13-14)

**Phase 13: Serverless Cache Migration** — Upstash Redis replacing in-memory caches, CacheEntry pattern with staleness computation, AISStream on-demand connection, ship merge/prune, events accumulator, GDELT backfill.

**Phase 14: Vercel Deployment** — Vercel serverless entry point with tsup bundling, rate limiting, graceful config for missing API keys, vercel.json routing.

### v1.1 Intelligence Layer (Phase 15+)

**Phase 15: Key Sites Overlay** — Overpass/OSM adapter for key infrastructure (nuclear, naval, oil, airbase, desalination, port). SiteEntity type, siteStore, one-time fetch with Redis cache. Site IconLayer with 6 category toggles, attack status detection (orange glow for recently-hit sites), tooltip and SiteDetail panel. 571 tests passing.

## Blockers

None.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Deck.gl + MapLibre | GPU-accelerated 2.5D, free, native layer system |
| Zustand 5 | Lightweight state with curried create pattern for type inference |
| Express 5 API proxy | CORS handling, API key protection, data normalization |
| GDELT v2 over ACLED | Free, no auth required, 15-min updates, global coverage |
| CAMEO-based event types | 11 granular types replace fabricated drone/missile split |
| Upstash Redis | REST-based, serverless-compatible, replaces in-memory cache |
| Vercel deployment | Serverless functions + CDN, zero-config scaling |
| Overpass/OSM for sites | Free, no auth, comprehensive infrastructure data |

## Repository

- **Remote**: https://github.com/zack-maz/irt.git
- **Branch strategy**: Feature branches, never commit to main directly
