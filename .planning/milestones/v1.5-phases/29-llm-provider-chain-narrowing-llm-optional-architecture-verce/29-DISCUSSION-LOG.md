# Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + Cerebras/Groq Adapter Purge + v1/v2 Extractor Deletion + CLAUDE.md Trim — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
**Areas discussed:** Cascade-narrowing surface area, LLM-optional proof mechanism, CLAUDE.md trim methodology, Vercel Pro upgrade timing + verification

---

## Pre-discussion: Roadmap Re-Scope

Before discussion began, the user requested the CLAUDE.md cleanup (DOCS-INT-01) be pulled forward from Phase 35 to Phase 29 to ship alongside the LLM cascade narrowing.

| Decision             | Choice                                    |
| -------------------- | ----------------------------------------- |
| Merge approach       | PR-merge (PR #18 admin-merged squash)     |
| CLAUDE.md scope move | Move DOCS-INT-01 from Phase 35 → Phase 29 |

Roadmap commit: `c7fad86 docs(29): pull DOCS-INT-01 (CLAUDE.md trim) from Phase 35 → Phase 29`

---

## Cascade-Narrowing Surface Area

### Q1: How should Cerebras + Groq leave the active cascade?

| Option                                                                                | Description                                                                                                                                             | Selected |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Hard-delete from runtime path                                                         | Delete from cascade order, factory, isLLMConfigured, skipReason entries; modules stay importable; rollback = git revert; cleanest signal in callHistory | ✓        |
| Feature-flag via env var (LLM_PROVIDERS=nim,openrouter)                               | Cascade order becomes data-driven from env; modules stay imported; trade-off: theoretical flexibility                                                   |          |
| Keep adapter modules + cascade-order array, just exit early in cerebras/groq branches | Lightest touch; one-line revert; trade-off: dead branches stay in code                                                                                  |          |

**User's choice:** Hard-delete from runtime path (recommended)
**Notes:** Modules themselves stay in `server/adapters/` for emergency reference; production code path no longer imports.

### Q2: What happens to v1 + v2 extractor module references?

| Option                                                          | Description                                                                                                                   | Selected |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Stay importable, no narrative change in CLAUDE.md (recommended) | Modules + override endpoint preserved; CLAUDE.md just notes "deep-rollback only, not active"; Phase 35 archives v1 separately |          |
| Move v1 to \_archive/ in this phase too                         | Pull SIMPLIFY-06 forward; trade-off: scope creep                                                                              |          |

**User's choice:** "Other" — "Add documentation to v1 and v2 to log it happened for things like ADRs but remove from or codebase"
**Notes:** User went HARDER than either option — full DELETION of v1+v2 modules, not just archive. Supersedes Phase 27.4 D-26/D-40 deep-rollback lock.

### Q3: Confirm the v1/v2 deletion + override-endpoint removal scope?

| Option                                                                                  | Description                                                                                                                                          | Selected |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Yes — delete v1+v2 modules + override endpoint, ADR-only history (recommended)          | Modules + route + Redis key + DevApiStatus buttons all deleted; ADR-0009 captures rationale; SIMPLIFY-06 retired from Phase 35; +500-800 LOC deleted | ✓        |
| Yes — but keep the override endpoint as a noop/410 for clean error                      | Same deletion; route returns 410 Gone with explanation; trade-off: zombie code                                                                       |          |
| No — walk it back, keep v1+v2 as deep-rollback (matches the recommended option from Q2) | Use original recommendation; smallest change                                                                                                         |          |

**User's choice:** Yes — delete v1+v2 modules + override endpoint, ADR-only history (recommended)
**Notes:** Confirmed. Scope creep is intentional; v1+v2 retirement was already going to happen in v1.5, just not this early.

### Q4: Where does the v1 → v2 → v3 evolution + retirement rationale live?

| Option                                                                       | Description                                               | Selected |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| Fold into ADR-0009 (Phase 37, the planned milestone-close ADR) (recommended) | Existing ADR-0009 expanded; stub written in Phase 29      | ✓        |
| Dedicated ADR-0010 in Phase 29                                               | Standalone ADR; ADR-0009 stays for broader v1.5 decisions |          |

**User's choice:** Fold into ADR-0009 (Phase 37) (recommended)
**Notes:** Stub at `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` lands in Phase 29, full expansion at Phase 37.

---

## LLM-Optional Proof Mechanism

### Q5: What's the LLM-optional regression guard?

| Option                                         | Description                                                                                                                | Selected |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Integration test in vitest suite (recommended) | `src/__tests__/llm-optional.test.ts`; mocks both keys absent; asserts events.length>0 + Pitfall 1 source tier; CI-enforced |          |
| Manual smoke checklist in docs/runbook.md      | 5-step manual smoke; trade-off: not enforced                                                                               |          |
| Both — integration test + runbook entry        | CI guard + operator runbook; belt + suspenders                                                                             | ✓        |

**User's choice:** Both — integration test + runbook entry
**Notes:** Phase 29 writes runbook entry directly to `docs/runbook.md`; Phase 36 only verifies post-fact.

### Q6: Do we add a kill-switch env var (LLM_PIPELINE_ENABLED=false) for operator control?

| Option                                                                 | Description                                                                            | Selected |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| No — "unset both keys" IS the kill switch (recommended)                | Operator unsets keys + redeploys; same code path as the regression guard; less surface | ✓        |
| Yes — LLM_PIPELINE_ENABLED=false short-circuits before isLLMConfigured | Adds env var; theoretical flexibility                                                  |          |
| Yes, plus DevApiStatus banner when active                              | Env var + yellow banner; loud + obvious; more surface                                  |          |

**User's choice:** No — "unset both keys" IS the kill switch (recommended)

---

## CLAUDE.md Trim Methodology

### Q7: How aggressive should the CLAUDE.md trim be?

| Option                                                                      | Description                                                                                                  | Selected |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Aggressive: target <10k tokens (recommended for v1.5 reveal-prep posture)   | Restructure to "current-state invariants only"; delete ALL phase-narrative blocks; replace with 1-line links | ✓        |
| Moderate: target <12k tokens — collapse v0.9-v1.3, keep v1.4 detail         | Delete Phase 4 through 26; keep 27._ + 28._                                                                  |          |
| Light: target <15k tokens — only delete v0.9-v1.1 + obsoleted Cerebras/Groq | Smallest trim                                                                                                |          |

**User's choice:** Aggressive: target <10k tokens (recommended)
**Notes:** Chosen for v1.5 "reveal prep" posture — public-facing posture wants a leaner internal doc.

### Q8: What's the test for "meaningfully shorter"?

| Option                                 | Description                                                                                                                                 | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Token count + spot-check (recommended) | Before/after token count + 5-item operator skim test (Redis keys, env vars, color tokens, domain constants, cron schedule findable in <30s) | ✓        |
| Token count only                       | Just numbers; trade-off: might lose critical detail                                                                                         |          |
| Token count + invariant checklist      | Numbers + written invariant list; PR fails if any missing; most rigorous                                                                    |          |

**User's choice:** Token count + spot-check (recommended)

---

## Vercel Pro Upgrade Timing + Verification

### Q9: When does the Pro upgrade happen?

| Option                                                                               | Description                                                 | Selected |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------- |
| BEFORE phase plans run — first Phase 29 commit is the maxDuration bump (recommended) | Operator upgrades day 1; first commit = maxDuration 300→800 | ✓        |
| AFTER cascade-narrowing lands but BEFORE Phase 30 starts                             | Phase 29 ships under Hobby/300s; final commit is the bump   |          |
| Parallel: operator upgrades while code work is in flight                             | No specific synchronization                                 |          |

**User's choice:** BEFORE phase plans run (recommended)

### Q10: How do we verify the 800s headroom is real?

| Option                                                                               | Description                                                                   | Selected |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| Synthetic >300s invocation against /api/cron/refresh-events?force=true (recommended) | Operator hits force-trigger, watches for >300s wall-clock without kill        |          |
| Trust the Vercel dashboard                                                           | Faster; trade-off: documented gap between dashboard + actual function ceiling |          |
| Both — dashboard check AND synthetic invocation                                      | Belt + suspenders                                                             | ✓        |

**User's choice:** Both — dashboard check AND synthetic invocation
**Notes:** Most rigorous; matches the cautious posture of v1.5 reveal prep.

---

## Wrap-Up

### Q11: Want to discuss more gray areas, or write CONTEXT.md now?

| Option                                                                    | Description                                                            | Selected |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Write CONTEXT.md — 9 decisions captured, that's enough (recommended)      | All 4 selected areas covered; researcher + planner have what they need | ✓        |
| More gray areas — runbook entry location, ADR-0009 stub shape, test infra | Sub-areas; deferred to Claude's discretion in CONTEXT.md               |          |

**User's choice:** Write CONTEXT.md (recommended)

---

## Claude's Discretion (deferred to researcher / planner)

- Integration test location (`src/__tests__/` vs `server/__tests__/`)
- Express harness env-mocking pattern (`vi.stubEnv` vs `createApp({ skipLLM: true })` parameter)
- `docs/runbook.md` section structure (follows existing 28.2 W6 style)
- ADR-0009 stub structure (follows existing convention or planner creates one)
- Whether `events:llm:v2` Redis read fallback in events route stays for graceful deploy-window degradation or is removed in same commit

## Deferred Ideas

- `PipelineVersionPill` complete removal vs degraded "v3"-static badge
- Topbar import surface reduction after `PipelineVersionPill` deletion
- `docs/adr/` directory + `docs/adr/README.md` creation if no prior ADRs exist
- `callHistory` skipReason enum simplification (out of Phase 29 scope; revisit Phase 30)
- `isPipelineV2()` caller collapse vs sequential refactor — researcher picks
- **Anti-pattern #19**: do not re-introduce v1 / v2 extractor modules without a new ADR superseding the v1.5 decision

## Roadmap Side-Effects (committed)

- `c7fad86` — `docs(29): pull DOCS-INT-01 (CLAUDE.md trim) from Phase 35 → Phase 29`
- (this commit) — `docs(29): capture phase context` — Phase 29 + Phase 35 scope realignment for SIMPLIFY-06 fold-forward
