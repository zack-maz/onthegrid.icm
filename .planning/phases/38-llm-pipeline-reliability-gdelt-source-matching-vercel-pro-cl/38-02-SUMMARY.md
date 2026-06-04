---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 02
subsystem: llm-pipeline
tags: [llm-purge, deletion, refactor, deadcode, v3-only]
requires:
  - 38-01 (honest-signals fixes to health/water/eval/llmProgress + replay 503 guard)
provides:
  - v3-only LLM extraction pipeline (stub barrel deleted; direct v3 import)
  - collapsed v3-only llmSchema (v1/v2 exported schemas + batch envelope gone)
  - NIM-only llm-provider (callLLM shim removed; isLLMConfigured preserved)
  - pipelineAudit fully deleted (writer + reader + /llm-status surface + UI block)
  - OpenRouter dormant-gated provider with dead daily-cap counter removed
affects:
  - server/lib/llmExtractionPipeline.ts
  - server/lib/llmEventExtractor.v3.ts
  - server/adapters/llm-provider.ts
  - server/lib/llmSchema.ts
  - server/lib/freeClaudeRouter.ts
  - server/routes/events.ts
  - server/openapi.yaml
  - src/components/ui/DevApiStatus.tsx
  - src/hooks/useLLMStatusPolling.ts
tech-stack:
  added: []
  patterns:
    - 'Deletion-correctness gate: npm run typecheck (zero dangling importers) + targeted vitest'
    - 'Un-exported .extend() base const (enrichedEventV2) survives schema collapse (Pitfall 2)'
    - 'Dormant key-gated provider preserved while dead Redis accounting removed (ADR-0010)'
key-files:
  created:
    - .planning/phases/38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl/deferred-items.md
  deleted:
    - server/lib/llmEventExtractor.ts
    - server/lib/pipelineAudit.ts
  modified:
    - server/lib/llmExtractionPipeline.ts
    - server/adapters/llm-provider.ts
    - server/lib/llmSchema.ts
    - server/lib/llmEventExtractor.v3.ts
    - server/lib/freeClaudeRouter.ts
    - server/lib/replayQuota.ts
    - server/routes/events.ts
    - server/openapi.yaml
    - server/config.ts
    - .env.example
    - src/components/ui/DevApiStatus.tsx
    - src/hooks/useLLMStatusPolling.ts
    - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md
decisions:
  - 'Inline the v3 call in the pipeline (call processEventGroupsV3/geocodeEnrichedEventsV3 directly with the v3-native flat-array signature) rather than reconstructing the deleted tagged-wrapper shape — fewer moving parts, one truth source'
  - 'Keep enrichedEventV2 as an un-exported base const because enrichedEventV3 = enrichedEventV2.extend() (Pitfall 2); only the EXPORTED v1/v2 schemas + batchResponseV2 were deleted'
  - 'Keep EVENT_EXTRACTION_SCHEMA_V2 JSON-schema literal (out of named deletion scope; still referenced by the V3-un-aliased referential contract test)'
  - 'Preserve OpenRouter as a dormant key-gated cascade provider (ADR-0010 semantics); only the dead llm:tokens:openrouter daily-cap counter + cap-gate were removed (D-04 Path A)'
  - 'daily_cap survives as a legacy skipReason union member (still a valid type; never emitted post-removal) — left to avoid cross-file type churn'
  - 'Cerebras/Groq token-budget DAILY_LIMITS + circuit-breaker state are Phase-34 deferred-provider scaffolding (live data structures), NOT the deleted env keys — left in place per the triage rule'
metrics:
  duration: ~25 min
  tasks: 3
  files_changed: 27
  completed: 2026-06-04
---

# Phase 38 Plan 02: LLM-PURGE — v1/v2/Shim/PipelineAudit/Cerebras-Groq/OpenRouter Dead-Code Deletion Summary

NIM-only v3 pipeline finishing pass: deleted the extractor stub barrel + callLLM shim + v1/v2 Zod schemas + the full pipeline-flip audit chain + the OpenRouter daily-cap dead writers, narrowed shared modules to v3-only, and rewrote every false docstring — `npm run typecheck` (the deletion-correctness gate) and the full `server/` suite (108 files / 1295 tests) both green with zero dangling importers.

## What Was Built

This plan **deletes**; it added no new capabilities. SC38-3 satisfied: no code path imports any deleted surface; rollback is `git revert <Phase 29 + this commit range>`.

### Task 1 — Structural deletions (PURGE-01/02/04) · commit a746a8b

- **PURGE-01:** Deleted `server/lib/llmEventExtractor.ts` (the v3-only re-export barrel). Rewired `llmExtractionPipeline.ts` to import `processEventGroupsV3` + `geocodeEnrichedEventsV3` directly from `./llmEventExtractor.v3.js`, calling them with the v3-native signatures (geocoder takes a flat events array + a `groupsByKey` map and returns `GeocodedEnrichedEventV3[]` — no tagged `{schemaVersion,events}` wrapper).
- **PURGE-02 (Pitfall 1):** Removed the `callLLM` compatibility shim + its `routerCallLLM` import + the stale docstring from `llm-provider.ts`. Preserved `isLLMConfigured()` (still imported by the pipeline + events.ts). Repointed `llmEvalHarness.test.ts`'s "eval NEVER calls the LLM" assertion to `freeClaudeRouter.callLLM` (the resolver's real call path).
- **PURGE-04 (Pitfall 2):** In `llmSchema.ts`, deleted exported `enrichedEventV1`/`enrichedEventV2`/`batchResponseV2` + their `z.infer` types. Kept `enrichedEventV2` as an **un-exported** base const (v3 `.extend()`s it). Collapsed `enrichedEventAny` from a 3-arm `discriminatedUnion` to a single-arm v3 passthrough. Removed the false "v1 retained for D-40 rollback / v2 default LLM_PIPELINE_V2=true" commentary.
- Repointed all extractor test mocks (7 files) from the deleted barrel to `llmEventExtractor.v3.js` with v3-native shapes; rewrote the llm-provider + llmSchema test suites to v3-only.

