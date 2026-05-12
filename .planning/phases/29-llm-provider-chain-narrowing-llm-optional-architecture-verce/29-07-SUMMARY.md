---
phase: 29
plan: 07
subsystem: LLM extraction / Pitfall 1 cache bridge
tags: [llm, pitfall-1, simplify-06, d-02, refactor, redis-bridge]
requires:
  - 'Plan 29-04 (operator pin-pipeline surface + pipeline-override TTL probe deleted)'
  - 'Plan 29-05 (v2 extractor + v2 test file deleted; codebase left intentionally broken for 29-06 to fix)'
  - 'Plan 29-06 (v1 extractor deleted + barrel collapse + bridge tightened to `data && stale && !degraded` — forward-compatible carry-over to this plan)'
provides:
  - 'server/routes/events.ts: Pitfall 1 cache bridge collapsed from 3-tier (v3→v2→v1) to single-tier (v3 → raw GDELT terminal fallback)'
  - '~30 LOC removed (22 insertions, 52 deletions; final file: 680 LOC)'
  - 'Stale narrative comments updated: toEntityArray jsdoc + /llm-replay handler jsdoc no longer reference the deleted events:llm:v2 key'
affects:
  - 'server/routes/events.ts (-30 net LOC; v2 + v1 cacheGetSafe probes deleted; bridge guard removed alongside the legs it gated)'
tech-stack:
  added: []
  patterns:
    - 'Cache-bridge retirement contract: when a multi-tier fallback chain has been TTL-expired and the dead legs are observably dead (no writers exist anywhere in the codebase), delete the read legs in the same commit that proves no consumer breakage via the chaos test + redis-death test budget. The legs were already gated under `data && stale && !degraded` from 29-06, so removing them is byte-equivalent to leaving the gate `false`-locked permanently — except the cacheGetSafe latency budget is recovered.'
    - 'docs/degradation.md contract verification: the "map never goes blank" guarantee is framed at the cache-layer and upstream-data-source layer, NOT at the LLM-version-bridge layer. Re-reading the doc end-to-end confirmed zero references to the v1/v2 fallback legs — they were always an implementation detail beneath the documented contract. Bridge simplification therefore does not modify the documented contract; the doc stays accurate without edit.'
    - 'Plan-text task no-op detection: Tasks 03 + 04 of the plan text expected `pipelineVersion` branching in the replay route and a `if (pipelineV3 || pipelineV2) { saveDevLLMCacheV2(merged); }` conditional in events.ts. Both were already collapsed by Plan 29-06 (per its SUMMARY: replay route v3-only, `mergeAndPersistLlmEntities` unconditionally calls saveDevLLMCacheV2). The grep-based acceptance criteria still pass cleanly — the cleanup landed earlier than the plan text anticipated. Documented here so a reader of this plan understands why the diff is single-purpose (bridge deletion only).'
key-files:
  created:
    - '.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-07-SUMMARY.md'
  modified:
    - 'server/routes/events.ts'
  deleted: []
decisions:
  - 'Comment-cleanup folded into the single bridge-simplification commit: the toEntityArray jsdoc header AND the /llm-replay handler jsdoc both contained narrative text saying things like "events:llm:v2 is owned by..." and "the handler MUST NOT write back to events:llm:v2". Plan acceptance criterion is `grep -c "events:llm:v2" server/routes/events.ts | grep -q "^0$"` — leaving the stale comments would fail the gate. Cleanup is in-scope because the comments describe a key that no longer exists in the runtime; updating them to reference LLM_EVENTS_KEY_ACTIVE (the v3 alias) is byte-equivalent semantically and gate-clean.'
  - 'No edit to docs/degradation.md: Task 5 of the plan was "Verify degradation contract still holds" with the acceptance "Reviewer confirms docs/degradation.md does not reference deleted v1/v2 fallback legs." Verification PASS — doc framed at cache-layer + upstream-source-layer; LLM bridge specifics never appeared. Zero doc edit needed.'
  - 'Tasks 03 + 04 collapse to no-op observations rather than blank edits: the plan text was written before 29-06 landed (29-06 already collapsed pipelineVersion branching + dev file cache conditional). Filed as a deviation observation in this SUMMARY rather than splitting into separate empty commits — keeps history clean.'
