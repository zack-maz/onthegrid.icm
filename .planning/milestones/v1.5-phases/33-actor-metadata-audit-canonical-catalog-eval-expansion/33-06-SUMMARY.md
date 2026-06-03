---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 06
subsystem: operator-status-aggregator
tags: [actor-metadata, operator-status, aggregator, dashboard-backend, observability]
requires:
  - 33-01 (server/lib/actorClassifier.ts — classifyEventActors)
  - 33-04 (events:llm:v3 actorConfidence repair — surfaces 'low' field this block reads)
provides:
  - /api/operator-status `actorQuality` block (D-16) — bucket counts + capped sample + degrade-open
affects:
  - server/routes/operator-status.ts (modified)
  - server/routes/__tests__/operator-status.test.ts (extended)
tech-stack:
  added: []
  patterns:
    - INLINE_CAMEO_CODES — module-scope ReadonlySet<string> subset (avoids .planning/ runtime read)
    - Lazy aggregator compute over already-deserialized payload (zero new Redis sidecars)
    - try/catch degrade-open block per Phase 32 D-13 pattern
    - Sample issue priority order (null > raw-cameo > ambiguous > low-confidence)
key-files:
  created:
    - .planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/deferred-items.md
  modified:
    - server/routes/operator-status.ts
    - server/routes/__tests__/operator-status.test.ts
decisions:
  - D-16 shape verbatim wired through: totalEvents, nullActors, rawCameoActors, ambiguousActors, lowConfidenceActors, sample[]
  - LIMIT_DRILL_DOWN (20) reused for sample cap — no new constant introduced
  - INLINE_CAMEO_CODES inline subset (29 codes) instead of runtime .planning/ disk read
  - Cache miss (null) returns actorQuality: null (NOT empty block with zeros) — preserves T-33-05b degrade-open semantic
metrics:
  duration: 1h
  tasks_completed: 2
  commits: 2
  date_completed: 2026-05-21T20:28:08Z
requirements:
  - ACTOR-05 (server-side)
---

# Phase 33 Plan 06: operator-status actorQuality block (D-16) — Summary

`/api/operator-status` now surfaces a top-level `actorQuality` block computed lazily over the already-deserialized `events:llm:v3` payload, reusing the shared `classifyEventActors` helper from Plan 33-01 for byte-identical bucket counts vs the committed audit report.

## What was built

### server/routes/operator-status.ts (modified)

- **Imports added (4):** `classifyEventActors` (from `../lib/actorClassifier.js`), `LLM_EVENTS_KEY_ACTIVE` (from `../lib/llmExtractionPipeline.js`), `ConflictEventEntity` type (from `../types.js`). The pre-existing `cacheGetSafe` import was reused.
- **`INLINE_CAMEO_CODES`** — module-scope `ReadonlySet<string>` carrying **29 codes**:
  - **Country-military (12):** `ISRMIL`, `IRNMIL`, `USAMIL`, `USMIL`, `RUSMIL`, `SAUMIL`, `TURMIL`, `SYRMIL`, `LBNMIL`, `EGYMIL`, `JORMIL`, `IRQMIL`
  - **Country generics (11):** `ISR`, `IRN`, `USA`, `RUS`, `SAU`, `TUR`, `SYR`, `LBN`, `PSE`, `YEM`, `IRQ`
  - **Class / role codes (6):** `REB`, `INS`, `MIL`, `GOV`, `COP`, `OPP`
- **`ActorQualityBlock` interface** — D-16 shape verbatim: `totalEvents`, `nullActors`, `rawCameoActors`, `ambiguousActors`, `lowConfidenceActors`, plus `sample[]` capped at 20 with per-entry `{eventId, actors, actorConfidence, issue}`.
- **Block computation** — single `cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999)` call wrapped in try/catch. For each entity: read `actors` + `actorConfidence`, classify via `classifyEventActors(actors, INLINE_CAMEO_CODES)`, increment bucket counters, assign `firstIssue` per priority order (`null > raw-cameo > ambiguous > low-confidence`), push to sample if under `LIMIT_DRILL_DOWN`.
- **`res.json` extended:** `{ audit24h, byBearer, advEval, prune, actorQuality }`.

### server/routes/**tests**/operator-status.test.ts (extended)

New `describe('/api/operator-status — Phase 33 Plan 06 actorQuality block (D-16)')` block with **6 cases**:

1. Shape + computed counts when `events:llm:v3` cache populated (mixed buckets)
2. `sample[]` cap = `LIMIT_DRILL_DOWN` (20) when more issues exist
3. Sample entry shape verification (`eventId`, `actors`, `actorConfidence`, `issue` ∈ union of 4)
4. **Degrade-open: `cacheGetSafe` throws → `actorQuality === null`, route 200** (T-33-05b)
5. **Degrade-open: `cacheGetSafe` returns null → `actorQuality === null`, route 200** (cache miss semantic)
6. `lowConfidenceActors` increments per event whose `actorConfidence` carries any `'low'`

All 6 cases pass against the implementation. Pre-existing 14 tests in the suite remain unchanged.

## INLINE_CAMEO_CODES — 29 codes shipped

Rationale: covers ~80% of the country-military and class-code raw CAMEO actors that the audit script (Plan 33-01) is most likely to surface for the Iran-conflict corpus. Drift between this subset and the committed `cameo-codes.json` (Plan 33-02) is acceptable per D-16: counts here are observability surface, not enforcement. The audit script remains the canonical full-codebook consumer (runs locally with the `.planning/` directory available).

## Confirmation: zero new Redis SCANs / sidecars

