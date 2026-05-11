---
phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
verified: 2026-05-11T11:42:00Z
gap_resolved: 2026-05-11T11:42:30Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
gap_closure_inline:
  - truth: 'CLAUDE.md trimmed to current-state invariants only (DOCS-INT-01) — must include working cross-references'
    original_status: partial
    resolution: 'Fixed inline by orchestrator post-verify. CLAUDE.md L151 link target swapped from `docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md` (404) to `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (the slug Plan 29-11 used, consistent with ADRs 0001–0009). Committed as `docs(29): fix broken ADR-0010 link in CLAUDE.md — gap from verifier` (commit 5d4b261).'
    artifacts:
      - path: 'CLAUDE.md'
        line: 151
        before: 'docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md'
        after: 'docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md'
deferred:
  - truth: 'Full ADR-0010 body expansion (Phase 29 wrote a STUB per D-03; `<expand_at_36>` marker present)'
    addressed_in: 'Phase 36'
    evidence: "Phase 36 success criterion 1: 'A new ADR (ADR-0010) is committed under docs/adr/ documenting the v1.5 LLM-pipeline decisions... rationale, trade-offs, rollback plan'. ADR-0010 stub explicitly contains `<expand_at_36>` marker per Plan 11 SUMMARY."
  - truth: 'Synthetic >300s invocation verifying Vercel Pro 800s maxDuration (success criterion 5 dashboard + invocation halves)'
    addressed_in: 'Phase 30 / Phase 31'
    evidence: "Phase 30 success criterion 1: 'at least one full extraction run instrumented end-to-end on the Pro 800s ceiling'; Phase 31 7-day stability watch observes daily cron lands healthy on Pro 800s ceiling. The first cron tick post-deploy organically exercises the new ceiling."
  - truth: 'GitHub repo rename `zack-maz/onthegrid.icm` → `zack-maz/otg-iran-monitor` + local folder rename (D-11)'
    addressed_in: 'Operator out-of-band post-merge action (29-13 SUMMARY)'
    evidence: "29-13 SUMMARY frontmatter `provides: 'Phase 29 closeout commit ready for orchestrator merge'` + `affects: 'All future phases (operator post-merge will mv local folder + git remote set-url; subsequent phases run from /Users/zackmaz/Desktop/otg-iran-monitor)'`. Documented as operator OOB action per verification objective."
---

# Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + CLAUDE.md Trim Verification Report

**Phase Goal:** Active runtime LLM cascade narrowed to NIM + OpenRouter only; the map proven to render cleanly on raw GDELT when both keys are absent; Vercel project upgraded to Pro with `vercel.json maxDuration: 800`; CLAUDE.md trimmed to current-state invariants (<10k tokens); v1+v2 extractor modules + override endpoint + pin-pipeline UI all deleted; ADR-0010 stub captured.