metrics:
  tasks_completed: 6
  files_modified: 1
  files_deleted: 0
  lines_removed: 52
  lines_added: 22
  net_loc: -30
  tsc_errors_before: 0
  tsc_errors_after: 0
  vitest_routes_dir: '17 files / 157 tests pass'
  vitest_events_fallback: '5/5 pass'
  vitest_events_main: '36/36 pass'
  vitest_redis_death_full: '10/10 pass (re-run after one transient flake on /api/weather under contention)'
  vitest_redis_death_events_isolated: '/api/events returns under 9s (well within 10s default budget)'
  rule_1_fixes: 0
  rule_3_fixes: 1 # in-scope comment cleanup needed to pass acceptance grep — see decisions
  duration: '~15 min wall-clock'
  completed: 2026-05-10
---

# Phase 29 Plan 07: Simplify Pitfall 1 Cache Bridge — Summary

D-02 part D executed. The Pitfall 1 cache bridge in `server/routes/events.ts`
that previously read `events:llm:v3 → events:llm:v2 → events:llm` (v1
alias) → raw GDELT is collapsed to a single tier: `events:llm:v3 → raw
GDELT (events:gdelt) terminal fallback`.

Post-Plan-29-06 the v1 + v2 extractor modules are gone and no writer
exists for `events:llm:v2` or `events:llm` anywhere in the codebase. The
read legs were already gated under 29-06's `data && stale && !degraded`
guard, so deleting them is byte-equivalent to leaving the gate
`false`-locked permanently — except the cacheGetSafe latency budget is
recovered for chaos-mode Redis-death scenarios.

The single commit in this plan (`6878e80`) ships ~30 net LOC of deletion
and preserves the "map never goes blank" contract via the raw GDELT
terminal fallback path at L585+ (unchanged).

## What landed

### Task 29-07-01 — Read Pitfall 1 bridge + replay route + dev-cache surface

Read confirmed:

- **Bridge block** at events.ts L521-552 (pre-edit) — the v3 → v2 → v1
  cacheGetSafe fallback chain under the `data && stale && !degraded` guard
  introduced by 29-06
- **Raw GDELT terminal fallback** at L585+ — unchanged; this is the
  surface that preserves the "map never goes blank" guarantee
- **Replay route at L414** — `pipelineVersion` branching ALREADY GONE
  (collapsed by 29-06 per its SUMMARY Task 6)
- **Dev file cache** at L526-552 — `loadDevLLMCacheV2` call already
  unconditional (no `if (pipelineV3 || pipelineV2)` wrapper); the dev
  file cache write happens via `cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, ...)`
  not via a `saveDevLLMCacheV2()` call inside events.ts

### Task 29-07-02 — Delete v2 + v1 fallback legs in Pitfall 1 bridge

Deleted from events.ts L521-552:

- The `let bridgeV2 = await cacheGetSafe<...>('events:llm:v2', ...)` read
  - early-return + envelope-coerce
- The `let bridgeV1 = await cacheGetSafe<...>('events:llm', ...)` read +
  early-return + envelope-coerce
- The stale-bridge-promotion fallback block (`if (bridgeV2?.data)
llmCached = bridgeV2; else if (bridgeV1?.data) llmCached = bridgeV1;`)
- The 29-06 `data && stale && !degraded` outer guard (now dead code with
  no body to gate)

Replaced the multi-paragraph narrative comment block with a single
"Pitfall 1 bridge simplified Phase 29 D-02 — v3 cache → raw GDELT only."
marker per the plan's acceptance criterion.

Acceptance:

- `grep -c "events:llm:v2" server/routes/events.ts` → **0** ✅
- `grep -c "events:llm:v3" server/routes/events.ts` → **3** (LLM_EVENTS_KEY_ACTIVE
  declaration at L72 + two consumer sites at L444 + L515) ✅
- `grep -cE 'LLM_EVENTS_KEY[^_]' server/routes/events.ts` → **0** (no bare
  `LLM_EVENTS_KEY` v1 alias; only `LLM_EVENTS_KEY_ACTIVE` v3 alias remains) ✅

### Task 29-07-03 — Collapse replay route pipelineVersion branching

**No-op for this plan** — Plan 29-06 already collapsed the replay route
to v3-only. Per 29-06 SUMMARY Task 6: "mockProcessEventGroupsV2 →
mockProcessEventGroupsV3 rename + 2 replay test bodies updated".

Verified post-29-06 state at events.ts L414-487:

- No `pipelineVersion` branching
- `processEventGroupsV3` is the only extractor invoked at L460
- Cache target is `LLM_EVENTS_KEY_ACTIVE` (v3) at L444

Acceptance:

- `grep -cP 'pipelineVersion|getPipelineVersion' server/routes/events.ts` → **0** ✅
- `grep -c "llm-replay" server/routes/events.ts` → **2** (route registration
  - url comment) ✅

### Task 29-07-04 — Collapse dev file cache branching

**No-op for this plan** — Plan 29-06 already collapsed the dev file cache
conditional. Per 29-06 SUMMARY Task 3: "`mergeAndPersistLlmEntities`
signature dropped `pipelineV2 + pipelineV3` params; unconditionally calls
`saveDevLLMCacheV2`."

Verified events.ts: only `loadDevLLMCacheV2` is imported + called
(unconditionally, at L528 post-edit). The `saveDevLLMCacheV2` call lives
in `server/lib/llmExtractionPipeline.ts`, NOT events.ts — events.ts
writes the dev-hydrated data back to Redis via
`cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, devData, ...)` at L531.

Acceptance:

- `grep -cP 'pipelineV2|pipelineV3' server/routes/events.ts` → **0** ✅
- `grep -c "saveDevLLMCacheV2" server/routes/events.ts` → **0** (helper is
  not called from events.ts — the related plan-text criterion was a
  cross-file mis-reference; the relevant call site is in
  llmExtractionPipeline.ts which 29-06 already cleaned)
- `grep -c "loadDevLLMCacheV2" server/routes/events.ts` → **2** (import +
  call site, unconditional) ✅

### Task 29-07-05 — Verify degradation contract still holds

Re-read `docs/degradation.md` end-to-end. The documented contract:

- **Cache Layer (Upstash Redis):** unreachable → in-memory fallback +
  withTimeout 2000ms cap. Proven by `redis-death.test.ts`.
- **Data Source Layer (8 upstream APIs):** upstream down → serve stale
  cache + `stale: true` envelope. Proven by per-route stale-serve paths.
- **Response Layer (Zod validation):** schema drift → dev throw / prod
  warn. Proven by `validateResponse.test.ts`.
- **Frontend / Rate Limit / `/health` Endpoint** — no LLM-version-bridge
  mention.

Zero references to `events:llm:v2`, `events:llm`, or the v1/v2 fallback
legs anywhere in the doc. The bridge was always an implementation detail
beneath the cache-layer and data-source-layer contracts — bridge
simplification does not modify the documented contract. **No doc edit
needed.** (Plan 10 of the phase still owns the formal runbook entry per
plan text.)

### Task 29-07-06 — Run tsc + events-fallback test + commit

| Check                                                                             | Target                | Result                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                                | 0 errors              | **0 errors**                                                                                                                                                                                                                 |
| `npx vitest run server/__tests__/routes/events-fallback.test.ts`                  | 5/5 pass              | **5/5 pass** (971ms)                                                                                                                                                                                                         |
| `npx vitest run server/__tests__/routes/events.test.ts`                           | 36/36 pass            | **36/36 pass** (855ms)                                                                                                                                                                                                       |
| `npx vitest run server/__tests__/routes/`                                         | passes                | **17 files / 157 tests pass** (10.30s)                                                                                                                                                                                       |
| `npx vitest run server/__tests__/resilience/redis-death.test.ts` (full)           | 10/10 pass            | **10/10 pass** (50.75s on rerun; one transient flake on /api/weather under contention on the first attempt — confirmed environmental by isolated rerun + isolated rerun on the pre-edit baseline; not caused by this commit) |
| `npx vitest run server/__tests__/resilience/redis-death.test.ts -t "/api/events"` | /api/events under 10s | **8.76s** (well within budget — the bridge-simplification recovered ~4s of cacheGetSafe latency budget vs Plan-29-06 baseline)                                                                                               |

Single atomic commit landed as **`6878e80`**:

```
feat(29-07): simplify Pitfall 1 cache bridge to v3 → raw GDELT only
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — In-scope comment cleanup] Stale narrative comments referencing deleted events:llm:v2**

- **Found during:** Task 02 acceptance run of `grep -c "events:llm:v2" server/routes/events.ts` — initial post-edit count was **3**, not **0**: the bridge block deletion landed clean but two stale narrative-history JSDoc comments still referenced the deleted key.
- **Issue:** The plan acceptance criterion is `grep -c "events:llm:v2" server/routes/events.ts | grep -q '^0$'` — requires byte-zero occurrences of the dead string. Stale comments would fail the gate even though they were observably comments (not runtime code).
- **Fix:** Updated two JSDoc blocks (the `toEntityArray` defense-in-depth header at L278-295 and the `/llm-replay` handler header at L389-404) to reference the active terminal cache key generically ("the active LLM cache key", "the terminal LLM cache key", "`cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, ...)`") instead of the deleted `events:llm:v2` string literal.
- **Files modified:** `server/routes/events.ts`
- **Why in scope:** the comments described a runtime key that no longer exists. Per Rule 3 (auto-fix blocking issues), the acceptance grep would have failed and the plan would have been blocked. Updating the comment text to reference the surviving key is a semantically-equivalent renaming that doesn't alter the contract being described (defense-in-depth at the read site; cache-read-only at the replay route).
- **Verified:** `grep -c "events:llm:v2" server/routes/events.ts` → **0** after fix.

### Auto-fix attempts

1 inline fix (Rule 3 — stale comment cleanup). Limit (3 attempts per task) not approached; single iteration landed correctly.

## Documented carry-forward (Plan 08+ scope)

- **`enrichedToEntities` deprecated alias.** Still present at events.ts:255 (`export const enrichedToEntities = enrichedV3ToEntities`). No active callers per Plan 29-06 SUMMARY. Phase 30 or later can delete.
- **`saveDevLLMCacheV2` / `loadDevLLMCacheV2` misleading names.** Per CONTEXT D-02 / RESEARCH.md A7 the v2-suffixed devFileCache helpers are now used by the v3 pipeline. Rename deferred to Phase 34 (touches dev-fixture file format on disk).
- **`docs/degradation.md` LLM-bridge section.** None exists today and the bridge simplification confirms the doc's framing remains correct (cache + upstream layers, not LLM-version-bridge layer). If a future operator adds an LLM-degradation subsection, it should describe the v3-only-bridge → raw-GDELT terminal fallback shape, NOT the pre-Phase-29 multi-tier chain.

## Verification

| Check                                                                                                               | Target                     | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `grep -c "events:llm:v2" server/routes/events.ts`                                                                   | 0                          | **0** ✅                                                                   |
| `grep -c "events:llm:v3" server/routes/events.ts`                                                                   | ≥1                         | **3** ✅                                                                   |
| `grep -cE 'LLM_EVENTS_KEY[^_]' server/routes/events.ts`                                                             | 0                          | **0** ✅                                                                   |
| `grep -cP 'pipelineVersion\|getPipelineVersion' server/routes/events.ts`                                            | 0                          | **0** ✅                                                                   |
| `grep -cP 'pipelineV2\|pipelineV3' server/routes/events.ts`                                                         | 0                          | **0** ✅                                                                   |
| `grep -c "llm-replay" server/routes/events.ts`                                                                      | ≥1                         | **2** ✅                                                                   |
| `grep -rnP 'events:llm:v2\|LLM_EVENTS_KEY[^_]\|pipelineV2\|pipelineV3\|getPipelineVersion' server/routes/events.ts` | 0 lines                    | **0** ✅                                                                   |
| `wc -l server/routes/events.ts`                                                                                     | -30 net                    | **680** (was 710; -30 ✓)                                                   |
| `npx tsc --noEmit`                                                                                                  | 0 errors                   | **0 errors** ✅                                                            |
| `git log -1 --format='%s'`                                                                                          | starts with `feat(29-07):` | **feat(29-07): simplify Pitfall 1 cache bridge to v3 → raw GDELT only** ✅ |

## Self-Check: PASSED

**Created files:**

- FOUND: `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-07-SUMMARY.md` (this file, after Write)

**Modified files (in commit `6878e80`):**

- FOUND: `server/routes/events.ts` (-52 +22 = -30 net LOC)

**Commits:**

- FOUND: `6878e80 feat(29-07): simplify Pitfall 1 cache bridge to v3 → raw GDELT only` — 1 file changed, 22 insertions(+), 52 deletions(-)

**Predecessor work confirmation:**

- 29-04 commit on the phase branch (pipeline-override TTL probe + pin surface deleted) — preserved
- 29-05 commit on the phase branch (v2 extractor deleted) — preserved
- 29-06 commit `56a411b` (v1 extractor deleted + barrel collapse + Pitfall 1 bridge tightened) — preserved; this plan builds on its tightened guard by deleting the legs the guard gated

**Plan-text task no-op accounting:**

- Tasks 03 + 04 of the plan text are no-ops in events.ts post-29-06 — documented in the Tasks section above with the specific 29-06 SUMMARY citations
- Net plan delivery is single-commit bridge-deletion + comment cleanup; no behavior gap from the plan-text intent
