# Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a Bearer-gated operator visibility surface for the LLM enrichment pipeline, in three strands:

1. **BUDGET** — `BudgetBlock` in `DevApiStatus.tsx` showing per-provider token usage vs cap (soft 0.8 / hard 0.95 proximity bars) + today's cost-shadow USD accrual, sourced from existing `llm:tokens:{provider}:YYYY-MM-DD` + `events:llm-cost-shadow:v3:{YYYY-MM-DD}`. NIM single-provider today, extensibility-shaped. New `tokenBudget` field on `/api/operator-status` (degrade-open) + a Zod-`.strict()` contract test.
2. **OBS-FLIGHT** — Redis-back the in-memory `callHistory` (`llm:calls:history`, LPUSH+LTRIM 500 / 30d) and add per-run summaries (`llm:runs:history`, 200 / 30d); thread a `runId` through every call in a `runRefreshExtraction`; cold-start hydration from Redis; new Bearer-gated `GET /api/events/llm-history` returning `{runs, calls}`; a `FlightRecorderBlock` run-list → drill-down UI.

**Out of scope (own phases):** broad dashboard tab/subtab reorganization + visual polish (Phase 40); public-reveal polish (Phase 41); cross-run analytics/alerting beyond raw-data surfacing.

**Requirements (10):** BUDGET-01..04, OBS-FLIGHT-01..06. SC39-1..4. (No SPEC.md — requirements are the contract.)

</domain>

<decisions>
## Implementation Decisions

### Discussion outcome — operator delegated the HOW decisions

- **D-01:** The operator reviewed the four identified gray areas and chose **"let research and planning decide for all."** Downstream agents (researcher, planner) OWN these decisions — do NOT re-ask the operator. Each is recorded below with options + tradeoffs + a recommended lean so planning starts with a prior, not a blank slate. Treat the leans as defaults to adopt unless research surfaces a reason against.

### Locked by REQUIREMENTS.md (not open — do not re-derive)

