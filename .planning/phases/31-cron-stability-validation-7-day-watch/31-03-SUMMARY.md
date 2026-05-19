---
phase: 31-cron-stability-validation-7-day-watch
plan: 03
status: complete
completed: 2026-05-18
requirements_addressed:
  - LLM-RELI-06
key-files:
  modified:
    - .planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json
follow-ups:
  - operator-snapshot-script-needs-prod-upstash-creds-locally (Plan 04 prerequisite)
  - snapshot-cron-watch.ts runs main() on import — side-effecting top-level (Plan 04 polish)
  - diff-filter improvement (prep #2) couldn't be measured on cold-cache run; warm-cache delta should land on the next natural 04:00 UTC cron
---

# Plan 31-03 — D-02 Prep-Validation Force-Trigger

## Objective

Validate the Plan 01 prep fixes in production by running ONE operator-driven
force-trigger of `/api/cron/refresh-events?force=true`, observing the three
D-02 gates, and capturing the result as a single `natural: false` row in
`watch-log.json`.

## What Actually Happened (chronological)

| Step                                                            | Outcome                                                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push `feature/31-cron-stability-validation` branch              | PR #23 opened                                                                                                                                                                                   |
| CI green → squash-merge                                         | `a922998` on main                                                                                                                                                                               |
| Vercel prod deploy completes                                    | dpl_7VDvCagGCqfJ7TRH1E3xzeyx7nUw, alias `otg-iran-monitor.vercel.app`                                                                                                                           |
| 1st force-trigger (DASHBOARD_PASSWORD bearer)                   | **401** — wrong gate; cron route uses `CRON_SECRET` not `DASHBOARD_PASSWORD` (plan was wrong, runbook was right)                                                                                |
| 2nd force-trigger (CRON_SECRET)                                 | **200** — `dispatched:false, reason:"no_raw_events"` — `events:gdelt` Redis key was empty (no live dashboard polling had warmed it)                                                             |
| Warm `events:gdelt` via `GET /api/events?source=gdelt&window=6` | 404KB payload cached                                                                                                                                                                            |
| 3rd force-trigger                                               | **200** — `dispatched:true, coldCacheBypass:true` — extraction kicked off                                                                                                                       |
| Poll `/api/health endpoints.llmEvents`                          | 93s → status:`healthy` (first run completed; all groups were already cached from earlier natural cron, batchCount near 0)                                                                       |
| Fire `/api/cron/health` to validate prep #1 (eval bundle)       | **D-02 FAIL #1**: `evalScore: {total:0}`, `evalError:null`, `adversarialResult.skipped: "fixture-absent"`                                                                                       |
| Fix-forward #1 → PR #24                                         | Switched `includeFiles: ".planning/eval/*.json"` → `".planning/eval/**"` (recursive glob)                                                                                                       |
| PR #24 merged + deploy + retest                                 | **D-02 FAIL #2**: same `evalScore:0` + `fixture-absent` — Vercel bundler skips dotfile-prefixed dirs regardless of glob form                                                                    |
| Fix-forward #2 → PR #25                                         | Build-time copy `.planning/eval/*.json` → `api/_eval/*.json` + lazy eval-harness path probe + `.gitignore` on `api/_eval/`                                                                      |
| PR #25 merged + deploy + retest                                 | **PASS**: `evalScore: {within5km:49, within20km:49, within100km:49, total:50}`, `adversarialResult: {total:10, blocked:10, leaked:0, score:1}`                                                  |
| 4th force-trigger (warm GDELT, cold v3 cache)                   | Extraction completed in 368s; full pipeline ran                                                                                                                                                 |
| Pulled run summary via `/api/events/llm-status` (Bearer-gated)  | groupCount 431, batchCount 216, enrichedCount 74, durationMs 368301, evalScore 49/50, breakerTrips 0                                                                                            |
| Captured day-0 row manually in `watch-log.json`                 | Snapshot script couldn't read prod Redis (Marketplace integration injects Upstash creds at runtime only — `vercel env pull` returns empty values). Row written by hand from verified prod data. |

## D-02 Gate Results

| Gate                               | Expected                                 | Observed                                      | Verdict                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evalScore.total > 0` (prep #1)    | > 0                                      | **50** (49/50 = 98% at 5/20/100km)            | **PASS** ✓                                                                                                                                                                                                                                                                                                                                            |
| `batchCount ≤ 149` (prep #2)       | ≤ 149 (≥30% reduction from 213 baseline) | **216**                                       | **Not measurable this run** — gate assumed warm-cache test; `events:llm:v3` was empty so all 431 groups were "new" → 216 batches is cold-baseline behavior, not warm-cache. Phase 30 baseline 213 was also cold-state. Prefix-add improvement will manifest on the NEXT natural 04:00 UTC cron when the cache is warm; deferred to Plan 04 Day-1 row. |
| `breakerTrips === 0` (sanity)      | 0                                        | **0**                                         | **PASS** ✓                                                                                                                                                                                                                                                                                                                                            |
| `adversarialResult.skipped` absent | absent                                   | absent (real counts: 10/10 blocked, 0 leaked) | **PASS** ✓ (bonus)                                                                                                                                                                                                                                                                                                                                    |

## PRs landed

| PR                                                       | Title                                                                                | Result                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [#23](https://github.com/zack-maz/onthegrid.icm/pull/23) | Phase 31 Waves 1+2 — cron-stability prep fixes + snapshot harness                    | squashed `a922998`                                   |
| [#24](https://github.com/zack-maz/onthegrid.icm/pull/24) | fix(31): vercel includeFiles glob — switch to `.planning/eval/**`                    | squashed `d6f0211` — failed in prod (dotfile filter) |
| [#25](https://github.com/zack-maz/onthegrid.icm/pull/25) | fix(31): bundle eval fixtures via `api/_eval/` — vercel ignores `.planning` dotfiles | squashed `a339039` — **fixed prep #1 in prod**       |

## Day-0 Row (verified prod data)

```json
{
  "tickDate": "2026-05-18",
  "snapshotAt": "2026-05-19T01:34:00.000Z",
  "natural": false,
  "healthStatus": "healthy",
  "freshnessMs": 539720,
  "dlq": { "count": 0, "reasons": {} },
  "eval": { "at5km": 0.98, "at20km": 0.98, "at100km": 0.98 },
  "batchCount": 216,
  "breakerTrips": 0,
  "result": "PASS",
  "notes": "D-02 prep-validation force-trigger | ..."
}
```

- `natural: false` → does NOT advance the 7-consecutive natural-PASS counter.
- `classifyTick(row) === "PASS"` (healthy + empty DLQ).
- `consecutivePassCount` remains 0 — Day 1 is the next natural 04:00 UTC cron.

## Follow-ups for Plan 04 (must address before Day-1 snapshot)

1. **Operator local-creds gap.** `npm run watch:snapshot` requires prod Upstash creds in `.env.local` (or equivalent). The Marketplace integration only injects them into Vercel runtime; `vercel env pull` returns empty values for `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Two options:
   - **Manual:** copy them from the Upstash dashboard into `.env.local` (one-time operator setup).
   - **Better:** add an HTTP-only mode to `scripts/snapshot-cron-watch.ts` that reads `/api/events/llm-status` (Bearer-gated) + `/api/cron/health` instead of Redis directly. Avoids the local-creds requirement entirely. Recommended.

2. **`scripts/snapshot-cron-watch.ts` runs `main()` at import time.** This breaks any caller that imports schemas/helpers without wanting to run a snapshot. Fix: gate the `main().catch(...)` invocation behind `import.meta.url === pathToFileURL(process.argv[1]).href` so it only runs on direct CLI invocation.

3. **prep #2 (diff-filter) warm-cache validation.** Today's cold-cache run can't demonstrate the prefix-add fix's batchCount reduction. The Day-1 natural 04:00 UTC cron will run against a warm `events:llm:v3` cache populated by today's manual run — that's where ≤149 should appear.

## Self-Check

- [x] PR #23 (Waves 1+2) merged via squash + branch deleted.
- [x] D-02 force-trigger executed against prod (3 attempts due to auth + warm-cache issues).
- [x] Fix-forward #1 (PR #24, glob form) shipped but didn't resolve.
- [x] Fix-forward #2 (PR #25, build copy to `api/_eval/`) shipped + verified — `evalScore.total = 50` end-to-end.
- [x] Full extraction completed (368s, 431 groups → 74 enriched, 0 breaker trips).
- [x] Day-0 row written to `watch-log.json` with verified prod data (manually due to local Redis gap).
- [x] WatchLog Zod schema validates the row.
- [x] Three follow-ups documented for Plan 04.

Self-Check: PASSED (with documented gaps)
