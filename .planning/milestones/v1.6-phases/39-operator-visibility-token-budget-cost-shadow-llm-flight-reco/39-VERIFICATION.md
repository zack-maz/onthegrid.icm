---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
verified: 2026-06-04T22:45:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 3/4
  gaps_closed:
    - 'SC39-3 WR-01: recordFailedBatch() now stamps llmProgress.failedBatches only on genuine failure branches; buildRunHistoryEntry sets honest batchesFailed/batchesCompleted/dlqDelta'
    - 'SC39-3 WR-04: runEval() result now written to llmProgress.evalScore via updateProgress() before buildRunHistoryEntry snapshots it'
    - 'SC39-3 WR-05: client normalizeEvalScore now reads within20km/total from the real ServerEvalScore shape; pill renders eval {pct}% @20km degrade-open'
  gaps_remaining: []
  regressions: []
---

# Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder Verification Report

**Phase Goal:** Give the operator a Bearer-gated dashboard surface for per-provider token usage vs cap (soft 0.8 / hard 0.95 threshold proximity bars), today's cost-shadow USD accrual, and a Redis-backed LLM flight recorder (call history + per-run summaries) that survives Vercel Fluid Compute warm-start gaps.

**Verified:** 2026-06-04T22:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure commits 4fc85e1, da4e42c, 789fd68

---

## Summary

All four success criteria are now VERIFIED. The three previously-human-flagged defects (WR-01/04/05) were repaired in gap-closure commits 4fc85e1 (server fixes) and da4e42c (client fix), with test coverage added in all three touched files. No regressions were found; the full test suite (198 files / 2492 tests) is confirmed green by the orchestrator.

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                                  | Status   | Evidence                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BudgetBlock shows per-provider token usage vs cap with soft/hard proximity bars + today's cost-shadow USD in DevApiStatus.tsx                                                                                                          | VERIFIED | `src/components/ui/BudgetBlock.tsx` renders proximity bar with `bg-white/10` track, band-colored fill, 80%/95% tick overlays, and `Cost today: $X.XXXX` row; mounted at DevApiStatus.tsx:1747 (unchanged from initial verification) |
| 2   | Bearer-gated GET /api/operator-status exposes `tokenBudget` field, degrade-open, Zod .strict() contract test passes                                                                                                                    | VERIFIED | `server/routes/operator-status.ts:526-572` implements the block; Zod .strict() contract test at operator-status.test.ts:863-956 — 2 cases, all pass (unchanged from initial verification)                                           |
| 3   | Redis-backed call/run history rings exist, are wired into extraction pipeline (runId threading), cold-start hydration works, FlightRecorderBlock drill-down functional with honest outcome badge (WR-01) and live eval pill (WR-04/05) | VERIFIED | All three gap-closure fixes confirmed in code and tests — see SC39-3 detail section below                                                                                                                                           |
| 4   | Bearer-gated GET /api/events/llm-history returns {runs, calls} with ?runId / ?limit; every call carries parent runId                                                                                                                   | VERIFIED | Endpoint at events.ts:495-510; Bearer gate via dashboardAuth; runId stamped on both success and failure call paths (unchanged from initial verification)                                                                            |

**Score:** 4/4 truths verified

---

## SC39-3 Re-verification: WR-01 + WR-04 + WR-05 — Gap Closure Confirmed

### WR-01 — Outcome badge honesty (VERIFIED)

**Root cause (prior):** `finishBatch()` in `server/lib/llmEventExtractor.v3.ts` ticked `completedBatches` on ALL terminal branches (success AND failure), so `batchesFailed = totalBatches - completedBatches ≈ 0`. `dlqDelta` was hardcoded `0` in `buildRunHistoryEntry`. The `outcomeBand()` `'partial'` band was dead code.

**Fix verified in code:**

- `recordFailedBatch()` defined at `server/lib/llmEventExtractor.v3.ts:589-591`:

  ```
  const recordFailedBatch = (): void => {
    updateProgress({ failedBatches: (llmProgress.failedBatches ?? 0) + 1 });
  };
  ```

  Called ONLY on genuine-failure terminal branches:
  - Line 729: adaptive split yielding zero events (`if (splitEvents.length === 0) recordFailedBatch()`)
  - Line 736: null/watchdog-timeout (`recordFailedBatch(); // WR-01 — null/timeout terminal branch is a failure`)
  - Line 779: JSON.parse failure (`recordFailedBatch(); // WR-01 — JSON.parse failure terminal branch is a failure`)
  - Line 807: Zod schema-fail (`recordFailedBatch(); // WR-01 — Zod schema-fail terminal branch is a failure`)
  - **Success branch at line 890 calls only `finishBatch()` — `recordFailedBatch()` is absent**

