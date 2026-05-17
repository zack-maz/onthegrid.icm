---
phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
plan: 03
subsystem: server-llm-pipeline
tags: [simplify-01, d-04, llm-extraction, redis-budget, deletion-phase]
requires:
  - 30-06 (Run 2 SET-count audit signal for the commit message body)
  - 30-05 (Phase 30 D-02 retuned defaults already shipped — LLM_BATCH_SIZE, LLM_BATCH_TIMEOUT_MS)
  - 28.2.6 (the Phase 28.2.6 Plan 01 mechanism this plan retires)
provides:
  - 'Single-writer invariant: cron-only mergeAndPersistLlmEntities call at end of runRefreshExtraction IIFE is the sole writer of events:llm:v3'
  - '~95% reduction in Redis SET-call count for events:llm:v3 per cron run (~22 → 1 at 213-batch run)'
  - 'Regression test (terminalShape.test.ts): mergeAndPersistLlmEntities called exactly once per successful run — mirrors runEval-once invariant'
  - 'Regression test (incrementalWrite.test.ts): events:llm:v3 receives exactly ONE terminal write across 5-batch and 12-batch happy paths'
  - 'Regression test (crossBoundary.test.ts): mid-run abort leaves events:llm:v3 EMPTY (CONTEXT D-04 / T-30-03 accepted disposition)'
affects:
  - server/lib/llmExtractionPipeline.ts (148 lines deleted, 31 added — onBatchComplete callback shrinkage + helper docblock reword + orphan const/import cleanup)
  - server/config.ts (LLM_FLUSH_EVERY_N_BATCHES Zod entry deleted)
  - .env.example (LLM_FLUSH_EVERY_N_BATCHES block deleted)
  - 3 test files (cadence assertions replaced with no-flush invariants)
tech-stack:
  added: []
  patterns:
    - 'Atomic-per-decision commit discipline (Phase 29 D-N convention; per CONTEXT D-08 Commits 3 / 6 dependency)'
    - 'Pitfall 7 happy-path-only exactly-once assertion scope (RESEARCH §Pitfall 7)'
key-files:
  created:
    - .planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-03-SUMMARY.md
  modified:
    - server/lib/llmExtractionPipeline.ts
    - server/config.ts
    - .env.example
    - server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts
    - server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts
    - server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts
decisions:
  - "Plan 03 retires the periodic-flush MECHANISM only — the events:llm:v3:partial observability key writes inside the v3 extractor's writePartialCache STAY untouched (SIMPLIFY-02 / Phase 34 owns the partial-key retirement). The local PARTIAL_KEY_ACTIVE const in llmExtractionPipeline.ts was orphaned by the callback shrinkage and deleted with a tombstone comment; the v3 extractor maintains its own PARTIAL_KEY reference."
  - "crossBoundary.test.ts auto-fixed under Rule 3 (blocking, same root cause as Tasks 1-3). Both pre-existing tests (`two consecutive partial runs produce same final state` and `periodic flush geocode quality equals final flush geocode quality`) asserted behaviors that the periodic-flush retirement makes impossible. Replaced with two new tests: a mid-run-abort negative-shape assertion (events:llm:v3 stays empty) and a happy-path exactly-once mirror of the terminalShape.test.ts invariant. This was an in-scope cascading consequence of Task 1's code deletion, not pre-existing tech debt."
  - "Operator's stale Vercel LLM_FLUSH_EVERY_N_BATCHES env-var is harmless once the Zod entry is gone (CONTEXT D-04 / RESEARCH §Runtime State Inventory). Documented in the Task 2 commit body for operator-driven post-merge cleanup."
metrics:
  duration_seconds: 716
  completed: 2026-05-17T05:44:22Z
  commits: 3
---

# Phase 30 Plan 03: Retire Incremental Flush Mechanism (SIMPLIFY-01 / D-04) Summary

