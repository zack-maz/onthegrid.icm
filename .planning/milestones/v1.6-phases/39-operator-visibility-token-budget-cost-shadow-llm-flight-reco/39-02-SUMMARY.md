---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
plan: 02
subsystem: api
tags: [llm-pipeline, observability, flight-recorder, redis, runid, typescript]

# Dependency graph
requires:
  - phase: 39-01
    provides: llmCallHistory.ts (appendCallHistory) + llmRunHistory.ts (openRunRecord/closeRunRecord) + CallHistoryEntry/RunHistoryEntry types + runId? on LLMPipelineProgress
provides:
  - runId (crypto.randomUUID) generated once per run + stamped on llmProgress at the run boundary
  - openRunRecord 'running' start-write + single finally closeRunRecord keyed off a runOutcome witness (all 5 GA-2 exit branches)
  - SUCCESS-PATH callHistory writer in callLLM (new — previously only the failure path wrote)
  - runId+batchIndex stamping + appendCallHistory dual-write on BOTH call paths
  - batchIndex threaded processEventGroupsV3 (+ splitBatchOnTimeout) -> callLLM opts
affects:
  - 39-03 (GET /api/events/llm-history consuming the dual-written llm:calls:history + llm:runs:history)
  - 39-04 (FlightRecorderBlock UI rendering runs/calls drill-down by runId)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'runId generated once at the run boundary, stamped on the llmProgress singleton, inherited by every per-call writer (call->run back-correlation)'
    - 'Single finally-block run-record close keyed off a mutable runOutcome witness set in each branch (Open Q3 — a missed branch still closes; default outcome is the honest fallback)'
    - 'Degrade-open dual-write (void appendCallHistory / await closeRunRecord) — observability writes never throw out of the fire-and-forget extraction body'

key-files:
  created: []
  modified:
    - server/lib/freeClaudeRouter.ts
    - server/lib/llmEventExtractor.v3.ts
    - server/lib/llmExtractionPipeline.ts
    - server/lib/__tests__/llmCallHistory.test.ts
    - server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts

key-decisions:
  - 'Used tsconfig.server.json for the server typecheck — the plan/acceptance-criteria reference server/tsconfig.json, which does not exist in this repo (same correction Plan 01 documented)'
  - 'Closed the run record once in the finally block keyed off a runOutcome witness rather than per-branch closes (Open Q3 — guarantees a missed branch still closes)'
  - 'tokenSpend.nvidia_nim derived from llmProgress.costShadow (tokensIn+tokensOut); dlqDelta defaulted to 0 (the singleton tracks no per-run DLQ delta — honest zero over a fabricated count)'
  - 'Success/failure callHistory entries pushed to the in-memory singleton AND dual-written via appendCallHistory; the singleton element type is structurally compatible with the wider CallHistoryEntry (extra runId/batchIndex fields are allowed)'

patterns-established:
  - 'Both LLM call paths (success + failure) build a runId+batchIndex CallHistoryEntry and dual-write to llm:calls:history for cold-start-surviving flight recording'
  - 'GA-2 outcome mapping: no-groups/success -> completed, soft-cap pause -> budget_hit, null-extraction/throw -> error'

requirements-completed: [OBS-FLIGHT-02, OBS-FLIGHT-05]

# Metrics
duration: 21 min
completed: 2026-06-04
---

# Phase 39 Plan 02: runId Threading + Run-Record Lifecycle + Call-History Dual-Write Summary

