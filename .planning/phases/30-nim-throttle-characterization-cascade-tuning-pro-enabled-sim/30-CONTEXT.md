# Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications — Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Empirically measure NIM's throttle behavior on the new Vercel Pro 800s `maxDuration` ceiling, then tune `LLM_V3_CONCURRENCY`, `LLM_BATCH_SIZE`, and the `callLLM` retry / backoff / jitter parameters against the measured data — not guesses. Document findings in writing. Retire two Hobby-era workarounds whose only reason for existing was the prior 300s ceiling: the `mergeAndPersistLlmEntities` incremental flush (SIMPLIFY-01) and the aggressive 60s/90s watchdog soft-warn tier (SIMPLIFY-03).

**Requirements covered:** LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03.

**Out of scope (other phases):**

- 7-day cron-stability watch on the tuned defaults → Phase 31 (LLM-RELI-06)
- Ghost event URL liveness / dashboard / prune → Phase 32 (GHOST-01..05)
- Actor metadata audit / canonical catalog / eval expansion → Phase 33 (ACTOR-01..05)
- JSDoc audit, Redis registry verification, key inventory, budget delta, `events:llm:v3:partial` retirement (SIMPLIFY-02), `freeClaudeRouter.ts` orphan audit (SIMPLIFY-05), bundle-size delta (SIMPLIFY-07) → Phase 34
- Public docs sweep + OpenAPI additions → Phase 35
- Full ADR-0010 + acceptance gate closeout → Phase 36 (DOCS-PUB-04, LLM-RELI-07)
- Provider expansion or v4 router — explicitly out of scope for v1.5 (`PROJECT.md`)
- Per-batch adaptive sizing — defer until Phase 31 data argues for it

**Carrying forward from Phase 29 (locked, not re-decided here):**

- Vercel Pro 800s `maxDuration` is live (Phase 29 D-08). Every characterization + validation run targets this ceiling, not 300s.
- Active cascade is NIM (primary) + OpenRouter (fallback) only (Phase 29 D-01). v1/v2 extractors deleted (Phase 29 D-02).
- Pitfall 1 cache bridge (`server/routes/events.ts`) must NOT regress — `docs/degradation.md` "map never goes blank" contract is invariant.
- Atomic-per-decision commit discipline: each D-N below lands as a separate commit so `git revert` is surgical.
- ADR-0010 stub at `docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md` has an `<expand_at_36>` marker; Phase 30 appends its numbers + rationale to that section. Full ADR closes at Phase 36.
- `logger.child({ module: '...' })` for any new code, never `console.*` (Phase 28.1 W7 convention).
- TypeScript pinned to ~5.9.3 (CLAUDE.md / Phase 29 convention).

</domain>

<decisions>
## Implementation Decisions

### Telemetry Capture (LLM-RELI-02 input)

- **D-01: Reuse existing `callHistory`; add `retryAfterMs` field; write a post-run analyzer script.** No new Redis sidecar key. The per-attempt `callHistory` rows in `server/lib/freeClaudeRouter.ts` already capture `{provider, latencyMs, status, bucket, attempt}` for every NIM call (and 429s already land in `bucket: 'rate_limit'`). Phase 30 adds one optional field — `retryAfterMs?: number` — populated from NIM's `Retry-After` HTTP response header on 429s (the source-of-truth throttle window length). A new `scripts/analyze-llm-run.ts` reads `events:llm-summary:v3` after each cron run and computes:
  - Observed throttle window length (from `retryAfterMs` median + p95)
  - Steady-state RPM ceiling (from successful 200-status calls / elapsed-minutes during the active window)
  - Recovery interval (time between the last 429 and the first subsequent 200)
  - Per-batch latency p50 + p95 (for analytical concurrency math in D-02)
  - Watchdog hard-kill count (sanity check on the new defaults from D-04)
    Script output is a JSON blob + a Markdown table that gets pasted into `docs/architecture/llm-pipeline-reliability.md` (D-03). Lowest LOC; single source of truth; auditable by re-running the script against the same summary. **Rationale for rejecting a sidecar Redis key:** SIMPLIFY-02 is already arguing to retire `events:llm:v3:partial`; adding `events:llm-throttle:v3` would invite the same retirement debate in Phase 34. Phase 30 keeps the observability surface flat.

