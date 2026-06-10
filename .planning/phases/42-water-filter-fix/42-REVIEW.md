---
phase: 42-water-filter-fix
reviewed: 2026-06-10T01:56:49Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - docs/architecture/redis-keys.md
  - scripts/audit-water-names.ts
  - server/__tests__/adapters/overpass-water.test.ts
  - server/__tests__/lib/healthSources.test.ts
  - server/__tests__/routes/water.test.ts
  - server/adapters/overpass-water.ts
  - server/lib/healthSources.ts
  - server/openapi.yaml
  - server/routes/cron-health.ts
  - server/routes/cron-warm.ts
  - server/routes/water.ts
  - src/__tests__/lib/redis-registry.test.ts
  - src/data/water-facilities.json
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-06-10T01:56:49Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the Phase 42 water-filter fix: the new exported `spatialDedup()` pure function in `server/adapters/overpass-water.ts`, the `water:facilities:v3 → v4` Redis key bump across route/cron/health/docs/test surfaces, and the regenerated `src/data/water-facilities.json` snapshot.

**Core fix verified sound.** `spatialDedup()` is correct against its D-04/D-05/D-07 contract: copy-before-sort (no caller mutation), stable deterministic comparator (score desc, osmId asc tiebreak — total order given unique osmIds), 50m window and same-type predicate unchanged, name-aware collapse, `collapsed` count correctly fed into `stats.rejections.duplicate`. The Rabigh regression pin (case e) uses real OSM IDs and would fail on a name-blindness regression. Typecheck passes (`tsc -b` exit 0), all 253 tests in the four touched suites pass, and the regenerated snapshot is sane: 460 facilities (390 dam / 55 reservoir / 15 desal), zero bad coordinates, zero empty labels, zero duplicate IDs, both Rabigh-pair elements present, all rejection buckets (including `no_resolved_name`) present in `stats` so the `.strict()` Zod parse will pass.

**The v4 key bump is consistent across all 10 in-repo source surfaces** (water.ts, cron-warm.ts, healthSources.ts, audit script, openapi.yaml, redis-keys.md, CLAUDE.md, and three test files), and the write shape (`{facilities, filterStats}` envelope) matches across route, cron-warm, and snapshot tiers.

