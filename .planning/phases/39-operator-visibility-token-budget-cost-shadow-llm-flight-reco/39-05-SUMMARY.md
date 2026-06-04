---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
plan: 05
subsystem: ui
tags:
  [
    operator-console,
    token-budget,
    cost-shadow,
    flight-recorder,
    drill-down,
    degrade-open,
    tailwind-v4,
    react,
  ]

# Dependency graph
requires:
  - phase: 39-03
    provides: 'GET /api/operator-status tokenBudget field (GA-4 provider-keyed map: providers.nvidia_nim {used,cap,soft,hard,state} + costShadow {tokensIn,tokensOut,usd})'
  - phase: 39-04
    provides: 'Bearer-gated GET /api/events/llm-history returning { runs, calls } with ?runId / ?limit filters'
provides:
  - 'BudgetBlock — per-provider used/cap proximity bar (band-colored + soft/hard ticks) + today cost-shadow USD (4dp); degrade-open self-hide'
  - 'FlightRecorderBlock — functional 3-level run-list -> call-list (runId filter) -> single-call detail drill-down from the Bearer-gated /llm-history; degrade-open self-hide'
  - 'Client TokenBudgetBlock type + tokenBudget field on the local OperatorStatus interface (mirrors Plan-03 server shape)'
  - 'Both blocks mounted in DevApiStatusAllApisTab using accent + white/N tokens only'
