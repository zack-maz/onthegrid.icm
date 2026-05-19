# Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + Cerebras/Groq Adapter Purge + v1/v2 Extractor Deletion + CLAUDE.md Trim — Research

**Researched:** 2026-05-09
**Domain:** Code deletion + runtime cascade narrowing + serverless config + docs cleanup. No new feature work; no AI framework selection; no DB schema migration; no UI design beyond button removal.
**Confidence:** HIGH (codebase fully read end-to-end on the load-bearing surfaces; CONTEXT decisions are locked; file-line provenance attached to every claim).

## Summary

Phase 29 is a deletion/narrowing phase across four orthogonal but co-shipped tracks: (1) cut Cerebras + Groq out of the active runtime cascade in `server/adapters/llm-provider.ts`, (2) hard-delete the v1 + v2 extractor modules + the `POST /api/events/llm-pipeline` override endpoint + `events:llm-pipeline-override` Redis key + DevApiStatus Pin-to-v1/v2 buttons + the entire pipeline-override toggle surface, (3) prove the LLM-optional architecture works (CI integration test + runbook entry) using `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` both unset, and (4) trim CLAUDE.md from 18,846 tokens (verified 2026-05-09 via `npx tiktoken-cli CLAUDE.md` — gpt-4o tokenizer) to <10k tokens by deleting all phase-narrative blocks and keeping current-state-invariants only. The Vercel Pro upgrade is the **first commit** so the entire phase runs against the 800s `maxDuration` ceiling, not Hobby's 300s.

