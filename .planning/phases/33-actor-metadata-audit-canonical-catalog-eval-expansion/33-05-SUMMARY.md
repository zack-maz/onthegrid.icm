---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 05
subsystem: llm-eval-harness
tags: [actor-metadata, eval, ground-truth, adversarial, fixture, actorMatchRate]
dependency-graph:
  requires:
    - 33-04 # canonicalized events:llm:v3 cache writes that the eval reads
  provides:
    - EvalScore.actorMatchRate field (0..1) — second-pass actor-match dimension
    - LLMRunSummary.evalScore.actorMatchRate? mirror — cold-start dashboard reads
    - ground-truth-events.json expectedActor1/2 fields (50/50 backfilled)
    - adversarial-injections.json adv-011..adv-013 actor-confusion injections
  affects:
    - events:llm-eval-baseline:v3 Redis key now carries actorMatchRate alongside geocode buckets
    - server/routes/cron-health.ts daily runEval() invocation surfaces the new dimension
tech-stack:
  added: []
  patterns:
    - Phase 27.4 D-25 resolver-only invariant — eval reads cache via cacheGetSafe, NEVER re-extracts via LLM
    - Open Q §4 path c — landmark+country substring join (synthetic gt-NNN id is NOT joinable to live groupKey)
    - Additive-optional schema extension — pre-Phase-33 readers parse unchanged
    - Degrade-open — try/catch around cacheGetSafe; Redis failure → actorMatchRate=0 + warn log, never throws
key-files:
  created:
    - server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts
  modified:
    - server/lib/llmEvalHarness.ts
    - server/lib/llmProgress.ts
    - .planning/eval/ground-truth-events.json
    - .planning/eval/adversarial-injections.json
    - server/__tests__/lib/llmEvalHarness.test.ts
    - server/__tests__/lib/llmEvalHarness.adversarial.test.ts
key-decisions:
  - D-13 — actorMatchRate computed by case-insensitive substring AND-match against LIVE events:llm:v3 cache; landmark+country substring join (Open Q §4 path c)
  - D-14 — backfill 50/50 of GT events with non-null expectedActor1 (target ≥30; war-window source attribution was unambiguous for every entry)
  - D-15 — append 3 actor-confusion injections (adv-011 side-swap, adv-012 ambiguity, adv-013 code-as-actor); total fixture grew 10 → 13 (Open Q §5 soft cap-bump)
  - AND-precedence for expectedActor1 + expectedActor2 — both must be present in candidate's actors[] for a match (Discretion §4; adjustable per future audit)
  - actorMatchRate added to EvalScore as REQUIRED (not optional) — runtime invariant; mirror at LLMRunSummary.evalScore.actorMatchRate is OPTIONAL for forward-compat
requirements-completed: [ACTOR-04]
metrics:
  duration: '~10 min'
  completed: '2026-05-21'
  tasks: 3
  files: 7
  commits: 4
---

# Phase 33 Plan 05: Eval Harness actorMatchRate + Fixture Extensions Summary

`runEval()` now scores actor-attribution accuracy alongside the existing geocode-resolver buckets, reading the LIVE `events:llm:v3` cache to score canonical actor names against ground-truth `expectedActor1` / `expectedActor2`. Ground-truth fixture backfilled 50/50; adversarial fixture extended with 3 actor-confusion injections. Resolver-only invariant (Phase 27.4 D-25) preserved — zero new LLM calls, zero new resolveLocation calls in the second pass.

## What landed

### `EvalScore.actorMatchRate` (D-13)

`server/lib/llmEvalHarness.ts:136-155` — required field on the score object, range `0..1`:

