---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 03
subsystem: schema
tags: [actor-metadata, schema, zod, json-schema, d-10, d-12]
requires: [33-01, 33-02]
provides:
  - enrichedEventV3-actorConfidence-zod-field
  - EVENT_EXTRACTION_SCHEMA_V3-unaliased
  - V3-actorConfidence-wire-required
affects:
  - server/lib/llmEventExtractor.v3.ts (consumer in Plan 33-04 — schema surface ready)
  - enrichedEventAny-discriminated-union (cache-read forward-compat)
tech-stack:
  added: []
  patterns:
    - zod-extend-with-optional-field-for-rollout-forward-compat
    - json-schema-un-alias-with-jsdoc-divergence-pinning
key-files:
  created: []
  modified:
    - server/lib/llmSchema.ts
    - server/__tests__/lib/llmSchema.test.ts
key-decisions:
  - "D-10: actorConfidence ships as z.array(z.enum(['high','medium','low'])).optional() — rollout-window forward-compat via .optional() preserves legacy v3 cache reads through enrichedEventAny (Open Q §1 resolution)"
  - 'D-12: EVENT_EXTRACTION_SCHEMA_V3 un-aliased from V2 — declared as its own object literal (copy + actorConfidence additions) with JSDoc pinning v2/v3 divergence (Open Q §3 resolution)'
  - "Open Q §2: actorConfidence is required at the JSON Schema wire level (LLM forcing-function value); server-side repairActorConfidence in Plan 33-04 fills missing/wrong-length entries with 'low' as defense-in-depth"
  - 'Cross-field length-match invariant (arr.length === actors.length) enforced in EXTRACTOR (Plan 33-04 repairActorConfidence), NOT in Zod superRefine — Zod cannot cross-field-refine without re-asserting parent shape, complicating the discriminated-union cache read'
  - 'Atomic commit grouping: D-10 (Zod extend) + D-12 (JSON Schema un-alias) shipped as TWO separate commits (RED-then-GREEN TDD discipline) rather than one — preserves the failing-test-first signal even though both decisions touch the same file slice. Plan output spec was "could be one or two commits"; chose two for TDD clarity.'
requirements-completed: [ACTOR-03]
metrics:
  duration: '4 min 5 sec'
  completed: '2026-05-21'
  tasks_completed: 2
  files_modified: 2
  commits: 2
---

# Phase 33 Plan 03: enrichedEventV3 actorConfidence + un-aliased EVENT_EXTRACTION_SCHEMA_V3 Summary

Extended the v3 schema surface with `actorConfidence` (parallel array, `'high'|'medium'|'low'`) and un-aliased the JSON Schema wire contract from V2 — establishing the schema-side foundation that Plan 33-04 (extractor integration) will write against. Shipped `.optional()` Zod field + wire-required JSON Schema field as defense-in-depth pair.

## Tasks Completed

| Task | Name                                                                 | Type      | Commit    | Files Modified                           |
| ---- | -------------------------------------------------------------------- | --------- | --------- | ---------------------------------------- |
| 1    | Add failing schema-acceptance tests (RED)                            | TDD-RED   | `d6c1ec0` | `server/__tests__/lib/llmSchema.test.ts` |
| 2    | Extend enrichedEventV3 + un-alias EVENT_EXTRACTION_SCHEMA_V3 (GREEN) | TDD-GREEN | `bc2d3ed` | `server/lib/llmSchema.ts`                |

## Decision Coverage Trace

