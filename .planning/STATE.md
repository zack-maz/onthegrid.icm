---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: Completed 04-02-PLAN.md
last_updated: "2026-03-15T16:27:31Z"
last_activity: 2026-03-15 -- Phase 4 Plan 02 completed (frontend flight polling pipeline)
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 4: Flight Data Feed -- COMPLETE. All plans executed.

## Current Position

Phase: 4 of 10 (Flight Data Feed) -- COMPLETE
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase 4 complete. Flight pipeline with frontend polling, store, and Vite proxy.
Last activity: 2026-03-15 -- Phase 4 Plan 02 completed (frontend flight polling pipeline)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 4.1min
- Total execution time: 0.62 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Project Scaffolding & Theme | 1 | 5min | 5min |
| 2. Base Map | 3 | 14min | 4.7min |
| 3. API Proxy | 3 | 11min | 3.7min |
| 4. Flight Data Feed | 2 | 5min | 2.5min |

**Recent Trend:**
- Last 5 plans: 03-01 (4min), 03-02 (5min), 03-03 (2min), 04-01 (3min), 04-02 (2min)
- Trend: Stable/improving

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Deck.gl + MapLibre for 2.5D map (GPU-accelerated, free)
- React 19 + Vite 6 + TypeScript 5 + Tailwind CSS 4 (from research)
- Zustand 5 for state management
- Express 5 as API proxy
- Common MapEntity interface to normalize all data sources
- Used Tailwind CSS v4 CSS-first @theme configuration (no tailwind.config.js)
- Pinned TypeScript to ~5.9.3 to avoid TS 6.0 breaking changes
- Zustand store uses curried create<UIState>()() pattern for type inference
- Z-index scale defined as CSS custom properties for consistent overlay layering
- Mocked maplibre-gl and @deck.gl/mapbox via vite.config.ts test.alias for jsdom compatibility
- Used it.todo() for unimplemented component stubs to avoid import errors while keeping test presence
- DeckGLOverlay wraps MapboxOverlay via useControl hook from react-maplibre
- Imperative style customization in onLoad with getLayer() guards -- never pre-fetch/modify CARTO style.json
- CompassControl renders null (behavior-only) using useMap hook and DOM querySelector for compass button
- Zustand selector pattern (s => s.field) in BaseMap components to minimize re-renders
- AWS Terrarium S3 tiles for global DEM coverage (MapLibre demo was Alps-only)
- Terrain exaggeration 3.0 with pitch 50 for dramatically visible mountains
- Hillshade exaggeration 0.6 with brighter highlights (#444444) for ridge contrast
- Vignette opacity 0.25 per user feedback (was 0.6, too dark)
- tiles array + encoding prop pattern for raster-dem sources without TileJSON endpoints
- Lazy config loading via loadConfig() to allow tests to run without env vars
- Proxy object for config convenience access with cached lazy evaluation
- createApp() factory pattern for Express app to enable test isolation
- erasableSyntaxOnly compatibility: explicit field + constructor assignment instead of parameter properties
- vitest-environment node directive per test file instead of workspace config
- UTC date formatting in ACLED adapter to avoid timezone-dependent date drift
- Mock adapter modules in security tests instead of mocking fetch globally, to test actual HTTP responses
- AISStream reconnect uses simple 5s setTimeout (not exponential backoff) matching plan spec
- Inline process.env reads for PORT/CORS_ORIGIN instead of getServerConfig() helper -- simpler, no unnecessary abstraction
- Node --env-file-if-exists=.env flag (Node 22.14+) instead of dotenv dependency for optional .env loading
- Guard connectAISStream() with env var presence check -- explicit opt-in for optional services
- onGround filter as early return null in normalizeFlightState for efficiency
- unidentified flag derived from empty trimmed callsign at adapter level
- Cache-first route pattern: check cache freshness before upstream call, conserve API credits
- Recursive setTimeout (not setInterval) for polling -- waits for async completion before scheduling next
- 60s stale threshold based on flight drift: 250m/s aircraft moves ~15km in 60s
- Zustand getState() for staleness check in setTimeout callback avoids stale closures
- Polling hook is behavior-only -- no return value, writes directly to Zustand store

### Pending Todos

None yet.

### Blockers/Concerns

- API rate limits on free tiers (OpenSky, AIS) may constrain refresh rates
- ACLED data has inherent delay (hours/days) -- set user expectations in UI
- 5K+ simultaneous entities may impact frame rate -- plan for viewport culling

## Session Continuity

Last session: 2026-03-15T16:27:31Z
Stopped at: Completed 04-02-PLAN.md
Resume file: Phase 4 complete. Next phase TBD.
