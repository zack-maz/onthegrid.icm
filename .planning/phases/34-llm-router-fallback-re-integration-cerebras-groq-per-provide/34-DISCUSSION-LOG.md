# Phase 34: LLM Router Fallback Re-integration (Cerebras / Groq + Per-Provider Eval) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `34-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 34-llm-router-fallback-re-integration-cerebras-groq-per-provide
**Mode:** `gsd-discuss-phase 34 --auto` — Claude auto-selected the **first / recommended** option at every gray area without operator prompts. Operator can override any single decision by opening CONTEXT.md and editing the corresponding `D-NN` row before `/gsd:plan-phase 34` runs.
**Areas discussed:** Probe gate threshold, Probe shape & sample size, Probe script topology, Per-provider gating, Adapter location & shape, Cascade ordering, Provider provenance tagging, Per-provider eval scoring, `EvalScore.byProvider` shape, DLQ reason union extension, Validation cron protocol, OpenRouter status preservation, Commit discipline, Documentation amendments.

---

## Probe Gate Threshold

### Q1.1: What rate-limit-fail threshold gates a provider into the cascade?

| Option                                                                      | Description                                                                                                                                                                                                                                                  | Selected |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `< 50%` pass / `50-90%` middle / `≥ 90%` defer (per-provider) (recommended) | Mirrors Phase 30.1 D-05's three-bucket scheme. Empirically the cleanest pass/fail/middle separation observed against a single-tenant free-tier provider. Applied INDEPENDENTLY per provider so mixed results (Cerebras passes, Groq defers) are first-class. | ✓        |
| `< 30%` pass / `30-70%` middle / `≥ 70%` defer                              | Tighter pass criterion. Reduces false positives but also rejects providers that would be useful as backoff-tolerant fallbacks. Phase 30.1 already proved a 90% provider is unusable; nothing between 50-90% has been measured.                               |          |
| `< 75%` pass single-threshold                                               | Simpler. Loses the middle-bucket nuance — paid-conversion conversation becomes binary instead of probe-driven.                                                                                                                                               |          |

**Claude's selection:** `< 50%` / `50-90%` / `≥ 90%` per-provider (Recommended).
**Rationale:** Phase 30.1's identical thresholds produced an actionable decision against OpenRouter free tier in one probe run. Re-using the same bucket boundaries means Phase 35 can compare apples-to-apples in its registry sweep. Per-provider independence per LLM-RELI-08 success criteria.

---

## Probe Shape & Sample Size

### Q2.1: Per-provider sample size and call cadence?

| Option                                                           | Description                                                                                                                                                                                              | Selected |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| N=30 single-event payloads per provider, 100ms gap (recommended) | Matches Phase 30.1 D-04. Binomial confidence ±10% across three buckets. ~5 min per provider, ~10 min total for two. Single-event matches v3's effective batch shape post Phase 30 tuning.                | ✓        |
| N=50 per provider, matching ground-truth eval size               | Tighter confidence (~±7%); wall-clock 17 min total. No statistical gain at the bucket boundaries that matter (≥90% is already 27/30 — no extra precision needed).                                        |          |
| N=10 sanity check first, then scale                              | Two-stage probe saves time if both providers fail badly. Bookkeeping overhead + extra commit doesn't justify the savings (a full N=30 is already ~5 min).                                                |          |
| Multi-event batched payloads (5 events/call)                     | More realistic; halves call count for same coverage. Rate-limit behavior may differ on multi-event calls — we want to measure the SAME shape v3 uses today, which is single-event after Phase 30 tuning. |          |

**Claude's selection:** N=30 single-event per provider, 100ms gap (Recommended).
**Rationale:** Phase 30.1's exact pattern. Reproducible across phases for trend analysis.

---

## Probe Script Topology

### Q3.1: One combined script or two per-provider scripts?

| Option                                                                                    | Description                                                                                                                                                                                     | Selected |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Single `scripts/probe-cerebras-groq.ts` running both providers sequentially (recommended) | One script, one snapshot file, one `npm run probe:cerebras-groq` command. Emits combined `byProvider: {cerebras: {...}, groq: {...}}` snapshot. Operator runs one command, gets both decisions. | ✓        |
| Two scripts: `probe-cerebras.ts` + `probe-groq.ts`                                        | Cleaner separation; operator can run independently. More boilerplate; two snapshots to commit; two `package.json` entries.                                                                      |          |
| Extend existing `probe-openrouter.ts` with `--provider` flag                              | Reuses runner. Cross-mingles single-provider history with multi-provider runs — bad cohesion. Same issue as Phase 30.1 Q2.1 option 3.                                                           |          |

