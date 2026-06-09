# Phase 42: Water Filter Fix - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Auto-recommend (operator requested Claude's recommendation for all gray areas)

<domain>
## Phase Boundary

The water facilities layer stops intermittently dropping legitimate named facilities. The fix is telemetry-first: a written diagnosis from `byTypeRejections` telemetry MUST precede any code change. Scope is the rejection pipeline in `server/adapters/overpass-water.ts` (prime suspect: D-05 spatial dedup), the `water:facilities:v3` cache key + `src/data/water-facilities.json` snapshot if behavior changes, and the `waterFilterStats` test suite in lockstep. The Latin-label admission gate is NOT loosened — the Phase 27.3.1 G1 "Dam near X" regression stays fixed.

Out of scope: water-subtab readability (Phase 45), any new facility types or Overpass query changes, prose docs updates (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### Diagnosis-first workflow (WATER-FILTER-01)

- **D-01:** Written diagnosis lands as `.planning/phases/42-water-filter-fix/42-DIAGNOSIS.md`, following the format precedent of `.planning/milestones/v1.4-phases/27.3.1-water-facility-retry-and-cleanup/27.3.1-DIAGNOSIS.md`. It MUST be produced and committed BEFORE any fix code is written.
- **D-02:** Diagnosis runs `npm run refresh:water` at least TWICE and diffs the admitted facility ID sets between runs — the intermittency itself is the evidence. The diagnosis cites the specific `byTypeRejections` bucket(s) responsible and names concrete dropped OSM elements (id + name + facilityType + coords).
- **D-03:** The fix implemented is the one the diagnosis confirms — the decisions below pre-register the prime-suspect fix, but if telemetry points at a different bucket (e.g. `no_resolved_name`, `no_city`, or Overpass mirror flakiness), the planner pivots to the confirmed bucket and records the pivot in the plan.

### Dedup fix semantics (prime-suspect fix, WATER-FILTER-02)

- **D-04:** Spatial dedup becomes name-aware: two facilities within 50m of the same `facilityType` collapse ONLY when their normalized names match (case/whitespace-insensitive; compare the post-romanization display name) or when one side is unnamed. Distinct named facilities NEVER collapse — this is the literal WATER-FILTER-02 wording.
- **D-05:** The 50m radius and same-`facilityType` constraint are retained as-is — the fix narrows what collapses, it does not widen or shrink the spatial window.
- **D-06:** The Latin-label admission gate (`hasLatinLabel` / `no_resolved_name` bucket) is untouched. Any diagnosis finding that implicates it gets surfaced to the operator before action, since loosening it is explicitly forbidden by the requirement.

### Determinism (kills the "intermittent" part)

- **D-07:** Dedup winner selection becomes deterministic and order-independent: when a collapse does happen, the survivor is chosen by highest `notabilityScore`, tie-broken by lowest `osmId` — never by Overpass return order or `FACILITY_QUERIES` iteration order.
- **D-08:** Acceptance check for determinism: two consecutive `npm run refresh:water` runs (against the same Overpass corpus) produce identical admitted facility ID sets. This goes in the plan's verification step.

### Cache key bump + snapshot regen (WATER-FILTER-03)

- **D-09:** Any change to the admitted-facility set counts as a behavior change → bump `water:facilities:v3` → `water:facilities:v4`. The name-aware dedup fix admits previously-collapsed facilities, so the bump fires unless the diagnosis somehow yields a zero-delta fix.
- **D-10:** Bump propagates to ALL key-reference sites found in scout: `server/routes/water.ts`, `server/routes/cron-warm.ts`, `server/routes/cron-health.ts`, `server/lib/healthSources.ts`, `scripts/audit-water-names.ts`, plus the test pins (`server/__tests__/routes/water.test.ts`, `server/__tests__/lib/healthSources.test.ts`, `src/__tests__/lib/redis-registry.test.ts`).
- **D-11:** Contract surfaces update in lockstep within this phase so drift gates stay green throughout v2.0 (milestone rule): `docs/architecture/redis-keys.md`, the CLAUDE.md Redis-key registry line, and the redis-registry drift test. Prose docs (README/runbook/architecture narrative) wait for Phase 49.
- **D-12:** `src/data/water-facilities.json` cold-start snapshot is regenerated via `npm run refresh:water` and committed after the fix lands.

### Telemetry/stats shape + regression pinning (WATER-FILTER-04)

- **D-13:** The `WaterFilterStats` 8-bucket shape stays stable — no breaking changes to the schema test or DevApiStatus consumers. If the diagnosis needs collapse-pair visibility, add at most one additive-OPTIONAL field (e.g. a capped `dedupCollisions` sample), mirrored in `server/__tests__/schemas/waterFilterStats.test.ts` in the same commit.
- **D-14:** Regression fixtures use the REAL previously-dropped OSM element(s) identified in the diagnosis: a fixture corpus where the named element pair within 50m must BOTH admit post-fix, and a rejection-bucket delta assertion (the `duplicate` count on the fixture corpus) that fails if the old collapse behavior returns.
- **D-15:** The G1 regression guard stays green: existing tests proving "Dam near X" unnamed-synthetic-label rejection remain untouched and passing.

### Claude's Discretion

- Name-normalization specifics for the dedup comparison (diacritics handling, `nameLatin` vs `label` field choice) — pick whatever the diagnosis evidence supports; keep it simple.
- Whether the dedup loop needs an algorithmic cleanup (the O(n²) `deduped.some(...)` scan) — only if it falls out naturally from the fix; performance is not a phase requirement.
- Exact structure of 42-DIAGNOSIS.md sections beyond following the 27.3.1 precedent.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition

- `.planning/ROADMAP.md` §Phase 42 — goal, success criteria 1-4
- `.planning/REQUIREMENTS.md` §Water Data Quality (WATER-FILTER-01..04)

### Diagnosis precedent + regression history

- `.planning/milestones/v1.4-phases/27.3.1-water-facility-retry-and-cleanup/27.3.1-DIAGNOSIS.md` — diagnosis format precedent; G1 "Dam near X" regression history that must stay fixed

### Code under change

- `server/adapters/overpass-water.ts` — admission pipeline (`computeAdmissionDecision`), `normalizeWaterElement`, D-05 spatial dedup at the `fetchWaterFacilities` tail (~lines 1203-1212), `byTypeRejections` telemetry
- `server/__tests__/schemas/waterFilterStats.test.ts` — stats-shape lockstep test (WATER-FILTER-04)
- `server/__tests__/adapters/overpass-water.test.ts` — existing admission/dedup tests incl. G1 guards
- `scripts/refresh-water-facilities.ts` — `npm run refresh:water` telemetry source + snapshot writer
- `server/lib/waterSnapshot.ts` + `src/data/water-facilities.json` — cold-start snapshot tier
- `server/routes/water.ts` — Redis → devFileCache → snapshot → Overpass read ladder; `water:facilities:v3` key

### Contract surfaces (must stay green, D-11)

- `docs/architecture/redis-keys.md` — 32-key registry; key-bump entry
- `src/__tests__/lib/redis-registry.test.ts` — mechanical drift gate
- `CLAUDE.md` §Serverless Cache — `water:facilities:v3` registry line

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `byTypeRejections` 8-bucket per-query telemetry already exists and is initialized to zeros per facility-type query — the diagnosis needs zero new instrumentation unless collapse-pair detail is required (D-13)
- `npm run refresh:water` already prints full `WaterFilterStats` and atomically writes the snapshot (tmp + rename) — it is the diagnosis tool AND the snapshot regenerator
- `computeAdmissionDecision` consolidates all rejection branches into one ordered function — any non-dedup fix lands there with a bucket name attached
- `haversine` helper already in the adapter for the 50m comparison

### Established Patterns

- Fail-loud, serve-snapshot contract: Overpass is never on the synchronous request path; only `refresh:water` and the gated `?refresh=true` invoke `fetchWaterFacilities`
- Lock-step schema tests: every `WaterFilterStats` shape change pairs with `waterFilterStats.test.ts` in the same commit (Phase 27.3.2 D-04 precedent)
- Mechanical drift gates: Redis key renames fail `redis-registry.test.ts` until registry + docs update together

### Integration Points

- Dedup loop: `server/adapters/overpass-water.ts` `fetchWaterFacilities`, after OSM-ID dedup, before `byCountry` tally — collapse fix changes `duplicate` bucket counts that `byCountry` and `scoreHistogram` consume downstream
- `water:facilities:v3` key read by 5 modules + pinned by 3 test files (full list in D-10)

</code_context>

<specifics>
## Specific Ideas

- Roadmap names the prime suspect explicitly: "O(n²) spatial dedup keyed on `facilityType` only" — the discussion pre-registered the name-aware dedup fix against it, gated on diagnosis confirmation (D-03)
- "Intermittently" is the key symptom: the survivor of a collapse depends on Overpass return order, so which facility disappears varies run-to-run — determinism (D-07/D-08) is as much the fix as the name-awareness

</specifics>

<deferred>
## Deferred Ideas

- Water-subtab readability (counts display, rejection-bucket visualization polish) — Phase 45 (DASH-READ)
- O(n²) dedup performance optimization as its own concern — only touch if incidental to the fix (Claude's discretion); otherwise leave for a future hardening pass

### Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md` — matched only on generic keyword "phase" (score 0.6); CI health is unrelated to water filtering. Deferred — candidate for Phase 46 (General Hardening) review.
- `phase-27.4.3-deckgl-v9-type-drift.md` — matched only on generic keyword "phase" (score 0.6); deck.gl type drift is unrelated. Deferred — candidate for Phase 46 review.
- (Deviation note: auto-mode rule says fold score ≥ 0.4, but both matches are keyword-noise with no scope overlap — folding them would violate the phase boundary, so they were reviewed-not-folded.)

</deferred>

---

_Phase: 42-Water Filter Fix_
_Context gathered: 2026-06-09_