**Verified:** 2026-05-11
**Status:** gaps_found (one minor doc-drift; goal materially achieved)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (from ROADMAP Success Criteria + PLAN requirements)                                                                                                                                                                      | Status                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **LLM-RELI-01 / SIMPLIFY-04:** Operator inspecting the running pipeline sees only `nim` and `openrouter` provider names appearing in callHistory; Cerebras + Groq absent from active cascade and from `isLLMConfigured` gating | ✓ VERIFIED                                              | `grep -n "cerebras\|groq" server/adapters/llm-provider.ts` returns 0 active code matches. Module header declares "two-provider cascade has been removed... active LLM call path is NVIDIA NIM + OpenRouter via freeClaudeRouter." `isLLMConfigured` narrowed to NIM + OpenRouter env-var pair.                                                                                                                                                                                                                                                                                              |
| 2   | **LLM-RELI-05 / D-04:** With NVIDIA_NIM_API_KEY + OPENROUTER_API_KEY both unset, `/api/events` continues to serve events sourced from raw GDELT through Pitfall 1 cache bridge                                                 | ✓ VERIFIED                                              | `server/__tests__/routes/llm-optional.test.ts` exists (12,484 bytes); `npx vitest run server/__tests__/routes/llm-optional.test.ts` → **2/2 tests pass** (1.08s wall-clock). Test asserts non-empty events from raw GDELT path + `freeClaudeRouter.callLLM` never invoked from events-route hot path.                                                                                                                                                                                                                                                                                       |
| 3   | **SIMPLIFY-06 / D-02:** v1 + v2 extractor modules DELETED; `POST /api/events/llm-pipeline` route DELETED; DevApiStatus Pin-to-v1/v2 buttons DELETED; ADR-0010 stub captured                                                    | ✓ VERIFIED                                              | `server/lib/llmEventExtractor.v1.ts` MISSING (confirmed); `.v2.ts` MISSING (confirmed); `POST /api/events/llm-pipeline` route registration absent from `events.ts` (only stale comments remain — verified line 27 + 321 are paraphrased commentary not active registration); `grep -n "PipelineVersionPill" src/components/layout/Topbar.tsx` returns 0 matches; deletion-marker comments in `DevApiStatus.tsx` confirm Pin-to-v1/v2 buttons gone. ADR file present at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` with Status: Accepted + `<expand_at_36>` marker.         |
| 4   | Existing degradation contract honored — no regression in "map never goes blank" guarantee                                                                                                                                      | ✓ VERIFIED                                              | Pitfall 1 bridge at `server/routes/events.ts:501` documented as "simplified Phase 29 D-02 — v3 cache → raw GDELT only." `events.ts:445-459` reader sequence: `events:llm:v3` → `events:gdelt` raw fallback. LLM-optional test #2 confirms `freeClaudeRouter.callLLM` not invoked from GET hot path even with keys absent. Full vitest suite (166 files / 2128 tests) passes.                                                                                                                                                                                                                |
| 5   | **D-08:** Vercel project on Pro plan; `vercel.json functions.api/vercel-entry.js.maxDuration` bumped 300 → 800; redeploy lands cleanly                                                                                         | ✓ VERIFIED (config) / ⚠ deferred (synthetic invocation) | `vercel.json` shows `"maxDuration": 800` (verified). Operator pre-confirmed Pro upgrade per orchestrator brief. Synthetic >300s `/api/cron/refresh-events?force=true` invocation deferred to first organic cron tick (Phase 30/31 will observe).                                                                                                                                                                                                                                                                                                                                            |
| 6   | **SIMPLIFY-04:** Cerebras + Groq adapter dead code purged from `server/adapters/llm-provider.ts` runtime path; CEREBRAS_API_KEY / GROQ_API_KEY checks removed from `isLLMConfigured`                                           | ✓ VERIFIED                                              | `grep -n "cerebras\|groq" server/adapters/llm-provider.ts` → 0 matches in active code. Module is now a "thin compatibility shim" per header comment. `isLLMConfigured` source-of-truth (`server/config.ts`) has no isPipelineV2/V3/getPipelineVersion/setPipelineOverride/getPipelineOverride/refreshPipelineOverride symbols (confirmed 0 matches across server/ + src/).                                                                                                                                                                                                                  |
| 7   | **DOCS-INT-01 / D-06:** CLAUDE.md trimmed to <10k tokens; phase-history bloat condensed; Cerebras/Groq + v1/v2 narrative blocks deleted                                                                                        | ⚠ PARTIAL                                               | Token count: 18,846 → 5,018 gpt-4o tokens per Plan 12 SUMMARY (73.3% reduction; 4,982 tokens headroom under 10k target). `grep -c "Cerebras\|Groq\|gpt-oss-120b\|qwen-3-235b" CLAUDE.md` → 0. `grep -c "llmEventExtractor.v1\|llmEventExtractor.v2" CLAUDE.md` → 0. 5-item operator skim spot-check passes (Redis keys, env vars, color tokens, domain constants, cron schedule all findable in <30s). **GAP:** Line 151 markdown link to `docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md` is broken — actual ADR file is at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`. |
| 8   | **SIMPLIFY-06 (full deletion):** v1+v2 modules deleted; override route + Redis key writes deleted; DevApiStatus pin buttons deleted; rationale captured in ADR-0010 stub                                                       | ✓ VERIFIED                                              | Mirrors truth #3 evidence. Plus `server/lib/llmEventExtractor.ts` barrel collapsed to v3-only re-export (`type ExtractorRun = { schemaVersion: 'v3'; ... }`). Operator-status `pinTtl` block deletion confirmed via 29-04 SUMMARY + `grep -n "pinTtl\|llm-pipeline-override" server/routes/operator-status.ts` → 0 matches.                                                                                                                                                                                                                                                                 |

**Score:** 7/8 truths verified; 1 partial (CLAUDE.md trim achieved its primary token target but introduced a single broken markdown link).

### Required Artifacts