Single-pass deletion of the Phase 28.2.6 Plan 01 incremental-flush mechanism — the `mergeAndPersistLlmEntities` call inside the `onBatchComplete` callback (every-N-batches) — leaving the terminal write at the end of `runRefreshExtraction` as the canonical (and only) writer of `events:llm:v3`. Pro 800s ceiling obsoletes the 300s-Hobby crash-protection rationale; Plan 06 Run 2 validated 0 watchdog hard-kills inside budget.

## Tasks Executed

| Task | Name                                                                                                                                                                    | Status   | Commit  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| 1    | Delete onBatchComplete periodic-flush block + FLUSH_EVERY_N_BATCHES constants/helper + reword helper docblock                                                           | complete | 6bdea38 |
| 2    | Delete LLM_FLUSH_EVERY_N_BATCHES from server/config.ts + .env.example                                                                                                   | complete | 3635e2a |
| 3    | Update terminalShape.test.ts (add exactly-once mergeAndPersist) + incrementalWrite.test.ts (replace per-N-flush with no-flush) + crossBoundary.test.ts (Rule-3 cascade) | complete | 87d9b57 |

## Exact Line Ranges Deleted (for SIMPLIFY-07 LOC accounting / Phase 34)

| File                                  | Pre-deletion lines                                                                       | Post-deletion lines                    | Net delta      |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | -------------- |
| `server/lib/llmExtractionPipeline.ts` | 590                                                                                      | 504                                    | **-86**        |
| `server/config.ts`                    | block at lines 116-123 (8 lines incl. 7-line Phase 28.2.6 D-03 commentary + 1 Zod entry) | 7-line Phase 30 D-04 tombstone comment | **-1** (8 - 7) |
| `.env.example`                        | block at lines 169-173 (5 lines incl. 4-line commentary + 1 var line)                    | 0 lines                                | **-5**         |
| Test files (3)                        | net +0 (assertion replacements, not deletions)                                           |                                        | 0              |
| **Total**                             |                                                                                          |                                        | **-92 LOC**    |

Detailed `server/lib/llmExtractionPipeline.ts` deletions (Task 1 commit 6bdea38):

- **Lines 88-106 pre-deletion (~19 lines):** `FLUSH_EVERY_N_BATCHES_DEFAULT = 10` constant + `getFlushEveryNBatches()` helper + their JSDoc.
- **Lines 333-419 pre-deletion (~87 lines):** The entire periodic-flush block inside `onBatchComplete`: counters (`batchesSinceLastFlush`, `lastFlushedEventCount`), partial-cache read, window slice, `geocodeEnrichedEvents` call, `enrichedV3ToEntities` adapt, `mergeAndPersistLlmEntities` call, best-effort try/catch error handler — collapsed to a 5-line callback (just `updateProgress` + a SIMPLIFY-01 rationale comment).
- **Line 35 pre-deletion:** `import { env } from '../config.js';` — orphaned after the only `env.LLM_FLUSH_EVERY_N_BATCHES` reference went with the periodic-flush block.
- **Line 70 pre-deletion:** `const PARTIAL_KEY_ACTIVE = 'events:llm:v3:partial';` — orphaned after the periodic-flush block (its sole reader) was deleted; tombstone comment left in its place pointing at SIMPLIFY-02 (the v3 extractor's `writePartialCache` is still the active writer of this key).

Helper docblock at lines 108-148 pre-deletion was reworded: removed "periodic flush hook (every N batches inside the IIFE)" mention; added `Phase 30 D-04: single callsite (end-of-run terminal write only). Periodic flush retired (SIMPLIFY-01).`

## Redis SET-call Delta (audit signal — CONTEXT D-04)

Sourced from Plan 06 Run 2 observation (`run-2-throttle-snapshot.json` — `batchCount: 213`).

| Scenario         | SETs on `events:llm:v3` per cron run | Calculation                                                |
| ---------------- | ------------------------------------ | ---------------------------------------------------------- |
| **Pre-Plan-03**  | ~22                                  | floor(213 / 10) intermediate flushes + 1 terminal = 21 + 1 |
| **Post-Plan-03** | 1                                    | Sole terminal write at end-of-pipeline                     |
| **Delta**        | **~22 → 1 (~95% reduction)**         |                                                            |

The `LLM_FLUSH_EVERY_N_BATCHES=10` default (CONTEXT D-03) drove the intermediate-flush count. The 213-batch number is Run 2's actual observed `batchCount`. The pre-Plan calculation matches the cadence semantics: the callback incremented `batchesSinceLastFlush` on every batch and triggered a flush when it hit 10, so a 213-batch run had floor(213/10) = 21 intermediate flushes (the 13th, 23rd, …, 213th batches — well, the residual 3 don't trigger one).