The work is mechanically straightforward but blast-radius-heavy: the v1+v2 deletion touches ~14 server files (config, route, barrel, extractor lineage, ~10 test files), 2 client files (DevApiStatus, Topbar), and unblocks 4 stale auto-rollback mechanisms inside v3.ts itself that target "v2" as the rollback destination — those auto-rollback paths must be re-routed (or the v3 extractor's auto-rollback must be retired entirely; the planner picks). The Pitfall 1 cache bridge in `server/routes/events.ts:701-731` has a v3→v2→v1 fallback chain whose v2 leg becomes vestigial after D-02 and whose v1 leg already is — both must be re-evaluated alongside the route deletion, not after.

Two surprises surfaced in research that the planner needs to absorb before producing tasks:

1. **ADR numbering collision.** ADR-0009 is already taken by the existing `0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` (Accepted, Phase 27.4.1). The CONTEXT D-03 + REQUIREMENTS DOCS-PUB-04 + ROADMAP all repeatedly reference "ADR-0009" as the v1.5 ADR number. **The Phase 29 ADR stub MUST be ADR-0010, not ADR-0009.** Title slug suggested: `0010-v1-5-llm-pipeline-narrowing-and-deletion.md`. Three doc sites drift in tandem (CONTEXT, REQUIREMENTS, ROADMAP) — planner should land an ADR-numbering fixup commit before/alongside the stub.

2. **ROADMAP success criterion 3 conflicts with CONTEXT D-02.** ROADMAP line 125 says "v1 + v2 extractor code paths are still importable as deep-rollback safety per Phase 27.4 D-26/D-40 (operator can flip back via `POST /api/events/llm-pipeline {version: 'v1'}` or `'v2'`)" — but CONTEXT D-02 explicitly DELETES the modules, the route, and the override key. The CONTEXT supersedes the ROADMAP per gsd workflow (CONTEXT was committed AFTER ROADMAP per its 2026-05-09 date and explicit "supersedes" language at D-02). Planner's RESEARCH-section-level fix: the ROADMAP success criterion list must be reconciled with CONTEXT D-02 — that's a documentation update task, not a code task.

**Primary recommendation:** Plan 9 atomic commits in the order suggested by CONTEXT, with one important refinement — split D-02 into 4 commits (override route + helpers; v2 extractor module; v1 extractor module; DevApiStatus + Topbar UI) so each commit has a tight grep-verifiable scope. Land the ADR + runbook + test commits together at the END of the code work (so tests guard the final shape, not an intermediate one). The CLAUDE.md trim is the LAST commit (per CONTEXT's reasoning: trim happens after code work so the implementer keeps narrative context until the last step).

## Architectural Responsibility Map

| Capability                           | Primary Tier                                          | Secondary Tier                   | Rationale                                                                               |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| LLM provider cascade orchestration   | API/Backend (`server/adapters/llm-provider.ts`)       | —                                | Server-only; client never sees provider details                                         |
| Pipeline version override (DELETED)  | API/Backend route + Redis                             | Browser/Client (toggle UI)       | Cross-tier deletion — server route + client buttons must come down together             |
| Pitfall 1 cache bridge               | API/Backend (`server/routes/events.ts:701-731`)       | Database/Storage (Upstash Redis) | Server-only fallback; cache layer is the persistence tier                               |
| LLM-optional integration test (NEW)  | API/Backend test (server/**tests**/)                  | —                                | Mirrors `events-fallback.test.ts` precedent — tests the route via `createApp()` factory |
| Vercel Pro `maxDuration` config      | CDN/Static (vercel.json)                              | —                                | Build-time deployment config; not runtime                                               |
| CLAUDE.md trim                       | Repo-root docs                                        | —                                | Pure docs work; no tier owns; planner-readable                                          |
| ADR-0010 stub                        | Repo-root docs (`docs/adr/`)                          | —                                | Pure docs work                                                                          |
| Runbook entry                        | Repo-root docs (`docs/runbook.md`)                    | —                                | Pure docs work                                                                          |
| DevApiStatus button removal          | Browser/Client (`src/components/ui/DevApiStatus.tsx`) | —                                | UI-only deletion                                                                        |
| Topbar `PipelineVersionPill` removal | Browser/Client (`src/components/layout/Topbar.tsx`)   | —                                | UI-only deletion (recommended; see Open Question 5)                                     |

**Why this matters:** The override-endpoint deletion crosses two tiers (API route + UI button) — those MUST land in the same commit (or adjacent same-PR commits) because shipping the UI deletion without the route deletion leaves a no-op button, and shipping the route deletion without the UI leaves a UI that 404s. CONTEXT D-02 implicitly bundles them; the planner should explicitly bundle them.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Hard-delete Cerebras + Groq from runtime path.** Delete from the cascade order array, the `createLLMClient` factory, `isLLMConfigured` gating, and the synthetic `skipReason: 'no_client'` callHistory entries in `server/adapters/llm-provider.ts`. The Cerebras + Groq adapter source files themselves stay in `server/adapters/` (importable for emergency rollback) but **no production code path imports them**. `CEREBRAS_API_KEY` / `GROQ_API_KEY` env-var checks removed from `isLLMConfigured` (`NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` are the only keys gating the cascade). Verification signal: `callHistory` shows ONLY `nim` and `openrouter` provider names. Rollback path: `git revert` the SIMPLIFY-04 commit.

- **D-02: DELETE v1 + v2 extractor modules entirely.** Removes:
  - `server/lib/llmEventExtractor.v1.ts` — deleted
  - `server/lib/llmEventExtractor.v2.ts` — deleted
  - `POST /api/events/llm-pipeline` route — deleted (404, not 410 — clean removal)
  - `events:llm-pipeline-override` Redis key — writes deleted, key naturally TTL-expires within 7d
  - `refreshPipelineOverride()` + `setPipelineOverride()` helpers in `server/config.ts` — deleted
  - DevApiStatus Pin-to-v1 + Pin-to-v2 buttons + their confirm modal — deleted
  - `events:llm:v2` + `events:llm:v3:partial` Redis read fallbacks in events route Pitfall 1 bridge — re-evaluated (raw GDELT remains terminal fallback)
  - All tests, fixtures, and mocks referencing v1 / v2 extractors
  - CLAUDE.md narrative blocks for "V2 Extractor Watchdog (Phase 27.4.1)" and "LLM Enrichment v2 + Runtime Toggle (Phase 27.4)" — deleted as part of D-06 trim
- Supersedes: Phase 27.4 D-26/D-40 (v1+v2 preserved as deep-rollback). Justification recorded in D-03 (ADR rationale).
- Rollback path: `git revert <Phase 29 commit range>` + `vercel --prod`. Wall-clock minutes, not a Bearer-POST flip.

- **D-03: Fold v1+v2 retirement rationale into ADR-0009 at Phase 37, write stub now.** A short ADR-0009 stub file is committed in Phase 29 at `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` containing: the v1→v2→v3 evolution timeline, what was deleted in Phase 29, what the new rollback path is, and a `<expand_at_36>` marker. **CRITICAL — see Open Question 4: ADR-0009 is already taken by the two-key-split ADR. The new ADR must use ADR-0010.**

- **D-04: Both integration test (CI guard) AND runbook entry (operator-facing).** Integration test at `src/__tests__/llm-optional.test.ts` OR `server/__tests__/...` — researcher picks. Runbook entry written directly to `docs/runbook.md` "LLM Pipeline Disabled / Keys Absent" section.

- **D-05: NO kill-switch env var. "Unset both keys" IS the kill switch.** No `LLM_PIPELINE_ENABLED`, no DevApiStatus banner.

- **D-06: Aggressive CLAUDE.md trim — target <10k tokens** (current 18,846 verified via tiktoken-cli, 70,461 bytes, 509 lines). Restructure to current-state-invariants only.

- **D-07: Verification = token count + 5-item operator spot-check** (Redis keys, env vars, color tokens, domain constants, cron schedule findable in <30s).

- **D-08: Pro upgrade BEFORE phase plans run. First Phase 29 commit = `chore(29): bump api/vercel-entry.js maxDuration 300 → 800 (Vercel Pro)`.**

- **D-09: Verify with BOTH dashboard check AND synthetic >300s invocation** against `/api/cron/refresh-events?force=true` with `CRON_SECRET` Bearer.

- **D-10: Phase 35 scope reduced.** SIMPLIFY-06 retired from Phase 35, criteria renumbered. Already committed.

### Claude's Discretion

- Exact path / file location for the integration test (`src/__tests__/` vs `server/__tests__/`) — researcher picks.
- Whether the Express harness mocks env vars via `vi.stubEnv` or via a test-only `createApp({ skipLLM: true })` factory parameter.
- Exact wording / structure of the `docs/runbook.md` "LLM Pipeline Disabled / Keys Absent" section.
- Exact ADR stub structure.
- Whether the `events:llm:v2` Redis read fallback in the events route stays for graceful degradation or is removed in the same commit.

### Deferred Ideas (OUT OF SCOPE)

- `PipelineVersionPill` complete removal vs degraded display (researcher recommendation: DELETE — see Question 5 below).
- Reduce `Topbar` import surface after `PipelineVersionPill` deletion.
- `docs/adr/` directory creation (already exists — README.md present, 9 ADRs already committed).
- `callHistory` shape simplification.
- Replace `isPipelineV2()` callers with hardcoded `true` then collapse.
- Anti-pattern #19 — do not re-introduce v1/v2 modules.

## Phase Requirements

| ID          | Description                                                                       | Research Support                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-RELI-01 | Active runtime provider cascade narrowed to NIM (primary) + OpenRouter (fallback) | D-01 surface fully inventoried below (Question 1). Cascade narrowing edits = `server/adapters/llm-provider.ts` lines 25-41 (factories), 76, 101, 106, 145-148 (cerebras/groq references), 195-198 (`getProviderOrder` returns `['cerebras','groq']`), 279-286 (`isLLMConfigured`).             |
| LLM-RELI-05 | LLM-optional architecture proven via integration test + runbook                   | D-04 surface mapped (Question 4). `server/__tests__/routes/events-fallback.test.ts` is the existing precedent — uses `createApp()` factory with mocked `isLLMConfigured` returning false. New `llm-optional.test.ts` follows the same pattern, drops directly into `server/__tests__/routes/`. |
| SIMPLIFY-04 | Cerebras + Groq adapter dead-code purged                                          | Same as LLM-RELI-01 surface; D-01 lock requires modules left importable but no production import sites. Verification grep target: `grep -rn 'cerebras\|groq' server/adapters/llm-provider.ts server/routes/ server/lib/llmExtractionPipeline.ts` returns ZERO matches in the runtime path.     |
| SIMPLIFY-06 | v1 + v2 extractor modules deleted (full deletion, not archive)                    | D-02 surface fully traced (Question 2). 14 server files + 2 client files affected.                                                                                                                                                                                                             |
| DOCS-INT-01 | CLAUDE.md trimmed to current-state invariants                                     | D-06 surface inventoried (Question 6). 39 sections total; 13 sections survive the trim, 26 sections delete. Baseline 18,846 tokens; target <10,000. Estimated post-trim: ~7,500 tokens (40% under target).                                                                                     |

## Standard Stack

### Core (existing — no new dependencies introduced this phase)

| Library          | Version                   | Purpose             | Why Standard                                                                      |
| ---------------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Vitest           | (pinned via package.json) | Test runner         | Already the project's test framework; D-04 test extends existing harness pattern  |
| Express          | (existing)                | HTTP server         | `createApp()` factory in `server/index.ts` is the test-time entrypoint            |
| `@upstash/redis` | (existing)                | Redis client        | `events:llm-pipeline-override` writes deleted; reads `events:llm:v2` re-evaluated |
| TypeScript       | ~5.9.3                    | Strict-mode compile | Per CLAUDE.md `Conventions` — pinned to ~5.9.3, do not bump                       |

**No package-version research needed.** D-01/D-02/D-04 are deletion + test-extension work using libraries already pinned in package.json. This phase changes ZERO dependencies. [VERIFIED: codebase grep + CLAUDE.md `Conventions` section]

### Alternatives Considered

| Instead of                         | Could Use                                                                   | Tradeoff                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createApp()` factory in test      | `RUN_CONNECTIVITY_TEST=1` prod-URL smoke (api-connectivity.test.ts pattern) | Smoke tests run against deployed prod; integration tests run in-process. D-04 requires deterministic env-var stubbing → in-process is the right tier. [VERIFIED: api-connectivity.test.ts L26-30 — `describe.skipIf(!RUN)` makes it network-prod-only by default]                                                      |
| `vi.stubEnv` for the env-var unset | `createApp({ skipLLM: true })` factory parameter                            | `vi.stubEnv` matches the existing `events-fallback.test.ts` precedent (uses `vi.mock('../../adapters/llm-provider.js', ...)` with a `mockIsLLMConfigured` returning `false` — see L67, L149-152). New parameter would invent a test-only API surface for a one-shot use case. RECOMMENDED: stay with the mock pattern. |
| ADR number 0009 (per CONTEXT)      | ADR number 0010                                                             | ADR-0009 already exists (`0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md`, Accepted 2026-04-24). The CONTEXT references "ADR-0009" but that number is taken. Planner MUST use 0010. [VERIFIED: `ls docs/adr/` returned 0001-0009 + README + template]                                                |

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────┐
                    │  /api/cron/refresh-events (4am UTC) │
                    │   + ?force=true (operator manual)    │
                    └─────────────┬────────────────────────┘
                                  │
                                  ▼
            ┌─────────────────────────────────────┐
            │  runRefreshExtraction (the only     │
            │  caller of LLM extractor; cron-only │
            │  per Phase 27.4.6 D-04)             │
            └─────────────────────────────────────┘
                                  │
                  ┌───────────────┼───────────────────┐
                  │               │                   │
        cooldown check    isLLMConfigured?   raw GDELT empty?
        (15 min)          (NEW: NIM | OR     (skip if no rows)
                            keys only —
                            D-01 narrows
                            from 4 keys
                            to 2)
                                  │
                                  ▼
            ┌────────────────────────────────────┐
            │ processEventGroupsV3()             │
            │   ├─ freeClaudeRouter.callLLM ────▶ NVIDIA NIM
            │   │                              ─▶ OpenRouter
            │   │   (existing v3 path; UNCHANGED)
            │   └─ ⚠ DELETED: v2 fallback path
            └────────────────────────────────────┘
                                  │
                                  ▼
            ┌────────────────────────────────────┐
            │ events:llm:v3 (TERMINAL CACHE)     │
            └────────────────────────────────────┘

         ┌──── /api/events READ PATH ────┐
         │                               │
         ▼                               │
   events:llm:v3 (fresh) ─→ serve enriched ──┐
         │                                   │
         │ (empty)                           │
         ▼                                   │
   ⚠ DELETE v2 + v3:partial fallback        │
   legs in Pitfall 1 bridge per D-02         │
   (server/routes/events.ts:701-731)         │
         │                                   │
         ▼                                   │
   events:gdelt (raw GDELT) ─→ serve raw ────┴──▶ map renders

   When BOTH NIM + OpenRouter keys absent (D-04 LLM-optional test):
       isLLMConfigured() = false
       → cron route 'llm_unconfigured' early-return
       → events:llm:v3 stays empty
       → /api/events skips cache, falls through to raw GDELT path
       → response.events.length > 0 (raw GDELT survives WAR_START prune)
       → MAP RENDERS RAW GDELT — Pitfall 1 invariant preserved
```

### Recommended Project Structure (deletion targets)

```
server/
├── adapters/
│   ├── llm-provider.ts          # NARROW: cerebras+groq → NIM+OpenRouter (D-01)
│   ├── cerebras.ts              # KEEP file but no longer imported (D-01)
│   └── groq.ts                  # (does not exist as file; in llm-provider.ts)
├── lib/
│   ├── llmEventExtractor.ts     # SIMPLIFY: collapse v1/v2/v3 dispatch → v3-only (D-02)
│   ├── llmEventExtractor.v1.ts  # DELETE (D-02)
│   ├── llmEventExtractor.v2.ts  # DELETE (D-02)
│   └── llmEventExtractor.v3.ts  # KEEP — primary extractor; remove auto-rollback-to-v2 logic (D-02)
├── config.ts                    # SIMPLIFY: remove setPipelineOverride, isPipelineV2,
│                                #          getPipelineVersion → returns 'v3' constant
└── routes/
    ├── events.ts                # DELETE: refreshPipelineOverride, GET/POST /llm-pipeline,
    │                            #         PIPELINE_OVERRIDE_KEY, v2/v3:partial bridge legs
    └── operator-status.ts       # SIMPLIFY: remove pipeline-override-TTL block
src/
├── components/
│   ├── ui/DevApiStatus.tsx      # DELETE: Pin-to-v1/v2 buttons + confirm modal
│   └── layout/Topbar.tsx        # DELETE: PipelineVersionPill (recommended)
docs/
├── adr/
│   └── 0010-v1-5-llm-pipeline-narrowing-and-deletion.md  # NEW (D-03 — NOTE 0010 not 0009)
└── runbook.md                   # APPEND: "LLM Pipeline Disabled / Keys Absent" section (D-04)
```

### Pattern 1: Express factory + supertest-style fetch — used by D-04 integration test

**What:** `server/__tests__/routes/events-fallback.test.ts` instantiates the Express app via `createApp()` factory, listens on port 0, fetches `/api/events`, asserts the response shape.

**When to use:** D-04 integration test follows this exact pattern.

**Example (verbatim from existing test, L215-225):**

```typescript
// Source: server/__tests__/routes/events-fallback.test.ts
const { createApp } = await import('../../index.js');
const app = createApp();
await new Promise<void>((resolve) => {
  server = app.listen(0, () => {
    const addr = server.address();
    if (addr && typeof addr !== 'string') {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
    resolve();
  });
});

// In a test body:
mockIsLLMConfigured.mockReturnValue(false);
const res = await fetch(`${baseUrl}/api/events`);
const body = await res.json();
expect(res.ok).toBe(true);
expect(body.data.length).toBeGreaterThan(0);
```

[VERIFIED: server/__tests__/routes/events-fallback.test.ts:215-225, 266-276]

### Pattern 2: Synthetic-call-history skip-entry semantics

**What:** `recordSkippedAttempt(provider, batchSize, skipReason)` in `server/adapters/llm-provider.ts:71-88` synthesizes a `callHistory` entry when a provider is bypassed without network activity. Currently called from L101-104 (no_client), L221-224 (breaker), L228-230 (hard_cap).

**Post-D-01 narrowing:** the skipReason `'no_client'` synthesis branch becomes unreachable because the cascade only contains NIM + OpenRouter — and those use a different path (`freeClaudeRouter.callLLM`), not `tryProviderOnce`. Per D-01 explicitly: "the synthetic `skipReason: 'no_client'` callHistory entries for those providers are gone." The verification signal is: `grep -rn 'no_client' server/` returns ZERO matches in `server/adapters/llm-provider.ts` post-narrowing.

[VERIFIED: server/adapters/llm-provider.ts:71-104]

### Pattern 3: ADR template structure

**What:** Existing ADRs follow the Michael Nygard short template — Status / Date / Deciders / Context / Decision / Consequences (Positive/Negative/Neutral) / Alternatives Considered / References.

**When to use:** D-03 ADR-0010 stub follows this template; the `<expand_at_36>` marker goes in the Decision section (or in Alternatives Considered as "details deferred to milestone-close").

**Example (verbatim from existing ADR-0009 header):**

```markdown
# ADR-0010: v1.5 LLM pipeline narrowing and deletion

**Status:** Accepted
**Date:** 2026-05-09
**Deciders:** solo author

## Context

[v1→v2→v3 evolution timeline; cite Phase 27.4 D-26/D-40 lock]

## Decision

[narrowed cascade to NIM + OpenRouter; deleted v1+v2 modules; LLM-optional architecture proven]
<expand_at_36>

## Consequences

[positive: smaller surface; negative: rollback now requires git revert not Bearer POST]
```

[VERIFIED: docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md L1-6, 156-167; docs/adr/README.md L94-99 conventions block]

### Anti-Patterns to Avoid

- **Re-introducing fire-and-forget extraction back into `/api/events`** — anti-pattern #17, locked by Phase 27.4.6 D-04. The route is cache-only.
- **Re-introducing v1/v2 extractor modules without a new ADR superseding the v1.5 decision** — explicit deferred-anti-pattern #19 from CONTEXT.
- **Bypassing the cron cooldown OR cron `lastTick` writer pattern** — anti-pattern #18; the override deletion does not touch this.
- **Writing the ADR as ADR-0009** — already taken; would clobber the two-key-split rationale.
- **Bundling the `vercel.json` `maxDuration` bump (D-08) with any other code change** — D-08 explicitly mandates it as the FIRST commit so a future revert lands cleanly.
- **Shipping the DevApiStatus button removal in a different commit from the route deletion** — leaves a no-op button OR a 404'ing button mid-deploy. Bundle them.
- **Touching `events:llm:v3` cache writes** — this phase's scope is the `events:llm:v2` + `events:llm:v3:partial` fallback legs in the bridge; the v3 terminal write at `cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, ...)` in `llmExtractionPipeline.ts:131` MUST stay.

## Don't Hand-Roll

| Problem                                    | Don't Build                                          | Use Instead                                                                                                                                | Why                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-optional integration test harness      | New `createApp({ skipLLM: true })` factory parameter | `vi.mock('../../adapters/llm-provider.js', () => ({ isLLMConfigured: () => false, callLLM: () => null }))`                                 | Pattern already proven in `events-fallback.test.ts:149-152`. New factory parameter is dead weight.                                                                                                   |
| ADR template                               | New custom format                                    | `docs/adr/template.md`                                                                                                                     | Project convention; existing 9 ADRs all follow it. README.md mandates Michael Nygard format.                                                                                                         |
| Tokencount measurement                     | Custom `wc -w * 1.3` rough estimate                  | `npx tiktoken-cli CLAUDE.md`                                                                                                               | tiktoken-cli is already on the path (verified — version 0.4.1). Returns `18846 CLAUDE.md` for the gpt-4o tokenizer. CONTEXT mentions both methods but tiktoken is more honest.                       |
| Bearer fingerprint generation for the test | Recomputing SHA-256                                  | Skip Bearer entirely — D-04 test runs in dev mode where `dashboardAuth` middleware bypasses (see `server/middleware/dashboardAuth.ts:34`). | The test runs against `createApp()` with `NODE_ENV !== 'production'`, so the middleware bypasses. No Bearer needed. [VERIFIED: server/middleware/dashboardAuth.ts:31-37]                             |
| LLM-optional kill-switch env var           | New `LLM_PIPELINE_ENABLED=false`                     | Unset both `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY`                                                                                     | D-05 explicit lock. `isLLMConfigured()` already gates on these two keys (post-D-01 narrowing). Adding a kill-switch creates two ways to disable LLM, doubles the test surface, and contradicts D-05. |

**Key insight:** This phase is mostly DELETION. The "don't hand-roll" pattern is "don't invent new test infrastructure / new env vars / new factory parameters" — every new abstraction is a future debt liability for code that's actively shrinking.

## Runtime State Inventory

This is a refactor/deletion phase. Per gsd-phase-researcher protocol, every category must be answered explicitly.

| Category                                         | Items Found                                                                                                                                                                                                                                                                                                                                                           | Action Required                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data                                      | **`events:llm-pipeline-override`** Redis key with current TTL up to 7d. Currently writable by deleted `POST /api/events/llm-pipeline` route (`server/routes/events.ts:601-606`). After D-02 deploy, NO new writes occur; existing keys naturally TTL-expire within 7d.                                                                                                | **Code edit only.** Per CONTEXT D-02 explicit decision: writes deleted, key TTL-expires naturally. If a stale value is observed in production after deploy, operator can `redis-cli del events:llm-pipeline-override` manually (CONTEXT specifics block confirms).                                                                                                                                                                                               |
| Stored data (continued)                          | **`events:llm:v2`** Redis key — terminal v2 cache, last written by `server/lib/llmExtractionPipeline.ts:131` when `pipelineV2 === true`. After D-02, no writers (v2 extractor module deleted). Reader at `server/routes/events.ts:702` (Pitfall 1 bridge).                                                                                                            | **Code edit (read-side cleanup).** The v2 fallback leg in the bridge becomes vestigial. RECOMMENDATION (Question 3): delete the v2 leg in the same commit as the v2 extractor deletion to keep blast radius coherent.                                                                                                                                                                                                                                            |
| Stored data (continued)                          | **`events:llm:v3:partial`** Redis key — observability-only partial-progress cache for v3 extractor. Written by `server/lib/llmEventExtractor.v3.ts:120` (key constant). Read by Pitfall 1 bridge (line 702 — actually the bridge reads `events:llm:v2`, NOT v3:partial — verified).                                                                                   | **No action needed.** The v3:partial key is observability-only; it stays under v3. The CONTEXT mentions it as "re-evaluated" in D-02 but the actual `events.ts:701-731` bridge does NOT read v3:partial. The CONTEXT's mention of v3:partial is a leftover from earlier drafts; the planner should confirm by reading the bridge code. [VERIFIED: server/routes/events.ts:701-731 reads `events:llm:v2` and `LLM_EVENTS_KEY` (=v1), NOT `events:llm:v3:partial`] |
| Stored data (continued)                          | **`events:llm:v2:partial`** Redis key — observability-only partial cache for v2 extractor (per ADR-0009 "two-key split"). Written by `writePartialCache` in `server/lib/llmEventExtractor.v2.ts:LLMCachePayload` shape. After D-02, no writers; key TTL-expires.                                                                                                      | **Code edit only.** Same as `events:llm-pipeline-override` — writes deleted via module deletion; key naturally expires. ADR-0009 (the existing two-key-split ADR) becomes partially obsolete; the planner notes this in the Phase 37 ADR-0010 Consequences section.                                                                                                                                                                                              |
| Stored data (continued)                          | **`events:llm-summary:v2`**, **`events:llm-summary`** (v1) Redis keys — last-run summary metadata. Read by `server/routes/events.ts:374-380` `/llm-status` endpoint via `LLM_SUMMARY_KEY_ACTIVE` branching. After D-02, no writers, no readers (the `getPipelineVersion()` branch returning v2/v1 is gone).                                                           | **Code edit (route handler simplification).** The `LLM_SUMMARY_KEY_ACTIVE` branching collapses to `events:llm-summary:v3` only. Keys naturally TTL-expire (24h).                                                                                                                                                                                                                                                                                                 |
| Live service config                              | NONE. Vercel project config (`vercel.json`) is in git; Vercel cron schedules read from `vercel.json` at deploy time. No external service has v1/v2 configuration outside the repo.                                                                                                                                                                                    | **None — verified by reading `vercel.json` end-to-end (16 lines).**                                                                                                                                                                                                                                                                                                                                                                                              |
| OS-registered state                              | NONE. No Windows Task Scheduler / launchd / systemd units. Vercel handles cron via `vercel.json`.                                                                                                                                                                                                                                                                     | **None — Vercel-hosted; OS-registered state lives entirely in the platform.**                                                                                                                                                                                                                                                                                                                                                                                    |
| Secrets and env vars                             | **`CEREBRAS_API_KEY`** + **`GROQ_API_KEY`** in `server/config.ts:31-32` (Zod schema). Code references in `server/adapters/llm-provider.ts:26,28,35,37,281-282`. After D-01 narrowing: env vars stay defined in Zod (defaults to `''` so absent var still parses), but `isLLMConfigured` no longer reads them.                                                         | **Code edit only.** Vercel dashboard env vars: operator can leave them set (they're ignored) OR remove them. CONTEXT D-01 doesn't mandate Vercel-side cleanup — recommended to leave them set during the deploy window so a `git revert` rollback finds them. After Phase 30 close, operator can prune them from the Vercel dashboard.                                                                                                                           |
| Secrets and env vars (continued)                 | **`LLM_PIPELINE_V2`** + **`LLM_PIPELINE_V3`** env vars referenced in `server/config.ts:344, 358` (`process.env.LLM_PIPELINE_V2 === 'true'` / `LLM_PIPELINE_V3 === 'true'`). After D-02: both readers (`isPipelineV2`, `isPipelineV3`, `getPipelineVersion`) deleted. Env vars become inert.                                                                           | **Code edit only.** Vercel dashboard cleanup deferred to Phase 30+ (consistent with Cerebras+Groq env-var handling).                                                                                                                                                                                                                                                                                                                                             |
| Secrets and env vars (continued)                 | **`V3_BAKEOFF_MODEL`** referenced in `server/lib/llmEventExtractor.v3.ts:100`. NOT touched by Phase 29 — used for ad-hoc bake-off runs, not load-bearing.                                                                                                                                                                                                             | **None.**                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Build artifacts / installed packages             | **`api/vercel-entry.js`** — 1.72 MB at v1.4 close (per `.planning/STATE.md` reference deployment). Phase 29 D-08 changes its `maxDuration` config but the **bundle itself is regenerated on every deploy via `tsup`** (per CLAUDE.md `Vercel Deployment` section). The v1+v2 extractor module deletion in D-02 will reduce bundle size by ~30-50KB on the next build. | **None — auto-regenerated by `npm run build`.** Phase 35 measures the v1.5 close size (per ROADMAP). Phase 29 is informational only. [VERIFIED: api/vercel-entry.js current size 1,808,710 bytes via `wc -c`]                                                                                                                                                                                                                                                    |
| Build artifacts / installed packages (continued) | **TypeScript declaration files (`.d.ts`)** — `server/lib/llmEventExtractor.v1.ts` + `.v2.ts` produce declaration files at build time via `tsc`. After deletion, these files no longer build.                                                                                                                                                                          | **None — auto-cleaned by build.**                                                                                                                                                                                                                                                                                                                                                                                                                                |

**The canonical question — what runtime systems still have stale references after D-02?** Answer: only the two Redis keys (`events:llm-pipeline-override` and `events:llm:v2:partial`), both observability-only or override-state, both with TTLs that naturally expire within 7d. No data migration is required; no operator action is required between deploy and first cron tick. The "map never goes blank" invariant holds throughout the deploy window because: (a) `events:llm:v3` is fresh from the most recent cron tick, (b) `events:gdelt` raw cache is always populated by the polling layer, (c) Pitfall 1 bridge falls through to raw GDELT when v3 is empty.

## Common Pitfalls

### Pitfall 1: ADR numbering collision (HIGH-IMPACT, mechanical fix)

**What goes wrong:** Phase 29 ships an ADR file at `docs/adr/ADR-0009-llm-pipeline-v1-5-decisions.md` (per CONTEXT D-03 spec) — clobbers the existing `0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` ADR or creates a duplicate-numbered file that breaks the README.md index.

**Why it happens:** CONTEXT D-03 + REQUIREMENTS DOCS-PUB-04 + ROADMAP all reference "ADR-0009" without checking the existing inventory. The two-key-split ADR was committed 2026-04-24 (Phase 27.4.1 incident response), well after the v1.5 milestone was conceptualized.

**How to avoid:** Phase 29 stub MUST be ADR-0010, not ADR-0009. Filename: `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (matches existing slug convention — see `docs/adr/0008-ethnic-distribution-via-geoepr-with-hatched-overlays.md`). Update `docs/adr/README.md` index table to include the new row. Update CONTEXT.md, REQUIREMENTS.md, and ROADMAP.md to reference ADR-0010 instead of ADR-0009 (small docs-fixup commit; planner decides whether to bundle with the ADR commit or land separately).

**Warning signs:** `ls docs/adr/0009*` returns the existing two-key-split file; `cat docs/adr/README.md | grep 0009` shows the existing entry already taken.

[VERIFIED: ls + read of docs/adr/]

### Pitfall 2: v3 extractor's auto-rollback-to-v2 mechanism (HIGH-IMPACT, design-shape fix)

**What goes wrong:** `server/lib/llmEventExtractor.v3.ts:1050-1097` defines `performAutoRollbackToV2()` + `checkWatchdogRecurrenceTrigger()` that flip the pipeline override to `'v2'` when the v3 extractor sees ≥2 watchdog timeouts in a single run. After D-02 deletes the v2 extractor module + the `setPipelineOverride` helper, this auto-rollback path either (a) compiles but silently no-ops because `setPipelineOverride` is gone, or (b) fails to compile because the import target is gone. Either way, the v3 extractor's "I'm in trouble — flip back to v2" recovery path is broken.

**Why it happens:** v3.ts:1055 calls `setPipelineOverride('v2')` directly. v3.ts:28 imports `setPipelineOverride` from `'../config.js'`. CONTEXT D-02 deletes `setPipelineOverride` from `server/config.ts`. The auto-rollback path needs to be either DELETED or REPOINTED.

**How to avoid:** Delete the auto-rollback ladder in v3.ts (`performAutoRollbackToV2`, `checkWatchdogRecurrenceTrigger`, `checkEvalDropTrigger`) and the corresponding test file `server/__tests__/lib/llmAutoRollback.test.ts`. The rationale: post-Phase-29 there is no v2 extractor to roll back to. The v1/v2 deep-rollback path is gone; the new rollback path is `git revert` (per CONTEXT D-02). Watchdog-recurrence + eval-drop now mean "alert the operator, but stay on v3" — the existing `llmProgress.watchdogTimeoutCount` + `evalScore` fields are still surfaced via DevApiStatus and `/api/events/llm-status`, so observability is preserved.

This deletion is BLOCK-LEVEL with the v2 extractor deletion in CONTEXT D-02 — if the planner picks "delete v2.ts in commit 4 and v1.ts in commit 5", then the v3.ts auto-rollback ladder must come down in commit 4 (alongside v2.ts) so v3.ts compiles after each commit.

**Warning signs:** `tsc --noEmit` after deleting `setPipelineOverride` from config.ts produces errors at v3.ts:28, 1055.

[VERIFIED: server/lib/llmEventExtractor.v3.ts:28, 85, 1050-1097; server/__tests__/lib/llmAutoRollback.test.ts:50, 64, 143, 247]

### Pitfall 3: `llmResolver.ts` still imports the cerebras+groq `callLLM`

**What goes wrong:** `server/lib/llmResolver.ts:15` imports `callLLM` from `../adapters/llm-provider.js` (the cerebras+groq cascade). It uses it at line 458 for the 2-pass Nominatim verification reranker. After D-01 narrows that cascade to "no providers" (cerebras + groq factories deleted), `callLLM` returns null on every invocation → resolver caches a "miss" and falls through to GDELT actiongeo fallback. **The geocode quality degrades silently.**

**Why it happens:** Two distinct LLM call paths exist in the codebase:

- `server/adapters/llm-provider.ts callLLM` — used by v1, v2 extractors AND `llmResolver.ts`
- `server/lib/freeClaudeRouter.ts callLLM` (different function, same name) — used by v3 extractor only

D-01's "narrow the cascade to NIM + OpenRouter" applies to the ADAPTERS file. `llmResolver.ts:458` is a SEPARATE consumer that doesn't pivot.

**How to avoid:** Three options for the planner:

1. **Repoint resolver to `freeClaudeRouter.callLLM`** (recommended). Single import-path swap; resolver gets NIM+OpenRouter cascade for free.
2. **Leave as-is, accept silent degradation.** The resolver's reranker is one of 6 paths (per llmResolver.ts:1-11 comment); the other 5 (own-site-snapshot, poi-amenity-nominatim, nominatim-direct, bellingcat-coord-passthrough, gdelt-actiongeo-fallback) all work without the LLM. Quality drops on ambiguous multi-candidate Nominatim results only.
3. **Delete the reranker path entirely.** Most aggressive. Defer to Phase 30/34.

The CONTEXT does not address this directly. It's adjacent to Pitfall 8 in the original v3 cascade design. RECOMMENDED: option 1 (repoint), bundled into the D-01 commit so the cascade narrowing is a coherent single change.

**Warning signs:** `grep -rn "from '../adapters/llm-provider'" server/lib/` shows resolver as a non-extractor consumer.

[VERIFIED: server/lib/llmResolver.ts:15, 458; server/lib/freeClaudeRouter.ts:293 (separate callLLM)]

### Pitfall 4: `shouldPauseNewEvents()` checks Cerebras + Groq budgets only

**What goes wrong:** `server/lib/llmTokenBudget.ts:152-160` reads `getDailyTokens('cerebras')` + `getDailyTokens('groq')` only. Post-D-01 narrowing, the cascade uses NIM + OpenRouter; their budgets are tracked separately in `freeClaudeRouter.ts:254-265` (via `llm:tokens:openrouter:{date}` Redis keys + `nvidiaNimWindow.canRequest()` rolling window). The soft-cap pause function returns `false` permanently because the cerebras/groq counters never increment.

**Why it happens:** The budget tracking was designed pre-Phase-27.4.3 when only cerebras+groq existed. The v3 cascade re-implemented per-provider budgets in `freeClaudeRouter.ts` rather than extending `llmTokenBudget.ts`.

**How to avoid:** OUT OF SCOPE for Phase 29 per CONTEXT (Phase 30 SIMPLIFY-01/03 territory). The planner should NOT touch `shouldPauseNewEvents` in this phase. Document the gap in the ADR-0010 Consequences section. The behavior is "soft-cap pause is currently unreachable post-narrowing" — degrades to "extract more aggressively when NIM+OpenRouter approach their daily limits", which is acceptable on Pro's 800s ceiling because runs complete in ~10min anyway.

**Warning signs:** `grep -rn "getDailyTokens" server/lib/llmTokenBudget.ts` shows the cerebras/groq-only call sites.

[VERIFIED: server/lib/llmTokenBudget.ts:152-160; server/lib/freeClaudeRouter.ts:254-265]

### Pitfall 5: `operator-status.ts` reads `events:llm-pipeline-override` TTL

**What goes wrong:** `server/routes/operator-status.ts:121, 128` reads `events:llm-pipeline-override` Redis key TTL + value to surface the "Pipeline override TTL" block on the API Health dashboard. After D-02, the key naturally TTL-expires within 7d. The dashboard block displays "no pin active" forever — which is correct semantically, but the code path is dead weight.

**Why it happens:** The operator-status endpoint was added in Phase 28.2 W5 D-22 to surface the pin-TTL telemetry. Post-D-02, there is no pin to surface.

**How to avoid:** Bundle the operator-status `pinTtl` block deletion with the override-route deletion (D-02 part A). Update `OperatorStatusResponse` schema to remove `pinTtl` field. Update DevApiStatus consumer at `src/components/ui/DevApiStatus.tsx` (search `pinTtl` references). This is a clean tail-end of D-02; planner should explicitly call it out in the commit message.

**Warning signs:** `grep -rn "pinTtl" src/` shows the operator-status consumer in DevApiStatus.

[VERIFIED: server/routes/operator-status.ts:121, 128, 134-141; server/routes/__tests__/operator-status.test.ts:98]

### Pitfall 6: 11 server test files mock `setPipelineOverride` / `isPipelineV2`

**What goes wrong:** 11 tests in `server/__tests__/` mock `setPipelineOverride` and/or `isPipelineV2` (verified via grep — see Question 2 inventory). After D-02 deletes those exports from `server/config.ts`, the `vi.mock('../../config.js', ...)` calls in those tests reference non-existent properties. TypeScript may compile (the mocks use `vi.fn()` so the type-checker can't catch the orphan), but the tests test obsolete behavior.

**Why it happens:** Tests written during the v1/v2/v3 toggle era encoded the toggle as part of their test setup.

**How to avoid:** Each of the 11 test files needs a triage decision:

- **Tests that test v1/v2 behavior directly** (e.g., `llmEventExtractor.v2.test.ts`, `llmEventExtractor.test.ts` (v1 tests)) — DELETE the test file.
- **Tests that mock the toggle but test cross-cutting behavior** (e.g., `events.test.ts`, `events.audit.test.ts`, `events.replayQuota.test.ts`) — REMOVE the mock setup but keep the test (which now just runs against v3-only without the override layer).
- **`llmAutoRollback.test.ts`** — DELETE the entire file (tests the deleted auto-rollback ladder per Pitfall 2).

The full test-file inventory is in Question 2 below. RECOMMENDED commit boundary: bundle test-file cleanup with the corresponding production-code deletion (e.g., delete `llmEventExtractor.v2.test.ts` in the same commit as `llmEventExtractor.v2.ts`). Keeps each commit self-consistent — no commit leaves the test suite red.

**Warning signs:** `npx vitest run server/` after each commit; any failures unrelated to the commit's stated scope mean a test wasn't cleaned up.

[VERIFIED: 11 test files identified via `grep -rn 'isPipelineV2\|setPipelineOverride' server/__tests__/`]

### Pitfall 7: CLAUDE.md trim risks deleting load-bearing context

**What goes wrong:** The trim deletes Phase-N narrative blocks that contain operator-grade reference content (e.g., the Phase 27.4 LLM Enrichment section's BATCH_SIZE=2 / parallel concurrency / 6-path resolver invariants are all current-state-relevant even though the section is "phase narrative" by header).

**Why it happens:** D-06 says "delete ALL phase-narrative blocks" but some blocks (e.g., "LLM Event Pipeline (Phase 27)" L130-145) carry both phase-history AND current-state-invariants in a single block.

**How to avoid:** Two-pass methodology for the trim:

1. **First pass** — delete sections that are PURELY phase-narrative (the "closeout" sections at L469-509 for Phase 28.1/28.2/28.2.5; the "Cron-Driven Pipeline Trigger (Phase 27.4.6)" section at L443-457).
2. **Second pass** — for sections with mixed content, distill the load-bearing invariants into a 2-3 line bullet AT THE TOP of the section, then delete the rest. Examples: keep "LLM Event Pipeline" section's "5-type ontology" + "PrecisionRingLayer module path" + "lazy on-cache-miss trigger removed Phase 27.4.6" lines; delete the per-line CAMEO-classification narrative.

5-item operator spot-check (per D-07) is the verification — if the operator can't find Redis key contracts in <30s, the trim went too far. RECOMMENDATION: target 7,500-8,500 tokens (well under the 10k ceiling) and reserve 1-2k tokens of headroom for any operator follow-up additions.

**Warning signs:** Operator skim test fails OR token count overshoots target by >20%.

[VERIFIED: section-by-section line count via `awk` aggregation; CLAUDE.md L1-509 read end-to-end]

### Pitfall 8: Vercel Pro dashboard verification race

**What goes wrong:** D-08 commits the `maxDuration: 800` bump as the FIRST commit, but the operator hasn't actually upgraded to Pro yet at PR-open time. Vercel deploy fails with "maxDuration > Hobby ceiling".

**Why it happens:** Operator forgets to upgrade OR upgrades the wrong project (operator has multiple Vercel projects in the dashboard).

**How to avoid:** PR description for the maxDuration bump commit must include a checklist:

- [ ] Operator upgraded `onthegrid.icm` to Pro plan ($20/mo)
- [ ] Verified at https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing (per CONTEXT D-09)
- [ ] Synthetic >300s invocation against `/api/cron/refresh-events?force=true` succeeded (per D-09)

The synthetic verification can run BEFORE the PR is opened (since the maxDuration bump is the first commit, the prior shape is the v1.4 commit ranges with maxDuration:300 — running the synthetic against that confirms the Pro plan is active independent of the bump). RECOMMENDED: planner adds a dedicated "Operator Pre-flight" task in the PLAN.md that gates the rest of the phase.

**Warning signs:** Vercel deploy logs show `Function exceeded maximum duration of 300 seconds` (Hobby cap) instead of `800 seconds`; OR `vercel.json validation failed: maxDuration must be <= 300`.

[VERIFIED: vercel.json:13-15; CONTEXT D-08 + D-09 lock]

## Code Examples

### LLM-optional integration test (D-04) — proposed shape

```typescript
// Source: server/__tests__/routes/llm-optional.test.ts (NEW)
// Modeled on server/__tests__/routes/events-fallback.test.ts (existing precedent)
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConflictEventEntity } from '../../types.js';
import type { Server } from 'http';

// Identical adapter mocks pattern from events-fallback.test.ts L120-188
// Critical mocks for THIS test:
const mockIsLLMConfigured = vi.fn((): boolean => false); // FORCE LLM-disabled

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(async () => null),
  isLLMConfigured: mockIsLLMConfigured,
  setProviderOrderOverride: vi.fn(),
  getProviderOrder: vi.fn(() => ['nvidia_nim', 'openrouter']), // post-D-01 default
}));

