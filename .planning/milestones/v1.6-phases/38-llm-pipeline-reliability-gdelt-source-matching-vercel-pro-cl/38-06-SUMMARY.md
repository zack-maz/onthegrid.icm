---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 06
subsystem: gdelt-event-matching
tags: [gdelt-match, dedup, corroboration, composite-score, corpus-quality, additive-rescore]
requires:
  - server/lib/eventGrouping.ts (groupGdeltRows, EventGroup)
  - server/lib/sourceTiers.ts (getSourceTier, getHighestTier, extractDomain)
  - server/lib/llmSchema.ts (enrichedEventV3, derivePrecision)
  - server/lib/eventScoring.ts (checkBellingcatCorroboration — the Phase-22 analog)
  - server/cache/redis.ts (cacheGetSafe — news:gdelt clusters)
  - server/types.ts (ConflictEventEntity, NewsCluster)
provides:
  - server/lib/eventGrouping.ts dedupHighConfidence (high-confidence pre-enrichment dedup)
  - server/lib/corroboration.ts checkCorroboration (generalized three-gate OSINT corroboration)
  - server/lib/relevanceScorer.ts computeCompositeScore (additive tier × corroboration × specificity)
  - enrichedEventV3.compositeScore (optional schema field)
  - server/routes/events.ts applyCompositeOrdering (additive non-mutating dashboard ordering)
affects:
  - dashboard event ordering (top-of-list now ranked by compositeScore)
  - LLM extraction pipeline (dedup runs before grouping; compositeScore stamped on enriched entities)
tech-stack:
  added: []
  patterns:
    - 'Conservative AND-gated dedup (Pitfall 6 — prefer under-collapse over wrong-merge)'
    - 'Generalized three-gate corroboration with STRICT keyword gate (specific actor/place tokens, generic stopwords excluded)'
    - 'Additive non-mutating rescore — compositeScore is a NEW optional field; raw corpus never re-written (D-07)'
    - 'Optional Zod field for forward-rollover (old cached events validate without compositeScore)'
key-files:
  created:
    - server/lib/corroboration.ts
    - server/__tests__/lib/corroboration.test.ts
    - server/__tests__/lib/eventGrouping.dedup.test.ts
  modified:
    - server/lib/eventGrouping.ts
    - server/lib/relevanceScorer.ts
    - server/lib/llmSchema.ts
    - server/lib/llmExtractionPipeline.ts
    - server/routes/events.ts
    - server/types.ts
    - server/__tests__/lib/relevanceScorer.test.ts
    - server/__tests__/lib/llmExtractionPipeline.test.ts
    - server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts
    - server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts
    - server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts
decisions:
  - 'Dedup thresholds sized off GDELT-MATCH-01 audit size-2 cohort: DEDUP_RADIUS_KM=5 (tighter than 50km batch radius), DEDUP_TITLE_JACCARD=0.85 — conservative end so the size 6–9 multi-strike tail is preserved'
  - 'Dedup AND-gate: order-independent actor pair AND CAMEO root AND day-bucket AND ≤5km AND title Jaccard ≥0.85; canonical row kept = highest (numMentions×10 + numSources)'
  - 'Dedup wired BEFORE groupGdeltRows in llmExtractionPipeline so it runs pre-enrichment (saves LLM tokens on redundant mentions); pure read-and-filter, never writes events:gdelt (D-07)'
  - 'Corroboration generalizes the Bellingcat three-gate verbatim (±24h temporal, 200km geo, ≥2 keyword) to any news:gdelt OSINT source; thresholds CONSERVATIVE pending re-validation against a populated news:gdelt (audit orphan baseline was an empty-cache artifact)'
  - 'Strict keyword gate: match set = actor names + specific location tokens minus a GENERIC_STOPWORDS set (iran/israel/us/strike/attack/war/...) so same-city-same-day coincidences cannot inflate the score (GDELT-MATCH-03 landmine)'
  - 'Corroboration boost weighted by tier: gold 0.25 / silver 0.15 / bronze 0.08 / unknown 0.05'
  - 'compositeScore = TIER_WEIGHT (gold 0.45 / silver 0.35 / bronze 0.22 / unknown 0.15) + PRECISION_WEIGHT (exact 0.30 / neighborhood 0.22 / city 0.15 / region 0.05) + corroborationBoost, clamped [0,1]. Unknown-tier keeps a non-zero floor because the audit showed 99.7% unknown-tier raw corpus — composite MUST NOT collapse to tier-dominance'
  - 'compositeScore added as .optional() on enrichedEventV3 so legacy v3 cache entries validate during the 24h–90d cron-overwrite window'
  - 'applyCompositeOrdering in events.ts read path: returns NEW shallow-copy array sorted by compositeScore desc (timestamp tiebreak) — additive, never re-writes events:llm:v3 (D-07)'
