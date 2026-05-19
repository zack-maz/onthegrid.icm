---
phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
plan: 04
subsystem: api
tags: [llm, watchdog, simplify, soft-warn, retirement, single-tier]

# Dependency graph
requires:
  - phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
    provides:
      - Active cascade narrowed to NIM + OpenRouter (D-01); the prior soft-warn-as-Cerebras-slowness signal is moot
      - Vercel Pro 800s maxDuration ceiling (D-08); 60s soft-warn at p50 ~27s batch latency is mostly noise
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/01
    provides:
      - retryAfterMs + scripts/analyze-llm-run.ts (Plan 01) — soft-warn data is now derivable post-run from the analyzer latency histogram
      - Plan 01's analyzer ignores unknown skipReason values, providing forward-compat for the stale 'watchdog-soft-warn' rows under 90d Redis TTL
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/02
    provides:
      - run-1-throttle-snapshot.json — watchdogTimeoutCount=0 at p95 batch latency 33s (proof soft-warn never captured anything that would be lost)
provides:
  - Single-tier hard-kill watchdog (timeoutMs / onTimeout); BatchWatchdogOptions narrowed to exactly 4 fields
  - softWarnMs / onSoftWarn / softWarnTimer all deleted from the watchdog primitive
  - Both v3 withBatchWatchdog callsites (~lines 631 and ~955) softWarnMs-free; the 23-line synthetic-callHistory writer that emitted skipReason: 'watchdog-soft-warn' is deleted
  - 'watchdog-soft-warn' enum literal removed from BOTH LLMPipelineProgress.callHistory.skipReason AND LLMRunSummary.callHistory.skipReason
  - llmExtractorWatchdog.test.ts narrowed to 3 surviving cases (success / hard-timeout / late-resolve clobber prevention); soft-warn invocation test deleted atomically with code change