- **No new Redis SCAN** introduced in the Phase 33 block. The pre-existing prune-block SCAN over `events:url-liveness:*` is unchanged.
- **No new Redis sidecar key.** All computation is in-memory over the already-deserialized `events:llm:v3` payload — one `cacheGetSafe` call.
- **No new Redis writes.** Read-only contract preserved (anti-pattern #17).
- **Does the actorQuality block share a `cacheGetSafe` call with another block?** No. The prune block does not read `events:llm:v3`; it only reads `events:url-liveness-count` and SCANs `events:url-liveness:*`. The Phase 33 block makes its own (single) `cacheGetSafe(LLM_EVENTS_KEY_ACTIVE)` call. This is the minimum-coupling choice — the prune block stays single-purpose.

## Degrade-open contract verified (T-33-05b)

Two test cases pin the degrade-open contract:

- `cacheGetSafe` **throws** (mocked) → catch block fires → `log.warn` → `actorQuality = null` → response 200.
- `cacheGetSafe` **returns null** (cache miss; the production semantic for empty Upstash + empty memCache) → conditional `if (cached?.data)` short-circuits → `actorQuality` left at its declared `null` value → response 200.

The dashboard render contract (Plan 33-07) distinguishes "no data" (`actorQuality === null`, render placeholder) from "healthy empty cache" (`actorQuality.totalEvents === 0`, render zeros). The current implementation deliberately collapses both into `null` because in practice the `events:llm:v3` cache is either populated or fully absent — there is no legitimate "populated but empty array" path post-Phase-29 cron-only writer narrowing.

## Sample[] cap verified

Test case 2 feeds 30 events all in bucket (a), asserts:

- `actorQuality.sample.length === 20` (cap enforced)
- `actorQuality.nullActors === 30` (counters NOT capped — full count regardless of sample size)
- `actorQuality.totalEvents === 30`

This matches the D-16 contract: counters are global, sample is the drill-down slice.

## Decision-coverage trace

| Decision                                   | Implementation site                                                            | Test pin                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| D-16 shape (6 fields incl. sample)         | `ActorQualityBlock` interface + counter increments + `res.json` extension      | Test 1 (shape), Test 3 (sample entry shape)                                              |
| Lazy compute, zero new sidecars            | Single `cacheGetSafe<ConflictEventEntity[]>` call wrapped in try/catch         | All 6 tests verify single `cacheGetSafe` mock interaction with `key === 'events:llm:v3'` |
| Sample cap = `LIMIT_DRILL_DOWN` (20)       | `if (firstIssue && sample.length < LIMIT_DRILL_DOWN)` guard                    | Test 2                                                                                   |
| Degrade-open T-33-05b                      | Outer try/catch + `cached?.data` short-circuit + initial `actorQuality = null` | Tests 4 + 5                                                                              |
| Pitfall §1 dedup (shared classifier)       | Imports + invokes `classifyEventActors` from `server/lib/actorClassifier.ts`   | Compile-time + Test 1 bucket counts agree with classifier's deterministic rules          |
| PATTERNS critical risk #3 (CAMEO bundling) | `INLINE_CAMEO_CODES` module-scope const, NOT `.planning/` runtime read         | Test 1 (uses 'ISRMIL' → bucket-b hit)                                                    |
| Anti-pattern #17 (no writes)               | Block is read-only; no `redis.set/sadd/incr` introduced                        | TypeScript + manual code review                                                          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan referenced wrong test path; existing test file lives at `server/routes/__tests__/` not `server/__tests__/routes/`**

- **Found during:** Task 1 setup (PLAN.md `<files>` declares `server/__tests__/routes/operator-status.test.ts`; that path does not exist, but `server/routes/__tests__/operator-status.test.ts` exists and is the file imported / referenced by the rest of the codebase since Phase 28.2).
- **Fix:** Extended the existing `server/routes/__tests__/operator-status.test.ts` instead. All grep-based acceptance criteria still pass (they target the file content, not the path).
- **Files modified:** `server/routes/__tests__/operator-status.test.ts`
- **Commit:** `33efc18`

### Out-of-scope (deferred)

**Pre-existing flake in Phase 32 prune-block SCAN budget test** — `prune.deadUrlSample: short-circuits SCAN at MAX_SCAN_KEYS=200 to bound budget` asserts `scannedKeysTotal ≤ 200`, observed `201`. Off-by-one in `buildDeadUrlSample` SCAN loop (Phase 32 Plan 04 surface). Logged at `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/deferred-items.md`. **Not fixed by Plan 33-06** per scope boundary rule.

## Verification

- `npx vitest run server/routes/__tests__/operator-status.test.ts -t "Phase 33"` → 6 passed (all Phase 33 cases GREEN)
- `npx vitest run server/__tests__/routes server/routes/__tests__` → 200 passed, 1 failed (pre-existing Phase 32 flake, out of scope)
- `npx tsc --noEmit -p tsconfig.server.json` → clean (no errors introduced)

## Commits

| Commit  | Type | Message                                                             |
| ------- | ---- | ------------------------------------------------------------------- |
| 33efc18 | test | add failing tests for /api/operator-status actorQuality block (RED) |
| 3aa6072 | feat | operator-status surfaces actorQuality block (D-16) — GREEN          |

## Known Stubs

None — implementation is complete. INLINE_CAMEO_CODES is the only "static subset" surface; it is documented inline as observability-not-enforcement per D-16.

## Self-Check: PASSED

- `server/routes/operator-status.ts` — modified, present (10708 bytes; ActorQualityBlock interface + INLINE_CAMEO_CODES + computation block present)
- `server/routes/__tests__/operator-status.test.ts` — modified, present (Phase 33 describe block present, 6 it() cases)
- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/deferred-items.md` — created
- Commit `33efc18` (test RED) — in `git log`
- Commit `3aa6072` (feat GREEN) — in `git log`
- All 6 Phase 33 actorQuality test cases pass on the implementation HEAD
