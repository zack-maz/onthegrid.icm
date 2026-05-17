# ADR-0010: v1.5 LLM pipeline narrowing and deletion

**Status:** Accepted
**Date:** 2026-05-11
**Deciders:** solo author

## Context

The v1.5 milestone brief opened with the position that the active LLM cascade
had drifted: 4 providers configured (Cerebras, Groq, NIM, OpenRouter) but
only 2 actually used (NIM + OpenRouter via the v3 extractor's `freeClaudeRouter`
path). The v1 + v2 extractor modules had been preserved per Phase 27.4 D-26/D-40
as deep-rollback safety; ~2 weeks of stable v3 production (since Phase 27.4
shipped 2026-04-21) plus the Pitfall 1 cache bridge (which provides
"map-never-blank" independent of which extractor wrote the cache) made that
preservation no longer earn its keep.

Phase 29 (the first phase of the v1.5 milestone) opens the simplification
sweep. Cascade-narrowing, v1+v2 deletion, the LLM-optional architecture
proof, and a Vercel Pro upgrade all land in the same phase so subsequent
v1.5 work tunes against a smaller, sharper code surface and the new 800s
maxDuration ceiling.

## Decision

1. **Narrow the active cascade.** Cerebras + Groq removed from
   `server/adapters/llm-provider.ts` runtime path. Adapter source files
   left importable for emergency-only reference; no production code path
   references them.

2. **Delete v1 + v2 extractor modules.** `server/lib/llmEventExtractor.v1.ts`
   and `server/lib/llmEventExtractor.v2.ts` deleted along with their
   Redis cache keys (`events:llm`, `events:llm:v2`, `events:llm:v2:partial`,
   `events:llm-summary`, `events:llm-summary:v2`), their pipeline-version
   toggle (`isPipelineV2`, `setPipelineOverride`, the
   `events:llm-pipeline-override` key + endpoint), and the Pitfall 1
   bridge that read them. v3 is now the only extractor; the cache bridge
   collapses to "serve `events:llm:v3` or raw GDELT."

3. **Prove the LLM-optional architecture.** A new integration test
   exercises the `/api/events` path with all LLM credentials unset and
   asserts the route serves the raw-GDELT fallback. The runbook is
   extended with the unset-credentials recovery procedure so the
   degrade-open posture is auditable, not just folkloric.

4. **Vercel Pro upgrade landed in the same phase** so subsequent v1.5
   phases (30, 31) tune against the 800s maxDuration ceiling. The cron
   triad (`/api/cron/health`, `/api/cron/warm`, `/api/cron/refresh-events`)
   no longer sits at the 60s Hobby-tier wall, removing the cascade-timeout
   class of failure from the cron-warm and refresh-events runs.

## Phase 30 Sub-block (appended 2026-05-17)

Phase 30 added the numbers Phase 29 deferred ("characterize, propose, validate at 800s"). All decisions are atomic per-commit (CONTEXT D-08). Architecture-level numbers live in [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md); this sub-block records the _decisions_ themselves.

