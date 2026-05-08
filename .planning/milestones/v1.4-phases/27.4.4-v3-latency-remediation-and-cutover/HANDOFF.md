---
phase: 27.4.4
plan: 02
artifact: HANDOFF
created: 2026-04-29T23:22Z
operator: zackmaz
supersedes: HANDOFF.md (2026-04-29T15:20Z) — post-dev-pass, pre-cutover
session_focus: Cutover LIVE — Plan 02 Task 5 shipped + 5 deploy-unblocker commits
next_phase: 27.4.6 (cron-driven pipeline trigger)
---

# 27.4.4 — HANDOFF (cutover live, formal closeout pending)

The 2026-04-29 afternoon session pivoted from formal Gate B ritual to a
"ship now, certify later" cutover. v3 is live in production at
https://irt-monitoring.vercel.app — the operator broadcast it on X.
Plan 02 Task 5 (cutover POST) shipped with audit log entry; Tasks 3, 4,
6, 7 (Gate B passes + UAT closure + SUMMARY) remain operator-gated and
deferred until NIM throttle clears.

The user's stated end-state goal carried forward from prior session:

> "I want both [dev and prod] working in sync for now, then I'll abandon
> dev and move all keys to prod for live launch."

## Current branch state

- Branch: `main` (feature branch was fast-forward merged at 2026-04-29T22:54Z)
- HEAD: `1522b76` (unconditional route registration — final cutover unblocker)
- Production deployment: `irt-monitoring-8jrybct5o-zack-mazs-projects.vercel.app`
  aliased to `https://irt-monitoring.vercel.app`
- Working tree: clean. All session work committed.
- Test suite: **1919 / 0 todo / 0 regressions** at last full run. Typecheck clean.
- Vercel prod env: 13 vars set (DASHBOARD_PASSWORD, OPENROUTER_API_KEY,
  NVIDIA_NIM_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY, LLM_PIPELINE_V3=true,
  V3_ADAPTIVE_BATCH=true, LLM_V3_CONCURRENCY=1, CRON_SECRET, UPSTASH x2,
  ACLED x2, AISSTREAM, OPENSKY x2)

## Plan 02 task status

