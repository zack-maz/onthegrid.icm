---
phase: 29
plan: 03
subsystem: LLM extraction / geocoding resolver
tags: [llm, cascade, simplify-04, d-01, llm-reli-01, refactor]
requires:
  - 'Phase 27.4.3+ freeClaudeRouter.callLLM as the active NIM + OpenRouter cascade entry'
  - 'Plan 29-01 ADR-0010 D-01 selection (NIM + OpenRouter only)'
provides:
  - 'Narrowed `server/adapters/llm-provider.ts` shim (callLLM wrapper + isLLMConfigured(NIM, OR))'
  - 'Resolver reranker repointed to freeClaudeRouter (Pitfall 3 fix prevents silent degradation)'
  - 'Plan 05+06 unblocked to delete v1 + v2 extractor consumers'
affects:
  - 'server/adapters/llm-provider.ts (302 → 50 lines; -252)'
  - 'server/lib/llmResolver.ts (import + call-site signature adaptation)'
  - 'server/__tests__/adapters/llm-provider.test.ts (rewritten for shim contract)'
  - 'server/__tests__/lib/llmResolver.test.ts (mock target + return shape migrated)'
tech-stack:
  added: []
  patterns: ['Compatibility shim wrapper (adapter → router); freeClaudeRouter envelope unwrap']
key-files:
  created: []
  modified:
    - 'server/adapters/llm-provider.ts'
    - 'server/lib/llmResolver.ts'
    - 'server/__tests__/adapters/llm-provider.test.ts'
    - 'server/__tests__/lib/llmResolver.test.ts'
decisions:
  - 'callLLM kept as named export from llm-provider.ts (NOT a bare `export {}` re-export) so the legacy `(messages, jsonSchema, opts) => string | null` contract is preserved for v1+v2+tests until Plan 05/06 deletes those consumers'
  - 'Resolver call site (line 458) was adapted, not left "unchanged" — freeClaudeRouter.callLLM has an incompatible signature (`schemaText: string`, returns `{content, routing, finishReason}`); plan body claimed compat but type system disagreed. Rule 1 fix: pass JSON.stringify(schema) and unwrap `.content`'
  - 'CEREBRAS_API_KEY + GROQ_API_KEY entries in server/config.ts left in place per RESEARCH.md Open Question 4 — defers prune to Phase 30 deploy window'
  - 'llmTokenBudget.ts cerebras/groq accounting untouched per Pitfall 4 — T-29-03-03 documented; Phase 30 owns the parallel removal'
metrics:
  tasks_completed: 6
  files_modified: 4
  lines_removed: 639
  lines_added: 145
  net_loc: -494
  tsc_errors: 0
  server_vitest_files: 94
  server_vitest_tests: 1155
  duration: '~12 min wall-clock'
  completed: 2026-05-10
---

# Phase 29 Plan 03: LLM Provider Chain Narrowing Summary

Narrowed the active LLM cascade to NIM + OpenRouter only and repointed the geocoding resolver's reranker call to `freeClaudeRouter` so the 2-pass Nominatim disambiguation continues to route through the active providers instead of silently degrading.

## What landed

- **`server/adapters/llm-provider.ts` (302 → 50 lines, −252)** — deleted `CEREBRAS_MODEL`, `GROQ_MODEL`, `getCerebrasClient`, `getGroqClient`, `recordSkippedAttempt`, `tryProviderOnce`, `setProviderOrderOverride`, `getProviderOrder`, the entire orchestrator body in `callLLM`, the `isPipelineV2` import (Plan 06 will delete the helper), and the synthetic `skipReason: 'no_client'` callHistory entries. What remains:
  - `callLLM(messages, jsonSchema, opts?) => Promise<string | null>` — thin wrapper that delegates to `freeClaudeRouter.callLLM(messages, '', opts)` and returns `.content`. The `_jsonSchema` arg is ignored (router uses `response_format: json_object`; Zod enforces shape post-parse).
  - `isLLMConfigured(): boolean` — narrowed from `(CEREBRAS || GROQ || NIM || OR)` (Phase 28.2.5 hot-fix) back to `(NIM || OR)` only.