// freeClaudeRouter mock — D-04 specifically tests "both keys absent" so
// the freeClaudeRouter.callLLM branch must also be unreachable
vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(async () => null),
  prewarmIfCold: vi.fn(async () => undefined),
}));

const rawEventA = {
  /* ... ConflictEventEntity fixture ... */
};
const rawEventB = {
  /* ... */
};
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => [rawEventA, rawEventB]),
  backfillEvents: vi.fn(async () => []),
}));

describe('LLM-optional architecture (LLM-RELI-05 / D-04)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    mockIsLLMConfigured.mockReturnValue(false); // CRITICAL: keys absent
    const { createApp } = await import('../../index.js');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => server?.close());

  it('serves raw GDELT through Pitfall 1 bridge when both LLM keys absent', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const body = (await res.json()) as { data: ConflictEventEntity[] };
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
    // Assert raw GDELT ids (not the v3-enriched shape)
    const ids = body.data.map((e) => e.id);
    expect(ids).toContain('gdelt-RAW-A');
    expect(ids).toContain('gdelt-RAW-B');
  });

  it('does NOT call freeClaudeRouter when isLLMConfigured returns false', async () => {
    const { callLLM: routerCallLLM } = await import('../../lib/freeClaudeRouter.js');
    await fetch(`${baseUrl}/api/events`);
    expect(routerCallLLM).not.toHaveBeenCalled();
  });
});
```

[Source: derived from existing pattern at server/__tests__/routes/events-fallback.test.ts:215-276]

### Vercel Pro maxDuration bump (D-08)

```jsonc
// Source: vercel.json (current state at L11-15)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "crons": [
    { "path": "/api/cron/health", "schedule": "0 0 * * *" },
    { "path": "/api/cron/warm", "schedule": "0 12 * * *" },
    { "path": "/api/cron/refresh-events", "schedule": "0 4 * * *" }
  ],
  "rewrites": [...],
  "functions": {
    "api/vercel-entry.js": {
-     "maxDuration": 300
+     "maxDuration": 800
    }
  }
}
```

[VERIFIED: vercel.json complete read; only L13 changes]

### ADR-0010 stub structure (D-03)

```markdown
# ADR-0010: v1.5 LLM pipeline narrowing and deletion