| Task | Description                      | Status              | Evidence                                          |
| ---- | -------------------------------- | ------------------- | ------------------------------------------------- |
| 1    | extract-gate-b-snapshot.sh       | ✓ shipped           | commit `1325fd1`                                  |
| 2    | Gate A re-baseline (D-16 #3)     | ✓ shipped + 0.980   | commits `36cde0e` + `f347244`                     |
| 3    | Gate B Pass 1                    | ⏸ deferred          | NIM throttled — retry when capacity returns       |
| 4    | Gate B Pass 2                    | ⏸ deferred          | depends on Task 3                                 |
| 5    | **Cutover POST {version: v3}**   | ✓ **shipped today** | POST returned `{effective: v3, source: override}` |
| 6    | Close 27.4.2 HUMAN-UAT tests 1+2 | ⏸ deferred          | depends on Task 3+4 evidence                      |
| 7    | Plan 02 SUMMARY closeout         | ⏸ deferred          | written after Tasks 3+4+6 land                    |

## Today's commits on main (2026-04-29 afternoon → evening)

| SHA       | Subject                                                                 | Why                                                                              |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `68e5dbe` | chore: dev-pass ops scripts (peek-v3-partial + record-v3-run)           | preserve forensic recorder + partial-cache inspector                             |
| `f39d13e` | feat: dashboard auth gate (Bearer-token middleware)                     | unblocks Plan 02 Task 5 cutover endpoint                                         |
| `aab20a3` | fix: redis Proxy wrapper handles SCAN correctly                         | clear-llm-cache-dev.ts geocoder flush surfaced cursor-prefix bug                 |
| `ee0484d` | perf: parallel v3 batch processing (env-tunable LLM_V3_CONCURRENCY)     | parallelism scaffolding; currently set to c=1 (see "Carry-forwards")             |
| `08b0137` | fix: breaker per-call accuracy + drop OpenRouter from v3 cascade        | breaker no longer trips on retried-and-recovered 429s                            |
| `b8b5a9e` | fix: cron-warm to 1/day for Vercel Hobby plan compliance                | initial deploy was blocked by `0 */12 * * *` (2/day)                             |
| `290c384` | fix: inline aqueduct-basins.json via import attribute                   | first ENOENT cold-start crash; runtime fs read on missing file                   |
| `eab1904` | fix: inline rivers.json the same way                                    | second ENOENT — same pattern in overpass-water.ts                                |
| `1522b76` | fix: unconditionally register /llm-status + /llm-pipeline + /llm-replay | three routes wrapped in `if NODE_ENV !== 'production'` — never reachable in prod |

## Cutover record

```
POST https://irt-monitoring.vercel.app/api/events/llm-pipeline
  Authorization: Bearer <DASHBOARD_PASSWORD>
  Content-Type: application/json
  body: {"version": "v3"}

response:
  {"effective": "v3", "override": "v3", "source": "override"}
```

Audit entry written to Redis `events:llm-pipeline-audit` (LPUSH, capped).
Override key `events:llm-pipeline-override` set with 7-day TTL. Pre-cutover
state: `effective: v2, override: v2` (legacy override from Phase 27.4 era).

## Live state at handoff (2026-04-29T23:22Z)

| Endpoint     | Count | Notes                                                   |
| ------------ | ----- | ------------------------------------------------------- |
| /api/flights | 132   | live ADS-B feed                                         |
| /api/ships   | 21    | AIS                                                     |
| /api/sites   | 721   | full Middle East infrastructure (Overpass)              |
| /api/markets | 5     | Yahoo Finance commodities                               |
| /api/events  | 3     | **degraded** — NIM throttled, raw GDELT fallback active |
| /api/news    | 0     | warming on first poll cycle                             |
| /api/water   | empty | warming                                                 |
| /api/weather | empty | warming                                                 |

Map root (`/`) returns 200. Site is functionally live.

## Three problems found + fixed this session

The cutover deployment surfaced bugs that hadn't shown in dev because dev
imports differently (vite dev vs. tsup esbuild bundle).

### 1. JSON files loaded via `readFileSync` at module init

Two server modules used `readFileSync(resolve(__dirname, '../../src/data/X.json'))`
which crashed on Vercel cold-start with ENOENT — tsup doesn't ship `src/data/`
alongside the function bundle. Both fixed by switching to ESM import with
`with { type: 'json' }`:

- `server/lib/basinLookup.ts` (1.5 MB aqueduct-basins.json) — commit `290c384`
- `server/adapters/overpass-water.ts` (8 KB rivers.json) — commit `eab1904`

Three other JSON loaders (`llmEvalHarness`, `waterSnapshot`, `sitesSnapshot`)
are LAZY (called inside functions, guarded by `existsSync`) and degrade
silently when the file is absent. No fix needed there.

### 2. Cron schedule violated Vercel Hobby plan

`{ "path": "/api/cron/warm", "schedule": "0 */12 * * *" }` ran 2/day. Hobby
plan caps at 1/day. Changed to `0 12 * * *` (single noon UTC tick — commit
`b8b5a9e`).

### 3. Three routes wrapped in `if (NODE_ENV !== 'production')` — never registered in prod

`/api/events/llm-replay`, GET `/api/events/llm-pipeline`, POST `/api/events/llm-pipeline`
were all gated by an `if` block around the `eventsRouter.METHOD()` calls. Even
after I added the dashboardAuth middleware (commit `f39d13e`), the routes
themselves were never registered in the prod app object — Express returned
404 before middleware could evaluate the Bearer header. Same issue on
`/api/events/llm-status` (in-handler 404 short-circuit). Commit `1522b76`
removes the wrappers and replaces the in-handler short-circuit with the
middleware. Tests updated.

## Carry-forwards / known issues

### Parallelism didn't pan out at our NIM tier

Today's empirical signal: **NIM rate-limits aggressively at any concurrency >1**.

- c=12: breaker tripped at ~22 NIM successes; OpenRouter all 16 attempts 429'd
- c=4: 13 NIM successes, 9 rate_limit retries, breaker tripped, ~26/394 enriched
- c=4 with breaker fix: still tripped (NIM raw 429 rate too high, retries can't recover fast enough)
- c=1: works reliably (proved in prior 95-min run that produced 392 events)

The parallelism code (commit `ee0484d`) ships with `LLM_V3_CONCURRENCY` env
var defaulting to 12, but **prod is set to 1** for stability. The c=1 path
is identical-by-execution to the pre-parallel sequential code.

**This is the key motivation for Phase 27.4.5 (Cerebras-as-v3-primary):**
Cerebras has separate quota (1M tokens/day on free tier) and didn't show
the same per-second throttle behavior in our 27.4 / 27.4.1 / 27.4.2 runs.
Adding Cerebras as the v3 cascade primary (or pre-NIM) gives us a real
fallback when NIM is throttled — and unlocks the parallelism gain.

### NIM throttle on operator's API key

Today's runs (c=12 + c=4 ×2 + c=1) consumed enough NIM capacity that the
key now responds with 7-minute p99 latencies (`nimP99 = 415s`). The 90s
watchdog fires; even adaptive split-retry times out. Expected recovery:
~24h on a per-day window. Until then, the prod /api/events/llm-status
will show DLQ entries and breaker trips on the first cache-miss extraction.

**Mitigation already in place:** Pitfall 1 graceful-degradation bridge —
when LLM cache is empty, /api/events serves raw GDELT. Map never goes
blank; users see CAMEO-classified events instead of v3-enriched ones.

### Leaked secrets (operator declined rotation today)

Three secrets pasted into chat via IDE selection during the session:

- OpenRouter key `sk-or-v1-7ee...bb9eb`
- CRON_SECRET `326d0f3...68a619`
- Groq key `gsk_NHwNGH...`

User opted to defer rotation. Worth revisiting once the live launch
settles. DASHBOARD_PASSWORD also lives in chat scrollback (the value the
operator types into the dashboard auth modal).

### .env.local malformation pattern

Lines were repeatedly mashed together via `echo >> .env.local` writes when
the file lacked a trailing newline. Twice during the session I had to split:

1. `OPENROUTER_API_KEY=...CRON_SECRET=...` (one line)
2. `DASHBOARD_PASSWORD=...LLM_V3_CONCURRENCY=4` (one line)

Defensive pattern: prefer `printf "%s\n" "$entry" >> .env.local` over `echo`,
and inspect with `awk -F= '{print NR": "$1" len="length($0)}'` after writes.

## Plan 02 closeout (when NIM recovers)

When NIM returns to healthy latency (~24h):

1. **Trigger a clean prod extraction**:
   ```bash
   curl -fsS "https://irt-monitoring.vercel.app/api/events?backfill=true" \
     -m 60 | jq '. | length'
   # wait ~95 min for completion (c=1 sequential)
   ```
2. **Capture llm-status snapshot** (Plan 02 Task 3 evidence):
   ```bash
   KEY="<DASHBOARD_PASSWORD>"
   curl -fsS "https://irt-monitoring.vercel.app/api/events/llm-status" \
     -H "Authorization: Bearer $KEY" \
     | tee /tmp/gate-b-pass-1-status.json | jq '.'
   bash scripts/extract-gate-b-snapshot.sh "https://irt-monitoring.vercel.app"
   ```
3. **Re-run for Pass 2** within 30 min (reproducibility).
4. Append both passes to `27.4.4-02-CUTOVER.md` `## Gate B Pass 1` /
   `## Gate B Pass 2` sections.
5. Close 27.4.2 HUMAN-UAT tests 1+2 (Task 6).
6. Write `27.4.4-02-SUMMARY.md` (Task 7).

The cutover itself is already done (Task 5). These are evidence-capture
artifacts for the formal record — they don't change runtime behavior.

## Phase 27.4.6 — recommended next phase

The user picked 27.4.6 as the next work-unit. Goal:

> Move the LLM pipeline trigger out of `/api/events` into a Vercel cron
> so the route becomes a pure cache reader. First user no longer pays
> the LLM cost. Pipeline refreshes happen server-side every 4-6 hours.

### Why this matters

- Today's prod extraction is fire-and-forget on cache miss. The first
  user to hit /api/events triggers a 95-min pipeline run. Server-side
  cron means users always see cached data immediately.
- 15-min cooldown via `events:llm-process-ts` partially mitigates the
  thundering-herd, but doesn't eliminate it.
- Background cron also lets us schedule extractions during NIM's
  uncongested windows (e.g. 4am UTC).

### Scope (estimated 1-2 hours work)

1. **Delete the fire-and-forget block** at `events.ts:~1019-1130` (the
   block that lazily triggers `processEventGroupsV3` + `geocodeEnriched...`
   when the cache is stale). Route becomes a pure `cacheGetSafe` reader.
2. **New `/api/cron/refresh-events` endpoint** that runs the same pipeline
   logic. Authenticate via `CRON_SECRET` (matches existing `/api/cron/eval`
   pattern). Probably extract the existing fire-and-forget block into a
   shared helper called from both the cron and a dev-only manual trigger.
3. **`vercel.json` cron entry**: `{ "path": "/api/cron/refresh-events", "schedule": "0 */6 * * *" }`
   — every 6 hours. Vercel Hobby allows 1/day so we'd need to either
   request the team upgrade OR consolidate to a single `0 4 * * *`
   (daily at 4am UTC, before the morning traffic peak).
4. **Cache-warm-only fallback** preserved: if the cron hasn't fired yet
   on a fresh deploy, the existing cron-warm endpoint can manually
   trigger the first extraction.

### Files likely to touch

- `server/routes/events.ts` (delete fire-and-forget block + extract helper)
- `server/routes/refresh-events-cron.ts` (new — clones cron-warm pattern)
- `server/index.ts` (mount the new cron router)
- `vercel.json` (add cron entry)
- A test (`server/__tests__/routes/events-cache-only.test.ts`) verifying
  the route is now read-only

### Open question

Hobby plan caps crons at 1/day. Either:

- (a) Single `0 4 * * *` daily extraction. Acceptable for a personal-project
  dashboard where 24h-old conflict events are still relevant.
- (b) Upgrade to Vercel Pro for hourly crons — costs.
- (c) Keep cache-miss triggering as a backup for the daily cron.

User decision needed before implementation.

## Phase 27.4.5 — also worth considering before live launch

If parallelism becomes important, **27.4.5 should add Cerebras to the v3
cascade as primary** (NIM as fallback). Today's NIM throttle showed the
single-provider-primary model is fragile. Cerebras has separate quota
and showed reliable throughput in 27.4.x v2 work. Adding it would:

- Unblock parallelism (Cerebras handles burst better than NIM)
- Provide real fallback when NIM is throttled
- Reduce wall-clock for full extraction from 95min → 10-15min

~1 day of work. Optional unless throughput becomes a felt problem.

## Phase 27.4.7 — live-launch cleanup (when ready to abandon dev)

When the user is ready to go prod-only:

1. Remove `CACHE_KEY_PREFIX=dev:` from `.env.local`
2. Decide: single Upstash database for both, OR provision a separate dev
   Upstash. With same-credentials model the user prefers, single is fine.
3. Delete dev-only Redis keys (`dev:events:*`, `dev:geocode:*`).
4. Move dev-pass scripts (`scripts/clear-llm-cache-dev.ts`,
   `peek-v3-partial.ts`, `record-v3-run.sh`, `eval-detail.ts`) into
   `scripts/debug/` or delete.
5. Set `NODE_ENV=production` enforcement everywhere.

## Anti-patterns surfaced this session (carry-forward + new)

Carrying forward the prior 11. Adding new ones from today's cutover work:

12. **NEW: JSON data files MUST be imported, not readFileSync'd at module
    init.** The Vercel function bundle (tsup esbuild) inlines imports but
    does NOT copy `src/data/` files. Use
    `import data from '../../src/data/X.json' with { type: 'json' };`
    Lazy `existsSync`-guarded reads inside functions are OK because they
    degrade silently. Module-init readFileSync of relative paths is a
    cold-start trap.

13. **NEW: Don't wrap route registration in `if (NODE_ENV !== 'production')`.**
    Express routes registered conditionally are physically absent from the
    prod app, so middleware never runs. Apply the gate at the middleware
    layer (like `dashboardAuth`) so the route is always reachable but
    behavior changes per env.

14. **NEW: Vercel Hobby plan crons cap at 1/day.** `0 */N * * *` where N<24
    will block deploy with `deploy_failed`. Either consolidate to once-daily
    OR upgrade to Pro. Affects 27.4.6 cron-architecture design.

15. **NEW: NIM rate-limits per second, not per minute.** Documented 40/min
    cap is misleading — concurrency >1 reliably trips 429s. Until
    Phase 27.4.5 adds a real fallback, keep `LLM_V3_CONCURRENCY=1`.

16. **NEW: When deploying for the first time in weeks, expect drift.** The
    prior prod deploy (26 days old) predated the basinLookup module, the
    rivers data, the auth gate, the parallelism work, the breaker fix,
    AND the cron-warm-to-1/day update. Five separate deploy-blocking
    issues surfaced in sequence. Future long-gap deploys: do `vercel build
&& vercel inspect` locally first to surface module-init failures
    BEFORE pushing to prod.

## Resumption recipe

```bash
# 1. Confirm site is still live
curl -fsS https://irt-monitoring.vercel.app/health | jq .

# 2. Check NIM recovery — has v3 enrichment resumed?
KEY="<DASHBOARD_PASSWORD>"
curl -fsS https://irt-monitoring.vercel.app/api/events/llm-status \
  -H "Authorization: Bearer $KEY" \
  | jq '{stage, completedBatches, totalBatches, dlqCount, schemaVersion, errorTax: .errorTaxonomy.nvidia_nim.rate_limit}'

# 3. If NIM is healthy + you want to start 27.4.6:
git checkout main && git pull
# create branch:
git checkout -b feature/27.4.6-cron-driven-pipeline
# spec the work via /gsd-new-phase or just write 27.4.6-PLAN.md directly

# 4. If NIM is still throttled and you want to close Plan 02 first:
# Wait. Re-check in another 12h. Then run resumption steps from 27.4.4
# Plan 02 closeout section above.
```

## Where to find things

- **Plan 02 PLAN.md**: `27.4.4-02-PLAN.md` (this dir)
- **CUTOVER.md** (Gate A captured, Gate B pending): `27.4.4-02-CUTOVER.md`
  - Original 0.940 baseline AND corpus-corrected 0.980 re-baseline both there
  - Gate B sections still empty
- **Plan 01 closeout**: `27.4.4-01-SUMMARY.md`
- **27.4.2 UAT manifest** (Task 6 closes tests 1+2):
  `.planning/phases/27.4.2-ci-health-and-llm-v2-tuning/27.4.2-HUMAN-UAT.md`
- **Forensic recordings**: `.dev-cache/run-*` (multiple from today's debug
  iterations — keep the last clean one for diff baseline; delete the rest)
- **Live prod URL**: https://irt-monitoring.vercel.app
- **Dashboard auth password**: in `.env.local` line 11 (`DASHBOARD_PASSWORD=...`)
- **Vercel project**: zack-mazs-projects/irt-monitoring (Hobby plan)

## Session next-step decision matrix

If next session starts cold:

1. **If cron-architecture is the goal** (user picked this): create
   `27.4.6-cron-driven-pipeline-trigger/` with PLAN.md. Decide on the
   1/day vs Pro-upgrade open question. Implement. ~1-2h.

2. **If NIM has recovered and you want to close Plan 02 formally**: run
   the resumption recipe Gate B steps. Capture evidence. Write SUMMARY.md.
   ~2h operator time.

3. **If you just want to ride the live launch**: monitor `/api/events`
   for v3 enrichment recovery via the dashboard. Post the X update if
   anything notable happens.

4. **If something breaks in prod**: dashboard auth gives full
   `/api/events/llm-status` visibility. `vercel logs <url> --status-code 500`
   for runtime errors.