- `buildRunHistoryEntry` in `server/lib/llmExtractionPipeline.ts:373-403` (now async):
  - Line 377: `const failedBatches = Math.min(totalBatches, llmProgress.failedBatches ?? 0);`
  - Line 378: `const succeededBatches = Math.max(0, totalBatches - failedBatches);`
  - Lines 381-388: `dlqDelta` computed from real `countDLQ()` SCARD snapshots open vs. close (`Math.max(0, dlqSizeAtClose - dlqSizeAtOpen)`), degrade-open on Redis throw
  - Lines 394-396: `batchesCompleted: succeededBatches`, `batchesFailed: failedBatches`

- `outcomeLabel()` in `src/components/ui/FlightRecorderBlock.tsx:134-138`:

  ```
  function outcomeLabel(run: RunHistoryEntry): string {
    const band = outcomeBand(run);
    if (band === 'partial') return 'PARTIAL';
    return OUTCOME_LABEL[run.outcome];
  }
  ```

  Badge text is now keyed off the derived band. A `completed` run with `batchesFailed > 0 || dlqDelta > 0` routes to `'partial'` band and reads `PARTIAL` not `SUCCESS`.

- `outcomeBand()` at lines 101-109: `return run.batchesFailed > 0 || run.dlqDelta > 0 ? 'partial' : 'success'` — the `'partial'` band is now reachable.

- `llmProgress.failedBatches` declared at `server/lib/llmProgress.ts:50` and cleared in `INITIAL_PROGRESS:573` (`failedBatches: undefined`).

**Test coverage (server/**tests**/lib/llmEventExtractor.v3-adaptive.test.ts lines 482-542):**

- Line 483-491: watchdog-timeout batch increments `failedBatches` to 1
- Line 493-507: schema-fail batch increments `failedBatches` to 1
- Line 509-523: JSON.parse-fail batch increments `failedBatches` to 1
- Line 525-541: fully-successful batch — `failedBatches` stays `undefined`

**Test coverage (server/**tests**/lib/llmExtractionPipeline.flightRecorder.test.ts lines 316-370):**

- Fully-failed run (mockFailedBatches=2, mockProduceEvents=false): `batchesFailed=2, batchesCompleted=0, outcome='error', dlqDelta=2`
- Partial run (mockFailedBatches=1, mockProduceEvents=true): `batchesFailed=1, batchesCompleted=1, outcome='completed', dlqDelta=1`
- Clean run (mockFailedBatches=0): `batchesFailed=0, batchesCompleted=2, dlqDelta=0, outcome='completed'`

**Test coverage (src/components/ui/**tests**/FlightRecorderBlock.test.tsx lines 132-181):**

- `batchesFailed:0, dlqDelta:0` → `SUCCESS` / `text-accent-green` (line 133-140)
- `batchesFailed:3, dlqDelta:3` → `PARTIAL` / `text-accent-yellow` (line 142-151) — previously dead band confirmed reachable
- `batchesFailed:0, dlqDelta:2` → `PARTIAL` (dlqDelta-only path, line 153-161)
- `outcome:'error', batchesFailed:5` → `ERROR` / `text-accent-red` (line 163-170)
- `outcome:'running'` → `RUNNING` / `text-accent-blue` (line 172-181)

**Verdict: WR-01 VERIFIED.**

---

### WR-04 — Eval score write-back (VERIFIED)

**Root cause (prior):** In `server/lib/llmExtractionPipeline.ts`, `runEval()`'s result was captured into a local variable and passed only to `log.info()`, never to `updateProgress({ evalScore })`. `buildRunHistoryEntry` read `llmProgress.evalScore` which remained `undefined` from `resetProgress()`.

**Fix verified in code (`server/lib/llmExtractionPipeline.ts:533-549`):**

```
// Phase 39 SC39-3 (WR-04) — capture the eval result and stamp it onto
// the live progress singleton so `buildRunHistoryEntry` snapshots THIS
// run's actual score into the run record...
try {
  const evalScore = await runEval();
  updateProgress({ evalScore });
  log.info({ evalScore, schemaVersion: 'v3' }, 'eval harness completed');
} catch (evalErr) {
  log.warn({ err: evalErr }, 'eval harness threw; continuing pipeline');
}
```