**Claude's selection:** Single combined script (Recommended).
**Rationale:** Operator UX. Phase 30.1's single OpenRouter script set the unit-of-probe = one script per phase. Two providers fit comfortably in one script with sequential runs and a `byProvider` top-level snapshot key.

---

## Per-Provider Gating

### Q4.1: How are mixed probe outcomes handled (one passes, one fails)?

| Option                                                              | Description                                                                                                                                                                                            | Selected |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Integrate the passer, defer the failer per-provider (recommended)   | Each provider is evaluated independently against the bucket thresholds. Phase closes with explicit per-provider status. ADR-0010 sub-block records each provider's percentage and decision separately. | ✓        |
| Atomic — restore both or neither                                    | Cleaner phase boundary but rejects useful single-provider wins. Loses the data point that one provider IS uncorrelated with NIM throttle.                                                              |          |
| Restore both regardless of probe; treat probe as observability only | Defeats the entire probe-driven discipline. Phase 30.1 was burned by exactly this kind of silent assumption.                                                                                           |          |

**Claude's selection:** Per-provider gating (Recommended).
**Rationale:** Roadmap success criteria #2 explicitly allows "At least one new provider in the cascade, OR honest deferral." Per-provider gating maximizes information yield from the probe run.

---

## Adapter Location & Shape

### Q5.1: Where does the new provider adapter code live?

| Option                                                               | Description                                                                                                                                                                                                                                                                                           | Selected |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Extend existing `server/lib/freeClaudeRouter.ts` (recommended)       | Roadmap success criteria #2 explicitly names this file as the adapter home. The existing cascade builder at line 341-363 already has the slot pattern. Provider entries get added to `allProviders[]`; per-provider rate-limit/daily-cap pre-checks slot in alongside the existing NIM/OR pre-checks. | ✓        |
| New module `server/lib/freeClaudeRouterV2.ts`                        | Decoupling for v4 router prep. PROJECT.md explicitly rejects v4 — adding a v2 file telegraphs the wrong intent.                                                                                                                                                                                       |          |
| Per-provider files (`server/lib/cerebras.ts` + `server/lib/groq.ts`) | More modular. Loses the unified cascade-builder loop; each provider would need its own retry/backoff/breaker integration code path. Higher maintenance cost.                                                                                                                                          |          |

**Claude's selection:** Extend `freeClaudeRouter.ts` (Recommended).
**Rationale:** Roadmap-mandated location. Reuses tested cascade machinery. Minimal diff.

---

## Cascade Ordering

### Q6.1: When multiple providers pass the probe, in what order do they sit in the cascade?

| Option                                                                        | Description                                                                                                                                                                                                                                   | Selected |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| NIM primary; secondaries ordered by probe latency p50 ascending (recommended) | NIM stays primary (Phase 27.4.4 D-01 bake-off). Faster-responding probe winners go earlier in the cascade so wall-clock burned on a failed primary is minimized. Decision committed in adapter PR's commit body with the latency p50 numbers. | ✓        |
| NIM primary; secondaries in alphabetical order (cerebras → groq)              | Deterministic regardless of probe result. Loses the latency-optimization win for free.                                                                                                                                                        |          |
| NIM primary; secondaries in order of measured RPM ceiling (highest first)     | Optimizes for capacity, not latency. Capacity is rarely the binding constraint — single-batch latency is.                                                                                                                                     |          |
| Reorder dynamically at runtime based on recent rate-limit observations        | Adaptive ordering. Out of scope — bumps complexity into Phase 36+ territory.                                                                                                                                                                  |          |

**Claude's selection:** NIM primary; secondaries by probe latency p50 ascending (Recommended).
**Rationale:** Optimizes cascade wall-clock. Probe already measures latency; using it for ordering is free.

---

## Provider Provenance Tagging

### Q7.1: How does per-provider eval scoring work without doubling LLM token spend?

| Option                                                                                    | Description                                                                                                                                                                                                                                                                              | Selected |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Tag at extraction time via new `providerProvenance` field on cached entries (recommended) | Each `enrichedEventV3` payload in `events:llm:v3` carries `providerProvenance: FreeProvider \| null`. Resolver-only eval reads the tag, groups results by provider. **Zero new LLM token spend.** Additive-optional schema field; mirrors Phase 33 `actorConfidence` rollout discipline. | ✓        |
| Re-extract ground-truth set per provider                                                  | Definitive but costs N × providers × ground-truth-events LLM tokens per eval run. Phase 27.4 D-25 explicitly rejected this pattern; preserved here.                                                                                                                                      |          |
| Synthesize provider attribution from `events:llm-summary:v3.callHistory` post-hoc         | No schema change but fragile — callHistory is bounded to 20 rows. Couldn't attribute events extracted earlier than the most recent 20 batches.                                                                                                                                           |          |