## Terminal Write Site Preservation (grep verification)

`mergeAndPersistLlmEntities` appears 3 times in `server/lib/llmExtractionPipeline.ts` post-Plan-03:

```
120:async function mergeAndPersistLlmEntities(           # definition
338:            // write at the mergeAndPersistLlmEntities call below is canonical.   # rationale comment inside onBatchComplete
389:        await mergeAndPersistLlmEntities(llmEntities, llmCachedRef, LLM_EVENTS_KEY_ACTIVE);   # terminal callsite
```

The terminal callsite is the only invocation outside the helper definition. Confirms the single-writer invariant.

## Pitfall 1 Cache Bridge (server/routes/events.ts) — UNTOUCHED

`git diff d8c52ba HEAD -- server/routes/events.ts` returns 0 lines changed. The "map never goes blank" contract is preserved by construction — Plan 03 only touched the LLM extractor; the route's raw-GDELT fallback bridge is invariant.

## Test Files: Before/After Assertion Counts

| File                       | Pre-Plan assertions                                                               | Post-Plan assertions                                                      | Net                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `terminalShape.test.ts`    | 3 (two-key-discipline, partial-envelope, intermediate-flushes-skip-runEval)       | 4 (same three + new `mergeAndPersistLlmEntities-exactly-once`)            | **+1**                                                                                                           |
| `incrementalWrite.test.ts` | 3 (cadence-every-10, no-premature-flush, configurable-N=3)                        | 2 (`12-batch happy path exactly-once`, `5-batch happy path exactly-once`) | -1 (cadence dropped; configurable-N dropped; happy-path-mirror added; "no premature flush" renamed/restructured) |
| `crossBoundary.test.ts`    | 2 (two-consecutive-partial-runs-equal-continuous, periodic-flush-geocode-quality) | 2 (mid-run-abort-leaves-empty, happy-path-exactly-once)                   | 0                                                                                                                |
| **Total assertions**       | 8                                                                                 | 8                                                                         | 0 (re-shaped, not lost)                                                                                          |

The replacement assertions tighten coverage: the original "exactly N flushes" semantics are replaced with "exactly 1 terminal write" + a new negative-shape "0 mid-run writes" assertion (the deletion's main behavioral consequence).

Also updated: every `mockEnv` block (3 files) had `LLM_FLUSH_EVERY_N_BATCHES` property stripped, and the corresponding `beforeEach` reset lines removed. This honors the PATTERNS.md "Validation Architecture" atomicity invariant: the schema deletion (Task 2) and every test mock must move together.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — blocking)

**1. [Rule 3 - Blocking] `crossBoundary.test.ts` had two tests that asserted now-retired periodic-flush behaviors**

- **Found during:** Task 3 (after running the full server suite to verify no regressions)
- **Issue:** `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts` had two tests (`two consecutive partial 5-batch runs produce same final state as one continuous 10-batch run` and `periodic flush geocode quality equals final flush geocode quality (D-05)`) that asserted exactly the periodic-flush behavior Task 1 retired. Both tests failed under the post-D-04 code.
- **Fix:** Rewrote both tests to assert the post-D-04 invariants: (a) mid-run-abort leaves `events:llm:v3` empty (CONTEXT D-04 / T-30-03 accepted disposition), (b) happy-path 10-batch run receives exactly one terminal write (mirror of terminalShape.test.ts). Stripped `LLM_FLUSH_EVERY_N_BATCHES` from this file's `mockEnv` + `beforeEach` reset too. File header docblock rewritten.
- **Files modified:** `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts`
- **Commit:** 87d9b57 (rolled into Task 3 commit since same root cause and same atomic-test-update concern)
- **Rule rationale:** The plan explicitly mentioned updating 2 test files (terminalShape + incrementalWrite). The crossBoundary file's reliance on the same env var + the same periodic-flush mechanism was an in-scope cascading consequence of Task 1, not pre-existing tech debt. Per the scope boundary rule: "Only auto-fix issues DIRECTLY caused by the current task's changes" — these failures were direct consequences of the deletion, so Rule 3 applies.