| Artifact                                                        | Expected                                              | Status     | Details                                                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel.json`                                                   | `maxDuration: 800` in `functions.api/vercel-entry.js` | ✓ VERIFIED | Confirmed via `cat vercel.json`                                                                                                                   |
| `server/lib/llmEventExtractor.v1.ts`                            | NOT EXIST                                             | ✓ VERIFIED | `ls` returns "No such file or directory"                                                                                                          |
| `server/lib/llmEventExtractor.v2.ts`                            | NOT EXIST                                             | ✓ VERIFIED | `ls` returns "No such file or directory"                                                                                                          |
| `server/lib/llmEventExtractor.ts` (barrel)                      | EXISTS, v3-only                                       | ✓ VERIFIED | Header declares "Phase 29 D-02 part C collapsed the v1/v2/v3 dispatch barrel to a v3-only re-export"; only imports from `llmEventExtractor.v3.js` |
| `server/lib/llmEventExtractor.v3.ts`                            | EXISTS, active                                        | ✓ VERIFIED | Phase 27.4.3 module still present and active; sole writer of `events:llm:v3`                                                                      |
| `server/adapters/llm-provider.ts`                               | NIM + OpenRouter shim; no Cerebras/Groq imports       | ✓ VERIFIED | Module header confirms "thin compatibility shim"; `isLLMConfigured` narrowed to NIM + OpenRouter                                                  |
| `server/__tests__/routes/llm-optional.test.ts`                  | EXISTS with 2+ passing tests                          | ✓ VERIFIED | 12,484 bytes; 2/2 tests pass via direct vitest run                                                                                                |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`     | EXISTS with Accepted status                           | ✓ VERIFIED | 4,867 bytes; Status: Accepted; Date: 2026-05-11; `<expand_at_36>` marker present                                                                  |
| `docs/runbook.md` "LLM Pipeline Disabled / Keys Absent" section | EXISTS, substantive                                   | ✓ VERIFIED | Line 31 TOC entry; line 673 section start; 5-step operator smoke test with explicit vercel.com URLs + curl commands                               |
| `CLAUDE.md`                                                     | <10k tokens, no Cerebras/Groq/v1/v2 references        | ⚠ PARTIAL  | 5,018 gpt-4o tokens (passes target); 0 Cerebras/Groq/v1/v2 references; **1 broken markdown link** to non-existent ADR path                        |

### Key Link Verification