metrics:
  duration: ~12m
  completed: 2026-06-04
---

# Phase 38 Plan 06: GDELT-MATCH 02/03/04 — Dedup + Corroboration + Composite Rescore Summary

Conservative high-confidence dedup BEFORE LLM enrichment, generalized three-gate OSINT corroboration with a strict keyword gate, and an additive `compositeScore` (tier × corroboration × specificity) that re-orders the dashboard top-of-list WITHOUT mutating or dropping the raw corpus.

## What Was Built

### GDELT-MATCH-02 — high-confidence pre-enrichment dedup (`server/lib/eventGrouping.ts`)

- `dedupHighConfidence(entities)` — a DISTINCT, tighter pass separate from the coarse 50km `groupGdeltRows` batch-grouping (Pitfall 6: the 50km grouping is untouched). Collapses to one canonical row ONLY when a conservative AND-gate passes: order-independent actor pair AND CAMEO root AND day-bucket AND ≤`DEDUP_RADIUS_KM` (5km) AND title/notes token Jaccard ≥`DEDUP_TITLE_JACCARD` (0.85). The kept canonical row is the highest-weight mention (`numMentions×10 + numSources`).
- Wired BEFORE `groupGdeltRows` in `llmExtractionPipeline.ts` so it runs pre-enrichment. Pure read-and-filter — returns a new array, never mutates `merged` or the raw `events:gdelt` cache (D-07).
- Thresholds sized by the GDELT-MATCH-01 audit (38-03-SUMMARY): the size-2 cohort (81 of 134 clusters) is the conservative duplicate target; the size 6–9 long tail is preserved as likely-genuine multi-strike activity.

### GDELT-MATCH-03 — generalized three-gate OSINT corroboration (`server/lib/corroboration.ts`)

- `checkCorroboration(event, clusters)` — generalizes the Phase-22 Bellingcat three-gate (`checkBellingcatCorroboration`) from Bellingcat-specific to ANY tier-1/2/3 OSINT source in `news:gdelt`. ALL THREE gates must pass: temporal (±24h), geographic (≤200km haversine), and STRICT keyword (≥2 specific actor/place tokens, with a `GENERIC_STOPWORDS` set excluding iran/israel/us/strike/attack/war/... so same-city-same-day coincidences are withheld).
- Returns `{ corroborated, boost, tier }` — boost weighted by the corroborating source's tier (gold 0.25 / silver 0.15 / bronze 0.08 / unknown 0.05). Pure — no Redis, no mutation.

### GDELT-MATCH-04 — additive composite rescore (`relevanceScorer.ts` + `llmSchema.ts` + `events.ts`)

- `computeCompositeScore({ tier, corroborationBoost, precision })` — TIER_WEIGHT + PRECISION_WEIGHT + corroborationBoost, clamped [0,1]. Unknown-tier keeps a non-zero floor (0.15) per the audit's 99.7%-unknown finding.
- `compositeScore: z.number().min(0).max(1).optional()` added to `enrichedEventV3` so old cached events validate.
- `enrichedV3ToEntities` stamps `data.compositeScore` on each enriched entity (reading `news:gdelt` for the corroboration boost; best-effort — missing cache → boost 0).
- `applyCompositeOrdering` in the `events.ts` read path (`sendNormalizedEvents`) sorts a NEW shallow-copy array by `compositeScore` desc (timestamp tiebreak) — additive, never re-writes `events:llm:v3` (D-07).

## Thresholds Used (sourced from GDELT-MATCH-01 audit)

| Parameter                                           | Value                     | Source                                                                               |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Dedup geo radius                                    | 5 km                      | Audit conservative end (vs 50km batch radius)                                        |
| Dedup title Jaccard                                 | 0.85                      | Audit high-confidence floor; targets size-2 cohort                                   |
| Corroboration temporal window                       | ±24h                      | Phase-22 Bellingcat gate (conservative; needs re-validation vs populated news:gdelt) |
| Corroboration geo radius                            | 200 km                    | Phase-22 Bellingcat gate                                                             |
| Corroboration min keyword matches                   | 2 specific tokens         | Phase-22 gate + strict stopword exclusion                                            |
| Corroboration boost (gold/silver/bronze/unknown)    | 0.25 / 0.15 / 0.08 / 0.05 | Tier-weighted                                                                        |
| Composite tier weight (gold/silver/bronze/unknown)  | 0.45 / 0.35 / 0.22 / 0.15 | Unknown floor per 99.7%-unknown audit finding                                        |
| Composite precision weight (exact/nbhd/city/region) | 0.30 / 0.22 / 0.15 / 0.05 | Finer geography ranks higher                                                         |