### Tuning Method (LLM-RELI-03, LLM-RELI-04)

- **D-02: Characterize → propose → validate (minimum 2 runs, max 3).**
  - **Run 1 (characterize):** force-trigger `GET /api/cron/refresh-events?force=true` at the current defaults (concurrency=12, BATCH_SIZE=2, BACKOFF_MS=[1000,4000], jitter=±250ms, hard-kill=90s). Capture data via D-01. **Hard requirement: this run must complete inside the Pro 800s ceiling** so the elapsed-time math reflects the v1.5 production shape, not a force-killed run.
  - **Propose (analytical, no run):** derive new defaults from the Run-1 numbers:
    - `LLM_V3_CONCURRENCY` ≈ `(observed_NIM_steady_RPM × measured_batch_latency_seconds) / 60` (likely _lower_ than 12 on Pro since the 300s pressure that justified 12 is gone)
    - `LLM_BATCH_SIZE` ≈ raised from 2 toward 4-8 depending on `runEval()` accuracy under the larger group context (Run-1 eval is the anchor)
    - `callLLM` BACKOFF base = `observed_throttle_window / 2` (so the second attempt lands inside the recovery window)
    - `jitter` = `±0.25 × backoff_base` (preserve the current ±25% jitter ratio)
    - `RETRY_ATTEMPTS` may increase from 2 → 3 since the 800s budget now allows it without watchdog conflict
    - Hard-kill = `max(2 × measured_batch_latency_p95, observed_throttle_window + 30s)` (D-04)
  - **Run 2 (validate):** force-trigger again at the proposed defaults. Deploy gate is BOTH:
    1. `runEval()` accuracy at 5km / 20km / 100km stays within **±3pp absolute** of the `events:llm-eval-baseline:v3` Phase-29 anchor (D-05).
    2. Watchdog hard-kill count for Run 2 ≤ Run 1's count.
  - **Run 3 (bisection fallback, only if Run 2 fails the gate):** step concurrency by half the Run-1→Run-2 delta in whichever direction the deploy-gate-failure suggests, validate again. If Run 3 also fails, escalate to a CHECKPOINT and revisit assumptions before committing. No silent grid-sweep without operator review.
  - **Committed defaults shape:** new numbers land as the `.env.example` defaults AND as the hard-coded constants the env vars fall back to. Old values + new values are quoted side-by-side in the commit message AND in the `<expand_at_36>` block in ADR-0010.

- **D-03: Eval regression tolerance = ±3pp absolute at any of {5km, 20km, 100km}, anchored to `events:llm-eval-baseline:v3` written by Phase 29.** Tighter than the typical ±5pp (matches the 5pp "absolute uplift" pattern from Phase 27.4.2 D-25 but as a regression budget, not an uplift target). The baseline key has a 90d TTL, so it's still live when Phase 30 runs (Phase 29 ship date 2026-05-12). If `runEval()` resolver-only scores drop > 3pp at any of the three distances, Run 2 fails the deploy gate and Run 3 (bisection) kicks in. Adversarial eval (`events:llm-eval-adversarial:v3`) is observed but not gated on — Phase 30 is throttle tuning, not robustness tuning.

### SIMPLIFY-01: Incremental Flush Retirement

