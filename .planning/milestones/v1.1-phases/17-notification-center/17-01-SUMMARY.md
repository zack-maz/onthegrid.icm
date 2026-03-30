---
phase: 17-notification-center
plan: 01
subsystem: data
tags: [severity, scoring, news-matching, haversine, time-grouping, gdelt, conflict-events]

# Dependency graph
requires:
  - phase: 08-conflict-events
    provides: ConflictEventEntity type and GDELT adapter
  - phase: 16-news-feed
    provides: NewsCluster and NewsArticle types
provides:
  - computeSeverityScore pure function for ranking conflict events
  - matchNewsToEvent pure function for pairing news headlines to events
  - getTimeGroup utility for notification time bucketing
  - Extended ConflictEventEntity.data with numMentions/numSources fields
affects: [17-notification-center]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function scoring, multi-signal relevance ranking, temporal bucketing]

key-files:
  created:
    - src/lib/severity.ts
    - src/lib/newsMatching.ts
    - src/lib/timeGroup.ts
  modified:
    - server/types.ts
    - server/adapters/gdelt.ts
    - server/__tests__/gdelt.test.ts
    - src/__tests__/severity.test.ts
    - src/__tests__/newsMatching.test.ts

key-decisions:
  - "numMentions/numSources optional fields (backward compat with cached/backfilled data)"
  - "Severity formula: typeWeight * log2(1+mentions) * log2(1+sources) * recencyDecay with ~24h half-life"
  - "News matching uses 3-signal relevance: temporal (24h window), geographic (100km haversine), keyword overlap"
  - "parseInt || undefined pattern for GDELT fields to avoid misleading 0 values"

patterns-established:
  - "Pure scoring functions consuming entity types for testable computation"
  - "Multi-signal relevance scoring with configurable weights and thresholds"

requirements-completed: [NOTF-02, NOTF-03]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 17 Plan 01: Data Layer Foundations Summary

**Pure severity scoring, news-to-event matching, and time grouping functions with GDELT numMentions/numSources extension**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T22:19:46Z
- **Completed:** 2026-03-20T22:23:00Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments
- Extended ConflictEventEntity.data with optional numMentions and numSources fields (backward compatible)
- Created computeSeverityScore with type-weighted, mention/source-scaled, recency-decayed formula
- Created matchNewsToEvent with temporal + geographic + keyword relevance scoring (max 3 results)
- Created getTimeGroup utility with last_hour/last_day/last_week bucketing
- Full test coverage: all 650 tests passing (55 new + 595 existing, zero regressions)

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: Failing tests** - `6686eb5` (test)
2. **Task 1 GREEN: Implementation** - `72fbe02` (feat)

**Plan metadata:** TBD (docs: complete plan)

_TDD task with RED/GREEN commits._

## Files Created/Modified
- `src/lib/severity.ts` - Pure severity scoring function with type weights and recency decay
- `src/lib/newsMatching.ts` - News-to-event matching with multi-signal relevance ranking
- `src/lib/timeGroup.ts` - Time group bucketing utility (last_hour/last_day/last_week)
- `server/types.ts` - Extended ConflictEventEntity.data with numMentions/numSources
- `server/adapters/gdelt.ts` - Added NumSources to COL map, populate both fields in normalizer
- `server/__tests__/gdelt.test.ts` - Added tests for numMentions/numSources parsing
- `src/__tests__/severity.test.ts` - Severity scoring tests (type weights, mentions, recency, defaults)
- `src/__tests__/newsMatching.test.ts` - News matching tests (temporal window, max 3, geo boost, keywords)

## Decisions Made
- numMentions/numSources as optional fields for backward compatibility with existing cached data
- Severity formula uses log2 scaling for mentions/sources to dampen outlier effects
- Recency decay half-life of ~24h (1/(1+ageHours/24)) balances freshness vs history
- parseInt || undefined pattern (not || 0) for GDELT fields to distinguish missing from zero
- News matching 24h temporal window, 100km geo radius, 2x geo weight, 0.5 per keyword overlap

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Pure scoring/matching functions ready for notification store (Plan 03) consumption
- Type extensions backward compatible - no migration needed for existing cached data
- All contracts tested and verified

## Self-Check: PASSED

All 8 created/modified files verified on disk. Both commit hashes (6686eb5, 72fbe02) verified in git log.

---
*Phase: 17-notification-center*
*Completed: 2026-03-20*