**Re-validation note:** the corroboration thresholds and composite tier-distribution were sized against a CAVEATED audit (dev `news:gdelt` + `events:llm:v3` were empty at audit time — the 100% orphan rate was an empty-cache artifact). Re-run `npm run audit:gdelt` against a warm `news:gdelt` + `events:llm:v3` before any loosening.

## Additive / Non-Mutating Invariant (D-07)

- Dedup is a pre-enrichment filter that returns a new array and drops only collapse-targets — `grep -c "cacheSet\|redis.set" server/lib/eventGrouping.ts` → 0.
- `relevanceScorer.ts` has no cache writes — `grep -c "cacheSet\|redis.set"` → 0.
- `applyCompositeOrdering` builds shallow copies and sorts; the only `cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, ...)` in events.ts is the pre-existing dev-file-cache seed, NOT the ordering path.
- `compositeScore` is an OPTIONAL additive field — old cached events without it still validate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New `dedupHighConfidence` export broke 4 pipeline test mocks**

- **Found during:** Task 1 GREEN — wiring `dedupHighConfidence` into `llmExtractionPipeline.ts`.
- **Issue:** Four pipeline test files (`llmExtractionPipeline.test.ts`, `.crossBoundary`, `.incrementalWrite`, `.terminalShape`) `vi.mock('../../lib/eventGrouping.js')` exporting ONLY `groupGdeltRows`. The new `dedupHighConfidence` import resolved to `undefined`, threw inside the pipeline IIFE, and aborted before `processEventGroupsMock` was reached — 10 tests went red.
- **Fix:** Added `dedupHighConfidence: vi.fn((entities) => entities)` (identity pass-through) to all four mocks so the existing diff-filter/group-key assertions remain meaningful (the dedup pass itself is unit-tested in `eventGrouping.dedup.test.ts`).
- **Files modified:** the four pipeline test files.
- **Commit:** b4494d2.

## TDD Gate Compliance

- **GDELT-MATCH-02:** RED `test(38-06)` e00268e (dedupHighConfidence not a function) → GREEN `feat(38-06)` b4494d2 (5/5 dedup + 5/5 coarse-grouping pass). No refactor needed.
- **GDELT-MATCH-03/04:** RED `test(38-06)` 197c3be (corroboration module missing + computeCompositeScore missing) → GREEN `feat(38-06)` 2fb6c80 (28/28 corroboration + relevanceScorer pass). No refactor needed.

## Verification

- `npx vitest run server/__tests__/lib/eventGrouping.dedup.test.ts server/__tests__/lib/eventGrouping.test.ts` → 10 passed.
- `npx vitest run server/__tests__/lib/corroboration.test.ts server/__tests__/lib/relevanceScorer.test.ts` → 28 passed.
- `npx vitest run server/` → 112 files / 1340 tests passed (full server suite, no regressions).
- `npm run typecheck` → exit 0 (tsc -b clean + type-coverage 97.66%, above 97 floor).
- `npm run lint` → exit 0 (0 errors, 21 pre-existing warnings).
- Acceptance greps: dedup pre-pass present + GROUP_RADIUS_KM unchanged at 50; no `cacheSet`/`redis.set` in eventGrouping.ts or relevanceScorer.ts; corroboration shows all three gates with strict keyword set; `compositeScore` is `.optional()` in llmSchema.ts.

## Commits

- `e00268e` test(38-06): add failing high-confidence dedup pre-pass tests (GDELT-MATCH-02)
- `b4494d2` feat(38-06): high-confidence dedup pre-pass before LLM enrichment (GDELT-MATCH-02)
- `197c3be` test(38-06): add failing OSINT corroboration + composite rescore tests (GDELT-MATCH-03/04)
- `2fb6c80` feat(38-06): three-gate OSINT corroboration + additive composite rescore (GDELT-MATCH-03/04)

## Self-Check: PASSED

- Files: server/lib/corroboration.ts, server/lib/eventGrouping.ts, server/**tests**/lib/eventGrouping.dedup.test.ts, server/**tests**/lib/corroboration.test.ts — all FOUND.
- Commits: e00268e, b4494d2, 197c3be, 2fb6c80 — all FOUND in git log.
