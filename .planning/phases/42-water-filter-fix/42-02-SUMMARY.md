---
phase: 42-water-filter-fix
plan: 02
subsystem: adapters
tags: [overpass, water-facilities, spatial-dedup, name-aware, determinism, vitest, tdd]

# Dependency graph
requires:
  - phase: 42-01-water-filter-diagnosis
    provides: 42-DIAGNOSIS.md (confirm-dedup verdict + real dropped element pair) + RED spatialDedup scaffold (cases a-d + it.todo e)
provides:
  - Exported name-aware + deterministic spatialDedup(facilities) pure function (WATER-FILTER-02)
  - D-14 regression fixture pinning the real Sd Wdy Rbg / Rabigh Dam dropped pair (WATER-FILTER-04)
  - Call-site replacement of the inline 1202-1212 loop in fetchWaterFacilities
affects: [42-03 (snapshot regeneration + cache-key v4 lockstep, runs AFTER this fix)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Pure-function extraction for testability (computeAdmissionDecision precedent, Phase 27.3.1 R-06 D-20): inline dedup loop extracted to exported spatialDedup so it is unit-testable without mocking Overpass (Pitfall 3)'
    - 'Deterministic survivor selection (D-07): sort by notabilityScore desc, tie-break osmId asc before the collapse scan — kills the order-dependent intermittency'
    - 'Name-aware collapse predicate (D-04): same-type + 50m AND (name-match OR one-side-unnamed); 50m window and facilityType equality unchanged (D-05)'

key-files:
  created: []
  modified:
    - server/adapters/overpass-water.ts
    - server/__tests__/adapters/overpass-water.test.ts

key-decisions:
  - 'D-04 name-aware: collapse only on normalized-name match or when either side is unnamed; distinct named facilities of the same type within 50m BOTH admit'
  - 'D-07 deterministic survivor: working set sorted by notabilityScore desc, osmId asc before scan — survivor is order-independent of Overpass return order'
  - 'Pitfall 4: normName reads f.label (always populated by extractLabel), NOT nameLatin (only set when applyRomanizedName fires)'
  - 'D-05: 50m (haversine < 0.05) window and facilityType equality UNCHANGED; D-06 admission gate (computeAdmissionDecision / hasLatinLabel) byte-untouched'
  - 'D-13 Task 3 DEFAULT PATH: no WaterFilterStats schema change — summed rejections.duplicate + the two-run ID-set diff + the regression fixture already satisfy WATER-FILTER-01/04; the 8-bucket shape stays frozen'

patterns-established:
  - 'Name-aware spatial dedup: distinct named facilities never collapse (WATER-FILTER-02)'
  - 'Deterministic dedup output proven against a FIXED in-memory corpus (Pitfall 2), not via live runs'

requirements-completed: [WATER-FILTER-02, WATER-FILTER-04]

# Metrics
duration: ~8min
completed: 2026-06-09
---

# Phase 42 Plan 02: Name-Aware + Deterministic spatialDedup Summary

**Extracted the name-blind, order-dependent inline spatial-dedup loop into an exported pure `spatialDedup(facilities) -> { kept, collapsed }` that never collapses distinct named facilities (D-04) and chooses survivors deterministically by notabilityScore/osmId (D-07), turning the Plan-01 RED scaffold GREEN and pinning the real `Sd Wdy Rbg` / `Rabigh Dam` dropped pair as a regression fixture.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-09
- **Tasks:** 3 (2 auto+tdd + 1 conditional schema lockstep resolved to no-change)
- **Files modified:** 2

## Accomplishments

- **WATER-FILTER-02 fix (Task 1):** Added exported pure `spatialDedup(facilities: WaterFacility[]): { kept; collapsed }` to `server/adapters/overpass-water.ts`. Two defects fixed vs the old loop:
  - **Name-aware collapse (D-04):** two same-`facilityType` facilities within 50m collapse ONLY when their normalized names match OR one side is unnamed. Distinct named facilities within 50m both admit.
  - **Deterministic survivor (D-07):** the working set is sorted by `notabilityScore` descending, tie-broken by `osmId` ascending, before the collapse scan — making the kept set order-independent of Overpass return order (kills the "intermittent" symptom).
- Added private `normName(f)` reading `f.label` (Pitfall 4 — NOT `nameLatin`).
- Replaced the inline 1202-1212 loop in `fetchWaterFacilities` with `const { kept: deduped, collapsed } = spatialDedup(Array.from(unique.values())); stats.rejections.duplicate += collapsed;`.
- **WATER-FILTER-04 pin (Task 2):** Replaced the Plan-01 `it.todo` case (e) with a real `it(...)` using the exact `Sd Wdy Rbg` (`water-897724216`, score 35) / `Rabigh Dam` (`water-156481893`, score 70) pair from 42-DIAGNOSIS.md — 21.1m apart, same `dam` type, distinct names. Asserts `kept.length === 2`, `collapsed === 0`, and the exact survivor IDs. Bucket-delta pin documented: the legacy name-blind predicate yielded `collapsed === 1`; a regression to name-blindness flips the count and fails the test.
- **Task 3 (schema lockstep):** DEFAULT PATH — no `WaterFilterStats` schema change. The summed `rejections.duplicate` + two-run ID-set diff + the regression fixture already satisfy the requirements; the 8-bucket shape stays frozen. `waterFilterStats.test.ts` passes unchanged (10/10).
- 50m window (`haversine < 0.05`) + `facilityType` equality UNCHANGED (D-05); `computeAdmissionDecision` / `hasLatinLabel` byte-untouched (D-06) — confirmed by git diff (only a docstring references `computeAdmissionDecision`).

## Task Commits

1. **Task 1: Extract name-aware + deterministic spatialDedup** — `7129883` (feat)
2. **Task 2: D-14 regression fixture (Sd Wdy Rbg / Rabigh Dam)** — `b8e6553` (test)
3. **Task 3: WaterFilterStats schema lockstep** — no commit (DEFAULT PATH, no schema change; schema test passes unchanged)

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `server/adapters/overpass-water.ts` — added exported `spatialDedup` + private `normName` near `haversine`; replaced inline 1202-1212 loop call site
- `server/__tests__/adapters/overpass-water.test.ts` — filled case (e) `it.todo` with the real diagnosed element regression fixture

## Decisions Made

- **D-04 name-aware:** collapse predicate is `same type AND haversine < 0.05 AND (normName(existing) === normName(f) || either side === '')`. Distinct named pairs both admit.
- **D-07 deterministic survivor:** sort by `(b.notabilityScore ?? 0) - (a.notabilityScore ?? 0) || a.osmId - b.osmId` over a COPY before scanning. Caller's array order not mutated.
- **Pitfall 4:** `normName` reads `f.label` (always populated by `extractLabel`), never `nameLatin`.
- **D-05:** 50m window and `facilityType` equality unchanged; **D-06:** admission gate byte-untouched.
- **D-13 Task 3 default:** no schema change — summed `duplicate` + ID-diff + regression fixture sufficed. The diagnosis pinpointed the dropped element via an instrumented single run, so collapse-pair visibility on the stats shape was not required.

## Deviations from Plan

None — plan executed exactly as written. Task 3 resolved to its documented DEFAULT PATH (no schema change). No auto-fixes required; the RED scaffold flipped GREEN as designed.

## Issues Encountered

None. RED confirmed at start (4 failed: cases a-d `TypeError: spatialDedup is not a function`, 165 passed, 1 todo). After Task 1: 169 passed, 1 todo. After Task 2: 170 passed. Combined with the schema test: 180 passed (2 files).

## Next Phase Readiness

- Plan 03 (snapshot regeneration + `water:facilities:v3` → `v4` cache-key lockstep) is green-lit: the fix is in place, so `npm run refresh:water` will now admit both previously-collapsed dams. Snapshot regen + the 10-surface v4 lockstep (42-PATTERNS.md §"Cache-key bump") were deferred to Plan 03 per D-12 and are unchanged by this plan.
- No blockers.

## Self-Check: PASSED

- FOUND: server/adapters/overpass-water.ts (`export function spatialDedup` count = 1; call site `spatialDedup(Array.from(unique.values()))` present at line 1266)
- FOUND: server/**tests**/adapters/overpass-water.test.ts (case (e) real-element fixture present)
- FOUND commit: 7129883 (Task 1 spatialDedup extraction)
- FOUND commit: b8e6553 (Task 2 D-14 regression fixture)

---

_Phase: 42-water-filter-fix_
_Completed: 2026-06-09_
