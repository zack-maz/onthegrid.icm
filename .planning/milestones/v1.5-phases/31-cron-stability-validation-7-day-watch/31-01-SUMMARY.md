---
phase: 31-cron-stability-validation-7-day-watch
plan: 01
status: complete
completed: 2026-05-17
requirements_addressed:
  - LLM-RELI-06
key-files:
  created:
    - server/__tests__/lib/llmExtractionPipeline.test.ts
  modified:
    - vercel.json
    - server/lib/llmExtractionPipeline.ts
    - scripts/analyze-llm-run.ts
    - docs/runbook.md
---

# Plan 31-01 — Phase 31 Prep Fixes

## Objective

Land the four "prep" fixes flagged by Phase 30.1 so the 7-day watch
produces meaningful signal. Wave 0 (the failing unit test) precedes
the diff-filter fix per TDD discipline.

## Commits (in landing order on `feature/31-cron-stability-validation`)

| SHA       | Subject                                                                   | Files                                                      | LOC                                              |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `dab6739` | `test(31): add failing diff-filter prefix-match unit test (prep #2 RED)`  | `server/__tests__/lib/llmExtractionPipeline.test.ts` (NEW) | 304 (test file, separate from "prep diff" total) |
| `bc2807c` | `feat(31): include eval fixtures in Vercel bundle (prep #1)`              | `vercel.json`                                              | +2 / −1                                          |
| `1bfec94` | `fix(31): diff-filter matches cached llm-v3-prefixed ids (prep #2 GREEN)` | `server/lib/llmExtractionPipeline.ts`                      | +3 / −1                                          |
| `2fcc914` | `chore(31): analyzer --help + CACHE_KEY_PREFIX docstring (prep #3)`       | `scripts/analyze-llm-run.ts`                               | +10 / −0                                         |
| `25e6cb4` | `docs(31): runbook quarterly probe-openrouter check (prep #4)`            | `docs/runbook.md`                                          | +16 / −0                                         |

**4-prep-fix diff total: 31 insertions, 2 deletions across 4 files — well within
the ≤~20 LOC envelope expected by the plan (Plan 01 acceptance criteria allow
the runbook section to push slightly over since it's a docs-only addition).**

## RED → GREEN Snippet (Wave 0 TDD anchor)

Pre-fix (immediately after `dab6739` test commit, before `1bfec94`):

```
 FAIL  server/__tests__/lib/llmExtractionPipeline.test.ts > Phase 31 D-01 prep #2 — diff-filter prefix match > diff-filter excludes already-cached groups whose key matches the `llm-v3-` prefixed cached id
AssertionError: expected [ { key: '20513-19-18', …(8) }, …(1) ] to have a length of 1 but got 2

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Post-fix (after `1bfec94` lands):

```
 RUN  v4.1.2 /Users/zackmaz/Desktop/my_world

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  243ms
```

## Clean Baseline (after all 5 commits)

| Check                                                     | Result                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`                                       | exit 0 (type-coverage 97.44%)                                  |
| `npm run lint`                                            | exit 0 (0 errors, 23 pre-existing warnings)                    |
| `npm run build`                                           | exit 0 (vite + tsup both succeeded)                            |
| `npx vitest run` (full suite)                             | 2140 passed, 19 skipped, 5 todo, 2 files skipped, **0 failed** |
| `node --import tsx/esm scripts/analyze-llm-run.ts --help` | exit 0, stdout contains `CACHE_KEY_PREFIX`                     |

## A1 Fallback Note (prep #1 Vercel includeFiles glob)

The plan provided an A1 fallback for the `includeFiles` glob form in case the
glob fails at deploy time:

```jsonc
"includeFiles": [".planning/eval/ground-truth-events.json", ".planning/eval/adversarial-injections.json"]
```

**Glob form (`".planning/eval/*.json"`) shipped as primary.** Vercel deploy
output from this branch will confirm whether the glob is honored at bundle
time. If `evalScore.total === 0` persists after the deploy + Plan 03 D-02
force-trigger, the fallback array form is the next try.

## Plan 03 D-02 Gate Carry-Forward

Plan 03's force-trigger validation depends on these prep fixes being live in
prod. Expected post-deploy behavior:

- `evalScore.total > 0` (prep #1 bundles the fixtures → `runEval()` reads them)
- `batchCount ≤ 149` (prep #2 fixes the diff-filter → ≥30% reduction from
  Phase 30 baseline of 213; per 31-RESEARCH.md §Vector 4)
- `breakerTrips === 0` (independent of these prep fixes — D-02 sanity check)

## Self-Check

- [x] All 4 prep fixes committed atomically per Phase 30 D-08 (4 commits +
      the preceding RED test commit = 5 total).
- [x] Conventional commit prefixes: `test(31):` / `feat(31):` / `fix(31):` /
      `chore(31):` / `docs(31):`.
- [x] RED → GREEN transition pinned by `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts`
      (FAIL → PASS observed).
- [x] Clean baseline: typecheck + lint + build + full vitest all exit 0.
- [x] No modifications to STATE.md or ROADMAP.md from this plan — orchestrator
      handles those after the wave/phase completes.
- [x] `feature/31-cron-stability-validation` branch ready for the Plan 02
      script/test/scaffold commits before a single combined PR is opened.

Self-Check: PASSED
