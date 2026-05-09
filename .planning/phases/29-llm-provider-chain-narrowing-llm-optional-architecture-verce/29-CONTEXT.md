# Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + Cerebras/Groq Adapter Purge + v1/v2 Extractor Deletion + CLAUDE.md Trim — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Cut Cerebras + Groq out of the active runtime cascade, **delete v1 + v2 extractor modules entirely** (including the override endpoint, the Redis sidecar key, and the DevApiStatus pin buttons), prove the map renders cleanly on raw GDELT when both NIM + OpenRouter keys are absent (CI integration test + runbook entry), upgrade the Vercel project to Pro and bump `vercel.json` `maxDuration: 300 → 800` as the **first** phase commit, and trim CLAUDE.md to a "current-state invariants only" shape targeting <10k tokens.

**Requirements covered:** LLM-RELI-01, LLM-RELI-05, SIMPLIFY-04, **SIMPLIFY-06** (folded forward from Phase 34 — full deletion not archive), **DOCS-INT-01** (pulled from Phase 34).

**Out of scope (other phases):**

- NIM throttle characterization + cascade tuning + retire incremental flush + relax watchdog → Phase 30 (LLM-RELI-02/03/04, SIMPLIFY-01/03)
- 7-day cron stability watch → Phase 31 (LLM-RELI-06)
- Ghost event URL liveness + dashboard → Phase 32 (GHOST-01..05)
- Actor metadata audit + canonical catalog → Phase 33 (ACTOR-01..05)
- JSDoc audit + Redis registry verification + key inventory + budget delta + freeClaudeRouter audit + bundle-size delta → Phase 34 (DOCS-INT-02/03, REDIS-OPT-01..04, SIMPLIFY-02/05/07)
- Public docs sweep + OpenAPI additions → Phase 35
- Full ADR-0009 + acceptance gate closeout → Phase 36 (DOCS-PUB-04, LLM-RELI-07)
  </domain>

<decisions>
## Implementation Decisions

### Cascade Narrowing — what leaves the runtime path

- **D-01: Hard-delete Cerebras + Groq from runtime path.** Delete from the cascade order array, the `createLLMClient` factory, `isLLMConfigured` gating, and the synthetic `skipReason: 'no_client'` callHistory entries in `server/adapters/llm-provider.ts`. The Cerebras + Groq adapter source files themselves stay in `server/adapters/` (importable for emergency rollback) but **no production code path imports them**. `CEREBRAS_API_KEY` / `GROQ_API_KEY` env-var checks removed from `isLLMConfigured` (`NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` are the only keys gating the cascade). Verification signal: `callHistory` shows ONLY `nim` and `openrouter` provider names. Rollback path: `git revert` the SIMPLIFY-04 commit.

### v1 + v2 Extractor — full deletion, not archive

- **D-02: DELETE v1 + v2 extractor modules entirely.** Removes:
  - `server/lib/llmEventExtractor.v1.ts` — deleted
  - `server/lib/llmEventExtractor.v2.ts` — deleted
  - `POST /api/events/llm-pipeline` route — deleted (404, not 410 — clean removal, no zombie route)
  - `events:llm-pipeline-override` Redis key — writes deleted, key naturally TTL-expires within 7d
  - `refreshPipelineOverride()` + `setPipelineOverride()` helpers in `server/config.ts` — deleted
  - DevApiStatus Pin-to-v1 + Pin-to-v2 buttons + their confirm modal (Phase 28.2 W5 D-22 surface) — deleted
  - `events:llm:v2` + `events:llm:v3:partial` Redis read fallbacks in the events route Pitfall 1 bridge — re-evaluated (raw GDELT remains terminal fallback; v2 cache read may stay if it has live data, but the bridge no longer falls back to _running_ v2)
  - All tests, fixtures, and mocks referencing v1 / v2 extractors
  - CLAUDE.md narrative blocks for "V2 Extractor Watchdog (Phase 27.4.1)" and "LLM Enrichment v2 + Runtime Toggle (Phase 27.4)" — deleted as part of D-06 trim
- **Supersedes:** Phase 27.4 D-26/D-40 (v1+v2 preserved as deep-rollback). Justification recorded in D-03 (ADR rationale).
- **Rollback path:** `git revert <Phase 29 commit range>` + `vercel --prod`. Wall-clock minutes, not a Bearer-POST flip.

