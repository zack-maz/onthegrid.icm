# Phase 42: Water Filter Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 42-water-filter-fix
**Mode:** Auto-recommend — operator ran `/gsd-discuss-phase 42 your recommendation for all`; Claude selected the recommended option for every gray area without interactive prompts.
**Areas discussed:** Dedup fix semantics, Determinism/intermittency, Diagnosis artifact, Cache-bump + snapshot policy, Stats shape & fixture strategy

---

## Dedup fix semantics

| Option                    | Description                                                                                                                       | Selected |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Name-aware collapse       | Collapse within 50m + same type ONLY when normalized names match or one side is unnamed; distinct named facilities never collapse | ✓        |
| Shrink radius             | Reduce 50m window so fewer pairs qualify — risks reintroducing true duplicates at the margin                                      |          |
| Drop spatial dedup        | Rely on OSM-ID dedup alone — reintroduces node/way duplicate pairs the D-05 dedup was built for                                   |          |
| Score-based survivor only | Keep type-only collapse but pick survivor by score — fixes determinism, not the wrongful collapse                                 |          |

**Choice:** Name-aware collapse (recommended default) — literal WATER-FILTER-02 wording; pre-registered as the prime-suspect fix, gated on diagnosis confirmation (D-03).

---

## Determinism / intermittency

| Option                                       | Description                                                              | Selected |
| -------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Deterministic winner (score desc, osmId asc) | Survivor independent of Overpass return order; reproducible refresh runs | ✓        |
| Sort input before dedup                      | Equivalent effect, larger diff                                           |          |
| Leave order-dependent                        | Intermittency persists for legitimately-collapsed pairs                  |          |

**Choice:** Deterministic winner selection; acceptance = two consecutive `refresh:water` runs produce identical facility ID sets.

---

## Diagnosis artifact

| Option                                                | Description                                                                                | Selected |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| 42-DIAGNOSIS.md in phase dir, 27.3.1 precedent format | Committed before any fix code; ≥2 refresh runs diffed; names concrete dropped OSM elements | ✓        |
| Inline section in PLAN.md                             | Weaker audit trail; breaks WATER-FILTER-01 "written diagnosis" intent                      |          |
| docs/ architecture note                               | Wrong layer — this is planning evidence, not product docs                                  |          |

**Choice:** `42-DIAGNOSIS.md`, telemetry-first, committed before code.

---

## Cache-bump + snapshot policy

| Option                                                                            | Description                                                               | Selected |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| Any facility-set delta = bump v3→v4 + regen snapshot + lockstep contract surfaces | Unambiguous trigger; drift gates stay green per milestone rule            | ✓        |
| Bump only on TypeScript shape change                                              | Misses the "behavior changed" clause of WATER-FILTER-03                   |          |
| No bump, overwrite v3                                                             | Stale v3 entries with old collapse behavior would persist 10x logical TTL |          |

**Choice:** Behavior-delta bump; propagate to all 8 reference sites; contract surfaces (redis-keys.md, CLAUDE.md registry, drift test) in this phase, prose docs in Phase 49.

---

## Stats shape & fixture strategy

| Option                                                                                                                      | Description                                                        | Selected |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Keep 8-bucket shape; additive-optional field only if diagnosis demands; real-OSM-element fixtures + bucket-delta assertions | Minimal blast radius; WATER-FILTER-04 satisfied with real evidence | ✓        |
| Add mandatory dedupCollisions field                                                                                         | Breaks schema test + DevApiStatus consumers for speculative value  |          |
| Synthetic fixtures only                                                                                                     | Weaker regression pin than the actual dropped element              |          |

**Choice:** Stable shape, real-element fixtures, rejection-bucket delta pins; G1 guards untouched.

---

## Claude's Discretion

- Name-normalization specifics (diacritics, `nameLatin` vs `label` comparison field)
- Whether to clean up the O(n²) dedup scan incidentally
- 42-DIAGNOSIS.md internal structure beyond the 27.3.1 precedent

## Deferred Ideas

- Water-subtab readability polish → Phase 45
- Dedup performance optimization as a standalone concern → future hardening
- Reviewed-not-folded todos: `phase-27.4.2-ci-health.md`, `phase-27.4.3-deckgl-v9-type-drift.md` (keyword-noise matches; candidates for Phase 46 review)
