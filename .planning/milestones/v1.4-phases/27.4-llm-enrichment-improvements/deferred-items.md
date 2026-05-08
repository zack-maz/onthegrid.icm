# Plan 27.4 Deferred Items

## From Plan 27.4-07 (agent-af68ec64)

Pre-existing TypeScript errors observed during typecheck that predate this plan's scope:

- `server/lib/llmEventExtractor.v1.ts` — 10 TS18048/TS2345 errors around v1 enrichedEvent shape (lines 146-301). Created by Plan 02 (scaffold of v1 fallback); fixes belong in a follow-up plan.
- `server/routes/events.ts` lines 173, 180 — TS2345 on entity id/timestamp narrowing + TS18048 on `template`. Pre-existing; not touched by this plan.

Rationale for deferral: these errors exist on the plan's base commit (c13f868) and are not introduced by Plan 27.4-07. The plan modified only 4 files under server/lib and server/adapters; none of those files produce typecheck errors.

Verified:

- `git stash` → `npm run typecheck` → 31 errors
- `git stash pop` → `npm run typecheck` → 31 errors (identical count)

## From Plan 27.4-09 (agent-a6e1ed19)

Pre-existing test failure in `src/__tests__/filters.test.ts` (32 test cases) that predates this plan's scope:

- `TypeError: Cannot read properties of undefined (reading 'length')` at `src/lib/filters.ts:147` — `filters.enabledPrecisions.length < 4` throws because the filters fixture omits the `enabledPrecisions` field. Introduced when the precision-filter branch was added; the fixture in `filters.test.ts` was not updated.
- Last modification of `src/lib/filters.ts`: commit `2c7e6ae feat(27.2-quick): add precision and entity ID search/filter support`.
- Not touched by Plan 09 — our files_modified are strictly `server/routes/events.ts`, `src/hooks/useLLMStatusPolling.ts`, `src/types/ui.ts`, `src/stores/uiStore.ts`, `src/components/ui/DevApiStatus.tsx`, `src/__tests__/devApiStatusEventsSection.test.tsx` (plus `src/types/llm.ts` new type mirror + `src/__tests__/uiStore.test.ts` + `server/__tests__/routes/events.test.ts` extensions + this deferred-items.md).

Fix belongs in a follow-up plan that owns `src/lib/filters.ts` (e.g., a targeted "filter fixture regression" patch). Scope boundary respected per executor rules.

## From orchestrator final test gate (phase 27.4 close-out)

Pre-existing client failure in `src/__tests__/entityLayers.test.ts:59` that predates this phase:

- `expect(ENTITY_COLORS.other).toEqual([190, 170, 168])` — test expects gray-with-red-tint, code returns `[220, 100, 90]` (red). Last modification of the color constant was commit `709fa15 feat(27): close UAT gaps — distinct event colors, precision rings, fire-and-forget LLM, dev API status` — a Phase 27 commit, not 27.4.
- Verified pre-existing by running `src/__tests__/entityLayers.test.ts` against both phase-base (6c9e1a4 and earlier) and phase-tip (b7e03de): identical 1/84 failure both sides.

Fix belongs in a follow-up that owns `src/lib/eventColors.ts` / `src/components/map/constants.ts` — the test fixture and the live color constant have diverged.

## Final phase 27.4 test-gate summary

- **Server:** 11695/11695 pass across 833 files (clean)
- **Client (main tree, excluding worktree copies):** 823/856 pass — 33 failures all pre-existing (32 filters.test.ts + 1 entityLayers.test.ts; both documented above)
- **Client (with worktree copies):** 10531/10960 — the extra failures are stale test copies inside `.claude/worktrees/agent-*/` directories left over from per-plan parallel executors. These are not present in the phase's merged working tree and will be cleaned up by the Claude Code harness at session end.

Phase 27.4 introduced ZERO new test regressions. All new tests (llmSchema, llmResolver, llmEventExtractor.v2, llmCircuitBreaker, llmDLQ, llmTokenBudget, llmEvalHarness, nominatim-forward, devApiStatusEventsSection) pass.