Five warnings remain: a broken-at-runtime live-read path in the audit script that this phase re-touched, stale RED-scaffold artifacts in the test file (including a now-unused `@ts-expect-error`), the D-07 survivor-selection rule being entirely unpinned by tests, a defeated drift-gate exemption in the redis-registry test, and the committed `api/vercel-entry.js` bundle still carrying v3 (an 11th lockstep surface, per this repo's own phase-close convention).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Audit script live-read path treats the v4 envelope as a bare array — always degrades to empty corpus

**File:** `scripts/audit-water-names.ts:214-215`
**Issue:** `loadFromRedis()` reads `cacheGetSafe<RawSnapshotEntry[]>('water:facilities:v4', 0)` and calls `(res?.data ?? []).map(...)`. But the value stored under `water:facilities:v4` (by `server/routes/water.ts:309` and `server/routes/cron-warm.ts:57`) is the Plan-11 envelope `{ facilities, filterStats }`, not a bare array — `cacheGetSafe` returns the stored value verbatim in `.data` (`server/cache/redis.ts:166-179`). At runtime `.map` is not a function, the `TypeError` is swallowed by the catch, and the operator sees the misleading "Live Redis unavailable" message with an empty corpus. The shape bug pre-dates Phase 42 (script born in Phase 38, envelope landed in 27.3.1 Plan 11), but this phase edited the exact call line and re-asserted the wrong claim in three updated comments ("the live water:facilities:v4 cache stores NORMALIZED WaterFacility objects" — it stores the envelope). `npm run audit:water` live mode has never worked and still does not.
**Fix:**

```typescript
const res = await cacheGetSafe<{ facilities: RawSnapshotEntry[] }>('water:facilities:v4', 0);
return (res?.data.facilities ?? []).map(toAuditFacility);
```

### WR-02: Stale RED-scaffold `@ts-expect-error` + false "not yet exported" comments left in the test file

**File:** `server/__tests__/adapters/overpass-water.test.ts:22-29` (also 2326-2331)
**Issue:** The import of `spatialDedup` still carries `// @ts-expect-error spatialDedup is not yet exported (Plan 02 builds it — RED scaffold)`. Plan 02 shipped; the export exists, so the directive is now unused. It does not currently break the build only because `tsconfig.server.json` excludes `server/__tests__` — the moment tests are typechecked (vitest `--typecheck`, tsconfig include change, or IDE project config) this becomes a hard TS2578 error. Both comment blocks (lines 22-29 and the section header at 2326-2331) state facts that are now false ("The import resolves to `undefined` until Plan 02 exports it, so every spatialDedup test below is RED"), and the file now has three separate `import` statements from `../../adapters/overpass-water.js`. The GREEN-transition cleanup step of the RED-scaffold convention was skipped.
**Fix:** Delete the `@ts-expect-error` line, merge `spatialDedup` into the main import block at lines 4-20, and rewrite both comment blocks to past tense ("Plan 02 extracted and exported spatialDedup; these tests pin its contract").

### WR-03: D-07 survivor-selection rule (highest score / lowest osmId survives) is entirely unpinned by tests

**File:** `server/__tests__/adapters/overpass-water.test.ts:2373-2414`
**Issue:** No test asserts WHICH facility survives a collapse. Test (b) collapses the Mosul pair (scores 70 vs 40) but only asserts `kept.length === 1` — not that the score-70 element survived. Test (d) asserts shuffle-invariance by comparing `ids(orderA)` to `ids(orderB)`/`ids(orderC)` against each other, never against an expected literal — its own comment promises "deterministic survivor must be the higher-score / lower-osmId one" but nothing checks it. Consequence: reversing the comparator in `spatialDedup` (lowest-score-survives) passes the entire 253-test suite, because a consistently-wrong comparator is still deterministic. The headline D-07 fix of this phase has no regression lock.
**Fix:** In test (b) add `expect(kept[0]?.osmId).toBe(1);` (the score-70 element); in test (d) add `expect(ids(orderA)).toEqual(['water-11', 'water-12', 'water-10']);` to pin both survivor identity and deterministic output order against a literal.

### WR-04: Redis-registry drift gate never gates `water:facilities:v4` — new v3 exemption is redundant and the bare-prefix exemption swallows the canonical key

**File:** `src/__tests__/lib/redis-registry.test.ts:72-81`
**Issue:** `isExempt()` uses `keysEquivalent()` (prefix-match on `:` boundaries, line 145-149). The pre-existing exemption `{ key: 'water:facilities' }` therefore matches `water:facilities:v3` AND `water:facilities:v4` — every key in the family is exempt from both directions of the drift gate. Two consequences: (1) the newly added `water:facilities:v3` exemption entry is unreachable dead weight — it can never be the deciding entry; (2) the canonical v4 key this phase introduced is silently excluded from the documented↔code parity checks, so a future drift on the exact key this phase bumped (e.g. docs say v4, code reverts to v3) would NOT fail the gate. The new entry also violates the file's own D-02 rule ("Each entry MUST cite the surface (file:line)") — it cites nothing, because no `water:facilities:v3` reference remains in scanned non-test code, which is itself the tell that the entry is unnecessary.
**Fix:** Remove the new `water:facilities:v3` entry. Either delete the bare `water:facilities` exemption (no bare-key reference remains in non-test source — verify with grep) or narrow `isExempt` to exact-match for that entry, so `water:facilities:v4` is actually gated.

### WR-05: Committed `api/vercel-entry.js` bundle still serves and writes `water:facilities:v3` — the 11th lockstep surface was missed

**File:** `api/vercel-entry.js:641, 82996, 86045`
**Issue:** The tracked production bundle still contains `water: "water:facilities:v3"` (SOURCE_KEYS), `WATER_KEY = "water:facilities:v3"` (cron-warm), and `FACILITIES_KEY = "water:facilities:v3"` (water route). This repo's own convention rebuilds the bundle at phase close (commit `a48a291` — "chore(41): rebuild api/vercel-entry.js bundle for phase close"); Phase 42 skipped it. Functional exposure is bounded — Vercel's `npm run build` regenerates the bundle at deploy time — but anyone running the committed artifact directly (local prod-mode smoke test, artifact-based rollback, or a deploy flow that skips the build) will read/write the dead v3 key, serving the stale pre-fix facility set and resurrecting the key the v4 bump was designed to orphan. It also breaks the phase's "10 lockstep surfaces" claim and produces contradictory grep results across the repo.
**Fix:** Run `npm run build` and commit the regenerated `api/vercel-entry.js` before phase close (matching the Phase 41 precedent), or gitignore the artifact if it is no longer meant to be tracked.

## Info

### IN-01: `spatialDedup`'s "one side unnamed" collapse branch is unreachable in the production pipeline

**File:** `server/adapters/overpass-water.ts:278-280, 324`
**Issue:** `normName()` reads `f.label`, and `extractLabel()` (line 584-608) never returns an empty string — it always falls back to desal synthesis or `FACILITY_TYPE_LABELS[facilityType]` ("Dam"/"Reservoir"/"Desalination Plant"). So `ename === '' || fname === ''` at line 324 can only fire on hand-built test fixtures with whitespace labels, never on pipeline data. A generic-labeled facility is treated as NAMED "dam" — meaning the documented D-04 "one side is unnamed" semantics never executes in production, and a generic "Dam" sitting 21m from "Rabigh Dam" now admits as distinct (the old loop collapsed it). There is also a latent asymmetry if the branch ever becomes reachable: a higher-scoring unnamed facility would swallow a lower-scoring named one. Low risk today (Plan-10 hasName + hasLatinLabel gates keep bare generics out of non-desal admissions), but the dead branch misrepresents the function's real behavior.
**Fix:** Either have `normName()` map `GENERIC_OSM_NAME_RE`-matching labels to `''` so the unnamed branch reflects reality, or document in the D-04 comment that "unnamed" is only reachable via direct callers, not the pipeline.

### IN-02: Edited `redis-keys.md` row carries stale value-shape and line references

**File:** `docs/architecture/redis-keys.md:55`
**Issue:** The Phase-42-edited `water:facilities:v4` row still declares the value as `WaterFacility[]`, but the stored value has been the `{ facilities, filterStats }` envelope since Phase 27.3.1 Plan 11 (this is exactly the shape mismatch that bit WR-01). The writer/reader line refs are also stale: `server/routes/water.ts:122` (now 127) and `server/lib/healthSources.ts:46` (key is at 47).
**Fix:** Update the Value column to `{facilities: WaterFacility[], filterStats}` and refresh the line numbers while the row is being touched.

### IN-03: `byTypeRejections[*].duplicate` stays 0 while summed `rejections.duplicate` receives `collapsed` — documented lock-step invariant violated

**File:** `server/adapters/overpass-water.ts:1267`
**Issue:** The `WaterFilterStats.byTypeRejections` docstring (line 798) promises "The summed `rejections` field is the sum of these per-type buckets — both stay in lock-step." `stats.rejections.duplicate += collapsed` increments only the summed bucket; per-type `duplicate` is initialized to 0 in `fetchFacilityType` and never written (dedup runs post-merge, after per-type attribution is lost). Pre-existing behavior carried over unchanged, but this phase rewired the only write site and `spatialDedup` now returns the survivors — facility types are available on the collapsed elements, so per-type attribution became feasible. The regenerated snapshot has `duplicate: 0` so DevApiStatus currently shows no visible discrepancy.
**Fix:** Either have `spatialDedup` return collapsed counts keyed by `facilityType` and fan them into `byTypeRejections`, or amend the docstring to carve out `duplicate` from the lock-step claim.

---

_Reviewed: 2026-06-10T01:56:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