- **D-04: Single-pass deletion of `mergeAndPersistLlmEntities` from the `onBatchComplete` hot path; delete `LLM_FLUSH_EVERY_N_BATCHES` env var; keep the helper for the single end-of-run write.**
  - `server/lib/llmExtractionPipeline.ts:334-405` — the `onBatchComplete` callback that calls `mergeAndPersistLlmEntities` every N batches → deleted; the callback shrinks to just the existing `writePartialCache` observability write (which Phase 34 / SIMPLIFY-02 retires separately).
  - `server/lib/llmExtractionPipeline.ts:477` — the single end-of-run `mergeAndPersistLlmEntities` call stays; this is the canonical terminal write.
  - `server/lib/llmExtractionPipeline.ts:101-104` — `FLUSH_EVERY_N_BATCHES_DEFAULT = 10` constant + the `env.LLM_FLUSH_EVERY_N_BATCHES` parser → both deleted.
  - `.env.example` — `LLM_FLUSH_EVERY_N_BATCHES` block (currently lines ~137-141) → deleted with its commentary.
  - `server/config.ts` — `LLM_FLUSH_EVERY_N_BATCHES` Zod schema entry → deleted (researcher finds the exact field).
  - **Regression coverage:** add a single test `server/__tests__/llm-extraction-pipeline.test.ts` (or extend the closest existing test) asserting that `mergeAndPersistLlmEntities` is called exactly **once** per `runRefreshExtraction()` invocation. Without this guard a future refactor could silently re-introduce the incremental flush.
  - **Audit signal:** the commit message includes the pre/post Redis SET-call count for `events:llm:v3` per cron run, captured from Run 2's analyzer output (D-01). Success Criterion #5 phrasing "Redis SET-call count per cron run drops measurably (capture the delta)" needs a concrete number — the commit message is its home.

### SIMPLIFY-03: Watchdog Soft-Warn Elimination

- **D-05: Eliminate the soft-warn tier entirely from `withBatchWatchdog`.**
  - `server/lib/llmExtractorWatchdog.ts:34-40, 55, 97-109, 135` — remove `softWarnMs` + `onSoftWarn` from `WithBatchWatchdogOpts`, delete the `softWarnTimer` + its clear path, delete the soft-warn log statement.
  - `server/lib/llmEventExtractor.v3.ts:632-633, 955-956` — drop the `softWarnMs: 60_000` argument from both `withBatchWatchdog` callers.
  - Any `skipReason: 'soft_warn_*'` enum value in callHistory schema (if present) → removed.
  - Hard-kill (the `LLM_BATCH_TIMEOUT_MS` env var, currently default `90_000`) stays as the single watchdog tier, with its **default bumped per D-02 Run-2 proposal** (likely from 90s to `~2 × measured_batch_latency_p95`, somewhere in the 120-180s range). The env var name stays for operator override.
  - **Rationale for elimination (not relaxation):** on the Pro 800s ceiling, a 60s soft-warn at p50 batch latency ~27s is mostly noise; the historical signal it carried — "Cerebras is running slow under high traffic" — is gone with Cerebras (Phase 29 D-01). Soft-warn telemetry is now derivable post-run from the analyzer's latency histogram (D-01) without an in-flight log path. Aligns with the SIMPLIFY-\* philosophy of retiring Hobby-era tiers rather than relaxing them.

### Documentation Home

- **D-06: New file `docs/architecture/llm-pipeline-reliability.md` is the single home for throttle findings + tuned defaults + Phase 31 observations.**
  - Sits under the existing 10-file architecture docset (`docs/architecture/`).
  - Phase 30 writes the initial content: throttle window / RPM ceiling / recovery interval table (from D-01 analyzer output), tuned-defaults block, retired-mechanisms block (SIMPLIFY-01 + SIMPLIFY-03 with rationale).
  - Phase 31 appends a "7-day Watch (LLM-RELI-06)" section with daily observations.
  - ADR-0010 (`docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md`) references this file for the numbers; the ADR captures the _decision_, the reliability doc captures the _measurement_.
  - CLAUDE.md gets **one** new line under "LLM Event Pipeline" pointing to `docs/architecture/llm-pipeline-reliability.md`. No reliability prose lands in CLAUDE.md itself — preserves Phase 29 D-06's "current-state invariants only" shape and the 5018-token budget.

### Cross-Decision Constraints