- **D-02:** Redis shapes are pinned: `llm:calls:history` (LPUSH + LTRIM 500-entry cap, 30d TTL; entry = current `callHistory` fields + `runId` + `batchIndex`); `llm:runs:history` (LPUSH + LTRIM 200-run cap, 30d TTL; entry shape enumerated in OBS-FLIGHT-02). Register both in CLAUDE.md + `docs/architecture/redis-keys.md` (the Phase 35 drift gate `src/__tests__/lib/redis-registry.test.ts` will fail otherwise).
- **D-03:** All new read endpoints/fields are **Bearer-gated** (NOT `NODE_ENV` — the old 27.4.5 todo's gate is superseded), matching the `/api/operator-status` precedent. `/api/events/llm-history` returns `{runs, calls}` with optional `?runId=X` / `?limit=N`.
- **D-04:** **v3-only / NIM single-provider.** The 27.4.5 todo's `tokenSpend: {cerebras, groq}` and `pipelineVersion: 'v1'|'v2'` are obsolete (Cerebras/Groq purged in Phase 38 LLM-PURGE-06; v1/v2 deleted Phase 29). Use `tokenSpend: { nvidia_nim: N }` and `pipelineVersion: 'v3'`.
- **D-05:** Cold-start hydration mirrors the Phase 28.2.7 `llm:lastProgress` Redis write-through pattern — hydrate in-memory state from Redis `LRANGE` on the first `/llm-status` or `/llm-history` request after a cold start. Survives Fluid Compute warm-start gaps.

### Claude's Discretion — delegated gray areas (research/planning resolves)

- **GA-1 — Phase 39 ↔ Phase 40 UI scope boundary.** How much operator UI ships in 39 vs defers to Phase 40 (UI/UX polish + subtab consolidation).
  - _Tradeoff:_ one cohesive ship vs smaller reviewable slices + avoiding rework when Phase 40 reorganizes tabs.
  - _Recommended lean:_ ship the **data layer + a functional (unpolished) run-list + BudgetBlock** in 39; defer rich filters (outcome/date-range), prompt-copy drill-down nicety, and tab/subtab placement to Phase 40. Matches OBS-FLIGHT-04's own note ("likely lives inside the Phase 40 reorg") and the operator's "cleanup items become new phases" preference. Planning confirms the exact split.

- **GA-2 — Crashed/aborted run-record durability.** Whether a run that hangs/crashes/watchdog-aborts still leaves a flight-recorder trace.
  - _Tradeoff:_ durability + reconciliation logic + one extra Redis write per run vs only-on-completion simplicity.
  - _Recommended lean:_ **write the run record at run START** (`outcome: 'running'`, `runId` + `startedAt`) and **update it at end** with the terminal outcome. Only-on-completion would lose exactly the "what happened on last night's 3am run that died?" case the phase exists to answer. Extra cost is ~1 write per daily cron run — negligible. Planning decides the update mechanism (in-place LSET vs re-LPUSH + dedupe by `runId`).

- **GA-3 — Cost-shadow trend depth (BUDGET-02 "sparkline across 90d").** How much multi-day history to render now.
  - _Tradeoff:_ richer at-a-glance trend vs read-cost/complexity (a 90d sparkline reads up to 90 daily HSET keys per dashboard poll) for a single-operator dashboard.
  - _Recommended lean:_ ship **today's USD + soft/hard proximity bar** in 39; defer or thin the 90d sparkline (e.g., 7-day, or a single batched read behind the operator-status aggregator) so dashboard polls don't fan out to 90 Redis GETs. Planning sizes the read strategy.

- **GA-4 — `tokenBudget` operator-status contract shape (BUDGET-03/04).** Provider-keyed map vs flat single-provider.
  - _Tradeoff:_ future-proof shape now vs simplest-thing. The Zod-`.strict()` contract test LOCKS the shape — changing it later is a breaking dashboard change.
  - _Recommended lean:_ **provider-keyed map** — `{ providers: { nvidia_nim: { used, cap, soft, hard, state } }, costShadow: { tokensIn, tokensOut, usd } }` — so restoring a provider later adds a map entry without a contract break. Mirror the `actorQuality` degrade-open `try/catch` (leave `tokenBudget: null` on Redis failure; route stays 200). Planning finalizes field names.

### Folded Todos

- **`phase-27.4.5-llm-pipeline-observability`** (folded). This is the original source spec for the OBS-FLIGHT strand (`resolves_phase: 39`, `resolves_reqs: OBS-FLIGHT-01..06`). Its verification checklist (restart mid-run → partial run shows on boot; complete run → full record + calls in Redis; click run→calls→prompt; call-count reconciliation) flows into Phase 39's UAT. Its v1/v2/Cerebras/Groq references are obsolete — adapted to v3/NIM per D-04.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap

- `.planning/REQUIREMENTS.md` §BUDGET-01..04, §OBS-FLIGHT-01..06 — the locked requirement text (Redis shapes, caps, TTLs, endpoint signatures).
- `.planning/ROADMAP.md` → Phase 39 section — goal + SC39-1..4.
- `.planning/todos/pending/phase-27.4.5-llm-pipeline-observability.md` — folded source spec + verification checklist (adapt v1/v2→v3 per D-04).

### Pipeline architecture & decisions

- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — why NIM single-provider / v3-only (grounds D-04).
- `docs/architecture/llm-pipeline-reliability.md` — pipeline reliability primitives (watchdog, breaker, DLQ, token budget) that the flight recorder surfaces.
- `CLAUDE.md` "Active Redis keys (current-state registry)" — key-naming + TTL conventions; Phase 28.2.7 `llm:lastProgress` write-through (the cold-start hydration model, D-05); Phase 33 `actorQuality` degrade-open block (the `tokenBudget` model, GA-4).
- `docs/architecture/redis-keys.md` — must add `llm:calls:history` + `llm:runs:history` here (Phase 35 drift gate enforces parity).

### Integration anchors (existing code — read before writing)

- `server/lib/llmTokenBudget.ts` — `DAILY_LIMITS`, `todayKey`, `getDailyTokens`, `budgetState` (0.8/0.95); BudgetBlock's data source.
- `server/lib/freeClaudeRouter.ts` §`accrueShadowCost` (~:647) — already writes `events:llm-cost-shadow:v3:{date}` HSET (`tokensIn`/`tokensOut`/`usdMicrocents`); cost-shadow source.
- `server/lib/llmProgress.ts` — in-memory `callHistory` (D-19, cap 20), `evalScore` shape, and the **already-stubbed `LLMRunSummary` interface (:275)** to extend for OBS-FLIGHT-02; `LLM_LASTPROGRESS_KEY` write-through pattern.
- `server/routes/operator-status.ts` §`actorQuality` block (:395-486) — degrade-open `try/catch` + `res.json({...})` pattern to mirror for `tokenBudget`.
- `server/lib/llmExtractorWatchdog.ts` §`withBatchWatchdog` — generation counter is the injection point for `runId` threading (OBS-FLIGHT-05).
- `server/lib/llmExtractionPipeline.ts` §`runRefreshExtraction` — the run boundary where `runId` is generated and the run record is opened/closed (GA-2).
- `src/components/ui/DevApiStatus.tsx` §`DevApiStatusAllApisTab` (:871) + `OperatorStatus` type — where BudgetBlock/FlightRecorderBlock mount and how `/api/operator-status` is consumed.
- `server/__tests__/routes/operator-status.test.ts` — the contract test to extend with the `tokenBudget` Zod-strict pin (BUDGET-04).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`llmTokenBudget.ts` primitives** — caps + `budgetState` already compute the soft/hard classification BudgetBlock needs; no new budget math required.
- **`accrueShadowCost`** — cost-shadow is already accruing to Redis HSET + in-memory `llmProgress.costShadow`; BUDGET-02 is a read/render, not new accounting.
- **`LLMRunSummary` interface (llmProgress.ts:275)** — per-run shape is partially modeled already; extend rather than invent.
- **`actorQuality` operator-status block** — copy the degrade-open contract verbatim for `tokenBudget` (Redis throw → null → route stays 200).
- **Phase 28.2.7 `llm:lastProgress` write-through** — the exact cold-start hydration pattern for OBS-FLIGHT-06.

### Established Patterns

- Bearer-gated read aggregator (`/api/operator-status`) with `.strict()` contract test (Plan-04 + Phase 33 precedent).
- Redis registry drift gate (`redis-registry.test.ts`) requires CLAUDE.md + `redis-keys.md` + code parity for any new key.
- DevApiStatus polls operator-status once per cycle into a typed `OperatorStatus` shape (single fetch, mirror server contract).

### Integration Points

- New keys: `llm:calls:history`, `llm:runs:history` (register in 3 places).
- New field: `operator-status.tokenBudget`.
- New endpoint: `GET /api/events/llm-history` (Bearer-gated).
- `runId` threading: `runRefreshExtraction` → `withBatchWatchdog` → `callHistory` entries.

</code_context>

<specifics>
## Specific Ideas

No specific visual/reference asks — the operator delegated implementation choices (D-01). The flight-recorder mental model from the folded 27.4.5 todo ("turn the pipeline from 'see the last 20 calls' into a flight-recorder you can scrub": answer "what happened on last night's 3am run?", "how has eval trended?", "which groups keep DLQ'ing?") is the guiding UX intent.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-run analytics / aggregations** (eval-score trends, token-spend sparklines beyond a basic surface), **alerting on run outcomes** — explicitly out of scope per the 27.4.5 todo; candidate for a future analytics/dashboard phase once raw history has accumulated.
- **Rich FlightRecorder filters + tab/subtab placement + visual polish** — likely Phase 40 (UI/UX polish + subtab consolidation) per GA-1's lean.

### Reviewed Todos (not folded)

- **`phase-27.4.2-ci-health`** — unrelated CI tech-debt; matched only on generic "status/phase" keywords. Not in this phase's operator-visibility scope.
- **`phase-27.4.3-deckgl-v9-type-drift`** — unrelated DeckGL typing tech-debt; generic-keyword match only. Not in scope.

</deferred>

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-recorder_
_Context gathered: 2026-06-04_