**Status:** Accepted
**Date:** 2026-05-09
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

## Decision

1. **Narrow the active cascade.** Cerebras + Groq removed from
   `server/adapters/llm-provider.ts` runtime path. Adapter source files left
   importable in `server/adapters/` for emergency-only reference; no production
   code path references them.
2. **Delete v1 + v2 extractor modules.** `server/lib/llmEventExtractor.v1.ts`,
   `server/lib/llmEventExtractor.v2.ts`, the `POST /api/events/llm-pipeline`
   override endpoint, the `events:llm-pipeline-override` Redis key, the
   `setPipelineOverride()` + `refreshPipelineOverride()` helpers, the
   DevApiStatus Pin-to-v1/v2 buttons, and the `PipelineVersionPill` Topbar
   indicator are all removed.
3. **Prove the LLM-optional architecture.** Integration test
   (`server/__tests__/routes/llm-optional.test.ts`) + runbook entry
   (`docs/runbook.md` "LLM Pipeline Disabled / Keys Absent" section)
   document and mechanically guard the contract: with both
   `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` unset, `/api/events` serves
   raw GDELT through the Pitfall 1 cache bridge.
4. **Vercel Pro upgrade landed in the same phase** so subsequent v1.5 phases
   (30, 31) tune against the 800s `maxDuration` ceiling, not the prior 300s
   Hobby ceiling.

