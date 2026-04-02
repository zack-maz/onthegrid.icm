# Iran Conflict Monitor — Project Status

**Last updated:** 2026-04-02

## Progress

```
v0.9 MVP:              [████████████████████] 12/12 phases (shipped 2026-03-19)
v1.0 Deployment:       [████████████████████]  2/2  phases (shipped 2026-03-20)
v1.1 Intelligence Layer: [████████████████████]  8/8  phases (shipped 2026-03-22)
v1.2 Visualization:    [████████████████████]  7/7  phases (shipped 2026-03-29)
v1.3 Data Quality:     [██████████████░░░░░░]  5/9  phases
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
| 16 | News Feed | v1.1 | Done | 2026-03-20 |
| 17 | Notification Center | v1.1 | Done | 2026-03-20 |
| 18 | Oil Markets Tracker | v1.1 | Done | 2026-03-21 |
| 19 | Search, Filter & UI Cleanup | v1.1 | Done | 2026-03-22 |
| 19.1 | Advanced Search with Tag Filtering | v1.1 | Done | 2026-03-22 |
| 19.2 | Counter Entity Dropdowns | v1.1 | Done | 2026-03-22 |
| 20 | Visualization Layers & Filter Independence | v1.2 | Done | 2026-03-24 |
| 20.1 | Geographical & Weather Layers | v1.2 | Done | 2026-03-23 |
| 20.2 | Threat Heatmap Layer | v1.2 | Done | 2026-03-23 |
| 21 | Production Review & Deploy Sync | v1.2 | Done | 2026-03-27 |
| 21.1 | GDELT News Relevance Filtering | v1.2 | Done | 2026-03-26 |
| 21.2 | GDELT Event Quality Pipeline | v1.2 | Done | 2026-03-28 |
| 21.3 | Multi-User Load Testing | v1.2 | Done | 2026-03-29 |
| 22 | GDELT Event Quality & OSINT | v1.3 | Done | 2026-03-30 |
| 22.1 | Fixing Dispersion | v1.3 | Done | 2026-03-31 |
| 23 | Threat Density Improvements | v1.3 | Done | 2026-03-31 |
| 23.1 | Detail Panel Navigation Stack | v1.3 | Done | 2026-04-01 |
| 23.2 | Threat Density Scatter Plots | v1.3 | Done | 2026-04-01 |
| 24 | Political Boundaries Layer | v1.3 | Done | 2026-04-02 |

## Current Focus

v1.3 milestone in progress — 5/9 phases complete. 1106 tests passing. Next up: Phase 25 (Ethnic Distribution Layer).

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

### v1.1 Intelligence Layer (Phases 15-19)

**Phase 15: Key Sites Overlay** — Overpass/OSM adapter for key infrastructure (nuclear, naval, oil, airbase, desalination, port). SiteEntity type, siteStore, one-time fetch with Redis cache. Site IconLayer with 6 category toggles, attack status detection (orange glow for recently-hit sites), tooltip and SiteDetail panel. 571 tests passing.

**Phase 16: News Feed** — GDELT DOC 2.0 + 5 RSS feeds (BBC, Al Jazeera, Tehran Times, Times of Israel, Middle East Eye) with conflict keyword filtering, Jaccard dedup/clustering, sourceCountry tagging, English-only GDELT filter. newsStore + 15-min polling. 618 tests passing.

**Phase 17: Notification Center** — Severity-scored conflict notifications (type weight × log mentions × log sources × recency decay), news headline matching (temporal + geographic/keyword), proximity alerts for flights/ships approaching key sites within 50km, 24h default event window, notification bell with unread badge and dropdown. 647 tests passing.

**Phase 18: Oil Markets Tracker** — Yahoo Finance adapter with Redis cache (60s TTL) for oil market prices (Brent, WTI, XLE, USO, XOM). MarketsSlot collapsible overlay panel with 5-day sparkline charts and green delta animations. marketStore + 60s polling.

**Phase 19: Search, Filter & UI Cleanup** — Global Cmd+K search bar with fuzzy matching and fly-to-entity. Filter panel redesign with grouped sections, Reset All button, scrollable layout. Layout audit and z-index cleanup.

**Phase 19.1: Advanced Search with Tag Filtering** — Tag-based query language with ~25 prefixes (type:, site:, country:, near:, etc.), implicit OR evaluation, bidirectional sync between search bar and sidebar filters, two-stage autocomplete with live entity counts, chip row, syntax highlighting, cheat sheet popover. near: queries support site names and cities with proximity pin.

**Phase 19.2: Counter Entity Dropdowns** — Click-to-expand counter rows showing individual entities with label + key metric, accordion behavior, fly-to-entity on click, proximity sorting, scrollable lists with range indicators. 851 tests passing.

### v1.2 Visualization & Production Hardening (Phases 20-21)

**Phase 20: Visualization Layers & Filter Independence** — Toggleable visualization layers: geographic (elevation tinting, contour lines, feature labels), weather (temperature heatmap with bilinear interpolation, wind barbs, weather tooltips), threat density (HeatmapLayer with compound weight formula using type severity, media signal, fatalities, Goldstein hostility, and temporal decay). Layer stacking with threat tooltip priority over weather. Entity filter toggles (flights, ships, events, sites) operate independently from visualization layers.

**Phase 20.1: Geographical & Weather Layers** — Monochrome elevation tinting with maplibre-contour lines, geographic feature labels (deserts, ranges, seas). Open-Meteo temperature heatmap with bilinear interpolation draped onto terrain, wind barb icons, weather grid tooltips.

**Phase 20.2: Threat Heatmap Layer** — deck.gl HeatmapLayer with compound threat weight formula (SUM aggregation, static radiusPixels: 40). Cluster tooltips with fatalities, mentions, hostility scores.

**Phase 21: Production Review & Deploy Sync** — Helmet CSP, per-endpoint rate limiting, structured JSON logging, Redis graceful degradation with in-memory fallback, rich /health endpoint, cron health checks, production smoke test, Vercel Analytics/SpeedInsights, 4 vendor chunks for cache invalidation. 958 tests passing.

**Phase 21.1: GDELT News Relevance Filtering** — NLP-based relevance scoring replacing keyword whitelist. 3-factor scoring (triple completeness, negativity/conflict verbs, source reliability). Dual gate: keyword match AND relevance threshold.

**Phase 21.2: GDELT Event Quality Pipeline** — Geo-validation against country polygons, expanded CAMEO classification, Goldstein sanity check, 5-signal composite confidence scoring (media, sources, actors, geo, goldstein). NumSources >= 2 filter.

**Phase 21.3: Multi-User Load Testing** — k6 load test (501 VUs, 6 scenarios, 5min) and Playwright browser validation (3 concurrent workers, 3min stability). All application checks 100%. Flights p95: 136ms, overall p95: 153ms. CAMEO 192 (territorial occupation) excluded from conflict pipeline.

### v1.3 Data Quality & Layers (Phases 22-27, in progress)

**Phase 22: GDELT Event Quality & OSINT Integration** — ActionGeo_Type parsing, concentric ring dispersion, config-driven thresholds, pipeline trace types. Bellingcat RSS feed integration for event confidence corroboration. CLI event audit dump script and fixture-based test suite.

**Phase 22.1: Fixing Dispersion** — disperseEvents relocated to events route (post-merge, single-pass slot assignment). Ref-based fly-to deduplication guard in useQuerySync.

**Phase 23: Threat Density Improvements** — Military thermal palette (4-stop), P90 normalization, 0.25° grid, BFS connected-component cluster merging, clickable ThreatClusterDetail panel with type breakdown bars and geographic context.

**Phase 23.1: Detail Panel Navigation Stack** — Browser-like back navigation with PanelView stack, BreadcrumbRow component, directional slide-in/out CSS animations, universal history across all entity/cluster entry points.

**Phase 23.2: Threat Density Scatter Plots** — RadialGradientExtension (custom GLSL shader), additive blending, dual-dimension encoding (radius=spread, color=weight), zoom-dependent z-ordering, hover dimming, Nominatim geocoding for cluster context.

**Phase 24: Political Boundaries Layer** — deck.gl GeoJsonLayer for faction-colored country fills (US-aligned blue, Iran-aligned red, neutral gray at 15% opacity). Natural Earth 110m polygons + 10m disputed areas (Gaza, West Bank, Golan Heights with amber fill). Discrete swatch legend. Threat cluster centroids fixed to use mean of actual event coordinates. 1106 tests passing.

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
