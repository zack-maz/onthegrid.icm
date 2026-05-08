# Phase 27.3.1 Deferred Items

Items discovered during plan execution that are out of scope for their discovering plan.

## From Plan 02 (R-03 admission gate hardening)

### Pre-existing client-side test failures (34 tests across 3 files)

Discovered during the broad `npx vitest run` sweep after Task 2 commit. These
failures exist on the branch BEFORE Plan 02 landed (confirmed by `git stash` +
re-run pattern). None of them touch server/adapters/overpass-water.ts,
src/lib/waterLabel.ts, or any file Plan 02 modifies — they are pre-existing
tech debt from earlier phases on this feature branch and are explicitly out of
Plan 02's scope.

Failing files:

- `src/__tests__/filters.test.ts` — 32/49 failed (entityPassesFilters suite;
  likely related to Plan 05/06 filter refactor earlier in this branch).
- `src/__tests__/entityLayers.test.ts` — 1/84 failed (ENTITY_COLORS "other is
  gray with red tint" assertion — color constant drift).
- `src/__tests__/devApiStatus.test.tsx` — 1/8 failed ("copies valid JSON to
  clipboard on copy diagnostics click" — clipboard mock wiring).

Server and targeted Plan 02 tests all pass:

- `npx vitest run server/` → 680/680 pass.
- `npx vitest run server/__tests__/adapters/overpass-water.test.ts src/lib/__tests__/waterLabel.test.ts` → 109/109 pass.
- `npx tsc --noEmit` → clean.

Suggested follow-up: a dedicated client-side-test-fix quick task before the
phase closes, or roll into Plan 06 cleanup since those tests exercise
entity-layer and filter code also touched by Plan 06 consolidation.
