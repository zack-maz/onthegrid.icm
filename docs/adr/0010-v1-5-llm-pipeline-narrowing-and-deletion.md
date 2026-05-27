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
- `events:llm:v3:partial` retirement → Phase 35 (SIMPLIFY-02)
- Per-batch adaptive sizing (`V3_ADAPTIVE_BATCH`) — deferred until Phase 31 data argues for it
- Diff-filter cache-key mismatch (Run 2 surfaced that cached event ids carry `llm-v3-grp-` prefix but group keys do not, so the cron re-processes everything) — surfaced in Plan 06 SUMMARY; follow-up plan TBD

## Phase 30.1 Sub-block (appended 2026-05-17)

Phase 30.1 confronted the silent NIM-only reality the operator surfaced at the Phase 30 boundary. Phase 27.4.4 Plan 02 had hardcoded `skipOpenRouter: true` at `server/lib/llmEventExtractor.v3.ts:622, 929`, removing OpenRouter from the active cascade. The 2026-05-17 04:00 UTC cron exposed the failure mode (NIM 39 rate_limit → breaker tripped → 50+ batches dropped with zero OR attempts).

Re-tested OR free-tier 2026-05-17 via `scripts/probe-openrouter.ts`: 27/30 rate_limited (90.0%). Conclusion: NIM-only active; OpenRouter dormant pending Phase-31-or-later re-validation. Phase 27.4.4's 16/16 measurement stale by 2 months but the free tier is still not viable.

- **D-01 (scope choice):** Minimum scope per D-05 (`rateLimitedPct ≥ 90%` → OpenRouter not viable). No code change in 30.1. The free-tier flip would amplify breaker error rate without delivering successful extractions.
- **D-08 (terminal fallback):** Per D-08 paragraph (mandatory in BOTH branches): batches still drop on breaker-trip; `/api/events` still serves raw GDELT via the Pitfall 1 bridge. Map never goes blank. The NIM-only declaration acknowledges this failure mode honestly rather than hiding it behind a non-functional cascade claim.
- **D-09 (breaker untouched):** `server/lib/llmCircuitBreaker.ts` not re-tuned — same discipline as Phase 30 D-09.
- **D-13 (CLAUDE.md):** "LLM Event Pipeline" line amended to declare OpenRouter fallback dormant pending re-validation. Single-line change; preserves Phase 29 D-06 5018-token budget.

**Phase 31 or fresh-phase follow-up candidates:**