**Threads a per-run `crypto.randomUUID()` runId through the v3 extraction pipeline so every LLM call back-correlates to its parent run, opens a crash-surviving `running` run record at the run boundary and closes a terminal record at all 5 exit branches (GA-2), adds the previously-missing SUCCESS-path callHistory writer, and dual-writes every call entry (success + failure) to `llm:calls:history`.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-04T20:44:49Z (PLAN_START)
- **Completed:** 2026-06-04T21:05:16Z
- **Tasks:** 2
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- **runId back-correlation:** `runRefreshExtraction` now generates `runId = crypto.randomUUID()` right after `resetProgress()` and stamps it via `updateProgress({ runId })`. Every `callHistory` writer in `freeClaudeRouter.ts` inherits `llmProgress.runId ?? ''` onto each appended entry, so each call points at its parent run.
- **Run-record lifecycle (GA-2):** `openRunRecord({ runId, startedAt })` writes a `running` record at run start (so a `maxDuration`-killed run leaves a never-closed "run that died" trace, Pitfall 5). A single `closeRunRecord(buildRunHistoryEntry(runOutcome))` in the existing `finally` block closes the terminal record, keyed off a mutable `runOutcome` witness set in each of the 5 branches (Open Q3). GA-2 outcome mapping: no-new-groups/success → `completed`, soft-cap pause → `budget_hit`, null-extraction/throw → `error`.
- **SUCCESS-path callHistory writer (new logic):** Per the plan's Critical Finding, the success branch previously only `record`ed `'ok'` and returned without writing callHistory. Added a runId+batchIndex-stamped `CallHistoryEntry` (with real `tokensIn`/`tokensOut` from the completion usage) prepended to the cap-20 singleton and dual-written to Redis.
- **batchIndex threading:** Added `batchIndex?: number` to `callLLM`'s opts and passed it from the `processEventGroupsV3` batch loop AND the `splitBatchOnTimeout` adaptive-retry path. `withBatchWatchdog` was NOT touched (Pitfall 1 — runId/batchIndex thread via the opts + the progress singleton, not the watchdog).
- **No breaker double-count:** No second `record(p.name,'err')` was added; the single per-call recording is unchanged (Pitfall 4 — breaker window accuracy preserved).

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread batchIndex into callLLM opts + add success-path callHistory writer + dual-write both paths** - `805ede3` (feat)
2. **Task 2: Generate runId + open/close run record at the run boundary (all 5 exit branches)** - `d8834bc` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

## Files Created/Modified