| From                                       | To                                                | Via                          | Status                    | Details                                                                                                  |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `server/lib/llmEventExtractor.ts` (barrel) | `llmEventExtractor.v3.ts`                         | named import                 | ✓ WIRED                   | `import { processEventGroupsV3, geocodeEnrichedEventsV3, ... } from './llmEventExtractor.v3.js'`         |
| `server/lib/llmExtractionPipeline.ts`      | `llmEventExtractor.ts` barrel                     | `processEventGroups` import  | ✓ WIRED                   | Barrel still exports the named function; pipeline runner imports unchanged                               |
| `server/routes/events.ts` Pitfall 1 bridge | `events:llm:v3` → `events:gdelt`                  | cacheGetSafe + fallback flow | ✓ WIRED                   | `events.ts:445-459` + `events.ts:501-558` confirm v3-cache → raw-GDELT terminal fallback only            |
| `server/routes/events.ts`                  | `POST /api/events/llm-pipeline`                   | route registration           | ✓ NOT_WIRED (intentional) | No `router.post(...llm-pipeline...)` matches; deletion confirmed; only paraphrased comments remain       |
| `CLAUDE.md` ADR cross-reference            | `docs/adr/ADR-0010-...`                           | markdown link                | ✗ NOT_WIRED (broken)      | Target file does not exist; actual ADR is at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` |
| `CLAUDE.md` v1.4 history cross-reference   | `.planning/milestones/v1.4-ROADMAP.md` + dir      | markdown link                | ✓ WIRED                   | Both targets exist                                                                                       |
| `CLAUDE.md` runbook cross-reference        | `docs/runbook.md`                                 | markdown link                | ✓ WIRED                   | Target exists                                                                                            |
| `docs/runbook.md` LLM-Disabled section     | `vercel.com/zack-mazs-projects/onthegrid.icm/...` | inline URL                   | ✓ WIRED                   | Section is substantive, with 5-step operator smoke procedure                                             |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense — Phase 29 is primarily a deletion + simplification phase, not a feature build. The active data flow is `cron → runRefreshExtraction → llmEventExtractor.ts barrel → llmEventExtractor.v3.ts → freeClaudeRouter → events:llm:v3 → /api/events → raw GDELT fallback`. Each leg verified above via key-link checks. `npx vitest run` full suite (2128 tests pass) is the integrated regression guard.

### Behavioral Spot-Checks

| Behavior                        | Command                                                          | Result                                                                                                          | Status |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| LLM-optional test passes        | `npx vitest run server/__tests__/routes/llm-optional.test.ts`    | Test Files 1 passed (1); Tests 2 passed (2); 1.08s                                                              | ✓ PASS |
| Full vitest suite passes        | `npx vitest run --reporter=dot`                                  | 166 passed / 2 skipped (168); 2128 passed / 19 skipped / 5 todo (2152); 52.34s                                  | ✓ PASS |
| TypeScript typecheck clean      | `npx tsc --noEmit`                                               | 0 errors output                                                                                                 | ✓ PASS |
| Module re-export resolves       | (implicit via vitest harness — barrel loads through full suite)  | Barrel `processEventGroups` + `geocodeEnrichedEvents` imports across 2128 tests with no missing-symbol failures | ✓ PASS |
| CLAUDE.md token count <10k      | `wc -c CLAUDE.md` + `python3 char/4 estimate`                    | 17,810 chars → ~4,452 token estimate (chars/4); Plan 12 reported 5,018 gpt-4o tokens; both pass the 10k target  | ✓ PASS |
| Synthetic >300s prod invocation | Production `curl /api/cron/refresh-events?force=true` >300s wall | Deferred — first organic 04:00 UTC tick exercises this; Phase 30 will measure                                   | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan(s) | Description                                                           | Status      | Evidence                                                                                                                                              |
| ----------- | -------------- | --------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-RELI-01 | 29-03          | Narrow active runtime cascade to NIM + OpenRouter                     | ✓ SATISFIED | `server/adapters/llm-provider.ts` thin shim; 0 Cerebras/Groq active imports                                                                           |
| LLM-RELI-05 | 29-09          | LLM-optional architecture proven; CI guard locks contract             | ✓ SATISFIED | `llm-optional.test.ts` 2/2 pass; runs on every PR (no skip gate)                                                                                      |
| SIMPLIFY-04 | 29-03          | Cerebras + Groq dead-code purged from llm-provider.ts                 | ✓ SATISFIED | Module header confirms shim mode; isLLMConfigured narrowed                                                                                            |
| SIMPLIFY-06 | 29-05 + 29-06  | v1 + v2 extractor modules deleted (folded from Phase 34 archive)      | ✓ SATISFIED | `.v1.ts` + `.v2.ts` MISSING; barrel collapsed to v3-only; tests deleted                                                                               |
| DOCS-INT-01 | 29-12          | CLAUDE.md trimmed to <10k tokens                                      | ⚠ PARTIAL   | Token target hit (5,018 / <10,000); 1 broken markdown link to ADR — minor doc-drift                                                                   |
| D-01        | 29-03          | Hard-delete Cerebras + Groq from runtime path                         | ✓ SATISFIED | Verified per LLM-RELI-01                                                                                                                              |
| D-02        | 29-04..29-08   | Delete v1+v2 modules + override route + UI buttons + Redis key writes | ✓ SATISFIED | All deletion targets confirmed via grep + ls + summary cross-check                                                                                    |
| D-03        | 29-11          | ADR-0010 stub committed (full v1.5 retirement rationale)              | ✓ SATISFIED | `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` Status: Accepted; `<expand_at_36>` marker present                                         |
| D-04        | 29-09 + 29-10  | Integration test + runbook entry                                      | ✓ SATISFIED | Test 2/2 pass; runbook section at line 673                                                                                                            |
| D-05        | 29-09          | NO kill-switch env var (unset keys IS the kill switch)                | ✓ SATISFIED | Test asserts behavior with both keys absent; no LLM_PIPELINE_ENABLED env var introduced                                                               |
| D-06        | 29-12          | CLAUDE.md trim methodology (current-state-invariants only)            | ⚠ PARTIAL   | Trim landed per spec but introduces 1 broken markdown link                                                                                            |
| D-07        | 29-12          | Verification = token count + 5-item operator spot-check               | ✓ SATISFIED | 73.3% reduction; 5-item skim passes per 29-12 SUMMARY                                                                                                 |
| D-08        | 29-01          | Pro upgrade BEFORE phase plans; first commit = maxDuration 300 → 800  | ✓ SATISFIED | `vercel.json maxDuration: 800` confirmed; orchestrator brief notes operator pre-confirmed Pro                                                         |
| D-09        | 29-01          | Synthetic >300s invocation                                            | ? DEFERRED  | Deferred to first organic cron tick / Phase 30 measurement                                                                                            |
| D-10        | (scope edit)   | Phase 34 success criterion #8 (v1 archive) removed; SIMPLIFY-06 → 29  | ✓ SATISFIED | ROADMAP.md Phase 34 bullet notes "_(DOCS-INT-01 CLAUDE.md trim moved to Phase 29... SIMPLIFY-06 v1 archive folded into Phase 29's full deletion.)_"   |
| D-11        | 29-13          | Folder + repo rename to `otg-iran-monitor`                            | ✓ DOCS DONE | Documentation portion (README + governance docs + debug doc) renamed in commit `3da4563`; operator-side `mv` + `git remote set-url` is OOB post-merge |

**Orphan check:** No requirement IDs from REQUIREMENTS.md are mapped to Phase 29 but missing from a PLAN's `requirements:` field. All 5 ROADMAP requirements (LLM-RELI-01, LLM-RELI-05, SIMPLIFY-04, SIMPLIFY-06, DOCS-INT-01) accounted for above plus D-01 through D-11.

### Anti-Patterns Found

| File        | Line | Pattern                                                                                                | Severity  | Impact                                                                                                                                                    |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` | 151  | Broken markdown link `[docs/adr/ADR-0010-llm-pipeline-v1-5-decisions.md]` — target file does not exist | ⚠ Warning | Operator-skim doc forward-pointer is dead; readers who click the link land on a 404. Goal materially achieved (the ADR exists, just at a different slug). |

