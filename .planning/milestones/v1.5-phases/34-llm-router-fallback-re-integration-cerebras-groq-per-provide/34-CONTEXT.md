# Phase 34: LLM Router Fallback Re-integration (Cerebras / Groq + Per-Provider Eval) — Context

**Gathered:** 2026-05-23
**Status:** Ready for planning
**Mode:** `gsd-discuss-phase 34 --auto` (Claude auto-selected the recommended option at every gray area; the discussion log lists alternatives considered.)

<domain>
## Phase Boundary

Restore a multi-provider fallback cascade in `server/lib/freeClaudeRouter.ts` for the v3 LLM extractor by re-introducing **Cerebras** and **Groq** free-tier adapters (deleted in Phase 29 SIMPLIFY-04). The introduction is **probe-driven** — a re-runnable script measures each provider's free-tier rate-limit behavior against the active extractor payload shape, and only providers that pass the gate land in the cascade. If both probes fail, the phase closes with `cerebras-groq-deferred` status (matching Phase 30.1's `nim-only` precedent — the empirical "free-tier throttle correlated with NIM" finding is itself a load-bearing outcome). Add per-provider eval scoring so any restored provider silently producing worse extractions surfaces in `/api/events/llm-status` + API Health dashboard.

**Trigger:** Phase 31 Day-1 natural cron PASS captured **4 × `v3:timeout_watchdog`** DLQ entries on a single run (~8 events lost enrichment). NIM throttle events still translate into DLQ entries because the cascade is single-provider after Phase 30.1's `nim-only` decision. The Phase 27.4.4 deletion of Cerebras+Groq + Phase 30.1's measurement of OpenRouter free-tier at 90% rate-limited has left NIM with no fallback. Phase 34 widens the cascade with two new candidates — probe-validated, not assumed.

**Requirements covered (this phase):** LLM-RELI-08, LLM-RELI-09, LLM-RELI-10, LLM-RELI-11.

**Out of scope (deferred elsewhere):**

- **OpenRouter re-litigation.** Phase 30.1 closed with `decision: 'nim-only'` (27/30 = 90% rate-limited on `meta-llama/llama-3.3-70b-instruct:free`). Phase 34 does NOT re-probe OpenRouter; `skipOpenRouter: true` at `server/lib/llmEventExtractor.v3.ts:673, 996` stays in place. Re-probing OR is a separate decimal phase, gated on operator decision.
- **NIM retuning.** Phase 30 D-02 (`RETRY_ATTEMPTS=3`, `BACKOFF_MS=[2000, 8000, 32000]`, `JITTER_MS=500`) and D-01 (Path-A `retryAfterMs` capture) stay in place. Phase 34 widens the cascade, it does not change NIM behavior.
- **Adaptive Retry-After-aware NIM limiter.** Promote from Phase 31 to its own decimal phase only if Phase 34's restored cascade still shows DLQ drift after Day-N watch. Out of scope here.
- **Dashboard surface for cascade-degraded state beyond per-provider eval.** Phase 34's UI surface is bounded to the per-provider eval block; a broader degraded-cascade telemetry surface is its own dashboard phase candidate (overlaps Phase 35 Redis registry work).
- **Phase 35's Redis registry verification** of new `llm:tokens:cerebras:*` / `llm:tokens:groq:*` keys runs after this phase closes — registry sweep is Phase 35's deliverable, not Phase 34's.
- **v4 multi-provider router** explicitly out of scope for v1.5 (`.planning/PROJECT.md`). No new provider-routing abstraction layer.

**Carrying forward (locked, not re-decided here):**