<expand_at_36>

## Consequences

### Positive

- Smaller bundle, fewer code paths.
- Rollback path simplified: `git revert <Phase 29 range>` instead of operator
  Bearer-POST flips.
- The active code path is obviously the active code path — no triage burden
  for "is v1 still live?" on every visit.

### Negative

- The Phase 27.4 D-26/D-40 deep-rollback lock is superseded; reverting to v1
  or v2 now requires git-history archaeology.
- ADR-0009 (the two-key-split for partial vs terminal v2 reads) becomes
  partially historical — the v2 keys it documents are deletion targets here.

### Neutral

- The shouldPauseNewEvents() soft-cap pause becomes unreachable post-narrowing
  because it reads cerebras/groq budgets only. Documented as Phase 30 work.

## Alternatives Considered

- **Archive v1.ts + v2.ts to `attic/`** (the original SIMPLIFY-06 plan).
  Rejected in favor of full deletion per CONTEXT D-02: archived code creates
  the same triage burden as live code.
- **Add a `LLM_PIPELINE_ENABLED` env-var kill-switch.** Rejected per D-05:
  "unset both keys" is the kill switch; adding an env-var doubles the test
  surface and the operator-mental-model surface.

## References

- `.planning/phases/29-*-CONTEXT.md` (D-01 through D-10)
- Phase 27.4 D-26/D-40 lock (`.planning/phases/27.4-llm-enrichment-improvements/27.4-CONTEXT.md`)
- ADR-0009 (`docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md`) — partially superseded
- Commit range: `<filled in at PR merge time>`
```

[Source: synthesized from docs/adr/template.md + docs/adr/0009-*.md structure]

### Runbook entry (D-04)

````markdown
## 11. LLM Pipeline Disabled / Keys Absent

**Symptom:** Operator wants to disable LLM enrichment entirely, OR the
NIM + OpenRouter keys are temporarily revoked, OR a billing-test scenario.
The map must continue to render events from raw GDELT through the Pitfall
1 cache bridge.

**Expected behavior:**

- `/api/events` returns events sourced from `events:gdelt` (raw GDELT, not
  LLM-enriched).
- `events:llm:v3` Redis cache stays empty (or expires naturally; no new
  writes occur).
- `/api/cron/refresh-events` early-returns with `reason: 'llm_unconfigured'`
  on each scheduled tick.
- DevApiStatus API Health tab shows "Events (LLM)" row in unknown/degraded
  state; "Events (raw)" row in healthy state.

### Operator smoke test

```bash
# 1. Unset both keys in Vercel dashboard
#    https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/environment-variables
#    Remove: NVIDIA_NIM_API_KEY, OPENROUTER_API_KEY

# 2. Redeploy
vercel --prod

# 3. Confirm /api/events returns events
curl -s https://otg-iran-monitor.vercel.app/api/events | jq '.data | length'
# Expected: > 0 (typically 100-500 raw GDELT rows)

# 4. Confirm events are raw GDELT shape (data.precision absent or 'region')
curl -s https://otg-iran-monitor.vercel.app/api/events \
  | jq '.data[0].data | keys'
# Expected: shows {actor1, actor2, cameoCode, eventType, ...} (raw GDELT)
# NOT shows {city, confidence, neighborhood, weaponType, ...} (LLM-enriched)

# 5. Confirm DevApiStatus surfaces the state honestly
#    Open https://otg-iran-monitor.vercel.app, click DevApiStatus icon,
#    open API Health tab.
#    Expected: "Events (LLM)" row marked degraded/unknown;
#              "Events (raw)" row marked healthy.
```
````

### Recovery (re-enable LLM)

```bash
# 1. Restore one or both keys in Vercel dashboard env vars.
# 2. Redeploy: vercel --prod
# 3. Force-trigger first extraction (bypass 15-min cooldown):
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"
# 4. Wait ~10 minutes (Vercel Pro 800s ceiling, single-batch ~27s, 12-way
#    concurrency, 184 batches → ~7 min wall-clock).
# 5. Confirm events:llm:v3 populated:
curl -s https://otg-iran-monitor.vercel.app/api/events/llm-status \
  | jq '.lastRun.enrichedCount'
# Expected: a positive number matching the run's group count.
```

### Why this matters

- **Severity: NONE — by design.** The "LLM-optional architecture" requirement
  (LLM-RELI-05) makes this a documented and tested mode, not a degraded
  state. The `server/__tests__/routes/llm-optional.test.ts` integration test
  guards the contract on every PR.
- **Related:** see "Pitfall 1 Cache Bridge" in CLAUDE.md Serverless Cache
  registry; see ADR-0010 for the architectural rationale.

````

[Source: structurally modeled on docs/runbook.md sections 1-10 (existing pattern)]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 4-provider cascade (Cerebras, Groq, NIM, OpenRouter) with 2 active orchestration paths | 2-provider cascade (NIM, OpenRouter) with 1 orchestration path | Phase 29 (this phase) | Smaller bundle, fewer code paths, simpler test surface |
| v1 + v2 + v3 extractor modules with runtime override toggle | v3-only extractor module | Phase 29 (this phase) | Eliminates the "is v1 still live?" triage burden |
| Bearer-POST `{version: 'v1' \| 'v2' \| 'v3' \| null}` rollback | `git revert` rollback | Phase 29 (this phase) | Slower rollback (minutes vs seconds) but mechanically simpler; no operator-mental-model overhead |
| 300s Vercel Hobby `maxDuration` | 800s Vercel Pro `maxDuration` | Phase 29 D-08 | Phase 30 tuning runs against the new ceiling; SIMPLIFY-01/03 (Phase 30) retire Hobby-era workarounds |
| 18,846-token CLAUDE.md (gpt-4o tokenizer) | <10,000-token CLAUDE.md | Phase 29 D-06 | Operator skim test passes <30s for 5 invariants; less context noise for downstream phase planning |

**Deprecated/outdated:**
- **`POST /api/events/llm-pipeline {version: 'v1' \| 'v2' \| 'v3' \| null}`** — deleted Phase 29 D-02. Replacement: `git revert`.
- **DevApiStatus Pin-to-v1/v2/v3 buttons + confirm modal** — deleted Phase 29 D-02. Replacement: dashboard reads v3 state from `/api/operator-status` for telemetry only; no toggle UI.
- **Topbar `PipelineVersionPill`** — deleted Phase 29 D-02 (recommended; see Question 5). Replacement: pipeline version is statically v3 — no badge needed; if operator needs the signal, DevApiStatus event tab carries it.
- **`isPipelineV2()` + `isPipelineV3()` + `getPipelineVersion()` helpers in `server/config.ts`** — deleted Phase 29 D-02. Replacement: hardcoded v3 path; `getPipelineVersion()` either deleted entirely OR collapsed to `() => 'v3' as const`.
- **`refreshPipelineOverride()` + `setPipelineOverride()` helpers** — deleted Phase 29 D-02. No replacement.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 29 ADR is intended to be a NEW ADR (not an update to existing ADR-0009 about the two-key split). | Pitfall 1 + Question 7 | If wrong, the planner amends ADR-0009 instead of creating ADR-0010. Low risk — CONTEXT D-03 specifies a "stub" file, which strongly implies a new file. [CITED: CONTEXT D-03] |
| A2 | "Hard-delete" in CONTEXT D-01 means the cerebras + groq factory functions + skip-entry synthesis remain in the source file as `_unused` exports OR are physically deleted, not that the entire `llm-provider.ts` file is deleted. | Question 1 + LLM-RELI-01 | If wrong, planner deletes the file entirely (which would break `llmResolver.ts:15` import — see Pitfall 3). Medium risk — context says "Cerebras + Groq adapter source files themselves stay in `server/adapters/`" which is somewhat ambiguous about whether those files are `cerebras.ts` / `groq.ts` (which don't exist) or the orchestrator file. RECOMMENDED: physical deletion of the cerebras+groq factories + skip synthesis WITHIN `llm-provider.ts`; file itself stays for `callLLM` export which the resolver still uses (until Pitfall 3 is resolved). [ASSUMED] |
| A3 | The `events:llm:v3:partial` Redis read fallback referenced in CONTEXT D-02 does NOT actually exist in the events.ts Pitfall 1 bridge code. | Pitfall 1 inventory + Question 3 | If wrong, the planner needs to delete the v3:partial leg AS WELL. Verified by reading `server/routes/events.ts:701-731` end-to-end — only `events:llm:v2` and `LLM_EVENTS_KEY` (=v1) are read in the bridge. The v3:partial key is observability-only and read by `/api/events/llm-status` for progress display, not by the bridge. [VERIFIED via Read] |
| A4 | The `PipelineVersionPill` deletion is the right call (vs keeping it as a static "v3" badge). | Question 5 + Pattern map | If wrong, planner keeps the pill rendered as a constant-v3 indicator. Low risk — the pill's function (`fetchVersion()` at Topbar.tsx:219-236) is built around querying `/api/events/llm-pipeline`, which is being deleted. Without that endpoint, the pill cannot render anything. Reusing the pill as a static badge would invent a UI element that doesn't exist today. [ASSUMED — but strong consensus: delete] |
| A5 | The 9-commit boundary suggested by CONTEXT is the right shape (vs collapsing or expanding it). | Atomic commits guidance | Researcher recommendation: SPLIT D-02 into 4 commits as described above (override route + helpers; v2 module; v1 module; UI). 9 commits → 12 commits. Each commit is grep-verifiable in <2 minutes. Low risk if wrong; planner can collapse back. [ASSUMED] |
| A6 | NIM throttle behavior (Phase 30 work) does not require Phase 29 to lock anything specific. | Question 10 + Phase 30 cross-ref | If wrong, Phase 29 may unintentionally lock a parameter that Phase 30 needs to change. Verified via ROADMAP read — Phase 30 explicitly depends on Phase 29's narrowed cascade and 800s ceiling, but doesn't touch anything Phase 29 touches (Phase 30 changes `LLM_BATCH_SIZE`, `LLM_V3_CONCURRENCY`, `callLLM` retry params; Phase 29 doesn't touch any of these). [VERIFIED via ROADMAP L134-147] |
| A7 | The dev file cache helpers `loadDevLLMCacheV2`/`saveDevLLMCacheV2` referenced from `events.ts:6` and `llmExtractionPipeline.ts:27` are still load-bearing for v3 (despite the V2 in the name) — they are NOT a v2-extractor-specific artifact. | Question 2 inventory | If wrong, planner deletes them, breaking v3 dev-cache hydration. The naming is unfortunate (V2 in the function name but used for v3 too — see `llmExtractionPipeline.ts:132` `if (pipelineV3 || pipelineV2) saveDevLLMCacheV2(llmMerged)`). RECOMMENDED: rename to `loadDevLLMCache` / `saveDevLLMCache` (drop the V2 suffix) post-Phase-29 in Phase 35. For Phase 29: leave alone, just remove the `pipelineV2` branch in the call site so it's `if (pipelineV3) saveDevLLMCacheV2(...)`. [VERIFIED via grep + Read] |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

This table has 7 entries; A2 and A4 are the only `[ASSUMED]` entries. A2 needs explicit user/planner decision before code edits start; A4 is a discretion call already covered by CONTEXT Deferred Ideas. The other 5 entries are `[VERIFIED]` or `[CITED]` with codebase line numbers.

## Open Questions

1. **A2 — what does "hard-delete Cerebras + Groq from runtime path" mean physically?**
   - What we know: CONTEXT D-01 says factories + cascade order + skip-entry synthesis go away; adapter source files "stay importable for emergency rollback".
   - What's unclear: there is no separate `cerebras.ts` / `groq.ts` adapter file; the factories are inside `server/adapters/llm-provider.ts`. The "stays importable" language is somewhat ambiguous — does it mean (a) the entire `llm-provider.ts` file stays + the cerebras/groq factories within it are physically removed, OR (b) the `llm-provider.ts` file stays + the factories are kept but disconnected from the cascade order?
   - Recommendation: **(a) — physical removal of factories**. `getCerebrasClient`, `getGroqClient`, `tryProviderOnce` (which only handles those two), `getProviderOrder` (returns the wrong default), `recordSkippedAttempt`, `setProviderOrderOverride` all go away. `callLLM` stays (still used by `llmResolver.ts`, but its body becomes a no-op stub returning null OR is repointed to `freeClaudeRouter.callLLM` per Pitfall 3). The file stays because `llmResolver.ts:15` imports `callLLM` from it.

2. **PipelineVersionPill — keep as static "v3" badge or delete?**
   - What we know: CONTEXT Deferred Ideas explicitly leaves this open: "if the implementer finds it still has utility (e.g., showing `v3` even when no toggle exists), researcher can recommend keeping it as a static 'v3' badge."
   - Recommendation: **DELETE**. The pill's `fetchVersion()` at Topbar.tsx:219-236 queries `/api/events/llm-pipeline` (being deleted in D-02). The pill cannot render anything without that endpoint. Reusing it as a static badge means inventing a new code path that doesn't reflect any real signal — there is no "alternative version to v3" anymore. The dashboard surfaces v3 state in the API Health tab via `/api/operator-status`; no need for a topbar indicator. Bundle the deletion with the other UI deletion in D-02 part D.

3. **Cron auto-rollback ladder in v3.ts — delete or repoint?**
   - What we know: Pitfall 2 above. v3.ts has `performAutoRollbackToV2`, `checkWatchdogRecurrenceTrigger`, `checkEvalDropTrigger` that flip the override to v2. After D-02 there is no v2 to roll back to.
   - Recommendation: **DELETE the auto-rollback ladder**. The new "rollback" is `git revert`; the operator gets paged via `llmProgress.watchdogTimeoutCount` + DevApiStatus alerts; manual git revert restores stability. Repointing the ladder to "rollback to LLM-optional" (i.e. "stop trying NIM, serve raw GDELT") is theoretically possible but adds complexity for a Phase 30+ concern. Defer.

4. **Operator-side env-var cleanup timing**
   - What we know: `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `LLM_PIPELINE_V2`, `LLM_PIPELINE_V3` env vars become inert after Phase 29 (no readers). The Vercel dashboard still has them set.
   - Recommendation: **Leave them set during the deploy window**. A `git revert` rollback finds them in place. Once Phase 30 closes (mid-late v1.5), operator can prune them via the Vercel dashboard. Document this in the Phase 29 SUMMARY.md as a "post-phase cleanup" item.

