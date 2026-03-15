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
| Data Sources | OpenSky Network (OAuth2), AISStream.io (WebSocket), ACLED |
| Testing | Vitest + Testing Library |
| Dev Tooling | tsx watch (server), concurrently (parallel dev) |

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

Express API Proxy — port 3001
  ├── /api/flights → OpenSky Network (OAuth2, ~15s polling)
  ├── /api/ships → AISStream.io (WebSocket, real-time push)
  └── /api/events → ACLED (last 7 days, 1-5 min polling)
  └── In-memory cache with staleness indicators
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

## Features (10 Phases)

1. **Project Scaffolding & Theme** — Dark-themed React/Vite shell ✓
2. **Base Map** — Interactive 2.5D map centered on Iran ✓
3. **API Proxy** — Express backend for CORS + API key management (planned)
4. **Flight Data Feed** — Live flight tracking (~15s refresh)
5. **Entity Rendering** — Type-specific markers on map
6. **Ship & Conflict Data Feeds** — AIS ships + ACLED events
7. **Layer Controls & News Toggle** — Category visibility toggles
8. **Detail Panel** — Click-to-inspect with live stats
9. **Smart Filters** — Multi-criteria filtering (nationality, speed, altitude, etc.)
10. **Analytics Dashboard** — Running counters for strikes, sorties, intercepts

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
