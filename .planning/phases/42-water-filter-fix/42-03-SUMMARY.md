---
phase: 42-water-filter-fix
plan: 03
subsystem: cache-registry
tags: [water-facilities, cache-key-bump, redis-registry, snapshot, drift-gate, overpass]

# Dependency graph
requires:
  - phase: 42-02-name-aware-spatialDedup
    provides: exported name-aware + deterministic spatialDedup (admitted-set behavior change that mandates the D-09 cache-key bump)
provides:
  - water:facilities:v4 canonical across all 10 lockstep surfaces (WATER-FILTER-03)
  - water:facilities:v3 demoted to dead-surveillance in the redis-registry drift-gate whitelist
  - regenerated src/data/water-facilities.json cold-start snapshot reflecting the post-fix admitted set (304 -> 460)
  - Open Question 2 resolution (data-flows.md NOT gate-covered; deferred to Phase 49)
affects: [49 (prose-doc reconciliation of the stale bare water:facilities ref in data-flows.md)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Atomic cache-key version bump across a mechanically-gated lockstep set (10 surfaces in one phase so redis-registry.test.ts stays green)'
    - 'Snapshot regeneration via npm run refresh:water (atomic tmp+rename, operator-email scrub) as the tier-3 read-floor refresh after a behavior change'
    - 'Behavior-change evidence via admitted-count delta (304 -> 460), not via the structurally-0 rejections.duplicate bucket (Pitfall 1)'

key-files:
  created:
    - .planning/phases/42-water-filter-fix/42-03-SUMMARY.md
  modified:
    - server/routes/water.ts
    - server/routes/cron-warm.ts
    - server/routes/cron-health.ts
    - server/lib/healthSources.ts
    - server/openapi.yaml
    - server/__tests__/routes/water.test.ts
    - server/__tests__/lib/healthSources.test.ts
    - src/__tests__/lib/redis-registry.test.ts
    - docs/architecture/redis-keys.md
    - CLAUDE.md
    - scripts/audit-water-names.ts
    - src/data/water-facilities.json

key-decisions:
  - 'D-09/D-10/D-11 executed: water:facilities:v3 -> v4 across all 10 lockstep surfaces in one phase; v3 added to RETIRED_KEY_WHITELIST as dead-surveillance; canonical-comment string updated to v4'
  - 'Open Question 2 RESOLVED: no content gate covers docs/architecture/data-flows.md (redis-registry.test.ts parses only CLAUDE.md + redis-keys.md; docs:lint markdown-link-check validates only hyperlinks, not inline code-span key content). The stale bare water:facilities ref at data-flows.md:450,467 is DEFERRED to Phase 49 (D-11) — left untouched this phase.'
  - 'D-12 executed: src/data/water-facilities.json regenerated via npm run refresh:water against LIVE Overpass; admitted facilities 304 -> 460 (+156) is the D-09 behavior-change evidence'
  - 'rejections.duplicate is 0 in both before and after snapshots (Pitfall 1 — the summed bucket at snapshot-write time); the behavior change is proven by the admitted-count delta, not the duplicate count'

patterns-established:
  - 'Cache-key bump completeness is enforced mechanically by the redis-registry drift gate, not by manual grep-and-pray'

requirements-completed: [WATER-FILTER-03]

# Metrics
duration: ~12min
completed: 2026-06-09
---

# Phase 42 Plan 03: water:facilities:v4 Cache-Key Lockstep + Snapshot Regen Summary

**Bumped `water:facilities:v3` -> `v4` atomically across all 10 lockstep surfaces (keeping the redis-registry drift gate green), regenerated the `src/data/water-facilities.json` cold-start snapshot from the post-fix admitted set (304 -> 460 facilities), and resolved Open Question 2 (data-flows.md is not gate-covered -> deferred to Phase 49).**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-09
- **Tasks:** 3 (3 auto; Task 3 verification-only, no commit)
- **Files modified:** 12 (11 source/doc/test + 1 regenerated snapshot)

## Accomplishments

- **Task 1 — v4 lockstep (WATER-FILTER-03, D-09/D-10/D-11):** Changed the cache-key literal from `water:facilities:v3` to `water:facilities:v4` across all 10 enumerated surfaces:
  1. `server/routes/water.ts:122` `FACILITIES_KEY` (canonical writer) + Phase-42 bump-rationale comment
  2. `server/routes/cron-warm.ts:29` `WATER_KEY` + the read-side comment ref at :20
  3. `server/routes/cron-health.ts:18` comment ref
  4. `server/lib/healthSources.ts:46` `SOURCE_KEYS.water` + the DRIFT-3 / anti-pattern-guard comments
  5. `server/openapi.yaml:997` spec entry
  6. `server/__tests__/routes/water.test.ts` — 14 quoted positive pins -> v4 + the comment/test-name refs; the negative assertion that bare `'water:facilities'` is NOT used (line 661) was RETAINED unchanged
  7. `server/__tests__/lib/healthSources.test.ts:60-61` test pin
  8. `src/__tests__/lib/redis-registry.test.ts` — ADDED `water:facilities:v3` to `EXEMPT_KEYS` (RETIRED_KEY_WHITELIST) as the new dead-surveillance entry; kept `water:facilities:v2` and bare `water:facilities`; updated the hard-coded "`water:facilities:v3` is canonical" comment string to v4
  9. `docs/architecture/redis-keys.md:55` registry row -> v4
  10. `CLAUDE.md` §Serverless Cache registry line -> v4
- **Task 2 — snapshot regen (D-12):** Ran `npm run refresh:water` against LIVE Overpass AFTER the Plan-02 fix landed. Admitted facilities went **304 -> 460 (+156)** — the corrected admitted set now includes previously-collapsed distinct named facilities. The script wrote `src/data/water-facilities.json` atomically (tmp+rename), sorted by id with 6dp coords, and the operator-email scrub ran (0 PII survived). No duplicate ids; the snapshot validates on cold-start read (`loadWaterSnapshot` returns 460 facilities, no throw).
- **Task 3 — regression gate:** Full server suite GREEN (**1378 tests, 116 files**); `tsc -b` typecheck clean (exit 0); redis-registry drift gate GREEN (41 tests). No missed v3 pins surfaced.

## Open Question 2 resolution (data-flows.md disposition)

**DEFERRED to Phase 49.** The `docs/architecture/data-flows.md:450,467` bare `water:facilities` reference is NOT covered by any content gate:

- The redis-registry drift gate (`src/__tests__/lib/redis-registry.test.ts`) parses markdown from ONLY `CLAUDE.md` (§Serverless Cache subsection) and `docs/architecture/redis-keys.md`, and walks code in ONLY `server/` + `src/` — `data-flows.md` and `scripts/` are out of its scan scope.
- The `docs:lint` script (`markdown-link-check`) validates hyperlinks only, not inline code-span key content.

Per D-11, prose-doc reconciliation waits for Phase 49. `data-flows.md` was left untouched this phase (the plan instructed: do NOT touch the bare-ref unless a gate forces it).

## D-08 determinism evidence

Per Pitfall 2, determinism is proven against a FIXED in-memory corpus, not via two live Overpass runs (corpus drift between live runs would be a false signal). The Plan-02 unit test case (d) in `server/__tests__/adapters/overpass-water.test.ts` shuffles a fixed `WaterFacility[]` corpus and asserts an identical kept-ID set AND order out of `spatialDedup` (D-07 sort by notabilityScore desc / osmId asc). That case is GREEN in the full server suite run above. The live snapshot regen (Task 2) corroborates at the integration level: a deterministic, name-aware admitted set of 460.

## Files Created/Modified

- `server/routes/water.ts` — `FACILITIES_KEY` -> v4 + Phase-42 bump comment
- `server/routes/cron-warm.ts` — `WATER_KEY` -> v4 + read-side comment ref
- `server/routes/cron-health.ts` — DRIFT-3 comment ref -> v4
- `server/lib/healthSources.ts` — `SOURCE_KEYS.water` -> v4 + DRIFT-3 / anti-pattern-guard comments
- `server/openapi.yaml` — cron-warm spec key ref -> v4
- `server/__tests__/routes/water.test.ts` — 14 positive pins -> v4; bare-key negative assertion retained
- `server/__tests__/lib/healthSources.test.ts` — `SOURCE_KEYS.water` pin -> v4
- `src/__tests__/lib/redis-registry.test.ts` — v3 added as dead-surveillance whitelist entry; canonical comment -> v4
- `docs/architecture/redis-keys.md` — registry row -> v4
- `CLAUDE.md` — §Serverless Cache registry line -> v4
- `scripts/audit-water-names.ts` — [Rule 1] live Redis read + 3 comment refs -> v4
- `src/data/water-facilities.json` — regenerated cold-start snapshot (304 -> 460 facilities)

## Decisions Made

- **v4 lockstep done atomically (D-09/D-10/D-11):** all 10 surfaces in one phase; the drift gate stayed green at every checkpoint (baseline, Task 1, Task 3).
- **v3 demoted, not deleted:** added to the whitelist as dead-surveillance (mirrors the existing v2 / bare-prefix surveillance entries) so the old key is tracked during TTL retirement.
- **Open Question 2 -> defer to Phase 49:** no gate covers data-flows.md (analysis above).
- **Behavior-change evidence via admitted-count delta, not the duplicate bucket:** `rejections.duplicate` is 0 in both snapshots (Pitfall 1 — the summed bucket at snapshot-write time). The 304 -> 460 admitted delta is the load-bearing D-09 justification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scripts/audit-water-names.ts read the now-dead v3 key**

- **Found during:** Task 1 (grep sweep for `water:facilities:v3`)
- **Issue:** `scripts/audit-water-names.ts:214` calls `cacheGetSafe<RawSnapshotEntry[]>('water:facilities:v3', 0)`. After the v4 deploy this would read a dead key and silently degrade to an empty corpus (`res?.data ?? []`), breaking `npm run audit:water`. The plan's 10-surface table omits scripts/ (it is NOT covered by the drift gate, which walks only server/ + src/), but CONTEXT.md D-10 explicitly listed `scripts/audit-water-names.ts` as a key-reference site.
- **Fix:** Bumped the live Redis read at :214 to `water:facilities:v4`, plus the 3 documentation comment refs (:11, :15, :182) for consistency.
- **Files modified:** `scripts/audit-water-names.ts`
- **Commit:** `0933d84` (folded into the Task 1 lockstep commit since it is the same logical change)

## Issues Encountered

None. Live Overpass was reachable for the Task 2 snapshot regen (dams/reservoirs/desalination all HTTP 200). The full server suite, typecheck, and drift gate were green on the first run.

## Next Phase Readiness

- WATER-FILTER-03 complete. Phase 42 is done at the data layer: the fix is observable in production data (the cold-fill on next deploy serves the corrected 460-facility set; the tier-3 snapshot read-floor already carries it).
- Phase 49 carries the deferred prose reconciliation of the stale bare `water:facilities` ref in `docs/architecture/data-flows.md:450,467`.
- No blockers.

## Self-Check: PASSED

- FOUND: .planning/phases/42-water-filter-fix/42-03-SUMMARY.md
- FOUND: src/data/water-facilities.json (460 facilities, validates on cold-start read)
- FOUND commit: 0933d84 (Task 1 v4 lockstep + audit-script Rule-1 fix)
- FOUND commit: 48a0ae1 (Task 2 snapshot regen)
- VERIFIED: grep "water:facilities:v3" across server/ src/ docs/ CLAUDE.md returns only the dead-surveillance whitelist entry + a retirement-note comment; no live canonical v3 reference remains
- VERIFIED: full server suite 1378 green; tsc -b exit 0; drift gate 41 green

---

_Phase: 42-water-filter-fix_
_Completed: 2026-06-09_
