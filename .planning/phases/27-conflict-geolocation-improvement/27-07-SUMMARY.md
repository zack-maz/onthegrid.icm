---
phase: 27-conflict-geolocation-improvement
plan: 07
subsystem: api
tags: [zod, redis, cache-migration, type-normalization, gdelt]

# Dependency graph
requires:
  - phase: 27-01
    provides: 5-type ConflictEventType taxonomy (airstrike, on_ground, explosion, targeted, other)
  - phase: 27-04
    provides: client-side 5-type cascade (CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS, filterStore)
provides:
  - normalizeEventTypes() pure function remapping old 11-type to new 5-type taxonomy
  - sendNormalizedEvents helper wrapping all events route response paths
affects: [events-route, cache-migration, event-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-migration-via-normalization-layer]

key-files:
  created:
    - server/lib/normalizeEventTypes.ts
    - server/__tests__/lib/normalizeEventTypes.test.ts
  modified:
    - server/routes/events.ts

key-decisions:
  - "Normalization layer over cache flush: chose runtime remapping before Zod validation rather than flushing Redis, because it handles both stale cache AND any edge case where old-format data re-enters the pipeline"
  - "sendNormalizedEvents helper centralizes normalization: single wrapper function used at all 7 response paths, rather than 7 inline normalizeEventTypes calls, for DRY and auditability"

patterns-established:
  - "Cache migration via normalization layer: when schema changes break cached data, add a runtime normalization step before validation rather than requiring cache flush"

requirements-completed: [D-08]

# Metrics
duration: 4min
completed: 2026-04-09
---

# Phase 27 Plan 07: Event Type Normalization (Gap Closure) Summary

**normalizeEventTypes() migration layer remaps old 11-type CAMEO taxonomy to new 5-type system before Zod validation, unblocking all event visibility on the map**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-09T20:49:52Z
- **Completed:** 2026-04-09T20:53:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created normalizeEventTypes() pure function with complete old-to-new type mapping (10 old types to 5 new types)
- Wired normalization into all 7 sendValidated response paths in events route via sendNormalizedEvents helper
- Unblocked event visibility: stale Redis cache with old taxonomy no longer causes 500 schema mismatch or silent drops
- 23 unit tests covering all mapping directions, passthrough, data.eventType normalization, and immutability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create normalizeEventTypes utility with tests** - `c9c946f` (feat, TDD)
2. **Task 2: Wire normalizeEventTypes into all 7 sendValidated paths** - `c4716b2` (fix)

## Files Created/Modified
- `server/lib/normalizeEventTypes.ts` - Pure function mapping OLD_TO_NEW_TYPE record, normalizes both event.type and data.eventType
- `server/__tests__/lib/normalizeEventTypes.test.ts` - 23 tests: all 10 old types, 5 new type passthroughs, data.eventType, edge cases, immutability
- `server/routes/events.ts` - Added import + sendNormalizedEvents helper + replaced all 7 sendValidated call sites

## Decisions Made
- Normalization layer over cache flush: runtime remapping before Zod validation handles both stale cache AND any edge case where old-format data re-enters the pipeline (e.g., backfill producing old types)
- sendNormalizedEvents helper centralizes normalization at a single wrapper function, so all 7 response paths are auditable from one location
- data.eventType also normalized when it matches an old type key, keeping inner data consistent with top-level type field
- No-copy optimization: events already using new types are returned as-is (no shallow copy) for performance on large arrays

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Events with old cached types will now be served correctly with new 5-type taxonomy
- UAT blocker (Test 4: "Not seeing any events at all") should be resolved
- Plan 08 (toggle cleanup) can proceed independently as it addresses separate UAT issue (Test 3)

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
