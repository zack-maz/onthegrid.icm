---
phase: 27-conflict-geolocation-improvement
plan: 03
subsystem: server/events-route
tags: [llm, events, graceful-degradation, caching, integration]
dependency_graph:
  requires: [27-01, 27-02]
  provides: [events-llm-route, dual-cache, graceful-degradation]
  affects: [server/routes/events.ts, server/config.ts]
tech_stack:
  added: []
  patterns: [dual-cache-serving, cooldown-gated-processing, enriched-to-entity-conversion]
key_files:
  created:
    - server/__tests__/routes/events-fallback.test.ts
  modified:
    - server/routes/events.ts
    - server/__tests__/routes/events.test.ts
    - server/config.ts
decisions:
  - Empty enriched array check (length > 0) needed alongside null check -- processEventGroups returns [] when LLM returns parseable-but-invalid JSON
  - Diff-based processing keys on group.key vs cached event.id (future improvement: use groupKey field on cached LLM events for tighter matching)
  - enrichedToEntities uses first entity in group as template, overrides with LLM-extracted fields
metrics:
  duration_seconds: 571
  completed: '2026-04-09T20:04:14Z'
  tasks_completed: 2
  tasks_total: 2
  tests_added: 12
  tests_total: 549
---

# Phase 27 Plan 03: Events Route LLM Integration Summary

LLM processing pipeline wired into events route with lazy on-request processing, 15-minute cooldown, dual-cache serving (events:llm vs events:gdelt), and verified graceful degradation across all failure modes.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Wire LLM processing into events route with cooldown + dual-cache | `94a0cf6` (RED), `ee4d249` (GREEN) | events.ts: LLM cache layer, shouldRunLLM/recordLLMTimestamp helpers, enrichedToEntities converter, diff-based group processing; 7 TDD tests in events.test.ts |
| 2 | Graceful degradation integration test | `c71a73b` | events-fallback.test.ts: 5 integration tests covering all degradation paths; fix enriched.length > 0 check |

## Architecture

The events route now has a three-tier serving strategy:

1. **LLM cache fresh** (events:llm, 15min TTL) -- serve immediately, skip GDELT fetch
2. **LLM configured + cooldown expired** -- fetch raw GDELT, group events, run LLM pipeline, geocode, convert to entities, cache as events:llm, serve enriched
3. **Raw GDELT fallback** -- serve merged GDELT events (default path when LLM unconfigured or fails)

New constants: `LLM_EVENTS_KEY`, `LLM_PROCESS_KEY`, `LLM_COOLDOWN_MS` (900s), `LLM_LOGICAL_TTL_MS`, `LLM_REDIS_TTL_SEC`.

New helpers: `shouldRunLLM()`, `recordLLMTimestamp()`, `enrichedToEntities()`.

New imports: `isLLMConfigured`, `groupGdeltRows`, `processEventGroups`, `geocodeEnrichedEvents`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate CEREBRAS_API_KEY/GROQ_API_KEY in config.ts**
- **Found during:** Task 1
- **Issue:** Plan 02 (wave 1) added duplicate Zod schema entries for CEREBRAS_API_KEY and GROQ_API_KEY alongside the existing entries from Plan 01
- **Fix:** Removed the original duplicate entries, kept the Phase 27-commented ones
- **Files modified:** server/config.ts
- **Commit:** ee4d249

**2. [Rule 3 - Blocking] Installed openai npm package in worktree**
- **Found during:** Task 1 verification
- **Issue:** Plan 02 added openai to package.json but worktree node_modules didn't have it installed
- **Fix:** Ran `npm install` -- package.json already had the dependency from wave 1
- **Files modified:** None (node_modules only, already in package.json)
- **Commit:** N/A (no code change needed)

**3. [Rule 1 - Bug] Fixed empty enriched array treated as success**
- **Found during:** Task 2 (malformed JSON test)
- **Issue:** `processEventGroups` returns `[]` (not `null`) when LLM returns parseable-but-invalid JSON. Empty array is truthy in JS, so the route served `[]` instead of falling through to raw GDELT.
- **Fix:** Changed `if (enriched)` to `if (enriched && enriched.length > 0)`
- **Files modified:** server/routes/events.ts
- **Commit:** c71a73b

## Verification

- `npx vitest run server/` -- 549 tests passing across 52 files
- `npx tsc --noEmit` -- clean, no type errors

## Self-Check: PASSED

- All created/modified files exist on disk
- All 3 commits found in git history (94a0cf6, ee4d249, c71a73b)
- All 8 Task 1 acceptance criteria verified via grep
- All 4 Task 2 acceptance criteria verified (5 tests, correct descriptions)
- 549 server tests passing, 0 type errors