No other anti-patterns found. The "v2" string match inside `server/lib/llmEventExtractor.v3.ts` line 4 is an ancestry-explanation comment ("Mirrors v2 (server/lib/llmEventExtractor.v2.ts) with three changes...") — a historical reference, not a live import. The "Pin-to-v1/v2" matches in `DevApiStatus.tsx` (lines 971, 1508, 1532) are deletion-marker comments ("Phase 29 Plan 08 D-02 part D — operator pipeline-pin surface removed") which Plan 08 SUMMARY documents as a deliberate forensic breadcrumb pattern.

### Human Verification Required

None for code/test artifacts (programmatic verification was sufficient). The deferred Phase 30/31 items (synthetic >300s invocation against Pro plan + 7-day cron stability watch) are explicitly future phase work, not gaps in Phase 29.

### Gaps Summary

**Single gap, low severity, easily fixable:**

CLAUDE.md line 151's forward pointer to ADR-0010 references a filename (`ADR-0010-llm-pipeline-v1-5-decisions.md`) that was the CONTEXT.md-specified pretty-name; Plan 29-11 chose a different slug (`0010-v1-5-llm-pipeline-narrowing-and-deletion.md`) consistent with the existing ADR file-naming convention in `docs/adr/` (where every prior ADR uses lowercase-hyphenated-prefix). The link is broken — but the ADR document exists, is committed, has Status: Accepted, and contains the agreed `<expand_at_36>` marker. Plan 29-12 ran the trim using the CONTEXT-specified filename rather than the as-built filename from Plan 29-11.

**Recommended closure:** A one-line edit to CLAUDE.md updating the link target. This could land as:

1. A docs hotfix commit appended to the Phase 29 branch before merge (`docs(29): fix CLAUDE.md ADR-0010 link target`), OR
2. Folded into Phase 35's public-docs sweep (which already touches CLAUDE.md-adjacent docs and would catch this in a routine validation pass), OR
3. An orchestrator-level `gsd-plan-phase --gaps` follow-up.

**Why this is not a blocker for the phase goal:** The phase goal was the cascade narrowing, LLM-optional proof, Vercel Pro upgrade, and CLAUDE.md trim — all four landed. The phase did not promise broken-link-free markdown; the broken link is a typo-class artifact of two plans diverging on a filename convention mid-phase. The doc-drift does not weaken any of the 8 success criteria materially.

---

_Verified: 2026-05-11T11:42:00Z_
_Verifier: Claude (gsd-verifier)_
