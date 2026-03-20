# Iran Conflict Monitor — Project Specification

## Overview

A personal real-time intelligence dashboard for monitoring the Iran conflict. Displays a 2.5D map of Iran with live data points for ships, flights, missiles, and drones sourced from public APIs. Prioritizes concrete mathematical data — movement vectors, strike counts, timelines, force posture — over qualitative news reporting.

## Core Value

Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 6 |
| Styling | Tailwind CSS v4 (dark theme, CSS-first @theme) |
| State | Zustand 5 (curried create pattern) |
| Map | Deck.gl + MapLibre GL JS (2.5D rendering) |
| Backend | Express 5 (API proxy, port 3001) |
| Cache | Upstash Redis (serverless-compatible) |
| Hosting | Vercel (serverless functions + CDN) |
| Data Sources | OpenSky, ADS-B Exchange, adsb.lol, AISStream.io, GDELT v2, Overpass/OSM |
| Testing | Vitest + Testing Library |
| Dev Tooling | tsx watch (server), concurrently (parallel dev), tsup (bundling) |

## Architecture

```
Browser (React SPA) — port 5173
  ├── AppShell (dark theme layout, z-indexed overlays)
  ├── Map Layer (Deck.gl + MapLibre)
  │   ├── BaseMap (CARTO Dark Matter, AWS Terrarium terrain)
  │   ├── DeckGLOverlay (MapboxOverlay via useControl)
  │   ├── Flight markers (aircraft icons)
  │   ├── Ship markers (vessel icons)
  │   └── Conflict markers (strike/missile/drone icons)
  ├── Map Overlays
  │   ├── CompassControl (double-click reset)
  │   ├── CoordinateReadout (live lat/lon)
  │   ├── MapLoadingScreen (ripple animation)
  │   ├── MapVignette (faint edge gradient)
  │   └── Scale bar
  ├── UI Overlays
  │   ├── Layer toggle controls
  │   ├── Smart filter panel
  │   ├── Detail panel (click-to-inspect)
  │   └── Analytics counters
  └── Zustand stores (mapStore, uiStore, entity stores)

Express API Proxy — port 3001 (local) / Vercel serverless (prod)
  ├── /api/flights → OpenSky / ADS-B Exchange / adsb.lol
  ├── /api/ships → AISStream.io (on-demand connect-collect-close)
  ├── /api/events → GDELT v2 (15-min updates)
  ├── /api/sites → Overpass/OSM (one-time fetch, 24h cache)
  ├── /api/sources → per-source configuration status
  └── Upstash Redis cache with staleness indicators
```

## Data Model

```typescript
// Discriminated union — minimal shared fields + nested type-specific data
type EntityType = 'flight' | 'ship' | 'missile' | 'drone';

interface MapEntityBase {
  id: string;
  type: EntityType;
  lat: number;
  lng: number;
  timestamp: number;
  label: string;
}

// Type-specific data in nested object per entity type
```

## Data Sources & Refresh Rates

| Source | Data Type | Refresh Rate | Protocol | Auth |
|--------|-----------|-------------|----------|------|
| OpenSky Network | Flight positions | ~15s (free tier) | REST | OAuth2 client credentials |
| AISStream.io | Ship positions | Real-time | WebSocket | API key |
| ACLED | Conflict events | 1-5 min polling | REST | Email/password |

## Design System

- **Background**: Black with white grid
- **Color accents**:
  - Blue — naval/friendly
  - Red — hostile/strikes
  - Green — confirmed/safe
  - Yellow — warning/unconfirmed
- **Map**: CARTO Dark Matter, terrain exaggeration 3.0, pitch 50 degrees
- **News**: Non-statistical content hidden by default with toggle

## Features (15+ Phases)

1. **Project Scaffolding & Theme** — Dark-themed React/Vite shell ✓
2. **Base Map** — Interactive 2.5D map centered on Iran ✓
3. **API Proxy** — Express backend for CORS + API key management ✓
4. **Flight Data Feed** — Live flight tracking (multi-source) ✓
5. **Entity Rendering** — Type-specific markers on map ✓
6. **Multi-Source Flight Data** — OpenSky, ADS-B Exchange, adsb.lol ✓
7. **StatusPanel & Source Config** — HUD with health dots ✓
8. **Ship & Conflict Data** — AIS ships + GDELT events ✓
9. **Layer Controls & News Toggle** — Category toggles, entity tooltips ✓
10. **Detail Panel** — Click-to-inspect with live stats ✓
11. **Smart Filters** — Nationality, speed, altitude, proximity, date range ✓
12. **Analytics Dashboard** — Visibility-aware counters with delta animations ✓
13. **Serverless Cache Migration** — Upstash Redis for stateless deployment ✓
14. **Vercel Deployment** — Serverless functions + CDN hosting ✓
15. **Key Sites Overlay** — Infrastructure sites (nuclear, naval, oil, airbase, desalination, port) from OSM ✓

## Constraints

- **Data**: Public APIs only — no classified or paid intelligence feeds
- **Cost**: Free-tier APIs where possible (MapLibre over Mapbox, OpenSky)
- **Platform**: Browser-based web app
- **Users**: Single user — no auth, no multi-tenancy
- **Storage**: JSON file snapshots (local, git-trackable)

## Out of Scope

- Significant persons tracking
- Push/desktop notifications
- User authentication
- Historical playback/replay
- Mobile app
- Real-time chat/collaboration