**Claude's selection:** Tag at extraction time via `providerProvenance` field (Recommended).
**Rationale:** Cheapest, lowest-risk addition. Preserves the resolver-only eval invariant from Phase 27.4 D-25.

### Q7.2: How is `providerProvenance` rolled out without bumping the cache key?

| Option                                                    | Description                                                                                                                                                                 | Selected |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Additive-optional Zod field, default `null` (recommended) | Mirrors Phase 33 D-04 `actorConfidence` rollout. Pre-Phase-34 cached entries continue to validate; new entries get the tag at write time. No `events:llm:v3.1` bump needed. | ✓        |
| Bump cache key to `events:llm:v3.1`                       | Forces fresh extraction on next cron run. Loses up to 24h of cached enrichment for a field that defaults sensibly.                                                          |          |
| Migrate cached entries via one-shot script                | Tag historical entries with synthesized provider from callHistory. Same fragility as Q7.1 option 3.                                                                         |          |

**Claude's selection:** Additive-optional, default `null` (Recommended).
**Rationale:** Phase-33 precedent. Zero rollout risk.

---

## `EvalScore.byProvider` Shape

### Q8.1: How is per-provider eval surfaced in the `EvalScore` interface?

| Option                                                                                                                                 | Description                                                                                                                                                                                                       | Selected |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `byProvider: {nvidia_nim: {within5km, within20km, within100km, total}, cerebras: {...}, groq: {...}, openrouter: {...}}` (recommended) | Mirrors existing `EvalScore` shape per provider. `total === 0` per provider renders as "(no data)" — distinguishes "no data" from "100% miss". Mirrors into `LLMRunSummary` for `/api/events/llm-status` surface. | ✓        |
| Flat `byProvider: Array<{provider, within5km, ...}>` array                                                                             | Easier to iterate in UI. Loses the type-safe per-provider key access; harder to assert exhaustiveness.                                                                                                            |          |
| Just `byProviderWithin20km: Record<provider, number>` minimal shape                                                                    | Smaller surface. Loses 5km / 100km granularity that the existing aggregate `EvalScore` keeps.                                                                                                                     |          |

**Claude's selection:** Full per-provider `EvalScore` shape under `byProvider` map (Recommended).
**Rationale:** Symmetric with aggregate `EvalScore`. Future-proof against per-provider rubric extensions.

---

## DLQ Reason Union Extension

### Q9.1: New DLQ reason bucket for "all providers in cascade failed"?

| Option                                                                | Description                                                                                                                                                                                                                               | Selected |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Add `'v3:cascade_exhausted'` to `DLQEntry.reason` union (recommended) | Mirrors existing `v3:*` naming. Written at the existing "callLLM returned null" branch in the v3 extractor. Distinguished from `v3:timeout_watchdog` (single-batch hard kill) and `v3:rate_limit_exhaust` (per-call retry budget burned). | ✓        |
| Reuse `'v3:rate_limit_exhaust'` for cascade-level exhaustion          | Overloads an existing reason; operator can't distinguish "one provider rate-limited 3×" from "every provider in the cascade failed".                                                                                                      |          |
| Add `'cascade_exhausted'` without `v3:` prefix                        | Naming inconsistency. The existing convention pairs version-prefixed v3 reasons with pipeline-version-stable reasons; cascade exhaustion is v3-specific.                                                                                  |          |

**Claude's selection:** Add `'v3:cascade_exhausted'` (Recommended).
**Rationale:** Naming consistency. Distinct semantics. Roadmap success criteria #5 explicitly names this bucket.

---

## Validation Cron Protocol

### Q10.1: How is the restored cascade evidenced in the validation run?

| Option                                                                         | Description                                                                                                                                                                          | Selected |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Force-trigger `?force=true` + `npm run watch:snapshot -- --http` (recommended) | Mirrors Phase 31 + Phase 30.1 patterns. Operator runs one Bearer-gated trigger, snapshot harness captures the row. `callHistory[].provider` includes a non-NIM row if cascade fired. | ✓        |
| New temp endpoint `/api/diag/cascade-trace`                                    | Reads `events:llm-summary:v3` directly. Pollutes route surface; same data already in `events:llm-summary:v3`.                                                                        |          |
| Wait for natural daily 4am cron                                                | Slower (24h lag). Phase 31's Day-1 already showed natural cron evidence is captured by the snapshot harness, but Phase 34 needs faster feedback during validation.                   |          |

