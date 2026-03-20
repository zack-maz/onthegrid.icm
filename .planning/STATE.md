---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Intelligence Layer
status: completed
stopped_at: Completed 15-02-PLAN.md (Phase 15 complete)
last_updated: "2026-03-20T16:41:38.304Z"
last_activity: 2026-03-20 -- Completed Phase 15 Plan 02 (rendering + UI)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 15 Key Sites Overlay

## Current Position

Phase: 15 of 20 (Key Sites Overlay) -- first phase of v1.1
Plan: 02 of 02 complete
Status: Phase 15 complete -- ready for Phase 16
Last activity: 2026-03-20 -- Completed Phase 15 Plan 02 (rendering + UI)

Progress: [##░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 2 (v1.1)
- Average duration: 7.5min
- Total execution time: 15min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 15 | 2/2 | 15min | 7.5min |

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

Last session: 2026-03-20T16:35:26Z
Stopped at: Completed 15-02-PLAN.md (Phase 15 complete)
Resume file: Next phase (Phase 16)
