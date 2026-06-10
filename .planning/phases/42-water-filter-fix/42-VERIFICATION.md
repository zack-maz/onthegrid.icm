---
phase: 42-water-filter-fix
verified: 2026-06-09T19:05:00Z
status: passed
score: 8/8
overrides_applied: 0
---

# Phase 42: Water Filter Fix — Verification Report

**Phase Goal:** Telemetry-diagnosed rejection-bucket fix for intermittently-dropped water facilities; `water:facilities:v3` cache key bump (to v4) + cold-start snapshot regen if shape changes; `waterFilterStats` regression fixtures pin the fix.
**Verified:** 2026-06-09T19:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                           | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Operator has a committed written diagnosis (42-DIAGNOSIS.md) citing the specific rejection bucket, produced before any fix code                                 | VERIFIED | `42-DIAGNOSIS.md` exists with frontmatter `verdict: confirmed_prime_suspect_dedup`, `suspect_bucket: rejections.duplicate (SUMMED)`, `d03_decision: confirm-dedup`. Committed at `c98c3c7` before any fix code landed. Grep confirms `duplicate` cited in non-comment prose.                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | Diagnosis names concrete dropped OSM elements (id + name + facilityType + coords) from a two-run admitted-ID-set diff                                           | VERIFIED | Diagnosis names `water-897724216` / `Sd Wdy Rbg` (`dam`, lat 22.8215266, lng 39.3761299, score 35) as the dropped element and `water-156481893` / `Rabigh Dam` as the survivor; 21.1m separation documented.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | Spatial dedup never collapses two distinct named facilities of the same type within 50m (WATER-FILTER-02)                                                       | VERIFIED | `export function spatialDedup` at `server/adapters/overpass-water.ts:306` — collapse predicate requires `normName(existing) === normName(f)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |     | either side === ''`; distinct non-empty names do not collapse. Case (a) test asserts `kept.length === 2` — GREEN. |
| 4   | Dedup output is deterministic and order-independent (D-07/D-08)                                                                                                 | VERIFIED | Working set sorted by `(b.notabilityScore ?? 0) - (a.notabilityScore ?? 0) \|\| a.osmId - b.osmId` before scan. Case (d) shuffles a fixed 4-element corpus and asserts identical kept-ID set AND order across 3 orderings — GREEN.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | A regression fixture for the real previously-dropped OSM element pair fails if name-blind collapse is reintroduced (WATER-FILTER-04, D-14)                      | VERIFIED | `it('(e) regression: real Sd Wdy Rbg / Rabigh Dam pair (42-DIAGNOSIS) both admit')` at `overpass-water.test.ts:2423` — asserts `kept.length === 2`, `collapsed === 0`, and exact survivor IDs. Comment documents legacy behavior `collapsed === 1`. GREEN in test run (170/170).                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | Latin-label admission gate (computeAdmissionDecision / hasLatinLabel) is untouched; G1 "Dam near X" regression stays fixed (D-06/D-15)                          | VERIFIED | `normName` reads `f.label` not `nameLatin`. `computeAdmissionDecision` and `hasLatinLabel` unchanged — only a docstring references them in the phase diff. All 165 pre-existing G1 admission tests pass GREEN in the full `overpass-water.test.ts` run.                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | `water:facilities:v3` is bumped to `water:facilities:v4` atomically across all lockstep surfaces so the redis-registry drift gate stays green (WATER-FILTER-03) | VERIFIED | 10 surfaces verified: `server/routes/water.ts:127` `FACILITIES_KEY`, `server/routes/cron-warm.ts:29` `WATER_KEY`, `server/routes/cron-health.ts:18` comment, `server/lib/healthSources.ts:46` `SOURCE_KEYS.water`, `server/openapi.yaml:997`, 14 positive test pins in `water.test.ts`, `healthSources.test.ts:61`, whitelist entry in `redis-registry.test.ts:73`, `docs/architecture/redis-keys.md:55`, `CLAUDE.md:131`. Redis-registry drift gate: 51/51 tests GREEN. `v3` has a canonical-comment string updated to v4 and is in `EXEMPT_KEYS` as dead-surveillance. `scripts/audit-water-names.ts` also bumped (auto-fixed deviation, correct). |
| 8   | `src/data/water-facilities.json` cold-start snapshot is regenerated post-fix and reflects the corrected admitted set                                            | VERIFIED | Snapshot regenerated via `npm run refresh:water` after the fix: 304 → 460 facilities (+156). No duplicate IDs (node check: 460 unique IDs). Both `water-897724216` (`Sd Wdy Rbg`) and `water-156481893` (`Rabigh Dam`) are present in the committed JSON — the previously-dropped element now appears. No `@`-email PII present (operator-email scrub ran).                                                                                                                                                                                                                                                                                          |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact                                               | Expected                                                                          | Status   | Details                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.planning/phases/42-water-filter-fix/42-DIAGNOSIS.md` | Telemetry-first written diagnosis (WATER-FILTER-01); cites `rejections.duplicate` | VERIFIED | Exists; frontmatter `suspect_bucket: rejections.duplicate (SUMMED)`; names concrete dropped pair; D-03 decision recorded.                                                                                                      |
| `server/adapters/overpass-water.ts`                    | Exported `spatialDedup(facilities: WaterFacility[]): { kept; collapsed }`         | VERIFIED | `export function spatialDedup` at line 306; name-aware D-04 predicate; D-07 deterministic sort; normName reads `f.label`. Call-site at line 1266 replaces inline loop; `stats.rejections.duplicate += collapsed` at line 1267. |
| `server/__tests__/adapters/overpass-water.test.ts`     | GREEN spatialDedup test block including D-14 regression fixture                   | VERIFIED | 170/170 tests pass; cases (a)-(e) all GREEN; no `it.todo` remaining; real OSM element pair used in case (e).                                                                                                                   |
| `server/routes/water.ts`                               | Canonical writer of bumped cache key                                              | VERIFIED | `FACILITIES_KEY = 'water:facilities:v4'` at line 127.                                                                                                                                                                          |
| `docs/architecture/redis-keys.md`                      | Contract-doc registry row for v4                                                  | VERIFIED | Row at line 55 shows `water:facilities:v4` as canonical with Phase 42 bump rationale.                                                                                                                                          |
| `src/data/water-facilities.json`                       | Regenerated cold-start snapshot, post-fix admitted set                            | VERIFIED | 460 facilities, 0 duplicate IDs, both previously-dropped and survivor elements present.                                                                                                                                        |
| `src/__tests__/lib/redis-registry.test.ts`             | v3 in dead-surveillance whitelist; canonical comment updated to v4                | VERIFIED | `EXEMPT_KEYS` entry at line 73-76 for `water:facilities:v3`; comment at line 80 reads "`water:facilities:v4` is canonical per CLAUDE.md".                                                                                      |

---

### Key Link Verification

| From                                                     | To                               | Via                                                                      | Status | Details                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `server/adapters/overpass-water.ts fetchWaterFacilities` | `spatialDedup`                   | call-site replacement of inline loop at line 1266                        | WIRED  | `spatialDedup(Array.from(unique.values()))` at line 1266; `stats.rejections.duplicate += collapsed` at 1267.                             |
| `spatialDedup`                                           | `haversine`                      | 50m (`< 0.05`) same-facilityType distance check (D-05)                   | WIRED  | `haversine(existing.lat, existing.lng, f.lat, f.lng) >= 0.05` at line 321; `existing.facilityType !== f.facilityType` guard at line 320. |
| `server/routes/water.ts FACILITIES_KEY`                  | redis-registry drift gate        | source literal cross-checked against CLAUDE.md + redis-keys.md whitelist | WIRED  | `v4` literal in `water.ts:127`; drift gate passes 51/51 tests with `water:facilities:v4` as the documented canonical key.                |
| `npm run refresh:water`                                  | `src/data/water-facilities.json` | atomic tmp+rename snapshot regeneration with operator-email scrub        | WIRED  | Snapshot committed at `48a0ae1`; 460 facilities; both previously-dropped elements present; no PII.                                       |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase modifies a server-side data-processing adapter (`overpass-water.ts`) and an offline snapshot regeneration tool (`refresh-water-facilities.ts`). There is no frontend component rendering dynamic state that requires a data-flow trace.

---

### Behavioral Spot-Checks

| Behavior                                           | Command                                                                                           | Result                       | Status |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| spatialDedup cases (a)-(e) all GREEN               | `npx vitest run server/__tests__/adapters/overpass-water.test.ts`                                 | 170 passed, 0 failed, 0 todo | PASS   |
| WaterFilterStats schema lockstep GREEN             | `npx vitest run server/__tests__/schemas/waterFilterStats.test.ts`                                | 10 passed                    | PASS   |
| Redis-registry drift gate GREEN                    | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                                         | 41 passed                    | PASS   |
| Water route v4 pins GREEN                          | `npx vitest run server/__tests__/routes/water.test.ts server/__tests__/lib/healthSources.test.ts` | 42 passed                    | PASS   |
| Full server suite GREEN                            | `npx vitest run server/`                                                                          | 1378 passed, 116 files       | PASS   |
| Cold-start snapshot non-empty, no duplicate IDs    | node JSON check                                                                                   | 460 entries, 0 duplicates    | PASS   |
| Previously-dropped OSM element present in snapshot | grep `water-897724216` in `src/data/water-facilities.json`                                        | Found at line 10266          | PASS   |

---

### Probe Execution

No probe scripts exist for this phase (no `scripts/*/tests/probe-*.sh`). Not applicable.

---

### Requirements Coverage

| Requirement     | Source Plan | Description                                                                                                                            | Status    | Evidence                                                                                                                                                                                                                        |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WATER-FILTER-01 | Plan 01     | Written diagnosis identifying rejection stage(s) for missing facilities                                                                | SATISFIED | `42-DIAGNOSIS.md` committed at `c98c3c7` before fix code; cites SUMMED `rejections.duplicate`; names `Sd Wdy Rbg` / `Rabigh Dam` pair with id + name + facilityType + coords.                                                   |
| WATER-FILTER-02 | Plan 02     | Water facilities never intermittently drops entries — spatial dedup never collapses distinct named facilities; Latin gate not loosened | SATISFIED | `spatialDedup` exported and wired; D-04 name-aware predicate; D-07 determinism; `hasLatinLabel` / `computeAdmissionDecision` byte-untouched; 170/170 tests GREEN including G1.                                                  |
| WATER-FILTER-03 | Plan 03     | Fix observable in production — cache key bumped, cold-start snapshot regenerated                                                       | SATISFIED | `water:facilities:v4` canonical across all 10 lockstep surfaces; drift gate GREEN; snapshot regenerated 304 → 460.                                                                                                              |
| WATER-FILTER-04 | Plan 02     | `waterFilterStats` test suite updated — rejection-bucket deltas pin the fix against regression                                         | SATISFIED | Case (e) regression fixture uses real `Sd Wdy Rbg` / `Rabigh Dam` pair; asserts `kept.length === 2`, `collapsed === 0`; documents that legacy predicate yields `collapsed === 1` — regression to name-blindness fails the test. |

All 4 required requirement IDs fully satisfied and traced to passing tests.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact                                                                                                |
| ---- | ---- | ------- | -------- | ----------------------------------------------------------------------------------------------------- |
| —    | —    | —       | —        | No TBD/FIXME/XXX markers found in any phase-modified file. No placeholder returns. No empty handlers. |

Scanned: `server/adapters/overpass-water.ts`, `server/__tests__/adapters/overpass-water.test.ts`, `server/routes/water.ts`, `server/routes/cron-warm.ts`, `server/routes/cron-health.ts`, `server/lib/healthSources.ts`, `src/__tests__/lib/redis-registry.test.ts`, `docs/architecture/redis-keys.md`, `CLAUDE.md`, `scripts/audit-water-names.ts`, `src/data/water-facilities.json`. No debt markers found.

One auto-fixed deviation was applied during Plan 03 (Rule 1): `scripts/audit-water-names.ts` read the now-dead `v3` key and would have silently degraded `npm run audit:water` after the v4 deploy. The executor correctly bumped it to v4 and folded it into the Task 1 lockstep commit (`0933d84`). This is a valid fix, not a deviation from the phase goal.

---

### Human Verification Required

None. All phase deliverables are mechanically verifiable:

- The diagnosis is a text file with structured frontmatter and verifiable content.
- The fix is a pure function with behavioral tests (no UI, no external service integration, no visual output).
- The cache-key lockstep is enforced by a mechanical drift gate (redis-registry.test.ts).
- The snapshot regeneration is verified by facility count, duplicate-ID check, and presence of the specific previously-dropped OSM element.

---

### Gaps Summary

No gaps. All 8 observable truths are VERIFIED, all 4 requirements are SATISFIED, all key links are WIRED, all behavioral spot-checks PASS, and no anti-patterns were found.

---

_Verified: 2026-06-09T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
