---
phase: 42-water-filter-fix
plan: 01
subsystem: testing
tags: [overpass, water-facilities, spatial-dedup, telemetry, vitest, diagnosis]

# Dependency graph
requires:
  - phase: 27.3.1-water-facility-retry-and-cleanup
    provides: diagnosis-format precedent (27.3.1-DIAGNOSIS.md) + G1 "Dam near X" admission regression history
provides:
  - Telemetry-first written diagnosis (42-DIAGNOSIS.md) confirming the prime-suspect name-blind O(n²) spatial-dedup loop (WATER-FILTER-01)
  - RED spatialDedup behavior test scaffold (cases a-d + it.todo case e) pinning the not-yet-built spatialDedup contract
  - D-03 confirm-or-pivot decision record (confirm-dedup) steering Plan 02
affects: [42-02 (name-aware + deterministic spatialDedup fix), 42-03 (snapshot regeneration)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Telemetry-first diagnosis (D-01): written diagnosis citing the concrete rejection bucket precedes any fix code'
    - 'RED-before-fix scaffold (Nyquist): spatialDedup tests exist and fail before spatialDedup is built'
    - 'Determinism proven against a FIXED in-memory corpus (Pitfall 2), not via two live Overpass runs'

key-files:
  created:
    - .planning/phases/42-water-filter-fix/42-DIAGNOSIS.md
  modified:
    - server/__tests__/adapters/overpass-water.test.ts

key-decisions:
  - 'D-03 confirm-dedup: telemetry confirms the prime-suspect name-blind, order-dependent O(n²) spatial-dedup loop (overpass-water.ts:1202-1212) as the cause; NO pivot required'
  - 'Diagnosis cites the SUMMED rejections.duplicate bucket, NOT byTypeRejections.*.duplicate (structurally always 0 post-merge per Pitfall 1)'
  - 'Latin-label admission gate NOT implicated; D-06 (forbidding gate loosening) NOT triggered'
  - 'RED scaffold proves determinism against a FIXED in-memory corpus per Pitfall 2 (case d), not via live-run comparison'

patterns-established:
  - 'Telemetry-first diagnosis gate (D-01): fix code is forbidden until the written diagnosis names the bucket and concrete dropped elements'
  - 'Confirm-or-pivot checkpoint (D-03): a blocking decision gate locks the fix target before code lands'

requirements-completed: [WATER-FILTER-01]

# Metrics
duration: ~10min (continuation closeout)
completed: 2026-06-09
---

# Phase 42 Plan 01: Water Filter Diagnosis + RED spatialDedup Scaffold Summary

**Telemetry-first diagnosis (42-DIAGNOSIS.md) confirms the name-blind, order-dependent O(n²) spatial-dedup loop as the cause of missing water facilities, plus a RED spatialDedup test scaffold (cases a-d + it.todo e) that pins the fix contract before Plan 02 builds it.**

## Performance

- **Duration:** ~10 min (continuation closeout; Tasks 1-2 executed by prior agent)
- **Completed:** 2026-06-09
- **Tasks:** 3 (2 auto + 1 checkpoint:decision resolved)
- **Files modified:** 2

## Accomplishments

- Telemetry-first written diagnosis (WATER-FILTER-01) committed BEFORE any fix code (D-01), citing the SUMMED `rejections.duplicate` bucket and naming concrete dropped OSM elements from a two-run admitted-ID-set diff
- Diagnosis verdict: `confirmed_prime_suspect_dedup` — the name-blind, order-dependent O(n²) spatial-dedup loop at `server/adapters/overpass-water.ts:1202-1212` collapses distinct named facilities of the same `facilityType` within 50m
- RED spatialDedup behavior scaffold added to `overpass-water.test.ts`: cases (a) both-named-admit, (b) same-name collapse, (c) unnamed-side collapse, (d) deterministic kept-set+order over shuffled corpus, plus `it.todo` case (e) for the D-14 real-element regression pin (filled in Plan 02)
- D-03 confirm-or-pivot checkpoint resolved by operator: **confirm-dedup** — proceed to the pre-registered name-aware + deterministic spatialDedup fix in Plan 02; no replanning

## Task Commits

Each task was committed atomically:

1. **Task 1: Telemetry-first water-filter diagnosis (WATER-FILTER-01)** - `c98c3c7` (docs)
2. **Task 2: RED spatialDedup behavior scaffold (WATER-FILTER-02)** - `e197dc0` (test)
3. **Task 3: checkpoint:decision (D-03 pivot gate)** - resolved by operator (confirm-dedup), no commit

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `.planning/phases/42-water-filter-fix/42-DIAGNOSIS.md` - Telemetry-first written diagnosis; frontmatter `verdict: confirmed_prime_suspect_dedup`, `suspect_bucket: rejections.duplicate (SUMMED)`, `d03_decision: confirm-dedup`
- `server/__tests__/adapters/overpass-water.test.ts` - Added `describe('spatialDedup', ...)` RED block (cases a-d + it.todo e) referencing the not-yet-exported `spatialDedup`

## Decisions Made

- **D-03 checkpoint resolution (operator selected confirm-dedup):** "Prime-suspect confirmed — proceed to name-aware + deterministic spatialDedup fix (Plan 02)." The diagnosis frontmatter `verdict: confirmed_prime_suspect_dedup` matches the selection. No pivot.
- **Latin-label gate NOT implicated:** The diagnosis points squarely at `rejections.duplicate`, not `no_resolved_name` / `no_city` / Overpass mirror flakiness. D-06 (forbidding loosening the `hasLatinLabel` admission gate without operator surfacing) is therefore NOT triggered — no operator surfacing required on that axis.
- **SUMMED bucket citation (Pitfall 1):** The diagnosis cites the SUMMED `rejections.duplicate`, never a per-type `byTypeRejections.*.duplicate` (which is structurally always 0 after the merge).
- **Determinism via fixed corpus (Pitfall 2):** Case (d) proves deterministic kept-set + order against a FIXED in-memory shuffled corpus, not via two live Overpass runs (corpus drift would be a false determinism signal).

## Deviations from Plan

None - plan executed exactly as written. Tasks 1-2 produced the committed diagnosis + RED scaffold; the checkpoint:decision gate resolved to the pre-registered confirm-dedup path with no pivot and no auto-fixes required.

## Issues Encountered

None. The RED spatialDedup scaffold fails by design: `npx vitest run server/__tests__/adapters/overpass-water.test.ts` reports **4 failed (cases a-d, `TypeError: spatialDedup is not a function`) | 165 passed | 1 todo (170 total)**. This is the correct RED state — the 4 dedup cases are RED because `spatialDedup` is not yet exported (built in Plan 02), case (e) is the `it.todo` stub, and all 165 existing G1 admission tests remain GREEN (D-15 honored). A failing RED test is the success condition for this Wave-0 scaffold, not a blocker.

## Next Phase Readiness

- Plan 02 is green-lit on the pre-registered D-04..D-08 fix path: extract the dedup loop into a name-aware, deterministic `spatialDedup(corpus) -> { kept, collapsed }` and export it; cases (a)-(d) flip GREEN, and case (e) `it.todo` is filled with the real previously-dropped OSM element pair named in 42-DIAGNOSIS.md.
- No snapshot was regenerated/committed in this plan (snapshot regen is deferred to Plan 03 / D-12, AFTER the fix).
- No blockers.

## Self-Check: PASSED

- FOUND: .planning/phases/42-water-filter-fix/42-DIAGNOSIS.md
- FOUND: server/**tests**/adapters/overpass-water.test.ts (spatialDedup block present)
- FOUND commit: c98c3c7 (Task 1 diagnosis)
- FOUND commit: e197dc0 (Task 2 RED scaffold)

---

_Phase: 42-water-filter-fix_
_Completed: 2026-06-09_
