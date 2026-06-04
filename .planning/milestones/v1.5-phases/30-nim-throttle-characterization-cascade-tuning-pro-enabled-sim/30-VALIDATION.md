---
phase: 30
slug: nim-throttle-characterization-cascade-tuning-pro-enabled-sim
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.1.0                                                                                                     |
| **Config file**        | `vite.config.ts` (root) — server tests run with `// @vitest-environment node` directive                          |
| **Quick run command**  | `npx vitest run server/__tests__/lib/llmExt*.test.ts server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` |
| **Full suite command** | `npx vitest run`                                                                                                 |
| **Server-only filter** | `npx vitest run server/`                                                                                         |
| **Estimated runtime**  | Quick ~15s · Server-only ~60s · Full suite ~3-4 min                                                              |

---

## Sampling Rate

- **After every task commit:** Run quick command (~15s)
- **After every plan wave:** Run server-only suite (~60s)
- **Before `/gsd-verify-work`:** Full suite + `npm run typecheck` + `npm run check:env` + `npm run eval:replay` (resolver-only against baseline)
- **Max feedback latency:** 15 seconds (per-commit), 60 seconds (per-wave)

---

## Per-Task Verification Map

| Task ID  | Plan            | Wave | Requirement         | Threat Ref | Secure Behavior                                                                | Test Type               | Automated Command                                                                                   | File Exists                           | Status     |
| -------- | --------------- | ---- | ------------------- | ---------- | ------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------- |
| 30-01-01 | 01 (D-01)       | 1    | LLM-RELI-02         | —          | retryAfterMs from `'retry-after'` header parsed to ms on 429                   | unit                    | `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts`                         | ❌ Wave 0                             | ⬜ pending |
| 30-01-02 | 01 (D-01)       | 1    | LLM-RELI-02         | —          | retryAfterMs = null when header absent (Path B branch)                         | unit                    | (same file)                                                                                         | ❌ Wave 0                             | ⬜ pending |
| 30-01-03 | 01 (D-01)       | 1    | LLM-RELI-02         | —          | analyzer computes throttle window from retryAfterMs median (Path A)            | script smoke            | `npm run analyze:llm-run -- --fixture=tests/fixtures/run-with-retry-after.json`                     | ❌ Wave 0                             | ⬜ pending |
| 30-01-04 | 01 (D-01)       | 1    | LLM-RELI-02         | —          | analyzer infers recovery from timestamp gaps (Path B)                          | script smoke            | (same script, `--fixture=tests/fixtures/run-without-retry-after.json`)                              | ❌ Wave 0                             | ⬜ pending |
| 30-02-01 | 02 (D-02 Run 1) | 2    | LLM-RELI-03         | —          | Run 1 snapshot exists with required fields                                     | snapshot presence       | `test -f .planning/phases/30-*/run-1-throttle-snapshot.json && jq -e '.throttleWindowMs.path' "$_"` | ❌ Wave 0 (deliverable)               | ⬜ pending |
| 30-03-01 | 03 (D-04)       | 3    | SIMPLIFY-01         | —          | `mergeAndPersistLlmEntities` called exactly once per `runRefreshExtraction()`  | integration             | `npx vitest run server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`                   | ✅ Extend existing                    | ⬜ pending |
| 30-03-02 | 03 (D-04)       | 3    | SIMPLIFY-01         | —          | `LLM_FLUSH_EVERY_N_BATCHES` absent from Zod schema                             | typecheck               | `npx tsc --noEmit`                                                                                  | ✅ Existing                           | ⬜ pending |
| 30-03-03 | 03 (D-04)       | 3    | SIMPLIFY-01         | —          | No periodic-flush callsite in `llmExtractionPipeline.ts`                       | invariant test          | `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`                | ✅ Replace existing assertions        | ⬜ pending |
| 30-04-01 | 04 (D-05)       | 3    | SIMPLIFY-03         | —          | `softWarnMs` removed from `BatchWatchdogOptions` interface                     | typecheck               | `npx tsc --noEmit`                                                                                  | ✅ Existing                           | ⬜ pending |
| 30-04-02 | 04 (D-05)       | 3    | SIMPLIFY-03         | —          | Hard-kill `onTimeout` invoked exactly once (regression guard)                  | unit                    | `npx vitest run server/__tests__/lib/llmExtractorWatchdog.test.ts`                                  | ✅ Existing (soft-warn cases deleted) | ⬜ pending |
| 30-04-03 | 04 (D-05)       | 3    | SIMPLIFY-03         | —          | No `softWarnMs` references in `llmEventExtractor.v3.ts`                        | typecheck               | `npx tsc --noEmit`                                                                                  | ✅ Existing                           | ⬜ pending |
| 30-05-01 | 05 (D-07)       | 4    | LLM-RELI-03         | —          | `LLM_BATCH_SIZE` env var honored when set; falls back to constant default      | unit                    | `npx vitest run server/__tests__/config.test.ts`                                                    | ✅ Extend existing                    | ⬜ pending |
| 30-05-02 | 05 (D-07)       | 4    | LLM-RELI-03         | —          | `BATCH_SIZE` consumer reads `env.LLM_BATCH_SIZE`                               | integration             | `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`                | ✅ Existing (mockEnv pattern)         | ⬜ pending |
| 30-05-03 | 05 (D-02)       | 4    | LLM-RELI-04         | —          | Tuned `BACKOFF_MS` array sized from measured throttle                          | manual / commit message | `git log -1 --format=%B HEAD` (Commit 5 documents old + new)                                        | n/a                                   | ⬜ pending |
| 30-06-01 | 06 (D-02 Run 2) | 5    | LLM-RELI-04         | —          | Run 2 snapshot eval ratios within ±0.03 of baseline                            | deploy gate             | `jq -e '...'` per ratio (see Snapshot Deliverables below)                                           | ❌ Wave 0 (deliverable)               | ⬜ pending |
| 30-06-02 | 06 (D-02 Run 2) | 5    | LLM-RELI-04         | —          | Run 2 watchdog hard-kill count ≤ Run 1's                                       | deploy gate             | `jq -e '.watchdogTimeoutCount <= ...'`                                                              | ❌ Wave 0 (deliverable)               | ⬜ pending |
| 30-07-01 | 07 (D-06)       | 6    | LLM-RELI-02, 03, 04 | —          | `docs/architecture/llm-pipeline-reliability.md` present with required sections | file shape              | `test -f docs/architecture/llm-pipeline-reliability.md && grep -q '## Tuned Defaults' "$_"`         | ❌ Wave 0 (deliverable)               | ⬜ pending |
| 30-07-02 | 07 (D-06)       | 6    | LLM-RELI-02         | —          | CLAUDE.md contains pointer to `docs/architecture/llm-pipeline-reliability.md`  | grep                    | `grep -q 'llm-pipeline-reliability.md' CLAUDE.md`                                                   | n/a                                   | ⬜ pending |
| 30-07-03 | 07 (D-06)       | 6    | LLM-RELI-02, 03, 04 | —          | ADR-0010 `<expand_at_36>` section appended with Phase 30 numbers               | grep                    | `grep -A 5 'Phase 30' docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                    | n/a                                   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Test infrastructure that must land in **Commit 1 (D-01)** before **Commit 2 (Run 1)** force-triggers:

- [ ] `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` — NEW. Covers D-01 Path A + Path B retryAfterMs capture. Mock `openai.APIError` with and without `headers['retry-after']`. Assert callHistory row shape.
- [ ] `tests/fixtures/run-with-retry-after.json` — NEW. `LLMRunSummary` fixture (Path A: header present).
- [ ] `tests/fixtures/run-without-retry-after.json` — NEW. `LLMRunSummary` fixture (Path B: header absent, recovery inferred from timestamp gaps).
- [ ] `scripts/analyze-llm-run.ts` smoke test driver — drive analyzer against both fixtures, assert Markdown output contains expected headings + numeric ranges.

Existing test infrastructure to **edit** (not create):

- [x] `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` — extend with `mergeAndPersistLlmEntities` "exactly once" assertion (Commit 3).
- [x] `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` — replace per-N-flush assertions with no-flush assertions (Commit 3).
- [x] `server/__tests__/lib/llmExtractorWatchdog.test.ts` — delete soft-warn test cases at lines ~96-120 (Commit 4).
- [x] `server/__tests__/config.test.ts` — extend with `LLM_BATCH_SIZE` case mirroring `LLM_V3_CONCURRENCY` (Commit 5).

---

## Manual-Only Verifications

| Behavior                                                                  | Requirement              | Why Manual                                                                                | Test Instructions                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run 1 force-trigger during operator-watchful hours                        | LLM-RELI-04              | Cron force-trigger requires Bearer; live operator must monitor watchdog hard-kill in logs | `curl -H "Authorization: Bearer $CRON_SECRET" "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"` — monitor Vercel logs for hard-kills; capture analyzer JSON to `run-1-throttle-snapshot.json` |
| Run 2 force-trigger at tuned defaults                                     | LLM-RELI-03, LLM-RELI-04 | Same as Run 1 — operator-attended                                                         | (same command); capture analyzer JSON to `run-2-throttle-snapshot.json`                                                                                                                                               |
| Operator records Redis `events:llm:v3` SET-call delta in Commit 3 message | SIMPLIFY-01              | Pre/post counts captured from Run 2 analyzer output; landed in commit message body        | Read analyzer output; paste pre/post delta into `feat(30): retire incremental flush mechanism` commit body                                                                                                            |

---

## Snapshot Deliverables (file presence + shape, NOT unit tests)

- **Run 1 snapshot:** `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-1-throttle-snapshot.json`
  - Required fields: `{ runTimestamp, durationMs, batchCount, watchdogTimeoutCount, throttleWindowMs: { path: 'A'|'B', median, p95 }, steadyStateRpm, recoveryIntervalMs, perBatchLatency: { p50, p95 }, evalScore: { within5km, within20km, within100km, total } }`
  - Verification: file exists in Commit 2 working tree; `jq '.throttleWindowMs.path' run-1-throttle-snapshot.json` returns `"A"` or `"B"`; numeric fields non-null.

- **Run 2 snapshot:** `.planning/phases/30-.../run-2-throttle-snapshot.json` (same shape as Run 1).
  - Deploy-gate verification (all must pass):
    - `jq '.evalScore.within5km / .evalScore.total' run-2-throttle-snapshot.json` returns value within **±0.03** of `events:llm-eval-baseline:v3` corresponding ratio.
    - `jq '.evalScore.within20km / .evalScore.total' run-2-throttle-snapshot.json` ditto.
    - `jq '.evalScore.within100km / .evalScore.total' run-2-throttle-snapshot.json` ditto.
    - `jq '.watchdogTimeoutCount' run-2-throttle-snapshot.json` ≤ Run 1's `watchdogTimeoutCount`.
  - If Run 2 fails deploy gate: Run 3 (bisection) fires per D-02; record Run 3 snapshot at `run-3-throttle-snapshot.json` with same shape.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 new files / fixtures listed above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (per-commit), < 60s (per-wave)
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 lands

**Approval:** pending
