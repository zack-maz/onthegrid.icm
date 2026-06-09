---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 03
subsystem: gdelt-event-matching
tags: [gdelt-match, audit, corpus-quality, source-tiers, dedup, hard-gate]
requires:
  - server/lib/sourceTiers.ts (getHighestTier)
  - server/lib/eventGrouping.ts (groupGdeltRows, EventGroup)
  - server/cache/redis.ts (cacheGetSafe)
  - server/types.ts (ConflictEventEntity, NewsCluster)
provides:
  - scripts/audit-gdelt-corpus.ts (CLI + pure bucketing/orphan/dedup functions)
  - npm run audit:gdelt
  - gdelt-corpus-audit.json (empirical baseline that sizes plan 06 thresholds)
affects:
  - plan 38-06 (GDELT-MATCH-02 dedup threshold, MATCH-03 corroboration, MATCH-04 composite weights)
tech-stack:
  added: []
  patterns:
    - 'Phase-22-style CLI tsx audit (analog of scripts/audit-events.ts)'
    - 'pure exported functions + import.meta.url direct-run guard so test imports never trigger Redis I/O'
    - 'READ-ONLY corpus audit (D-07 non-destructive) — cacheGetSafe reads only, zero writes'
key-files:
  created:
    - scripts/audit-gdelt-corpus.ts
    - server/__tests__/scripts/audit-gdelt-corpus.test.ts
    - .planning/phases/38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl/gdelt-corpus-audit.json
  modified:
    - package.json
decisions:
  - 'Orphan detection uses a conservative 3-gate match (temporal ±2d AND geo ≤50km AND ≥1 shared keyword token) mirroring the Bellingcat three-gate philosophy — avoids coincidental same-region-same-day false matches (GDELT-MATCH-03 landmine)'
  - 'Duplicate-cluster sizing reuses groupGdeltRows (coarse batch-grouping) and is explicitly labeled NOT true dedup (Pitfall 6) — the audit SIZES the dup surface; plan 02 adds the tighter AND-gate pre-pass'
  - 'Pure functions (bucketByTier/detectOrphans/detectDuplicateClusters/buildAuditReport) exported from the script; CLI main() guarded by import.meta.url so the vitest import never touches Redis'
  - 'Audit degrades gracefully to an empty corpus when live Redis is unavailable/empty; --snapshot reads a captured { events, clusters } JSON for offline auditing'
metrics:
  duration: ~6m
  completed: 2026-06-04
---

# Phase 38 Plan 03: GDELT Corpus-Quality Audit (GDELT-MATCH-01) Summary

A Phase-22-style READ-ONLY audit script (`scripts/audit-gdelt-corpus.ts`) that categorizes the LLM-enriched event corpus by source tier, detects orphan events, and sizes duplicate-source clusters — the HARD GATE whose empirical findings size plan 06's dedup / corroboration / composite thresholds.

## What Was Built

- **`scripts/audit-gdelt-corpus.ts`** (367 lines) — CLI tsx audit mirroring `scripts/audit-events.ts`:
  - `bucketByTier` → `sourceTiers.getHighestTier` → tier1 (high) / tier2 (neutral) / tier3 (low) / unknown buckets.
  - `detectOrphans` → 3-gate (temporal ±2d AND geo ≤50km AND ≥1 shared keyword token) cross-reference against `news:gdelt` clusters.
  - `detectDuplicateClusters` → `eventGrouping.groupGdeltRows` filtered to size ≥2.
  - `buildAuditReport` → per-bucket counts/percentages, orphan count/rate/ids, duplicate-cluster size histogram.
  - CLI shell reads live `events:llm:v3` + `news:gdelt` via `cacheGetSafe`, with `--snapshot`/`-o`/`--help` flags; degrades to an empty report when Redis is unavailable.
  - Pure functions exported; `main()` runs only on direct invocation (`import.meta.url` guard) so the test imports never trigger Redis I/O.
- **`server/__tests__/scripts/audit-gdelt-corpus.test.ts`** (238 lines, 7 tests) — fixture-driven unit test proving bucketing, orphan (incl. temporal-miss + no-cluster cases), duplicate-pair sizing, and full report assembly.
- **`package.json`** — added `"audit:gdelt"` script (env-file + tsx runner pattern, identical to `snapshot:v3`).
- **`gdelt-corpus-audit.json`** — committed empirical baseline report (see Audit Findings below) with embedded `_provenance` block.

## Audit Findings (these SIZE plan 06's thresholds)

> **Provenance caveat:** the live `events:llm:v3` terminal cache was **ABSENT** in the dev Redis instance at audit time (only `events:llm:v3:lineage:*` subkeys + `events:llm-summary:v3` present — the terminal array had expired / not been re-warmed). To produce a real-numbers baseline instead of zeros, the audit was run against the dev **raw `events:gdelt` corpus** (688 events) captured as a snapshot. `news:gdelt` was also absent in dev, so `news:feed` (2 clusters) was used as the orphan cross-ref proxy.

Real-corpus numbers (688 raw GDELT events):