affects: [40-ui-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Degrade-open render gate on a polled-field client block (mirror opStatus?.actorQuality != null) — no error chrome'
    - 'Block-owned Bearer fetch + 30s poll with non-200/throw -> hide (mirror fetchOpStatus degrade-open)'
    - 'Host-locked dense-console idioms reused: h-1 ProgressBar track, STATUS_PILL accent bands, bg-black/85 copyable modal'

key-files:
  created:
    - src/components/ui/BudgetBlock.tsx
    - src/components/ui/FlightRecorderBlock.tsx
    - src/components/ui/__tests__/BudgetBlock.test.tsx
  modified:
    - src/components/ui/DevApiStatus.tsx

key-decisions:
  - 'BudgetBlock sources opStatus.tokenBudget (already-polled, no new fetch per GA-3); FlightRecorderBlock does its OWN Bearer fetch of /llm-history (Plan 04 contract)'
  - 'Level 3 renders the full CallHistoryEntry record as copyable JSON in the host modal idiom — the Plan-01 call ring carries telemetry, not raw prompt/response text (GA-1 baseline: operator CAN read the call record)'
  - 'completed run with batchesFailed>0 or dlqDelta>0 maps to the yellow "partial" band; watchdog_aborted/breaker_paused/budget_hit/error map to red'

requirements-completed: [BUDGET-01, BUDGET-02, OBS-FLIGHT-04]

# Metrics
duration: 5 min
completed: 2026-06-04
---

# Phase 39 Plan 05: Operator BudgetBlock + FlightRecorderBlock Summary

**Two operator-facing render blocks mounted in the DevApiStatus API Health tab: `BudgetBlock` (per-provider used/cap proximity bars band-colored by state with soft 80% + hard 95% ticks, plus today's cost-shadow USD to 4dp, sourced from the already-polled `tokenBudget` field — no new fetch) and a functional `FlightRecorderBlock` (newest-first run list -> runId-filtered call list -> single-call detail drill-down, fetched from the Bearer-gated `/api/events/llm-history`). Both degrade-open (self-hide) and use accent + white/N tokens only.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-04T21:15:16Z
- **Completed:** 2026-06-04T21:19:44Z
- **Tasks:** 2
- **Files:** 4 (3 created, 1 modified)

## Accomplishments

- **BudgetBlock (BUDGET-01/02):** new component taking the polled `tokenBudget` field as a prop. Per-provider proximity bar reusing the host h-1 `bg-white/10` track with a band-colored fill (`bg-accent-green` ok / `bg-accent-yellow` soft / `bg-accent-red` hard) and two static 1px `bg-white/30` ticks overlaid at 80% (soft) and 95% (hard). Right-aligned `{used}/{cap} {state}` micro-caption. Cost-shadow row `Cost today: $X.XXXX` (4dp) + `{tokensIn} in · {tokensOut} out` caption (GA-3 today-only, no sparkline, no new fetch). Degrade-open render gate (`tokenBudget == null` -> renders nothing) plus an empty-providers fallback (`No provider budget data yet`).
- **OperatorStatus.tokenBudget type + mount:** added a client `TokenBudgetBlock` interface (mirrors the Plan-03 server shape; provider-keyed map) exported from BudgetBlock, wired `tokenBudget?: TokenBudgetBlock | null` onto the local `OperatorStatus` interface in `DevApiStatus.tsx`, and mounted `<BudgetBlock tokenBudget={opStatus?.tokenBudget ?? null} />` in the sub-block region alongside the actorQuality/prune blocks.
- **FlightRecorderBlock (OBS-FLIGHT-04):** new top-level section with its own Bearer fetch of `/api/events/llm-history` via `dashboardAuthHeaders()` on mount + a 30s poll; non-200/throw clears state so the block hides (degrade-open).
  - **L1 RUNS** (newest-first): clickable rows with an outcome badge (`STATUS_PILL` accent-band idiom: running=blue, success=green, partial=yellow, timeout/error=red), `runId.slice(0,8)` + relative start age, a batch ProgressBar (`batchesCompleted/batchCount`, blue while running / band-colored when terminal), `{n} tok` spend, and a band-colored eval score (green >=0.95 / yellow >=0.80 / red).
  - **L2 CALLS** (inline expansion, runId-filtered): one row per call (`#batchIndex`, an `h-1.5` timing bar normalized to the slowest call, provider tag, ok/fail glyph) plus three one-line aggregate sub-strips (`Provenance: {provider} ×{n}`, `DLQ: {n} groups` yellow if >0, `Timeouts: {n}` red if >0).
  - **L3 CALL detail:** the host copyable code-panel modal idiom (`bg-black/85` backdrop, `font-mono text-[10px]`, Copy button + `Copied!` affordance) rendering the full call record.
- **Color discipline:** both blocks use ONLY `accent-{blue,red,green,yellow}` + the `white/N` ramp; zero entity `--color-*` tokens (grep-verified 0 in both files).

## Task Commits

Each task committed atomically:

1. **Task 1 — BudgetBlock + OperatorStatus.tokenBudget type + mount + render/null-gate test (TDD):** `358a678` (feat)
2. **Task 2 — FlightRecorderBlock 3-level run -> call -> detail drill-down + mount:** `3ce645b` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

_Note: Task 1 is a `tdd="true"` task. The failing-test RED state (module-not-found) and the GREEN implementation were authored in the same working pass and landed as one `feat` commit per the plan's per-task atomic-commit instruction; the test + component + type + mount are a single cohesive Task-1 unit._

## Files Created/Modified

- `src/components/ui/BudgetBlock.tsx` (created) — `BudgetBlock` component + exported client `TokenBudgetBlock` type, `PROVIDER_LABEL`, `BAND_FILL_CLASS`. Degrade-open gate, proximity bar with soft/hard ticks, 4dp cost row.
- `src/components/ui/FlightRecorderBlock.tsx` (created) — `FlightRecorderBlock` component (own Bearer fetch + 30s poll), `CallDetailModal` (L3), client `RunHistoryEntry`/`CallHistoryEntry` render types, outcome/eval band helpers, `relativeAge`.
- `src/components/ui/__tests__/BudgetBlock.test.tsx` (created) — 7 cases: null gate, header/provider row, 4dp USD + caption, band class for hard/soft/ok, empty providers.
- `src/components/ui/DevApiStatus.tsx` (modified) — imported both blocks; added `tokenBudget?: TokenBudgetBlock | null` to the local `OperatorStatus` interface; mounted `<BudgetBlock>` in the sub-block region and `<FlightRecorderBlock>` as a new top-level section.

## Decisions Made

- **Data sourcing per the dependency contracts:** BudgetBlock takes the already-polled `opStatus.tokenBudget` as a prop (no new poll — GA-3/source_notes), while FlightRecorderBlock does its own Bearer fetch of `/llm-history` (the Plan-04 read surface). This matches the plan's explicit `key_links` (BudgetBlock <- prop; FlightRecorderBlock <- fetch).
- **Level 3 content (GA-1 baseline):** the Plan-01 `CallHistoryEntry` Redis ring carries call telemetry (provider/model/tokens/timing/ok/runId/batchIndex), not raw prompt/response text. Per GA-1 the baseline requirement is that the operator CAN read a single call's record; Level 3 renders the full available call record as copyable JSON in the existing host modal idiom. A richer prompt/response surface (if the call ring is later widened to carry prompt text) is a Phase 40 enhancement.
- **Outcome -> band mapping:** the server `RunOutcome` union (6 values) is mapped onto the four UI-SPEC bands — `running`->blue, `completed` (clean)->green, `completed` with `batchesFailed>0`/`dlqDelta>0`->yellow "partial", and `watchdog_aborted`/`breaker_paused`/`budget_hit`/`error`->red. Badge text uses `RUNNING`/`SUCCESS`/`TIMEOUT`/`ERROR` per the copy contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used `tsconfig.json` (root) for the strict typecheck**

- **Found during:** Task 2 (verify step)
- **Issue:** The plan's `<verify>`/`<acceptance_criteria>` run `npx tsc --noEmit -p tsconfig.json`. That file exists at repo root and is the correct project for the `src/` frontend typecheck — no deviation in path was needed (unlike the prior server-side plans which referenced a non-existent `server/tsconfig.json`). Recording here only to note the verification command ran against the root project as written.
- **Files modified:** none.
- **Verification:** `npx tsc --noEmit -p tsconfig.json` -> exit 0.

**Total deviations:** 0 source deviations (1 verification-path note). The plan executed exactly as written.
**Impact on plan:** None — no scope change, no source workaround.

## GA Deferrals (recorded so verify-phase does NOT flag as gaps)

- **GA-1 — Rich FlightRecorder filters** (outcome dropdown, date-range): DEFERRED to Phase 40.
- **GA-1 — Polished prompt-copy syntax niceties:** DEFERRED — Phase 39 ships the minimal copyable call-detail modal (baseline: operator CAN read a single call's record).
- **GA-1 — Final tab/subtab placement + consolidation:** DEFERRED to Phase 40 (UI-POLISH owns the reorg). Both blocks currently mount inline in `DevApiStatusAllApisTab`.
- **GA-3 — 90d cost sparkline:** DEFERRED. BudgetBlock ships today's USD + soft/hard proximity context only; no 90 Redis GET fan-out — it reads the single `tokenBudget.costShadow` already in the polled payload.

## Known Stubs

None. BudgetBlock is wired to the live polled `tokenBudget` field; FlightRecorderBlock is wired to the live Bearer-gated `/llm-history` endpoint. No placeholder/empty-array data flows to render without a source. The Level-3 "call record as JSON" is an intentional GA-1 baseline (documented above), not a stub.

## Threat Flags

None — no new network surface introduced. BudgetBlock consumes an already-polled, server-Bearer-gated field; FlightRecorderBlock fetches the existing Plan-04 Bearer-gated endpoint. Both degrade-open (T-39-05-I accept). No new packages (T-39-SC).

## Issues Encountered

None — both tasks executed cleanly. The eslint/prettier pre-commit hooks reformatted imports + long JSX on commit (auto-fix, transparent). Full `src/` suite stayed green (1113 passed) after both blocks landed.

## User Setup Required

None — no env vars, no external service config. Both blocks ride the existing `DASHBOARD_PASSWORD` Bearer gate already used by the operator console.

## Next Phase Readiness

- This is the FINAL plan of Phase 39. With Plans 01-05 complete, the operator-visibility surface is functional end-to-end: token-budget proximity + cost-shadow USD (BudgetBlock) and the LLM flight recorder run->call->detail drill-down (FlightRecorderBlock), both reading the Plan-03/04 server contracts.
- Phase 40 (UI-POLISH) owns the GA-1 deferrals: rich filters, polished prompt-copy, final tab/subtab placement.

## Verification (actual output)

- `npx vitest run src/components/ui/__tests__/BudgetBlock.test.tsx` -> **Test Files 1 passed (1) / Tests 7 passed (7)** (null gate, header/provider row, 4dp USD + caption, band hard/soft/ok, empty providers).
- `npx tsc --noEmit -p tsconfig.json` -> **exit 0** (no output).
- `npx vitest run src/` -> **Test Files 81 passed | 2 skipped (83) / Tests 1113 passed | 19 skipped | 5 todo (1137)** — no regression from adding both blocks + the mount.
- Source assertions:
  - `grep -c "tokenBudget" src/components/ui/DevApiStatus.tsx` -> **3** (>=2: type field + mount).
  - `grep -cE "color-(flight|ship|event|site|faction|ethnic)" src/components/ui/BudgetBlock.tsx` -> **0**.
  - `grep -c "FLIGHT RECORDER" src/components/ui/FlightRecorderBlock.tsx` -> **1**; `grep -c "/api/events/llm-history" ...` -> **2**; `grep -c "dashboardAuthHeaders" ...` -> **3**.
  - `grep -cE "color-(flight|ship|event|site|faction|ethnic)" src/components/ui/FlightRecorderBlock.tsx` -> **0**; `grep -c "FlightRecorderBlock" src/components/ui/DevApiStatus.tsx` -> **2** (import + mount).

## Self-Check: PASSED

- `src/components/ui/BudgetBlock.tsx` — FOUND (created)
- `src/components/ui/FlightRecorderBlock.tsx` — FOUND (created)
- `src/components/ui/__tests__/BudgetBlock.test.tsx` — FOUND (created)
- `src/components/ui/DevApiStatus.tsx` — FOUND (modified)
- Commit `358a678` (Task 1) — present in git log
- Commit `3ce645b` (Task 2) — present in git log

---

## Gap Closure (SC39-3 — WR-01/04/05)

The phase verifier (39-VERIFICATION.md) and code review (39-REVIEW.md) flagged three
correctness/honesty defects in the LLM flight recorder. Operator chose FIX NOW. All three
repaired with atomic commits + tests; `npx tsc -b` exit 0, server tier 1369 passed, UI tier 72 passed.

### WR-01 — Run outcome badge was dishonest (failed runs painted SUCCESS/green)

Root cause: `finishBatch()` in `server/lib/llmEventExtractor.v3.ts` ticked the completed-batch
counter on EVERY terminal branch (success AND failure), so the run record derived
`batchesFailed = totalBatches - completedBatches ≈ 0`, and `dlqDelta` was hardcoded `0`
(`llmExtractionPipeline.ts`). The FlightRecorder `outcomeBand()` 'partial' (yellow) band was
therefore dead code.

Fix:

- `server/lib/llmProgress.ts` — new optional `LLMPipelineProgress.failedBatches` (cleared on reset
  in `INITIAL_PROGRESS`).
- `server/lib/llmEventExtractor.v3.ts` — `recordFailedBatch()` (added beside `finishBatch`) ticks
  `llmProgress.failedBatches` ONLY on genuine-failure terminal branches: watchdog null content,
  JSON.parse failure, Zod schema-fail, and an adaptive split that yielded zero events. The success
  branch never calls it. `finishBatch()` still drives the success+failure progress cadence.
- `server/lib/llmExtractionPipeline.ts` — `buildRunHistoryEntry` (now async) sets
  `batchesFailed` from `llmProgress.failedBatches` and `batchesCompleted` as the true success count
  (`totalBatches - failedBatches`). `dlqDelta` is computed from a `countDLQ()` (SCARD) snapshot at
  run open vs. close (`max(0, close - open)`); the bounded-set undercount caveat is documented at
  the open snapshot.
- `src/components/ui/FlightRecorderBlock.tsx` — badge TEXT is now keyed off the derived band via
  `outcomeLabel(run)` so a completed-but-partial run reads `PARTIAL` (yellow), not `SUCCESS`.

### WR-04 — Eval score never written back

`runEval()`'s result in `runRefreshExtraction` was only logged, so the run record's `evalScore`
was effectively always `undefined`.

Fix (`server/lib/llmExtractionPipeline.ts`): capture the result and `updateProgress({ evalScore })`
right after `runEval()` resolves, so `buildRunHistoryEntry` snapshots THIS run's real eval shape
(`{ within5km, within20km, within100km, total, actorMatchRate }` per `server/lib/llmEvalHarness.ts`).
Defensive re-stamp — no longer depends solely on `runEval`'s internal `updateProgress`.

### WR-05 — Client read a non-existent `evalScore.score` field

The client `normalizeEvalScore` read `evalScore.score`, absent from the server shape, so the eval
pill never rendered.

Fix (`src/components/ui/FlightRecorderBlock.tsx`): added the real `ServerEvalScore` type and rewrote
`normalizeEvalScore` to return `within20km / total` (the deploy-gate radius). The pill renders
`eval {pct}% @20km` with a tooltip; degrade-open hides the pill on absent/zero total (never crashes).
Eval color thresholds unchanged (green ≥0.95 / yellow ≥0.80 / red below).

### Tests added (would have caught all three)

- `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` — 4 new cases: failedBatches
  increments on watchdog-null / schema-fail / JSON-parse-fail; stays undefined on success.
- `server/__tests__/lib/llmExtractionPipeline.flightRecorder.test.ts` (new) — 4 cases: fully-failed
  run → `batchesFailed>0` + `outcome:'error'` + real `dlqDelta`; partial run; clean run; and the
  closed run record carries the real eval shape (WR-04).
- `src/components/ui/__tests__/FlightRecorderBlock.test.tsx` (new) — 10 cases: eval pill renders
  `within20km/total` (green/yellow thresholds + degrade-open), and outcome bands fire correctly
  (SUCCESS/PARTIAL/dlq-only-PARTIAL/ERROR/RUNNING) + degrade-open.

### Commits

- `4fc85e1` fix(39): honest batchesFailed + dlqDelta + eval write-back in run record (WR-01, WR-04)
- `da4e42c` fix(39): align FlightRecorder eval pill + outcome badge to real wire shape (WR-05)

WR-01 and WR-04 are co-located in `llmExtractionPipeline.ts` (same run-record close path + same
pipeline test), so they share one server commit.

### Verification output

- `npx tsc -b` → exit 0
- `npx vitest run server/` → 116 files, 1369 passed
- `npx vitest run src/components/ui/` → 9 files, 72 passed

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco_
_Completed: 2026-06-04_