| Decision                                       | Resolution                                                                                                                                        | Evidence                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **D-10** (Zod extend)                          | `actorConfidence: z.array(z.enum(['high','medium','low'])).optional()` added to `enrichedEventV3`                                                 | `server/lib/llmSchema.ts:193-198`                                                                        |
| **D-12** (JSON Schema un-alias)                | `EVENT_EXTRACTION_SCHEMA_V3` declared as its own object literal copying V2 + actorConfidence additions; JSDoc pins v2/v3 divergence               | `server/lib/llmSchema.ts:368-468`                                                                        |
| **Open Q §1** (rollout `.optional()`)          | `.optional()` shipped on the Zod field so legacy v3 cache entries continue to parse via `enrichedEventAny` during the 24h forward-rollover window | Test `'accepts payload WITHOUT actorConfidence (rollout-window forward-compat)'` passes                  |
| **Open Q §2** (wire-required vs server-repair) | Required at wire level (LLM forcing function); server-side `repairActorConfidence` in Plan 33-04 fills missing/wrong-length as defense-in-depth   | V3 JSON Schema `required[]` includes `'actorConfidence'`; JSDoc on V3 literal references the repair hook |
| **Open Q §3** (un-aliasing JSDoc)              | New V3 literal carries JSDoc explaining future V2 changes do NOT auto-propagate; contract test asserts `V3 !== V2` referentially                  | Test `'is un-aliased from V2 (Open Q §3)'` passes                                                        |

## Verification Results

| Check                                                                       | Result                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npx vitest run server/__tests__/lib/llmSchema.test.ts`                     | **31/31 passed** (4 new Phase 33 tests, all 27 pre-existing tests still pass)                          |
| `npx vitest run server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts` | **9/9 passed** (no regression from V3 schema un-alias)                                                 |
| `npx tsc --noEmit -p tsconfig.server.json`                                  | EXIT=0 (no new TS errors)                                                                              |
| V2 literal byte-frozen (no `actorConfidence` leak)                          | `awk '/EVENT_EXTRACTION_SCHEMA_V2/,/^};/' \| grep -c actorConfidence` = **0**                          |
| V3 literal carries `actorConfidence`                                        | `awk '/EVENT_EXTRACTION_SCHEMA_V3/,/^};/' \| grep -c actorConfidence` = **2** (properties + required)  |
| `enrichedEventAny` admits legacy v3 (no actorConfidence)                    | Test `'admits legacy v3 payload (no actorConfidence) via enrichedEventAny discriminated union'` passes |
| JSDoc divergence pinning present                                            | `grep -Ec "v3 diverged from v2\|FUTURE v2 SCHEMA CHANGES DO NOT\|AUTO-PROPAGATE"` = **2**              |
| JSDoc length-match deferral to extractor present                            | `grep -Ec "repairActorConfidence\|length-match\|cross-field"` = **5**                                  |

## Length-Refinement Implementation Strategy Chosen

The plan explicitly directs the length-match invariant (`actorConfidence.length === actors.length`) to be enforced in the **EXTRACTOR** (`repairActorConfidence` helper in `server/lib/llmEventExtractor.v3.ts`, Plan 33-04) — **NOT** in a Zod `.superRefine()`. Rationale documented in JSDoc above `enrichedEventV3`:

> Zod cannot cross-field-refine without re-asserting the parent shape, which complicates the discriminated-union cache-read surface. Server-side repair fills missing/wrong-length entries with `'low'` defaults before the cache write so post-Phase-33 entries always carry valid data.

This intentionally defers cross-field validation to Plan 33-04. No `.superRefine()` was added to the Zod schema in this plan — the schema accepts any-length `actorConfidence` array (or none, due to `.optional()`); the extractor is responsible for normalizing to the correct length.

## Legacy-v3-Payload-Parse Test Result

A dedicated test was added to confirm forward-compat:

```ts
it('admits legacy v3 payload (no actorConfidence) via enrichedEventAny discriminated union', () => {
  const payload = validV3Payload();
  // intentionally no actorConfidence — represents legacy pre-Phase-33 cache entry
  const result = enrichedEventAny.safeParse(payload);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.schemaVersion).toBe('v3');
  }
});
```

**Result: PASSED.** Legacy v3 cache entries (pre-Phase-33, without `actorConfidence`) continue to parse correctly through `enrichedEventAny` — the daily cron's prior-snapshot read in `llmEventExtractor.v3.ts` will not break during the 24h forward-rollover window. This is the primary mitigation for threat **T-33-04** (cache-read tampering / integrity).

## Atomic Commit Strategy

The plan's `<output>` block noted the Wave 2 grouping permitted either one or two commits for D-10 + D-12. **Chose two atomic commits** (`test(33-03):` RED + `feat(33-03):` GREEN) rather than one combined commit, for two reasons:

1. **TDD-RED gate visibility:** A single combined commit would mask the failing-test-first signal. Future bisects could miss "this test should have failed before the schema extension landed."
2. **Per-D-N atomic discipline (D-20):** The CLAUDE.md commit convention prefers atomic per-decision commits with conventional-commit prefixes. RED-GREEN-per-feature is a finer-grained TDD-native variant of the same discipline.

Both commits sit on the same file slice (`server/lib/llmSchema.ts` + its test) and land in the same Wave 2 batch — atomic from the wave-level merge perspective, RED→GREEN-atomic from the TDD-discipline perspective.

## Schema Drift Watch (for follow-up phases)

The new V3 JSON Schema literal is **divergent from V2 starting at this commit**. Two drift-risk vectors to watch:

1. **Accidental re-aliasing.** If a future cleanup phase reverts `EVENT_EXTRACTION_SCHEMA_V3` to `= EVENT_EXTRACTION_SCHEMA_V2`, the V3-only `actorConfidence` field would silently disappear from the LLM wire contract. **Mitigation in place:** contract test `'is un-aliased from V2 (Open Q §3)'` asserts `V3 !== V2` referentially — would fail loudly.
2. **V2 changes silently failing to propagate.** If V2 ever changes (currently frozen post-Phase-29 SIMPLIFY-06 per the JSDoc note), the V3 literal will NOT auto-update. **Mitigation in place:** JSDoc on the V3 literal explicitly states "FUTURE v2 SCHEMA CHANGES DO NOT AUTO-PROPAGATE — manually port the change here AND assert the divergence in the llmSchema.test.ts contract suite."

## Deviations from Plan

**None — plan executed exactly as written.**

One minor implementation-vs-plan acceptance-criterion reconciliation worth noting (not a deviation, but called out for completeness): the plan's acceptance criterion for Task 2 included this check:

```
awk '/EVENT_EXTRACTION_SCHEMA_V3/,/^};/' server/lib/llmSchema.ts | grep -c "'actorConfidence'" returns ≥ 2
  — once in properties, once in required
