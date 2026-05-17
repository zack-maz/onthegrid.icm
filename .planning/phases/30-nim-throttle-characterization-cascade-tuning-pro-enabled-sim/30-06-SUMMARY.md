# 30-06 — Run 2: Validate Tuned Defaults

**Status:** Complete (Gate 1 PASS, Gate 2 INCONCLUSIVE) · **Wave:** 4 · **Autonomous:** false (operator-attended)

## Outcome

Run 2 validation cron completed under the tuned defaults from Plans 30-04

- 30-05. Watchdog deploy gate (the safety gate) passes; eval deploy gate
  is inconclusive due to the known eval-harness blocker (ground-truth
  fixture not bundled into Vercel deploy).

## Snapshot

File: `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-2-throttle-snapshot.json`

| Field                  | Value                                    |
| ---------------------- | ---------------------------------------- |
| `runTimestamp`         | `1778985361424` (2026-05-17T02:36:01Z)   |
| `durationMs`           | `124533` (~125s)                         |
| `batchCount`           | `213`                                    |
| `watchdogTimeoutCount` | `0`                                      |
| `throttleWindowMs`     | `{ path: "B", median: null, p95: null }` |
| `steadyStateRpm`       | `0`                                      |
| `perBatchLatency`      | `{ p50: 19211, p95: 33755 }`             |
| `evalScore`            | `0 / 0 / 0` of `0`                       |

## Deploy gate verdicts

**Gate 1 — Watchdog hard-kill regression (SAFETY):**
`Run2.watchdogTimeoutCount (0) ≤ Run1.watchdogTimeoutCount (0)` → **PASS**

The tuned defaults did not introduce watchdog pressure. Even with the
new 120s hard-kill limit (vs prior 90s), no batches approached the
ceiling — measured p95 of ~34s remains a comfortable 71-second buffer.

**Gate 2 — Eval ratio drift (CORRECTNESS):**
INCONCLUSIVE. `runEval()` returned 0/0/0 of 0 in both runs because the
ground-truth fixture file (`.planning/eval/ground-truth-events.json`)
is not part of the Vercel deploy output. Both numerator and denominator
are zero; ±3pp tolerance cannot be computed.

This is the same blocker noted in 30-02-SUMMARY (Run 1) and 30-05-SUMMARY
(deferred). Plan 06 cannot fully validate the tuning until Phase 31's
7-day watch (LLM-RELI-06) or a follow-up plan fixes the bundling.

## Run 2 vs Run 1 — full comparison

| Metric                    | Run 1  | Run 2  | Delta                                                            |
| ------------------------- | ------ | ------ | ---------------------------------------------------------------- |
| `durationMs`              | 122628 | 124533 | +1905ms (+1.6%) — noise                                          |
| `batchCount`              | 213    | 213    | same (diff filter not pruning — see notes)                       |
| `watchdogTimeoutCount`    | 0      | 0      | same (Gate 1 PASS)                                               |
| `throttleWindowMs.path`   | B      | B      | same (no 429s either run)                                        |
| `throttleWindowMs.median` | 306    | null   | Run 2 more honest — Run 1's 306 was synthetic from gap inference |
| `steadyStateRpm`          | 0      | 0      | same                                                             |
| `perBatchLatency.p50`     | 21053  | 19211  | -1842ms (-8.7%) — slight improvement, likely noise               |
| `perBatchLatency.p95`     | 33263  | 33755  | +492ms (+1.5%) — noise                                           |
| `evalScore.total`         | 0      | 0      | INCONCLUSIVE (blocker unchanged)                                 |

## Tuning verdict

The Phase 30 tuning is **safe to keep** based on Gate 1. The new defaults:

- **`LLM_BATCH_TIMEOUT_MS=120000`** — 86s headroom over measured p95
  (vs prior 57s headroom). More forgiving for the long-tail batches
  without sacrificing total run budget.
- **`BACKOFF_MS=[2000, 8000, 32000]`** + **`RETRY_ATTEMPTS=3`** — gives
  an extra retry attempt with 4× longer steps. Total worst-case retry
  budget per call: 42s (vs prior 5s). Under Path B / zero throttling,
  this is "insurance" — invisible cost when not triggered.
- **`JITTER_MS=500`** — preserves the ±25% ratio relative to `BACKOFF[0]=2000`.
- **`LLM_BATCH_SIZE=2`** held; env-tunable now so Plan 06+ can raise it
  to 4-8 once the eval gate is unblocked.
- **Watchdog soft-warn deleted** — single-tier hard-kill confirmed clean
  across 213 batches × 2 runs.

The tuning is **not "proven" empirically** because Run 1 + Run 2 both
hit Path B with zero 429s, so the throttle-window-derivation rules in
CONTEXT D-02 never fired. The numbers are defensive choices grounded
in Run 1's per-batch-latency measurements, not measured-throttle fits.

## Surprises worth surfacing

1. **Diff filter mystery (worth a follow-up plan):** Run 2 processed
   213 batches even though Run 1 had populated the LLM cache with 426
   events. Looking at `llmExtractionPipeline.ts`:

   ```ts
   const cachedLlmKeys = new Set<string>();
   for (const e of llmCachedRef.data) {
     if (e.id) cachedLlmKeys.add(e.id); // <-- event ids like "llm-v3-grp-20513-19-18"
   }
   const newGroups = groups.filter((g) => !cachedLlmKeys.has(g.key)); // <-- group keys like "20513-19-18" — name mismatch
   ```

   The cached event ids carry a `llm-v3-grp-` prefix; the group keys do
   not. The filter never matches, so every run re-processes everything.
   The cron is doing 2× the work it thinks it's doing. Worth a Phase 31
   or later follow-up.

2. **eval@5/20/100km consistently 0** — confirms it's a deployment-config
   bug, not a transient. Phase 31's 7-day watch will be blind to eval
   drift unless this is fixed first.

3. **Throttle window collapse Run 1 → Run 2 (306 → null):** The analyzer's
   gap-inference path in Run 1 returned 306ms median from a synthetic
   small-sample calculation; Run 2's analyzer returned null (honestly
   "no signal"). The actual change is just sample-size variance — both
   runs had effectively zero 429s. Plan 07's architecture doc should
   cite Run 2's `null` rather than Run 1's `306` as the more truthful
   value.

## Operational metadata

- **Trigger:** `GET /api/cron/refresh-events?force=true` at `2026-05-17T02:33:55Z`
- **Deployment:** Wave 3 code (commits `32a2b51`, `8c7b03a`, `e7c639d`,
  `6a60179`, `6d6b427`) aliased to `otg-iran-monitor.vercel.app` via
  `vercel --prod` at ~02:33Z
- **Completed:** `2026-05-17T02:36:01Z` per `events:llm-summary:v3.lastRun`
- **Wall-clock:** ~125s (well under Pro 800s ceiling — 84% headroom)

## Pointer

The snapshot at `run-2-throttle-snapshot.json` is the canonical input for
Plan 07's architecture doc (`docs/architecture/llm-pipeline-reliability.md`)
findings table and tuned-defaults block. Plan 07 should cite Run 2's
numbers (more honest) over Run 1's wherever they conflict.
