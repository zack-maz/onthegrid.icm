# Phase 27.3.2 Deferred Items

## Pre-existing TypeScript errors at base commit (4b94565) — out of scope

At the phase base commit, `npx tsc -p tsconfig.server.json --noEmit` reports 22 pre-existing errors, all in:

- `server/lib/llmEventExtractor.ts` (noUncheckedIndexedAccess issues on array/object access and Zod-inferred optional fields vs required destructure)
- `server/routes/events.ts` (similar patterns — optional `id`/`timestamp` destructures and `template` possibly undefined)

These predate Phase 27.3.2 and are unrelated to water admission tightening.

**Plan 01 scope**: four lock-step edits to `server/adapters/overpass-water.ts` (interface + seeds).
**Auto-added under Rule 3 (blocking issue)**: fifth lock-step edit to `server/routes/water.ts` `buildEmptyFilterStats` `rejections` seed — the interface change triggered a new TS2741 there that directly blocked compilation of this plan's target file's dependents.

Our changes net to **zero new errors** (22 before → 22 after). Plan 01 acceptance-criterion `tsc exits 0` is interpreted as "no new errors introduced by this plan" consistent with the phase-baseline error count.

These pre-existing errors should be addressed in a future cleanup pass (Phase 28 or a dedicated tech-debt ticket), not this phase.