- **D-07: Tuned defaults stay env-tunable.** New `LLM_V3_CONCURRENCY` / `LLM_BATCH_SIZE` / `LLM_BATCH_TIMEOUT_MS` defaults are the hard-coded fall-throughs; the env vars survive so an operator can override mid-incident if Phase 31's 7-day watch flags drift. `LLM_BATCH_SIZE` is **newly introduced** as an env var (currently the `BATCH_SIZE = 2` constant in `server/lib/llmEventExtractor.v3.ts:83` is hard-coded; Phase 30 promotes it to env-tunable per LLM-RELI-03's wording). Rollback recipe captured in the commit message: `LLM_V3_CONCURRENCY=12 LLM_BATCH_SIZE=2 LLM_BATCH_TIMEOUT_MS=90000` reverts to v1.4 behavior modulo the soft-warn deletion (which is code-only and requires a `git revert`).

- **D-08: One run = one commit. Atomic per-decision commit discipline carries forward from Phase 29.**
  - Commit 1: `feat(30): add retryAfterMs + scripts/analyze-llm-run.ts (D-01)`
  - Commit 2: `feat(30): characterize NIM throttle on Pro 800s ceiling (Run 1) (D-02)` — adds analyzer output as a checked-in JSON snapshot under `.planning/phases/30-.../run-1-throttle-snapshot.json`
  - Commit 3: `feat(30): retire incremental flush mechanism (SIMPLIFY-01 / D-04)`
  - Commit 4: `feat(30): eliminate watchdog soft-warn tier (SIMPLIFY-03 / D-05)`
  - Commit 5: `feat(30): tune LLM_V3_CONCURRENCY / LLM_BATCH_SIZE / backoff against measured throttle (D-02 / LLM-RELI-03 / LLM-RELI-04)`
  - Commit 6: `feat(30): validate tuned defaults (Run 2) + commit numbers (D-02)`
  - Commit 7: `docs(30): write docs/architecture/llm-pipeline-reliability.md + ADR-0010 append (D-06)`
  - Commits 4 and 5 may swap order if Run-1 data argues for retiring soft-warn before re-tuning the hard-kill.

### Claude's Discretion

- The exact path/name of the analyzer script — `scripts/analyze-llm-run.ts` is the recommendation, but follow the existing `scripts/` conventions (`scripts/refresh-water-facilities.ts`, `scripts/eval-replay.ts`).
- The exact shape of the `retryAfterMs` field on the callHistory row (optional `number | null`, in what units — milliseconds matches the existing `latencyMs` convention).
- Whether the SIMPLIFY-01 regression test (D-04) extends an existing test file or creates a new one — researcher checks `server/__tests__/` for the closest analog.
- Whether `LLM_BATCH_SIZE` env var introduction (D-07) lands in the same commit as the value change or in its own promotion commit — planner decides based on commit-narrative clarity.
- The exact wording of the CLAUDE.md one-liner pointer to `docs/architecture/llm-pipeline-reliability.md` — match the style of any other architecture-doc pointers already in CLAUDE.md (or add the first one).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.5 Milestone + Phase 30 Boundary

- `.planning/PROJECT.md` — v1.5 milestone vision, three tracks, out-of-scope list
- `.planning/REQUIREMENTS.md` — 43 v1.5 requirements; LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03 are Phase 30's
- `.planning/ROADMAP.md` §"Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications" — full phase scope, success criteria 1-6, depends-on chain
- `.planning/STATE.md` — current milestone position (Phase 29 shipped 2026-05-12)
- `CLAUDE.md` — current 5018-token shape (Phase 29 D-06 trim); the source-of-truth for current invariants the tuned defaults amend
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — Phase 29 decisions D-01 through D-11; Phase 30 inherits D-01 (cascade narrowing), D-02 (v1/v2 deletion), D-08 (Pro upgrade) as locked

### LLM Pipeline (current state, Phase 29 post-narrowing)