5. **Adversarial-eval Redis key (`events:llm-eval-adversarial:v3`) treatment**
   - What we know: `events:llm-eval-adversarial:v3` was added in Phase 28.2 W3. Its writer is `runAdversarialEval` in the daily cron-health route. Its reader is `/api/operator-status`. Phase 29 doesn't touch it.
   - Recommendation: **No action.** Out of scope. Mention in CLAUDE.md Serverless Cache trim that it's load-bearing.

6. **Should the events.ts route `getPipelineVersion()` consumers (LLM_EVENTS_KEY_ACTIVE, LLM_SUMMARY_KEY_ACTIVE) be inlined to constants or kept as helper calls?**
   - What we know: After D-02, `getPipelineVersion()` either returns `'v3'` always OR is deleted. The events.ts handler at L668-680 has 3-way branching.
   - Recommendation: **Inline to constants.** `const LLM_EVENTS_KEY_ACTIVE = 'events:llm:v3'` and `const LLM_SUMMARY_KEY_ACTIVE = 'events:llm-summary:v3'`. Removes the helper, removes 12 lines of branching. Same change in `llmExtractionPipeline.ts:175-184`. Simpler.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | D-04 integration test | ✓ | (existing pin) | — |
| `@upstash/redis` | events.ts route mocks | ✓ | (existing) | — |
| TypeScript | All compilation | ✓ | ~5.9.3 (per CLAUDE.md) | — |
| `npx tiktoken-cli` | D-07 token count verification | ✓ | 0.4.1 (verified via `npx tiktoken-cli --help`) | `wc -w * 1.3` rough estimate (CONTEXT mentions both methods) |
| Vercel CLI | Pro upgrade verification (operator) | Operator-side | (any) | — |
| Express test fetch (`http://127.0.0.1:0` listen) | D-04 integration test | ✓ Node `http.Server` | (built-in) | — |
| `git revert` | Rollback path (D-02 spec) | ✓ | (built-in) | — |

**Missing dependencies with no fallback:** None — all required tooling is installed.

**Missing dependencies with fallback:** None.

**Operator-side dependencies (out-of-band):**
- Vercel Pro plan upgrade ($20/mo) — required BEFORE first phase commit per D-08.
- `CRON_SECRET` env var — required for D-09 synthetic >300s invocation verification.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom env for frontend, node env for server) |
| Config file | `vite.config.ts` (alias for jsdom mocks) + per-test `// @vitest-environment node` directive |
| Quick run command | `npx vitest run server/__tests__/routes/llm-optional.test.ts` (single test) |
| Full suite command | `npx vitest run` (all tests; takes ~2-3 min) |
| Server-only command | `npx vitest run server/` (D-04 specific surface) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-RELI-01 | Cascade narrowed to NIM + OpenRouter only | unit | `grep -nP 'cerebras\|groq' server/adapters/llm-provider.ts && exit 1 \|\| exit 0` (post-D-01: zero matches in runtime code) | ❌ — phase 29 task |
| LLM-RELI-01 | `isLLMConfigured` checks only NIM + OpenRouter env vars | unit | (existing pattern) update `server/__tests__/adapters/llm-provider.test.ts` to mock only NVIDIA_NIM_API_KEY + OPENROUTER_API_KEY | ⚠ partial — `llm-provider.test.ts` exists, needs update |
| LLM-RELI-05 | LLM-optional architecture: keys absent → raw GDELT served | integration | `npx vitest run server/__tests__/routes/llm-optional.test.ts` | ❌ Wave 0 — NEW file |
| SIMPLIFY-04 | Cerebras + Groq adapter dead-code purged | grep | `grep -rn "Cerebras\|Groq\|cerebras\|groq" server/adapters/llm-provider.ts \| grep -v "^// "` returns ZERO matches | grep, no test file |
| SIMPLIFY-06 | v1 + v2 extractor modules deleted | unit (existence test) | `[ ! -f server/lib/llmEventExtractor.v1.ts ] && [ ! -f server/lib/llmEventExtractor.v2.ts ]` | shell, no test file |
| SIMPLIFY-06 | `POST /api/events/llm-pipeline` route deleted (404 expected) | integration | new test in `events.test.ts`: assert `(await fetch('/api/events/llm-pipeline', {method:'POST'})).status === 404` | ⚠ partial — events.test.ts exists, add assertion |
| SIMPLIFY-06 | `setPipelineOverride` / `refreshPipelineOverride` removed from config | unit (compile-time) | `tsc --noEmit` succeeds | ✓ existing |
| DOCS-INT-01 | CLAUDE.md token count <10k | command | `npx tiktoken-cli CLAUDE.md` returns N where N < 10000 | shell, no test file |
| DOCS-INT-01 | 5-item operator spot-check passes | manual | operator verifies (1) Redis key contracts, (2) env vars, (3) color tokens, (4) domain constants, (5) cron schedule findable in <30s | manual; no automation |

### Sampling Rate

- **Per task commit:** `npx vitest run server/` (server-side suite, ~30s)
- **Per wave merge:** `npx vitest run` (full suite, ~2-3 min) + `tsc --noEmit` + `npm run lint`
- **Phase gate:** Full suite green + manual operator spot-check + Vercel deploy green + synthetic >300s invocation succeeds (D-09).

### Wave 0 Gaps

- [ ] `server/__tests__/routes/llm-optional.test.ts` — covers LLM-RELI-05. Modeled on `events-fallback.test.ts` (existing pattern).
- [ ] Update `server/__tests__/adapters/llm-provider.test.ts` to mock only NIM + OpenRouter env vars (existing test currently mocks `CEREBRAS_API_KEY: 'test-cerebras-key', GROQ_API_KEY: 'test-groq-key'` at L23-24).
- [ ] Add 404-assertion test for `POST /api/events/llm-pipeline` in `server/__tests__/routes/events.test.ts` (post-deletion regression guard).
- [ ] Delete obsolete tests: `server/__tests__/lib/llmAutoRollback.test.ts` (Pitfall 2), `server/__tests__/lib/llmEventExtractor.v2.test.ts` (D-02), `server/__tests__/lib/llmEventExtractor.test.ts` (v1 tests via dynamic import — see Question 2 inventory), `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` watchdog-recurrence/eval-drop branches, `src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx` (D-02), parts of `src/__tests__/DevApiStatusV3.test.tsx` (PipelineVersionPill section).
- [ ] Update existing tests to remove `isPipelineV2: vi.fn().mockReturnValue(false)` and `setPipelineOverride: vi.fn()` mocks: `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`, `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts`, `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`, `server/__tests__/lib/llmLineage-prefilter.test.ts`, `server/__tests__/routes/eval-cron.test.ts`, `server/__tests__/routes/events.test.ts`, `server/__tests__/routes/events.audit.test.ts`, `server/__tests__/routes/events.replayQuota.test.ts`, `server/__tests__/adapters/llm-provider.test.ts`.

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** — always enabled. Phase 29 compile must clean (`tsc --noEmit`) after each commit.
- **TypeScript pinning** — `~5.9.3`. Do NOT bump.
- **Conventional commits** — `feat(29):`, `chore(29):`, `docs(29):`, `test(29):`. Per CONTEXT atomic-commit guidance.
- **Branch discipline** — one feature branch per phase: `feature/29-llm-cascade-narrowing-claude-md-cleanup` (already created per `git status` at session start). Do NOT commit to main directly.
- **Phase boundaries** — before starting Phase 30: commit, push, merge Phase 29 to main, update all docs, then create Phase 30 branch from main.
- **Logging convention** — server-side modules use `logger.child({ module: '<name>' })` from `server/lib/logger.ts`. Do NOT use `console.*`. Phase 28.1 W7 audit confirmed 0 `console.*` calls in load-bearing modules; Phase 29 must preserve this.
- **Zustand patterns** — for any client-side store changes (none expected this phase): curried `create<T>()()` pattern + `s => s.field` selectors.
- **Tailwind CSS v4** — CSS-first `@theme` configuration; no tailwind.config.js. Phase 29 doesn't touch styling.

## Sources