### ADR Capture

- **D-03: Fold v1+v2 retirement rationale into ADR-0009 at Phase 36, write stub now.** A short ADR-0009 stub file is committed in Phase 29 at `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` containing: the v1→v2→v3 evolution timeline (Phase 27.4 lock dates from `.planning/phases/27.4-*/CONTEXT.md`); what was deleted in Phase 29 (modules, endpoint, Redis key, UI buttons); what the new rollback path is (git revert); and a `<expand_at_36>` marker for the rest of the v1.5 decisions. Phase 36 expands the stub with the full milestone-close rationale.

### LLM-Optional Architecture

- **D-04: Both integration test (CI guard) AND runbook entry (operator-facing).**
  - **Integration test:** `src/__tests__/llm-optional.test.ts` (or `server/__tests__/...` — researcher picks based on existing test infra). Mocks `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` as undefined, hits `/api/events` through the Express app harness, asserts `response.events.length > 0` AND that the response is sourced through the Pitfall 1 cache bridge (raw GDELT path), NOT from `events:llm:v3`. Runs on every PR. Locks the contract mechanically.
  - **Runbook entry:** Phase 29 writes the entry directly to `docs/runbook.md` under a new "LLM Pipeline Disabled / Keys Absent" section. Phase 35 ("Public Docs Sweep") only verifies the entry is still accurate after the v1.5 changes — does NOT need to author it from scratch. (Stage in phase dir if `docs/runbook.md` doesn't exist yet — researcher checks.) Section content: 5-step operator smoke (unset both env vars in Vercel, redeploy, hit `/api/events`, confirm events render, confirm DevApiStatus shows raw-GDELT source tier).

- **D-05: NO kill-switch env var. "Unset both keys" IS the kill switch.** Operators wanting to disable LLM extraction unset `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` in Vercel and redeploy. Same code path as the LLM-optional regression guard. No new `LLM_PIPELINE_ENABLED` env var, no DevApiStatus banner. Less surface area; matches existing `isLLMConfigured` pattern.

### CLAUDE.md Trim Methodology

- **D-06: Aggressive trim — target <10k tokens** (current ~17.5k tokens / 70461 bytes / 509 lines, measured 2026-05-09). Restructure to a current-state-invariants-only shape:
  - **Keep:** Project Context, Conventions, Environment Variables (Phase 28.1+ section), Color Tokens (Phase 28.1+ section), Map Patterns, Testing, Key Files, Data Model, Vercel Deployment, Serverless Cache (registry only — drop Phase-N narrative around each key).
  - **Delete:** ALL phase-narrative blocks from "Flight Data Patterns (Phase 4+)" through "Phase 28.2.5 API Green-Light Prereq Gate". Each replaced with a 1-line link: `For Phase X history see [milestones/v1.N-ROADMAP.md](milestones/v1.N-ROADMAP.md).`
  - **Delete (specifically obsoleted by this phase):** "LLM Enrichment v2 + Runtime Toggle (Phase 27.4)", "V2 Extractor Watchdog (Phase 27.4.1)", "Parallel v3 Batch Processing (Phase 27.4.4 Plan 02)", "Cron-Driven Pipeline Trigger (Phase 27.4.6)" narrative blocks; Cerebras + Groq references inside any remaining sections; v1+v2 extractor references everywhere.
  - **Update:** Serverless Cache registry — remove `events:llm-pipeline-override` (deleted by D-02), remove `events:llm:v2` if no live readers remain (researcher confirms), update `events:llm:v3` description to "active extractor cache, only key written by the cascade".

- **D-07: Verification = token count + 5-item operator spot-check.**
  - Token count: capture before/after via `npx tiktoken-cli` (or `wc -w * 1.3` rough estimate as a fallback) in the phase SUMMARY commit.
  - 5-item spot-check (operator skim test): can the operator find each of these in <30s? (1) Redis key contracts, (2) env vars + their defaults, (3) color tokens, (4) domain constants (IRAN_BBOX, IRAN_CENTER), (5) cron schedule. PASS = all five findable.

### Vercel Pro Upgrade

- **D-08: Pro upgrade BEFORE phase plans run. First Phase 29 commit = `chore(29): bump api/vercel-entry.js maxDuration 300 → 800 (Vercel Pro)`.** All subsequent code work on the phase branch runs against the Pro 800s ceiling. Operator action: upgrade in Vercel dashboard ($20/mo) immediately after this CONTEXT.md is committed and before the planner produces PLAN.md tasks. The maxDuration bump commit's PR description must call out the Pro dependency explicitly (so a future revert doesn't ship a maxDuration > Hobby ceiling).

