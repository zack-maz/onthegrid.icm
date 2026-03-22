---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Intelligence Layer
status: completed
stopped_at: Phase 19 context gathered
last_updated: "2026-03-22T18:57:19.072Z"
last_activity: 2026-03-21 -- Completed Phase 18 Plan 02 (oil markets client panel)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 18 Oil Markets Tracker

## Current Position

Phase: 18 of 20 (Oil Markets Tracker)
Plan: 02 of 02 complete
Status: Phase 18 complete (server data pipeline + client market panel with polling and charts)
Last activity: 2026-03-21 -- Completed Phase 18 Plan 02 (oil markets client panel)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v1.1)
- Average duration: 5min
- Total execution time: 38min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 15 | 2/2 | 15min | 7.5min |
| 16 | 3/3 | 12min | 4min |
| 17 | 4/4 | 13min | 3.25min |
| 18 | 2/2 | 4min | 2min |

*Updated after each plan completion*
| Phase 17 P01 | 3min | 1 tasks | 8 files |
| Phase 17 P03 | 6min | 2 tasks | 9 files |
| Phase 17 P04 | 4min | 2 tasks | 4 files |
| Phase 18 P01 | 2min | 2 tasks | 6 files |
| Phase 18 P02 | 2min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

- **15-01:** SiteEntity separate from MapEntity union (static reference data, different lifecycle)
- **15-01:** Single fetch on mount via useSiteFetch (no polling -- sites are static infrastructure)
- **15-01:** SiteConnectionStatus includes 'idle' state for pre-fetch (unlike polling stores)
- **15-01:** Overpass QL union query fetches all 6 site types in one request with fallback URL
- **15-02:** SiteEntity types widened throughout UI (MapEntity | SiteEntity) rather than adding to MapEntity union
- **15-02:** Attack status computed client-side with coarse bbox pre-filter + haversine
- **15-02:** Site toggles NOT suppressed during custom date range mode (static reference data)
- **15-02:** Glow/highlight layers widened to AnyEntity type alias for clean SiteEntity support
- **16-01:** GDELT DOC 2.0 ArtList mode with 250 maxrecords and 24h timespan for article discovery
- **16-01:** Jaccard similarity threshold 0.8 with 5-token minimum for fuzzy title clustering
- **16-01:** 7-day sliding window for news retention, 15-min cache TTL matching GDELT update frequency
- **16-02:** newsStore ConnectionStatus defined locally (same type as eventStore) to avoid cross-store coupling
- **16-02:** articleCount derived field sums articles across all clusters for aggregate stats
- **16-02:** 15-min polling interval matches GDELT DOC update frequency and server cache TTL
- **16-03:** GDELT sourcelang:english appended as inline query modifier (not separate param)
- **16-03:** RSS country mapping uses static config per feed (not runtime detection)
- **17-01:** numMentions/numSources as optional ConflictEventEntity.data fields (backward compat)
- **17-01:** Severity formula: typeWeight * log2(1+mentions) * log2(1+sources) * recencyDecay (~24h half-life)
- **17-01:** News matching uses 3-signal relevance: temporal (24h), geographic (100km haversine), keyword overlap
- **17-01:** parseInt || undefined for GDELT fields to distinguish missing from zero
- **17-02:** isDefaultWindowActive is a pure derived getter (dateStart===null && dateEnd===null, no new stored state)
- **17-02:** 24h window applies to both events AND news clusters (per locked decision scope)
- **17-02:** useFilteredEntities return type extended to include clusters (backward-compatible)
- **17-03:** FlyToHandler as null-rendering child of Map (uses useMap hook) for notification fly-to
- **17-03:** NotificationBell absolute positioning with detail panel offset matching FilterPanelSlot pattern
- **17-03:** readIds persisted to localStorage as JSON array, loaded on store init with try/catch safety
- **17-03:** markRead is idempotent (no-op if already read, prevents double-decrement)
- **17-04:** Pure computeProximityAlerts function exported separately from hook for testability
- **17-04:** HTML overlay via map.project() chosen over deck.gl layer for easy expand/collapse with React state
- **17-04:** RAF-throttled move event subscription prevents excessive re-renders during pan/zoom
- **17-04:** Coarse 0.5 degree bbox pre-filter reuses attackStatus.ts pattern at 50km scale

- **18-01:** Yahoo Finance v8 chart API with User-Agent header for bot detection avoidance
- **18-01:** Per-ticker fault isolation via Promise.allSettled (0-5 partial results)
- **18-01:** 5-min logical cache TTL matching planned client polling interval
- **18-01:** MarketQuote re-exported from src/types/entities.ts for frontend consumption
- **18-02:** ConnectionStatus defined locally in marketStore (same pattern as newsStore, no cross-store coupling)
- **18-02:** Delta animation reuses existing animate-delta CSS class from CounterRow (no new CSS)
- **18-02:** MarketsSlot positioned at top-14 below NotificationBell with detail-panel-aware right offset
- **18-02:** Accordion expand uses CSS max-height transition (0 to 160px) for smooth animation

Decisions are logged in PROJECT.md Key Decisions table.
Full v0.9 + v1.0 decision history archived in previous STATE.md.

### Pending Todos

None.

### Blockers/Concerns

- Overpass API rate limits may require caching strategy (mitigated: 24h cache + split queries)
- Yahoo Finance v8 chart API is unofficial (mitigated: graceful degradation + provider interface)
- GDELT DOC API noise filtering must be tuned for conflict relevance
- Redis command budget at ~92% capacity after 6 polling sources (monitor during Phase 18)

## Session Continuity

Last session: 2026-03-22T18:57:19.063Z
Stopped at: Phase 19 context gathered
Resume file: .planning/phases/19-search-filter-ui-cleanup/19-CONTEXT.md