### Pre-existing Baselines (NOT Plan 03 deviations)

**`npm run check:env` exits 1 at base commit (d8c52ba) and post-Plan**. The script reports `EXTRA in .env.example` for `LLM_PIPELINE_V2 / LLM_PIPELINE_V3` (Phase 29 D-02 part C operator-cleanup-pending) and 12 `VITE_*` client-tier vars that don't belong in the server Zod schema. Plan 03 did NOT regress this baseline — both `LLM_FLUSH_EVERY_N_BATCHES` sites went to 0 atomically. The pre-existing drift is out of scope for SIMPLIFY-01 and is logged for Phase 34 / SIMPLIFY-05 cleanup.

## Pointer for Plan 07 (reliability doc)

The Plan 07 reliability doc's "Retired Mechanisms" section should reference this Plan 03's:

- **SET-call delta:** Pre ~22 → Post 1 per cron run (~95% reduction) on `events:llm:v3` (sourced from Plan 06 Run 2 `batchCount: 213`).
- **LOC delta:** -92 LOC across `llmExtractionPipeline.ts` (-86), `server/config.ts` (-1 net), `.env.example` (-5). Feeds Phase 34 SIMPLIFY-07's cumulative v1.5 bundle delta.
- **Single-writer invariant:** End-of-run `mergeAndPersistLlmEntities` call at `server/lib/llmExtractionPipeline.ts:389` (post-deletion line number) is the sole writer of `events:llm:v3`. Mirrors CLAUDE.md "Cron-only trigger" language.

## Verification Evidence

```
$ git diff d8c52ba HEAD -- server/routes/events.ts | wc -l
0                                                                  # Pitfall 1 untouched

$ ! grep -q 'LLM_FLUSH_EVERY_N_BATCHES' server/config.ts && echo OK
OK
$ ! grep -q 'LLM_FLUSH_EVERY_N_BATCHES' .env.example && echo OK
OK
$ ! grep -q 'FLUSH_EVERY_N_BATCHES' server/lib/llmExtractionPipeline.ts && echo OK
OK
$ grep -q 'mergeAndPersistLlmEntities is called exactly once' \
    server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts && echo OK
OK

$ npx vitest run server/
 Test Files  92 passed (92)
      Tests  1123 passed (1123)

$ npx tsc --noEmit; echo $?
0
```

## Self-Check: PASSED

- [x] Commit 6bdea38 exists in git log
- [x] Commit 3635e2a exists in git log
- [x] Commit 87d9b57 exists in git log
- [x] `server/lib/llmExtractionPipeline.ts` modified — periodic-flush block deleted (verified by absence of `FLUSH_EVERY_N_BATCHES`, `batchesSinceLastFlush`, `lastFlushedEventCount` grep)
- [x] `server/config.ts` modified — LLM_FLUSH_EVERY_N_BATCHES Zod entry deleted (verified by grep -c → 0)
- [x] `.env.example` modified — LLM_FLUSH_EVERY_N_BATCHES line + commentary deleted (verified by grep -c → 0)
- [x] `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` modified — new exactly-once assertion present
- [x] `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` modified — no-flush invariant
- [x] `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts` modified — Rule 3 auto-fix for same root cause
- [x] `npx vitest run server/` exits 0 (92 files, 1123 tests passed)
- [x] `npx tsc --noEmit` exits 0
- [x] `server/routes/events.ts` untouched (Pitfall 1 cache bridge preserved)
- [x] Plan 06 Run 2 SET-count delta quoted in this SUMMARY + in Task 1 commit body (~22 → 1)
- [x] SUMMARY.md created at `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-03-SUMMARY.md`