- **D-01 (telemetry):** `retryAfterMs?: number | null` field added to `callHistory[]` rows in `server/lib/llmProgress.ts`. Populated in `server/lib/freeClaudeRouter.ts` 429 catch block from `error.headers['retry-after']` (case-insensitive lookup, `parseFloat` + `Number.isFinite` guard). Path A (header present → analyzer captures throttle window directly from `retryAfterMs`) and Path B (header absent → analyzer infers from `callHistory` timestamp gaps). **Run 1 path: B** (NIM returned zero `Retry-After` headers across 213 batches / ~123s). **Run 2 path: B** (same — zero 429s in either run).
- **D-02 (tuning method):** Characterize (Run 1 at v1.4 defaults) → Propose (analytical, from Run-1 numbers) → Validate (Run 2). Both runs landed inside Pro 800s ceiling (Run 1: 122628ms; Run 2: 124533ms — ~85% headroom). Because both runs hit Path B with `steadyStateRpm = 0` and `recoveryIntervalMs = null`, the formulas that depend on a measured throttle window were undefined; Plan 05 explicitly ran in **sanity-check mode** rather than measured-tuning mode. The committed defaults (`LLM_BATCH_TIMEOUT_MS=120000`, `RETRY_ATTEMPTS=3`, `BACKOFF_MS=[2000, 8000, 32000]`, `JITTER_MS=500`) are conservative defensive choices anchored to `perBatchLatency.p95 = 33263 ms` from Run 1, NOT empirical fits to a measured throttle window. See [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md#tuned-defaults) for the full pre/post defaults table and per-row derivation rules.
- **D-03 (eval gate):** Run-2 regression tolerance = ±3pp absolute at 5/20/100km vs `events:llm-eval-baseline:v3` (Phase 29 anchor, 90d TTL). **Result: INCONCLUSIVE.** The `runEval()` resolver-only harness returned `evalScore = 0/0/0 of 0` in both Run 1 and Run 2 because `.planning/eval/ground-truth-events.json` is not bundled into the Vercel deploy output. Both numerator and denominator were zero, so the ±3pp tolerance could not be computed. **PASS margins: N/A.** This is a known blocker carried forward to Phase 31 (LLM-RELI-06) or a follow-up plan; until the fixture-bundling bug is fixed, the correctness gate cannot be evaluated. The **safety gate** (Run 2 `watchdogTimeoutCount = 0` ≤ Run 1 `watchdogTimeoutCount = 0`) **PASSED** — that is the only deploy gate Plan 06 actually proved.
- **D-04 (SIMPLIFY-01):** Incremental flush (`mergeAndPersistLlmEntities` every N batches inside `onBatchComplete`) retired from `server/lib/llmExtractionPipeline.ts`. `LLM_FLUSH_EVERY_N_BATCHES` env var deleted (`.env.example`, `server/config.ts`). Redis SET-call count per cron run for `events:llm:v3` dropped from **~22** (at `batchCount = 213` × prior 10-batch cadence: `floor(213/10) + 1 = 22` SETs) to **1** (terminal end-of-run write only) — approximately a **95% reduction**. Net LOC delta: -92 across `llmExtractionPipeline.ts` (-86), `server/config.ts` (-1), `.env.example` (-5).
- **D-05 (SIMPLIFY-03):** Watchdog soft-warn tier eliminated. `softWarnMs` + `onSoftWarn` + `softWarnTimer` removed from `server/lib/llmExtractorWatchdog.ts`; both `withBatchWatchdog` callsites in `server/lib/llmEventExtractor.v3.ts` are `softWarnMs`-free; the `'watchdog-soft-warn'` enum literal removed from both `LLMPipelineProgress.callHistory.skipReason` and `LLMRunSummary.callHistory.skipReason` unions in `server/lib/llmProgress.ts`. Hard-kill stays as the single tier; `LLM_BATCH_TIMEOUT_MS` default bumped from **90000** to **120000** per Run-1 p95 (33263 ms) + long-tail-outlier headroom math (CONTEXT D-05 formula `max(2 × p95, throttle_window + 30s)` with `throttle_window` undefined under Path B, rounded up). Net LOC delta: -97 across watchdog source + tests, v3 extractor, and llmProgress.
- **D-06 (docs home):** `docs/architecture/llm-pipeline-reliability.md` created as the measurement home — Findings table (Run 1 + Run 2 numbers from snapshot JSONs), Tuned Defaults table (pre/post values + derivation rules + rollback recipe), Retired Mechanisms block (SIMPLIFY-01 + SIMPLIFY-03 rationale + LOC deltas), Phase 31 placeholder. CLAUDE.md adds one pointer line under "LLM Event Pipeline" (no reliability prose in CLAUDE.md itself — Phase 29 D-06 5018-token budget preserved). This ADR captures the **decision**; the architecture doc captures the **measurement**. Phase 31's 7-day watch (LLM-RELI-06) appends to a placeholder section in the architecture doc rather than restructuring it.
- **D-07 (env tunability):** `LLM_BATCH_SIZE` promoted from hard-coded `const BATCH_SIZE = 2` in `server/lib/llmEventExtractor.v3.ts:83` to env-tunable via `server/config.ts` Zod schema. **Default: 2 (UNCHANGED)** — Plan 05 chose not to raise toward 4–8 because the eval gate (D-03) is INCONCLUSIVE, so any bump would be a guess rather than a measurement. Behavior is byte-identical until an operator sets `LLM_BATCH_SIZE` explicitly. Env vars (`LLM_V3_CONCURRENCY`, `LLM_BATCH_SIZE`, `LLM_BATCH_TIMEOUT_MS`) stay tunable for mid-incident operator override; router constants (`BACKOFF_MS`, `JITTER_MS`, `RETRY_ATTEMPTS`) are NOT env-tunable and require `git revert` for in-incident reversion.

**Rollback recipe** (preserves v1.4 numerical behavior modulo soft-warn deletion):

```bash
LLM_V3_CONCURRENCY=12 LLM_BATCH_SIZE=2 LLM_BATCH_TIMEOUT_MS=90000
# Router-constant reversion (BACKOFF_MS / JITTER_MS / RETRY_ATTEMPTS) requires:
#   git revert <Plan 05 freeClaudeRouter tune commit, e.g. 6d6b427>
# Soft-warn deletion is code-only and requires:
#   git revert <Plan 04 watchdog soft-warn deletion commit, e.g. 32a2b51>
```

**Out of scope (carries forward):**

- 7-day cron-stability watch on tuned defaults → Phase 31 (LLM-RELI-06)
- Eval-harness ground-truth fixture bundling fix (blocker for D-03 correctness gate) → Phase 31 prerequisite or follow-up plan
- `events:llm:v3:partial` retirement → Phase 34 (SIMPLIFY-02)
- Per-batch adaptive sizing (`V3_ADAPTIVE_BATCH`) — deferred until Phase 31 data argues for it
- Diff-filter cache-key mismatch (Run 2 surfaced that cached event ids carry `llm-v3-grp-` prefix but group keys do not, so the cron re-processes everything) — surfaced in Plan 06 SUMMARY; follow-up plan TBD

<expand_at_36>

## Consequences

### Positive

- Smaller bundle, fewer code paths.
- Rollback path simplified: `git revert <Phase 29 range>`.
- The active code path is obviously the active code path — no flag-gated
  branches, no preserved-for-rollback modules to triage during incidents.

### Negative

- The Phase 27.4 D-26/D-40 deep-rollback lock is superseded. If a
  v3-only defect surfaces that v1 or v2 would have masked, the recovery
  path is git-revert the Phase 29 deletion range and redeploy — not
  flip a runtime flag.
- ADR-0009 (the two-key-split for partial vs terminal v2 reads) becomes
  partially historical — the v2 keys it documents are deletion targets
  here. The reasoning preserved in ADR-0009 stays load-bearing for the
  v3 partial-key pattern (`events:llm:v3:partial`), which inherits the
  same writer/reader-shape-isolation discipline.

### Neutral

- `shouldPauseNewEvents()` soft-cap pause becomes unreachable
  post-narrowing (it gated v2-vs-v3 racing in the events route).
  Documented as Phase 30 cleanup work.

## Alternatives Considered

- **Archive v1.ts + v2.ts to `attic/`** (original SIMPLIFY-06 plan).
  Rejected per CONTEXT D-02: archived code creates the same triage
  burden as preserved code — operators see the files, wonder if they
  are still load-bearing, and the simplification gain evaporates. Git
  history is the archive.
- **Add `LLM_PIPELINE_ENABLED` env-var kill-switch.** Rejected per
  D-05: "unset both `CEREBRAS_API_KEY` + `OPENROUTER_API_KEY`" is the
  kill switch. A dedicated env var would duplicate that mechanism and
  add a configuration surface to keep in sync.

## References

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md`
  (D-01 through D-11)
- Phase 27.4 D-26/D-40 lock (v1+v2 deep-rollback preservation —
  superseded here)
- ADR-0009 — Two-key split for LLM partial progress vs terminal reads
  (partially superseded — v2 keys it documents are deletion targets in
  Phase 29; the writer/reader-shape-isolation principle is preserved
  in the v3 partial-key pattern)
- Commit range: <filled in at PR merge time>

---

_Template source: Michael Nygard, "Documenting Architecture Decisions"
(2011). Short format, immutable once Accepted — supersede with a new
ADR rather than editing the body. The status line may be updated._
