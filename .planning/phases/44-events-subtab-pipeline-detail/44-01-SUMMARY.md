---
phase: 44-events-subtab-pipeline-detail
plan: 01
subsystem: api
tags: [operator-status, url-liveness, openapi, redocly, redis-scan, ghost-links, contract-lockstep]

# Dependency graph
requires:
  - phase: 43-ghost-link-prune-correctness
    provides: 7-status liveness taxonomy (+soft-404 +no-url), required-nullable evidence string, attemptCount dead-streak semantics on the stored UrlLiveness value
  - phase: 32-ghost-event-url-liveness
    provides: buildDeadUrlSample SCAN loop, MAX_SCAN_KEYS=200 budget guard, deadUrlCount O(1) sidecar, prune block on /api/operator-status, OperatorStatus.prune forward-compat client interface (D-10)
provides:
  - 'prune.countsByStatus on /api/operator-status — all-status SAMPLED tally (<=MAX_SCAN_KEYS=200), sparse map, computed inside the existing SCAN loop with zero extra Redis reads'
  - 'prune.deadUrlSample entries now carry lastProbedAt + attemptCount + evidence (Phase 44 D-01)'
  - 'deadUrlSample status union + OpenAPI enum admit soft-404 (closes pre-existing Phase 43 OpenAPI drift)'
  - 'OperatorStatus.prune client interface forward-compat optional fields so older servers do not break the dashboard'