```

My implementation has `actorConfidence` once in the `properties` block (as a bare-identifier object key, unquoted — matching the V2 literal's style for sibling fields like `groupKey`, `location`, etc.) and once in the `required` string array (quoted, as `'actorConfidence'`). So the quoted-form count is **1**, but the structural-form count (property name + required entry, equivalent to the plan's intent) is **2**. The plan's editorial assumption that the property key would be quoted didn't match TypeScript-idiomatic JSON-Schema-as-TS-literal style (bare identifiers for object keys, string literals for array entries). Functionally equivalent — both occurrences are present.

## Known Stubs

None.

## Authentication Gates

None — this plan is pure type-system + JSON-Schema work, no auth-protected surface touched.

## Threat Flags

None beyond the threat model already declared in the plan (T-33-04 mitigated by `.optional()` Zod field; T-33-04b mitigated by JSDoc divergence pinning + contract test). Both mitigations are in place per `<threat_model>` plan.

## Self-Check

- [x] Files modified — both `server/lib/llmSchema.ts` and `server/__tests__/lib/llmSchema.test.ts` exist on disk and contain Phase 33 additions
- [x] Commits exist — `d6c1ec0` (RED) and `bc2d3ed` (GREEN) on branch `worktree-agent-a7ba0a11ad4ca2680`
- [x] All acceptance criteria from both tasks verified individually (see Verification Results table)
- [x] Plan-level verification passed (lint-style + tsc + V2 byte-frozen)
- [x] Threat model mitigations T-33-04 + T-33-04b in place
- [x] TDD discipline honored: RED commit precedes GREEN commit in `git log`

**Result: Plan ready for Plan 33-04 (extractor integration). Schema surface is the contract Plan 33-04 writes against.**

Next: Plan 33-04 (LLM extractor integration — D-08 server-side catalog mapping + D-09 prompt update + repairActorConfidence helper + Zod cache-read updates).
