---
phase: 46-general-hardening-cron-watch-start
plan: 02
subsystem: api
tags: [health, cron, observability, zod, vitest, express, redis]

# Dependency graph
requires:
  - phase: 28.1-W2
    provides: probeCronTick + deriveStatus 4-state ladder + FRESHNESS_THRESHOLDS_MS + healthResponseSchema (.strict())
  - phase: 28.2.7
    provides: cron:lastTick:{name} Redis keys written by each cron handler
provides:
  - CRON_SCHEDULE_GRACE_MS static schedule+grace table (3 crons, 24h interval / 4h grace)
  - deriveCronRunState pure 3-state helper (unknown/missed/healthy) layered on top of deriveStatus
  - cronRunStateEnum sibling Zod enum + missedRun .optional() field on endpointHealthSchema
  - /api/health cron-tier rows now carry a missedRun sibling field surfacing first-tick + missed-run detection
affects: [phase-47-load-test, cron-watch, prod-connectivity-audit, llm-reli-07-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Sibling-field observability signal: a new derived state is surfaced as a sibling field (missedRun), NEVER folded into an existing .strict() wire enum that a downstream audit gate reads'
    - 'Schema+route lockstep: the .optional() schema field and the route edit land in the SAME task so dev .parse accepts the new key under .strict()'
    - 'Layered pure helper: deriveCronRunState sits ON TOP of deriveStatus without modifying the 4-state ladder (D-06)'

key-files:
  created: []
  modified:
    - server/lib/healthSources.ts
    - server/lib/healthSchema.ts
    - server/routes/health.ts
    - server/__tests__/lib/healthSources.test.ts
    - server/__tests__/lib/healthSchema.test.ts
    - server/__tests__/routes/health.test.ts

key-decisions:
  - 'graceMs = 4h per cron (within the D-04 2–6h band): keeps missed strictly earlier than the existing 26h degraded window and satisfies grace < (2×threshold − interval) = 28h'
  - 'missedRun is a SIBLING field keyed by cronRunStateEnum, NEVER a healthStatusEnum value — protecting prod-connectivity-audit okCron and the LLM-RELI-07 gate (Pitfall 1)'
  - 'hasFiredYet derived from probe.lastSuccessTs !== null (non-null lastSuccessTs means the cron fired at least once)'
  - 'Client EndpointHealth type flows through automatically via z.infer re-export in src/lib/healthClient.ts — no manual client edit needed'

patterns-established:
  - "Regression-pin test: healthSchema.test.ts asserts healthStatusEnum.options is EXACTLY the 4 original states and does NOT contain 'missed' — fails the instant the enum widens"
  - "Audit-gate safety test: health.test.ts asserts a stale cron's status is never 'missed' and summary.cron carries no 'missed' bucket"

requirements-completed: [HARD-02]

# Metrics
duration: 12min
completed: 2026-06-22
status: complete
---

# Phase 46 Plan 02: Cron First-Tick + Missed-Run Detection Summary

**`/api/health` cron rows now report a 3-state `missedRun` sibling field (unknown/missed/healthy) derived from a hardcoded `CRON_SCHEDULE_GRACE_MS` table + a pure `deriveCronRunState` helper — without widening the 4-state health status enum, structurally protecting the LLM-RELI-07 `okCron` audit gate.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-22T12:40:00Z
- **Completed:** 2026-06-22T12:45:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 6

## Accomplishments

- `CRON_SCHEDULE_GRACE_MS` static schedule+grace table in `healthSources.ts` (3 crons — health/warm/refresh-events, each 24h expected interval / 4h grace), mirroring `FRESHNESS_THRESHOLDS_MS` per D-04 (no `vercel.json` parse, no external SaaS).
- `deriveCronRunState` pure helper returning `'unknown' | 'missed' | 'healthy'`, layered ON TOP of the unchanged 4-state `deriveStatus` ladder (D-06): null+never-fired → unknown; null+fired → missed; stale past expected+grace → missed; within grace (≤ boundary) → healthy.
- `cronRunStateEnum` sibling Zod enum + `missedRun: cronRunStateEnum.optional()` on `endpointHealthSchema`; `healthStatusEnum` left UNCHANGED (4-state) and regression-pinned.
- `/api/health` cron-tier rows compute `missedRun` from the cron short-name → `CRON_SCHEDULE_GRACE_MS` lookup + `probe.freshnessMs` + `hasFiredYet (lastSuccessTs !== null)`. Non-cron rows omit the field.
- The LOAD-BEARING INVARIANT proven by test: a stale cron reports `missedRun: 'missed'` while its wire `status` stays in the 4-state set and never equals `'missed'`; `summary.cron` carries no `'missed'` bucket.

## Task Commits

Each task was committed atomically (TDD — RED test + GREEN impl folded into one commit per task):

1. **Task 1: CRON_SCHEDULE_GRACE_MS table + deriveCronRunState pure helper** - `f89c1a1` (feat)
2. **Task 2: missedRun sibling field on /api/health + .optional() schema (enum UNCHANGED)** - `b83617d` (feat)

_Note: tests were written first (RED, confirmed failing), then implementation (GREEN); each task's test + impl committed together._

## Files Created/Modified

- `server/lib/healthSources.ts` - Added `CRON_SCHEDULE_GRACE_MS` table + `deriveCronRunState` pure helper (deriveStatus untouched).
- `server/lib/healthSchema.ts` - Added `cronRunStateEnum` + `CronRunState` type + `missedRun: cronRunStateEnum.optional()` on `endpointHealthSchema`; `healthStatusEnum` unchanged.
- `server/routes/health.ts` - Imported the new helper/table; cron-tier endpoint rows now set `missedRun` via `deriveCronRunState` keyed off the probe strategy's `cronName`.
- `server/__tests__/lib/healthSources.test.ts` - Table-driven `deriveCronRunState` cases + `CRON_SCHEDULE_GRACE_MS` shape/constraint assertions.
- `server/__tests__/lib/healthSchema.test.ts` - `healthStatusEnum` 4-state regression pin + `cronRunStateEnum` + `missedRun` optional-key accept/reject cases.
- `server/__tests__/routes/health.test.ts` - Fresh/stale/never-fired cron `missedRun` cases; status-never-'missed' invariant assertion; non-cron rows omit the field.

## Decisions Made

- **graceMs = 4h** (within D-04's 2–6h discretion band): chosen so `missed` fires strictly earlier than the existing 26h `degraded` freshness window and satisfies `grace < (2×threshold − interval)` (= 2×26h − 24h = 28h), keeping the new signal consistent with the existing 4-state ladder.
- **Sibling field over enum widening** (Pitfall 1 / Landmine 1/2): `missedRun` is a separate `cronRunStateEnum`, never a `healthStatusEnum` value. `prod-connectivity-audit.yml` `okCron = ["healthy","degraded"].includes(tierStatus.cron)` derives `tierStatus.cron` from `status`; surfacing `missed` there would flip `allTiersGreen` and regress LLM-RELI-07. The audit never reads the sibling field.
- **No client-type edit needed**: `src/lib/healthClient.ts` re-exports `EndpointHealth` via `z.infer`, so the new optional field flows through automatically.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No new Redis keys, env vars, crons, or endpoints were added (the missedRun signal is pure in-process math over the already-read `cron:lastTick:{name}` freshness).

## Next Phase Readiness

- Phase 47's load test can read `endpoints.{cronHealth,cronWarm,cronRefreshEvents}.missedRun` from `/api/health` to confirm crons survived load.
- The CRON-WATCH-01 daily ring (Plan 04) can reference the same `CRON_SCHEDULE_GRACE_MS` truth-table for its watch rows.
- Full `server/` suite green (119 files, 1477 tests); typecheck clean; `healthStatusEnum` confirmed still exactly 4 states.

## Self-Check: PASSED

- FOUND: server/lib/healthSources.ts, server/lib/healthSchema.ts, server/routes/health.ts (+ all 3 test files)
- FOUND: commit f89c1a1 (Task 1)
- FOUND: commit b83617d (Task 2)
- Verification: `npx vitest run server/__tests__/lib/healthSources.test.ts server/__tests__/routes/health.test.ts server/__tests__/lib/healthSchema.test.ts` → 58 passed; `npx vitest run server/` → 1477 passed; `grep healthStatusEnum` → exactly 4 states (no `missed`).

---

_Phase: 46-general-hardening-cron-watch-start_
_Completed: 2026-06-22_