- `server/lib/freeClaudeRouter.ts` — the actual NIM + OpenRouter call surface. Lines 65 (`BACKOFF_MS = [1000, 4000]`), 233-238 (jitter), 402-490 (retry loop, callHistory writes) are Phase 30's tuning targets. D-01 adds `retryAfterMs` to the callHistory schema here.
- `server/adapters/llm-provider.ts` — thin compatibility shim post-Phase-29 (50 LOC). Phase 30 changes here are minimal — most tuning happens in the router.
- `server/lib/llmEventExtractor.v3.ts` — the active extractor. Lines 80-83 (`BATCH_SIZE = 2` constant, promoted to env-tunable per D-07), 532-635 (batch loop with `withBatchWatchdog`), 632-633 + 955-956 (soft-warn arguments deleted by D-05). Lines 388-423 + 868-873 (partial cache writes — separate concern, owned by SIMPLIFY-02 in Phase 34).
- `server/lib/llmExtractionPipeline.ts` — `runRefreshExtraction()`, the cron-only writer. Lines 70 (`PARTIAL_KEY_ACTIVE`), 84-103 (`BATCH_SIZE_ACTIVE`, `FLUSH_EVERY_N_BATCHES_DEFAULT` — deleted by D-04), 130-160 (`mergeAndPersistLlmEntities`), 322-405 (`onBatchComplete` callback — incremental flush deleted by D-04), 477 (terminal write, stays). The single end-of-run write is the canonical shape post-D-04.
- `server/lib/llmExtractorWatchdog.ts` — `withBatchWatchdog`. Lines 34-55 + 97-109 + 135 are D-05's deletion targets (`softWarnMs`, `onSoftWarn`, `softWarnTimer`).
- `server/lib/llmProgress.ts` — `LLMRunSummary` shape consumed by the analyzer (D-01). The analyzer reads `events:llm-summary:v3` written here.
- `server/routes/events.ts:701-731` — Pitfall 1 cache bridge (the "map never goes blank" guarantee). MUST NOT REGRESS in any commit.
- `server/routes/refresh-events-cron.ts` — the only caller of `runRefreshExtraction`; the force-trigger entry point used by D-02 runs.
- `server/lib/llmEvalHarness.ts` — `runEval()` resolver-only against `.planning/eval/ground-truth-events.json`. D-03 deploy gate reads from here.
- `server/config.ts` — `parseEnv()` Zod schema. D-04 deletes `LLM_FLUSH_EVERY_N_BATCHES`; D-07 adds `LLM_BATCH_SIZE` if not already there.

### Vercel Project Config (post-Phase-29)

- `vercel.json` — `functions["api/vercel-entry.js"].maxDuration: 800` (Pro ceiling). The number Phase 30 tunes against.
- `https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing` — Pro plan confirmation surface (operator action already complete per Phase 29 D-08).

### Observability Keys (Redis)

- `events:llm-summary:v3` — last-run summary metadata read by `scripts/analyze-llm-run.ts` (D-01)
- `events:llm-eval-baseline:v3` — Phase-29 eval anchor; 90d TTL. D-03 deploy gate compares Run-2 scores to this.
- `events:llm-eval-adversarial:v3` — observed but not gated.
- `events:llm:v3` — terminal extractor cache; SET-call count delta captured by D-04 commit message.
- `events:llm-dlq` — observed for any 30-watchdog DLQ entries during Run 1 / Run 2.

### Eval Surface

- `.planning/eval/ground-truth-events.json` — 50 curated events, 11 countries; D-03 deploy gate scores against this at 5/20/100km.
- `.planning/eval/adversarial-injections.json` — observed not gated.
- `scripts/eval-replay.ts` — resolver-only replay (~50s cold, instant warm, zero token spend). Reuse instead of duplicating extraction runs.

### Documentation Surface

- `docs/architecture/` — existing 10-file architecture docset. D-06 lands `llm-pipeline-reliability.md` here.
- `docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md` — Phase 29 stub with `<expand_at_36>` marker. Phase 30 appends its numbers + rationale to that section.
- `docs/adr/template.md` — ADR template (Status / Context / Decision / Consequences). For reference; D-06 doesn't write a new ADR.
- `docs/degradation.md` — "map never goes blank" Pitfall 1 contract. Read-only for Phase 30; no edits.
- `CLAUDE.md` — current shape; D-06 adds one pointer line, otherwise no edits.

