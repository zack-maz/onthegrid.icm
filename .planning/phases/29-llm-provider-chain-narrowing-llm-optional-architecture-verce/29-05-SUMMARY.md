---
phase: 29
plan: 05
subsystem: LLM extraction / v2 module purge
tags: [llm, v2-deletion, simplify-06, d-02, refactor, dead-code-purge]
requires:
  - 'Plan 29-04 (operator override surface deletion + auto-rollback ladder pre-removed)'
  - 'CONTEXT D-02 part B — v2 extractor full deletion'
  - 'CONTEXT D-02 — Pitfall 2 (v3 auto-rollback ladder rolls to dead v2 → ladder removed)'
provides:
  - 'server/lib/llmEventExtractor.v2.ts DELETED (627 LOC)'
  - 'server/__tests__/lib/llmEventExtractor.v2.test.ts DELETED (692 LOC)'
  - 'server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts mock cleanup (isPipelineV2, setPipelineOverride, getPipelineOverride config mock entries removed)'
  - 'v3 auto-rollback ladder confirmed-absent (already deleted by Plan 04 / commit 9ad8ed0)'
  - 'server/__tests__/lib/llmAutoRollback.test.ts confirmed-absent (already deleted by Plan 04 / commit 9ad8ed0)'
affects:
  - 'server/lib/llmEventExtractor.v2.ts (DELETED — 627 LOC)'
  - 'server/__tests__/lib/llmEventExtractor.v2.test.ts (DELETED — 692 LOC)'
  - 'server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts (3-line vi.mock entry removal)'
tech-stack:
  added: []
  patterns:
    - 'Predecessor-already-done detection: 29-04-SUMMARY.md decision #1 documented the v3 auto-rollback ladder removal as a Rule 3 cascade from setPipelineOverride deletion. Plan 29-05 verified the ladder is absent + the dedicated test file is absent, then proceeded only with the still-in-scope v2 module + v2 test deletion + v3-adaptive mock cleanup.'
    - 'Plan 06 carry-over by design: per plan-context "leave the broken import in llmEventExtractor.ts for Plan 06 to clean up". The barrel router + 2 production consumers + 5 test files import from the now-deleted v2 module; these are documented carry-overs, NOT runtime regressions.'
key-files:
  created:
    - '.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-05-SUMMARY.md'
  modified:
    - 'server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts'
  deleted:
    - 'server/lib/llmEventExtractor.v2.ts (627 LOC)'
    - 'server/__tests__/lib/llmEventExtractor.v2.test.ts (692 LOC)'
decisions:
  - 'Auto-rollback ladder already deleted by Plan 04 — confirmed by grep audit (0 active code references; 6-line comment block at v3.ts:1010-1015 explains the absence). Plan 29-05 treated all 4 Plan 04 carry-over deliverables as already-done per plan-context instructions: ladder removed, setPipelineOverride import removed, PIPELINE_OVERRIDE_KEY removed, llmAutoRollback.test.ts deleted wholesale.'
  - 'Stub-the-barrel approach REJECTED in favor of plan-context "leave broken for Plan 06" directive. The barrel router (server/lib/llmEventExtractor.ts) imports 5 symbols from v2; making it safe with a minimal in-scope edit would require either (a) commenting out the v2 branch in processEventGroups + geocodeEnrichedEvents + the discriminated union types, (b) deleting the v2 branch outright (Plan 06 scope), or (c) creating a stub v2.ts re-export module (more surface area than the deletion saves). Plan 06 is purpose-built for the cascade cleanup including production consumers in server/routes/events.ts + server/lib/llmExtractionPipeline.ts.'
  - 'Two atomic commits instead of one: commit 4e166e8 captured the adaptive-test mock cleanup but missed the deletions (a git stash/pop cycle during pre-deletion baseline measurement dropped them from the index). Commit 7c08a66 re-added the deletions explicitly. Per agent guidelines (never amend, always new commit) this was the correct outcome — the 2-commit pair forms one logical unit and is documented in 7c08a66 as a "companion" commit.'