- **Second pass** runs AFTER the existing geocode-resolver loop in `runEval()`.
- **Live cache read** via `cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999)` — single Redis GET, never throws.
- **Join strategy (Open Q §4 path c)** — for each ground-truth event with non-null `expectedActor1`, filter live cache to events whose `label` contains case-insensitive substring of BOTH `hierarchy.landmark` (when non-empty) AND `hierarchy.country`. The synthetic `gt-NNN` id has no relationship to the live GDELT-derived `groupKey`; direct id-join is broken-by-design.
- **Scoring** — for each filtered candidate, AND-match: `actors[].some(a => a.includes(expectedActor1.toLowerCase()))` AND `(expectedActor2 === null OR similar match)`. Count once per ground-truth event when any candidate matches; rate = matched / total-with-expectedActor1.
- **Degrade-open** — try/catch around `cacheGetSafe`; Redis failure produces `actorMatchRate = 0` plus a warn log; never poisons the geocode buckets.

### `LLMRunSummary.evalScore.actorMatchRate?` mirror (D-13 forward-compat)

`server/lib/llmProgress.ts:114-124` (live) + `server/lib/llmProgress.ts:278-289` (summary) — optional `actorMatchRate?: number` field on the `evalScore` object inside both `LLMPipelineProgress` and `LLMRunSummary`. Pre-Phase-33 readers ignore the new field; Phase 33+ DevApiStatus consumers read it from the persisted cold-start summary.

### Ground-truth fixture backfill (D-14)

`.planning/eval/ground-truth-events.json` — additive extension; `version` unchanged at `1`:

- **50/50 events carry non-null `expectedActor1`** (target was ≥30; the war-window source attribution was unambiguous for every entry, so the floor over-shot).
- **`expectedActor2`** populated when the source names a second actor (e.g. `gt-001` Natanz: `expectedActor1 = "Israeli Defense Forces"` + `expectedActor2 = "Islamic Revolutionary Guard Corps"`); `null` otherwise.
- **Canonical names sourced verbatim from `server/data/actor-catalog.ts ACTOR_CATALOG`** — "Israeli Defense Forces", "Islamic Revolutionary Guard Corps", "US Armed Forces", "Hezbollah", "Houthis", "Iranian Armed Forces", "Popular Mobilization Forces", "Kataib Hezbollah", "Peshmerga", "US Central Command", "US Navy", "IRGC Quds Force". Case-insensitive substring AND-match in `runEval` tolerates both pre-mapped raw codes and post-mapped canonical names in the live cache.
- **`curationNotes`** appended with a Phase 33 rationale bullet documenting source + canonical-name policy.

### Adversarial fixture extension (D-15)

`.planning/eval/adversarial-injections.json` — three new entries appended; total 10 → 13:

| ID        | Category                        | Probes                                                                                                                                                                                                         |
| --------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adv-011` | `actor-confusion-side-swap`     | Headline phrased so attacker ↔ victim are inverted (Hezbollah does not operate aircraft strikes on Israeli soil). Extractor should NOT confidently swap sides.                                                 |
| `adv-012` | `actor-confusion-ambiguity`     | Source carries only generic pronouns ("the forces", "the troops", "they"). Extractor should mark `actorConfidence=low` rather than fabricating a confident attribution.                                        |
| `adv-013` | `actor-confusion-code-as-actor` | Raw CAMEO actor codes (USMIL / IRNMIL / ISRMIL) injected as actor names. Plan 33-04 server-side post-mapping must canonicalize these to "US Armed Forces" / "Iranian Armed Forces" / "Israeli Defense Forces". |

**Open Q §5 cap-bump (10 → 13):** 33-CONTEXT.md D-15 said "under 10 total entries"; 33-RESEARCH.md Open Q §5 resolved the conflict by soft-bumping the cap to 13 with this summary documenting the rationale. Three additions are the minimum needed to exercise the new Plan 33-04 catalog + actorConfidence repair surface.

### Test surfaces

**New file:**

- `server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts` — fixture-shape contract test:
  - `≥30 of 50 events have non-null expectedActor1` (D-14 target floor)
  - `expectedActor1/2 are string|null|undefined` (additive-optional shape contract)
  - Pattern mirrors `llmEvalHarness.adversarial.test.ts:77-90` real on-disk JSON read + assertion idiom.

**Extended:**

- `server/__tests__/lib/llmEvalHarness.test.ts` gains a new describe block `'runEval — actorMatchRate (D-13)'` with 5 cases:
  - Return shape carries `actorMatchRate: number` in `[0, 1]`
  - AND-match — both expectedActor1 + expectedActor2 found → match
  - Empty GT with no expectedActor1 → `actorMatchRate = 0`
  - Baseline persistence to `events:llm-eval-baseline:v3` carries the new field
  - Degrade-open — `cacheGetSafe` rejection produces `actorMatchRate = 0`, never throws

- `server/__tests__/lib/llmEvalHarness.adversarial.test.ts` gains a new describe block `'Phase 33 adversarial — actor-confusion injections (D-15)'`:
  - `it.each` over `[adv-011, adv-012, adv-013]` × `[category]` — each parses + carries expected category
  - Total fixture entry count is exactly 13 (post-soft-bump assertion)
  - Pre-existing three tests rebased from `10` to `13` (Rule 3 deviation — see below)

## Decision-coverage trace

| Decision                    | Implementation site                                       | Test coverage                                        |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| D-13 actorMatchRate         | `server/lib/llmEvalHarness.ts` runEval() second pass      | `llmEvalHarness.test.ts` 5 cases                     |
| D-13 LLMRunSummary mirror   | `server/lib/llmProgress.ts` LLMRunSummary.evalScore       | type-checked via tsc                                 |
| D-14 ground-truth backfill  | `.planning/eval/ground-truth-events.json` additive fields | `groundTruthSchema.test.ts` ≥30 floor + shape        |
| D-15 adversarial injections | `.planning/eval/adversarial-injections.json` adv-011..013 | `llmEvalHarness.adversarial.test.ts` it.each + count |

## Resolver-only invariant verified

The new D-13 block contains **zero** `resolveLocation()` calls. Only `cacheGetSafe` reads. Acceptance grep `awk '/PHASE 33 D-13/,/actorMatchRate = actorTotal/' server/lib/llmEvalHarness.ts | grep -c "resolveLocation"` returns 1 — that match is a **comment** ("never calls resolveLocation"), not an invocation. Token spend remains zero.

## Critical risk #2 honored (PATTERNS join strategy)

`33-PATTERNS.md` flagged that ground-truth `id` is synthetic `gt-NNN` and is not joinable to live `groupKey`. The D-13 join uses Open Q §4 path c — landmark + country case-insensitive substring on the live entity's `label` field — exactly as the PATTERNS doc instructed. JSDoc on the new block records the rationale; the test fixture (`liveNatanzMatch.label = 'Natanz nuclear enrichment complex, Iran'`) demonstrates the join semantics.

## AND/OR precedence (Discretion §4)

Default precedence is **AND** — both `expectedActor1` AND `expectedActor2` must appear in a candidate's `actors[]` for a match (when `expectedActor2 !== null`). This is the conservative choice — false-positives would inflate `actorMatchRate` and mask regressions. Adjustable in future audit (Phase 35+ cleanup); the JSDoc on the EvalScore field documents the choice.

## Verification

| Step                                                           | Result                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npx vitest run server/__tests__/lib/llmEvalHarness.*.test.ts` | 33 tests / 3 files passed                                          |
| `npx vitest run server/__tests__/lib/llm`                      | 186 tests / 19 files passed                                        |
| `npx tsc --noEmit -p tsconfig.server.json`                     | 0 errors                                                           |
| Ground-truth backfill                                          | 50 of 50 events have `expectedActor1: string`                      |
| Adversarial fixture count                                      | 13 entries (adv-001..adv-013)                                      |
| Acceptance grep — `actorMatchRate` in llmEvalHarness.ts        | 6 occurrences (interface + computation + score literal + comments) |
| Acceptance grep — `LLM_EVENTS_KEY_ACTIVE` in llmEvalHarness.ts | 2 occurrences (import + usage)                                     |
| Acceptance grep — `resolveLocation` in new D-13 block          | 1 occurrence (comment only — confirmed)                            |

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — blocking)

