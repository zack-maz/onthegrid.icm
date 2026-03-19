# Iran Conflict Monitor — Project Status

**Last updated:** 2026-03-18

## Progress

```
[████████████████████] 12/12 phases complete (100%)
```

## Phase Status

| Phase | Name | Status | Date |
|-------|------|--------|------|
| 1 | Project Scaffolding & Theme | Done | 2026-03-14 |
| 2 | Base Map | Done | 2026-03-14 |
| 3 | API Proxy | Done | 2026-03-15 |
| 4 | Flight Data Feed | Done | 2026-03-15 |
| 5 | Entity Rendering | Done | 2026-03-15 |
| 6 | Multi-Source Flight Data | Done | 2026-03-16 |
| 7 | StatusPanel & Source Config | Done | 2026-03-16 |
| 8 | Ship & Conflict Data | Done | 2026-03-16 |
| 8.1 | GDELT Conflict Events | Done | 2026-03-17 |
| 9 | Layer Controls & News Toggle | Done | 2026-03-17 |
| 10 | Detail Panel & Event Reclassification | Done | 2026-03-18 |
| 11 | Smart Filters | Done | 2026-03-18 |
| 12 | Analytics Dashboard | Done | 2026-03-18 |

## Current Focus

All v1.0 milestone phases complete.

## What's Been Built

### Phase 1: Project Scaffolding & Theme (Complete)
- Vite 6 + React 19 + TypeScript 5.9 scaffold
- Tailwind CSS v4 dark theme with semantic color tokens
- AppShell layout with full-viewport dark shell and z-indexed overlay regions
- Zustand UI store with panel visibility toggles

### Phase 2: Base Map (Complete)
- Interactive 2.5D map centered on Iran using Deck.gl + MapLibre
- CARTO Dark Matter base tiles, AWS Terrarium DEM terrain (3x exaggeration)
- Compass control, coordinate readout, scale bar, vignette, loading animation

### Phase 3: API Proxy (Complete)
- Express 5 server with OpenSky, AISStream, ACLED adapters
- In-memory cache with TTLs, security middleware

### Phase 4: Flight Data Feed (Complete)
- Recursive setTimeout polling with tab visibility awareness
- Connection health tracking, stale data clearing (60s threshold)

### Phase 5: Entity Rendering (Complete)
- Deck.gl IconLayer markers with type-specific icons and colors
- Altitude-based opacity, zoom-responsive sizing (meters + pixel bounds)

### Phase 6-7: Multi-Source Flights & StatusPanel (Complete)
- Three flight sources: OpenSky, ADS-B Exchange, adsb.lol
- StatusPanel HUD with connection health dots and entity counts
- Source persistence in localStorage

### Phase 8-8.1: Ship & Conflict Data (Complete)
- Ship polling (30s), event polling (15min)
- GDELT v2 adapter: ZIP download → CSV parse → FIPS/CAMEO filtering
- Event deduplication by date/code/location

### Phase 9: Layer Controls & News Toggle (Complete)
- Layer toggles panel with hover glow/highlight feedback
- EntityTooltip with per-type content and GDELT metadata
- StatusPanel counts reflect only visible entities per toggle and type
- Zoom +/- controls, localStorage persistence for all toggles

### Phase 10: Detail Panel & Event Reclassification (Complete)
- Detail panel: 360px right-side slide-out with FlightDetail, ShipDetail, EventDetail
- Flash-on-change values, "Updated Xs ago" ticker, lost contact state
- Copy-to-clipboard coordinates, Escape/close dismiss
- 11 CAMEO-based ConflictEventType categories (airstrike, ground_combat, shelling, etc.)
- 4 conflict toggle groups replacing Drones/Missiles/News
- New explosion and crosshair map icons
- Unidentified flight filter takes precedence over Ground filter
- 365 tests passing

### Phase 11: Smart Filters (Complete)
- Advanced filtering by nationality, speed, altitude, proximity, date range
- FilterPanelSlot with collapsible sections and pin-to-map proximity filter

### Phase 12: Analytics Dashboard (Complete)
- Counters panel with Flights (Iranian, Unidentified) and Events (Airstrikes, Ground Combat, Targeted, Fatalities)
- Visibility-aware: counters reflect only entities visible on the map (toggle + smart filter gating)
- Green +N delta animation with 3s fade on value changes
- Fixed-width label column for vertically aligned values
- 534 tests passing

## Blockers

None.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Deck.gl + MapLibre | GPU-accelerated 2.5D, free, native layer system |
| Zustand 5 | Lightweight state with curried create pattern for type inference |
| Express 5 API proxy | CORS handling, API key protection, data normalization |
| GDELT v2 over ACLED | Free, no auth required, 15-min updates, global coverage |
| GDELT deduplication | Same event appears multiple times with different actors; keep highest-mention row |
| pickable: false on glow/highlight | Prevents hover blink from layer picking interference |
| CAMEO-based event types | 11 granular types replace fabricated drone/missile split — maps directly to GDELT data |
| Unidentified filter precedence | Unidentified flights are high-interest — should always show regardless of Ground toggle |

## Repository

- **Remote**: https://github.com/zack-maz/irt.git
- **Branch strategy**: Feature branches, never commit to main directly
