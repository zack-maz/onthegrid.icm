---
phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
plan: 02
subsystem: redis-cache
tags: [simplify, partial-key, retirement, redis, cleanup, tombstone]

requires:
  - phase: 35-01
    provides: drift gate (still passes after the deletion — proves CLAUDE.md ↔ redis-keys.md ↔ code parity is maintained)
provides:
  - 'events:llm:v3:partial production code path retired entirely (const + writer + LLMCachePayload interface + 2 orphan imports + 5 JSDoc/comment refs)'
  - 'Three scripts handled per Pitfall 1: peek-v3-partial.ts deleted (100% dead); snapshot-v3-redis.ts + clear-llm-cache-dev.ts scope-edited'
  - 'Four test files: terminalShape (renamed describe block, deleted partial-key it block), incrementalWrite/crossBoundary (partial-key cacheSetSpy mocks dropped), redis-prefix (3-key fixture → 2-key)'
  - 'CLAUDE.md §Serverless Cache no longer lists partial-key'
  - 'SIMPLIFY-02 tombstones at each retirement site cite Phase 35 / D-12 / ADR-0010'
affects:
  - 35-04 (LLM module JSDoc; one-key discipline now canonical)
  - 35-06 (phase close; ADR-0010 sub-block gets the partial-key retirement narrative)

tech-stack:
  added: []
  patterns:
    - 'Retirement-by-deletion with cited tombstone (vs env-gating dead-code-on-a-switch per CONTEXT D-12)'
    - 'Natural TTL expiry for production cleanup (no migration script per D-13)'

key-files:
  modified:
    - server/lib/llmEventExtractor.v3.ts (5 retirement sites + 2 orphan-cleanup edits)
    - server/lib/llmExtractionPipeline.ts (2 comment / JSDoc edits)
    - server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts (3 edits: describe rename, mock simplification, it block delete)
    - server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts (1 edit: mock simplification)
    - server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts (1 edit: mock simplification)
    - server/__tests__/cache/redis-prefix.test.ts (1 edit: 3-key → 2-key fixture)
    - scripts/snapshot-v3-redis.ts (4 edits: header comment, schema, parallel fetch, payload)
    - scripts/clear-llm-cache-dev.ts (1 edit: KEYS array)
    - CLAUDE.md (1 edit: §Serverless Cache bullet removal)
  deleted:
    - scripts/peek-v3-partial.ts (100% dead after writer retirement)

key-decisions:
  - 'LLMCachePayload interface retired alongside writer. Pre-flight grep confirmed only refs were writer + tests + JSDoc comments + 1 dead-reference-in-comment in events.ts:311. Carrying the interface forward would leave dead code.'
  - "snapshot-v3-redis.ts kept (scope-edit only) because package.json line 28 declares it as the 'snapshot:v3' npm script — operator-facing tooling, must survive. peek-v3-partial.ts deleted (not wrapped in package.json or .github/, dev-pass scratch helper per 35-RESEARCH.md Pitfall 1)."
  - 'events:llm:v2:partial left in scripts/clear-llm-cache-dev.ts KEYS array as Phase 29 dead-key surveillance. Targeting an already-dead key on dev cache clear is harmless and provides operator visibility if it ever resurfaces.'

patterns-established:
  - "Drift gate as load-bearing safety net — the gate caught no issues this plan because CLAUDE.md and code were edited in lockstep, validating that plan 35-01's mechanism works end-to-end."
  - 'Retirement tombstones with phase/decision/ADR refs at each deletion site (mirrors SIMPLIFY-01 tombstone style at llmExtractionPipeline.ts:93-97 verbatim — same pattern, new SIMPLIFY-02 decision).'

requirements-completed:
  - SIMPLIFY-02

duration: ~15 min (inline orchestrator execution after context loaded)
completed: 2026-05-27
---

# Phase 35 Plan 02: events:llm:v3:partial Retirement Summary

**Retires the partial-key observability envelope entirely — Hobby-era 300s-budget mitigation that Pro 800s makes obsolete. Single atomic commit removes 358 lines across 10 files; drift gate (plan 35-01) confirms registry parity holds end-to-end. Production cleanup proceeds via natural TTL expiry within LLM_REDIS_TTL_SEC (~2.5h) of deploy.**

## Performance

- **Duration:** ~15 min (inline; orchestrator had context already loaded — vs 35-01's ~3h with full file-read overhead)
- **Completed:** 2026-05-27T10:59Z
- **Tasks:** 2 of 2 (Task 1 pre-flight grep + LLMCachePayload disposition, Task 2 the deletion + tombstones + tests + scripts + CLAUDE.md)
- **Files modified:** 10 (9 modified + 1 deleted)
- **Net delta:** -294 lines (358 deletions, 64 insertions — tombstones + 2 retirement comments)

## Accomplishments

- **Partial-key code path retired across all 10 surfaces in a single atomic commit (`a504ebd`).** Every production reference, every test assertion, every script consumer, and the CLAUDE.md bullet all gone in one logically-coherent commit per D-26.
- **LLMCachePayload interface retired alongside writer.** Pre-flight grep confirmed the interface had no production non-writer consumer (only writer + tests + JSDoc comments + 1 dead-reference-in-comment in `events.ts:311`). Retaining it would be dead-code-on-an-import.
- **Pitfall 1 script disposition decisions validated by pre-flight grep:**
  - `peek-v3-partial.ts` DELETED (not wrapped in `package.json` or `.github/`; pure dev-pass scratch helper)
  - `snapshot-v3-redis.ts` SCOPE-EDITED (wrapped in `package.json:28` as `"snapshot:v3"` npm script — operator-facing, must survive; partial-key removed from header comment + schema + parallel fetch + output payload)
  - `clear-llm-cache-dev.ts` SCOPE-EDITED (one string removed from KEYS array; `events:llm:v2:partial` left as Phase 29 dead-key surveillance)
- **Orphan import + orphan const caught by ESLint during commit.** First commit attempt failed lint with 2 unused-vars errors (`cacheSetSafe` import and `LLM_REDIS_TTL_SEC` const). Both became orphans after writer deletion. Cleaned up in same commit (no separate fixup needed) and re-committed.
- **Drift gate (plan 35-01) still PASSES at 40/40 assertions** after the deletion. This validates the gate's mechanism: it correctly tracks that BOTH surfaces lost the partial-key reference AND code lost its writer, so parity is preserved. The gate would have failed if CLAUDE.md still listed partial-key (it doesn't) or if any production code still referenced it (none does).
- **5 targeted test files all green: 55/55 assertions PASS** after rewrites.