### Phase 28.2.6 Lineage (the workaround being retired)

- `.planning/phases/28.2.6-fix-vercel-cron-architecture/` — Phase 28.2.6 CONTEXT.md + SUMMARY for the incremental-flush mechanism's history. D-04 commit message should cite the Phase 28.2.6 Plan-01 origin of `mergeAndPersistLlmEntities` so the retire-and-replace narrative is traceable.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`callHistory` per-attempt instrumentation** in `server/lib/freeClaudeRouter.ts:24-...` already records `{provider, latencyMs, status, bucket, attempt, ...}`. D-01 only adds one optional `retryAfterMs` field. No new Redis writes, no new observability surface.
- **`scripts/eval-replay.ts` runner pattern** (Phase 27.4.2 Plan 06) — `node --env-file-if-exists=.env --import tsx/esm scripts/eval-replay.ts`. D-01's `scripts/analyze-llm-run.ts` mirrors this shape exactly. Cost: zero token spend (reads Redis only).
- **`runEval()` resolver-only** in `server/lib/llmEvalHarness.ts` — Phase 27.4.2 D-12 established this as the inner-loop ergonomic. D-03 deploy gate uses it without burning extraction tokens.
- **`withBatchWatchdog` AbortController + generation counter** in `server/lib/llmExtractorWatchdog.ts` — survives D-05 simplification (only the soft-warn tier is deleted; hard-kill stays).
- **Force-trigger ergonomic** — `GET /api/cron/refresh-events?force=true` with `CRON_SECRET` Bearer (Phase 28.2.6 lineage). The D-02 runs use this entry point; no new endpoint required.

### Established Patterns

- **Atomic-per-decision commits** (Phase 29 D-N convention) — D-08 above formalizes the Phase 30 commit plan.
- **`logger.child({ module: '...' })` for structured logs** (Phase 28.1 W7) — D-01 analyzer script logs through this. No `console.*`.
- **Env-var override pattern with hard-coded fallback** (Phase 28.1+ env vars block in CLAUDE.md) — `LLM_V3_CONCURRENCY` / `LLM_BATCH_SIZE` / `LLM_BATCH_TIMEOUT_MS` all follow this. New defaults land in `.env.example` AND as the constant the env var falls back to.
- **`.env.example` change discipline** — D-04 deletion of `LLM_FLUSH_EVERY_N_BATCHES` block also removes its commentary; nothing left behind.
- **TypeScript pinned to ~5.9.3** (CLAUDE.md convention) — D-04 / D-05 / D-07 / D-01 all stay on the pinned version.

### Integration Points

- `server/lib/freeClaudeRouter.ts` — D-01 (`retryAfterMs`) + D-02 (BACKOFF_MS / JITTER_MS / RETRY_ATTEMPTS tuning) land here.
- `server/lib/llmEventExtractor.v3.ts` — D-05 soft-warn argument deletion (2 sites) + D-07 promote `BATCH_SIZE` constant to env-tunable.
- `server/lib/llmExtractionPipeline.ts` — D-04 incremental-flush deletion (constant + parser + `onBatchComplete` call sites).
- `server/lib/llmExtractorWatchdog.ts` — D-05 soft-warn tier deletion (type + timer + log statement).
- `server/config.ts` — D-04 deletes `LLM_FLUSH_EVERY_N_BATCHES` Zod schema entry; D-07 adds `LLM_BATCH_SIZE` if absent.
- `.env.example` — D-04 deletes one block; D-07 adds (or updates) the `LLM_BATCH_SIZE` block.
- `scripts/analyze-llm-run.ts` — D-01 new file.
- `docs/architecture/llm-pipeline-reliability.md` — D-06 new file.
- `docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md` — D-06 appends to the existing stub's `<expand_at_36>` section.
- `CLAUDE.md` — one new pointer line under "LLM Event Pipeline"; otherwise read-only.
- `server/__tests__/` — D-04 regression test (extends an existing extraction-pipeline test if one exists, else new file).