### Primary (HIGH confidence — codebase grep + read)
- `server/adapters/llm-provider.ts` (286 lines, read end-to-end)
- `server/lib/llmEventExtractor.ts` (169 lines, full barrel — read end-to-end)
- `server/lib/llmEventExtractor.v3.ts:1-120, 1020-1097` (auto-rollback ladder)
- `server/routes/events.ts:1-120, 320-410, 700-900` (Pitfall 1 bridge + override route + bridge re-entry)
- `server/config.ts:300-367` (`isPipelineV2`, `setPipelineOverride`, `getPipelineVersion`)
- `server/lib/llmExtractionPipeline.ts:1-220` (`runRefreshExtraction` + `mergeAndPersistLlmEntities`)
- `server/middleware/dashboardAuth.ts` (full file, 67 lines)
- `server/lib/llmCircuitBreaker.ts` (full file, 73 lines)
- `server/lib/llmTokenBudget.ts:25-160` (provider type widening + soft-cap)
- `server/lib/llmResolver.ts:1-50, 440-480` (Pitfall 3)
- `server/lib/llmProgress.ts:61-170` (callHistory shape)
- `server/__tests__/routes/events-fallback.test.ts` (215 lines, full test pattern)
- `src/__tests__/api-connectivity.test.ts` (243 lines, full file — confirms it's network-prod-only)
- `src/components/ui/DevApiStatus.tsx:1565-1675` (Pin button surface + confirm modal)
- `src/components/layout/Topbar.tsx:200-310` (`PipelineVersionPill` complete surface)
- `vercel.json` (full file, 16 lines)
- `CLAUDE.md` (509 lines, full structural read; section line counts via awk)
- `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` (full file, 184 lines)
- `docs/adr/README.md` (full file, ADR conventions + numbered index)
- `docs/runbook.md` section 10 (LLM pipeline hung)

### Primary tooling
- `npx tiktoken-cli CLAUDE.md` returns `18846 CLAUDE.md` (gpt-4o tokenizer; verified 2026-05-09)
- `wc -c CLAUDE.md` returns `70461`
- `wc -l CLAUDE.md` returns `509`
- `wc -c api/vercel-entry.js` returns `1808710` (1.72 MB)

### Secondary (MEDIUM confidence — single-file Read)
- `.planning/REQUIREMENTS.md` (43 v1.5 requirements + traceability table)
- `.planning/ROADMAP.md` (Phase 29-37 entries; Phase 30 cross-ref)
- `.planning/STATE.md` (current milestone position)
- `.planning/phases/29-*/29-CONTEXT.md` (the 10 locked decisions — read end-to-end)

### Verification grep results (HIGH confidence)
- `grep -rn "llmEventExtractor.v1\|llmEventExtractor.v2\|setPipelineOverride\|refreshPipelineOverride\|isPipelineV2\|pipeline-override\|events:llm-pipeline-override\|Pin-to-v1\|Pin-to-v2\|PipelineVersionPill" server/ src/` — 60+ matches, exhaustively traced
- `grep -rn "isLLMConfigured" server/` — 14 matches in production + tests
- `grep -rn "CEREBRAS_API_KEY\|GROQ_API_KEY" server/ src/` — 12 matches (tests + adapter + config Zod)
- `grep -rn "callLLM" server/` — 12 matches (3 production callers including resolver, plus extractor + tests)

## Metadata

**Confidence breakdown:**
- Cascade narrowing surface (Question 1): HIGH — `llm-provider.ts` read end-to-end; surface fully inventoried.
- v1/v2 deletion blast radius (Question 2): HIGH — 14 server files + 2 client files cataloged; each grep-traced.
- Pitfall 1 cache bridge (Question 3): HIGH — `events.ts:701-731` read line-by-line; v3:partial absence verified.
- Test harness pattern (Question 4): HIGH — `events-fallback.test.ts` is a perfect precedent; `api-connectivity.test.ts` correctly identified as network-prod-only.
- Override endpoint UI surface (Question 5): HIGH — DevApiStatus + Topbar surfaces fully inventoried; PipelineVersionPill recommendation argued from import-graph.
- CLAUDE.md baseline + trim plan (Question 6): HIGH — 18,846 tokens verified via tiktoken-cli; section-by-section line counts via awk; 39 sections classified.
- ADR convention (Question 7): HIGH — `docs/adr/` exists with 9 ADRs; README convention is Michael Nygard short template; 0009 collision discovered.
- Vercel Pro maxDuration (Question 8): HIGH — `vercel.json` is a 16-line file; only L13 changes.
- Cron-driven trigger interaction (Question 9): HIGH — `runRefreshExtraction({forceCooldown})` + `?force=true` flow traced through `refresh-events-cron.ts`.
- NIM throttle Phase 30 cross-ref (Question 10): HIGH — Phase 30 ROADMAP read; no parameter collisions.
- Validation Architecture (Question 11): HIGH — Wave 0 gaps inventoried; framework details captured from `vite.config.ts` + per-test conventions.

**Research date:** 2026-05-09
**Valid until:** ~30 days for stable; key items (Vercel Pro upgrade, CLAUDE.md baseline measurement) are point-in-time and should be re-verified at PR-open if more than 7 days have passed.

## Phase-Specific Question Answers (referenced inline above)

### Question 1: Cascade narrowing surface (D-01)

`server/adapters/llm-provider.ts` (286 lines, read end-to-end). **Surface to delete or modify:**

| Line | Element | Action |
|------|---------|--------|
| 3 | `import { env, isPipelineV2 } from '../config.js';` | Remove `isPipelineV2` import (D-02 deletes it from config); keep `env` |
| 13 | `export const CEREBRAS_MODEL = 'qwen-3-235b-a22b-instruct-2507';` | DELETE |
| 14 | `export const GROQ_MODEL = 'openai/gpt-oss-120b';` | DELETE |
| 25-32 | `function getCerebrasClient(): OpenAI \| null` | DELETE entire function |
| 34-41 | `function getGroqClient(): OpenAI \| null` | DELETE entire function |
| 71-88 | `function recordSkippedAttempt(...)` (synthesizes `'no_client'` callHistory entries) | DELETE entire function |
| 95-179 | `async function tryProviderOnce(...)` (cerebras\|groq cascade body) | DELETE entire function |
| 181-198 | `setProviderOrderOverride` + `getProviderOrder` (cerebras+groq order) | DELETE both |
| 212-265 | `export async function callLLM(...)` (cerebras+groq cascade orchestrator) | **OPEN — see Pitfall 3.** Either delete entire function OR repoint to `freeClaudeRouter.callLLM` so `llmResolver.ts:458` keeps its reranker LLM call. RECOMMENDED: delete + add a one-line shim `export const callLLM = freeClaudeCallLLM` from `freeClaudeRouter`. |
| 117 | `name: isPipelineV2() ? 'event_extraction_v2' : 'event_extraction'` | Inside the `tryProviderOnce` body being deleted |
| 145-148 | `tokenCounters: { cerebras: ..., groq: ... }` updateProgress | DELETE (or replace with `{}` if any test references it) |
| 279-286 | `export function isLLMConfigured()` | NARROW: keep only `env.NVIDIA_NIM_API_KEY \|\| env.OPENROUTER_API_KEY` (per CONTEXT D-01) |
| 281-282 | `env.CEREBRAS_API_KEY \|\| env.GROQ_API_KEY` inside `isLLMConfigured` | DELETE these 2 lines |

**Atomic-commit boundary for "Cerebras + Groq removed from runtime":** the verification grep is `grep -nP "cerebras\|groq\|Cerebras\|Groq" server/adapters/llm-provider.ts | grep -v "^// "` returns ZERO matches (post-narrowing). Same grep on `server/lib/llmTokenBudget.ts` will return matches (Pitfall 4 — out of scope) — but that's expected.

### Question 2: v1/v2 deletion blast radius (D-02)

**Production code** (must remove or modify):

| File | Lines | Classification |
|------|-------|----------------|
| `server/lib/llmEventExtractor.v1.ts` | entire file | DELETE |
| `server/lib/llmEventExtractor.v2.ts` | entire file | DELETE |
| `server/lib/llmEventExtractor.ts` | L20, 22, 28, 38-47, 79-104, 126-167 | SIMPLIFY: collapse 3-way dispatch (v1/v2/v3) → v3-only. Re-export v3 types only. |
| `server/lib/llmEventExtractor.v3.ts` | L28 (`setPipelineOverride` import), L82-86 (`PIPELINE_OVERRIDE_KEY` + TTL constants), L1031-1170 (auto-rollback ladder per Pitfall 2) | DELETE all listed; v3 extractor body proper stays |
| `server/lib/llmExtractionPipeline.ts` | L29 (`getPipelineVersion` import), L39 (`BATCH_SIZE_V2` import), L132 (`pipelineV3 \|\| pipelineV2`), L172-184 (3-way KEY_ACTIVE branching), L122-123 (`pipelineV2`/`pipelineV3` params on `mergeAndPersistLlmEntities`) | SIMPLIFY: collapse all v2/v3 branching → v3-only constants |
| `server/routes/events.ts` | L12 (`setPipelineOverride` import), L18 (`processEventGroupsV2` import), L320-353 (override key + `refreshPipelineOverride`), L368, 575-651, 662 (handler refresh calls), L668-680 (`getPipelineVersion`-based KEY_ACTIVE branching), L701-731 (Pitfall 1 v3→v2→v1 bridge), L505 (replay route's pipelineVersion branching), L739-742 (dev file cache v2/v3 branching) | DELETE override route + helpers; simplify Pitfall 1 to v3→raw; simplify replay route to v3-only; collapse dev file cache branching |
| `server/routes/operator-status.ts` | L10, 121, 128, 134-141 (pinTtl block) | DELETE pinTtl block; remove from response schema |
| `server/config.ts` | L319-366 (`pipelineOverride`, `setPipelineOverride`, `getPipelineOverride`, `isPipelineV2`, `isPipelineV3`, `getPipelineVersion`) | DELETE all 6 helpers; OR keep `getPipelineVersion` returning `'v3' as const` constant (planner picks per Question 6) |
| `server/index.ts` | L131 (comment referencing `events:llm-pipeline-override`) | UPDATE comment |
| `src/components/ui/DevApiStatus.tsx` | L972-998 (`confirmTarget`, `sendPipelinePin`, `isPinning` state), L1027-1039 (Escape-key handler for confirm modal), L1514 (comment), L1571-1607 (Pin v1/v2/v3/Clear buttons), L1625-1673 (confirm modal JSX) | DELETE all listed; the entire pin-pipeline button row + confirm modal infrastructure |
| `src/components/layout/Topbar.tsx` | L210-263 (`PIPELINE_COLORS`, `PipelineVersionPillInner`, `PipelineVersionPill`), L302 (`<PipelineVersionPill />` render call) | DELETE all listed (per Question 5 recommendation) |
| `src/lib/dashboardAuth.ts` | L46 (comment `PipelineVersionPill,`) | UPDATE comment |

**Test files** (must remove or update):

| File | Action |
|------|--------|
| `server/__tests__/lib/llmEventExtractor.v2.test.ts` | DELETE (tests deleted module) |
| `server/__tests__/lib/llmEventExtractor.test.ts` | DELETE if it only exercises v1 (L88, 123, 139, 166, 205 use `processEventGroups` from v1) — the file's other tests for the barrel router will need preservation in v3-only form |
| `server/__tests__/lib/llmAutoRollback.test.ts` | DELETE (per Pitfall 2) |
| `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` | UPDATE — remove `isPipelineV2: vi.fn().mockReturnValue(false)` mock at L105, `setPipelineOverride: vi.fn()` at L108 |
| `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` | UPDATE — L54, L57, L223 (v2 mock) |
| `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts` | UPDATE — L52, L55, L233 |
| `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` | UPDATE — L64, L67, L250 |
| `server/__tests__/lib/llmLineage-prefilter.test.ts` | UPDATE — L95, L98 |
| `server/__tests__/adapters/llm-provider.test.ts` | UPDATE — L23-24 (CEREBRAS_API_KEY, GROQ_API_KEY mocks become NVIDIA_NIM_API_KEY, OPENROUTER_API_KEY); L26 (`isPipelineV2: () => false` → delete) |
| `server/__tests__/routes/eval-cron.test.ts` | UPDATE — L30, L33 |
| `server/__tests__/routes/events.test.ts` | UPDATE — L207 (v2 mock) |
| `server/__tests__/routes/events.audit.test.ts` | UPDATE — L119 (v2 mock), L242-243 (`setPipelineOverride` cleanup) |
| `server/__tests__/routes/events.replayQuota.test.ts` | UPDATE — L171 (v2 mock), L312-313 (`setPipelineOverride` cleanup) |
| `server/routes/__tests__/operator-status.test.ts` | UPDATE — L98 (`events:llm-pipeline-override` mock branch) |
| `src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx` | DELETE entire file (tests deleted UI surface) |
| `src/__tests__/DevApiStatusV3.test.tsx` | UPDATE — L318-413 PipelineVersionPill describe block (delete) |

**ADR / historical doc** (preserved):
- `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` — historical record stays. Add reference from new ADR-0010 noting partial supersession.
- `.planning/phases/27.4-llm-enrichment-improvements/` — historical record stays.

**CLAUDE.md narrative** (handled by D-06 trim, not D-02):
- "LLM Enrichment v2 + Runtime Toggle (Phase 27.4)" L416-433
- "V2 Extractor Watchdog (Phase 27.4.1)" L459-467

### Question 3: Pitfall 1 cache bridge contract

The bridge at `server/routes/events.ts:701-731` is a 3-tier fallback: try v2, try v1, promote stale-v2 or stale-v1 for stale-serve at the end of the handler. Same pattern at L722-731 for v2-active mode. Post-D-02:

**Recommendation: simplify to a 1-tier bridge (raw GDELT only).**

- Lines 701-731 collapse to 0 lines — the entire `if (pipelineV3 && !llmCached?.data)` and `if (pipelineV2 && !llmCached?.data)` blocks delete.
- The `events:llm:v3` cache miss already falls through to the raw-GDELT path at L770 onwards (via `cached = ... await cacheGetSafe(EVENTS_KEY, LOGICAL_TTL_MS)`) which serves raw GDELT when LLM cache is empty.
- The `events:llm:v2` reads in the bridge become dead Redis reads against keys that no longer have writers — pure latency cost.

**Why this is safe:** the "map never goes blank" guarantee is preserved by:
1. `events:gdelt` raw cache is always populated (15-min poll cycle from GDELT lastupdate.txt).
2. `events:llm:v3` is populated by the daily cron + force-trigger path.
3. When the LLM cache is empty (genuinely unconfigured OR mid-deploy), the route falls to the raw-GDELT path and the map renders ~100-500 raw events. CONTEXT D-02 explicitly says "raw GDELT remains terminal fallback".

**Alternative (more conservative):** keep the v2 read leg for one deploy cycle only — bumps the deploy window from instant to 7d (TTL of `events:llm:v2`) but adds latency to every cold cache fetch. RECOMMENDED: take the simplification — the deploy window concern is addressed by `events:gdelt` being the terminal fallback, not v2.

### Question 4: Test harness pattern for D-04

**Decision: in `server/__tests__/routes/llm-optional.test.ts` (server-side, in-process via `createApp()` factory).**

Why:
- `src/__tests__/api-connectivity.test.ts` is network-prod-smoke (skipped by default unless `RUN_CONNECTIVITY_TEST=1`); it cannot mock env vars deterministically.
- `server/__tests__/routes/events-fallback.test.ts` is the existing precedent for "test `/api/events` graceful degradation" — uses `createApp()` factory at L215, mocks `isLLMConfigured` at L67, asserts response shape against raw GDELT fixtures.
- Mocking pattern: `vi.mock('../../adapters/llm-provider.js', () => ({ isLLMConfigured: () => false }))` — no `vi.stubEnv`, no new factory parameter. (Question 4 sub-decision matches Pattern 1 above.)
- Bearer fingerprint: not needed. The test runs in `NODE_ENV !== 'production'`, so `dashboardAuth` middleware bypasses (server/middleware/dashboardAuth.ts:34-37). The route is reachable without Bearer.

The complete test scaffold is in the Code Examples section above.

### Question 5: Override endpoint + DevApiStatus surface

**`POST /api/events/llm-pipeline` route registration:** `server/routes/events.ts:581-651` (the `eventsRouter.post('/llm-pipeline', dashboardAuth, async (req, res) => {...})`). Bearer-gated via `dashboardAuth` middleware. Path is enumerated in `server/middleware/dashboardAuth.ts:8-12` (comment listing protected routes — needs comment update).

**DevApiStatus Pin buttons:** `src/components/ui/DevApiStatus.tsx:1571-1607` (Pin to v1, Pin to v2, Pin to v3, Clear pin buttons, all with `data-testid="pin-pipeline-{v1\|v2\|v3\|clear}"`). Confirm modal at L1625-1673 (`data-testid="confirm-pin-modal"`).

**`PipelineVersionPill`:** `src/components/layout/Topbar.tsx:210-263`. Recommendation: **DELETE**, per Question 2 / Open Question 1. The pill's only function is to query `/api/events/llm-pipeline` (deleted in D-02) — it cannot render anything without that endpoint.

**`server/middleware/dashboardAuth.ts` enumerated routes:** L8-12 lists 4 protected routes. After D-02:
- `/api/events/llm-pipeline` — deleted; remove from list comment
- `/api/events/llm-replay/:groupKey` — kept (still useful for replay testing)
- `/api/dashboard/auth-check` — kept

### Question 6: CLAUDE.md baseline + trim plan

**Baseline: 18,846 tokens (gpt-4o tokenizer, verified via `npx tiktoken-cli CLAUDE.md`).** Bytes: 70,461. Lines: 509.

**Section list (39 sections; classification in next column):**

| # | Section | Lines | Classification |
|---|---------|-------|----------------|
| 1 | `# Iran Conflict Monitor` | 1-1 | KEEP (heading) |
| 2 | `## Project Context` | 3-5 | KEEP (1 paragraph) |
| 3 | `## Conventions` | 7-17 | KEEP (operator-grade rules) |
| 4 | `## Environment Variables (Phase 28.1+)` | 19-27 | KEEP (env-tunables) |
| 5 | `## Color Tokens (Phase 28.1+)` | 29-37 | KEEP (load-bearing) |
| 6 | `## Map Patterns` | 39-45 | KEEP (operator-grade) |
| 7 | `## Testing` | 47-52 | KEEP (operator-grade) |
| 8 | `## Key Files` | 54-72 | KEEP (file-line registry) |
| 9 | `## Data Model (Phase 3+)` | 74-82 | KEEP (load-bearing) |
| 10 | `## Flight Data Patterns (Phase 4+)` | 84-93 | TRIM (distill to 2-line bullet) |
| 11 | `## Multi-Source Flight Data (Phase 6-7)` | 95-103 | TRIM (distill) |
| 12 | `## Ship & Event Data (Phase 8+)` | 105-113 | TRIM |
| 13 | `## Conflict Event Data (Phase 8.1+)` | 115-128 | TRIM |
| 14 | `## LLM Event Pipeline (Phase 27)` | 130-145 | TRIM aggressively + UPDATE for narrowed cascade |
| 15 | `## Layer Controls & Tooltips (Phase 9-10)` | 147-160 | TRIM |
| 16 | `## Detail Panel (Phase 10)` | 162-175 | TRIM |
| 17 | `## Analytics Counters (Phase 12)` | 177-185 | DELETE (not load-bearing) |
| 18 | `## Serverless Cache (Phase 13)` | 187-205 | KEEP+UPDATE (registry) — remove `events:llm-pipeline-override` per D-02; re-evaluate `events:llm:v2` |
| 19 | `## Vercel Deployment (Phase 14)` | 207-216 | KEEP+UPDATE (Pro upgrade) |
| 20 | `## Key Sites Overlay (Phase 15)` | 218-234 | TRIM |
| 21 | `## News Feed (Phase 16)` | 236-248 | TRIM |
| 22 | `## Notification Center (Phase 17)` | 250-266 | TRIM |
| 23 | `## Oil Markets Tracker (Phase 18)` | 268-276 | DELETE |
| 24 | `## Search & Filter System (Phase 19+)` | 278-290 | TRIM |
| 25 | `## Visualization Layers (Phase 20)` | 292-305 | TRIM |
| 26 | `## Counter Entity Dropdowns (Phase 19.2)` | 307-312 | DELETE |
| 27 | `## Date Range Filter (Phase 11+13)` | 314-322 | DELETE |
| 28 | `## Threat Density Improvements (Phase 23+23.2)` | 324-339 | DELETE |
| 29 | `## Detail Panel Navigation Stack (Phase 23.1)` | 341-351 | DELETE |
| 30 | `## Political Boundaries Layer (Phase 24)` | 353-368 | TRIM |
| 31 | `## Ethnic Distribution Layer (Phase 25)` | 370-386 | TRIM |
| 32 | `## Water Stress Layer (Phase 26)` | 388-414 | TRIM |
| 33 | `## LLM Enrichment v2 + Runtime Toggle (Phase 27.4)` | 416-433 | DELETE (D-02 obsoletes; rationale moves to ADR-0010) |
| 34 | `## Parallel v3 Batch Processing (Phase 27.4.4 Plan 02)` | 435-441 | TRIM aggressively (1-bullet retention of `LLM_V3_CONCURRENCY=12` default) |
| 35 | `## Cron-Driven Pipeline Trigger (Phase 27.4.6)` | 443-457 | TRIM aggressively (3-bullet retention of cron schedule + force-trigger + cache-only invariant) |
| 36 | `## V2 Extractor Watchdog (Phase 27.4.1)` | 459-467 | DELETE (D-02 obsoletes) |
| 37 | `## Phase 28.1 Cleanup Sweep — closeout 2026-05-03` | 469-481 | DELETE (replace with 1-line link to milestones/v1.4-ROADMAP.md) |
| 38 | `## Phase 28.2 Dev/Prod Sync + Domain Rename — closeout 2026-05-06` | 483-496 | DELETE (replace with 1-line link) |
| 39 | `## Phase 28.2.5 API Green-Light Prereq Gate — closeout 2026-05-06` | 498-509 | DELETE (replace with 1-line link) |

**Final shape (estimated):**
- KEEP: sections 1-9, 18, 19 (11 sections, ~3,500 tokens)
- TRIM (1-3 bullets each): sections 10-16, 20-22, 24-25, 30-32, 34, 35 (15 sections, ~3,000 tokens — average 200 tokens per trimmed section)
- DELETE: sections 17, 23, 26-29, 33, 36-39 (10 sections, ~6,800 tokens removed)
- ADD: 1-line links to `milestones/v1.4-ROADMAP.md` etc. for deleted sections (~300 tokens)

**Estimated post-trim total: ~6,800 tokens** (well under the 10k target with ~3.2k headroom).

**Link target check:** `.planning/milestones/v1.4-ROADMAP.md` exists (verified). Other targets like `milestones/v1.0-ROADMAP.md`, `v1.1-ROADMAP.md`, etc. exist as `v0.9-ROADMAP.md`, `v1.3-ROADMAP.md`, `v1.4-ROADMAP.md` (no v1.0/v1.1/v1.2 — `.planning/milestones/v1.0-phases/` exists but no ROADMAP file). Recommendation: link to `milestones/v1.X-ROADMAP.md` for the milestone the deleted section belonged to; for sections without a milestone-specific ROADMAP, link to the relevant phase folder under `.planning/milestones/`.

### Question 7: ADR convention

`docs/adr/` exists. 9 numbered ADRs (0001-0009) + `README.md` + `template.md`. Convention is Michael Nygard short template (Status / Date / Deciders / Context / Decision / Consequences / Alternatives Considered / References). Numbering is zero-padded 4-digit, never reused.

**ADR-0009 collision:** Already taken by `0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` (Accepted, 2026-04-24). The Phase 29 stub MUST be ADR-0010. See Pitfall 1 + Code Example.

### Question 8: Vercel Pro maxDuration bump (D-08)

`vercel.json` is a 16-line file. Only line 13 changes:
```diff
-      "maxDuration": 300
+      "maxDuration": 800
````

Bundled entry path is `api/vercel-entry.js` (verified via `vercel.json:11` `"api/vercel-entry.js"` key, NOT `dist-server/vercel.cjs`). The CLAUDE.md `Vercel Deployment` section references `dist-server/vercel.cjs` as the bundle output — but `vercel.json` references `api/vercel-entry.js`. Both files exist (file at `api/vercel-entry.js` is 1.72 MB, freshly bundled). The `api/vercel-entry.js` is the deployed entry — `dist-server/vercel.cjs` is a build-time intermediate. CLAUDE.md needs an update here too (handled by D-06 trim — section 19 TRIM).

No other related caps need tuning. The `vercel.json` is otherwise minimal.

### Question 9: Cron-Driven Pipeline Trigger (Phase 27.4.6) interaction

`runRefreshExtraction({triggeredBy, forceCooldown})` (`server/lib/llmExtractionPipeline.ts:170`) is the only caller of LLM extraction. It's called from `server/routes/refresh-events-cron.ts` (the only caller of the helper).

After D-02 deletes `getPipelineVersion()` (or simplifies it to constant-`'v3'`), the helper's L172-184 branching collapses to v3-only constants. The `?force=true` query param flow at `refresh-events-cron.ts:58` still works (it passes `forceCooldown: true` directly to the helper). CONTEXT D-09 verification (synthetic >300s invocation against `/api/cron/refresh-events?force=true`) is unchanged.

**No collision with D-02.** The cron path stays.

### Question 10: NIM throttle behavior under narrowed cascade

Phase 30 (LLM-RELI-02/03/04) characterizes NIM throttle window + RPM ceiling + recovery signal, then tunes `LLM_BATCH_SIZE`, `LLM_V3_CONCURRENCY`, `callLLM` retry/backoff parameters against the measured data.

Phase 29 doesn't touch any of those parameters. Phase 30 tunes against the 800s Pro ceiling that Phase 29 lands. **No collision.**

The only Phase 30-relevant cleanup that could happen in Phase 29 (but is explicitly deferred to Phase 30 per CONTEXT) is the NIM throttle pre-flight probe / retry queue — anti-pattern #18 (Phase 27.4.6) explicitly says these are NOT to be built. Phase 29 must NOT introduce them.

### Question 11: Validation Architecture

Captured in the `## Validation Architecture` section above. Key gaps for Wave 0:

1. `server/__tests__/routes/llm-optional.test.ts` (NEW — primary D-04 deliverable)
2. Update `server/__tests__/adapters/llm-provider.test.ts` env-var mocks
3. Add 404-assertion test for deleted `POST /api/events/llm-pipeline` route
4. Delete obsolete tests (`llmAutoRollback.test.ts`, `llmEventExtractor.v2.test.ts`, `confirmModal.test.tsx`, parts of `DevApiStatusV3.test.tsx`, parts of `llmEventExtractor.test.ts`)
5. Update existing tests to remove `setPipelineOverride` / `isPipelineV2` mocks (9 files)
