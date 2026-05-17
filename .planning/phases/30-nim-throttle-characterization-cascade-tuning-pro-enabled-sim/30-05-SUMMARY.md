---
phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
plan: 05
subsystem: api
tags: [llm, tuning, retry, backoff, jitter, env-promotion, sanity-check, path-b]

# Dependency graph
requires:
  - phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
    provides:
      - Active cascade narrowed to NIM + OpenRouter (D-01); the prior soft-warn-as-Cerebras-slowness signal is moot
      - Vercel Pro 800s maxDuration ceiling (D-08); larger retry budgets / batch timeouts feasible
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/02
    provides:
      - run-1-throttle-snapshot.json (Path B, no 429s, 0 hard-kills at p95=33s) — the measurement input
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/04
    provides:
      - Watchdog soft-warn tier already removed (D-05); LLM_BATCH_TIMEOUT_MS is now the SOLE watchdog control
provides:
  - LLM_BATCH_SIZE Zod schema entry — promoted from the hard-coded `const BATCH_SIZE = 2` at server/lib/llmEventExtractor.v3.ts:83 to env-tunable; default unchanged at 2
  - LLM_BATCH_TIMEOUT_MS default bumped 90_000 → 120_000 ms (Run-1-derived headroom for p95=33s + long-tail outliers)
  - LLM_V3_CONCURRENCY default UNCHANGED at 12 (CONTEXT D-02 formula undefined under steadyStateRpm=0); rationale documented for Plan 06 re-probe
  - freeClaudeRouter constants retuned: RETRY_ATTEMPTS 2→3, BACKOFF_MS [1000,4000]→[2000,8000,32000], JITTER_MS 250→500 (preserves ±25% ratio of BACKOFF[0])
  - 6 test files updated for the new env shape (1 cascade-broken by Task 2's BATCH_SIZE consumer change; 4 mock files for v3 extractor; 1 middleware mock for createApp transitive load)
  - .env.example mirrors all schema changes with operator-facing tuning-knob commentary
affects:
  - 30-06 (Run 2 validation against these tuned defaults — ±3pp eval gate; CRITICAL dependency on eval-harness fix landing before re-tune of LLM_BATCH_SIZE to 4-8)
  - 30-07 (architecture doc throttle-findings table — pre/post defaults quoted verbatim from this commit body)
  - 31 (7-day cron stability watch — these defaults are what's being watched)
  - 34 (SIMPLIFY-07 bundle-size delta — minimal LOC change here, mostly comments)

# Tech tracking
tech-stack:
  added: [] # no new packages; pure constant retune + env promotion
  patterns:
    - 'Phase 30 D-02 sanity-check pattern: when measured data hits Path B (no signal — here, no 429s in 122s of push at concurrency=12), the "propose" step in characterize → propose → validate is theoretical-with-documented-assumptions, not empirical. Numbers are conservative defensive choices, NOT empirical fits. Honest commit body acknowledges this so future readers understand why new BACKOFF_MS isn''t 2× a measured throttle window.'
    - 'Phase 30 D-07 env-promotion pattern: hard-coded `const BATCH_SIZE = 2` consumer (line 83) becomes `env.LLM_BATCH_SIZE` with byte-identical default (2) at the Zod schema layer. Behavior is unchanged until an operator sets LLM_BATCH_SIZE explicitly. Mirrors the LLM_V3_CONCURRENCY env-tunable pattern from Phase 27.4.4 Plan 02.'
    - 'Pro 800s retry-budget pattern: RETRY_ATTEMPTS 2→3 with BACKOFF [2000,8000,32000] gives a worst-case per-call retry wall-clock of 42s. New LLM_BATCH_TIMEOUT_MS=120s comfortably bounds this. Hobby-era constraints (300s ceiling) would have made this risky; Pro headroom makes it routine.'
    - "Test cascade fix pattern (Rule 1): when an env-tunable knob is added, every test file that mocks `'../../config.js'` AND transitively loads the consumer module must have the new env field added to its mockEnv. The full server suite must be run to detect cascade — a per-task test run is insufficient because consumers may live in unrelated test files."
    - "Fake-timer rescue for sleep-bounded test assertions: when BACKOFF_MS extension would push real-timer test runs past their 10s default timeout (e.g. 84s aggregated sleep for 2-provider exhaustion at new constants), `vi.useFakeTimers() + vi.advanceTimersByTimeAsync(...)` makes the sleeps instant while preserving the retry-loop's sequential awaits."

key-files:
  modified:
    - 'server/config.ts (+59 / -8 — new LLM_BATCH_SIZE Zod entry; bumped LLM_BATCH_TIMEOUT_MS default; refreshed LLM_V3_CONCURRENCY docblock with Phase 30 D-02 sanity-check note)'
    - 'server/lib/llmEventExtractor.v3.ts (+6 / -1 — line 83 BATCH_SIZE constant now reads env.LLM_BATCH_SIZE; docblock extended with Phase 30 D-07 note)'
    - 'server/lib/freeClaudeRouter.ts (+40 / -3 — RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS retune with side-by-side docblock; constants names preserved per CONTEXT <specifics> operator-familiarity guidance)'
    - '.env.example (+34 / -4 — LLM_BATCH_SIZE new block; refreshed LLM_BATCH_TIMEOUT_MS commentary; refreshed LLM_V3_CONCURRENCY commentary)'
    - 'server/__tests__/config.test.ts (+32 / -0 — 3 new it() cases for LLM_BATCH_SIZE: override / fallback / invalid-value rejection)'
    - 'server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts (+30 / -2 — mockEnv gains LLM_BATCH_SIZE: 2 + LLM_BATCH_TIMEOUT_MS bump; new describe block with 2 D-07 consumer tests)'
    - 'server/__tests__/lib/freeClaudeRouter.test.ts (+49 / -19 — 4 tests updated for new RETRY_ATTEMPTS=3 / BACKOFF: B2 needs 3 rejections; B3/P2/P3 use vi.useFakeTimers + advanceTimersByTimeAsync)'
    - 'server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts (+2 / -1 — mockEnv gains LLM_BATCH_SIZE + LLM_BATCH_TIMEOUT_MS bump)'
    - 'server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts (+2 / -1 — same mockEnv backfill)'
    - 'server/__tests__/lib/llmLineage-prefilter.test.ts (+2 / -1 — same mockEnv backfill)'
    - 'server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts (+2 / -1 — same mockEnv backfill)'
    - "server/__tests__/middleware/requestId.test.ts (+16 / -0 — full env object added to config mock; previously omitted env entirely, broke after Task 2's createApp → routes/events.ts → v3.ts transitive load)"

key-decisions:
  - "LLM_BATCH_SIZE default kept at 2 (not raised to 4-8 as CONTEXT D-02 invited). Run 1's evalScore.total = 0 (ground-truth fixture not bundled into Vercel deploy output per Plan 02 SUMMARY run-note 2) means the Plan 06 ±3pp regression gate cannot be evaluated — raising would be a guess, not measurement. Plan 06 must land the eval-harness fix before any LLM_BATCH_SIZE bump."
  - 'LLM_V3_CONCURRENCY kept at 12 (not re-derived). CONTEXT D-02 formula `(observed_NIM_steady_RPM × measured_batch_latency_seconds) / 60` is undefined because Run 1 measured steadyStateRpm = 0 (Path B). The 213 batches in 122s wall-clock imply effective parallelism >12 in production, so headroom may exist — but the conservative choice is to keep the default and have Plan 06 re-probe by raising concurrency and watching for the first 429s.'
  - 'LLM_BATCH_TIMEOUT_MS bumped 90_000 → 120_000 ms. Derivation: max(2 × p95, throttle_window + 30s). p95 = 33s → 2×33s = 66s. Throttle window absent (Path B). Take max = 66s, then add headroom for long-tail outliers beyond a 213-sample p95 → round up to 120s. Pitfall 4 math at concurrency=12: even worst-case 120s/batch over 17 batches wall-clock stays comfortably inside Pro 800s ceiling.'
  - "RETRY_ATTEMPTS bumped 2 → 3 per CONTEXT D-02: 'may increase since the 800s budget now allows it without watchdog conflict'. Pro headroom makes the extra attempt routine; worst-case retry wall-clock 2+8+32=42s is bounded by new 120s batch timeout."
  - 'BACKOFF_MS extended [1000, 4000] → [2000, 8000, 32000]. 4× scaling preserved across all three attempts. Conservative bump to give recovery headroom under the now-untested NIM RPM ceiling (Run 1 never approached it). Third element appended for the new RETRY_ATTEMPTS=3. Choice is defensive — Plan 06 with real 429s would inform a tighter fit.'
  - 'JITTER_MS bumped 250 → 500 to preserve the ±25% ratio of BACKOFF[0] (250/1000 = 25% → 500/2000 = 25%). CONTEXT D-02 jitter formula.'
  - "Constant names (RETRY_ATTEMPTS, BACKOFF_MS, JITTER_MS) PRESERVED per CONTEXT <specifics> guidance ('operators know them'). Did NOT rename to BACKOFF_BASE_MS even though the array now has 3 elements — no test or research surface revealed an ambiguity that warranted breaking the operator-familiarity contract."
  - "Test cascade fix landed as a separate commit (749d93d) AFTER the three task commits. This keeps the task commits semantically pure (Task 1 = schema/.env; Task 2 = consumer; Task 3 = router tune) and isolates the auto-fix narrative for future bisect. Alternative — folding the test backfills into Task 2's commit — would have mixed concerns and obscured the cascade discovery."

patterns-established:
  - "Sanity-check tuning pattern: when measured-data path is unavailable (Path B), document the choice as conservative-by-default with rationale. Don't pretend the numbers are empirical."
  - 'Side-by-side defaults table in commit body: pre-Phase-30 vs post-Phase-30 with derivation rule per row. Future readers + Plan 06 + Plan 07 can quote verbatim.'
  - 'Env promotion with byte-identical fallback: keep the prior hard-coded value as the new Zod default so behavior is unchanged until an operator opts in. Mirrors LLM_V3_CONCURRENCY introduction in Phase 27.4.4.'
  - 'Fake-timer drain pattern for retry-budget tests: useFakeTimers + advanceTimersByTimeAsync in a loop across each backoff hop. Preserves the sequential-await retry-loop semantics while collapsing real-time.'

requirements-completed: [LLM-RELI-03, LLM-RELI-04]
requirements-addressed: [LLM-RELI-03, LLM-RELI-04]

# Metrics
duration: ~24min
completed: 2026-05-17
task-count: 3
file-count: 12
commits:
  - hash: 'e7c639d'
    type: feat
    scope: '30-05'
    title: 'promote LLM_BATCH_SIZE to env-tunable + retune LLM_BATCH_TIMEOUT_MS from Run 1 (D-02 / D-07)'
    files: 3
    diff: '+123 / -11'
  - hash: '6a60179'
    type: feat
    scope: '30-05'
    title: 'wire v3 extractor BATCH_SIZE to env.LLM_BATCH_SIZE (D-07)'
    files: 2
    diff: '+36 / -4'
  - hash: '6d6b427'
    type: feat
    scope: '30-05'
    title: 'tune freeClaudeRouter RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS (D-02 / LLM-RELI-04)'
    files: 2
    diff: '+84 / -8'
  - hash: '749d93d'
    type: fix
    scope: '30-05'
    title: 'backfill LLM_BATCH_SIZE in 5 test mocks transitively loading v3.ts (Rule 1)'
    files: 5
    diff: '+24 / -4'
loc-delta: '+267 / -27 (net +240 LOC across 12 files, 4 commits; majority is docblock + commit-body justification)'
---

# Phase 30 Plan 05: Cascade Tuning (Sanity-Check Mode) Summary

**Bumps LLM_BATCH_TIMEOUT_MS 90s→120s + freeClaudeRouter RETRY_ATTEMPTS 2→3 + BACKOFF [1000,4000]→[2000,8000,32000] + JITTER 250→500; promotes BATCH_SIZE to env.LLM_BATCH_SIZE (default unchanged at 2). Sanity-check tune — Run 1 hit Path B (no 429s observed in 122s of push at concurrency=12), so numbers are conservative-by-default defensive choices documented as such, NOT empirical fits to a measured throttle window.**

## Performance

- **Duration:** ~24 minutes (3 tasks + 1 Rule-1 cascade-fix commit)
- **Started:** 2026-05-17T19:00:00Z
- **Completed:** 2026-05-17T19:23:00Z
- **Tasks:** 3 of 3
- **Files modified:** 12 (4 production + 1 .env.example + 7 test files)
- **Files created:** 0

## Accomplishments

- `LLM_BATCH_SIZE` promoted from hard-coded `const BATCH_SIZE = 2` to first-class Zod schema entry; default unchanged at 2 so behavior is byte-identical until an operator opts in
- `LLM_BATCH_TIMEOUT_MS` default bumped 90_000 → 120_000 ms per CONTEXT D-02 formula `max(2 × measured_p95, throttle_window + 30s)` applied to Run 1's perBatchLatency.p95 = 33_263 ms
- `freeClaudeRouter` retry parameters tuned per CONTEXT D-02 sanity-check branch: RETRY_ATTEMPTS=3, BACKOFF_MS=[2000,8000,32000] (4× scaling preserved), JITTER_MS=500 (±25% of BACKOFF[0] preserved)
- `LLM_V3_CONCURRENCY` consciously KEPT at 12 — CONTEXT D-02 formula undefined under steadyStateRpm=0, conservative choice flagged for Plan 06 re-probe
- 12 files updated total with side-by-side pre/post defaults table embedded in commit bodies (for Plan 07's architecture doc to quote verbatim)

## Task Commits

Each task committed atomically; one Rule-1 auto-fix commit follows:

1. **Task 1 (Zod schema + .env.example + config.test.ts):** `e7c639d` — `feat(30-05): promote LLM_BATCH_SIZE to env-tunable + retune LLM_BATCH_TIMEOUT_MS from Run 1 (D-02 / D-07)`
2. **Task 2 (v3 extractor consumer + integration test):** `6a60179` — `feat(30-05): wire v3 extractor BATCH_SIZE to env.LLM_BATCH_SIZE (D-07)`
3. **Task 3 (freeClaudeRouter tune + test fixes):** `6d6b427` — `feat(30-05): tune freeClaudeRouter RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS (D-02 / LLM-RELI-04)`
4. **Auto-fix (Rule 1 — test-mock cascade):** `749d93d` — `fix(30-05): backfill LLM_BATCH_SIZE in 5 test mocks transitively loading v3.ts (Rule 1)`

## Files Modified

| File                                                                | Insertions | Deletions | Net      |
| ------------------------------------------------------------------- | ---------- | --------- | -------- |
| server/config.ts                                                    | 67         | 8         | +59      |
| server/lib/llmEventExtractor.v3.ts                                  | 7          | 1         | +6       |
| server/lib/freeClaudeRouter.ts                                      | 43         | 3         | +40      |
| .env.example                                                        | 38         | 4         | +34      |
| server/**tests**/config.test.ts                                     | 32         | 0         | +32      |
| server/**tests**/lib/llmExtractionPipeline.incrementalWrite.test.ts | 32         | 2         | +30      |
| server/**tests**/lib/freeClaudeRouter.test.ts                       | 49         | 19        | +30      |
| server/**tests**/lib/llmEventExtractor.v3-adaptive.test.ts          | 3          | 1         | +2       |
| server/**tests**/lib/llmExtractionPipeline.terminalShape.test.ts    | 3          | 1         | +2       |
| server/**tests**/lib/llmLineage-prefilter.test.ts                   | 3          | 1         | +2       |
| server/**tests**/lib/llmExtractionPipeline.crossBoundary.test.ts    | 3          | 1         | +2       |
| server/**tests**/middleware/requestId.test.ts                       | 16         | 0         | +16      |
| **Total**                                                           | **296**    | **41**    | **+255** |

## Side-by-Side Defaults Table (for Plan 07 architecture doc)

| Knob                   | v1.4 (Hobby 300s) | v1.5 sanity-check (Pro 800s) | Derivation rule                                                                                                   |
| ---------------------- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LLM_V3_CONCURRENCY`   | 12                | **12 (unchanged)**           | Formula `(RPM × latency_s) / 60` undefined under observed_RPM=0 (Path B) — keep conservative, re-probe in Plan 06 |
| `LLM_BATCH_SIZE`       | 2 (hard-coded)    | **2 (env-tunable)**          | Eval gate cannot be evaluated (evalScore.total=0); raise only after Plan 06 lands eval-harness fix                |
| `LLM_BATCH_TIMEOUT_MS` | 90_000            | **120_000**                  | `max(2 × p95, throttle_window + 30s)` = `max(66_000, undef)` rounded up for long-tail headroom                    |
| `RETRY_ATTEMPTS`       | 2                 | **3**                        | CONTEXT D-02: Pro 800s budget allows extra attempt without watchdog conflict                                      |
| `BACKOFF_MS`           | [1000, 4000]      | **[2000, 8000, 32000]**      | 4× scaling preserved; conservative bump for untested NIM RPM ceiling; third element for new RETRY_ATTEMPTS=3      |
| `JITTER_MS`            | 250               | **500**                      | ±25% of BACKOFF[0] ratio preserved: 250/1000 = 500/2000                                                           |

**Operator rollback recipe** (env override; no code revert):

```
LLM_V3_CONCURRENCY=12 LLM_BATCH_SIZE=2 LLM_BATCH_TIMEOUT_MS=90000
```

(Router constants are NOT env-tunable — in-incident reversion requires `git revert 6d6b427`.)

## Run 1 Measurements Consumed

From `.planning/phases/30-.../run-1-throttle-snapshot.json` (Plan 02 deliverable):

| Field                     | Value           | Interpretation                                                                                                                         |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `runTimestamp`            | 1778980781669   | 2026-05-17T01:19:41Z                                                                                                                   |
| `durationMs`              | 122_628 (~123s) | ~85% headroom to 800s Pro ceiling                                                                                                      |
| `batchCount`              | 213             | High throughput; implies prod parallelism may already exceed concurrency=12                                                            |
| `throttleWindowMs.path`   | "B"             | **NIM did NOT 429 during the run** (key Path B finding)                                                                                |
| `throttleWindowMs.median` | 306             | Synthetic gap-inference; NOT a true throttle signal                                                                                    |
| `steadyStateRpm`          | 0               | No rate limiting observed                                                                                                              |
| `recoveryIntervalMs`      | null            | N/A (no 429s to recover from)                                                                                                          |
| `perBatchLatency.p50`     | 21_053 ms       | ~21s typical batch                                                                                                                     |
| `perBatchLatency.p95`     | 33_263 ms       | Drives LLM_BATCH_TIMEOUT_MS = 2× = 66s, rounded up to 120s                                                                             |
| `watchdogTimeoutCount`    | 0               | No hard-kills at the prior 90s threshold; new 120s threshold inherits all that headroom                                                |
| `evalScore.total`         | 0 of 0          | **Eval harness silently failed** — ground-truth fixture not bundled into Vercel deploy output. Blocks Plan 06 deploy gate until fixed. |

## Path B Interpretation (Critical for Plan 06 Reader Context)

Run 1 hit **Path B** of the throttle-characterization decision tree. Per CONTEXT D-01:

- Path A: NIM returns `Retry-After` headers on 429s → analyzer captures throttle window directly from `retryAfterMs`
- Path B: NIM omits the header OR returns no 429s at all → analyzer infers recovery from `callHistory` timestamp gaps

In Run 1, NIM returned ZERO 429s during the 122s window. The `throttleWindowMs.median = 306` is a synthetic gap-inference value from very few sample points — **NOT a measured throttle signal**. Per Plan 02 SUMMARY run-note 1: "**Plan 05 becomes a sanity-check run** rather than a re-tuning run."

This SUMMARY's commits operationalize that sanity-check framing:

- LLM_V3_CONCURRENCY unchanged (no formula input)
- LLM_BATCH_SIZE unchanged at 2 (no eval gate input)
- LLM_BATCH_TIMEOUT_MS bumped from latency p95 (real signal — there were 213 successful batches with measured durations)
- BACKOFF_MS / JITTER_MS / RETRY_ATTEMPTS bumped conservatively (defensive choice acknowledged in commit body)

Plan 06 Run 2's job is to (a) fix the eval harness, (b) re-probe by raising concurrency to find the first 429, (c) re-derive these defaults against real measured throttle if 429s surface.

## Decisions Made

See `key-decisions` in frontmatter — 8 substantive choices captured for STATE.md extraction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] B2 test broke under new RETRY_ATTEMPTS=3 (semantic mismatch)**

- **Found during:** Task 3 verification (`npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts`)
- **Issue:** Test B2 ("two 429s exhaust NVIDIA NIM retries — falls through to OpenRouter") encoded the OLD RETRY_ATTEMPTS=2 assumption. With my retune to 3, two rejections no longer exhaust the retry budget — NIM gets a third attempt that succeeds before the cascade falls through, so `routing[1]?.provider === 'openrouter'` is undefined.
- **Fix:** Added a 3rd `mockRejectedValueOnce` to the test setup so 3 rejections exhaust the new 3-attempt budget. Renamed the test to `B2: NIM exhausts RETRY_ATTEMPTS=3 of 429s — falls through to OpenRouter`. Added `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(...)` to collapse the new 2s + 8s real-timer waits.
- **Files modified:** server/**tests**/lib/freeClaudeRouter.test.ts
- **Verification:** `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts` → 18/18 pass
- **Committed in:** 6d6b427 (folded into Task 3 commit — semantically inseparable from the constant change that caused it)

**2. [Rule 1 - Bug] B3 / P2 / P3 tests timed out under new BACKOFF=[2000, 8000, 32000]**

- **Found during:** Task 3 verification (same run as #1)
- **Issue:** Tests B3 / P2 / P3 exercise "all providers exhausted" by mocking sticky rejections. Under new BACKOFF, the worst-case retry-cycle wall-clock is ~84s for 2-provider exhaustion (2 backoffs × 2 providers × ~10s aggregated each). Default vitest test timeout is 10s — tests timed out before assertions could fire.
- **Fix:** Added `vi.useFakeTimers()` + drain loop (`await vi.advanceTimersByTimeAsync(10_000)` × 4) so sleeps become instant. Preserves the sequential-await retry-loop semantics; only collapses real time.
- **Files modified:** server/**tests**/lib/freeClaudeRouter.test.ts (same file as #1)
- **Verification:** Same `npx vitest run` confirms 18/18 pass post-fix
- **Committed in:** 6d6b427 (Task 3 commit — same root cause as #1)

**3. [Rule 1 - Bug] 5 unrelated test files crashed at module-load after Task 2 (BATCH_SIZE → env.LLM_BATCH_SIZE)**

- **Found during:** Post-Task-3 full-suite regression check (`npx vitest run server/`)
- **Issue:** Task 2's change at `server/lib/llmEventExtractor.v3.ts:83` made BATCH_SIZE read `env.LLM_BATCH_SIZE`. Five test files mock `'../../config.js'` to provide a custom env shape but had NOT included LLM_BATCH_SIZE in their hoisted `mockEnv` (because the schema entry didn't exist when those test files were written). Result: any test that transitively loaded v3.ts (directly OR through `createApp() → server/routes/events.ts:12 → v3.ts`) crashed at line 87 with either `undefined.LLM_BATCH_SIZE` or `"No 'env' export is defined on '../../config.js' mock"`.
- **Fix:** Added `LLM_BATCH_SIZE: 2` (matching new Zod default) to mockEnv in 4 lib test files; added a full `env: {...}` block to the requestId.test.ts mock (which previously omitted env entirely). Also bumped `LLM_BATCH_TIMEOUT_MS` in those mocks from 90_000 → 120_000 to mirror Task 1's new schema default (not load-bearing for any test assertion, but keeps the mock shape in sync with production schema).
- **Files modified:** 5 test files (llmEventExtractor.v3-adaptive.test.ts, llmExtractionPipeline.terminalShape.test.ts, llmLineage-prefilter.test.ts, llmExtractionPipeline.crossBoundary.test.ts, middleware/requestId.test.ts)
- **Verification:** `npx vitest run server/` → 92/92 files, 1123/1123 tests pass (was 91/92 + 9 failed before this commit)
- **Committed in:** 749d93d (separated from Task 2's commit deliberately — the cascade was only discovered during Task 3's full-suite regression run, AFTER Task 2 was already committed. Keeping the auto-fix as its own commit preserves the bisect narrative.)

### Out-of-scope discoveries

**`npm run check:env` exits 1 due to pre-existing EXTRA keys.** Documented but NOT fixed:

- `.env.example` contains 14 keys NOT in `server/config.ts` Zod schema: LLM*PIPELINE_V2, LLM_PIPELINE_V3 (deleted in Phase 29 D-02 part C but the `.env.example` blocks were never removed), plus all 12 `VITE_POLL*_`/`VITE\___KM`/`VITE_SEVERITY_\*`keys (client-tier vars consumed by`src/`not`server/`, but the `check:env` script's Zod-shape comparison treats them as schema orphans).
- Confirmed pre-existing via `git stash + npm run check:env` against Plan 30-04 base — same exit code 1 with same key list.
- Per executor SCOPE BOUNDARY rule, NOT fixed. The plan's verify criterion `npm run check:env exits 0` cannot pass for reasons unrelated to this plan's work.
- Logged for a future maintenance phase to either (a) extend `check:env` to whitelist VITE\__ + retired LLM_PIPELINE_V[23], or (b) delete the stale `.env.example` blocks. Phase 34 (REDIS-OPT / SIMPLIFY-_ cleanup) is a candidate.

---

**Total deviations:** 3 auto-fixed (all Rule 1 — test cascade from production code changes) + 1 out-of-scope discovery (pre-existing check:env drift)
**Impact on plan:** All auto-fixes were direct downstream consequences of the planned production code changes. No scope creep. The check:env drift is documented but deferred.

## Issues Encountered

The test-cascade discovery (Auto-fix #3) was the only unexpected friction. The fix was mechanical (add `LLM_BATCH_SIZE: 2` to 5 mockEnv shapes), but it required running the FULL `npx vitest run server/` after Task 3 to surface — running only the plan-scoped test list per the Task 3 verify criterion would have missed it. This validates the executor pattern of doing a broad-suite regression check before declaring a plan complete.

## Known Stubs

None. All env knobs have working defaults; no UI surfaces depend on this plan's changes.

## Self-Check: PASSED

- [x] `server/config.ts` exists and contains `LLM_BATCH_SIZE` Zod entry — VERIFIED via `grep -q 'LLM_BATCH_SIZE: z.coerce.number().int().positive().default' server/config.ts` exit 0
- [x] `.env.example` contains `LLM_BATCH_SIZE=` line — VERIFIED via `grep -q 'LLM_BATCH_SIZE=' .env.example` exit 0
- [x] `server/lib/llmEventExtractor.v3.ts` BATCH_SIZE reads `env.LLM_BATCH_SIZE` — VERIFIED via `grep -q 'const BATCH_SIZE = env.LLM_BATCH_SIZE' server/lib/llmEventExtractor.v3.ts` exit 0
- [x] Old hard-coded `const BATCH_SIZE = 2;` line absent — VERIFIED via `grep -c '^const BATCH_SIZE = 2;' server/lib/llmEventExtractor.v3.ts` = 0
- [x] `server/lib/freeClaudeRouter.ts` RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS values updated — VERIFIED via grep showing `RETRY_ATTEMPTS = 3`, `BACKOFF_MS = [2000, 8000, 32_000]`, `JITTER_MS = 500`
- [x] `Phase 30 D-02` rationale comment present in freeClaudeRouter.ts — VERIFIED via `grep -q 'Phase 30 D-02' server/lib/freeClaudeRouter.ts` exit 0
- [x] Commit `e7c639d` (Task 1) exists — VERIFIED via `git log --oneline -8`
- [x] Commit `6a60179` (Task 2) exists — VERIFIED via same
- [x] Commit `6d6b427` (Task 3) exists — VERIFIED via same
- [x] Commit `749d93d` (Rule 1 cascade fix) exists — VERIFIED via same
- [x] `npx tsc --noEmit` exits 0 — VERIFIED at end of Task 3 AND after auto-fix commit
- [x] `npx vitest run server/__tests__/config.test.ts` exits 0 with 9 tests green (6 pre-existing + 3 new LLM_BATCH_SIZE cases)
- [x] `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` exits 0 with 5 tests green (3 cadence + 2 new D-07 consumer)
- [x] `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts` exits 0 with 18 tests green (post tune-fix)
- [x] `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` exits 0 with 6 tests green (Plan 01 invariant preserved)
- [x] `npx vitest run server/__tests__/lib/llmExtractorWatchdog.test.ts` exits 0 with 3 tests green (Plan 30-04 invariant preserved)
- [x] `npx vitest run server/` exits 0 with 92 files / 1123 tests green (full server regression)

## Next Plan Readiness (Plan 06)

- All tuned defaults are committed and TS-clean. Plan 06 Run 2 can force-trigger against these defaults today.
- **CRITICAL prerequisite for Plan 06**: eval-harness fix (ground-truth fixture must bundle into Vercel deploy output). Without it, evalScore.total stays 0 and the ±3pp deploy gate cannot be evaluated. Plan 06 must address this as its Task 0 / remediation step.
- The pre/post defaults table in this SUMMARY is ready for Plan 07's architecture doc to quote verbatim.
- Plan 06's `LLM_BATCH_SIZE` raise to 4-8 (if eval-harness fix lands and gate validates) becomes a follow-up env override or schema-default bump — no need to revisit the Zod entry.
- Run 2's `watchdogTimeoutCount` should be ≤ Run 1's (0) — the new 120s timeout adds 30s headroom above the 90s default, so this is a stronger lower bound than Run 1.

---

_Phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim_
_Plan: 05_
_Completed: 2026-05-17_