`updateProgress({ evalScore })` at line 545 stamps the result onto `llmProgress.evalScore` before `buildRunHistoryEntry` runs in the `finally` block.

`buildRunHistoryEntry` at line 398: `evalScore: llmProgress.evalScore` — snapshots the now-populated field.

The `evalScore` type on `RunHistoryEntry` in `server/lib/llmProgress.ts:548` is `LLMPipelineProgress['evalScore']` — the real harness shape `{ within5km, within20km, within100km, total, actorMatchRate? }`.

**Test coverage (server/**tests**/lib/llmExtractionPipeline.flightRecorder.test.ts lines 372-384):**

```
it('closed run record carries the real harness eval shape (within20km/total)', async () => {
  await driveRunWithGroups(['a-1', 'b-1']);
  expect(runEvalSpy).toHaveBeenCalled();
  const rec = lastClosedRecord();
  expect(rec.evalScore).toEqual(evalShape); // { within5km:30, within20km:42, within100km:48, total:50, actorMatchRate:0.6 }
  expect((rec.evalScore as Record<string, unknown>).within20km).toBe(42);
  expect((rec.evalScore as Record<string, unknown>).total).toBe(50);
});
```

Asserts `runEvalSpy` was called and the closed record carries the full real shape with no `.score` field.

**Verdict: WR-04 VERIFIED.**

---

### WR-05 — Client eval pill reads real shape (VERIFIED)

**Root cause (prior):** Client `normalizeEvalScore` read `evalScore.score`, which does not exist on the server shape `{ within5km, within20km, within100km, total }`. Even if WR-04 had been fixed, the pill would never render.

**Fix verified in code (`src/components/ui/FlightRecorderBlock.tsx`):**

- `ServerEvalScore` interface declared at lines 55-61:

  ```typescript
  interface ServerEvalScore {
    within5km: number;
    within20km: number;
    within100km: number;
    total: number;
    actorMatchRate?: number | null;
  }
  ```

  No `.score` key. The comment at line 52-54 explicitly documents the prior fiction.

- `normalizeEvalScore` at lines 167-177:

  ```typescript
  function normalizeEvalScore(evalScore: RunHistoryEntry['evalScore']): number | null {
    if (evalScore == null) return null;
    if (typeof evalScore === 'number') return Number.isFinite(evalScore) ? evalScore : null;
    if (typeof evalScore.within20km === 'number' && typeof evalScore.total === 'number') {
      if (evalScore.total <= 0) return null;
      return evalScore.within20km / evalScore.total;
    }
    return null;
  }
  ```

  Reads `within20km / total` (the deploy-gate radius per the harness). Degrade-open: null on missing object, zero/absent total, or legacy bare-number score.

- Pill rendered at lines 302-310:
  ```
  {score != null && (
    <span ... data-testid={`flight-recorder-eval-${run.runId}`} title="Resolver accuracy within 20km of ground truth">
      eval {(score * 100).toFixed(0)}% @20km
    </span>
  )}
  ```

**Test coverage (src/components/ui/**tests**/FlightRecorderBlock.test.tsx lines 80-130):**

- `{ within20km:45, total:50 }` → pill renders `'90%'` and `'@20km'`, class `text-accent-yellow` (45/50=0.90, in yellow ≥0.80 band)
- `{ within20km:49, total:50 }` → `'98%'`, class `text-accent-green` (≥0.95 band)
- `{ total:0 }` → pill is absent (degrade-open, no crash)
- `evalScore: undefined` → pill is absent (degrade-open)

**Verdict: WR-05 VERIFIED.**

---

## Required Artifacts (re-verification regression check)

