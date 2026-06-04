---
phase: 31-cron-stability-validation-7-day-watch
created: 2026-05-19
purpose: context-clear handoff — pick up Plan 04 daily snapshot rhythm
status: paused awaiting Day-1 natural cron
---

# Phase 31 Handoff — Day 1 onward

## TL;DR

Phase 31 Waves 1+2+3 done. **Day-0 PASS row** committed (`watch-log.json`). All Plan 04 prereqs landed. **Tomorrow morning (and each morning thereafter for ≥7 consecutive days)**, run ONE command, commit the result. After 7 consecutive natural-PASS days → run Plan 5 closeout PR.

```bash
# Tomorrow morning, after 04:00 UTC. From repo root, on main:
npm run watch:snapshot -- --http --notes='Day-N natural cron'
git add .planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json
git commit -m "docs(31): watch-log day N — natural cron PASS"
git push
```

The script exits 0 = PASS / 1 = FAIL / 2 = GAP / 99 = error. Markdown table is printed to stdout — read it.

## Branch & repo state at handoff

- **Branch:** `main` (clean working tree, up to date with origin)
- **Latest commit:** `3dcbe1a feat(31): snapshot script HTTP-mode + gate top-level main() invocation (#27)`
- **Phase 31 PRs landed today (chronological):**

  | PR                                                       | Commit    | What it did                                                                      |
  | -------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
  | [#23](https://github.com/zack-maz/onthegrid.icm/pull/23) | `a922998` | Waves 1+2 — 4 prep fixes + snapshot harness + RED→GREEN tests                    |
  | [#24](https://github.com/zack-maz/onthegrid.icm/pull/24) | `d6f0211` | fix-fwd #1: `.planning/eval/**` glob — failed in prod (Vercel skips dotfiles)    |
  | [#25](https://github.com/zack-maz/onthegrid.icm/pull/25) | `a339039` | fix-fwd #2: build-time copy to `api/_eval/` — **succeeded** (`evalScore: 49/50`) |
  | [#26](https://github.com/zack-maz/onthegrid.icm/pull/26) | `e20eed5` | watch-log day 0 + Plan 03 SUMMARY                                                |
  | [#27](https://github.com/zack-maz/onthegrid.icm/pull/27) | `3dcbe1a` | snapshot script HTTP-mode + `main()` import gating                               |

## What "Day-1" means

The 7-day watch counts **natural** `/api/cron/refresh-events` runs at 04:00 UTC. Each natural-cron day that classifies PASS increments `consecutivePassCount` toward 7.

- **Day 0 (today, 2026-05-18):** the D-02 prep-validation force-trigger row — `natural: false`, **does NOT count**. Already committed.
- **Day 1 = the first natural 04:00 UTC cron after deploy** = 2026-05-19 04:00 UTC. After that fires, capture the row.
- **Day 7 = 2026-05-25 04:00 UTC** (if no gaps/fails).

If you miss a day, the script auto-emits a `GAP` row for it (Redis only retains the most-recent tick — historic data is unrecoverable). GAP rows **pause** the counter without breaking it.

## Daily command (Plan 04)

```bash
# 1. Run snapshot in HTTP mode (no Upstash creds needed)
npm run watch:snapshot -- --http --notes='Day-N natural cron'
```

Behavior:

- Reads `/api/events/llm-status` (Bearer = `DASHBOARD_PASSWORD` from `.env.local`) + `/api/health` (public).
- Classifies the day per `classifyTick()`:
  - **PASS** = healthy + DLQ reasons ⊂ `['v3:timeout_watchdog', 'v3:adaptive-retry-fail']`
  - **FAIL** = healthStatus ≠ healthy OR any non-whitelisted DLQ reason
  - **GAP** = healthStatus = unknown AND freshnessMs = null
- Appends/updates row in `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json` (idempotent on `--tick-date`).
- Backfills GAP rows for any missed days between snapshots.
- Prints a markdown table + the consecutive-PASS counter (`N / 7`).

If PASS:

```bash
# 2. Commit and push
git add .planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json
git commit -m "docs(31): watch-log day N — natural cron PASS"
git push
```

If FAIL or GAP: see "Troubleshooting" below.

## Expectations for Day 1 (tomorrow morning)

The cold-cache baseline today was `batchCount: 216` (all 431 groups were "new" because `events:llm:v3` was empty when the force-trigger ran). Tomorrow's natural cron will hit a **warm** `events:llm:v3` cache populated by today's run, so the diff-filter prefix-add fix (PR #23 commit `1bfec94`) should manifest as **`batchCount` materially below 216** — that's prep #2 validating in the wild.

Expected Day-1 row shape:

- `result: PASS`
- `healthStatus: healthy`
- `batchCount: <much less than 216>` (delta-only processing, hopefully near or below 149 — the original D-02 gate)
- `breakerTrips: 0`
- `eval.at5km/at20km/at100km: ~0.98` (last cron's eval baked into the summary)
- `dlq.count: 0-few` (any entries must be in WATCH_DLQ_WHITELIST or it FAILs)

## Phase 31 plan inventory (where are we)

| Plan                                     | Status                | Notes                                                                                                       |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 31-01 prep fixes (+ RED test)            | ✅ Complete (PR #23)  | All 4 prep fixes + Wave 0 RED→GREEN unit test                                                               |
| 31-02 snapshot script (+ contract test)  | ✅ Complete (PR #23)  | 18/18 contract tests pass                                                                                   |
| 31-03 D-02 prep-validation force-trigger | ✅ Complete (PR #26)  | Day-0 row committed; needed 2 fix-forwards (PR #24, #25) before eval bundle worked                          |
| **31-04 Days 1-7 daily snapshot rhythm** | **🟡 Awaiting Day-1** | Daily `npm run watch:snapshot -- --http` until `consecutivePassCount == 7`                                  |
| 31-05 Phase close                        | ⏳ Blocks on Plan 04  | After Day-7 PASS: write 31-SUMMARY.md + architecture-doc narrative + REQ/ROADMAP/STATE updates + closing PR |

## After Day-7 PASS — Plan 5 closeout

When `consecutivePassCount(rows) == 7`, the watch is done. Plan 31-05 close-out steps:

1. Verify `npm run watch:snapshot -- --http` exits 0 and counter = 7.
2. Append a 7-day closing narrative paragraph to `docs/architecture/llm-pipeline-reliability.md`.
3. Write `.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`.
4. Mark phase 31 complete in `.planning/ROADMAP.md` (last unchecked plan).
5. Update `.planning/STATE.md` to advance to Phase 32 (Ghost Event URL Liveness).
6. Mark `LLM-RELI-06` validated in `.planning/REQUIREMENTS.md`.
7. Single closing PR with all of the above.

Per CONTEXT D-05: if Day-N FAILs and can't be recovered within the watch window, escalate to phase 31.1 (gap closure).

## Troubleshooting

### Snapshot result = FAIL

The row classifies FAIL if:

1. `healthStatus !== 'healthy'` — check `/api/health` to see which probe is degraded.
2. DLQ has non-whitelisted reasons — see `dlq.reasons` field in the row. Whitelisted = `v3:timeout_watchdog`, `v3:adaptive-retry-fail`. Anything else (zod_fail, retry_exhausted, v3:malformed, etc.) is a real regression.

Action: commit the FAIL row anyway (it's data), open an investigation. Per CONTEXT D-05, a single FAIL day breaks the counter — restart the 7-day count from the next PASS.

### Snapshot result = GAP

`healthStatus === 'unknown' && freshnessMs === null`. Means `events:llm:v3` is empty AND `cron:lastTick:refresh-events` is missing. Possible causes:

- Cron didn't fire at 04:00 UTC (Vercel cron miss — check Vercel dashboard).
- Cron fired but extraction errored before `cron:lastTick` write.

Action: GAP rows are auto-emitted by backfill, but to investigate: `curl -s -H "Authorization: Bearer $CRON_SECRET" 'https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true'` to manually re-run. If extraction succeeds, the next morning's snapshot will see healthy state (but the GAP row remains in the log for the missed day).

### `events:llm:v3` is empty (cold cache) on Day-1

If today's cron didn't keep `events:llm:v3` warm overnight (24h Upstash hard TTL = 9000s = 2.5h logical × 4 — but typical churn shorter), tomorrow's cron will hit the cold-cache path again → `batchCount` near 216 again. That's not a FAIL — still PASS — but prep #2 won't be visible yet. Wait for Day-2 to see the warm-cache delta.

### Force-trigger returns `dispatched: false, reason: "no_raw_events"`

`events:gdelt` Redis key is empty. Warm it by hitting the route once:

```bash
curl -sS -o /dev/null -w "%{http_code} %{size_download}B\n" \
  'https://otg-iran-monitor.vercel.app/api/events?source=gdelt&window=6'
```

Then re-fire the force-trigger.

### Force-trigger returns 401

Cron route uses **`CRON_SECRET`**, NOT `DASHBOARD_PASSWORD` (Plan 03 doc was wrong, runbook §11 is right). The two values are different in `.env.local`:

- `CRON_SECRET` (length 44) — for `/api/cron/*` routes
- `DASHBOARD_PASSWORD` (length 5) — for `/api/events/llm-status`, `/api/operator-status`, dashboard UI

## Key file references

| File                                                                         | What it is                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json`   | The daily-grown observability artifact. 1 row per natural cron + 1 row for Day-0 (natural: false).     |
| `scripts/snapshot-cron-watch.ts`                                             | The snapshot script. `--help` lists all flags. HTTP-mode default-recommended via `--http`.             |
| `server/__tests__/scripts/snapshot-cron-watch.test.ts`                       | 18 contract tests pinning the WatchRow / WatchLog schemas + classifyTick + consecutivePassCount rules. |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-CONTEXT.md`    | The discussion-locked decisions (D-01 through D-13).                                                   |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-03-SUMMARY.md` | Detailed Plan 03 narrative + 3 follow-ups (2 now closed, 1 deferred).                                  |
| `docs/runbook.md §11-12`                                                     | LLM pipeline disabled / Quarterly probe runbook.                                                       |
| `docs/architecture/llm-pipeline-reliability.md`                              | Where Plan 5 appends the 7-day closing narrative.                                                      |

## Env vars (for tomorrow's runs)

The `npm run watch:snapshot` runner uses `--env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm`. So both `.env` and `.env.local` are loaded automatically. The only var the script reads:

- `DASHBOARD_PASSWORD` (length 5 in `.env.local`) — the Bearer for `/api/events/llm-status` in HTTP mode. Same value as prod's Marketplace-injected `DASHBOARD_PASSWORD`.

Plus 3 optional overrides:

- `SNAPSHOT_MODE=http` — make HTTP mode the default instead of redis (you can also use `--http` per-invocation).
- `SNAPSHOT_BASE_URL` — override the prod base URL (default `https://otg-iran-monitor.vercel.app`).
- `SNAPSHOT_HEALTH_URL` — override the redis-mode health URL (HTTP mode derives this from `SNAPSHOT_BASE_URL`).

If you want HTTP mode permanently without `--http` each time, add to `.env.local`:

```
SNAPSHOT_MODE=http
```

## Resume command (after /clear)

To re-orient tomorrow:

```bash
# 1. Read this file
cat .planning/phases/31-cron-stability-validation-7-day-watch/HANDOFF.md

# 2. Confirm branch state
git checkout main && git pull --ff-only

# 3. Take today's snapshot
npm run watch:snapshot -- --http --notes='Day-N natural cron'

# 4. If PASS: commit + push
# 5. If FAIL/GAP: investigate per Troubleshooting above
```

## What's NOT done (deferred to Phase 32+ or beyond)

- Phase 31.1 (gap closure if needed) — only fires if Day-N FAILs and can't recover.
- Phase 32 (Ghost Event URL Liveness) — independent of LLM-RELI track, can run in parallel.
- Phase 37 (ADR-0009 + acceptance gate closeout) — milestone-close gate; needs the prod-connectivity-audit to exit-0 + `allTiersGreen=true` for 3 consecutive runs (LLM-RELI-07).

---

_Generated 2026-05-19 04:08 UTC after PR #27 merge. Phase 31 paused at Wave 4 awaiting natural cron cadence._
