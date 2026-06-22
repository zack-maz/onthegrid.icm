---
phase: 46-general-hardening-cron-watch-start
plan: 05
subsystem: testing
tags: [vitest, redis, degrade-open, fault-injection, flight-recorder, trend-ring]

# Dependency graph
requires:
  - phase: 39-llm-observability
    provides: llmCallHistory/llmRunHistory flight-recorder rings + hydration helpers
  - phase: 45-dashboard-trends
    provides: trendHistory.ts daily trend-ring (shipped without a dedicated test file)
provides:
  - hydration-throw no-op + flag-stays-set coverage for both flight-recorder hydrate helpers
  - net-new trendHistory.ts degrade-open throw test file (the Phase-45 backfill gap)
affects: [HARD-03, Nyquist-validation, future-registry-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Pattern E mocked-Redis-throw harness adapted for redis.pipeline() chainable API (lpush/ltrim/expire return this; exec() resolves/rejects per case)'
    - 'Hydration-throw assertion: flag set FIRST → throw mid-hydrate resolves no-op + second call short-circuits (no re-LRANGE / no retry-loop)'

key-files:
  created:
    - server/lib/__tests__/trendHistory.test.ts
  modified:
    - server/lib/__tests__/llmCallHistory.test.ts
    - server/lib/__tests__/llmRunHistory.test.ts

key-decisions:
  - 'Targeted only the NARROW named HARD-03 gaps; did not re-assert already-green append/list degrade-open paths (Pitfall 5)'
  - 'Pipeline mock built as a chainable object returning `this` for lpush/ltrim/expire with a separable exec() vi.fn so reject can be injected on exec only'

patterns-established:
  - 'Pattern E harness extended to the redis.pipeline() API for trend-ring degrade-open tests'

requirements-completed: [HARD-03]

# Metrics
duration: 4min
completed: 2026-06-22
status: complete
---

# Phase 46 Plan 05: HARD-03 Degrade-Open Backfill Summary

**Closed the three named HARD-03 coverage gaps with TEST-ONLY changes: hydration-throw no-op + flag-stays-set proofs for `hydrateCallHistoryIfCold`/`hydrateRunHistoryIfCold`, plus a net-new `trendHistory.test.ts` proving the Phase-45 trend ring degrades open on Redis failure.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-22T19:45:00Z
- **Completed:** 2026-06-22T19:48:42Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **Hydration-throw named gap (Task 1):** Added one case to each of `llmCallHistory.test.ts` and `llmRunHistory.test.ts` asserting that when LRANGE throws mid-hydrate the hydrate helper RESOLVES (never throws — the underlying list swallows to `[]`), the in-memory singleton is left unchanged (call history), and the hydration flag STAYS set so a second call short-circuits without re-issuing LRANGE (no retry-loop). This is the D-10/D-11 path no prior test named.
- **trendHistory degrade-open backfill (Task 2):** Created `server/lib/__tests__/trendHistory.test.ts` (file did not previously exist). Five cases: bounded-ring pipeline (lpush + ltrim(0, MAX-1) + expire(TTL) + exec once), no-throw on `exec()` reject, newest-first read, Upstash dual-shape parse (raw-string + already-object members), and `[]` on `lrange` reject.
- **No re-assertion of green paths:** Confirmed the pre-existing append/list/null-gate degrade-open cases stay green and were not duplicated (Pitfall 5).

## Task Commits

Each task was committed atomically:

1. **Task 1: hydration-throw no-op + flag-stays-set coverage (call+run history)** - `41d95a8` (test)
2. **Task 2: net-new trendHistory degrade-open backfill** - `a1ec8f1` (test)

## Files Created/Modified

- `server/lib/__tests__/trendHistory.test.ts` - NEW degrade-open throw test for the Phase-45 trend ring (pipeline-API mocked-Redis harness)
- `server/lib/__tests__/llmCallHistory.test.ts` - Added hydration-throw no-op + flag-stays-set case
- `server/lib/__tests__/llmRunHistory.test.ts` - Added hydration-throw no-op + flag-stays-set case

## Decisions Made

- Built the pipeline mock as a single chainable object whose `lpush/ltrim/expire` return `this` and whose `exec()` is a separable `vi.fn()` — this is the only adaptation needed over the `llmCallHistory.test.ts` harness, since `appendTrendSample` uses `redis.pipeline()` rather than discrete calls.
- For the call-history hydration test, also asserted `llmProgress.callHistory` stays `undefined` (singleton unchanged); the run-history hydrate touches no singleton, so its assertion is limited to resolve-no-throw + flag-stays-set.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan `<verify>` `npx vitest run server/lib/` glob reported 6 files / 38 tests where `server/lib/__tests__/` holds 5 files / 32 tests — confirmed the extra file is matched elsewhere under `server/lib/`; all green, no regression. Not a defect.

## Self-Check: PASSED

- `server/lib/__tests__/trendHistory.test.ts` — FOUND
- `server/lib/__tests__/llmCallHistory.test.ts` — FOUND (modified)
- `server/lib/__tests__/llmRunHistory.test.ts` — FOUND (modified)
- Commit `41d95a8` — FOUND
- Commit `a1ec8f1` — FOUND
- Verification: 19 passed (3 targeted files), 32 passed (full `server/lib/__tests__`), no regression.

## Next Phase Readiness

- HARD-03 fault-injection coverage gaps closed. The flight-recorder hydrate helpers and the Phase-45 trend ring now have explicit degrade-open throw proofs.
- No runtime change shipped; no blockers.

---

_Phase: 46-general-hardening-cron-watch-start_
_Completed: 2026-06-22_