affects:
  [
    44-02 (events subtab DeadLinkBucketsBlock consumes these fields),
    45 (dashboard restyle of DevApiStatus),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Contract lockstep in one commit (Phase 39 tokenBudget precedent): route test + OpenAPI + client interface move together; Redocly + tsc green'
    - 'Free-side-effect tally: accumulate per-status counts inside an existing SCAN loop (zero extra Redis reads) bounded by the unchanged budget guard'

key-files:
  created: []
  modified:
    - server/routes/operator-status.ts
    - server/routes/__tests__/operator-status.test.ts
    - server/openapi.yaml
    - src/components/ui/DevApiStatus.tsx

key-decisions:
  - 'D-01/D-03: countsByStatus is a SAMPLED tally (<=200 scanned) tallied in the existing buildDeadUrlSample loop; deadUrlCount stays the authoritative O(1) sidecar total'
  - 'Sparse countsByStatus map (absent statuses omitted) — reads cleanest; consumer ?? 0-guards per status (CONTEXT discretion)'
  - 'buildDeadUrlSample return shape widened DeadUrlSampleEntry[] -> { sample, countsByStatus }; degrade-open catch returns { sample: [], countsByStatus: {} }'
  - 'Closed pre-existing Phase 43 OpenAPI drift (soft-404 enum + evidence field) while editing the prune schema for D-01'

patterns-established:
  - 'Per-status SCAN tally bounded by MAX_SCAN_KEYS=200 — no second SCAN, no widened budget'
  - 'Forward-compat optional client fields (Phase 32 D-10) for the D-01 additions'

requirements-completed: [EVENTS-TAB-02]

# Metrics
duration: ~12min
completed: 2026-06-10
---

# Phase 44 Plan 01: Operator-Status Prune Block Extension Summary

**Extended `/api/operator-status` prune block with a per-status sampled `countsByStatus` tally and `lastProbedAt`/`attemptCount`/`evidence` drill-down fields — computed inside the existing SCAN loop with zero new Redis reads — and locked the change across route test, OpenAPI, and the client interface in lockstep (also closing the pre-existing Phase 43 OpenAPI `soft-404`/`evidence` drift).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-10T08:31Z (approx)
- **Completed:** 2026-06-10T08:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `buildDeadUrlSample` now tallies `countsByStatus` across ALL scanned statuses (live/unknown/no-url/404/403/dead-host/soft-404) before the terminal-dead filter, inside the same SCAN loop — no extra Redis reads, no new SCAN, `MAX_SCAN_KEYS=200` budget guard unchanged.
- `DeadUrlSampleEntry` gained `lastProbedAt` + `attemptCount` (both already on the stored `UrlLiveness` value); the prune block now spreads `countsByStatus` alongside the authoritative `deadUrlCount` sidecar.
- Degrade-open contract preserved: the helper's catch returns `{ sample: [], countsByStatus: {} }` so a Redis SCAN throw never cascades past the prune block (route stays 200-degraded).
- Three contract surfaces moved in one commit (D-04): route test pins the new fields + buckets (with new `no-url` and `soft-404` fixtures), OpenAPI prune schema adds `countsByStatus`/`evidence`/`lastProbedAt`/`attemptCount` and the `soft-404` enum member, client `OperatorStatus.prune` interface forward-compat declares the new optional fields.

## Task Commits

1. **Task 1: Extend buildDeadUrlSample with countsByStatus tally + lastProbedAt/attemptCount, assemble into prune** - `3547f8a` (feat)
2. **Task 2: Lockstep contract surfaces — route test, OpenAPI (+ close Phase 43 drift), client interface** - `6c513a7` (feat)

_Note: Task 1 is declared `tdd="true"`; the existing 22-test route suite stayed green throughout (additive field changes), and Task 2 added the RED-then-GREEN bucket/field assertions in the lockstep commit per the plan's task split._

## Files Created/Modified

- `server/routes/operator-status.ts` - Added `lastProbedAt`/`attemptCount` to `DeadUrlSampleEntry`; `countsByStatus` accumulator in the existing SCAN loop; widened return shape + degrade-open catch; spread `countsByStatus` into the prune block.
- `server/routes/__tests__/operator-status.test.ts` - Extended the deadUrlSample fixture with `no-url` + `soft-404` entries; per-entry assertions for `lastProbedAt`/`attemptCount`/`evidence`; new `countsByStatus` assertion block; degrade-open empty-`countsByStatus` pin.
- `server/openapi.yaml` - Added `countsByStatus` (object/additionalProperties integer) + `evidence`/`lastProbedAt`/`attemptCount` to `deadUrlSample` items; extended `status` enum with `soft-404` (closed Phase 43 drift).
- `src/components/ui/DevApiStatus.tsx` - `OperatorStatus.prune` interface forward-compat optional `countsByStatus` + `evidence?`/`lastProbedAt?`/`attemptCount?` on the sample entry; widened entry `status` union with `'soft-404'`.

## Decisions Made

None beyond the plan-locked decisions (D-01..D-04). The sparse-map choice for `countsByStatus` (omit absent statuses) was the planner-granted discretion; chosen for cleanest contract reading, with the consumer `?? 0`-guarding per status.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All verification gates passed first try:

- `npx vitest run server/routes/__tests__/operator-status.test.ts` — 22 passed.
- `npm run openapi:lint` (Redocly) — valid, 37 pre-existing warnings, exit 0.
- `npx tsc -b` — 0 errors.
- `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` — 10 passed (existing prune UI pin stays green).
- Grep gates: `redis.scan` count unchanged at 2 (baseline), `MAX_SCAN_KEYS = 200` single non-comment match, `countsByStatus`/`soft-404` present in all three surfaces.

## User Setup Required

None - no external service configuration required. No new Redis keys, no writers, no pipeline behavior changes (D-01 honored exactly).

## Next Phase Readiness

- Plan 02 (events subtab UI) can now thread `opStatus.prune` into `EventsFiltersSectionV3` and render `DeadLinkBucketsBlock` with per-bucket counts + drill-down rows (`url`, `status` badge, `evidence` as TEXT, `lastProbedAt`, `attemptCount`).
- The Redocly drift gate stays green; the 5 pinning suites were untouched (server + interface-only edits).

## Self-Check: PASSED

- FOUND: server/routes/operator-status.ts (countsByStatus at lines 238/248/271/297/302/481/482)
- FOUND: server/routes/**tests**/operator-status.test.ts (countsByStatus assertions)
- FOUND: server/openapi.yaml (countsByStatus + soft-404)
- FOUND: src/components/ui/DevApiStatus.tsx (countsByStatus? + 'soft-404')
- FOUND commit: 3547f8a (Task 1)
- FOUND commit: 6c513a7 (Task 2)

---

_Phase: 44-events-subtab-pipeline-detail_
_Completed: 2026-06-10_
