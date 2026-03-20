---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Intelligence Layer
status: in-progress
stopped_at: Completed 17-02 (24h default event window)
last_updated: "2026-03-20T22:22:57Z"
last_activity: 2026-03-20 -- Completed Phase 17 Plan 02 (24h default event window)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 17 Notification Center

## Current Position

Phase: 17 of 20 (Notification Center)
Plan: 02 of 04 complete
Status: 24h default event window implemented
Last activity: 2026-03-20 -- Completed Phase 17 Plan 02 (24h default event window)

Progress: [██████░░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 6 (v1.1)
- Average duration: 5min
- Total execution time: 30min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 15 | 2/2 | 15min | 7.5min |
| 16 | 3/3 | 12min | 4min |
| 17 | 1/4 | 3min | 3min |

*Updated after each plan completion*

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
- **17-02:** isDefaultWindowActive is a pure derived getter (dateStart===null && dateEnd===null, no new stored state)
- **17-02:** 24h window applies to both events AND news clusters (per locked decision scope)
- **17-02:** useFilteredEntities return type extended to include clusters (backward-compatible)

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

Last session: 2026-03-20T22:22:57Z
Stopped at: Completed 17-02 (24h default event window)
Resume file: .planning/phases/17-notification-center/17-02-SUMMARY.md
