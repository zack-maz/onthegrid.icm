# LLM Pipeline Reliability (v1.5–v1.6)

> Measured throttle behavior + tuned defaults for the NIM-primary pipeline (Pro 800s `maxDuration`). OpenRouter is a dormant, key-gated fallback per Phase 30.1 — at runtime the pipeline is NIM-only; see the "NIM-only" sub-block below (consistent with the line-6 cascade-shape note). Numbers in this doc come from `run-1-throttle-snapshot.json` and `run-2-throttle-snapshot.json` in `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/`.

**Phase 30 measurement dates:** 2026-05-17 (Run 1 at 01:19:41Z, Run 2 at 02:36:01Z)
**Cascade shape:** NVIDIA NIM-primary (qwen-235b instruct); OpenRouter dormant fallback (Phase 30.1 — NIM-only at runtime). v1/v2 retired Phase 29.
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

**What stays:** the `mergeAndPersistLlmEntities` helper itself (called once at end-of-run, `server/lib/llmExtractionPipeline.ts:389` post-deletion). `events:llm:v3:partial` observability key writes inside the v3 extractor's `writePartialCache` stay (owned by SIMPLIFY-02 in Phase 35).

**LOC delta:** -92 LOC across `server/lib/llmExtractionPipeline.ts` (-86), `server/config.ts` (-1 net), `.env.example` (-5). Feeds Phase 35 SIMPLIFY-07's cumulative v1.5 bundle delta.

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

## Multi-Provider Cascade (Phase 34, 2026-05-23)

Phase 34 was inserted 2026-05-19 to widen the v3 cascade with Cerebras + Groq free-tier fallbacks (deleted Phase 29 SIMPLIFY-04) so NIM throttle events stop translating into DLQ entries. The Phase 31 Day-1 baseline (4 × `v3:timeout_watchdog` on a single PASS-day cron) was the empirical motivation.

**Outcome: `cerebras-groq-deferred` (operator decision, no probe run).** The operator chose to defer provisioning free-tier accounts for both providers rather than measure their rate-limit behavior. This is the "both providers deferred" branch baked into the CONTEXT.md D-02 outcome table — the close-out path requires no code change, only a deferral record.

### Cascade shape as of 2026-05-23

| Slot     | Provider   | Status   | Notes                                                                                |
| -------- | ---------- | -------- | ------------------------------------------------------------------------------------ |
| Primary  | NVIDIA NIM | Active   | `qwen/qwen3.5-397b-a17b` per Phase 27.4.4 D-01 bake-off                              |
| Fallback | OpenRouter | Dormant  | `skipOpenRouter: true` at v3.ts:673, 996 per Phase 30.1 (free tier 90% rate-limited) |
| Fallback | Cerebras   | Deferred | Phase 34 — no probe, no adapter; operator deferred provisioning                      |
| Fallback | Groq       | Deferred | Phase 34 — no probe, no adapter; operator deferred provisioning                      |

The active cascade is therefore single-provider (NIM only). The Pitfall 1 raw-GDELT terminal fallback remains the user-visible safety net when NIM is throttled — same contract as Phase 30.1.

### Why no probe ran

CONTEXT.md D-02 baked in three outcome buckets per provider (`<50%` → integrate, `50-90%` → middle-bucket defer, `≥90%` → defer). All three buckets — and the combined "both deferred" branch — produce a valid close-out. Skipping the probe entirely is operationally equivalent to a "both deferred" probe outcome: no providers land in the cascade, the deferral rationale is captured here + in ADR-0010, and the planning artifacts under `.planning/phases/34-.../` remain as the audit trail for what was planned but not executed.

### Raw-GDELT terminal fallback contract (unchanged)

Same as Phase 30.1: when the NIM circuit breaker opens mid-run, batches drop and `/api/events` serves raw GDELT via the Pitfall 1 bridge in `server/routes/events.ts`. The map never goes blank. Operator visibility of this transition is currently limited to `/api/operator-status` Bearer-gated surfaces. The Phase 34 deferral does NOT change this contract; it acknowledges that the DLQ-baseline pain remains a known failure mode under the current single-provider cascade.

### What changes if a future phase restores Cerebras / Groq / per-provider eval

The artifacts under `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/` are the ready-to-execute plan for a future provider-restoration phase:

- `34-CONTEXT.md` — 33 implementation decisions (D-01..D-33) covering probe methodology, adapter shape, cascade ordering, per-provider eval design, DLQ reason union extension, validation cron protocol.
- `34-RESEARCH.md` — verified code touchpoint line locations + two corrections to CONTEXT.md (Cerebras model name + 5 RPM rate-limit ceiling).
- `34-01-PLAN.md` through `34-05-PLAN.md` — executable plan files.

A future phase can re-use these artifacts directly (re-running `gsd-execute-phase 34 --auto --no-transition` after populating `CEREBRAS_API_KEY` + `GROQ_API_KEY` in `.env.local`), or extract them into a fresh decimal phase if scope changes.

Decision record: [`docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`](../adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) Phase 34 sub-block.

---

## 7-Day Watch (Phase 31, LLM-RELI-06)

Phase 31 appends daily observations here. The 7-day watch was designed to validate Phase 30's tuned defaults under real production traffic across a full operational week before declaring v1.5 throttle work "done." The eval-harness fixture-bundling fix is a prerequisite for Phase 31 — without it, eval drift over the 7-day window is unobservable for the same reason Plan 06's correctness gate was INCONCLUSIVE.

### Close summary (early — 2026-05-19)

Phase 31 was closed at Day 1 of 7 under operator decision. LLM-RELI-06 is declared **"validated single-day, monitoring continues opportunistically"** rather than fully 7-day-validated. The original D-04 strict 7-consecutive bar and the D-05 3-reset-cycles → 31.1 escalation gate are **deferred, not cancelled**: any future ad-hoc snapshot row classifying FAIL should be treated as Day-1 of the 31.1 escalation conversation. The snapshot harness (`scripts/snapshot-cron-watch.ts`, `npm run watch:snapshot -- --http`) and `watch-log.json` remain operational; ad-hoc capture is one command and the script appends rows idempotently by `tickDate`.

Full closing rationale: [`.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`](../../.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md).

### Observed rows (2 total — Day 0 baseline + Day 1 natural cron)

| tickDate   | natural | result | healthStatus | freshness | batchCount | breakerTrips | dlq                       | eval@5/20/100km    | notes                                                                                                                                                       |
| ---------- | ------- | ------ | ------------ | --------- | ---------- | ------------ | ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-18 | false   | PASS   | healthy      | 9m fresh  | 216        | 0            | 0                         | 0.98 / 0.98 / 0.98 | D-02 prep-validation force-trigger. Cold-cache baseline (all 431 groups processed because `events:llm:v3` was empty). Eval-bundle fix verified (49/50).     |
| 2026-05-19 | true    | PASS   | healthy      | 25m fresh | 180        | 0            | 4 × `v3:timeout_watchdog` | 0.98 / 0.98 / 0.98 | Day 1 natural cron. **Warm-cache `batchCount` 216 → 180 (16% drop)** — Phase 31 prep #2 diff-filter prefix-add fix measurably working. DLQ all whitelisted. |

### Takeaways

- **Prep #1 (eval bundle)** — `evalScore.total` reports real, non-zero values in `/api/cron/health` after Day 0. The 0.98 score at all radii is a real measurement, not a `total: 0` artifact. The 30-day Redis TTL on `events:llm-eval-baseline:v3` keeps drift detection live regardless of further watch days.
- **Prep #2 (diff-filter prefix-add)** — Warm-cache batch reduction is empirically real (Day 0 → Day 1: 216 → 180). Production behavior matches the unit test from PR #23 `1bfec94`.
- **Breaker trips: 0** across both rows. NIM-only cascade is not tripping under normal load with Phase 30's tuned defaults.
- **DLQ**: 4 `v3:timeout_watchdog` entries on Day 1 are inside the watch-script's whitelist (`['v3:timeout_watchdog', 'v3:adaptive-retry-fail']`). This is the documented baseline per D-03; per-event timeouts under NIM throttle are expected and absorbed.

### What the early close costs

Single-day evidence cannot rule out failure modes that recur on a multi-day cadence (NIM throttle cycles correlated with day-of-week, monthly quota resets, etc.). The 7-day bar was designed to catch those. The early-close decision accepts that risk in exchange for unblocking downstream phase work; Phase 37's acceptance gate (LLM-RELI-07, 3 consecutive `prod-connectivity-audit.yml` exit-0 + `allTiersGreen=true`) remains the mechanical reliability check at v1.5 close and is unaffected.