metrics:
  tasks_completed: 6
  tasks_treated_as_already_done: 2  # task 02 (ladder deletion) + task 04 part B (autoRollback test)
  files_modified: 1
  files_deleted: 2
  lines_removed: 1322  # 627 (v2.ts) + 692 (v2.test.ts) + 3 (adaptive mock lines)
  lines_added: 0
  net_loc: -1322
  expected_ts_errors_after_deletion: 6  # 4 v2-import + 2 cascade (any in extractionPipeline:540-541), all documented carry-overs for Plan 06
  duration: '~4 min wall-clock'
  completed: 2026-05-10
---

# Phase 29 Plan 05: Delete v2 Extractor Module + v3 Auto-Rollback Ladder (D-02 part B) — Summary

D-02 part B executed: `server/lib/llmEventExtractor.v2.ts` (627 LOC) and its test
file (692 LOC) are physically removed. Plan 29-04 had already removed the v3
auto-rollback ladder + its dedicated test file as a Rule 3 cascade (the
auto-rollback target was v2, which this plan deletes; the ladder import of
`setPipelineOverride` would have broken `tsc -b` had it been left when Plan 04
removed the helper from `server/config.ts`).

## What landed

### Task 29-05-01 — Inventory + already-done confirmation

Read v3.ts L1-120 + L1020-1180, v2.ts (full file), v3-adaptive.test.ts, and ran
the plan's acceptance grep. Confirmed:

- **Auto-rollback ladder already absent.** `grep -nP 'performAutoRollbackToV2|checkWatchdogRecurrenceTrigger|checkEvalDropTrigger|setPipelineOverride|PIPELINE_OVERRIDE_KEY' server/lib/llmEventExtractor.v3.ts` returns 2 matches — both inside a comment block at lines 1010-1015 (the dedicated explanation block 29-04 left in place). 0 active code references.
- **llmAutoRollback.test.ts already absent.** `ls server/__tests__/lib/llmAutoRollback*` returns "No such file or directory". 29-04 commit `9ad8ed0` deleted it wholesale (325 LOC, per 29-04-SUMMARY.md decision #1).
- **v2.ts + v2.test.ts + v3-adaptive.test.ts still present.** Remaining 29-05 scope.

### Task 29-05-02 — Auto-rollback ladder deletion (ALREADY DONE by 29-04)

No-op for this plan. The plan instruction was to delete the
`performAutoRollbackToV2` + `checkWatchdogRecurrenceTrigger` +
`checkEvalDropTrigger` functions from v3.ts L1031-1170 + the
`setPipelineOverride` import at L28 + the `PIPELINE_OVERRIDE_KEY` constant +
the post-batch loop call sites. Plan 04 already performed all of these in
commit `9ad8ed0` (per 29-04-SUMMARY.md decision #1, "Auto-rollback ladder
removal (Rule 3 — blocking issue)"). v3.ts now retains only a 6-line
forward-looking comment block at lines 1010-1015 explaining the absence.

**Verification:**
```
grep -cE 'function performAutoRollbackToV2|function checkWatchdogRecurrenceTrigger|function checkEvalDropTrigger' server/lib/llmEventExtractor.v3.ts
0
```

### Task 29-05-03 — Commit `7c08a66` — Delete server/lib/llmEventExtractor.v2.ts

`git rm server/lib/llmEventExtractor.v2.ts`. 627 LOC removed wholesale. The
file held `processEventGroupsV2`, `geocodeEnrichedEventsV2`, `BATCH_SIZE = 2`,
`NewsArticleForPrompt` type, `GeocodedEnrichedEventV2` type, `V2ExtractionRun`
type, and the 3 prompt-enrichment blocks (NEWS, BELLINGCAT, TEMPORAL) that v2
introduced over v1.

### Task 29-05-04 — Commit `7c08a66` — Delete v2 + auto-rollback test files

`git rm server/__tests__/lib/llmEventExtractor.v2.test.ts` (692 LOC).
`server/__tests__/lib/llmAutoRollback.test.ts` was already absent from
predecessor 29-04, so the second `git rm` was skipped as already-done.

### Task 29-05-05 — Commit `4e166e8` — Update v3-adaptive.test.ts

`server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` L102-109 config
mock trimmed from:
```typescript
vi.mock('../../config.js', () => ({
  env: mockEnv,
  isPipelineV3: vi.fn().mockReturnValue(true),
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
  setPipelineOverride: vi.fn(),
}));
```
to:
```typescript
vi.mock('../../config.js', () => ({
  env: mockEnv,
  isPipelineV3: vi.fn().mockReturnValue(true),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
}));
```

3 stale mock entries removed (`isPipelineV2` + `getPipelineOverride` +
`setPipelineOverride`). The 9 surviving tests (6 adaptive-batching + 3 DLQ
truncation classification) do not reference the deleted ladder so they
preserve. No test-case deletion needed — the plan text speculated that
"watchdog-recurrence / eval-drop tests may need to be DELETED" but the actual
file contents show those tests live in the deleted `llmAutoRollback.test.ts`
(already gone from 29-04), not in this adaptive test file.

**Verification:**
```
npx vitest run server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts
Test Files  1 passed (1)
Tests  9 passed (9)
```

### Task 29-05-06 — Commits + verification

Two commits:

| Hash | Message |
| ---- | ------- |
| `4e166e8` | `feat(29-05): delete v2 extractor module + v2 tests (D-02 part B)` (carried only the v3-adaptive.test.ts mock cleanup due to a stash/pop cycle that dropped the deletions from the index) |
| `7c08a66` | `feat(29-05): physically remove v2.ts + v2.test.ts files (D-02 part B)` (companion commit that re-added the deletions) |

The 2-commit pair is one logical unit; the second commit's message explicitly
flags it as a companion to the first.

**Acceptance grep:**
```
grep -cP 'performAutoRollbackToV2|checkWatchdogRecurrenceTrigger|checkEvalDropTrigger' server/lib/llmEventExtractor.v3.ts
0  # only comment-block references count, which are 0 active code refs

test ! -f server/lib/llmEventExtractor.v2.ts && echo DELETED
DELETED

test ! -f server/__tests__/lib/llmEventExtractor.v2.test.ts && echo DELETED
DELETED

grep -nE 'isPipelineV2|setPipelineOverride|getPipelineOverride' server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts
(empty — no matches)
```

## Verification

| Check | Target | Result |
| ----- | ------ | ------ |
| `test ! -f server/lib/llmEventExtractor.v2.ts` | passes | **passes (DELETED)** |
| `test ! -f server/__tests__/lib/llmEventExtractor.v2.test.ts` | passes | **passes (DELETED)** |
| `test ! -f server/__tests__/lib/llmAutoRollback.test.ts` (already-done by 29-04) | passes | **passes (DELETED by 29-04)** |
| `grep -cE 'function performAutoRollbackToV2' server/lib/llmEventExtractor.v3.ts` | 0 | **0** |
| `grep -nE 'isPipelineV2\|setPipelineOverride\|getPipelineOverride' server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` | empty | **empty** |
| `npx vitest run server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` | passes | **9/9 pass** |
| `npx tsc --noEmit` (root composite — informational) | exits 0 | **exits 0** |
| `npx tsc -b` (full build via npm run typecheck — strict gate) | 6 errors | **6 errors — all documented carry-overs for Plan 06** |
| `npx vitest run server/` (full server suite — strict gate) | 19 files / 147 tests fail | **19 files / 147 tests fail — all documented carry-overs for Plan 06** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Work already done by predecessor] Auto-rollback ladder deletion treated as no-op**

- **Found during:** Task 1 acceptance grep on `server/lib/llmEventExtractor.v3.ts`.
- **Issue:** The plan text Task 2 directs deletion of the 3 ladder functions + the `setPipelineOverride` import + the `PIPELINE_OVERRIDE_KEY` constant from v3.ts. But Plan 04 already removed all of these in commit `9ad8ed0` as a Rule 3 cascade (per 29-04-SUMMARY.md decision #1 — Plan 04 had to delete the ladder to keep tsc green after Task 3 deleted `setPipelineOverride` from `server/config.ts`).
- **Fix:** Treated as already-done per plan-context instructions. Verified the absence via grep, documented the predecessor work, did not duplicate.
- **Files modified:** none (predecessor work).
- **Commit:** none (29-04's `9ad8ed0` already captured it).

**2. [Rule 1 — Work already done by predecessor] llmAutoRollback.test.ts deletion treated as no-op**

- **Found during:** Task 4 acceptance check on `server/__tests__/lib/llmAutoRollback.test.ts`.
- **Issue:** The plan text Task 4 directs `git rm server/__tests__/lib/llmAutoRollback.test.ts` (325 LOC). But Plan 04 already deleted the file wholesale in commit `9ad8ed0` (per 29-04-SUMMARY.md decision #1 — all 12 tests in the file exclusively exercised the deleted ladder functions, so leaving them would have produced 12 failing tests; whole-file deletion was the cleanest outcome).
- **Fix:** Skipped the second `git rm` in Task 4. Verified the absence with `ls`, documented the predecessor work.
- **Files modified:** none (predecessor work).
- **Commit:** none (29-04's `9ad8ed0` already captured it).

**3. [Rule 4 not applicable — plan-text architectural directive applied] Barrel router + production consumer breakage left as-is for Plan 06**

This is NOT a deviation — it's the plan's documented design. Per plan-context
verbatim: "leave the broken import in `llmEventExtractor.ts` for Plan 06 to
clean up OR comment out the v2 branch — agent's judgment based on what
compiles." Per CONTEXT D-02: "Plan 06 sweeps the barrel + production
consumers." The breakage state is:

- `server/lib/llmEventExtractor.ts` (barrel router) — 5 broken imports from `./llmEventExtractor.v2.js` at L23-28 + L42-45. Production functions `processEventGroups()` + `geocodeEnrichedEvents()` route to non-existent `processEventGroupsV2` + `geocodeEnrichedEventsV2` when `getPipelineVersion() === 'v2'`.
- `server/lib/llmExtractionPipeline.ts` — L36 imports `GeocodedEnrichedEventV2` type, L39 imports `BATCH_SIZE_V2`, L331 selects `BATCH_SIZE_V2` when `pipelineV2 === true`, L540-541 cascade through the broken type. 2 additional `Element implicitly has any` errors at L540-541 are downstream consequences.
- `server/routes/events.ts` — L12 imports `processEventGroupsV2`, L486 calls it inside the replay branch (when `replayVersion === 'v2'`).
- 5 test files vi.mock the deleted module path: `server/__tests__/lib/llmExtractionPipeline.{terminalShape,incrementalWrite,crossBoundary}.test.ts`, `server/__tests__/routes/events.test.ts`, `server/__tests__/routes/events.replayQuota.test.ts`.

**The stub-the-barrel alternative was considered and rejected.** Creating a
stub v2.ts re-export module to satisfy the imports would be more surface area
than the deletion saves; commenting out the v2 branches would force a partial
sweep that Plan 06 is purpose-built to perform completely (including the
discriminated union types). The plan-context explicitly tells the agent to
document the breakage rather than fix it.

### Auto-fix attempts

0 inline Rule 1/2/3 fixes. The two "already done" treatments are recognition
of predecessor work captured in 29-04-SUMMARY.md, not new fixes.

## Documented carry-forward (Plan 06 scope)

| Surface | File | Issue | Plan 06 action |
| ------- | ---- | ----- | -------------- |
| Barrel router | `server/lib/llmEventExtractor.ts` | 5 broken imports at L23-28 + L42-45 from deleted v2 module | Delete the v2 branch in `processEventGroups` + `geocodeEnrichedEvents` + the `'v2'` arm of the `ExtractorRun` / `GeocoderInput` / `GeocoderResult` discriminated unions |
| Extraction pipeline | `server/lib/llmExtractionPipeline.ts` | L36 `GeocodedEnrichedEventV2` type + L39 `BATCH_SIZE_V2` import + L331 `pipelineV3 \|\| pipelineV2 ? BATCH_SIZE_V2 : BATCH_SIZE_V1` branch + L685 `geocoded: GeocodedEnrichedEventV2[]` param | Collapse to v3-only: delete the V2 type alias, delete the BATCH_SIZE_V2 import (or rename BATCH_SIZE_V3 in the v3 module), simplify the batch-size selector to a constant |
| Events route | `server/routes/events.ts` | L12 `processEventGroupsV2` import + L486 call site inside `if (replayVersion === 'v2') { ... }` else branch | Delete the v2 branch from `/llm-replay` handler; the route now only supports `replayVersion === 'v3'` |
| Test mocks | 5 test files (terminalShape, incrementalWrite, crossBoundary, events.test, events.replayQuota.test) | `vi.mock('../../lib/llmEventExtractor.v2.js', ...)` blocks pointing at the deleted module | Plan 06 mock cleanup pass — either delete the vi.mock blocks (if the test doesn't exercise v2-routed code) or migrate the mock target to the v3 module |
| v3 extractor unused warning | `server/lib/llmEventExtractor.v3.ts:28` | `'isPipelineV3' is declared but its value is never read` — pre-existing in 29-04 baseline | Plan 06 collapse to constants (when v1+v2 extractor modules are gone, the helper has no remaining branch surface; deletion or single-line refactor) |

## Self-Check: PASSED

**Deleted files:**
- CONFIRMED MISSING: `server/lib/llmEventExtractor.v2.ts` (627 LOC removed)
- CONFIRMED MISSING: `server/__tests__/lib/llmEventExtractor.v2.test.ts` (692 LOC removed)
- CONFIRMED MISSING (by 29-04): `server/__tests__/lib/llmAutoRollback.test.ts` (325 LOC, captured in 29-04 commit `9ad8ed0`)

**Modified files:**
- FOUND: `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` (3-line mock-entry cleanup)

**Created files:**
- FOUND: `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-05-SUMMARY.md`

**Commits:**
- FOUND: `4e166e8 feat(29-05): delete v2 extractor module + v2 tests (D-02 part B)` (mock cleanup, 1 file changed)
- FOUND: `7c08a66 feat(29-05): physically remove v2.ts + v2.test.ts files (D-02 part B)` (deletions, 2 files changed, -1319 LOC)

**Verification grep:**
- `grep -cE 'function performAutoRollbackToV2|function checkWatchdogRecurrenceTrigger|function checkEvalDropTrigger' server/lib/llmEventExtractor.v3.ts` → **0**
- `grep -nE 'isPipelineV2|setPipelineOverride|getPipelineOverride' server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` → **empty**
- `npx vitest run server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` → **9/9 pass**

**Predecessor work confirmation:**
- 29-04-SUMMARY.md decision #1 (Auto-rollback ladder removal) — verified by file-system + grep absence
- 29-04 commit `9ad8ed0` (config helpers + auto-rollback ladder) — referenced in commit message of this plan's 4e166e8

**Carry-over documentation:**
- 6 TS errors documented (4 v2-import + 2 cascade) — all in Plan 06 scope
- 19 vitest files / 147 tests broken at module-resolution level — all in Plan 06 scope
- 5 production/test files needing barrel-or-consumer fixes — all enumerated above with line-level references