- **D-09: Verify with BOTH dashboard check AND synthetic >300s invocation.**
  - Dashboard: operator confirms `https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing` shows Pro plan active.
  - Synthetic: hit `GET /api/cron/refresh-events?force=true` with the `CRON_SECRET` Bearer (or a manual Bearer token if exposed via gh-actions), watch for the function to actually run >300s wall-clock without being killed. Authoritative signal — if Vercel kills it at 300s, either the upgrade hasn't landed OR the maxDuration bump didn't deploy. Verify via `vercel logs` for the function's `Duration:` field on the matching invocation.

### Roadmap Side-Effect

- **D-10: Phase 34 scope reduced.** With v1+v2 deletion landing in Phase 29 (D-02), Phase 34's old success criterion #8 "v1 extractor archived (SIMPLIFY-06)" becomes inapplicable. Phase 34's Requirements list updated to remove SIMPLIFY-06; criteria renumbered 8→7 (drop the v1 archive criterion). Already committed as part of this phase's CONTEXT-prep on `feature/29-llm-cascade-narrowing-claude-md-cleanup` branch. REQUIREMENTS.md traceability table updated: SIMPLIFY-06 phase 34 → 29; phase distribution Phase 29 (5) · Phase 34 (9).

### Claude's Discretion

- The exact path / file location for the integration test (`src/__tests__/` vs `server/__tests__/`) — researcher picks based on whichever harness already exists for `/api/events` end-to-end testing.
- Whether the Express harness for the integration test mocks env vars via `vi.stubEnv` or via a test-only `createApp({ skipLLM: true })` factory parameter — researcher decides.
- The exact wording / structure of the `docs/runbook.md` "LLM Pipeline Disabled / Keys Absent" section — researcher follows the runbook's existing 28.2 W6 section style.
- The exact ADR-0009 stub structure — planner picks ADR template (likely follows existing `docs/adr/ADR-000X-*.md` convention if it exists; if no prior ADR exists, planner creates `docs/adr/` + ADR-0009 with a standard "Status / Context / Decision / Consequences" header).
- Whether the `events:llm:v2` Redis read fallback in the events route stays for graceful degradation during the deploy window or is removed in the same commit — researcher reads the bridge code at `server/routes/events.ts:701-731` and recommends.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.5 Milestone + Phase 29 Boundary

