# LLM Pipeline Reliability (v1.5)

> Measured throttle behavior + tuned defaults for the NIM + OpenRouter cascade on Vercel Pro's 800s `maxDuration` ceiling. Numbers in this doc come from `run-1-throttle-snapshot.json` and `run-2-throttle-snapshot.json` in `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/`.

**Phase 30 measurement dates:** 2026-05-17 (Run 1 at 01:19:41Z, Run 2 at 02:36:01Z)
**Cascade:** NVIDIA NIM (primary, qwen-235b instruct) → OpenRouter (fallback). v1/v2 retired Phase 29.
**Vercel plan:** Pro · `maxDuration: 800` (`vercel.json`).

> **Path B framing.** Both Run 1 and Run 2 hit Path B of the throttle-characterization decision tree — NIM returned **zero** 429s during either run (213 batches each, ~123s wall-clock). The "tuned defaults" in this doc are therefore **conservative defensive choices grounded in measured per-batch latency**, NOT empirical fits to a measured throttle window. Plan 05 explicitly ran in sanity-check mode rather than measured-tuning mode. Phase 31's 7-day watch (LLM-RELI-06) and any follow-up plan that lands the eval-harness fix are the next opportunities to re-derive the numbers against real throttle signal.

---

## Findings

| Metric                                       | Run 1 (defaults: concurrency=12, BATCH_SIZE=2, hard-kill=90s) | Run 2 (tuned defaults: BATCH_TIMEOUT=120s, RETRY=3, BACKOFF=[2000,8000,32000], JITTER=500) | Source field              |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| Throttle window median (ms)                  | 306 (synthetic gap-inference, no real signal)                 | null (analyzer returned no signal honestly)                                                | `throttleWindowMs.median` |
| Throttle window p95 (ms)                     | 306                                                           | null                                                                                       | `throttleWindowMs.p95`    |
| Path (A: `retry-after` header / B: inferred) | B                                                             | B                                                                                          | `throttleWindowMs.path`   |
| Steady-state RPM                             | 0                                                             | 0                                                                                          | `steadyStateRpm`          |
| Recovery interval (ms)                       | null                                                          | null                                                                                       | `recoveryIntervalMs`      |
| p50 batch latency (ms)                       | 21053                                                         | 19211                                                                                      | `perBatchLatency.p50`     |
| p95 batch latency (ms)                       | 33263                                                         | 33755                                                                                      | `perBatchLatency.p95`     |
| Watchdog hard-kill count                     | 0                                                             | 0                                                                                          | `watchdogTimeoutCount`    |
| Eval @5km                                    | 0 / 0 (INCONCLUSIVE — see note below)                         | 0 / 0 (INCONCLUSIVE — same blocker)                                                        | `evalScore.within5km`     |
| Eval @20km                                   | 0 / 0 (INCONCLUSIVE)                                          | 0 / 0 (INCONCLUSIVE)                                                                       | `evalScore.within20km`    |
| Eval @100km                                  | 0 / 0 (INCONCLUSIVE)                                          | 0 / 0 (INCONCLUSIVE)                                                                       | `evalScore.within100km`   |
| Total batches                                | 213                                                           | 213                                                                                        | `batchCount`              |
| Total wall-clock (ms)                        | 122628                                                        | 124533                                                                                     | `durationMs`              |

**Eval gate status: INCONCLUSIVE.** Both runs returned `evalScore.total = 0` because `.planning/eval/ground-truth-events.json` is not bundled into the Vercel deploy output. The `runEval()` resolver-only harness caught the missing-fixture error and continued the pipeline, but the ±3pp regression gate (CONTEXT D-03) cannot be evaluated when both numerator and denominator are zero. This blocker is shared by Plans 02, 05, and 06 — none of them could validate eval drift either. Phase 31's 7-day watch (LLM-RELI-06) or a follow-up plan must fix the bundling before Phase 30's tuning can be declared empirically validated. Until then, the **safety gate** (Watchdog hard-kill regression: Run 2's 0 ≤ Run 1's 0) is the only deploy gate that Plan 06 actually proved.

**Throttle-window collapse Run 1 → Run 2 (306 → null) is the analyzer being more honest, not the system getting better.** Run 1's `306ms median` came from a synthetic small-sample gap-inference calculation; Run 2's `null` returned from the same analyzer code path because the sample size was too small to infer anything meaningful. Both runs had effectively zero 429s. Cite Run 2's `null` as the more truthful value (per Plan 06 SUMMARY guidance).