- **Vercel Pro 800s `maxDuration`** is live (Phase 29 D-08); the validation cron targets this ceiling, not 300s.
- **TypeScript ~5.9.3 pinned.** `logger.child({ module: '...' })` for any new code, never `console.*`.
- **Phase 30 D-02 retry/backoff envelope** governs ALL providers in the cascade identically: 3 attempts × `[2000, 8000, 32000]` ms with ±500 ms jitter. Cerebras + Groq attach to the same envelope by going through `callLLM`'s existing retry loop.
- **Phase 30 D-03 eval regression tolerance** = ±3pp absolute at any of {5 km, 20 km, 100 km} vs `events:llm-eval-baseline:v3`. Per-provider scores hold to the same gate.
- **Phase 27.4.4 D-01 NIM bake-off winner** (`qwen/qwen3.5-397b-a17b`) stays the v3 primary. Cerebras + Groq are added as secondaries, NOT as primary candidates. No new bake-off; per-provider eval is the quality lever.
- **Pitfall 1 cache bridge is invariant** (ADR-0010). When `events:llm:v3` is empty for any reason — including all providers failing — `server/routes/events.ts` serves raw GDELT. "Map never goes blank" contract is untouched.
- **Cron-only writer (anti-pattern #17).** `/api/events` is cache-only. The validation cron and all new provider code runs inside `runRefreshExtraction()` via the existing daily 4 am UTC cron + Bearer-gated `?force=true` entry. No new cron entries (Hobby-cap discipline preserved even on Pro).
- **`events:llm:v3` is the only terminal cache key.** `events:llm:v3:partial` stays observability-only (Phase 28.2.7); per-provider eval writes go to existing `events:llm-summary:v3` block, not a new terminal key.
- **Branch-per-phase convention.** `feature/34-router-fallback-reintegration` cut from `main` after the Phase 33 merge commit (`fb90388`); CONTEXT.md and DISCUSSION-LOG.md may sit on `main` as scaffold work — nothing else does.

</domain>

<decisions>
## Implementation Decisions

### Probe Scope, Threshold, Shape

- **D-01: Probe-driven per-provider gate.** Re-test Cerebras + Groq free-tier rate-limit behavior FIRST via `scripts/probe-cerebras-groq.ts`. Each provider's measured `rateLimitedPct` independently determines whether the provider is added to the cascade or deferred. This is the integration gate, locked here per LLM-RELI-08 ("final threshold locked during `gsd-discuss-phase 34`").

- **D-02: Three-bucket viability scheme, applied independently per provider** (mirrors Phase 30.1 D-05 with the same numeric thresholds — empirically the cleanest pass/fail/middle separation observed against a single-tenant free-tier provider):
  - `rateLimitedPct < 50` → **integrate** (provider passes the gate, adapter lands in cascade).
  - `50 ≤ rateLimitedPct < 90` → **middle-bucket defer** (snapshot ships; phase records the per-provider deferral with measured numbers; Phase 35+ revisits if Day-N watch shows DLQ drift).
  - `rateLimitedPct ≥ 90` → **defer** (snapshot ships; phase closes the per-provider question with `cerebras-deferred` / `groq-deferred` rationale text).
  - **If BOTH providers fall into defer/middle-bucket buckets**: phase closes with `cerebras-groq-deferred` status, mirrors Phase 30.1's `nim-only` precedent. The probe artifact IS the deliverable; the empirical "free-tier throttle correlated with NIM" finding satisfies LLM-RELI-09's "honest deferral" branch.

- **D-03: Standalone script at `scripts/probe-cerebras-groq.ts`.** Mirrors `scripts/probe-openrouter.ts` byte-for-byte except: imports both `CEREBRAS_API_KEY` and `GROQ_API_KEY` from `server/config.ts`; runs the probe sequentially per provider (Cerebras first, then Groq, with the same intra-provider 100 ms gap); emits a single combined snapshot at `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/probe-snapshot.json` with shape `{timestamp, byProvider: {cerebras: {n, gapMs, model, results[], summary{rateLimitedCount, rateLimitedPct, decision}}, groq: {...}}}`. Runs via `npm run probe:cerebras-groq` (add the script entry to `package.json`).

- **D-04: Probe sample shape.** N = 30 single-event payloads **per provider**, 100 ms intra-provider gap. Single-event payload matches v3's effective batch shape post Phase 30 tuning. N = 30 gives binomial confidence ±10% across the three viability buckets. Two providers × ~5 min each ≈ 10 min wall-clock total. Use the same minimal `singleEventPayload()` content as `scripts/probe-openrouter.ts` — the test measures rate-limit behavior, NOT extraction quality.

- **D-05: Per-provider model selection.** Cerebras default: `llama3.3-70b` (the original Phase 27.4.x default before deletion; Cerebras retired their qwen variants). Groq default: `llama-3.3-70b-versatile` (current Groq free-tier flagship; replaces the deprecated `llama-3.1-70b-versatile` from pre-deletion code). Both probe AND adapter source the model literal from a single `const` at the top of `freeClaudeRouter.ts` so the probe script imports the same value (mirrors Phase 30.1 D-03 pattern with `OPENROUTER_DEFAULT_MODEL`). If the probe fails on this model, a re-probe against a different provider-catalog model is a within-phase pivot, not a re-scope.

- **D-06: Probe output is byte-stable across re-runs.** Sort `results[]` by `attempt`. Timestamp pinned to ISO-Z. `errorMessage` truncated to 200 chars (mirrors `scripts/probe-openrouter.ts:174`). Capture `retry-after` header only (mirrors `extractRetryAfterMs()` at `scripts/probe-openrouter.ts:125-134`); raw response bodies never serialized. Atomic temp-rename write pattern (`.tmp` → final via `renameSync`) prevents partial writes corrupting the artifact.

### Adapter Restoration

- **D-07: Extend the existing `FreeProvider` union** in `server/lib/freeClaudeRouter.ts:34` from `'nvidia_nim' | 'openrouter'` to `'nvidia_nim' | 'openrouter' | 'cerebras' | 'groq'`. Reuse the **existing widened** `Provider` type in `server/lib/llmCircuitBreaker.ts:18` (already `'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter'`) — no breaker-type widening needed, the type was preserved across Phase 29 for exactly this reason. Re-use the **existing widened** `callHistory.provider` literal at `server/lib/llmProgress.ts:86, 337` and `RatingLimitState` shapes at `:199, 357` — they already enumerate all four providers.

- **D-08: Adapter slot pattern mirrors NIM + OpenRouter exactly.** For each restored provider:
  1. New `const CEREBRAS_BASE = 'https://api.cerebras.ai/v1'` / `const GROQ_BASE = 'https://api.groq.com/openai/v1'` near `NVIDIA_NIM_BASE` (line 61).
  2. New `getCerebrasClient()` / `getGroqClient()` lazy init functions mirroring `getNvidiaNimClient()` (lines 208-224). All four clients use the OpenAI SDK against provider-specific `baseURL`s.
  3. Provider entry in the `allProviders` array at `freeClaudeRouter.ts:349-360`, ordered per D-09.
  4. **Per-provider rate-limit window or daily-cap**, mirroring the existing `nvidiaNimWindow` (40 req/min) and `OPENROUTER_DAILY_CAP` (200/day). Probe-measured ceilings populate the constants (final numbers locked when the probe lands; CONTEXT.md does not lock pre-empirical values).
  5. Pre-check gates at the existing `freeClaudeRouter.ts:382-417` pattern (`!p.client` → `buildReason('no_client')`; `!isAvailable(p.name as Provider)` → `buildReason('breaker')`; per-provider rate-limit pre-check → `buildReason('rate_limit_window')` or `buildReason('daily_cap')`).
  6. On success path, `record(p.name as Provider, 'ok')` and `lastNimCallTs`-style state update if the provider needs cold-start tracking (Cerebras + Groq do NOT need pre-warm per `prewarmIfCold()` — that's NIM-specific to the 60s idle window; new providers route through `nvidiaNimWindow`'s NIM-only check).

- **D-09: Cascade ordering** = NIM (primary) → secondary-ordered-by-probe-latency-p50 ascending → existing OpenRouter slot (dormant via `skipOpenRouter: true`). Faster passers go earlier so the cascade burns less retry budget before settling. Ordering decision is committed in the adapter PR's commit body with the latency p50 numbers from the probe snapshot — auditable forever, mechanically derived.

- **D-10: Per-provider Redis token-budget keys** = `llm:tokens:cerebras:YYYY-MM-DD` + `llm:tokens:groq:YYYY-MM-DD` (TTL 48h, mirrors the existing `llm:tokens:openrouter:YYYY-MM-DD` pattern at `freeClaudeRouter.ts:289-295`). The CLAUDE.md "Serverless Cache" registry gains two new entries describing them. Phase 35's Redis registry sweep (REDIS-OPT-01..04) will catalog these as load-bearing.

- **D-11: Per-provider circuit-breaker state** is automatic — `llmCircuitBreaker.ts:31-32` already initialize `cerebras` and `groq` slots. Phase 34 inherits them as-is. No breaker-config changes (the existing 30% error rate over 10-call window with 5-min pause is the load-bearing default).

- **D-12: `callHistory.provider` attribution.** Every batch attempt's `callHistory` row carries the provider name (existing behavior — see `freeClaudeRouter.ts:520`). Phase 34's "provider attribution unambiguous on every batch" requirement (LLM-RELI-09 success criteria) is satisfied by the existing instrumentation; no new code. The validation cron's `events:llm-summary:v3.callHistory` is the operator-readable artifact.

### `cascade_exhausted` DLQ Reason Bucket

- **D-13: New union member `'v3:cascade_exhausted'`** added to `DLQEntry.reason` in `server/lib/llmDLQ.ts:27-37`. Written when `callLLM` returns `{content: null, routing: decisions}` after exhausting ALL providers in the cascade. Distinguished from `'v3:timeout_watchdog'` (single-batch watchdog kill at 90s soft / 120s hard) and `'v3:rate_limit_exhaust'` (per-call retry budget burned, but cascade may have succeeded on a fall-through). The wrapper site is in `llmEventExtractor.v3.ts` at the existing "callLLM returned null" handler (search for the null-content branch — the v2 extractor's pattern is the template).

- **D-14: DLQ count delta** = `cascade_exhausted` total at validation cron run vs Phase 31 Day-1's `4 × v3:timeout_watchdog` baseline. Success criteria (LLM-RELI-11): materially lower DLQ count, ideally `0 × cascade_exhausted` AND `0 × v3:timeout_watchdog` in the validation row. A partial reduction (e.g. 1 × cascade_exhausted with 0 × timeout_watchdog) is still a phase win because cascade_exhausted means the cascade tried every provider and they all failed — that's a structural ceiling, not an in-cascade failure.

### Per-Provider Eval Scoring

- **D-15: Provider provenance tagging at extraction time** is the load-bearing primitive. Each `enrichedEventV3` payload in `events:llm:v3` gains an optional `providerProvenance: FreeProvider | null` field (`'nvidia_nim' | 'openrouter' | 'cerebras' | 'groq' | null`). Written by the v3 extractor right where `routingTrace` is currently captured — the last successful provider in the cascade is the provenance. Schema migration handled via the existing v3 cache-version discipline (additive-optional, default `null` for pre-Phase-34 entries — no key bump to `v3.1` needed; Phase 33 D-04..D-07 established this rollout discipline for `actorConfidence`).

- **D-16: Resolver-only eval, grouped by provenance tag.** `server/lib/llmEvalHarness.ts runEval()` reads `events:llm:v3` (already does — line 27 imports `cacheGetSafe` and the harness keys off `LLM_EVENTS_KEY_ACTIVE`). For each ground-truth event match, the harness pulls the cached entry's `providerProvenance` field and increments the matching bucket. **Zero new LLM token spend** — the constraint that has held since Phase 27.4 D-25 is preserved.

- **D-17: `EvalScore.byProvider` shape** added to `EvalScore` interface in `server/lib/llmEvalHarness.ts:136-155`:

  ```typescript
  byProvider: {
    nvidia_nim: {
      within5km: number;
      within20km: number;
      within100km: number;
      total: number;
    }
    openrouter: {
      within5km: number;
      within20km: number;
      within100km: number;
      total: number;
    }
    cerebras: {
      within5km: number;
      within20km: number;
      within100km: number;
      total: number;
    }
    groq: {
      within5km: number;
      within20km: number;
      within100km: number;
      total: number;
    }
  }
  ```

  `total` per provider = count of ground-truth events whose cached `enrichedEventV3` carries that `providerProvenance` value. `total === 0` for a provider with no events extracted yet is acceptable and renders as "n/a" in the dashboard (NOT 0% accuracy — distinguish "no data" from "100% miss").

- **D-18: Mirror `EvalScore.byProvider` into `LLMRunSummary`** at `server/lib/llmProgress.ts:118, 291` (the existing `evalScore?` field), surfaced via `/api/events/llm-status`. The existing summary block schema is the integration point.

- **D-19: API Health dashboard surface.** Add a per-provider eval-score sub-block to the existing `EvalScoreBlock` component (extended in Phase 33-07 for `actorMatchRate`). Pinned test IDs follow Phase 33 D-17 conventions: `eval-score-byprovider-nvidia_nim-within20km`, etc. Provider rows render with a "(no data)" badge when `total === 0`. Reuse the existing color tokens from `src/styles/app.css` `@theme` — no new tokens.

- **D-20: Per-provider eval regression gate** = within ±3pp absolute at any of {5 km, 20 km, 100 km} vs the NIM baseline (`events:llm-eval-baseline:v3`). Provider-level baselines persist alongside the aggregate via the existing `BASELINE_KEY` discipline — see `events:llm-eval-baseline:v3:by-provider:<provider>` (90 d TTL, mirrors the per-model `${BASELINE_KEY}:${sanitized-model-id}` pattern at `llmEvalHarness.ts:78` JSDoc). Triggers `auto-rollback` audit-log line if any provider drops ≥3pp from its own baseline (NOT against the aggregate — providers have different floors).

### Validation Cron Protocol

- **D-21: Live-path validation via force-trigger.** After the adapter restore + per-provider eval land, `GET /api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer. Then `npm run watch:snapshot -- --http` captures the validation row from `events:llm-summary:v3`. Required evidence: (1) `callHistory[].provider` includes at least one row with `cerebras` or `groq` (whichever passed), (2) `routingTrace[].reason` includes at least one `fall_through:nvidia_nim_*` entry, (3) `evalScore.byProvider.{passedProvider}.total >= 1`.

- **D-22: Natural NIM throttle observation preferred over temporary skip flag.** Run the validation cron up to TWO times naturally; if both NIM-paths succeed without any fall-through (cascade never widened in observation), add a temporary `?skipPrimary=nvidia_nim` Bearer-gated query param to the cron endpoint (gated by env check — refuses to honor in prod), force one cron with the skip flag, then remove the flag in the close-out commit. The temporary flag is a witness, not a fixture — it ships in Plan 04 and gets reverted in Plan 05.

- **D-23: Eval regression gate on the validation cron.** Per D-20: per-provider eval within ±3pp of NIM baseline. Standard `npm run eval:replay` ergonomic from Phase 30 applies; zero LLM token spend.

### Plan Decomposition & Commit Discipline

- **D-24: 5 plans / atomic-per-decision commits** (mirrors ROADMAP entry + Phase 30.1 D-17):
  1. **34-01-PLAN.md** — Probe Cerebras + Groq free tiers via `scripts/probe-cerebras-groq.ts`. Output `probe-snapshot.json`. Per-provider pass/fail decision printed. Commit: `feat(34): probe cerebras + groq free-tier rate limits (D-03..D-06)`.
  2. **34-02-PLAN.md** — Adapter restoration. For each passing provider: extend `FreeProvider` union; add provider config; add to cascade builder; independent token-budget Redis key. Atomic per-provider commits if both pass. Commit: `feat(34): re-enable {provider} fallback in v3 cascade (D-07..D-12)` (one commit per restored provider; one commit total if only one passes).
  3. **34-03-PLAN.md** — Per-provider eval instrumentation. Extend `llmEvalHarness.ts` + `LLMRunSummary` + `EvalScoreBlock` UI. Add `providerProvenance` write at extraction time + `evalScore.byProvider` aggregation in `runEval()`. Commit: `feat(34): per-provider eval scoring + dashboard surface (D-15..D-20)`.
  4. **34-04-PLAN.md** — Validation cron run + DLQ reason union extension. Add `'v3:cascade_exhausted'` to DLQ union + extractor wrapper. Force-trigger cron. Snapshot harness captures result row. Commit: `feat(34): cascade_exhausted DLQ reason + validation cron snapshot (D-13, D-21, D-22)`.
  5. **34-05-PLAN.md** — Phase close. SUMMARY.md, ROADMAP / REQUIREMENTS / STATE flips, ADR-0010 sub-block (or new ADR-0011 if scope warrants — planner picks based on whether NIM-only is preserved or providers restored). Commit: `docs(34): phase close — ADR + roadmap flips (D-24)`.

- **D-25: Atomic-per-decision commit discipline within plans.** Each D-N from this CONTEXT.md that touches code lands as a separate commit so `git revert` is surgical (Phase 30 D-08 / Phase 30.1 D-17 / Phase 33 invariant). `feat(34): ...` / `test(34): ...` / `docs(34): ...` prefixes.

- **D-26: Branch discipline.** Planner / executor cuts `feature/34-router-fallback-reintegration` from `main` after Phase 33's merge commit (`fb90388`) — already on `main` at session start. CONTEXT.md + DISCUSSION-LOG.md + the discuss checkpoint may sit on `main` as scaffold; the branch cut happens at the start of Plan 34-01 execution.

### Testing & Validation

- **D-27: Adapter test pattern** mirrors `server/__tests__/lib/freeClaudeRouter.test.ts:262-283` P3 + the Phase 30 D-02 `vi.useFakeTimers()` BACKOFF advance pattern. New positive-case tests per restored provider:
  - "When NIM 429s and breaker trips, cerebras fall_through row appears in routing."
  - "When cerebras daily-cap hit, groq fall_through row appears in routing."
  - "When all providers fail, routingTrace ends with `fall_through:groq_429` (or last-provider equivalent) and content is null."

- **D-28: DLQ union test** in `server/__tests__/lib/llmDLQ.test.ts` (or `freeClaudeRouter.test.ts` — researcher picks based on existing file growth): assert `'v3:cascade_exhausted'` is a valid `DLQEntry.reason` and the extractor wrapper writes it on null content.

- **D-29: Per-provider eval test** in `server/__tests__/lib/llmEvalHarness.test.ts`: seed `events:llm:v3` with a mix of `providerProvenance: 'nvidia_nim'` and `providerProvenance: 'cerebras'` entries, assert `runEval().byProvider.nvidia_nim.total + .cerebras.total === total ground-truth match count`, assert per-provider buckets sum coherently against the aggregate `EvalScore` buckets.

- **D-30: Eval-replay sanity check.** After Plan 34-03, run `npm run eval:replay` against the existing baseline. Per-provider scores should reconcile with aggregate within ±0.5pp drift (tiny because the harness is deterministic; any larger drift indicates an aggregation bug).

### Documentation Amendments

- **D-31: CLAUDE.md amendment is bounded.** Single-line edit to the "Active providers (Phase 29 D-01)" line under "LLM Event Pipeline" section to reflect the restored provider count. New CLAUDE.md "Serverless Cache" registry entries for `llm:tokens:cerebras:YYYY-MM-DD` and `llm:tokens:groq:YYYY-MM-DD` (1 line each, matches existing entry style). NO new phase-history bloat — Phase 29 D-06's CLAUDE.md trim budget is preserved.

- **D-32: ADR-0010 sub-block** appended at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`. New heading `## Phase 34 Sub-block (appended 2026-MM-DD)` after the most recent prior sub-block. Records: per-provider probe percentages, pass/fail decision per provider, restored cascade shape (or `cerebras-groq-deferred` close-out). Mirrors Phase 30.1's sub-block convention. The `<expand_at_36>` block stays Phase 37's responsibility.

- **D-33: `docs/architecture/llm-pipeline-reliability.md` amendment.** New section `## Multi-Provider Cascade (Phase 34, 2026-MM-DD)` between the Phase 30.1 section and the 7-Day Watch section. Content: cascade shape post-restore, per-provider eval scoring approach (D-15..D-20), pointer back to ADR-0010 sub-block. Same belt-and-suspenders text from Phase 30.1 D-08 about the raw-GDELT terminal fallback stays.

### Claude's Discretion

- Whether the per-provider `EvalScoreBlock` UI renders as a horizontal row of compact cards (one card per provider) or a single `<table>` with provider rows — UI-spec phase or planner picks based on existing dashboard density at `DevApiStatus.tsx`. Both options preserve the Phase 33 D-17 testID pinning convention.
- Whether the dashboard's "(no data)" badge for `evalScore.byProvider.{provider}.total === 0` is a literal grey badge, italic text, or a `—` em-dash. Match the existing pattern in nearby blocks.
- Whether the probe-snapshot.json shape uses a top-level `byProvider` map (D-03) or a `results[]` array with `provider` field per entry — D-03 says `byProvider` map; planner can rationalize switching to flat-array if it makes the diff against `30.1-or-pulse-snapshot.json` cleaner. Either shape is byte-stable per D-06.
- Whether the `?skipPrimary` validation flag (D-22) is a temporary query param or a feature flag in Redis with a short TTL. Default is query param (no Redis surface needed); planner can promote to a Redis flag if the validation cron needs more than one run with the flag set.
- Whether `cascade_exhausted` DLQ rows include the full provider-by-provider error taxonomy in `lastError`, or just the final-provider error string. Default is concatenated taxonomy (`nim: rate_limit; cerebras: rate_limit; groq: timeout`); planner can shorten if 500-char cap is at risk.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 34 Source Material

- `.planning/ROADMAP.md` §"Phase 34" (lines 222-237) — Goal, depends-on, requirements, success criteria, plan stubs.
- `.planning/REQUIREMENTS.md` LLM-RELI-08..LLM-RELI-11 (lines 20-23, 140-143) — Per-requirement acceptance text.
- `.planning/PROJECT.md` — Provider-expansion ban, milestone-acceptance gate (3× consecutive `prod-connectivity-audit.yml` exit-0), Vercel Pro upgrade locked, v4 router explicitly rejected.
- `.planning/STATE.md` — Current milestone progress, deferred items registry, Phase 31 close-early caveat.

### Carryover Context (Phase 30.1 — the precedent this phase mirrors)

- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-CONTEXT.md` — Probe-then-restore-or-defer playbook. The bucket thresholds (D-05), probe-shape decisions (D-04), and atomic-commit discipline (D-17) all transfer to Phase 34.
- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-or-pulse-snapshot.json` — Exact JSON shape the Phase 34 probe snapshot must mirror (byte-stable, sorted, ISO-Z timestamp, retry-after capture). The OpenRouter result (90% rate-limited, decision: `nim-only`) is the precedent for the empirical "free-tier throttle correlated with NIM" finding being itself a load-bearing outcome.
- `scripts/probe-openrouter.ts` — **The template script.** Phase 34's `scripts/probe-cerebras-groq.ts` mirrors it directly. Per-attempt error-message truncation (200 chars), atomic temp-rename write, `extractRetryAfterMs()` helper, `classifyOutcome()` substring matcher, sorted `results[]` — all transfer.

### Carryover Context (Phase 30 — tuned defaults stay locked)

- `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-CONTEXT.md` — D-02 retry/backoff envelope (3 × `[2000, 8000, 32000]` ms ± 500 ms jitter), D-03 eval regression tolerance (±3pp), D-08 atomic-per-decision commit discipline. All inherited unchanged.
- `docs/architecture/llm-pipeline-reliability.md` "Tuned Defaults" + "7-Day Watch" sections — Phase 34's new section anchors between Phase 30.1's section and the 7-Day Watch section.

### Carryover Context (Phase 31 — DLQ baseline + snapshot harness)

- `.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md` — Day-1 PASS captured 4 × `v3:timeout_watchdog` DLQ entries. This is the bar Phase 34 must beat (LLM-RELI-11 success criteria).
- `npm run watch:snapshot -- --http` — Snapshot harness from Phase 31. Phase 34's validation cron uses this to capture the post-restore row.

### Carryover Context (Phase 33 — actorConfidence schema invariant)

- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-CONTEXT.md` — `actorConfidence` rollout discipline (additive-optional, no key bump). Phase 34's `providerProvenance` field follows the same discipline at the same Zod schema.
- `server/lib/llmSchema.ts` `enrichedEventV3` — The cached entry shape. Phase 34 adds `providerProvenance?: FreeProvider | null` as an additive-optional field; existing entries default to `null`.

### Code Touchpoints (mandatory reads)

- `server/lib/freeClaudeRouter.ts` lines 34-46 — `FreeProvider` union + `RoutingDecision` shape. D-07 widens the union.
- `server/lib/freeClaudeRouter.ts` lines 61-63 — Provider base URLs. D-08 adds Cerebras + Groq bases here.
- `server/lib/freeClaudeRouter.ts` lines 99-101 — `RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS` constants. NOT touched in Phase 34 (Phase 30 D-02 invariant).
- `server/lib/freeClaudeRouter.ts` lines 128-132 — OpenRouter model + daily cap. D-05 adds Cerebras + Groq models here in the same style.
- `server/lib/freeClaudeRouter.ts` lines 160-187 — `RollingWindow` class. Cerebras + Groq either get their own `RollingWindow` instances or daily counters; D-08 picks based on probe-measured ceiling shape.
- `server/lib/freeClaudeRouter.ts` lines 208-224 — Lazy client init pattern. D-08 mirrors for Cerebras + Groq.
- `server/lib/freeClaudeRouter.ts` lines 280-306 — `todayKey()` + `incrOpenRouterDaily()` + `getOpenRouterDaily()`. D-10 adds Cerebras + Groq counterparts.
- `server/lib/freeClaudeRouter.ts` lines 328-565 — `callLLM` cascade builder. D-08 adds provider entries to `allProviders[]`, D-09 orders them, the existing retry / fall-through / breaker / rate-limit-window logic absorbs the new providers without code change.
- `server/lib/llmEventExtractor.v3.ts` lines 617-624 + 925-931 — `skipOpenRouter: true` call sites from Phase 30.1. **NOT touched in Phase 34.**
- `server/lib/llmEventExtractor.v3.ts` (search for "callLLM returned null" handler) — D-13 wraps this branch to write `'v3:cascade_exhausted'` DLQ rows.
- `server/lib/llmCircuitBreaker.ts` lines 18, 31-32 — Already-widened `Provider` type + initial state for `cerebras` + `groq`. **No edit needed** in Phase 34; D-11 inherits.
- `server/lib/llmTokenBudget.ts` lines 31-46 — `DAILY_LIMITS` already includes Cerebras + Groq slots. D-10's Redis key writes go through this module.
- `server/lib/llmProgress.ts` lines 86, 102, 199, 285, 337, 357 — Provider literals + `tokenCounters` shape already widened. **No edit needed** in Phase 34; D-12 inherits.
- `server/lib/llmEvalHarness.ts` lines 136-155 — `EvalScore` interface. D-17 adds `byProvider` field here.
- `server/lib/llmEvalHarness.ts` lines 279-401 — `runEval()` body. D-16 + D-17 extend the aggregation loop to bucket per-provider via `providerProvenance` lookup on each cached entry.
- `server/lib/llmDLQ.ts` lines 22-40 — `DLQEntry.reason` union. D-13 extends.
- `server/config.ts` lines 31-32 + 217-218 + 241-246 — `CEREBRAS_API_KEY` + `GROQ_API_KEY` env vars + `AppConfig` slots **already present** (Phase 29 vestige). No new env-var work needed in Phase 34; both keys must be set in Vercel prod env for adapters to function (verify in Plan 34-02 pre-deploy checklist).
- `src/components/dashboard/EvalScoreBlock.tsx` (or wherever Phase 33-07 placed the actor-quality block) — D-19 adds per-provider sub-block here.

### Scripts to Mirror

- `scripts/probe-openrouter.ts` — Direct template for `scripts/probe-cerebras-groq.ts`.
- `scripts/eval-replay.ts` (Phase 27.4.2 D-26) — `node --env-file=.env.local --import tsx/esm` runner pattern.
- `scripts/refresh-water-facilities.ts` — Atomic tempfile + rename JSON-write pattern.
- `scripts/analyze-llm-run.ts` (Phase 30 D-01) — Validation-cron analyzer; D-21 reuses unchanged.

### Documentation Touchpoints

- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — Phase 30 sub-block (line ~52), Phase 30.1 sub-block (most recent). D-32 appends a Phase 34 sub-block after the most recent prior one.
- `docs/architecture/llm-pipeline-reliability.md` — D-33 amends.
- `docs/degradation.md` — Pitfall 1 / raw-GDELT terminal-fallback contract. Phase 34 references but does NOT modify (contract is invariant).
- `docs/runbook.md` — D-32's ADR sub-block may suggest a new incident-playbook entry for the multi-provider cascade; Phase 36's docs sweep is the proper home for runbook additions — Phase 34 only writes the ADR.
- `CLAUDE.md` "LLM Event Pipeline" + "Serverless Cache" sections — D-31 amends. Single-line + two new Redis key entries.

### Eval & Live-Path Hooks

- `events:llm-eval-baseline:v3` — Aggregate eval baseline (90 d TTL). D-20 references; per-provider sub-keys at `events:llm-eval-baseline:v3:by-provider:<provider>`.
- `events:llm-summary:v3` — `routingTrace`, `callHistory`, `errorTaxonomy` source of truth. D-21 + D-12 evidence reads here.
- `events:llm:v3` — Terminal cache. D-15 writes `providerProvenance` field per entry. D-16 reads it during eval.
- `GET /api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer — Force-trigger entry for the validation cron per D-21.
- `npm run watch:snapshot -- --http` — Snapshot harness; D-21 + D-23 use unchanged from Phase 31.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`freeClaudeRouter.callLLM` cascade machinery** — fully built and tested. Fall-through reasons, per-provider client gating, breaker integration, retry/backoff envelope. Phase 34 only adds provider entries to `allProviders[]` and per-provider rate-limit/daily-cap pre-checks; no new routing code.
- **`server/lib/llmCircuitBreaker.ts:18, 31-32`** — `Provider` type and initial state already include `cerebras` + `groq`. Phase 29 deliberately preserved them ("kept around so the test suite's `cerebras`/`groq` fixtures and `shouldPauseNewEvents` legacy probe continue to compile"). Phase 34 inherits them unchanged.
- **`server/lib/llmTokenBudget.ts:31-46`** — `DAILY_LIMITS` already includes `cerebras: 1_000_000` and `groq: 200_000` slots. The numbers are Phase 27.4.x defaults; planner can re-tune based on probe-measured ceilings, but the integration points are wired.
- **`server/lib/llmProgress.ts:86, 102, 199, 285, 337, 357`** — `callHistory.provider`, `rateLimit`, `errorTaxonomy`, `tokenCounters` shapes ALL already enumerate the four-provider literal. Phase 34 surfaces become trivial — the type already covers them.
- **`scripts/probe-openrouter.ts`** — Direct template. `singleEventPayload()`, `classifyOutcome()`, `extractRetryAfterMs()`, atomic temp-rename write, decision-bucket derivation — all transferrable line-for-line.
- **`server/__tests__/lib/freeClaudeRouter.test.ts`** + `vi.useFakeTimers()` BACKOFF-advance pattern from Phase 30 D-02 — direct template for per-provider fall-through tests (D-27).
- **`EvalScoreBlock` from Phase 33-07** — Compact dashboard block with pinned testIDs and color tokens. D-19's per-provider sub-block extends it; no new UI primitives needed.
- **`logger.child({ module: '...' })` pattern + Pino structured logging** — All new code logs through `logger.child`. No `console.*` per CLAUDE.md.
- **`OPENROUTER_DEFAULT_MODEL` export pattern at `freeClaudeRouter.ts:129`** — Probe script + adapter import the same `const` so a future model swap propagates automatically. D-05 follows the same pattern for `CEREBRAS_DEFAULT_MODEL` + `GROQ_DEFAULT_MODEL`.

### Established Patterns

- **Atomic-per-decision commits** (Phase 30 D-08 / Phase 30.1 D-17 / Phase 33). Each D-N becomes a commit with `feat(34): ...` / `test(34): ...` / `docs(34): ...` prefix and a body that names the decision number.
- **`CEREBRAS_API_KEY` + `GROQ_API_KEY` env vars** — already validated by `parseEnv()` in `server/config.ts`. Probe script + adapters read the same keys. No env-var work in Phase 34.
- **Additive-optional Zod schema field** (Phase 33 D-04 `actorConfidence` rollout). `providerProvenance?: FreeProvider | null` follows the same discipline — pre-Phase-34 cached entries continue to validate.
- **JSON snapshot artifact under `.planning/phases/<phase>/`** with date stamp + byte-stable schema — Phase 30 D-08 (`run-1-throttle-snapshot.json`) + Phase 30.1 D-06 (`30.1-or-pulse-snapshot.json`) set the convention; Phase 34's `probe-snapshot.json` mirrors.
- **ADR-0010 sub-block append pattern** — Phase 30 + Phase 30.1 each appended a sub-block. Phase 34's sub-block comes after the most recent.
- **Bearer-gated force-trigger of cron** — `/api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer. Production never bypasses Bearer. The temporary `?skipPrimary=nvidia_nim` flag (D-22) inherits the same Bearer gate + env check.

### Integration Points

- **`runRefreshExtraction()` in `server/lib/llmExtractionPipeline.ts`** — The entry point invoked by `/api/cron/refresh-events`. D-21 force-trigger goes through this; no pipeline-level changes for Phase 34.
- **`/api/operator-status` Bearer-gated aggregator** (Phase 28.2 W3) — Surfaces the per-provider eval block via the existing `aggregateHealth.endpoints.llmEvents.quality` envelope; D-19's UI consumes this surface, not a new endpoint.
- **`prod-connectivity-audit.yml` GitHub Action** — Not run by Phase 34. The next scheduled run after the Phase 34 merge will reflect the cascade in `audit:connectivity:last-result`. Phase 37's acceptance gate observes 3× exit-0 runs after Phase 34's restored cascade is live.
- **`vercel.json` `functions.api/vercel-entry.js.maxDuration: 800`** — Already at the Pro ceiling. The widened cascade per-batch wall-clock fits comfortably within the existing envelope.

</code_context>

<specifics>
## Specific Ideas

- **Probe artifact must be byte-stable across re-runs of `scripts/probe-cerebras-groq.ts`** so future operators can diff. Sort `results[]` by `attempt` per provider. Pin `timestamp` to ISO-Z. Round `latencyMs` to integer. Truncate `errorMessage` to 200 chars. Mirrors Phase 30.1 D-06.
- **The validation cron's evidence-of-non-NIM-provider-fired row is the single most operator-readable artifact.** One line of `callHistory[].filter(r => r.provider === 'cerebras' || r.provider === 'groq')` JSON in the commit body of the validation cron commit (Plan 34-04) is sufficient — the planner does not need to invent fancy formatting.
- **The Phase 30.1 D-08 "raw-GDELT terminal fallback" paragraph stays in the reliability doc** even with the restored cascade. The phase exists because operators were burned by silent single-provider assumptions; the explicit text is the cure regardless of cascade shape.
- **Cerebras + Groq env vars already exist in `.env.example` and `parseEnv()`** — no env-var work in Phase 34. Plan 34-02 pre-deploy must verify both keys are populated in Vercel prod env (operator action; documented in PLAN.md UAT block).
- **The `providerProvenance` field is the load-bearing primitive for per-provider eval** — without it, the eval harness has no way to bucket cached entries by provider without re-extracting (which would double LLM token spend). The field is the cheapest, lowest-risk addition that makes per-provider eval real.
- **OpenRouter dormancy is preserved.** `skipOpenRouter: true` at `llmEventExtractor.v3.ts:673, 996` is NOT touched in Phase 34. Anyone re-opening that question opens a new decimal phase. Phase 30.1's measurement (90% rate-limited) is the standing record.

</specifics>

<deferred>
## Deferred Ideas

### Phase 35 Prep (Redis registry sweep)

- **Cerebras + Groq daily-token Redis keys (`llm:tokens:cerebras:*`, `llm:tokens:groq:*`)** need cataloging in Phase 35's Redis key inventory (REDIS-OPT-01). Phase 34 creates the writers + readers + CLAUDE.md registry entries; Phase 35's sweep classifies them as load-bearing in `docs/architecture/redis-keys.md`.
- **`events:llm-eval-baseline:v3:by-provider:<provider>` per-provider baseline keys** also need cataloging in Phase 35.
- **`providerProvenance` field migration of pre-Phase-34 cached entries** — Phase 34 ships additive-optional with `null` default. The first daily cron after deploy back-fills new entries; old entries permanently default to `null` for `byProvider` aggregation. Phase 35 (or a follow-up) can prune pre-Phase-34 entries from `events:llm:v3` if the registry sweep flags them as stale.

### Phase 36 Prep (public docs sweep)

- **README.md provider count line** — currently says "NIM + OpenRouter narrowed cascade." Post-Phase-34 will need to either: (a) say "NIM + Cerebras + Groq fallback cascade" if both restored, or (b) hold the line if both deferred. Phase 36's sweep handles this — not in Phase 34.
- **`docs/architecture/llm-pipeline-reliability.md` Mermaid cascade diagram** — adds Cerebras + Groq nodes to the cascade flowchart in Phase 36.
- **OpenAPI spec mention of new `?skipPrimary` query param** — IF the temporary validation flag (D-22) ships, Phase 36's OpenAPI sweep adds it; otherwise no-op.

### Phase 37 Prep (acceptance gate)

- **3× consecutive `prod-connectivity-audit.yml` exit-0** observation runs against the restored cascade. Phase 37 is the gate-close; Phase 34's restored cascade running stably for 3 consecutive runs is the prerequisite signal.

### Phase-31-or-Later (conditional on Phase 34 outcomes)

- **Adaptive Retry-After-aware NIM limiter.** If Phase 34's restored cascade still shows DLQ drift after Day-N watch, promote to its own decimal phase. Out of scope here.
- **Paid-Cerebras / Paid-Groq conversation.** Only on the 50-90% middle-bucket probe outcome per provider. Decision lives in Phase 35 or a fresh top-level phase.
- **Provider model swap (different Cerebras or Groq model than D-05's default).** Only if D-05's defaults fail probe; within-phase pivot to a different model is allowed. If the swap requires a fresh bake-off, that's its own phase.

### Conditional on Probe Outcome (within Phase 34)

- **Cerebras-only restore** (Groq deferred). Possible per D-02's per-provider gating. Phase closes with `cerebras-restored, groq-deferred` status.
- **Groq-only restore** (Cerebras deferred). Same as above, mirror.
- **Both deferred** (`cerebras-groq-deferred`). Phase closes with the probe snapshot as the deliverable, ADR-0010 sub-block recording the empirical "free-tier throttle correlated with NIM" finding, and no adapter code lands. Plan 34-02 in this branch collapses to a single doc-only commit; Plan 34-03 (per-provider eval) ships anyway because `providerProvenance: 'nvidia_nim'` is still a meaningful single-provider observation that future probe re-runs can extend.

### Reviewed Todos (not folded)

None — no pending todos cross-referenced for this phase per `gsd-sdk query todo.match-phase 34` (PROJECT.md "Pending Todos: None").

</deferred>

---

_Phase: 34-llm-router-fallback-re-integration-cerebras-groq-per-provide_
_Context gathered: 2026-05-23_
_Mode: `--auto` (recommended option auto-selected at every gray area; see 34-DISCUSSION-LOG.md for alternatives considered)_