### Task 2 — pipelineAudit Path-A delete + OpenRouter daily-cap removal (PURGE-05/08) · commit c0e8b2c

- **PURGE-05 (D-03 Path A):** Deleted `server/lib/pipelineAudit.ts` (both `appendPipelineAudit` writer + `listPipelineAudit` reader). Removed the **live** `/llm-status` reader chain in `events.ts` (import + Promise.all destructure entry + `pipelineFlips` common-block field), the `PipelineFlipsBlock` component + render call in `DevApiStatus.tsx`, the `pipelineFlips?` field from both `LLMStatus` interfaces in `useLLMStatusPolling.ts`, the `server/openapi.yaml` schema entry, and the `appendPipelineAudit`/`listPipelineAudit` vi.mock lines across 4 test files. The `events:llm-pipeline-audit` Redis key drains on its 90d TTL.
- **PURGE-08 (D-04 Path A):** Removed `incrOpenRouterDaily`/`getOpenRouterDaily`, the daily-cap gate, the writer call, and the daily-counter snapshot read in `freeClaudeRouter.ts`. Kept OpenRouter as a dormant key-gated cascade provider (client is null without `OPENROUTER_API_KEY`); retained `todayKey` for the cost-shadow roll-up; the headroom snapshot now reports `used:0`. Fixed the `skipOpenRouter` citation drift in ADR-0010 (`622, 929` → `630, 952`). The `llm:tokens:openrouter:YYYY-MM-DD` key drains on its 48h TTL.

### Task 3 — Cerebras/Groq purge + header/comment rewrites (PURGE-03/06/07/09) · commit 5beed44

- **PURGE-06:** Deleted `CEREBRAS_API_KEY` + `GROQ_API_KEY` from `config.ts` (Zod schema + `AppConfig` members + config-object wiring) and from `.env.example`; removed the dead `cerebras`/`groq` mock-config props from 5 route test suites. Re-anchored the `replayQuota.ts` threat comment to `nvidia_nim: 1_000_000`.
- **PURGE-07:** No-op delete — verified zero Cerebras/Groq adapter source files exist and the "adapter source files remain importable" rollback note does not exist in CLAUDE.md.
- **PURGE-03:** Rewrote 4 stale headers (`llmEventExtractor.v3.ts`, `freeClaudeRouter.ts`, `events.ts RecentEnrichedEvent`, `llmExtractionPipeline.ts` ~95min→~13min/Pro-800s).
- **PURGE-09:** Fixed the `onBatchComplete` comment falsely claiming `writePartialCache` still lives in the v3 extractor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.env.example` consistency for deleted env keys**

- **Found during:** Task 3 (PURGE-06)
- **Issue:** `CEREBRAS_API_KEY`/`GROQ_API_KEY` lived in `.env.example`; deleting them from the `parseEnv()` Zod schema without removing the example entries would leave `scripts/check-env-example.ts` reporting them as drift.
- **Fix:** Removed both entries from `.env.example` with a Phase-38 explanatory note; confirmed neither appears in the drift checker's output afterward.
- **Files modified:** `.env.example`
- **Commit:** 5beed44

**2. [Rule 2 - Critical cleanup] Removed dead `cerebras`/`groq` mock-config props from 5 route test suites**

- **Found during:** Task 3 — the test mock-config object literals still carried `cerebras: { apiKey: '' }, groq: { apiKey: '' }` referencing the deleted `AppConfig` members.
- **Fix:** Stripped the two lines from each of events.test.ts, events.prune.test.ts, events.replayQuota.test.ts, events-fallback.test.ts, llm-optional.test.ts.
- **Commit:** 5beed44

### Out-of-scope (deferred, NOT fixed)

- **`npm run check:env` exits 1 (pre-existing).** The drift checker flags 15 client-tier `VITE_*` vars + `LLM_PIPELINE_V2`/`V3` as "EXTRA in .env.example (not in schema)". Confirmed present at the branch base commit `af3bbbe` — unrelated to this plan; the Cerebras/Groq removal kept schema↔.env.example consistent. Logged to `deferred-items.md`.

## Verification

- **PRIMARY GATE — `npm run typecheck`:** PASS (tsc -b clean + type-coverage success) after every structural deletion. Zero dangling importers.
- **Full server suite:** `npx vitest run server/` → 108 files / 1295 tests PASS.
- **UI suite:** `npx vitest run src/components/ui/__tests__/` → 7 files / 55 tests PASS.
- **Lint:** `npm run lint` → 0 errors (21 pre-existing `react-refresh` warnings, unrelated).
- **SC38-3 importer gates (all return 0 live refs):** barrel deleted · callLLM export gone · v1/v2/batchResponseV2 exports gone · pipelineAudit module deleted · no live `pipelineFlips` · no `incrOpenRouterDaily`/`getOpenRouterDaily` · no `env.CEREBRAS`/`env.GROQ` production reader · OpenRouter dormant entry preserved (11 `openrouter` refs in freeClaudeRouter.ts).

## Known Stubs

None. This is a deletion plan; no placeholder/stub code was introduced.

## Self-Check: PASSED