- `.planning/PROJECT.md` — vision, principles, non-negotiables
- `.planning/REQUIREMENTS.md` — 43 v1.5 requirements, full traceability table (LLM-RELI-01, LLM-RELI-05, SIMPLIFY-04, SIMPLIFY-06, DOCS-INT-01 are this phase's)
- `.planning/ROADMAP.md` §"Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + Cerebras/Groq Adapter Purge + v1/v2 Extractor Deletion + CLAUDE.md Trim" — full phase scope, success criteria 1-8, dependency notes
- `.planning/STATE.md` — current milestone position
- `CLAUDE.md` — current 17.5k-token shape; the trim target itself

### LLM Pipeline (current state, Phase 27.4 → 28.2.7 lineage)

- `server/adapters/llm-provider.ts` — current cascade (Cerebras → Groq → NIM → OpenRouter), the surface that gets narrowed in D-01
- `server/lib/llmEventExtractor.v3.ts` — the active extractor (~600 LOC, parallel limiter loop)
- `server/lib/llmEventExtractor.v2.ts` — DELETED in D-02
- `server/lib/llmEventExtractor.v1.ts` — DELETED in D-02
- `server/lib/llmEventExtractor.ts` — barrel router (currently routes by `isPipelineV2()` — collapses to v3-only after D-02)
- `server/config.ts` — `isLLMConfigured`, `isPipelineV2()`, `setPipelineOverride()`, `refreshPipelineOverride()` — the last three DELETED in D-02
- `server/routes/events.ts:701-731` — Pitfall 1 cache bridge (the "map never goes blank" guarantee — must NOT regress)
- `server/lib/llmExtractionPipeline.ts` — `runRefreshExtraction({triggeredBy, forceCooldown})`, the cron-only writer
- `server/routes/refresh-events-cron.ts` — the only caller of the helper above

### Vercel Project Config

- `vercel.json` — `functions["api/vercel-entry.js"].maxDuration: 300` (the bump target — D-08 changes to 800)
- `api/vercel-entry.js` — bundled serverless function entry point (1.72 MB at v1.4 close — Phase 34 measures the v1.5 close size)
- `https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing` — operator action D-08 (Pro upgrade)

### Override Endpoint + Dashboard Surface (all DELETED in D-02)

- `server/routes/events.ts` (the `POST /api/events/llm-pipeline` registration) — DELETED
- `src/components/ui/DevApiStatus.tsx` — Pin-to-v1 + Pin-to-v2 buttons + confirm modal (Phase 28.2 W5 D-22 surface) — DELETED
- `src/components/layout/Topbar.tsx` `PipelineVersionPill` (Phase 27.4 read-only indicator post-27.4.1 D-20 lockdown) — re-evaluated in D-02 cleanup; likely DELETED since it indicates a pipeline version that no longer varies

### Test + Verification Surface

- `src/__tests__/` + `server/__tests__/` — harness location for D-04 integration test (researcher picks based on existing patterns)
- `src/__tests__/api-connectivity.test.ts` (Phase 28.2 W6 D-30) — companion smoke; must pass post-Phase-29
- `src/__tests__/rate-limit.test.ts` (Phase 28.2 W6 D-30 companion) — must pass post-Phase-29
- `.github/workflows/prod-connectivity-audit.yml` (Phase 28.2 W6) — the eventual milestone-close gate; Phase 29 changes must not break it

### ADR + Documentation

- `docs/adr/` — directory for ADR-0009 stub (D-03). Planner creates the dir if it doesn't exist.
- `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` — written as a stub in Phase 29, expanded in Phase 36
- `docs/runbook.md` — D-04 receives the new "LLM Pipeline Disabled / Keys Absent" section
- `docs/degradation.md` — Pitfall 1 + cascade fallback contract; must NOT regress (Phase 29 success criterion #4)

### Phase 27.4 Lineage (the lock D-02 supersedes)

- `.planning/phases/27.4-llm-enrichment-improvements/27.4-CONTEXT.md` — Phase 27.4 D-26/D-40 lock that preserved v1+v2 as deep-rollback. D-03 ADR-0009 stub MUST cite this lock + the rationale for now retiring it (~2 weeks of stable v3 production + Pitfall 1 bridge handling map-never-blank independent of which extractor is active).
- `.planning/phases/27.4.1-v2-extractor-watchdog/` — for ADR-0009 timeline notes
- `.planning/phases/27.4.6-cron-driven-pipeline-trigger/` — for the cron trigger lineage

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Express test harness** — Phase 28.2 W6 added `src/__tests__/api-connectivity.test.ts` which exercises `/api/events` via a Bearer-attached fetch. The D-04 integration test should follow the same harness pattern (researcher picks: actual harness OR `vi.stubEnv` mocking pattern).
- **Bearer-bypass on global rate limit** (Phase 28.2 W2 D-04) — the integration test for D-04 must attach a Bearer (or hit a path with no per-endpoint cap) so the rate limiter doesn't 429 the test runs.
- **Cron `lastTick` writer pattern** (Phase 28.2.7) — the synthetic >300s invocation in D-09 will exercise `cron:lastTick:refresh-events` write inside the helper's success path; the watcher confirms the timestamp lands.
- **`tsx`-bundled Express factory** (`createApp()` in `server/app.ts`) — D-04 integration test instantiates the app via this factory so the test bypasses Vercel function harness entirely.

### Established Patterns

- **`POST /api/events/llm-pipeline` Bearer-gating** (Phase 28.2 W3 D-08) — when D-02 deletes this route, also remove the route from the Bearer-gated routes list in `server/middleware/dashboardAuth.ts` if it's enumerated there.
- **`logger.child({ module: '...' })` from `server/lib/logger.ts`** (Phase 28.1 W7) — any new code (e.g., the integration test wiring) MUST use this, not `console.*`.
- **Atomic-commit discipline per `gsd-executor`** — each D-N decision should land as a separate commit so revert is surgical (cascade narrowing → 1 commit, v1+v2 deletion → 1 commit, override-endpoint deletion → 1 commit, DevApiStatus button removal → 1 commit, CLAUDE.md trim → 1 commit, etc.).
- **CONVENTIONS.md TypeScript pinning** — TypeScript stays at ~5.9.3 (project convention). Don't bump.

### Integration Points

- `server/adapters/llm-provider.ts` — D-01 cascade narrowing edits here
- `server/lib/llmEventExtractor.ts` (barrel) — D-02 collapse to v3-only
- `server/config.ts` — D-01 + D-02 (`isLLMConfigured` + `isPipelineV2()` removal)
- `server/routes/events.ts` — D-02 deletes the override route + Pitfall 1 bridge re-evaluation
- `src/components/ui/DevApiStatus.tsx` — D-02 deletes Pin-to-v1/v2 buttons
- `src/components/layout/Topbar.tsx` — D-02 likely deletes `PipelineVersionPill`
- `vercel.json` — D-08 first commit (maxDuration 300→800)
- `CLAUDE.md` — D-06 final commit of the phase (trim happens AFTER the code work so the trim doesn't lose context the implementer needed mid-phase)
- `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` — D-03 stub written here
- `docs/runbook.md` — D-04 runbook entry written here

</code_context>

<specifics>
## Specific Ideas

- **Token count baseline (CLAUDE.md):** 70461 bytes / 509 lines / ~17.5k tokens (measured 2026-05-09 via `wc -c CLAUDE.md`). Trim target: <10k tokens. Captured in commit message of the trim commit.
- **Bundle baseline (`api/vercel-entry.js`):** 1.72 MB at v1.4 close (per `.planning/ROADMAP.md` v1.4 quantitative delta). Phase 34 measures the v1.5 close — Phase 29 is informational only, but the v1+v2 deletion in D-02 should drop ~30-50KB before Phase 34 even starts.
- **Operator action timing:** Pro upgrade happens AFTER CONTEXT.md is committed but BEFORE planner runs. The first commit on the phase branch is `chore(29): bump maxDuration 300 → 800 (Vercel Pro)`. The PR description must call out the Pro dependency.
- **Override-endpoint cleanup is irreversible at the Redis layer:** `events:llm-pipeline-override` Redis key is left to TTL-expire (7d) rather than DEL'd in code — naturally cleans up. If a stale override is observed in production after deploy, operator can `redis-cli del events:llm-pipeline-override` manually.
- **No PR-trigger for `prod-connectivity-audit.yml` change:** Phase 29 does NOT promote the audit workflow to PR-trigger. It stays manual-trigger (Phase 28.2 W6 D-29 lock); Phase 36 closes the gate by manual operator runs.

</specifics>

<deferred>
## Deferred Ideas

- **`PipelineVersionPill` complete removal vs degraded display** — D-02 marks it for likely deletion, but if the implementer finds it still has utility (e.g., showing `v3` even when no toggle exists), researcher can recommend keeping it as a static "v3" badge. Note in PR description.
- **Reduce `Topbar` import surface after `PipelineVersionPill` deletion** — opportunistic; not in scope unless removal trivially enables it.
- **`docs/adr/` directory creation** — if no prior ADRs exist (likely, no ADR-0008 referenced anywhere), the planner creates the directory + a top-level `docs/adr/README.md` describing the ADR convention. Otherwise just adds ADR-0009 stub alongside existing.
- **`callHistory` shape simplification** — with only 2 providers in the cascade, the `skipReason` enum could shrink. Out of scope; Phase 30 might revisit when tuning.
- **Replace `isPipelineV2()` callers with hardcoded `true` then collapse** — researcher decides whether to do the collapse in the same commit or sequentially.
- **Anti-pattern #19** — do not re-introduce v1 / v2 extractor modules without a new ADR superseding the v1.5 decision. The deletion is intentional; "I might need it" is not justification.

</deferred>

---

_Phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce_
_Context gathered: 2026-05-09_
