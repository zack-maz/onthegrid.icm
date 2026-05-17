# 30-02 — Run 1: NIM Throttle Characterization (Baseline)

**Status:** Complete · **Wave:** 2 · **Autonomous:** false (operator-attended)

## Outcome

Run 1 baseline characterization captured. Force-trigger of
`/api/cron/refresh-events?force=true` against the Vercel Pro 800s ceiling
completed inside the budget. Analyzer snapshot committed to phase directory.

## Snapshot

File: `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-1-throttle-snapshot.json`

All 9 required fields populated:

| Field                                  | Value                                  |
| -------------------------------------- | -------------------------------------- |
| `runTimestamp`                         | `1778980781669` (2026-05-17T01:19:41Z) |
| `durationMs`                           | `122628` (~123s)                       |
| `batchCount`                           | `213`                                  |
| `watchdogTimeoutCount`                 | `0`                                    |
| `throttleWindowMs.path`                | `"B"` (no Retry-After headers)         |
| `throttleWindowMs.median` / `.p95`     | `306` / `306`                          |
| `steadyStateRpm`                       | `0` (no 429s during run)               |
| `recoveryIntervalMs`                   | `null`                                 |
| `perBatchLatency.p50` / `.p95`         | `21053` / `33263` (ms)                 |
| `evalScore.within5km/20km/100km/total` | `0` / `0` / `0` / `0`                  |

## Run notes

1. **Path B, zero 429s observed** — NIM did NOT throttle during this run.
   Per RESEARCH Open Question 2, the rolling-window limiter is conservative
   enough that current defaults never approach NIM's RPM ceiling. **Plan 05
   becomes a sanity-check run** rather than a re-tuning run. The `306ms`
   median is a synthetic gap-inference value from very few sample points.

2. **evalScore.total = 0** — `runEval()` failed silently because
   `.planning/eval/ground-truth-events.json` is not bundled into the Vercel
   deploy output. The harness caught the error and continued the pipeline.
   This blocks Plan 06's deploy gate (eval ±3pp tolerance check) until
   resolved. Surface in Plan 06 as a remediation task.

3. **Per-batch latency p50 = 21s, p95 = 33s** — measured end-to-end
   including geocoding. With 213 batches in 122s wall-clock, effective
   parallelism appears higher than `LLM_V3_CONCURRENCY=12`. Either the prod
   env override raises concurrency, or batch wall-clock amortizes geocoding
   across requests. Plan 05 should verify the effective concurrency value.

4. **0 watchdog hard-kills, 0 DLQ entries** — the 90s hard-kill default
   was never approached. Even the p95 latency (33s) sits comfortably below
   the limit. Plan 04 (soft-warn elimination) and Plan 05 (timeout tuning)
   can proceed without concern about Run 1 evidence of timeout pressure.

## Where the system has slack

- NIM RPM ceiling: untested (no 429s) — the rolling-window limiter never let
  us probe the actual NIM cap.
- Per-batch latency vs hard-kill: 33s p95 vs 90s limit = ~57s headroom per
  batch.
- Wall-clock vs Pro ceiling: 122s used of 800s = ~85% headroom.

## Operational metadata

- **Trigger:** `GET /api/cron/refresh-events?force=true` at `2026-05-17T01:17:37Z`
- **Deployment:** `dpl_4kJzKGrBC7WUo5DLE6TRc6DvMKsv` (built from `feature/30-nim-throttle-characterization`)
- **Completed:** `2026-05-17T01:19:41Z` per `events:llm-summary:v3.lastRun`
- **CACHE_KEY_PREFIX gotcha:** prod uses `dev: ` (with trailing space).
  `node --env-file-if-exists=...` strips trailing whitespace from env values,
  causing the analyzer's prefix to mismatch the actual Redis key names.
  Workaround: `set -a; source .env.local; set +a; export CACHE_KEY_PREFIX="dev: "`.
  This is a Plan-01 follow-up the analyzer should encode (auto-restore
  trailing whitespace from raw file read, or document the explicit-export
  workaround in the analyzer's `--help`).

## Pointer

The snapshot at `run-1-throttle-snapshot.json` is the data source for
Plan 03 (SIMPLIFY-01 Redis SET-call delta), Plan 05 (tuned default
derivation — though sanity-check mode given Path B), Plan 06 (Run 2
comparison), and Plan 07 (architecture doc throttle-findings table).
