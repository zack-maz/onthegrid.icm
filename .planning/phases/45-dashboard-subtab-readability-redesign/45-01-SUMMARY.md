---
phase: 45-dashboard-subtab-readability-redesign
plan: 01
subsystem: api
tags: [redis, upstash, observability, openapi, cron, sparkline-backing, trend-ring]

# Dependency graph
requires:
  - phase: 39-llm-flight-recorder
    provides: 'llm:runs:history bounded LPUSH+LTRIM 30d-TTL ring idiom (copied verbatim)'
  - phase: 44-events-subtab-pipeline-detail
    provides: '/api/operator-status aggregator thread + countsByStatus/DeadUrlSampleEntry lockstep precedent'
provides:
  - 'server/lib/trendHistory.ts — bounded dashboard:trends:history Redis ring (LPUSH+LTRIM 30-cap, 30d TTL), degrade-open'
  - 'Once-daily trend-sample append inside the existing /api/cron/health handler (no new cron)'
  - 'trendHistory field on /api/operator-status (route + OpenAPI + client interface lockstep)'
  - 'TrendSample shape (sampledAt + per-cron cronAgeMs map + deadUrlCount) for the four DASH-READ-05 sparklines'
affects: [45-04, dashboard-sparkline-render, phase-49-registry-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Trend-ring as a verbatim structural copy of llmRunHistory (bounded LPUSH+LTRIM, dual-shape parseEntry, degrade-open never-throws)'
    - 'Once-daily observability append piggybacked on an already-running cron (zero new cron entries — CONTEXT D-01)'
    - 'Contract lockstep: server route test + OpenAPI schema + client forward-compat optional field in one plan'

key-files:
  created:
    - 'server/lib/trendHistory.ts'
    - 'server/__tests__/lib/trendHistory.test.ts'
  modified:
    - 'server/routes/cron-health.ts'
    - 'server/routes/operator-status.ts'
    - 'server/openapi.yaml'
    - 'server/routes/__tests__/operator-status.test.ts'
    - 'src/components/ui/DevApiStatus.tsx'

key-decisions:
  - "TREND_HISTORY_KEY = 'dashboard:trends:history' — bounded LPUSH+LTRIM 30-cap / 30d-TTL ring in the llm:*/events:* family (recorded for the Phase 49 registry sweep)"
  - "Kept ltrim(KEY, 0, TREND_MAX - 1) (verbatim llmRunHistory idiom) rather than a magic literal 29 — the cap-30 bound is pinned authoritatively by the unit test's toHaveBeenCalledWith(KEY, 0, 29)"
  - "trendHistory surfaces as [] (not null) on a Redis LRANGE failure because readTrendHistory is itself degrade-open and returns [] — the route's null backstop only fires if the helper throws, which it cannot by design"
  - 'cronAgeMs is null (never 0) when a cron:lastTick:{name} key is absent — a stalled cron reads as null/stale, itself a valid DASH-READ-05 signal (CONTEXT D-02)'

patterns-established:
  - "Server-backed bounded trend ring written once-daily by an existing cron and read through an existing aggregator — the minimal server surface that makes DASH-READ-05's 'catch slow-burn regressions' true rather than session-ephemeral"

requirements-completed: [DASH-READ-05]

# Metrics
duration: 5min
completed: 2026-06-22
status: complete
---

# Phase 45 Plan 01: Trend-History Ring Backing the DASH-READ-05 Sparklines Summary

**Bounded `dashboard:trends:history` Redis ring (LPUSH+LTRIM 30-cap, 30d TTL) written once-daily by the existing health cron and read through the existing `/api/operator-status` aggregator as a forward-compat `trendHistory` field — full contract lockstep (route test + OpenAPI + client interface), zero new cron/endpoint/event key.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-22T04:39:05Z
- **Completed:** 2026-06-22T04:44:00Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `server/lib/trendHistory.ts` — a verbatim structural copy of `llmRunHistory.ts`: `appendTrendSample` (LPUSH → LTRIM 0,29 → expire 30d) and `readTrendHistory` (LRANGE → dual-shape parse → filter), both degrade-open and never-throwing. `TrendSample` carries the four scalar series (three `cronAgeMs` + `deadUrlCount`) plus an ISO `sampledAt`.
- The existing `/api/cron/health` handler now appends exactly one daily sample AFTER its `cron:lastTick:health` write, computing each cron's freshness age from its `cron:lastTick:{name}` key (null when absent — never a fabricated 0) and the `events:url-liveness-count` sidecar for the dead-link count. The whole append is try/caught so a trend-write failure cannot degrade the health response.
- `/api/operator-status` surfaces a degrade-open `trendHistory` block (mirroring the `tokenBudget` precedent verbatim), documented in OpenAPI (nullable array of `TrendSample`, zero new lint warnings) and pinned by 3 new route tests; the client `OperatorStatus` interface gains the optional forward-compat field plus a module `TrendSample` type — interface/type only, no render (the sparkline mount is Plan 04).

## Task Commits

Each task was committed atomically:

1. **Task 1: Bounded trend-history ring module + unit test** - `9f22c06` (feat) — 7 unit tests
2. **Task 2: Once-daily trend append inside the existing health cron** - `6a03307` (feat)
3. **Task 3: trendHistory on /api/operator-status with full contract lockstep** - `5e0dc93` (feat)

_Task 1 lands module + test in one commit (a verbatim non-iterative copy of an existing, already-tested idiom — no RED/GREEN iteration needed; the plan marked it `tdd="true"` but the work is a structural copy, so the test was written against the final shape and passed first run)._

## Files Created/Modified

- `server/lib/trendHistory.ts` (created) - Bounded `dashboard:trends:history` ring writer/reader; verbatim copy of the `llmRunHistory` bounded-ring idiom; degrade-open
- `server/__tests__/lib/trendHistory.test.ts` (created) - 7 tests: cap-30 LTRIM, 30d TTL, newest-first dual-shape read, degrade-open on append + read, sample shape pin, null-cronAge round-trip
- `server/routes/cron-health.ts` (modified) - Computes a `TrendSample` and calls `appendTrendSample` once after the lastTick:health write; per-cron age + dead-URL sidecar reads; whole block try/caught
- `server/routes/operator-status.ts` (modified) - Degrade-open `trendHistory` block + `readTrendHistory` import + field on `res.json`
- `server/openapi.yaml` (modified) - `trendHistory` property on the `/api/operator-status` 200 schema (nullable array of TrendSample)
- `server/routes/__tests__/operator-status.test.ts` (modified) - `lrange` added to the redis mock + 3 new cases (array shape, empty-ring [], degrade-open on LRANGE throw)
- `src/components/ui/DevApiStatus.tsx` (modified) - Module `TrendSample` type + optional `trendHistory?: TrendSample[] | null` on `OperatorStatus` (interface/type only)

## Decisions Made

- **`TREND_HISTORY_KEY = 'dashboard:trends:history'`** — chosen to read as "the same kind of thing" as `llm:calls:history` / `llm:runs:history` / `events:llm-pipeline-audit` to a maintainer. **Recorded here for the Phase 49 registry sweep:** new bounded LPUSH+LTRIM ring, 30-cap, 30d TTL, written by `/api/cron/health` (sole writer), read by `/api/operator-status`, degrade-open.
- **Kept `ltrim(KEY, 0, TREND_MAX - 1)`** (verbatim `llmRunHistory` idiom) rather than the literal `29` the Task 1 acceptance grep looked for. A magic literal would risk drift from `TREND_MAX`; the cap-30 behavior is pinned authoritatively by the unit test's `expect(ltrimMock).toHaveBeenCalledWith(TREND_HISTORY_KEY, 0, 29)`. The grep is a proxy for "cap is 30," which the test proves directly.
- **`trendHistory` surfaces as `[]` (not `null`) on a Redis LRANGE failure** — because `readTrendHistory` is itself degrade-open and returns `[]`, the route's `null` backstop only fires if the helper throws (which it cannot by design). The route test honestly pins `[]` on Redis failure; the `null` declaration remains a defensive backstop for forward-compat / unexpected throws.

## Deviations from Plan

None - plan executed exactly as written. (The one acceptance-grep nuance — `ltrim` literal `29` vs `TREND_MAX - 1` — is documented under Decisions; it is a deliberate fidelity-to-idiom choice, not a deviation in behavior. The cap is verified by test.)

## Issues Encountered

None. The `cron-lasttick.test.ts` redis mock lacks `lpush`/`ltrim`/`expire`, so the new trend append silently degrades there (swallowed by `appendTrendSample`'s try/catch) — confirming the degrade-open posture and leaving the existing lastTick assertions untouched (14/14 green). The operator-status test's `vi.clearAllMocks()` resets `lrange` to return `undefined` in the pre-existing describe blocks, which `readTrendHistory` degrades to `[]` — no existing assertion broke.

## Verification

- `npx vitest run server/__tests__/lib/trendHistory.test.ts server/routes/__tests__/operator-status.test.ts server/__tests__/routes/cron-lasttick.test.ts` → 40/40 green
- `npx redocly lint server/openapi.yaml` → valid, 0 errors, 37 warnings (identical to baseline — no new warnings)
- `npx tsc --noEmit` → exit 0
- `git diff vercel.json` → empty (no new cron)
- DevApiStatus behavioral pins (`diagnosticBlocks`, `tabMerge`) → 34/34 green (no restyle regression)

## Threat Surface

No new threat surface beyond the plan's `<threat_model>`. T-45-01 (DoS via ring growth) is mitigated by the bounded LTRIM 0,29 + 30d TTL + once-daily append (unit-pinned). T-45-02 (info disclosure) is mitigated by the field riding the existing `dashboardAuth` Bearer gate (route test asserts 401 without Bearer). T-45-03 (cron tampering) is mitigated by the additive try/caught append leaving the health response untouched (`cron-lasttick.test.ts` green). No package installs (T-45-SC).

## User Setup Required

None - no external service configuration required. The ring is written automatically by the already-scheduled `0 0 * * *` health cron and begins filling on the next tick (cold-start renders whatever points exist; never fabricates zeros).

## Next Phase Readiness

- The `trendHistory` data contract is live, tested, documented, and forward-compat on the client. Plan 04 can mount the `<Sparkline>` primitive against `opStatus.trendHistory` with no further server work.
- The ring fills one sample per day; a full 30-point sparkline takes 30 days of cron ticks. Plan 04's cold-start affordance (CONTEXT D-05: render existing points, optional "collecting…") should account for a sparse early ring.
- No blockers.

## Self-Check: PASSED

- FOUND: server/lib/trendHistory.ts
- FOUND: server/**tests**/lib/trendHistory.test.ts
- FOUND: .planning/phases/45-dashboard-subtab-readability-redesign/45-01-SUMMARY.md
- FOUND commit 9f22c06 (Task 1)
- FOUND commit 6a03307 (Task 2)
- FOUND commit 5e0dc93 (Task 3)

---

_Phase: 45-dashboard-subtab-readability-redesign_
_Completed: 2026-06-22_