| Artifact                                                            | Status                     | Notes                                                                                                                             |
| ------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/llmCallHistory.ts`                                      | VERIFIED (regression pass) | Unchanged from initial; bounded ring, degrade-open                                                                                |
| `server/lib/llmRunHistory.ts`                                       | VERIFIED (regression pass) | Unchanged from initial; open/close lifecycle, dedupe                                                                              |
| `server/lib/llmProgress.ts`                                         | VERIFIED (updated)         | `failedBatches?: number` added at line 50; `INITIAL_PROGRESS` seeds it `undefined` at line 573                                    |
| `server/lib/llmExtractionPipeline.ts`                               | VERIFIED (updated)         | `buildRunHistoryEntry` now async; honest batchesFailed/batchesCompleted; real dlqDelta; evalScore write-back                      |
| `server/lib/llmEventExtractor.v3.ts`                                | VERIFIED (updated)         | `recordFailedBatch()` added; called only on failure branches; success branch untouched                                            |
| `src/components/ui/FlightRecorderBlock.tsx`                         | VERIFIED (updated)         | `ServerEvalScore` interface; `normalizeEvalScore` reads real shape; `outcomeLabel()` keyed off band                               |
| `server/__tests__/lib/llmCallHistory.test.ts`                       | VERIFIED (regression pass) | 6 cases unchanged                                                                                                                 |
| `server/__tests__/lib/llmRunHistory.test.ts`                        | VERIFIED (regression pass) | 6 cases unchanged                                                                                                                 |
| `server/routes/__tests__/llm-history.test.ts`                       | VERIFIED (regression pass) | 7 cases unchanged                                                                                                                 |
| `server/routes/__tests__/operator-status.test.ts`                   | VERIFIED (regression pass) | 22 cases unchanged                                                                                                                |
| `src/components/ui/__tests__/BudgetBlock.test.tsx`                  | VERIFIED (regression pass) | 7 cases unchanged                                                                                                                 |
| `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts`        | VERIFIED (new)             | 4 WR-01 cases added (lines 482-542): watchdog-null, schema-fail, JSON.parse-fail increment failedBatches; success stays undefined |
| `server/__tests__/lib/llmExtractionPipeline.flightRecorder.test.ts` | VERIFIED (new)             | 4 cases: fully-failed run batchesFailed+dlqDelta; partial run; clean run; real evalScore shape                                    |
| `src/components/ui/__tests__/FlightRecorderBlock.test.tsx`          | VERIFIED (new)             | 10 cases: eval pill real shape + color thresholds + degrade-open; all 5 outcome bands                                             |
| `src/components/ui/BudgetBlock.tsx`                                 | VERIFIED (regression pass) | Unchanged                                                                                                                         |
| `src/components/ui/DevApiStatus.tsx`                                | VERIFIED (regression pass) | Unchanged                                                                                                                         |
| `server/routes/operator-status.ts`                                  | VERIFIED (regression pass) | Unchanged                                                                                                                         |
| `server/routes/events.ts`                                           | VERIFIED (regression pass) | Unchanged                                                                                                                         |
| `server/lib/freeClaudeRouter.ts`                                    | VERIFIED (regression pass) | runId threading unchanged                                                                                                         |

---

## Key Link Verification (regression check)

All key links verified in initial report remain wired. No source changes to routing paths. Re-verification focused only on the three failure branches.

| From                                            | To                                    | Via                                                                               | Status      |
| ----------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| `llmEventExtractor.v3.ts recordFailedBatch`     | `llmProgress.failedBatches`           | `updateProgress({ failedBatches: (llmProgress.failedBatches ?? 0) + 1 })` at :590 | WIRED (new) |
| `llmExtractionPipeline.ts buildRunHistoryEntry` | `llmProgress.failedBatches`           | Line 377: `llmProgress.failedBatches ?? 0`                                        | WIRED (new) |
| `llmExtractionPipeline.ts buildRunHistoryEntry` | `countDLQ()` open/close snapshots     | Lines 351, 382: `countDLQ()` at run open and close                                | WIRED (new) |
| `llmExtractionPipeline.ts runEval()`            | `llmProgress.evalScore`               | Line 545: `updateProgress({ evalScore })` after `await runEval()`                 | WIRED (new) |
| `FlightRecorderBlock.tsx normalizeEvalScore`    | `ServerEvalScore.within20km / .total` | Lines 172-174: reads real shape fields                                            | WIRED (new) |
| `FlightRecorderBlock.tsx outcomeLabel`          | `outcomeBand` derived band            | Lines 134-138: `if (band === 'partial') return 'PARTIAL'`                         | WIRED (new) |

---

## Requirements Coverage

All 10 requirement IDs confirmed accounted for. OBS-FLIGHT-04 updated from PARTIALLY SATISFIED to SATISFIED.

| Requirement   | Source Plan  | Description                                                                                                         | Status    | Evidence                                                                                                                      |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| BUDGET-01     | 39-05        | BudgetBlock in DevApiStatus.tsx surfacing per-provider used-vs-cap with soft/hard proximity bars                    | SATISFIED | Unchanged from initial                                                                                                        |
| BUDGET-02     | 39-05        | Cost-shadow accrual from `events:llm-cost-shadow:v3:{date}` — today's USD displayed                                 | SATISFIED | Unchanged from initial                                                                                                        |
| BUDGET-03     | 39-03        | New `/api/operator-status` field `tokenBudget`, Bearer-gated, degrade-open on Redis fail                            | SATISFIED | Unchanged from initial                                                                                                        |
| BUDGET-04     | 39-03        | Contract test pins `tokenBudget` field shape (Zod `.strict()`)                                                      | SATISFIED | Unchanged from initial                                                                                                        |
| OBS-FLIGHT-01 | 39-01, 39-02 | Redis-backed call history ring `llm:calls:history` (LPUSH+LTRIM 500-cap, 30d TTL)                                   | SATISFIED | Unchanged from initial                                                                                                        |
| OBS-FLIGHT-02 | 39-01, 39-02 | Per-run summary records `llm:runs:history` (200-cap, 30d TTL), open+close lifecycle                                 | SATISFIED | Unchanged from initial                                                                                                        |
| OBS-FLIGHT-03 | 39-04        | `GET /api/events/llm-history` Bearer-gated, returns `{runs, calls}` with ?runId/?limit                              | SATISFIED | Unchanged from initial                                                                                                        |
| OBS-FLIGHT-04 | 39-05        | FlightRecorderBlock: run list (honest outcome badge, batch progress bar, token spend, eval score pill) + drill-down | SATISFIED | WR-01/04/05 all fixed: badge reads PARTIAL/yellow for failed batches, eval pill renders `within20km/total`, both degrade-open |
| OBS-FLIGHT-05 | 39-02        | runId threaded through every LLM call in a runRefreshExtraction                                                     | SATISFIED | Unchanged from initial                                                                                                        |
| OBS-FLIGHT-06 | 39-01, 39-04 | Cold-start hydration on first /llm-status or /llm-history request                                                   | SATISFIED | Unchanged from initial                                                                                                        |

---

## Anti-Patterns Found (re-verification scan on modified files)

Gap-closure commits touched: `server/lib/llmEventExtractor.v3.ts`, `server/lib/llmExtractionPipeline.ts`, `server/lib/llmProgress.ts`, `src/components/ui/FlightRecorderBlock.tsx`, and the three test files.

| File                                  | Line    | Pattern                                                    | Severity | Impact                                                                                                                                   |
| ------------------------------------- | ------- | ---------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/llmExtractionPipeline.ts` | 344-350 | Bounded-set undercount caveat documented in comment        | INFO     | Documented honest lower-bound; not a defect — a `max(0, …)` floor caveat on the DLQ SCARD diff; acceptable for operator decision-support |
| `src/components/ui/BudgetBlock.tsx`   | 16      | `$X.XXXX` in JSDoc (format placeholder, not a debt marker) | INFO     | Unchanged from initial; not actionable                                                                                                   |