**1. [Rule 3 — Blocking] Pre-existing adversarial-test hard-coded counts at 10**

- **Found during:** Task 2 (immediately after writing the new 13-entry fixture).
- **Issue:** Three pre-existing assertions in `server/__tests__/lib/llmEvalHarness.adversarial.test.ts` had `expect(result.total).toBe(10)` / `expect(result.blocked).toBe(10)` / `expect(result.blocked).toBeLessThan(10)`. The D-15 soft cap-bump (10 → 13) made them fail RED.
- **Fix:** Updated the three assertions to `13` (Test 2 + Test 3) and `< 13` (Test 3b). Added inline comments referencing "Phase 33 D-15 cap-bump" so future readers see the link to the new fixture shape rather than treating `13` as a magic number.
- **Files modified:** `server/__tests__/lib/llmEvalHarness.adversarial.test.ts`
- **Commit:** `7d9e3ca` (`test(33-05): update pre-existing adversarial tests for 13-entry fixture (Rule 3 deviation)`)

**2. [Rule 3 — Blocking] Pre-existing null-fixture test expected geocode-only shape**

- **Found during:** Task 3 (immediately after extending EvalScore).
- **Issue:** `runEval with no ground-truth available > returns zero totals` used `toEqual({within5km:0,within20km:0,within100km:0,total:0})` — a strict-equal that excludes the new `actorMatchRate` field. The D-13 change adds `actorMatchRate=0` to the null-fixture zero shape, so the assertion fails RED.
- **Fix:** Update the `toEqual` to include `actorMatchRate: 0` and update the matching `updateProgress` `evalScore` shape assertion. Inline comment notes the Phase 33 D-13 extension.
- **Files modified:** `server/__tests__/lib/llmEvalHarness.test.ts`
- **Commit:** `43a6ddc` (folded into Task 3 commit because the test fix is inseparable from the D-13 interface change)

### Auto-added Functionality

**3. [Rule 2 — Critical] `expectedActor1` / `expectedActor2` typing on `GroundTruthEvent` interface**

- **Found during:** Task 3 (implementation step).
- **Issue:** The new D-13 block reads `gtEvent.expectedActor1` and `gtEvent.expectedActor2`, but the `GroundTruthEvent` interface did not declare those fields. TypeScript strict mode would flag the property access. Inline `gtEvent as { expectedActor1?: string | null }` casts would work but pollute the runtime code with type assertions where additive interface extension is cleaner.
- **Fix:** Added `expectedActor1?: string | null` and `expectedActor2?: string | null` as additive-optional fields on the interface. JSDoc references Phase 33 D-14 + the actor-catalog source.
- **Files modified:** `server/lib/llmEvalHarness.ts` (interface declaration)
- **Commit:** `43a6ddc` (folded into Task 3 commit — interface and implementation co-located)

## Known Stubs

None. All paths fully wired:

- `actorMatchRate` is sourced from a real second-pass over `events:llm:v3` (the cron-written live cache).
- The mirror field at `LLMRunSummary.evalScore.actorMatchRate?` is read by `buildSummary()` → `/api/events/llm-status` → DevApiStatus (the consumer is already in place; the field is propagated through the existing pipeline).
- Ground-truth and adversarial fixtures carry real data (not placeholder text).

Note: the cron-driven `runEval` invocation at `server/routes/cron-health.ts` already calls `runEval()` daily — no additional wiring needed. The next 04:00 UTC tick (or `?force=true`) will produce a baseline carrying `actorMatchRate` for the first time. Until the next cron tick the field is absent from `events:llm-eval-baseline:v3` (pre-Phase-33 baselines have no `actorMatchRate`); operators inspecting the Redis key immediately post-merge will see the old shape, which is by design (the persisted baseline updates only on writes, never on reads).

## Self-Check: PASSED

All 8 claimed files exist on disk; all 4 claimed commit hashes are reachable from HEAD on `worktree-agent-af491a153d1945d5d` (descendant of `feature/33-actor-metadata-audit-canonical-catalog-eval-expansion`).
