---
phase: 42-water-filter-fix
diagnosed_at: 2026-06-09T20:45:00Z
requirement: WATER-FILTER-01
verdict: confirmed_prime_suspect_dedup
suspect_bucket: rejections.duplicate (SUMMED)
d03_decision: confirm-dedup
---

# Phase 42 Water Filter Diagnosis (WATER-FILTER-01)

Telemetry-first diagnosis produced from `npm run refresh:water` output **before any fix
code**. It confirms the pre-registered prime suspect (CONTEXT D-03): the name-blind,
order-dependent O(n²) spatial-dedup loop at `server/adapters/overpass-water.ts:1202-1212`
collapses **distinct named facilities** of the same `facilityType` within 50m, in direct
violation of WATER-FILTER-02. Follows the section structure of the Phase 27.3.1 diagnosis
precedent (D-01).

## Method (D-02)

`npm run refresh:water` was run **three times** on 2026-06-09 (two clean two-run-diff runs
plus one instrumented run to name the dropped element). The script is both the diagnosis
tool and the snapshot regenerator; per D-12 **no regenerated snapshot is committed in this
plan** — the working snapshot was restored from a pre-run backup after evidence collection.

- Run 1 — `/tmp/water-run-1.log` / `/tmp/water-run-1.json`
- Run 2 — `/tmp/water-run-2.log` / `/tmp/water-run-2.json`
- Run 3 (instrumented) — a temporary `console.error` in the dedup `else` branch logged the
  collapsed element + the survivor it collided with, then was reverted (working tree clean,
  verified by `git status` + `grep -c TEMP-DIAGNOSIS`).

Evidence cited below is the **SUMMED `rejections.duplicate`** field (the field the dedup loop
actually increments at line 1211), **never** a per-type `byTypeRejections.*.duplicate` count —
that per-type field is structurally always `0` because dedup runs post-merge on the unified
`unique` set and the type-of-origin query is already lost (RESEARCH Pitfall 1).

## Telemetry evidence

| Field                                        | Run 1 | Run 2                                 |
| -------------------------------------------- | ----- | ------------------------------------- |
| admitted facilities                          | 403   | 403                                   |
| `rejections.duplicate` (SUMMED)              | **1** | **1**                                 |
| `byTypeRejections.dams.duplicate` (per-type) | 0     | 0 (structurally always 0 — Pitfall 1) |
| admitted-ID-set symmetric diff (run1 △ run2) | —     | **∅ (identical)**                     |

The two clean runs produced **identical admitted ID sets** and an identical
`rejections.duplicate = 1`. The non-determinism (D-07/D-08 "intermittent" symptom) was NOT
observable across these two runs because the **reservoirs** Overpass query failed identically
in both (`status=504` primary, then a 90s fallback timeout) — so both runs saw the same dams +
desalination corpus. This is **corpus drift / mirror flakiness, not dedup determinism**
(RESEARCH Pitfall 2): the determinism guarantee must be — and is — proven by a unit test
against a fixed in-memory corpus (Plan 01 Task 2, case d), not by two live runs. The
name-blindness defect, by contrast, IS directly visible in a single run (below).

### Corpus-drift note (Pitfall 2)

The reservoirs query was unavailable for the entire diagnosis window: `overpass-api.de`
returned `504` and the `overpass.private.coffee` fallback timed out at 90s on every attempt.
Both runs therefore admitted only dams (389) + desalination (15) = 404 raw → 403 after the one
collapse. Run-to-run raw-element count was stable (no count delta), so the absence of an
ID-set diff is explained by identical corpus, not by dedup stability. The dedup defect is
proven by the instrumented single-run capture, which is deterministic-corpus evidence.

## Concrete dropped OSM element (D-02 / D-14 fixture seed)

The instrumented run captured exactly one collapse, and it is a textbook WATER-FILTER-02
violation — **two distinct named dams** collapsed by the name-blind predicate:

| Role         | id                | osmId     | label        | facilityType | lat        | lng        | notabilityScore |
| ------------ | ----------------- | --------- | ------------ | ------------ | ---------- | ---------- | --------------- |
| **DROPPED**  | `water-897724216` | 897724216 | `Sd Wdy Rbg` | `dam`        | 22.8215266 | 39.3761299 | 35              |
| **SURVIVOR** | `water-156481893` | 156481893 | `Rabigh Dam` | `dam`        | 22.8215284 | 39.3763353 | 70              |

- **Separation:** 21.1 m (well within the 50m / `haversine < 0.05` window).
- **Why it collapsed:** the predicate compares only `facilityType` + distance, with **no name
  check**. The two labels (`"Sd Wdy Rbg"` vs `"Rabigh Dam"`) are clearly distinct named
  facilities, yet they collapsed to one.
- **Why this one survived (today):** first-seen survival keyed on `Map` insertion order =
  Overpass return order. With the post-fix deterministic survivor rule (D-07: highest
  `notabilityScore`, tie-break lowest `osmId`), `Rabigh Dam` (score 70) would be the
  deterministic survivor regardless of return order — but the **correct** post-fix behavior
  is that **BOTH admit**, because their names differ (D-04). This pair is the real
  previously-dropped element the D-14 regression fixture (Plan 02, test case e) must pin:
  feeding both into `spatialDedup` must yield `kept.length === 2`.

`Rabigh Dam` (`water-156481893`) is present in the committed `src/data/water-facilities.json`;
`Sd Wdy Rbg` (`water-897724216`) is absent — confirming the live drop reaches the persisted
snapshot, not just an in-memory transient.

> PII note (T-42-01): only id + name + facilityType + coords + score are cited above. No raw
> OSM `operator` tag value is reproduced. The `/@[\w.]+/` operator-email scrub in
> `scripts/refresh-water-facilities.ts:78-84` (T-27.3.1.05-01) ran unchanged on every
> diagnosis run.

## Root cause (confirmed)

The single spatial-dedup loop at `server/adapters/overpass-water.ts:1202-1212` has two
defects that together produce "intermittent drop of legitimate named facilities":

1. **Name-blind collapse** — the `isDupe` predicate (lines 1205-1209) collapses any two
   facilities of the same `facilityType` within 50m with **no name comparison**. Directly
   demonstrated above (`Sd Wdy Rbg` vs `Rabigh Dam`). Violates WATER-FILTER-02 literally.
2. **Order-dependent survivor** — `Array.from(unique.values())` iterates in Overpass return
   order and keeps the first-seen element, so WHICH of a colliding pair survives varies
   run-to-run = the "intermittent" symptom. Not directly observed this session (reservoirs
   corpus was frozen by mirror failure), but visible in source and proven by the Plan 01
   Task 2 determinism unit test against a fixed corpus.

## Verdict & D-03 decision

**CONFIRM-DEDUP.** The telemetry confirms the pre-registered prime suspect. No pivot is
required. The implicated bucket is the SUMMED `rejections.duplicate`. **No pivot to
`no_resolved_name` / `no_city` / Overpass-mirror buckets is warranted**, and the Latin-label
admission gate (`hasLatinLabel` / `no_resolved_name`) is **NOT implicated** — so D-06 is not
triggered and nothing needs operator surfacing on the Latin-gate axis. (The separate
reservoirs Overpass-mirror outage is a transient infra flake, not the dedup defect, and is
out of this fix's scope.)

Plan 02 proceeds with the pre-registered name-aware + deterministic `spatialDedup(...)` fix
(D-04..D-08), extracting the loop to an exported pure function, and pins this exact
`Sd Wdy Rbg` / `Rabigh Dam` pair as the D-14 regression fixture (Plan 02 fills Plan 01 Task 2
case (e)).

## Surface for the Plan 01 Task 2 RED scaffold

The RED `spatialDedup` test scaffold (cases a–d + `it.todo(e)`) pins the not-yet-built
contract `spatialDedup(facilities) => { kept: WaterFacility[]; collapsed: number }`. Case (e)
is the `it.todo` placeholder for the `Sd Wdy Rbg` / `Rabigh Dam` regression pin named here.
