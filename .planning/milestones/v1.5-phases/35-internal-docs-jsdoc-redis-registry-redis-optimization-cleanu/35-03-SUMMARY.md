---
phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
plan: 03
subsystem: documentation
tags: [simplify, documentation, jsdoc, callers-block]

requires:
  - phase: 35-01
    provides: drift gate + redis-keys.md registry (used by future readers to find the cost-shadow key written from this module)
provides:
  - Top-of-file JSDoc callers block on server/lib/freeClaudeRouter.ts documenting 3 live production callers + Phase 34 cascade shape; existing vendored-from block preserved below
affects:
  - 35-04 (LLM module JSDoc one-liners; freeClaudeRouter exports are surveyed there)

tech-stack:
  added: []
  patterns:
    - "PREPEND-not-REPLACE for historical-waymarker blocks (Claude's Discretion 4)"

key-files:
  modified:
    - server/lib/freeClaudeRouter.ts (top-of-file JSDoc prepend; +23 lines, 0 logic changes)

key-decisions:
  - 'PREPEND new callers block above existing vendored-from block; the vendored-from block is a historical waymarker (pinned upstream SHA + port scope) and must survive.'
  - "Belt-and-suspenders: 3 independent assurances now confirm the module is load-bearing — existing test coverage, existing vendored-from block, NEW callers block. Future readers stop wondering 'is this still used?'"

patterns-established:
  - 'Verified-via-grep doc blocks cite verification date so a future reader knows the staleness window (CLAUDE.md §LLM Event Pipeline already follows this convention).'

requirements-completed:
  - SIMPLIFY-05

duration: ~5 min (inline orchestrator execution)
completed: 2026-05-27
---

# Phase 35 Plan 03: freeClaudeRouter Callers Block Summary

**Resolves SIMPLIFY-05's "is freeClaudeRouter.ts still alive?" ambiguity by documenting the 3 live production callers + Phase 34 cascade shape at the top of the file. Pure JSDoc edit — no production logic changed.**

## Performance

- **Duration:** ~5 min (inline; orchestrator already had full context loaded)
- **Completed:** 2026-05-27T10:52Z
- **Tasks:** 2 of 2 (Task 1 read-only grep verification, Task 2 prepend block + commit)
- **Files modified:** 1 (server/lib/freeClaudeRouter.ts)

## Accomplishments

- **3 live production callers verified by grep + documented at top of file.** Each caller listed with file:line ref and one-line role: `llmEventExtractor.v3.ts:40` (sole runtime extractor), `llmResolver.ts:15` (6-path geocode resolver — callLLM used only in nominatim-verified-2pass reranker), `llm-provider.ts:23` (bridge wrapper / legacy import path).
- **Cascade shape documented inline.** NIM primary (qwen-235b instruct); OpenRouter dormant (`skipOpenRouter: true` at extractor sites per Phase 30.1; verified appears 2× at lines 673 + 996 of `llmEventExtractor.v3.ts`); Cerebras + Groq deferred per Phase 34 close.
- **5 test callers listed for completeness, explicitly flagged as not-production.**
- **Existing vendored-from block (lines 1-16 pre-edit) preserved verbatim below the new callers block** — historical waymarker survives per Claude's Discretion 4.
- **18/18 in `server/__tests__/lib/freeClaudeRouter.test.ts` PASSING** — confirms comment-only edit didn't break parse.

## Task Commits

1. **Task 1: Verify live callers + cascade shape (read-only)** — no commit (read-only)
2. **Task 2: Prepend top-of-file callers block** — `399290d` (docs — SIMPLIFY-05, D-15, D-16)

## Files Created/Modified

- `server/lib/freeClaudeRouter.ts` — +23 lines (new JSDoc block); 0 logic changes.

## Self-Check: PASSED

- [x] `grep -q "Free Claude Router — multi-provider cascade for LLM-backed" server/lib/freeClaudeRouter.ts` exits 0.
- [x] `grep -q "Vendored from https://github.com/Alishahryar1/free-claude-code" server/lib/freeClaudeRouter.ts` exits 0 (preserved).
- [x] New callers block appears BEFORE vendored-from block in file.
- [x] File contains `llmEventExtractor.v3.ts:40`, `llmResolver.ts:15`, `llm-provider.ts:23`.
- [x] File contains `Phase 34 close`, `qwen-235b instruct`, `skipOpenRouter`.
- [x] `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts` exits 0 (18/18 pass).
- [x] Single atomic commit `399290d` with `docs(35):` + `SIMPLIFY-05` in subject.