- `server/lib/freeClaudeRouter.ts` (modified) — imported `appendCallHistory` + `CallHistoryEntry`; extended `callLLM` opts with `batchIndex?`; added a SUCCESS-path `CallHistoryEntry` build + singleton push + `void appendCallHistory` dual-write; stamped `runId`+`batchIndex` on the failure-path entry + dual-write. No second breaker `record(...,'err')`.
- `server/lib/llmEventExtractor.v3.ts` (modified) — threaded `batchIndex` into the `freeClaudeCallLLM` opts at the `processEventGroupsV3` call site and the `splitBatchOnTimeout` split-retry call site.
- `server/lib/llmExtractionPipeline.ts` (modified) — imported `openRunRecord`/`closeRunRecord` + `RunHistoryEntry`; generated `runId` + `startedAt` after `resetProgress()`; `updateProgress({ ..., runId })`; `await openRunRecord(...)`; added a `buildRunHistoryEntry(outcome)` local helper + a `runOutcome` witness set at all 5 branches; single `closeRunRecord` in the `finally`.
- `server/lib/__tests__/llmCallHistory.test.ts` (modified) — added the OBS-FLIGHT-05 back-correlation integration case: an entry synthesized from `llmProgress.runId` carries that runId through the dual-write (and `batchIndex` round-trips in the LPUSH'd payload).
- `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` (modified, deviation) — switched the 4 positional `callHistory?.[0]` failure-row assertions to `callHistory?.find((r) => !r.ok)` because the new success-path writer now also prepends a row.

## Decisions Made

- **Closed the run record once in `finally` keyed off `runOutcome`** (Open Q3 preferred path) rather than five per-branch closes — a missed branch still closes the run, and the witness defaults to `'error'` so an unexpected throw past every branch closes honestly.
- **`tokenSpend.nvidia_nim` derived from `llmProgress.costShadow`** (`tokensIn + tokensOut`) since the singleton has no separate per-provider token total; `dlqDelta` defaulted to `0` (no per-run DLQ delta is tracked on the singleton — an honest zero over a fabricated number; the field exists for future wiring).
- **`tsconfig.server.json` for the server typecheck** — the plan's `<verify>` and `<acceptance_criteria>` reference `server/tsconfig.json`, which does not exist in this repo (carried-forward Plan 01 correction).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated retryAfterMs test positional callHistory assertions**

- **Found during:** Task 2 (`npx vitest run server/` verify step)
- **Issue:** Task 1's new SUCCESS-path callHistory writer prepends a row to `llmProgress.callHistory`. Four cases in `freeClaudeRouter.retryAfterMs.test.ts` (A1, A2, B1, B2) use a 429-then-success-on-retry pattern and read the failure row positionally via `callHistory?.[0]`. With the success path now also writing, the success row lands at index 0 and the 429 failure row shifts to index 1 — the assertions read `retryAfterMs: undefined` (the success row) and failed.
- **Fix:** Switched those 4 assertions to locate the failure row by predicate `callHistory?.find((r) => !r.ok)`, preserving their intent (asserting the 429 catch-path `retryAfterMs`). N1/G1 were already robust and untouched.
- **Files modified:** `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts`
- **Verification:** `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` → 6 passed; full `npx vitest run server/` → 1354 passed.
- **Committed in:** `d8834bc` (Task 2 commit).

**2. [Rule 3 - Blocking] Used `tsconfig.server.json` for the server typecheck**

- **Found during:** Task 1 (verify step)
- **Issue:** The plan references `server/tsconfig.json`, which does not exist in this repo; `tsc --noEmit -p server/tsconfig.json` errors `TS5058`.
- **Fix:** Ran all `tsc --noEmit` acceptance checks against the real server typecheck project `tsconfig.server.json` (the path `package.json` already builds/lints against).
- **Files modified:** none (verification-command correction only).
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` → exit 0.
- **Committed in:** n/a (no source change — affects how acceptance criteria were executed, not what shipped).

---

**Total deviations:** 2 auto-fixed (1 bug — test positional-assertion update made necessary by the planned success-path writer; 1 blocking — wrong tsconfig path in plan verify commands).
**Impact on plan:** No scope change. The success-path writer is the planned new behavior; the test update preserves the original test intent. The tsconfig correction satisfies the strict-typecheck intent via the correct project file.

## Issues Encountered

None beyond the deviations above. The 4 retryAfterMs failures were an expected, intent-preserving consequence of adding the success-path callHistory writer and were resolved by switching to predicate-based row lookup.

## User Setup Required

None - no external service configuration required. The run + call records write to existing Upstash Redis keys (`llm:runs:history`, `llm:calls:history`) created by Plan 01; no new env vars.

## Next Phase Readiness

- **39-03** (`GET /api/events/llm-history`) can now consume real data: every cron extraction run opens/closes a run record and dual-writes each call entry with `runId` + `batchIndex`.
- **39-04** (FlightRecorderBlock) can render the runs→calls→prompt drill-down grouped by `runId`.
- No blockers. `withBatchWatchdog` remained dependency-free (Pitfall 1); breaker window accuracy preserved (Pitfall 4); GA-2 start-write leaves the crash-surviving `running` record (Pitfall 5).

## Verification (actual output)

- `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` → **6 passed** (was 5; +1 runId back-correlation case)
- `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` → **6 passed**
- `npx vitest run server/` → **1354 passed (114 files)** — no regression
- `npx tsc --noEmit -p tsconfig.server.json` → **exit 0**
- Source assertions: `grep -c appendCallHistory server/lib/freeClaudeRouter.ts` → **4** (≥2); `grep -c batchIndex server/lib/freeClaudeRouter.ts` → **7** (≥1); v3 non-comment `batchIndex,` → **7** (≥1)
- Source assertions: `openRunRecord` call sites → **1**; `closeRunRecord` call sites → **1** (finally, runOutcome-keyed, all 5 branches); `crypto.randomUUID` present; `withBatchWatchdog` in pipeline → **0** (watchdog untouched)

## Self-Check: PASSED

- `server/lib/freeClaudeRouter.ts` — FOUND (modified)
- `server/lib/llmEventExtractor.v3.ts` — FOUND (modified)
- `server/lib/llmExtractionPipeline.ts` — FOUND (modified)
- `server/lib/__tests__/llmCallHistory.test.ts` — FOUND (modified)
- `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` — FOUND (modified)
- Commit `805ede3` (Task 1) — FOUND
- Commit `d8834bc` (Task 2) — FOUND

---

## Gap Closure note (SC39-3 — WR-01/WR-04)

The run-record accounting shipped here was later corrected for honesty in the SC39-3 gap-closure pass
(commit `4fc85e1`): `buildRunHistoryEntry` no longer derives `batchesFailed` from
`totalBatches - completedBatches` (structurally ~0 because `finishBatch()` ticks on every terminal
branch) and no longer hardcodes `dlqDelta: 0`. It now reads the new `llmProgress.failedBatches` tally
(incremented only on genuine-failure branches in `llmEventExtractor.v3.ts`) and computes `dlqDelta`
from a `countDLQ()` SCARD open/close snapshot. The same commit adds the missing
`updateProgress({ evalScore })` write-back (WR-04). See `39-05-SUMMARY.md` § "Gap Closure (SC39-3)"
for full detail.

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco_
_Completed: 2026-06-04_