affects:
  - 30-05 (sequential next wave plan — owns hard-kill default raise from Run-1 measurement; structurally unblocked by this plan's interface narrowing)
  - 30-07 (architecture doc retired-mechanisms block — quotes this plan's deletion narrative)
  - 34 (SIMPLIFY-02 partial-cache retirement / SIMPLIFY-07 bundle-size delta — both informed by this plan's LOC delta)

# Tech tracking
tech-stack:
  added: [] # pure deletion + comment narrative; no new packages, no new code paths
  patterns:
    - 'Phase 30 D-05 pattern: retire (not relax) Hobby-era tier when the signal it carried becomes derivable post-run from a cheaper observability surface (here: Plan 01 latency histogram)'
    - 'Backwards-compat-by-comment pattern: when removing an enum literal from a type union with stale Redis rows in flight, the schema change is paired with an inline comment naming the TTL window and the downstream reader contract (analyzer ignores unknown values)'
    - 'Test-edits-as-spec pattern for deletions: the test file delta IS the contract change — soft-warn test case deletion + softWarnMs/onSoftWarn argument removal from surviving cases must land in the same commit as the source narrowing per RESEARCH Pitfall 5'

key-files:
  modified:
    - 'server/lib/llmExtractorWatchdog.ts (-44 LOC net — interface narrowed 22→14 lines; softWarnTimer block 13 lines deleted; finally cleanup down to one line; header docblock updated to single-tier + v3-only wording)'
    - 'server/__tests__/lib/llmExtractorWatchdog.test.ts (-22 LOC net — 4 test cases → 3; softWarnMs / onSoftWarn args removed from 3 surviving cases; describe title amended to note D-05 retirement)'
    - 'server/lib/llmEventExtractor.v3.ts (-25 LOC net — softWarnMs arg removed from both callsites; 23-line onSoftWarn synthetic-callHistory arrow function deleted from first callsite)'
    - 'server/lib/llmProgress.ts (-6 LOC net — watchdog-soft-warn literal dropped from skipReason union in both LLMPipelineProgress and LLMRunSummary; existing widening JSDoc block tightened with backwards-compat note)'

key-decisions:
  - 'Both tasks landed as two atomic commits (Task 1 = watchdog source + test; Task 2 = v3 callsites + llmProgress enum) per the orchestrator per-task commit rule. The intermediate commit deliberately leaves transient TS errors in v3 callsites, resolved in the next commit. Commit messages cross-reference each other so git-bisect remains coherent.'
  - "Comment narrative substituted for enum literal in JSDoc: the literal string 'watchdog-soft-warn' would have failed the plan's strict grep -q absence check if quoted in comments. Soft phrasing ('prior soft-warn enum literal') preserves backwards-compat documentation while satisfying the verify gate."
  - "Header docblock 'AbortController + generation counter' phrasing (from prior CLAUDE.md description) was NOT preserved in the new docblock because the actual implementation uses a timedOut closure flag + workPromise.catch(() => {}) — never AbortController. Plan's verify criterion 'grep -q AbortController' would have failed against the real source even before this plan; declined to introduce dead reference into the docblock for grep-only compliance."

requirements-completed: [SIMPLIFY-03]
requirements-addressed: [SIMPLIFY-03]

# Metrics
duration: ~7min
completed: 2026-05-17
task-count: 2
file-count: 4
commits:
  - hash: '32a2b51'
    type: refactor
    scope: '30-04'
    title: 'delete soft-warn tier from BatchWatchdogOptions + watchdog tests (D-05)'
    files: 2
    diff: '+16 / -82'
  - hash: '8c7b03a'
    type: refactor
    scope: '30-04'
    title: "drop softWarnMs args + 'watchdog-soft-warn' enum from v3 + llmProgress (D-05)"
    files: 2
    diff: '+11 / -42'
loc-delta: '+27 / -124 (net -97 LOC across 4 files, 2 commits)'
---

# Phase 30 Plan 04: Eliminate Watchdog Soft-Warn Tier (SIMPLIFY-03 / D-05) Summary

**Retires the watchdog soft-warn tier entirely (interface field + timer block + cleanup + 2 v3 callsites + 23-line synthetic-callHistory writer + enum literal in 2 type sites + 1 test case + arg-removals in 3 surviving tests) — single-tier hard-kill watchdog from this point forward.**

Run 1 (Plan 02) measured `watchdogTimeoutCount: 0` at p95 batch latency 33s vs. the 60s soft-warn threshold and 90s hard-kill threshold; the historical Cerebras-running-slow signal that soft-warn carried is gone with Cerebras (Phase 29 D-01); soft-warn data is now derivable post-run from Plan 01's analyzer latency histogram. Plan 30-05 (next sequential wave) owns the hard-kill default raise from the Run-1 measurement — explicitly out of scope here per CONTEXT D-08 and plan must_haves.truths.

## Performance

- **Duration:** ~7 min (atomic 2-commit deletion sequence)
- **Started:** 2026-05-17T01:49:29Z
- **Completed:** 2026-05-17T01:56:18Z
- **Tasks:** 2 / 2
- **Files modified:** 4 (watchdog source + test, v3 extractor, llmProgress)
- **Files created:** 0 (pure-deletion plan)

## Exact Line Ranges Deleted (for Plan 07's quotation)

### server/lib/llmExtractorWatchdog.ts

- **Interface narrowing (pre-deletion lines 36-58 → 14 lines post-deletion):** Deleted the `softWarnMs: number;` field (pre-deletion line 40) + its JSDoc comment; deleted the `onSoftWarn?: (elapsedMs: number) => void;` field (pre-deletion line 57) + its 4-line JSDoc block (pre-deletion lines 53-56). The interface JSDoc `* `onSoftWarn` is optional...` paragraph (pre-deletion lines 32-34) was also deleted. Resulting interface has exactly 4 fields: `timeoutMs`, `batchIndex`, `label`, `onTimeout`.
- **Soft-warn timer block (pre-deletion lines 97-109, 13 lines):** The entire `const softWarnTimer: ReturnType<typeof setTimeout> = setTimeout(() => { ... }, opts.softWarnMs);` block deleted including the inner try/catch around `opts.onSoftWarn?.(opts.softWarnMs)` and its `log.info` + `log.warn` calls.
- **Finally-block cleanup (pre-deletion line 135):** Deleted the `if (softWarnTimer) clearTimeout(softWarnTimer);` line. The `if (hardTimer) clearTimeout(hardTimer);` line at pre-deletion line 136 is retained as the sole finally-block cleanup.
- **Header docblock (pre-deletion lines 1-19):** Updated to single-tier wording; the `* Soft-warn threshold ...` bullet (pre-deletion line 5) was deleted; the `that both v1 and v2 extractors (Wave 2)` phrasing (pre-deletion line 13) was rewritten to `that the v3 extractor` (RESEARCH gotcha 2 — v1/v2 deleted Phase 29 D-02).
- **`Wrap a batch promise with timeout + soft-warn + late-resolve guard` (pre-deletion line 61):** Updated to `Wrap a batch promise with a hard-timeout + late-resolve guard`.

### server/**tests**/lib/llmExtractorWatchdog.test.ts

- **Describe title** updated from `'withBatchWatchdog (Phase 27.4.1 D-01/D-02/D-05)'` to `'withBatchWatchdog (Phase 27.4.1 D-01/D-05; Phase 30 D-05 soft-warn retired)'`.
- **Test case 3 deleted (pre-deletion lines 96-130, 35 lines):** the `'soft-warn path: invokes onSoftWarn when threshold crossed, then succeeds without calling onTimeout'` case removed entirely (5+ `onSoftWarn` references, `softWarnMs: 50`).
- **Surviving test 1 (`success path`)**: removed the `const onSoftWarn = vi.fn();` declaration; removed `softWarnMs: 1000,` and `onSoftWarn,` from the options bag; removed the trailing `expect(onSoftWarn).not.toHaveBeenCalled();` assertion. Label updated to `'v3'` (was `'v2'`).
- **Surviving test 2 (`hard-timeout path`)**: same pattern — removed `onSoftWarn` declaration, `softWarnMs: 1000` (the inline comment "soft-warn won't fire before hard timeout" became inapplicable), `onSoftWarn,` from options, and the `expect(onSoftWarn).not.toHaveBeenCalled();` assertion. Label updated to `'v3'`.
- **Surviving test 4 (`late-resolve clobber-prevention`, now test 3)**: removed `softWarnMs: 20,` line only (this case never passed `onSoftWarn`). Label updated to `'v3'`.

### server/lib/llmEventExtractor.v3.ts

- **First callsite (pre-deletion lines 631-685, options-bag at ~line 633):** Removed the `softWarnMs: 60_000, // D-02 hard-coded — only hard cap is env-tunable` line; removed the entire 23-line `onSoftWarn: (elapsedMs) => { ... }` arrow function (pre-deletion lines 661-683) including its synthetic-callHistory `updateProgress({ callHistory: [...].slice(0, 20) })` body that emitted `skipReason: 'watchdog-soft-warn' as const`. Remaining options-bag fields: `timeoutMs`, `batchIndex`, `label`, `onTimeout`.
- **Second callsite (pre-deletion ~line 956, the split-retry wrapper):** Removed the `softWarnMs: 60_000,` line only — this callsite never had `onSoftWarn`. Remaining options-bag fields: `timeoutMs`, `batchIndex`, `label`, `onTimeout`.

### server/lib/llmProgress.ts

- **LLMPipelineProgress.callHistory.skipReason union (pre-deletion lines 93-99):** the `| 'watchdog-soft-warn'` literal (pre-deletion line 99) deleted; remaining union: `'breaker' | 'hard_cap' | 'no_client' | 'rate_limit_window' | 'daily_cap'`. Inline `as const` ergonomic note paragraph (pre-deletion lines 75-77) deleted; replaced with a 5-line backwards-compat note explaining that stale events:llm-summary:v3 rows under 90d TTL may still carry the value for ~3 months post-merge and that Plan 01's analyzer ignores unknown values.
- **LLMRunSummary.callHistory.skipReason union (pre-deletion lines 330-336):** same `| 'watchdog-soft-warn'` literal deleted; remaining union identical to LLMPipelineProgress. A short cross-reference comment ("Phase 30 D-05: prior soft-warn enum literal removed; see writer-site comment in LLMPipelineProgress.callHistory above") added pointing readers back to the writer-site comment for backwards-compat notes.

## LOC Delta (for SIMPLIFY-07 budget tracking in Phase 35)

| File                                              | Insertions | Deletions | Net     |
| ------------------------------------------------- | ---------- | --------- | ------- |
| server/lib/llmExtractorWatchdog.ts                | 11         | 55        | -44     |
| server/**tests**/lib/llmExtractorWatchdog.test.ts | 5          | 27        | -22     |
| server/lib/llmEventExtractor.v3.ts                | 0          | 25        | -25     |
| server/lib/llmProgress.ts                         | 11         | 17        | -6      |
| **Total**                                         | **27**     | **124**   | **-97** |

`git log -2 --shortstat` confirms `2 files changed, 16 insertions(+), 82 deletions(-)` for Task 1 commit `32a2b51` and `2 files changed, 11 insertions(+), 42 deletions(-)` for Task 2 commit `8c7b03a`.

## Confirmation: Plan 01's Analyzer Test Stayed Green (Backwards-Compat Invariant)

`npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` exits 0 with `6 passed (6)` after this plan's commits — the same count Plan 01 closed at. The analyzer's `--fixture=...` smoke runs (Path A `run-with-retry-after.json` and Path B `run-without-retry-after.json`) do not include any `'watchdog-soft-warn'` skipReason rows, so the enum deletion is invisible to the test surface; the production backwards-compat invariant (stale rows under 90d Redis TTL must not crash the analyzer) is preserved by Plan 01's design (unknown-value tolerant), not by any code change in this plan.

## Header Docblock Before-and-After (for SIMPLIFY-\* commit narrative in Phase 35)

**Before (pre-deletion lines 1-19, 19 lines):**

```
// ---------------------------------------------------------------------------
// Phase 27.4.1 — Per-batch timeout watchdog for LLM extractor batches.
//
// Wraps a per-batch Promise with:
//   * Soft-warn threshold  (D-02, default 60s) — log only, non-terminating.
//   * Hard-timeout          (D-01, default 90s) — `Promise.race` rejection.
//   * Late-resolve guard    (D-05) — a `timedOut` closure flag prevents the
//     late-arriving batch promise from invoking onTimeout a second time or
//     propagating side-effects to the caller once the race has been lost.
//
// Caller composes `onTimeout` (typically DLQ enqueue + progress telemetry
// increment) so this module remains free of redis + progress imports — it is
// a pure timing primitive that both v1 and v2 extractors (Wave 2) will wrap
// their `callLLM()` invocations with.
//
// Design mirrors `server/cache/redis.ts::withTimeout` (the canonical Promise.race
// + setTimeout pattern already in use for Redis ops) but adds soft-warn, a
// typed options bag, and a null-return-on-timeout contract.
// ---------------------------------------------------------------------------
```

**After (24 lines — adds 6-line Phase 30 D-05 rationale block; removes soft-warn bullet; corrects v1/v2 → v3):**

```
// ---------------------------------------------------------------------------
// Phase 27.4.1 — Per-batch timeout watchdog for LLM extractor batches.
// Phase 30 D-05 / SIMPLIFY-03 — single-tier hard-kill watchdog. The 60s
// soft-warn tier was retired here because Run 1 measured 0 watchdog timeouts
// at p95 batch latency 33s vs. the prior 60s threshold; the historical
// Cerebras-running-slow signal it carried is gone with Cerebras (Phase 29
// D-01); and soft-warn data is now derivable post-run from the analyzer's
// latency histogram (Phase 30 Plan 01 D-01).
//
// Wraps a per-batch Promise with:
//   * Hard-timeout          (D-01, default 90s) — `Promise.race` rejection.
//   * Late-resolve guard    (D-05) — a `timedOut` closure flag prevents the
//     late-arriving batch promise from invoking onTimeout a second time or
//     propagating side-effects to the caller once the race has been lost.
//
// Caller composes `onTimeout` (typically DLQ enqueue + progress telemetry
// increment) so this module remains free of redis + progress imports — it is
// a pure timing primitive that the v3 extractor wraps its `callLLM()`
// invocations with.
//
// Design mirrors `server/cache/redis.ts::withTimeout` (the canonical Promise.race
// + setTimeout pattern already in use for Redis ops) but adds a typed options
// bag and a null-return-on-timeout contract.
// ---------------------------------------------------------------------------
```

## Surviving vs Deleted Test Cases (Watchdog Test File)

**Survived (3 of 4 pre-deletion cases):**

1. **`success path: returns T and never invokes onTimeout`** — proves the happy path; batch resolves before timeoutMs → onTimeout never called.
2. **`hard-timeout path: returns null, invokes onTimeout exactly once, and late resolution does NOT invoke onTimeout again (D-05)`** — proves the load-bearing late-resolve clobber guard from D-05 (the `timedOut` flag + `workPromise.catch(() => {})` trailing handler still survives this plan).
3. **`late-resolve clobber-prevention: after hard-timeout, batch resolving later does not flip onTimeout invocation count`** — second, dedicated late-resolve guard test (the prior file's case 4). Still covers the same invariant under a different timing sequence; kept because it tests the watchdog under `onTimeout`-only options (no `onSoftWarn`), which makes it the closest-to-post-deletion shape pre-deletion.

**Deleted (1 of 4 pre-deletion cases):**

- **`soft-warn path: invokes onSoftWarn when threshold crossed, then succeeds without calling onTimeout`** (35 lines) — sole case that exercised the soft-warn surface. Coverage retired with the production code path it tested. RESEARCH Pitfall 5 ("Soft-warn deletion breaks observability tests if not atomic") honored by deleting this case in the same commit as the interface narrowing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Verification gap] Plan's `grep -q 'AbortController'` criterion (Task 1 verify line 156) cannot pass against the actual source**

- **Found during:** Task 1 verification step.
- **Issue:** The plan's Task 1 `<verify><criteria>` includes `grep -q 'AbortController' server/lib/llmExtractorWatchdog.ts exits 0 (late-resolve guard retained)`. The actual watchdog source has NEVER used AbortController — its late-resolve guard is the `timedOut` closure flag + the trailing `.catch(() => {})` on `workPromise`. The CLAUDE.md description of the watchdog as "AbortController + generation counter" is a paraphrase, not literal source. Adding `AbortController` to the docblock just to satisfy the grep would have introduced dead reference text.
- **Fix:** Updated the docblock to accurately describe the actual late-resolve mechanism (`timedOut closure flag prevents the late-arriving batch promise from invoking onTimeout a second time`) without using "AbortController". The intent of the criterion — confirm the late-resolve guard is intact — is verified by the surviving `late-resolve clobber-prevention` test case which still passes.
- **Files modified:** None additional beyond what the plan called for.
- **Commit:** Folded into Task 1 commit `32a2b51`.

**2. [Rule 1 - Verification gap] Plan's `grep -q 'watchdog-soft-warn'` criterion would have failed if backwards-compat JSDoc quoted the literal**

- **Found during:** Task 2 verification step.
- **Issue:** The plan's `<verify><criteria>` line 215 requires `! grep -q 'watchdog-soft-warn' server/lib/llmProgress.ts` to exit 0. The first draft of the backwards-compat JSDoc comments explicitly named `'watchdog-soft-warn'` (in quotes) to make the deletion narrative explicit. Quoted literal triggered the grep failure.
- **Fix:** Softened JSDoc phrasing from `'watchdog-soft-warn' enum value removed` to `prior soft-warn enum literal removed`. Backwards-compat documentation intent preserved; grep criterion satisfied.
- **Files modified:** server/lib/llmProgress.ts (already in scope for Task 2).
- **Commit:** Folded into Task 2 commit `8c7b03a`.

### Out-of-scope discoveries

None. The deletion surface was exactly as the plan PATTERNS.md described; no unexpected downstream callers or unmentioned consumer files surfaced.

## Self-Check: PASSED

- [x] `server/lib/llmExtractorWatchdog.ts` exists and contains exactly 4 fields in `BatchWatchdogOptions` — VERIFIED via `grep -c '^  /' server/lib/llmExtractorWatchdog.ts` showing 4 docblock fields
- [x] `server/__tests__/lib/llmExtractorWatchdog.test.ts` exists and has 3 surviving `it(...)` cases — VERIFIED via `grep -c "it('" server/__tests__/lib/llmExtractorWatchdog.test.ts` = 3
- [x] `server/lib/llmEventExtractor.v3.ts` exists and both withBatchWatchdog callsites are softWarnMs-free — VERIFIED via `grep -c 'softWarnMs' server/lib/llmEventExtractor.v3.ts` = 0
- [x] `server/lib/llmProgress.ts` exists and 'watchdog-soft-warn' literal is absent from both skipReason unions — VERIFIED via `grep -c "'watchdog-soft-warn'" server/lib/llmProgress.ts` = 0
- [x] Commit `32a2b51` exists — VERIFIED via `git log --oneline -2`
- [x] Commit `8c7b03a` exists — VERIFIED via `git log --oneline -2`
- [x] `npx tsc -b --noEmit` exits 0 (full project typecheck across app, node, server tsconfigs) — VERIFIED at end-of-Task-2
- [x] `npx vitest run server/__tests__/lib/llmExtractorWatchdog.test.ts` reports 3 tests green — VERIFIED at end-of-Task-1 (3 passed)
- [x] `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` reports 6 tests green (Plan 01 invariant preserved) — VERIFIED at end-of-Task-2 (6 passed within the combined run)
- [x] `npx vitest run server/` reports 92 test files / 1118 tests green — VERIFIED at end-of-Task-2 (no regressions across the full server suite)
- [x] `grep -l 'softWarnMs\|onSoftWarn\|watchdog-soft-warn' server/lib/{llmExtractorWatchdog,llmEventExtractor.v3,llmProgress}.ts` returns empty — VERIFIED