</code_context>

<specifics>
## Specific Ideas

- **The Phase 30 runs ARE the data.** Two operator-facing cron triggers (`/api/cron/refresh-events?force=true`) is the entire characterization budget — not a multi-run sweep. The plan's success depends on a clean Run 1 capture, not on aggressive iteration.
- **Run-1 snapshot is committed.** The analyzer output from Run 1 lands as a JSON file at `.planning/phases/30-.../run-1-throttle-snapshot.json` so Phase 31's 7-day watch can re-derive the same metrics from the same raw data and detect drift without ambiguity.
- **NIM rate-limit contract assumed:** NIM is documented at 40 req/min free, no daily token cap. `Retry-After` header is assumed to come on 429s per OpenAI-compatible API conventions; if Run 1 reveals NIM omits the header, D-01 falls back to inferred recovery gap (the analyzer script handles both code paths).
- **Operator awareness — Run timing.** Schedule Run 1 + Run 2 during operator-watchful hours (not overnight) since a watchdog hard-kill or a stuck cron is faster to diagnose live than from logs alone. The daily 04:00 UTC cron continues to fire on its schedule independently; the force-triggers are separate invocations.
- **Backoff constant naming.** Current `BACKOFF_MS = [1000, 4000]` array form encodes per-attempt base; if D-02 lands `RETRY_ATTEMPTS = 3`, the array grows to 3 elements. Keep the constant name (operators know it); rename to `BACKOFF_BASE_MS` only if RESEARCH or PLAN reveals an ambiguity.
- **"LLM_BATCH_SIZE" introduction nuance.** The variable name appears in REQUIREMENTS.md (LLM-RELI-03) as the canonical knob name. Currently `BATCH_SIZE` is a `const` in `server/lib/llmEventExtractor.v3.ts:83`. D-07 promotes it to env-tunable under the LLM-RELI-03 name verbatim; no rename of the in-code identifier required if the env var maps to it cleanly.

</specifics>

<deferred>
## Deferred Ideas

- **Provider-expansion or v4 router** — explicitly out of v1.5 (`PROJECT.md`). Phase 30 tunes the existing two-provider chain; it does not add a third.
- **Per-batch adaptive sizing** — `V3_ADAPTIVE_BATCH=true` already exists as an opt-in flag (Phase 27.4.4 D-04). Phase 30 does NOT enable it by default. If Run 1 / Run 2 data argues for it, defer the flip to Phase 31 or a hotfix; out of scope here.
- **`events:llm:v3:partial` retirement** — owned by SIMPLIFY-02 in Phase 34. D-04 deletes only the incremental-flush mechanism (SIMPLIFY-01); the partial-key observability writes stay in this phase.
- **`freeClaudeRouter.ts` orphan caller audit** — owned by SIMPLIFY-05 in Phase 34.
- **CLAUDE.md "LLM Pipeline Reliability" subsection** — D-06 rejected this in favor of a dedicated `docs/architecture/` file. If Phase 31's 7-day watch reveals operators want the numbers in CLAUDE.md, revisit then; not now.
- **Lineage-hash pre-filter (`V3_LINEAGE_PREFILTER`)** — separate Phase 27.4.4 opt-in. Out of scope.
- **Adversarial eval gating** — D-03 observes adversarial scores without gating on them. If Phase 30 tuning destabilizes adversarial robustness, capture it as a Phase 33 input (actor catalog work).
- **Bundle-size delta from SIMPLIFY-01 + SIMPLIFY-03** — Phase 34 SIMPLIFY-07 captures the cumulative v1.5 bundle delta. Phase 30 commits inform that measurement but do not measure it themselves.

</deferred>

---

_Phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim_
_Context gathered: 2026-05-16_