**Claude's selection:** Force-trigger + snapshot harness (Recommended).
**Rationale:** Standard Phase 30/31/33 protocol.

### Q10.2: If natural NIM throttle doesn't fire in validation runs, how is the cascade fall-through triggered?

| Option                                                                                                                                               | Description                                                                                                                                  | Selected |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Wait for natural NIM throttle; add temp `?skipPrimary=nvidia_nim` Bearer-gated flag only if natural throttle doesn't fire after 2 runs (recommended) | Preserves the prod-shaped observation. Temp flag is a witness shipped in Plan 04 and reverted in Plan 05; gated by env check (refuses prod). | ✓        |
| Always use temp skip flag                                                                                                                            | Faster validation but doesn't observe natural cascade behavior. Misses a real-world testing opportunity.                                     |          |
| Never use skip flag; only natural throttle                                                                                                           | Validation may stall indefinitely if NIM is well-behaved during validation window.                                                           |          |

**Claude's selection:** Natural first, temp flag as fallback (Recommended).
**Rationale:** Highest-fidelity observation; flag exists as a safety net.

---

## OpenRouter Status Preservation

### Q11.1: Does Phase 34 re-litigate OpenRouter's dormant status from Phase 30.1?

| Option                                                                          | Description                                                                                                                                                                                 | Selected |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Out of scope — OR stays dormant; `skipOpenRouter: true` untouched (recommended) | Phase 30.1 closed `nim-only` with 90% rate-limited measurement on 2026-05-17. Re-probing OR is a separate decimal phase, gated on operator decision. Phase 34 keeps the dormancy invariant. | ✓        |
| Re-probe OR alongside Cerebras + Groq                                           | Doubles probe surface. Phase 30.1's measurement is recent (6 days at session start); free-tier behavior is unlikely to have shifted materially.                                             |          |
| Flip `skipOpenRouter: false` to make the cascade four-deep                      | Re-introduces a known-90%-failing provider. Same anti-pattern Phase 30.1 documented.                                                                                                        |          |

**Claude's selection:** OR dormancy preserved (Recommended).
**Rationale:** Phase boundary discipline. The Phase 30.1 decision is the standing record; Phase 34 doesn't reopen it.

---

## Commit Discipline

### Q12.1: Plan decomposition and commit granularity?

| Option                                                                   | Description                                                                                                                                                                                      | Selected |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 5 plans / atomic-per-decision commits (recommended)                      | Matches roadmap entry: probe → adapter → eval → validation → close. Mirrors Phase 30.1 D-17 / Phase 33's 7-plan decomposition. Per-decision commits within each plan keep `git revert` surgical. | ✓        |
| 3 plans (probe → integrate → close) — bundle adapter + eval + validation | Coarser; harder to revert eval changes without unwinding adapter changes.                                                                                                                        |          |
| 7+ plans for finer granularity                                           | Over-engineered for ~5 atomic surfaces. Phase 33's 7-plan count was justified by parallel UI + server tracks; Phase 34 has no parallel tracks.                                                   |          |

**Claude's selection:** 5 plans / atomic-per-decision commits (Recommended).
**Rationale:** Roadmap-defined decomposition. Atomicity per Phase 30 D-08.

### Q12.2: Branch discipline?

| Option                                                                                 | Description                                                                                                                                                      | Selected |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `feature/34-router-fallback-reintegration` from `main` after PR-33 merge (recommended) | Project-wide branch-per-phase convention (CLAUDE.md). Branch cut at start of Plan 34-01 execution; CONTEXT.md + DISCUSSION-LOG.md may sit on `main` as scaffold. | ✓        |
| Continue on `main` (no feature branch)                                                 | Violates CLAUDE.md convention; also blocks parallel work on other phases.                                                                                        |          |
| Worktree-based branch isolation                                                        | Project doesn't use worktrees; adding now is scope creep.                                                                                                        |          |

**Claude's selection:** Feature branch per phase (Recommended — locked by CLAUDE.md).

---

## Documentation Amendments

### Q13.1: ADR home for Phase 34's decisions?