## Task Commits

1. **Task 1: Pre-flight grep + LLMCachePayload disposition** — read-only (no commit). Outputs: snapshot-v3-redis.ts is wrapped → scope-edit; LLMCachePayload only writer+test refs → retire-alongside-writer; 31 partial-key refs across 9 files → within expected 15-20 range (slightly elevated, OK).
2. **Task 2: Delete partial-key code path + scripts + CLAUDE.md** — `a504ebd` (chore — SIMPLIFY-02, D-12, D-13). Single atomic commit covering all 10 files.

## Files Created/Modified/Deleted

- `server/lib/llmEventExtractor.v3.ts` — 5 retirement sites (top JSDoc, const+export, line ~260 interface, lines 446-480 writer body, line 619 finishBatch callsite, line 868 final writePartialCache call) + 2 orphan-cleanup edits (cacheSetSafe import, LLM_REDIS_TTL_SEC const). Tombstones at each site cite Phase 35 / D-12 / ADR-0010.
- `server/lib/llmExtractionPipeline.ts` — 2 edits: line 95 comment past-tensed; line 134 JSDoc rewritten from two-key to one-key discipline.
- `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` — describe block renamed (`D-04/D-11 two-key` → `Phase 35 D-12 one-key`); top-of-file JSDoc updated; partial-key cacheSetSpy mock calls removed from processEventGroupsMock; partial-key it() block deleted entirely.
- `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` — partial-key cacheSetSpy mock calls simplified to tombstone comment.
- `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts` — same pattern.
- `server/__tests__/cache/redis-prefix.test.ts` — 3-key variadic-del fixture trimmed to 2-key (still exercises CACHE_KEY_PREFIX with ≥2 args).
- `scripts/snapshot-v3-redis.ts` — 4 partial-key entries removed (header comment, schema, parallel fetch, payload). Tombstone in header explains the removal.
- `scripts/clear-llm-cache-dev.ts` — 1 string removed from KEYS array.
- `CLAUDE.md` — partial-key bullet removed from §Serverless Cache (completes D-23 / Pitfall-3-4 refinement work started in plan 35-01 task 2).
- `scripts/peek-v3-partial.ts` — DELETED entirely (`git rm`).

## Deviations from Plan

- **None of substance.** Two minor execution-detail deviations:
  1. The plan called for a SIMPLIFY-02 tombstone block matching 35-PATTERNS.md lines 199-204 verbatim. The first version referenced `EVENTS_LLM_V3_PARTIAL_KEY` by literal name; the post-grep verification required 0 matches of that symbol, so the tombstone was rewritten to "the prior partial-key const" instead. Same intent, different exact wording.
  2. ESLint caught 2 unused-vars errors on the first commit attempt (`cacheSetSafe` import + `LLM_REDIS_TTL_SEC` const became orphans after writer deletion). Cleaned up in the same logical commit before re-committing — net result is the single atomic commit the plan specified.

## What This Enables

- **Plan 35-04** can survey the LLM modules with a known one-key discipline (no two-key indirection to document; partial-key entirely gone).
- **Plan 35-06** has the SIMPLIFY-02 deletion completed for its ADR-0010 Phase 35 sub-block narrative.
- **Plan 35-06 close measurements** will likely show a small bundle-size reduction from the 358-line deletion. Will diff against 1,779,504-byte baseline from 35-01.

## Self-Check: PASSED

- [x] `npx tsc --noEmit` exits 0.
- [x] `npx vitest run server/__tests__/lib/llmExtractionPipeline.{terminalShape,incrementalWrite,crossBoundary}.test.ts server/__tests__/cache/redis-prefix.test.ts src/__tests__/lib/redis-registry.test.ts` exits 0 (5 files, 55 assertions).
- [x] `grep -rn "EVENTS_LLM_V3_PARTIAL_KEY" server/ src/ scripts/ --include='*.ts'` returns 0 matches.
- [x] `grep -rn "writePartialCache" server/ src/ scripts/ --include='*.ts'` returns only tombstone / comment refs (no live writer or callsite).
- [x] `grep -rn "events:llm:v3:partial" server/ src/ scripts/ --include='*.ts'` returns only tombstone / comment refs (no executable code references).
- [x] `test ! -f scripts/peek-v3-partial.ts` — file deleted.
- [x] `grep -q "Phase 35 D-12 (SIMPLIFY-02)" server/lib/llmEventExtractor.v3.ts` exits 0 (tombstone present).
- [x] `grep -q "events:llm:v3:partial" CLAUDE.md` exits 1 (bullet removed).
- [x] Drift gate green (40/40); registry parity preserved by CLAUDE.md+code lockstep edit.
- [x] Single atomic commit `a504ebd` with `chore(35):` + `SIMPLIFY-02` + `D-12` in subject.
- [x] Production cleanup via natural TTL expiry (no migration script per D-13).
