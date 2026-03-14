# Architecture Research: Iran Conflict Monitor

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Map View │  │ Detail   │  │ Filters  │  │ Stats   │ │
│  │ (Deck.gl)│  │ Panel    │  │ & Layers │  │ Panel   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       └──────────────┴─────────────┴─────────────┘      │
│                        │ Zustand Store                    │
│                        │                                 │
│  ┌─────────────────────┴──────────────────────────────┐ │
│  │              Data Service Layer                     │ │
│  │  WebSocket Manager  │  Polling Manager  │  Cache    │ │
│  └─────────────────────┬──────────────────────────────┘ │
└────────────────────────┼────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────┼────────────────────────────────┐
│                  API Proxy (Express)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ OpenSky  │  │ AIS Hub  │  │ ACLED    │  │ Cache   │ │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ (SQLite)│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┘ │
└───────┼──────────────┼──────────────┼───────────────────┘
        │              │              │
   ┌────┴───┐    ┌─────┴────┐   ┌────┴────┐
   │OpenSky │    │ AIS Hub  │   │ ACLED   │
   │  API   │    │   API    │   │  API    │
   └────────┘    └──────────┘   └─────────┘
```

## Major Components

### 1. API Proxy Server (Express/Node.js)

**Purpose:** Centralize API access, manage keys, handle CORS, normalize data.

**Responsibilities:**
- Proxy requests to external APIs (avoids CORS in browser)
- Store API keys server-side (never expose to frontend)
- Normalize heterogeneous data into a common entity format
- Cache responses in SQLite to reduce rate limit pressure
- Serve WebSocket connections to frontend for real-time data

**Common Entity Format:**
```typescript
interface MapEntity {
  id: string;
  type: 'flight' | 'ship' | 'missile' | 'drone' | 'event';
  lat: number;
  lng: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  label: string;
  metadata: Record<string, unknown>;
  source: string;
  timestamp: number;  // Unix ms
  stale: boolean;     // Computed: is data older than threshold?
}
```

**Build order:** First — everything depends on data.

### 2. Data Adapters (per source)

**Purpose:** Translate each API's format into the common entity format.

Each adapter handles:
- Authentication (API keys, tokens)
- Rate limit management (backoff, retry)
- Response parsing → `MapEntity[]`
- Error handling (API down, malformed response)

**Adapters needed:**
- `OpenSkyAdapter` — REST + WebSocket for flights
- `AISAdapter` — REST polling for ships
- `ACLEDAdapter` — REST polling for conflict events

**Build order:** Second — after proxy skeleton.

### 3. Data Service Layer (Frontend)

**Purpose:** Manage connections to proxy, handle mixed refresh rates, update store.

**Sub-components:**
- **WebSocket Manager** — Maintains persistent connection for flight data (~5s updates)
- **Polling Manager** — Scheduled fetch for ships (30-60s) and events (1-5 min)
- **Cache Layer** — In-memory cache with TTL to prevent re-renders on unchanged data
- **Staleness Tracker** — Marks entities as stale when no update received within threshold

**Build order:** Third — after adapters provide data.

### 4. State Store (Zustand)

**Purpose:** Single source of truth for all UI and data state.

**Store slices:**
```
entities: Map<string, MapEntity>     // All current entities
filters: FilterState                  // Active filters
layers: Record<EntityType, boolean>   // Layer visibility
selectedEntity: string | null         // Currently selected
panelOpen: boolean                    // Detail panel state
mapViewState: ViewState               // Camera position, zoom
snapshots: SnapshotMeta[]             // Saved snapshot list
```

**Build order:** Third — parallel with data service.

### 5. Map View (Deck.gl + MapLibre)

**Purpose:** Render 2.5D map with all entity layers.

**Layer stack (bottom to top):**
1. MapLibre base map (dark tiles)
2. HexagonLayer — event density heatmap
3. ScatterplotLayer — entity positions
4. IconLayer — typed entity icons
5. ArcLayer — trajectories, missile paths
6. TextLayer — labels (optional, toggle)

**Interactions:**
- Click entity → select → open detail panel
- Hover → tooltip with basic info
- Zoom/pan/rotate — standard map controls

**Build order:** Fourth — needs data and store.

### 6. UI Panels

**Purpose:** Controls and detail displays around the map.

**Components:**
- **Layer Toggle Bar** — Checkboxes/buttons per entity type
- **Filter Panel** — Expandable advanced filters (nationality, speed, altitude, etc.)
- **Detail Panel** — Side panel showing selected entity's full data
- **Stats Bar** — Running tallies (strikes, sorties, active flights, active ships)
- **Snapshot Controls** — Save/load/list snapshots

**Build order:** Fifth — after map is rendering.

### 7. Snapshot System

**Purpose:** Save and restore map state + data as JSON files.

**Snapshot format:**
```json
{
  "timestamp": "2026-03-13T18:00:00Z",
  "label": "User label",
  "viewState": { "latitude": 32.4, "longitude": 53.7, "zoom": 6 },
  "entities": [...],
  "filters": {...},
  "layers": {...}
}
```

**Storage:** JSON files in a local `./snapshots/` directory, served via Express.

**Build order:** Last — everything else must work first.

## Data Flow

```
External APIs
  → API Proxy (normalize, cache)
    → WebSocket / HTTP to frontend
      → Data Service (manage connections)
        → Zustand Store (entities, filters)
          → Deck.gl Layers (render)
            → User interaction
              → Store update (filter, select, toggle)
                → Deck.gl re-render
```

## Mixed Refresh Rate Handling

| Source | Transport | Interval | Strategy |
|--------|-----------|----------|----------|
| OpenSky (flights) | WebSocket/SSE | ~5s | Persistent connection, stream updates |
| AIS (ships) | REST polling | 30-60s | `setInterval` with jitter, skip if unchanged |
| ACLED (events) | REST polling | 1-5 min | `setInterval`, merge new events with existing |

**Staleness thresholds:**
- Flights: stale after 30s without update
- Ships: stale after 5 min without update
- Events: never stale (historical by nature)

## Suggested Build Order

1. **Project scaffolding** — Vite + React + TypeScript + Tailwind
2. **API proxy skeleton** — Express with health check, env-based config
3. **First data adapter** — OpenSky flights (most real-time, proves the pipeline)
4. **Base map rendering** — MapLibre dark map with Deck.gl overlay
5. **Entity rendering** — ScatterplotLayer with flight positions
6. **Store + layer toggles** — Zustand, basic UI controls
7. **Detail panel** — Click entity → show data
8. **Ship adapter** — AIS data, second entity type
9. **Conflict event adapter** — ACLED data, third type
10. **Advanced filters** — Smart filtering UI
11. **2.5D visualization** — HexagonLayer, ArcLayer
12. **Stats dashboard** — Counts, tallies, timeline
13. **Snapshot system** — Save/load JSON
14. **Polish** — Staleness indicators, error states, loading states