Re-derive any row at any time:

```bash
jq '.throttleWindowMs' .planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-2-throttle-snapshot.json
jq '.perBatchLatency.p95' .planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-2-throttle-snapshot.json
jq '.watchdogTimeoutCount' .planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-2-throttle-snapshot.json
```

---

## Tuned Defaults

| Knob                             | v1.4 default   | v1.5 default (Phase 30)  | Source / rule                                                                                                                                                                                                                                                                        |
| -------------------------------- | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LLM_V3_CONCURRENCY`             | 12             | 12 (UNCHANGED)           | CONTEXT D-02 formula `(observed_NIM_RPM × measured_batch_latency_seconds) / 60` is undefined under `steadyStateRpm = 0` (Path B). Conservative hold; re-probe by raising concurrency in a future plan once eval gate is unblocked.                                                   |
| `LLM_BATCH_SIZE`                 | 2 (hard-coded) | 2 (env-tunable per D-07) | Eval gate INCONCLUSIVE (`evalScore.total = 0` both runs) — cannot prove the ±3pp regression budget would hold at 4–8. Held at 2 until the eval-harness fixture-bundling bug is fixed. Now env-tunable so an operator can opt in to 4 / 6 / 8 mid-incident without a code redeploy.   |
| `LLM_BATCH_TIMEOUT_MS`           | 90000          | 120000                   | CONTEXT D-05: `max(2 × measured_batch_latency_p95, observed_throttle_window + 30s)` = `max(2 × 33263, undefined)` = `66526ms`, rounded up to 120000 for long-tail outlier headroom (Run 1 p95 was a 213-sample estimate).                                                            |
| `BACKOFF_MS` (per-attempt array) | `[1000, 4000]` | `[2000, 8000, 32000]`    | CONTEXT D-02 base = `observed_throttle_window / 2` was undefined under Path B → conservative 2× bump of v1.4 base; 4× scaling preserved across attempts; third element appended for the new `RETRY_ATTEMPTS=3`. Defensive choice; Plan 06 with real 429s would inform a tighter fit. |
| `JITTER_MS` (± window)           | 250            | 500                      | CONTEXT D-02: preserve the existing ±25% ratio relative to `BACKOFF[0]`: 250 / 1000 = 500 / 2000.                                                                                                                                                                                    |
| `RETRY_ATTEMPTS`                 | 2              | 3                        | CONTEXT D-02: Pro 800s budget allows an extra attempt without watchdog conflict (worst-case retry wall-clock 2+8+32 = 42s, bounded by new 120s batch timeout).                                                                                                                       |

**Plan 06 deploy-gate verdict:** the safety gate (Run 2 `watchdogTimeoutCount` 0 ≤ Run 1 `watchdogTimeoutCount` 0) **PASSED**; the correctness gate (eval ±3pp at 5/20/100km vs `events:llm-eval-baseline:v3`) is **INCONCLUSIVE** for the reason above. The tuning is safe to keep on the safety dimension; it is not "proven empirically" until eval drift can be evaluated.

**Rollback recipe (single-knob revert):**

```bash
# Reverts to v1.4 numerical behavior modulo soft-warn deletion:
export LLM_V3_CONCURRENCY=12   # already the default; included for parity with the env-override pattern
export LLM_BATCH_SIZE=2        # already the default; included for parity
export LLM_BATCH_TIMEOUT_MS=90000
# Router constants (BACKOFF_MS, JITTER_MS, RETRY_ATTEMPTS) are NOT env-tunable.
# In-incident reversion requires:
#   git revert <Plan 05 freeClaudeRouter tune commit, e.g. 6d6b427>
# Soft-warn (SIMPLIFY-03) is code-only; rollback requires:
#   git revert <Plan 04 watchdog soft-warn deletion commit, e.g. 32a2b51>
```

**Where to read each knob:**

- `LLM_V3_CONCURRENCY` / `LLM_BATCH_SIZE` / `LLM_BATCH_TIMEOUT_MS` — `server/config.ts` Zod schema (env-tunable; hard-coded fallback constants in the schema)
- `BACKOFF_MS` / `JITTER_MS` / `RETRY_ATTEMPTS` — `server/lib/freeClaudeRouter.ts` (code constants; Plan 05 commit message body documents prior values)

---

## Retired Mechanisms

### SIMPLIFY-01 — Incremental flush (Phase 28.2.6 → retired Phase 30)

**What it was:** `mergeAndPersistLlmEntities` was called from the `onBatchComplete` callback in `server/lib/llmExtractionPipeline.ts` every N batches (`LLM_FLUSH_EVERY_N_BATCHES`, default 10). This wrote `events:llm:v3` partial state mid-run as a Hobby-era guard against 300s hard kills truncating the run before the terminal write.

**Why retired:** Pro 800s `maxDuration` (Phase 29 D-08) makes the terminal end-of-run write the canonical shape. The mid-run writes were duplicating data and inflating Redis SET-call count. Run 2 validated `watchdogTimeoutCount = 0` inside the Pro budget, confirming the 300s-era crash-protection rationale is gone.

**Audit signal:** Redis `events:llm:v3` SET-call count per cron run dropped from **~22 (pre-Plan-03)** to **1 (post-Plan-03)** — approximately a **95% reduction**. Calculation: at Run 2's observed `batchCount = 213`, the prior `LLM_FLUSH_EVERY_N_BATCHES=10` cadence triggered `floor(213 / 10) = 21` intermediate flushes plus 1 terminal write = 22 SETs per cron. Post-Plan-03 the sole terminal write at end-of-pipeline is the only SET on this key.

**What stays:** the `mergeAndPersistLlmEntities` helper itself (called once at end-of-run, `server/lib/llmExtractionPipeline.ts:389` post-deletion). `events:llm:v3:partial` observability key writes inside the v3 extractor's `writePartialCache` stay (owned by SIMPLIFY-02 in Phase 34).

**LOC delta:** -92 LOC across `server/lib/llmExtractionPipeline.ts` (-86), `server/config.ts` (-1 net), `.env.example` (-5). Feeds Phase 34 SIMPLIFY-07's cumulative v1.5 bundle delta.

### SIMPLIFY-03 — Watchdog soft-warn tier (Phase 28.2.5 → eliminated Phase 30)

**What it was:** `withBatchWatchdog` had two tiers: 60s soft-warn (log + synthetic `callHistory` row with `skipReason: 'watchdog-soft-warn'`) and 90s hard-kill (`Promise.race` rejection + `onTimeout` callback). The soft-warn predated NIM and was tuned for Cerebras's intermittent slowness under high traffic.

**Why eliminated (not relaxed):** Cerebras was retired Phase 29 D-01. At Run-1 measured p50 batch latency of **21053 ms** (~21s), a 60s soft-warn fires too rarely to carry signal. The historical telemetry it captured is now derivable post-run from the analyzer's latency histogram (`scripts/analyze-llm-run.ts`, Plan 01) — no in-flight log path needed. Run 1 also recorded `watchdogTimeoutCount = 0` at p95 33263 ms vs the prior 60s soft-warn threshold and 90s hard-kill threshold, proving soft-warn was capturing nothing in production.

**What stays:** hard-kill via `LLM_BATCH_TIMEOUT_MS` (default bumped 90000 → 120000 per the Tuned Defaults table above). Single-tier watchdog. The late-resolve clobber guard (`timedOut` closure flag + trailing `workPromise.catch(() => {})`) survives untouched — it was always orthogonal to the soft-warn tier.

**LOC delta:** -97 LOC net across `server/lib/llmExtractorWatchdog.ts` (-44), `server/__tests__/lib/llmExtractorWatchdog.test.ts` (-22), `server/lib/llmEventExtractor.v3.ts` (-25), `server/lib/llmProgress.ts` (-6). The `watchdog-soft-warn` skipReason literal was removed from both `LLMPipelineProgress.callHistory.skipReason` and `LLMRunSummary.callHistory.skipReason` unions; stale Redis rows under the 90d TTL on `events:llm-summary:v3` are tolerated by Plan 01's analyzer, which ignores unknown values.

---

## Cascade Reality (Phase 30.1, 2026-05-17)

Phase 27.4.4 Plan 02 hardcoded `skipOpenRouter: true` at two call sites in `server/lib/llmEventExtractor.v3.ts` (main batch path + split-half retry path), which silently removed OpenRouter from the active cascade declared in Phase 29 D-01. The 2026-05-17 04:00 UTC daily cron exposed the failure mode: NIM 39 rate_limit errors → circuit breaker tripped → 50+ batches dropped with `provider: 'nvidia_nim' reason: 'skipped:breaker'`, zero OpenRouter attempts (`used: 0 / cap: 200`).

Phase 30.1 re-validated OpenRouter free-tier rate-limit behavior via `scripts/probe-openrouter.ts` (Plan 01). The probe landed in the **not-viable bucket** (rate_limit fail ≥ 90% per D-05). Restoring the fallback to the free tier would make every batch attempt a guaranteed loser — amplifying breaker error rates without delivering any successful extractions. The free tier is not currently usable.

The cascade therefore remains NIM-only at runtime — `skipOpenRouter: true` stays in place at `server/lib/llmEventExtractor.v3.ts:622, 929`. The Phase 29 D-01 declaration ("NIM (primary) + OpenRouter (fallback)") is **not currently true at runtime**; the active pipeline is single-provider. OpenRouter is dormant pending Phase-31-or-later re-validation (e.g. paid-OR conversion or a fresh probe after a vendor envelope shift).

### Probe result (`scripts/probe-openrouter.ts`, N=30 single-event payloads, 100ms gap)

| Field            | Value                                    |
| ---------------- | ---------------------------------------- |
| Date             | 2026-05-17                               |
| Model            | `meta-llama/llama-3.3-70b-instruct:free` |
| Total attempts   | 30                                       |
| rate_limit (429) | 27 (90.0%)                               |
| other_error      | 3                                        |
| ok               | 0                                        |

Snapshot: `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-or-pulse-snapshot.json`.

Decision per D-05 thresholds: `nim-only` (rate_limit fail ≥ 90%). Re-run the probe quarterly (or whenever OR vendor signals an envelope change) to catch improvements that would unlock restoration.

### Negative-evidence signal: routingTrace must contain ZERO `provider: 'openrouter'` rows

A live `/api/cron/refresh-events` run on the NIM-only configuration produces `events:llm-summary:v3.routingTrace` rows with `provider: 'nvidia_nim'` only. Operators verifying the as-built state can run `npm run analyze:llm-run` and assert the routingTrace contains zero OpenRouter entries. This is the inverse of D-14's restored-cascade evidence — same observability primitive, opposite expectation. **No force-trigger required for Plan 04**; the daily 04:00 UTC cron produces this evidence on its own.

### Raw-GDELT terminal fallback contract (unchanged)

When the NIM circuit breaker opens mid-run, batches drop and `/api/events` serves raw GDELT via the Pitfall 1 bridge in `server/routes/events.ts`. The map never goes blank, but enrichment quality degrades to the raw GDELT ontology. Operator visibility of this transition is currently limited to `/api/operator-status` Bearer-gated surfaces; a richer dashboard signal is deferred. This contract is invariant — the Phase 30.1 NIM-only declaration does NOT remove or weaken the terminal fallback; see [`docs/degradation.md`](../degradation.md) Pitfall 1. The NIM-only declaration acknowledges the failure mode the operator observed on 2026-05-17; the terminal-fallback contract is what keeps the user-facing map alive when that failure mode triggers.

### What changes if a future probe re-restores OR

Re-run `scripts/probe-openrouter.ts`. If `summary.decision === 'restored-cascade'`, remove `skipOpenRouter: true` from `server/lib/llmEventExtractor.v3.ts:622, 929` and run the validation cron per Phase 30.1 D-14. The cascade construction in `server/lib/freeClaudeRouter.ts:341-363` is unchanged and ready to fall through; no new routing machinery required.

Decision record: [`docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`](../adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) Phase 30.1 sub-block.

---

## 7-Day Watch (Phase 31, LLM-RELI-06)

Phase 31 appends daily observations here. The 7-day watch validates Phase 30's tuned defaults under real production traffic across a full operational week before declaring v1.5 throttle work "done." The eval-harness fixture-bundling fix is a prerequisite for Phase 31 — without it, eval drift over the 7-day window is unobservable for the same reason Plan 06's correctness gate was INCONCLUSIVE.
