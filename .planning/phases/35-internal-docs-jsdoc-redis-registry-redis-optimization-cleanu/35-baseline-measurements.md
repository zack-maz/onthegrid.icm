# Phase 35 Baseline Measurements

> Phase 35 baseline; close measurements in 35-06-PLAN.md task.

Captured 2026-05-27 (UTC) at the start of plan 35-01 before any production-code edits land.

## D-19 — Bundle Size

| Metric                 | Value                                                                                                            | Source                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `api/vercel-entry.js`  | **1,779,504 bytes** (≈ 1.70 MB)                                                                                  | `wc -c api/vercel-entry.js` (single-file path per Pitfall 5) |
| Measurement date (UTC) | 2026-05-27                                                                                                       | This file's creation timestamp                               |
| Expected close target  | ≤ 1,779,504 bytes (delta should be ≤ 0 after SIMPLIFY-02 / SIMPLIFY-07 dead-code removal in plans 35-02 + 35-05) | Closed and recorded in 35-06-PLAN.md                         |

Re-measurement command (run again at phase close):

```bash
wc -c api/vercel-entry.js
```

If the value drifts >5% from 1.70 MB during phase work, run `npm run build` first to refresh the artifact, then re-measure (per Pitfall 5).

## D-20 — Upstash Command Budget

| Metric                         | Value                                                                                      | Source                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Screenshot filename            | `redis-budget-baseline-2026-05-27.png`                                                     | Committed alongside this file in the phase directory                                                             |
| Captured by                    | Operator (manual dashboard screenshot)                                                     | D-20 — Upstash REST does NOT expose `INFO commandstats` cleanly; manual capture is the documented honest surface |
| Capture location               | Upstash Console → otg-iran-monitor database → Metrics / Commands tab                       | per CONTEXT.md D-20                                                                                              |
| Headline readings (2026-05-27) | COMMANDS 443 K / 500 K (monthly), BANDWIDTH 0 B / 50 GB, STORAGE 1 MB / 256 MB, COST $0.00 | Transcribed from PNG for grep-ability                                                                            |

Re-capture at phase close per 35-06-PLAN.md and commit as `redis-budget-close-YYYY-MM-DD.png` in this same directory.

## Provenance

- Plan: 35-01 (Task 1 Steps B + C + D)
- Decisions: D-19 (bundle baseline) + D-20 (Upstash baseline) + D-27 (branch cut, captured Step A)
- Branch: `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu`
- Closure: 35-06-PLAN.md owns the delta calculation against these baselines.