No unresolved TBD/FIXME/XXX debt markers in any gap-closure file. No new anti-patterns introduced.

---

## Behavioral Spot-Checks

| Behavior                                 | Command                                                                            | Result                                                                                    | Status                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| WR-01 failedBatches unit cases           | `npx vitest run server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts`        | 4 WR-01 cases + 6 pre-existing cases — orchestrator confirms 198 files / 2492 tests green | PASS (via orchestrator suite) |
| WR-04 eval write-back + WR-01 run record | `npx vitest run server/__tests__/lib/llmExtractionPipeline.flightRecorder.test.ts` | 4 new cases — orchestrator confirms green                                                 | PASS (via orchestrator suite) |
| WR-05 eval pill + outcome bands          | `npx vitest run src/components/ui/__tests__/FlightRecorderBlock.test.tsx`          | 10 new cases — orchestrator confirms green                                                | PASS (via orchestrator suite) |

---

## Human Verification Required

None. All previously-flagged display defects (WR-01 outcome badge, WR-04/05 eval pill) are now verified in code and covered by targeted tests. No new human-verification items identified.

---

## Gaps Summary

No gaps. All four success criteria are verified. The phase infrastructure is complete, honest, and tested.

---

_Initial verified: 2026-06-04T21:31:14Z_
_Re-verified: 2026-06-04T22:45:00Z (after gap-closure commits 4fc85e1, da4e42c, 789fd68)_
_Verifier: Claude (gsd-verifier)_