| Metric                                  | Value                                         | Plan-06 implication                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total events                            | **688**                                       | corpus size                                                                                                                                                                                                                     |
| Tier 1 (high)                           | 0 (0%)                                        | raw GDELT carries a single `source` URL each; tier-rich multi-source data lives in `events:llm:v3` (absent here)                                                                                                                |
| Tier 2 (neutral)                        | 2 (0.3%)                                      | —                                                                                                                                                                                                                               |
| Tier 3 (low)                            | 0 (0%)                                        | —                                                                                                                                                                                                                               |
| **Unknown (null source tier)**          | **686 (99.7%)**                               | **expected for RAW pre-LLM corpus**; will shift substantially once LLM-enriched multi-source `events:llm:v3` is the input. MATCH-04 composite weights must NOT assume tier-1 dominance from raw GDELT.                          |
| Orphan events                           | 688 (100%)                                    | **inflated artifact** — `news:gdelt` was empty in dev (only 2 `news:feed` proxy clusters), so every event reads as orphan. NOT a real corpus signal; re-run against a populated `news:gdelt` for MATCH-03 corroboration sizing. |
| **Duplicate-source clusters (size ≥2)** | **134 clusters / 364 events (53% of corpus)** | **the reliable plan-06 signal.** ~half the corpus collapses under coarse day+CAMEO-root+≤50km grouping.                                                                                                                         |
| Largest dup cluster                     | 9 events                                      | —                                                                                                                                                                                                                               |

Duplicate-cluster size histogram (the empirical distribution MATCH-02's tighter dedup pre-pass must handle):

| Cluster size | # clusters |
| ------------ | ---------- |
| 2            | 81         |
| 3            | 34         |
| 4            | 9          |
| 5            | 4          |
| 6            | 2          |
| 7            | 1          |
| 8            | 2          |
| 9            | 1          |

### Threshold recommendations for plan 06

- **GDELT-MATCH-02 (dedup threshold):** ~53% of the raw corpus already collapses under the _coarse_ day + CAMEO-root + ≤50km grouping. The tighter AND-gate dedup pre-pass (same actor pair AND CAMEO root AND day-bucket AND ≤5–10km AND title/URL Jaccard ≥0.85) should target the **size-2 majority (81 of 134 clusters)** — these are the most likely true duplicates. The long tail (size 6–9, 6 clusters) is more likely genuine multi-strike activity in one area/day and should NOT be over-collapsed. Start Jaccard at **0.85** and the geo gate at **5km** (the conservative end), then validate against the size-2 cohort.
- **GDELT-MATCH-03 (corroboration tuning):** the orphan rate is unusable from this run (100% artifact of empty `news:gdelt`). **Re-run `npm run audit:gdelt` against a populated `news:gdelt` before sizing the corroboration gate.** The 3-gate orphan logic itself is proven by the unit test and ready to consume real DOC clusters. Keep the keyword gate strict (actor/specific-action tokens, not generic "Iran"/"strike").
- **GDELT-MATCH-04 (composite weights):** do NOT weight source tier heavily off the raw corpus (99.7% unknown). The composite must be computed over **LLM-enriched `events:llm:v3`** (multi-source `sourceTier`), which was empty at audit time. Re-run the audit once the v3 cache is warm to get the real tier distribution that the composite weight should reflect.

**Net for plan 06:** the duplicate-cluster histogram is directly actionable now; the tier and orphan distributions require a re-run against a warm `events:llm:v3` + `news:gdelt`. The audit script is the reusable instrument for that re-run (`npm run audit:gdelt`).

## Deviations from Plan

### Auto-fixed / adapted (no architectural change)

**1. [Rule 3 - Blocking] Live `events:llm:v3` + `news:gdelt` absent in dev Redis**

- **Found during:** Task 1 live-run verification.
- **Issue:** The terminal `events:llm:v3` array and `news:gdelt` clusters were not present in the dev Upstash instance (only lineage/summary subkeys), so a live `npm run audit:gdelt` produced an all-zero report — useless for sizing plan 06.
- **Resolution:** Used the audit's `--snapshot` path against the dev **raw `events:gdelt`** corpus (688 events, read READ-ONLY) to produce a real-numbers baseline, with a `_provenance` block + this SUMMARY documenting that tier/orphan numbers need a warm-cache re-run. No code change to the corpus; D-07 non-destructive invariant preserved. The graceful-degradation behavior is the planned Environment-Availability path, not a bug.
- **Note:** The dev `events:gdelt` key is stored under an anomalous `dev: ` (trailing-space) prefix — a pre-existing dev-data artifact. NOT fixed here (out of scope, and a write would violate D-07). Logged for awareness only.

## TDD Gate Compliance

- RED: `test(38-03)` commit `ff940c0` — failing test (module did not exist).
- GREEN: `feat(38-03)` commit `9ba5261` — 7/7 tests pass.
- REFACTOR: none needed.

## Verification

- `npx vitest run server/__tests__/scripts/audit-gdelt-corpus.test.ts` → 7 passed.
- `npm run typecheck` → `tsc -b` clean + `type-coverage` 97.58% (above 97 floor).
- Acceptance greps: `grep -c getHighestTier` → 2, `grep -c groupGdeltRows` → 2.
- D-07 non-destructive: no executable cache-write calls in the script (only a comment mentions "NEVER writes").
- CLI runs end-to-end: `--help`, `--snapshot` fixture, and live (degrades to empty) all emit a report without throwing.

## Commits

- `ff940c0` test(38-03): add failing test for GDELT corpus audit logic (GDELT-MATCH-01)
- `9ba5261` feat(38-03): GDELT corpus-quality audit script + report (GDELT-MATCH-01)

## Self-Check: PASSED
