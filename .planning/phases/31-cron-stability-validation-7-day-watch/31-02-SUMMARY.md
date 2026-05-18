---
phase: 31-cron-stability-validation-7-day-watch
plan: 02
status: complete
completed: 2026-05-17
requirements_addressed:
  - LLM-RELI-06
key-files:
  created:
    - scripts/snapshot-cron-watch.ts
    - server/__tests__/scripts/snapshot-cron-watch.test.ts
    - .planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json
  modified:
    - package.json
---

# Plan 31-02 — Snapshot Script + Contract Test + Scaffold + npm Runner

## Objective

Land the canonical daily snapshot script (`scripts/snapshot-cron-watch.ts`),
its contract test pinning the WatchRow / WatchLog schemas + classification
rules, the initial `watch-log.json` scaffold, and the `npm run watch:snapshot`
runner entry. This is the load-bearing observability surface for the 7-day
watch — Plan 03 (D-02 force-trigger validation) and Plan 04 (Day-1..Day-7
daily snapshots) both invoke this script.

## Commits (in landing order on `feature/31-cron-stability-validation`)

| SHA       | Subject                                                             | Files                                                        | Lines |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| `899d836` | `test(31): add failing contract test for snapshot-cron-watch (RED)` | `server/__tests__/scripts/snapshot-cron-watch.test.ts` (NEW) | +198  |
| `07b771d` | `feat(31): add snapshot-cron-watch script (GREEN)`                  | `scripts/snapshot-cron-watch.ts` (NEW)                       | +474  |
| `8138753` | `chore(31): scaffold watch-log.json (D-06 artifact init)`           | `.planning/.../watch-log.json` (NEW)                         | +5    |
| `a12a7f8` | `chore(31): add npm run watch:snapshot runner entry`                | `package.json`                                               | +1    |

**Diff total: +678 insertions across 4 files.** The script grew larger than
the plan's "~250-320 LOC" estimate (474 LOC) because (a) prettier reformatted
the imports onto multiple lines and (b) the markdown-table renderer + GAP
backfill helpers expanded slightly beyond the inline plan body. All
load-bearing behavior matches the plan exactly.

## RED → GREEN Snippet (Wave 0 TDD anchor)

Pre-script (immediately after `899d836` test commit, before `07b771d`):

```
 FAIL  server/__tests__/scripts/snapshot-cron-watch.test.ts [ server/__tests__/scripts/snapshot-cron-watch.test.ts ]
Error: Cannot find module '../../../scripts/snapshot-cron-watch.js' imported from /Users/zackmaz/Desktop/my_world/server/__tests__/scripts/snapshot-cron-watch.test.ts

 Test Files  1 failed (1)
      Tests  no tests
```

Post-script (after `07b771d` lands):

```
 RUN  v4.1.2 /Users/zackmaz/Desktop/my_world

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  296ms
```

(18 tests > the 12-test minimum the plan required because some test cases
were split into separate `it` blocks for clarity — same coverage, finer
grain.)

## `WATCH_DLQ_WHITELIST` Source-of-Truth Confirmation

```ts
// scripts/snapshot-cron-watch.ts L75
export const WATCH_DLQ_WHITELIST = ['v3:timeout_watchdog', 'v3:adaptive-retry-fail'] as const;
```

Canonical strings used (per 31-RESEARCH.md §Vector 3). The CONTEXT.md
illustrative strings `'transient_rate_limit'` / `'watchdog_timeout'` do NOT
appear in the live constant. The forward-compat test asserts every entry
is in the live `DLQEntry.reason` union from `server/lib/llmDLQ.ts:27-37`.

## `npm run watch:snapshot --help` Smoke

```
$ npm run watch:snapshot -- --help

> iran-conflict-monitor@0.0.0 watch:snapshot
> node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/snapshot-cron-watch.ts --help

Usage: npm run watch:snapshot -- [--tick-date=YYYY-MM-DD] [--force] [--notes="..."] [--health-url=...]
Exit codes: 0=PASS, 1=FAIL, 2=GAP, 99=script error.
Env: SNAPSHOT_HEALTH_URL overrides --health-url default of https://otg-iran-monitor.vercel.app/api/health

# exit code: 0
```

## Clean Baseline (after all 4 Plan 02 commits)

| Check                                                                 | Result                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`                                                   | exit 0 (type-coverage 97.44%)                                  |
| `npm run lint`                                                        | exit 0 (0 errors, 23 pre-existing warnings)                    |
| `npm run build`                                                       | exit 0 (vite + tsup both succeeded)                            |
| `npx vitest run` (full suite)                                         | 2158 passed, 19 skipped, 5 todo, 2 files skipped, **0 failed** |
| `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts`   | Plan 01 diff-filter test STILL exits 0 (GREEN preserved)       |
| `npx vitest run server/__tests__/scripts/snapshot-cron-watch.test.ts` | Plan 02 contract test exits 0 (18/18 GREEN)                    |

## PR Status

**PR not yet opened.** Per the user's confirmed scope at session start
("Execute Waves 1+2, then stop"), the orchestrator halts here before the
operator workflow of opening a PR against `main`. The branch
`feature/31-cron-stability-validation` is ready for PR creation when the
operator chooses.

After PR merge + Vercel prod deploy, Plan 03's operator force-trigger
validation can run (see Wave 3 handoff in the orchestrator output).

## Self-Check

- [x] Contract test (`899d836`) lands BEFORE the script implementation
      (`07b771d`) — RED → GREEN TDD discipline preserved.
- [x] All 18 contract tests pass post-implementation (>= 12-test minimum).
- [x] `WATCH_DLQ_WHITELIST` uses canonical strings — not CONTEXT illustratives.
- [x] WatchRow + WatchLog Zod schemas use `.strict()` — schema drift fence.
- [x] `consecutivePassCount` GAP-pauses + FAIL/non-natural breaks per D-04/D-09.
- [x] `watch-log.json` scaffolded with the exact expected shape.
- [x] `npm run watch:snapshot --help` exits 0 and prints usage to stdout.
- [x] Clean baseline: typecheck + lint + build + full vitest all exit 0.
- [x] Plan 01 diff-filter test still GREEN — no cross-plan regression.
- [x] No modifications to STATE.md or ROADMAP.md from this plan — orchestrator
      handles those after the wave/phase completes.

Self-Check: PASSED
