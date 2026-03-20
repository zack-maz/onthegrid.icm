---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Deployment
current_plan: 4 of 4
status: complete
stopped_at: Completed 13-04-PLAN.md (lazy backfill gap closure)
last_updated: "2026-03-20T01:15:03Z"
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 13 serverless cache migration complete (all 4 plans done, including backfill gap closure)

## Current Position

Milestone: v1.0 Deployment
Phase: 13-serverless-cache-migration
Current Plan: 4 of 4

## Performance Metrics

**Velocity:**
- Total plans completed: 28
- Average duration: 4.5min
- Total execution time: ~2 hours

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13    | 01   | 3min     | 2     | 6     |
| 13    | 02   | 3min     | 2     | 6     |
| 13    | 03   | 4min     | 2     | 5     |
| 13    | 04   | 3min     | 1     | 2     |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Full decision history archived in milestones/v0.9-ROADMAP.md STATE section.

- [13-01] Upstash Redis with REST-based client for serverless compatibility
- [13-01] Redis hard TTL = 10x logical TTL for stale-but-servable fallback data
- [13-01] CacheEntry<T> stores {data, fetchedAt} for staleness computation
- [13-02] On-demand WebSocket pattern: connect, collect for N ms, close (no persistent connections)
- [13-02] Ship merge/prune: fresh ships merged with cached by ID, 10 min stale threshold
- [13-03] Events route uses Redis accumulator with merge-by-ID upsert and WAR_START pruning
- [13-03] REDIS_TTL_SEC = 9000 (2.5 hours) for events, consistent with 10x multiplier pattern
- [13-03] EntityCache deleted -- all routes now use Redis cacheGet/cacheSet
- [13-04] Lazy backfill on cache miss with 1-hour cooldown via Redis timestamp
- [13-04] Backfill failure is non-fatal -- route continues with fetchEvents data

### Pending Todos

None.

### Blockers/Concerns

- API rate limits on free tiers (OpenSky, AIS) may constrain refresh rates
- 5K+ simultaneous entities may impact frame rate -- plan for viewport culling

## Session Continuity

Last session: 2026-03-20T01:11:22Z
Stopped at: Completed 13-04-PLAN.md (lazy backfill gap closure)
Resume file: N/A (phase complete)