| Option                                   | Description                                                                                                                                                                                                                                                                                                                                    | Selected |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ADR-0010 sub-block append (recommended)  | Phase 30 + Phase 30.1 each appended sub-blocks to ADR-0010. Phase 34's sub-block continues the pattern; the `<expand_at_36>` block stays Phase 37's responsibility. Planner can promote to a fresh ADR-0011 if Phase 34's scope warrants a separate decision record (e.g. if both providers restored AND the cascade shape materially shifts). | ✓        |
| New ADR-0011 unconditionally             | Premature separation. Phase 30.1's sub-block precedent shows the existing ADR accommodates cascade-related decisions cleanly.                                                                                                                                                                                                                  |          |
| No ADR; just CLAUDE.md + reliability doc | Loses the decision record. ADR-0010 is the load-bearing artifact for the LLM-pipeline narrative arc.                                                                                                                                                                                                                                           |          |

**Claude's selection:** ADR-0010 sub-block (Recommended).
**Rationale:** Precedent. Planner has discretion to promote to ADR-0011 if scope shifts.

### Q13.2: How does `docs/architecture/llm-pipeline-reliability.md` reflect the change?

| Option                                                                                                              | Description                                                                                                                                                                                                                    | Selected |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| New section `## Multi-Provider Cascade (Phase 34)` between Phase 30.1 section and 7-Day Watch section (recommended) | Mirrors Phase 30.1 D-11 placement convention. Records cascade shape, per-provider eval approach, pointer back to ADR sub-block. Belt-and-suspenders raw-GDELT terminal fallback paragraph from Phase 30.1 D-08 stays in place. | ✓        |
| Update the existing "Cascade Reality" section in place                                                              | Loses the phase-by-phase audit trail. Phase 30.1's section is the historical record of when OR went dormant.                                                                                                                   |          |
| New top-level architecture doc `docs/architecture/llm-multi-provider-cascade.md`                                    | Over-fragments the architecture docs. The reliability doc is the right home.                                                                                                                                                   |          |

**Claude's selection:** New section in `llm-pipeline-reliability.md` (Recommended).
**Rationale:** Convention. Single-file home keeps the architecture story coherent.

### Q13.3: CLAUDE.md edit scope?

| Option                                                                                                      | Description                                                                                                                                     | Selected |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Minimal edit — provider-count line in "LLM Event Pipeline" + 2 new "Serverless Cache" entries (recommended) | Preserves Phase 29 D-06 trim budget. Single-line change to provider description + two `llm:tokens:{provider}:*` registry entries (1 line each). | ✓        |
| Add a new "Phase 34" sub-section under "LLM Event Pipeline"                                                 | Phase-history bloat that Phase 29 deliberately trimmed. The ADR sub-block is the right place for phase-history detail.                          |          |
| Move the entire LLM-pipeline section to a separate file referenced from CLAUDE.md                           | Out of scope; restructures CLAUDE.md beyond Phase 34's mandate.                                                                                 |          |

**Claude's selection:** Minimal edit (Recommended).
**Rationale:** CLAUDE.md trim budget preserved. Detail belongs in ADR + reliability doc.

---

## Claude's Discretion

The following choices were explicitly marked as planner / UI-spec discretion in CONTEXT.md (`<decisions> > Claude's Discretion`):

- `EvalScoreBlock` UI shape — horizontal compact cards vs single `<table>` with provider rows.
- "(no data)" badge styling for `evalScore.byProvider.{provider}.total === 0`.
- `probe-snapshot.json` shape — top-level `byProvider` map vs flat `results[]` with provider field.
- `?skipPrimary` validation flag — temporary query param vs Redis feature flag with short TTL.
- `cascade_exhausted` DLQ row `lastError` content — concatenated provider taxonomy vs final-provider error string only.

---

## Deferred Ideas

See `34-CONTEXT.md` `<deferred>` section for the canonical list. Categorized into:

- **Phase 35 prep** — Redis registry cataloging of new `llm:tokens:cerebras:*` / `llm:tokens:groq:*` / `events:llm-eval-baseline:v3:by-provider:*` keys; pre-Phase-34 `providerProvenance: null` entry pruning.
- **Phase 36 prep** — README provider-count line, Mermaid cascade diagram, OpenAPI mention of `?skipPrimary` flag (conditional).
- **Phase 37 prep** — 3× consecutive `prod-connectivity-audit.yml` exit-0 observation against the restored cascade.
- **Phase-31-or-Later (conditional)** — Adaptive `Retry-After`-aware NIM limiter; paid-Cerebras / paid-Groq conversation; provider model swap.
- **Conditional on probe outcome (within Phase 34)** — Cerebras-only restore, Groq-only restore, or both-deferred. Plan 34-02 collapses or expands based on probe result.

---

_End of discussion log._