- **`server/lib/llmResolver.ts`** — line 15 import swapped from `'../adapters/llm-provider.js'` to `'./freeClaudeRouter.js'` (Pitfall 3 fix). Without this swap the reranker call would silently route through the adapter's thin shim, indirecting through every consumer; the direct import keeps the call path one hop.

  Line 458 call site was **adapted, not left unchanged** — the plan body claimed compat but `freeClaudeRouter.callLLM` has a different signature than the adapter's prior `callLLM`:
  - 2nd arg is `schemaText: string`, not a `Record<string, unknown>` schema object — resolver now passes `JSON.stringify(RERANKER_JSON_SCHEMA)`.
  - Return type is `Promise<{content, routing, finishReason?}>`, not `Promise<string | null>` — resolver now unwraps `.content` into the existing `raw` variable so all downstream `JSON.parse(raw)` and Zod logic is byte-identical.

- **`server/__tests__/adapters/llm-provider.test.ts` (rewritten, 397 → 100 lines)** — the prior tests exercised the deleted cascade (cerebras/groq, breaker gates, budget gates, retry/backoff, skip-entry telemetry). New tests mock `freeClaudeRouter.callLLM` and assert the shim's adapter contract: forwards messages + opts, passes an empty schemaText, unwraps `.content`, returns null when router returns null. 4 tests pass.

- **`server/__tests__/lib/llmResolver.test.ts` (migrated)** — the `vi.mock` target swapped from `'../../adapters/llm-provider.js'` to `'../../lib/freeClaudeRouter.js'`. Every `mockResolvedValue(stringValue)` / `mockResolvedValueOnce(stringValue)` site was wrapped in the router envelope `{ content: stringValue, routing: [] }`. The schema-shape assertion (`expect(jsonSchema).toMatchObject(...)`) now parses the stringified `call[1]` first, then matches the inner object. 37 tests pass.

## Verification

