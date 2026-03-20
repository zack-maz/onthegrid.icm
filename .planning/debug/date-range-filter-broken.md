---
status: diagnosed
trigger: "Investigate why the date range filter is no longer working after the Phase 13 serverless cache migration."
created: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:00:00Z
---

## Current Focus

hypothesis: The Phase 13 rewrite of events.ts removed the backfill mechanism that populated historical events; the server-side route never had query-parameter-based date filtering -- date filtering was always client-side. The real problem is that the Redis accumulator only accumulates events from GDELT's 15-minute "latest" feed, losing the startup backfill that populated historical data back to WAR_START.
test: Compare pre-Phase-13 events.ts (backfill on startup) to post-Phase-13 (no backfill)
expecting: Phase 13 dropped backfillEvents() call entirely
next_action: Report diagnosis

## Symptoms

expected: Date range slider filters events across the full war timeline (Feb 28, 2026 to now)
actual: Date range filter likely shows very few or no events outside the most recent 15-minute GDELT window
errors: No error messages -- the filter UI works, but the data pool is too small to be useful
reproduction: Set date range start to a date days or weeks ago -- few/no events appear
started: After Phase 13 serverless cache migration

## Eliminated

- hypothesis: Server-side query parameter filtering was lost in Phase 13 rewrite
  evidence: The pre-Phase-13 events route NEVER had query parameter handling. The route handler used `_req` (underscore prefix = unused). Date filtering was always client-side in `entityPassesFilters()` in `src/lib/filters.ts`.
  timestamp: 2026-03-19

- hypothesis: Client-side date filter logic was broken
  evidence: `src/lib/filters.ts` entityPassesFilters() has intact date range logic at lines 94-101. filterStore.ts has intact dateStart/dateEnd state. DateRangeFilter.tsx UI component is unchanged. All test files have comprehensive coverage of date range features.
  timestamp: 2026-03-19

## Evidence

- timestamp: 2026-03-19
  checked: Pre-Phase-13 events route (git show 86b6294:server/routes/events.ts)
  found: The old route had NO query parameter handling (_req unused). BUT it had a critical backfillEvents() call on module load that fetched historical events from GDELT's master file list covering all days since WAR_START.
  implication: Date filtering was always client-side; the server's job was to accumulate a large pool of historical events via backfill.

- timestamp: 2026-03-19
  checked: Post-Phase-13 events route (current server/routes/events.ts)
  found: The Phase 13 rewrite removed both `backfillEvents` import and the startup backfill logic entirely. The route now only calls `fetchEvents()` which fetches GDELT's latest 15-minute update. Events accumulate in Redis over time (merge pattern), but there is no backfill to seed historical data.
  implication: The Redis accumulator starts empty and only grows by 15-minute increments. On cold start or Redis flush, the entire event history is lost.

- timestamp: 2026-03-19
  checked: GDELT adapter (server/adapters/gdelt.ts)
  found: `backfillEvents()` function still exists in the adapter (lines 305-337). It fetches the GDELT master file list and downloads all export ZIPs for a given day range. It was simply never wired into the new events route.
  implication: The fix is straightforward -- the backfill function exists but is unused.

- timestamp: 2026-03-19
  checked: Client-side filtering pipeline
  found: useEventPolling.ts calls `fetch('/api/events')` with no query params. useFilteredEntities.ts applies entityPassesFilters() with dateStart/dateEnd from filterStore. The filter logic at src/lib/filters.ts lines 94-101 correctly filters events by timestamp for non-flight/non-ship entities. All client-side code is intact and correct.
  implication: The filtering pipeline works correctly -- it just has no historical data to filter.

- timestamp: 2026-03-19
  checked: Git diff between date-filter commit (86b6294) and Phase 13 migration (386d140)
  found: The diff shows removal of: backfillEvents import, backfill state file management (getLastBackfillTs/saveLastBackfillTs), the startup backfill block that ran on module load, and the in-memory eventMap accumulator.
  implication: Phase 13 migration was a clean rewrite focused on Redis caching -- the backfill feature was collateral damage.

## Resolution

root_cause: Phase 13 migration of events.ts to Redis caching dropped the `backfillEvents()` startup call. Pre-Phase-13, the events route loaded historical events from GDELT's master file list on server startup, covering all days since WAR_START (Feb 28, 2026). Post-Phase-13, the route only accumulates events from the 15-minute "latest" GDELT feed. On cold start or Redis eviction (REDIS_TTL_SEC=9000, ~2.5 hours), the event pool resets to a single 15-minute window. The date range filter UI works correctly but has almost no historical data to filter against.
fix:
verification:
files_changed: []