- Paid-OR conversion (~$0.04/day = ~$1.20/mo for full coverage; seed Q4).
- Adaptive Retry-After-aware NIM limiter (Phase 30 D-01's `retryAfterMs` field is already on `callHistory` — wire it into `nvidiaNimWindow` so post-429 calls wait the server-requested duration).
- NIM model switch to a lower-cap-friendly variant (would require fresh bake-off vs Phase 27.4.1's qwen-235b lock).
- Dashboard surface for cascade-degraded state (its own phase; overlaps Phase 32 + Phase 35).
- Re-run `scripts/probe-openrouter.ts` quarterly to catch envelope improvements that would unlock the free-tier restore.

**Architecture-level numbers** (probe + percentages + cascade decision): [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md#cascade-reality-phase-301-2026-05-17). This sub-block records the **decision**; the architecture doc records the **measurement** (mirrors the Phase 30 sub-block convention).

**Out of scope (carries forward):**

- Free-tier `skipOpenRouter: true` removal — deferred until a future probe lands `< 50%` per D-05.
- All Phase 31 prep items remain Phase 31's scope (eval-fixture bundling, diff-filter ID-mismatch, CACHE_KEY_PREFIX whitespace gotcha).

## Phase 34 Sub-block (appended 2026-05-23)

Phase 34 was inserted 2026-05-19 to restore Cerebras + Groq adapters (deleted Phase 29 SIMPLIFY-04) so NIM throttle events stop translating into DLQ entries (Phase 31 Day-1 baseline: 4 × `v3:timeout_watchdog`). The plan was probe-driven: only providers whose free-tier throttle is empirically independent of NIM's would land in the cascade.

**Outcome: `cerebras-groq-deferred` (operator decision — probe not run).** The operator chose to skip Cerebras + Groq integration entirely rather than provision free-tier accounts and run the probe. This matches Phase 30.1's `nim-only` precedent: a deliberate empirical decision that "free-tier provider expansion is not currently the right lever" is itself a load-bearing close-out per CONTEXT.md D-02. No code lands in this phase; no probe artifact exists.

- **D-01 (scope choice):** Honest deferral — operator skipped probe + adapter restoration. Plans 34-01 through 34-04 SKIPPED; only Plan 34-05 (this close-out) executed.
- **D-02 (close-out branch):** Triggered the "both providers deferred" branch baked into CONTEXT.md D-02. The empirical "no probe needed — operator deferral is sufficient" finding is the deliverable.
- **D-08 (terminal fallback):** Unchanged from Phase 30.1 — `/api/events` continues to serve raw GDELT when `events:llm:v3` is empty (Pitfall 1 bridge). Map never goes blank. NIM throttle events still translate into DLQ entries under the current single-provider cascade; this is the failure mode Phase 34 was designed to mitigate but is now deferred.
- **D-31 (CLAUDE.md):** "Active providers" line updated to declare Cerebras + Groq deferred alongside OpenRouter. Single-line change; preserves Phase 29 D-06 5018-token budget. No new Redis registry entries added (no adapters means no `llm:tokens:cerebras|groq` keys).

**Phase-35-or-later follow-up candidates (if the deferral is reconsidered):**

- Run `scripts/probe-cerebras-groq.ts` (planned but unimplemented in Plan 34-01 — would need to be written) against fresh Cerebras + Groq free-tier accounts to measure actual rate-limit behavior against the v3 extractor payload shape.
- Adopt a paid provider tier on either Cerebras or Groq (~$5-50/mo depending on volume) to bypass the free-tier rate-limit ceiling.
- Adaptive Retry-After-aware NIM limiter (Phase 30 D-01's `retryAfterMs` field is already on `callHistory` — wire it into `nvidiaNimWindow` so post-429 calls wait the server-requested duration). Addresses the DLQ-baseline pain without provider expansion.
- Per-provider eval infrastructure (`providerProvenance` + `EvalScore.byProvider`) and `cascade_exhausted` DLQ taxonomy were also deferred — re-introduce in a future phase if/when a multi-provider story emerges.

**Architecture-level numbers** (none — no probe ran): [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md#multi-provider-cascade-phase-34-2026-05-23). This sub-block records the **decision**; the architecture doc records the **deferral rationale** (mirrors the Phase 30 + 30.1 sub-block convention).

**Out of scope (carries forward to future phases):**

- All four LLM-RELI-08..11 requirements close as Done with the deferral outcome. If a future phase restores multi-provider cascade work, those phases inherit fresh requirement IDs (LLM-RELI-12+).
- Existing planning artifacts (`34-CONTEXT.md`, `34-RESEARCH.md`, `34-01-PLAN.md` through `34-05-PLAN.md`) remain in `.planning/phases/34-.../` as the audit trail for what was planned but not executed.

## Phase 35 Sub-block (appended 2026-05-27)

Phase 35 closed the v1.5 documentation-and-cleanup track deferred while LLM-RELI ran. Mechanical drift gate (D-01 vitest) is the load-bearing primitive — the hand-maintained CLAUDE.md registry rotted in expected ways during Phases 27-34 (4 missing keys, 1 retire-but-still-listed, 2 needing refinement); the gate prevents recurrence. Partial-key retirement (D-12 / SIMPLIFY-02) was the only code deletion. Everything else is documentation authoring.

- **D-01 (drift gate):** `src/__tests__/lib/redis-registry.test.ts` parses CLAUDE.md §Serverless Cache + `docs/architecture/redis-keys.md` + greps `server/` + `src/` production code; asserts 3-surface parity. Drift fails the next `vitest run`. Mirrors `colorBridge.test.ts` / `actorCatalog.test.ts` / `urlLiveness.schema.test.ts` precedents. 39 assertions across 4 sub-suites at phase close (1 fewer than 40 reported during plan 35-01 because plan 35-02 retired the partial-key bullet from CLAUDE.md, reducing the documented-key it.each iteration count by exactly 1).
- **D-12 (SIMPLIFY-02):** `events:llm:v3:partial` observability key + writer (`writePartialCache` at `llmEventExtractor.v3.ts`) + `LLMCachePayload` interface + 3 script consumers + 4 test files + CLAUDE.md bullet retired. Hobby-era 300s-budget mitigation; Pro 800s makes terminal writes reliable; partial-key carried no live signal. Production cleanup = natural TTL expiry within `LLM_REDIS_TTL_SEC` (≈ 2.5h) of deploy (D-13). 358 LOC removed in a single atomic commit.
- **D-15 (SIMPLIFY-05):** `server/lib/freeClaudeRouter.ts` top-of-file callers block prepended — 3 live production callers verified by grep (`llmEventExtractor.v3.ts:40`, `llmResolver.ts:15`, `llm-provider.ts:23`); Phase 34 cascade shape documented inline; existing vendored-from block preserved as historical waymarker.
- **D-17 (TTL right-sizing):** Audit-only outcome — every one of 32 keys (counting parametric families once) reviewed against producer cadence + freshness; finding `right-sized` for every entry. Artifact at `.planning/phases/35-*/35-05-TTL-REVIEW.md`. D-18 (replay-history cap) closed as satisfied by existing `operator:audit-log` cap (500/30d via `OPERATOR_AUDIT_MAX_ENTRIES` + `OPERATOR_AUDIT_TTL_SEC`); grep returned zero matches for a separate `replay-history*` key, and replay actions are recorded in `operator:audit-log` via the `operation: 'replay'` discriminator. Same precedent as Phase 31 closing early with "no incidents observed" being itself the deliverable.
- **D-19 (bundle-size delta):** `api/vercel-entry.js` baseline = **1,779,504 bytes** (2026-05-26); close = **1,790,243 bytes** (2026-05-27). Delta = **+10,739 bytes (+0.60%)**. The partial-key deletion savings (~358 LOC stripped from `llmEventExtractor.v3.ts` + supporting files) were offset by JSDoc additions in plan 35-04 (28 new one-liners across 7 LLM-pipeline modules, ~80 bytes each + the partial-key tombstone comments). Net effect ≈ 10KB on a 1.7MB bundle — negligible; intent of the measurement (verify cleanup didn't regress materially) is satisfied.
- **D-20 (Upstash budget delta):** Operator dashboard reading at phase close = **443,094 commands** (baseline ≈ 443,000 / 500K monthly budget). Delta ≈ +94 commands over ~24h between baseline + close screenshots. The window is too short to surface partial-key-retirement command-budget savings (those manifest over 24h+ as the partial-key writer no longer fires ~5×/cron-run); the post-phase observation window will capture them in plan 35-01's `redis-budget-baseline-2026-05-27.png` vs the next baseline capture (recommended after 7 days of post-deploy operation).
- **D-22 (this sub-block):** Captures Phase 35 close measurements + decisions. Mirrors Phase 30 / 30.1 / 34 sub-block convention.
- **Phase 34 carryover note:** No Cerebras / Groq token-budget keys exist in registry (Phase 34 closed `cerebras-groq-deferred` — operator chose to skip provisioning). The Phase 35 `docs/architecture/redis-keys.md` inventory records `absent (Phase 34 deferred — see ADR-0010 Phase 34 sub-block)` for those slots, satisfying the registry-as-documentation surface.

**Outcome:** 6 plans executed; 6/9 requirements closed at phase end (DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01, REDIS-OPT-02, REDIS-OPT-03, REDIS-OPT-04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07). 17 atomic commits land on `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu`. Branch ready for merge to main.

**Architecture-level numbers:** [`docs/architecture/redis-keys.md`](../architecture/redis-keys.md) — the 32-key deep-dive inventory authored in plan 35-01 and pinned by the drift gate. Future Redis-key work edits CLAUDE.md + `redis-keys.md` in lockstep or the gate fails.

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