| Check | Result |
| --- | --- |
| `grep -cP 'cerebras\|groq\|Cerebras\|Groq' server/adapters/llm-provider.ts` | **0** (target 0) |
| `grep -c "isLLMConfigured" server/adapters/llm-provider.ts` | **2** (target ≥1) |
| `grep -c "NVIDIA_NIM_API_KEY" server/adapters/llm-provider.ts` | **1** (target ≥1) |
| `grep -c "from '../lib/freeClaudeRouter" server/adapters/llm-provider.ts` | **1** (target ≥1) |
| `wc -l server/adapters/llm-provider.ts` | **50** (target ≤99) |
| `grep -c "from './freeClaudeRouter" server/lib/llmResolver.ts` | **1** (target ≥1) |
| `grep -c "from '../adapters/llm-provider'" server/lib/llmResolver.ts` | **0** (target 0) |
| `grep -c "NVIDIA_NIM_API_KEY" server/__tests__/adapters/llm-provider.test.ts` | **2** (target ≥1) |
| `grep -c "CEREBRAS_API_KEY" server/__tests__/adapters/llm-provider.test.ts` | **0** (target 0) |
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run server/__tests__/adapters/llm-provider.test.ts` | **4/4 pass** |
| `npx vitest run server/__tests__/lib/llmResolver.test.ts` | **37/37 pass** |
| `npx vitest run server/` (full server suite) | **94 files / 1155 tests pass** |

## Deviations from Plan

### Auto-fixed Issues (Rule 1)

**1. [Rule 1 — Bug] Resolver call-site signature mismatch**

- **Found during:** Task 29-03-03 prep (after reading `freeClaudeRouter.callLLM` signature in Task 29-03-01).
- **Issue:** The plan's `<interfaces>` section claimed `freeClaudeRouter.callLLM` is "compatible (verified in Task 29-03-01)" with the resolver's existing call. It is not. The actual signatures differ:
  - **adapter `callLLM`:** `(messages, jsonSchema: Record<string, unknown>, opts?) => Promise<string | null>`
  - **freeClaudeRouter `callLLM`:** `(messages, schemaText: string, opts?) => Promise<{content, routing, finishReason?}>`
  - Plan Task 29-03-03 said "Body of the resolver — including line 458's `callLLM(...)` call — stays unchanged." Leaving the call unchanged after the import swap would have produced a tsc error on the 2nd arg type (object passed where string expected) AND a runtime error on `if (!raw)` / `JSON.parse(raw)` because `raw` would be the envelope object, not a string.
- **Fix:** At resolver line 458, changed the call to `callLLM([...], JSON.stringify(RERANKER_JSON_SCHEMA))` and unwrapped `routerResult.content` into `const raw`. All downstream JSON.parse + Zod logic byte-unchanged. Inline comment added to document the migration so future maintainers don't try to "fix" the JSON.stringify back to a raw schema.
- **Files modified:** `server/lib/llmResolver.ts` (lines 457-475)
- **Commit:** `c716690`

**2. [Rule 1 — Bug] Adapter `callLLM` written as a wrapper, not a bare `export {}` re-export**

- **Found during:** Task 29-03-02 implementation.
- **Issue:** Plan Task 29-03-02 prescribed `export { callLLM } from '../lib/freeClaudeRouter.js'` as the shim. That would break the v1 + v2 extractor consumers (`server/lib/llmEventExtractor.v1.ts:228`, `server/lib/llmEventExtractor.v2.ts:444`) because they pass a `Record<string, unknown>` schema as the 2nd arg and expect a `string | null` return. Plan 05+06 will delete these consumers, but until then they need to keep working — a bare re-export would tsc-fail them immediately on this commit.
- **Fix:** `callLLM` retained as a named export with the legacy signature `(messages, jsonSchema, opts?) => Promise<string | null>` and reimplemented as a 3-line wrapper that delegates to `routerCallLLM(messages, '', opts)` and returns `result.content`. The plan's `must_haves.artifacts[0].provides` already permitted "shim to freeClaudeRouter OR no-op stub per Pitfall 3" — chose the shim option since v1/v2 still exist.
- **Files modified:** `server/adapters/llm-provider.ts`
- **Commit:** `c716690`

**3. [Rule 1 — Bug] Resolver-test mock target + return shape unmigrated**

- **Found during:** Task 29-03-05 (full server vitest run after Tasks 2-4 landed).
- **Issue:** `server/__tests__/lib/llmResolver.test.ts` mocked `'../../adapters/llm-provider.js'` and used `mockResolvedValue(stringValue)` patterns. After the resolver's import swap to `freeClaudeRouter`, the mock target was orphaned (4 tests failed with `expected vi.fn() to be called 1 times, but got 0 times` because the actual call now hits the un-mocked `freeClaudeRouter.callLLM` import). Plan's `<interfaces>` section did not flag this consumer test file — only flagged `server/__tests__/adapters/llm-provider.test.ts`.
- **Fix:** Migrated the mock to `'../../lib/freeClaudeRouter.js'`, wrapped every `mockResolvedValue(...)` / `mockResolvedValueOnce(...)` site in the `{ content, routing: [] }` envelope, and parsed the stringified schema arg in the schema-shape assertion. 37 tests pass.
- **Files modified:** `server/__tests__/lib/llmResolver.test.ts`
- **Commit:** `c716690`

### Auto-fix attempts

3 inline fixes; all unblocked Task 29-03-05's full-suite verification. Limit (3 attempts per task) not reached.

## Documented carry-forward (NOT fixed this plan)

- **T-29-03-03 — soft-cap pause unreachable:** `server/lib/llmTokenBudget.ts:152-160` still references `'cerebras'` / `'groq'` provider names in `getDailyTokens` lookups. Now that those providers never increment, the soft-cap branch is dead code. Per Pitfall 4 the plan explicitly defers this to Phase 30 (SIMPLIFY-01/03). Code untouched here; documented as a known follow-up.
- **T-29-03-04 — stale Vercel env vars:** `CEREBRAS_API_KEY` / `GROQ_API_KEY` remain in `server/config.ts` (and presumably Vercel). Per RESEARCH.md Open Question 4 this is intentional — leaves a clean `git revert` rollback during the deploy window. Phase 30 prunes both env var schemas and Vercel project config.
- **T-29-03-05 — v1/v2 extractor shim users:** `server/lib/llmEventExtractor.v1.ts:228` and `server/lib/llmEventExtractor.v2.ts:444` still call the `callLLM` shim. Plan 05+06 deletes both files entirely. Until then the shim is the load-bearing compatibility surface; removing it now would break the test surface.

## Self-Check: PASSED

**Created files:**
- FOUND: `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-03-SUMMARY.md`

**Modified files:**
- FOUND: `server/adapters/llm-provider.ts` (50 lines, post-narrowing)
- FOUND: `server/lib/llmResolver.ts` (import + line 458 call-site adapted)
- FOUND: `server/__tests__/adapters/llm-provider.test.ts` (rewritten)
- FOUND: `server/__tests__/lib/llmResolver.test.ts` (migrated)

**Commit:**
- FOUND: `c716690 feat(29): narrow LLM cascade to NIM + OpenRouter (SIMPLIFY-04)`
