# Plan 27.4 Deferred Items

## From Plan 27.4-07 (agent-af68ec64)

Pre-existing TypeScript errors observed during typecheck that predate this plan's scope:

- `server/lib/llmEventExtractor.v1.ts` — 10 TS18048/TS2345 errors around v1 enrichedEvent shape (lines 146-301). Created by Plan 02 (scaffold of v1 fallback); fixes belong in a follow-up plan.
- `server/routes/events.ts` lines 173, 180 — TS2345 on entity id/timestamp narrowing + TS18048 on `template`. Pre-existing; not touched by this plan.

Rationale for deferral: these errors exist on the plan's base commit (c13f868) and are not introduced by Plan 27.4-07. The plan modified only 4 files under server/lib and server/adapters; none of those files produce typecheck errors.

Verified:
- `git stash` → `npm run typecheck` → 31 errors
- `git stash pop` → `npm run typecheck` → 31 errors (identical count)
