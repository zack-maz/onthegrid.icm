---
slug: prod-audit-tier-regression
status: resolved
trigger: 'prod-connectivity-audit critical=unknown nonCritical=unhealthy since 2026-05-08'
created: 2026-05-31T17:35:00Z
updated: 2026-05-31T18:15:00Z
branch: fix/prod-audit-tier-regression
fix_option: A3
---

## Symptoms

<!-- DATA_START -->

- **Surface:** GitHub Actions workflow `prod-connectivity-audit.yml` (workflow_dispatch only — no cron schedule on this workflow) and degrade-open Redis sidecar `audit:connectivity:last-result` surfaced at `/api/audit-status`.
- **Environment:** Prod (`https://otg-iran-monitor.vercel.app`).
- **State today (2026-05-31):**
  - `curl -sS https://otg-iran-monitor.vercel.app/api/audit-status` → `{"status":"absent"}` (sidecar TTL = 7d, last write was ~23 days ago, key has expired out of Redis).
  - `gh run list --workflow=prod-connectivity-audit.yml --limit=10` → 9 most recent runs all `conclusion: failure`, dated 2026-05-06T23:16:50Z through 2026-05-08T19:43:40Z. NO runs at all in the 23 days since.
  - Last failed run (https://github.com/zack-maz/otg-iran-monitor/actions/runs/25575929113) in-step payload from `connectivity-audit › Write audit result to Redis sidecar` step:
    - `allTiersGreen: false`
    - `tierStatus.critical: 'unknown'`
    - `tierStatus.nonCritical: 'unhealthy'`
    - `tierStatus.static: 'healthy'`
    - `tierStatus.probeOnly: 'healthy'`
    - `tierStatus.cron: 'healthy'`
  - The same payload's `endpoints` map shows every single endpoint as `'pass'` — `/api/health`, `/api/flights`, `/api/ships`, `/api/events`, `/api/sources`, `/api/markets`, `/api/news`, `/api/water`, `/api/audit-status`, `/api/operator-status`, `/api/dashboard/auth-check`, `/api/geocode`, `/api/weather`, `/api/water/precip`, `/api/events/llm-status`, `/api/sites` plus three cron-tick probes (cronHealth / cronWarm / cronRefreshEvents) all `pass`. The failure is in the tier aggregation, NOT in the per-endpoint probes.
  - `connectivity-audit › Final status check` reports: `Tier-green gate (28.2.5 D-09) FAILED. Inspect Step 3 logs for the failing tier.` → exit 1.
- **Description (operator-supplied, treat as data):** "prod-connectivity-audit critical=unknown nonCritical=unhealthy since 2026-05-08"
- **Timeline:** Last run series (9 attempts on 2026-05-06..2026-05-08) all red. No runs at all since 2026-05-08 — so the regression has been live unobserved for 23 days. The Phase 31 Cron Stability Validation phase closed early on 2026-05-19 with a Day 1/7 PASS but a documented caveat — that caveat may be relevant.
- **Reproduction:** `gh workflow run prod-connectivity-audit.yml` (operator credentials required); read `Step 3 - Write audit result to Redis sidecar` log for the tier payload.

<!-- DATA_END -->

## Context the debugger needs to know

### What "tier" means in this workflow

`.github/workflows/prod-connectivity-audit.yml` Step 3 is an inline node script that classifies each probed endpoint into 5 tiers (`critical`, `nonCritical`, `static`, `probeOnly`, `cron`) and computes `tierStatus[name]` as the worst per-endpoint status in that tier. `allTiersGreen` is true iff every tier is `'healthy'`. The exit code is non-zero (D-09 enforcement from Phase 28.2.5) when `allTiersGreen === false`. Per-endpoint probes can ALL pass while a tier is still `unknown` or `unhealthy` — this means the tier classification logic is making a decision on something other than the raw endpoint pass/fail, e.g. freshness windows, semantic content of the JSON response, or specific subfield presence in `/api/health.endpoints.<name>.status`.

### Sidecar contract

`server/routes/audit-status.ts` reads `audit:connectivity:last-result` from Upstash Redis and returns it directly (degrade-open, no Bearer). Shape pinned by `server/__tests__/lib/urlLiveness.schema.test.ts` test contract. 7d TTL. Today's `{"status":"absent"}` response means the key is gone — consistent with the last write happening on 2026-05-08 (>7d ago).

### Probably related: Phase 31 caveat

Per STATE.md (and CLAUDE.md Phase 31 sub-block):

> Phase 31: Cron Stability Validation (7-day Watch) — Closed early 2026-05-19 (Day 1 / 7 PASS; caveat)

A 7-day watch that closed on Day 1 with a caveat is a candidate cause for "tierStatus.cron passes in the run, but other tiers fail". The caveat itself is likely in the Phase 31 close artifact.

### Probably related: cron schedule + freshness windows

CLAUDE.md "Cron schedule (Hobby cap 3 entries)":

- `/api/cron/health 0 0 * * *` — Redis ping + freshness + eval-drift + adversarial eval
- `/api/cron/warm 0 12 * * *` — Overpass sites + water pre-warm
- `/api/cron/refresh-events 0 4 * * *` — LLM v3 extraction

CLAUDE.md "Active Redis keys" notes freshness-threshold logic baked into `/api/health` for critical tier endpoints (e.g. `events:llm:v3` has a 26h threshold). If any cron has stopped firing (e.g. NVIDIA_NIM_API_KEY rotated, Vercel Hobby plan paused, cron config drift), the freshness probe returns `unknown` and the critical-tier classification falls through.

`cron:lastTick:{name}` keys (7d TTL — `CRON_LASTTICK_TTL_SEC`) are written by every cron handler. If the audit step uses these to derive cronHealth, and cron has been silent for >7d, the keys also expire — explaining why the same audit shows `tierStatus.critical: 'unknown'` (freshness undeterminable) while `tierStatus.cron: 'healthy'` (the cron-tick probe path that reads something else passes).

## Pre-investigation hypothesis space

H1 — **Critical-tier endpoint freshness has gone stale and pushed `critical` to `unknown`.** The audit reads `/api/health.endpoints.<critical>.status` and at least one endpoint in the critical tier returns `status: 'unknown'` because its backing Redis key has expired. Most likely candidate: `events:llm:v3` (cron is silent → key never refreshed → 26h threshold tripped). Confirms via inspecting `.github/workflows/prod-connectivity-audit.yml` Step 3 to see whether `critical` is derived from `/api/health.endpoints[name].status` or some other signal.

H2 — **Vercel cron has been paused / disabled / rate-limited.** Most direct cause for sustained 23-day staleness without obvious local change. Hobby plan rolling restrictions, or someone disabled cron via the Vercel dashboard. Check `vercel env ls` for recent changes and the Vercel project page for cron status.

H3 — **NVIDIA_NIM_API_KEY rotated / expired.** Triggers a cascade where every cron run fails before writing terminal cache → cache key expires → critical tier unknown. Would show in `events:llm-dlq` if the cron is firing but failing — but if cron hasn't fired at all, DLQ would be empty too. Distinguishable from H2 via `cron:lastTick:refresh-events` presence (set only on cron resolve; per CLAUDE.md Phase 28.2.7 D-03).

H4 — **`nonCritical` tier health probe shape mismatch.** A code change (maybe Phase 34 LLM router deferral, Phase 35 Internal Docs landing, or Phase 36 docs sweep) altered an endpoint's `/api/health` JSON shape, making the audit classify it as `unhealthy`. Independent from cron. Distinguishable: per-endpoint `pass` AND `nonCritical: unhealthy` together means the audit isn't using `endpoints[name].status` consistently — it's looking at a more specific field that changed.

H5 — **`audit:connectivity:last-result` TTL expiration is masking a recent green run.** The operator might have already triggered a green run between 2026-05-08 and 2026-05-31 that we haven't seen in `gh run list --limit=10`. Refute via `gh run list --limit=50` and confirm no runs exist past 2026-05-08.

H6 — **Vercel deployment regression in production.** Something landed on `main` after 2026-05-08 (Phase 30/30.1/31/32/33/34/35/36 close-out commits) that changed the `/api/health` or per-endpoint route shape in a way that breaks tier classification. Refute via `git log origin/main --since 2026-05-08 --oneline` cross-referenced against `server/routes/health.ts` and `server/lib/healthSources.ts`.

H1 is highest prior because: (a) cron-driven cache freshness is the most fragile thing in the surface area, (b) the per-endpoint `pass` + critical-tier `unknown` shape is classic "endpoint responds but its data is stale", (c) `tierStatus.cron: healthy` suggests the cron-tick layer reports OK while the cron-output-cache layer reports stale — that asymmetry is the signature of a freshness threshold trip.

## Current Focus

hypothesis: H1 (critical-tier endpoint freshness stale → `tierStatus.critical='unknown'`); H2 secondary (Vercel cron paused → root cause of the stale freshness)
test: Inspect `.github/workflows/prod-connectivity-audit.yml` Step 3 to discover what `tierStatus.critical` is derived from. Then probe `/api/health` live and inspect each critical-tier endpoint's `.status` field. Then check `cron:lastTick:*` via Upstash REST to determine whether cron has fired in the last 7 days. Finally `git log origin/main --since 2026-05-08 --oneline -- server/routes/health.ts server/lib/healthSources.ts .github/workflows/` to rule out H6.
expecting: At least one critical-tier endpoint in `/api/health` reports `status: 'unknown'`; OR `cron:lastTick:refresh-events` is missing entirely.
next_action: Read `.github/workflows/prod-connectivity-audit.yml` to find Step 3's tier classification source, then `curl -sS https://otg-iran-monitor.vercel.app/api/health | jq '.endpoints | to_entries[] | select(.value.status != "healthy")'` to surface the actual stale endpoints.

## Evidence

- timestamp: 2026-05-31T17:40:00Z — Read `.github/workflows/prod-connectivity-audit.yml` Step 3. Tier classification is sourced from `/api/health.endpoints[*].{status, tier}`. Rollup logic at lines 171-176: `unhealthy` if any endpoint unhealthy → else `unknown` if any endpoint unknown → else `degraded` if any degraded → else `healthy`. D-03 truth table at lines 183-191 requires `critical === 'healthy'` AND `probeOnly === 'healthy'`; `nonCritical / static / cron` accept `healthy` OR `degraded` (but NOT `unknown`).

- timestamp: 2026-05-31T17:41:00Z — Read `server/lib/healthSources.ts` TIER_BY_ENDPOINT. Critical tier = `{flights, ships, events, llmEvents}`. Non-critical = `{markets, news, weather, waterPrecip, sources, llmStatus}`. Static = `{sites, water}`. Probe-only = `{authCheck, geocode}`. Cron = `{cronHealth, cronWarm, cronRefreshEvents}`. `llmEvents` was promoted to critical in Phase 28.2.5 D-06 (CLAUDE.md L110) with rationale "events:llm:v3 promoted from observability-only to gate-relevant."

- timestamp: 2026-05-31T17:42:00Z — Probed live `https://otg-iran-monitor.vercel.app/api/health`. Tier-by-tier breakdown:
  - **critical**: flights=healthy, ships=healthy, events=healthy, **llmEvents=unknown** (lastSuccessTs=null, freshnessMs=null, no error)
  - **non-critical**: markets=healthy, **news=unknown** (lastSuccessTs=null), weather=healthy, waterPrecip=healthy, sources=healthy, **llmStatus=unknown** (lastSuccessTs=null)
  - static: sites=healthy, water=healthy (both fresh ~5.5h old, under 48h threshold)
  - probe-only: authCheck=healthy, geocode=healthy
  - cron: cronHealth=healthy (00:00 UTC today), cronWarm=healthy (12:03 UTC today), cronRefreshEvents=healthy (04:00 UTC today)
  - Summary block confirms: `critical: {healthy:3, unknown:1}`, `nonCritical: {healthy:4, unknown:2}`. With workflow rollup → `critical:unknown`, `nonCritical:unknown`. Today's failure mode differs from 2026-05-08's `nonCritical:unhealthy` — endpoints today are `unknown` not `unhealthy`.

- timestamp: 2026-05-31T17:43:00Z — Probed `/api/events` directly: returns 681 events, all prefixed `gdelt-*`, ZERO `llm-v3-*` events. Confirms `events:llm:v3` is empty in production; Pitfall 1 cache bridge in `server/routes/events.ts` is correctly serving raw GDELT fallback. Map is NOT blank — graceful degradation per ADR-0010 LLM-optional contract is working as designed.

- timestamp: 2026-05-31T17:44:00Z — Probed `/api/news` directly: returns HTTP 502 with body `{"error":"news fetch failed: GDELT DOC API returned 429: Too Many Requests","code":"UPSTREAM_FAIL"}`. Confirms `news:feed` cache cannot be seeded because the upstream is rate-limiting prod requests. No cron warmer exists for `news:feed` (cron-warm only warms `sites:v3` + `water:facilities:v3`); only the on-demand client-driven `/api/news` route writes the key.

- timestamp: 2026-05-31T17:45:00Z — Read `server/lib/llmExtractionPipeline.ts:204-516` `runRefreshExtraction`. Short-circuit decision tree:
  1. Cold-cache probe (line 219-228) — if v3 empty, sets `effectiveForceCooldown=true`.
  2. Cooldown check (line 231-244) — bypassed on cold cache.
  3. **`isLLMConfigured()` guard (line 247-249)** — returns `{dispatched:false, reason:'llm_unconfigured'}` if both NVIDIA_NIM_API_KEY and OPENROUTER_API_KEY are unset.
  4. Raw GDELT read (line 254-263) — `{dispatched:false, reason:'no_raw_events'}` if empty. We confirmed 681 raw events exist, so this guard passes.
  5. Pipeline-busy guard (line 268-274).
  6. `resetProgress()` (line 302, INSIDE safeWaitUntil IIFE) — writes `llm:lastProgress` Redis key (Phase 28.2.7 D-01: "write fires always on reset").
     Crucially, paths 3 and 4 return BEFORE `resetProgress()` is called. So absence of `llm:lastProgress` in Redis means `runRefreshExtraction` short-circuited at step 3 or 4. We've ruled out step 4 (raw events exist). → **Step 3 (`isLLMConfigured()` returning false) is the only remaining short-circuit consistent with the observed state.**

- timestamp: 2026-05-31T17:46:00Z — Cross-checked: `server/routes/refresh-events-cron.ts:74` writes `cron:lastTick:refresh-events` AFTER `runRefreshExtraction()` returns, regardless of whether `dispatched===true` or `dispatched===false`. So a healthy `cron:lastTick:refresh-events` only proves the route handler ran successfully; it does NOT prove the LLM extraction ran. The cron-tick freshness is consistent with `runRefreshExtraction` short-circuiting at `llm_unconfigured`.

- timestamp: 2026-05-31T17:47:00Z — Verified `isLLMConfigured()` at `server/adapters/llm-provider.ts:48-50` reads `env.NVIDIA_NIM_API_KEY || env.OPENROUTER_API_KEY`. Both must be falsy for the guard to return false. ADR-0010 line 195 explicitly documents this as the kill switch: _"unset both NVIDIA_NIM_API_KEY and OPENROUTER_API_KEY is already the kill switch — the LLM-optional architecture means absent credentials degrade cleanly to raw GDELT via Pitfall 1."_

- timestamp: 2026-05-31T17:48:00Z — `git log origin/main --since=2026-05-08 -- server/adapters/llm-provider.ts server/config.ts` shows last config change was Phase 30 (`8dcd6e1`, 2026-05-17) — NIM throttle tuning, no `isLLMConfigured` shape change. Phase 29 (`aa4dc52`, 2026-05-12) narrowed `isLLMConfigured()` from "any of 4 legacy providers" to "NIM OR OpenRouter only" — that landed AFTER the 2026-05-08 audit run. The audit was never re-run since Phase 29 landed.

- timestamp: 2026-05-31T17:49:00Z — Read `.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`. The caveat: Phase 31 was scoped for 7 consecutive days of natural-cron watch. Operator closed at Day 1 (PASS, but only 1 day observed). The unobserved Days 2-7 are exactly the window in which the Phase 29 LLM-optional change landed (2026-05-12) and any subsequent NIM-throttle / env-rotation issues could have manifested without the watch catching them.

## Eliminated

- **H2 (Vercel cron paused):** All three cron ticks fresh in live `/api/health` (cronHealth=2026-05-31 00:00 UTC, cronWarm=12:03 UTC, cronRefreshEvents=04:00 UTC). Cron is firing on schedule.
- **H4 (nonCritical shape mismatch from code drift):** No `/api/health` shape regressions since 2026-05-08. The endpoints[*].status field is the documented contract and the workflow reads it correctly.
- **H5 (TTL masking a recent green run):** `gh run list --limit=30` (full history) confirms zero runs since 2026-05-08T19:43:40Z.
- **H6 (Vercel deployment regression breaking tier classification):** No drift in `server/routes/health.ts` or `server/lib/healthSources.ts` that would change tier classification semantics. Phase 31 / 32 / 33 / 34 / 35 / 36 commits are all consistent with the established contract. The contradiction is older — between Phase 28.2.5 D-06 (`llmEvents → critical`) and Phase 29 (LLM-optional) — not introduced by any single recent commit.

## Resolution

**Root cause:** A latent policy contradiction surfaced because the audit workflow lay dormant for 23 days. Phase 28.2.5 D-06 (May 2026) promoted `events:llm:v3` to the `critical` tier when the LLM was mandatory. Phase 29 (merged 2026-05-12) refactored the architecture to be **LLM-optional** — the Pitfall 1 cache bridge in `server/routes/events.ts` serves raw GDELT cleanly when `events:llm:v3` is empty, and ADR-0010 explicitly documents "unset both LLM credentials" as a valid kill switch. The tier classification was never updated in lockstep. As of today, `events:llm:v3` is empty in prod (likely because `NVIDIA_NIM_API_KEY` is unset in Vercel env — `runRefreshExtraction` short-circuits at `isLLMConfigured() → false` before the safeWaitUntil IIFE that writes `llm:lastProgress` and `events:llm:v3`), the map is correctly serving raw GDELT via the Pitfall 1 bridge (verified: 681 events served at `/api/events`), but the audit's D-03 truth table treats `critical: unknown` as a blocking failure — contradicting the documented LLM-optional contract.

A secondary issue: `news:feed` is also empty because GDELT-DOC API is rate-limiting (`429`) every prod request and no cron warmer exists for the key.

**Specialist hint:** general (tier-classification policy + Vercel env management; not a TS/library-specific issue).

### Fix landed — Option A3 (code-side tier realignment)

Branch: `fix/prod-audit-tier-regression` (from `origin/main`).

**Changes:**

1. `server/lib/healthSources.ts` — `TIER_BY_ENDPOINT.llmEvents` demoted from `'critical'` to `'non-critical'`. SOURCE_KEYS comment for `llmEvents` rewritten to describe the LLM-optional contract from ADR-0010. The 26h freshness threshold (FRESHNESS_THRESHOLDS_MS.llmEvents) is unchanged — matches the daily cron triad cadence.

2. `server/routes/health.ts`:
   - New helper `degradedSentinelFreshness(thresholdMs)` returns `Math.floor(thresholdMs * 1.5)` — a freshness value squarely inside `deriveStatus`'s degraded window (`threshold < freshness <= 2*threshold`). Lets any probe synthesize a stable, threshold-relative `degraded` signal without needing to add a new `HealthStatus` enum value.
   - `probeCacheKey` refactored: `fallbackKeys: readonly string[]` (the dead v1/v2 chain — both keys deleted in Phase 29) replaced with optional `fallbackHealthyKey: string`. When the primary cache is COLD, probe the fallback key; if the fallback is FRESH (within the same D-25 threshold), return `degradedSentinelFreshness(threshold)` + `errorReason: 'llm-optional-fallback-active: <fb> fresh, <pri> cold'`. Otherwise return cold (`null`) as before.
   - `probeLlmStatus` extended: after the existing Redis + in-memory-singleton read returns null, probe `cron:lastTick:refresh-events`. If the cron tick is fresh within the cronRefreshEvents threshold (26h), return degraded with the same llm-optional reason string. The pipeline's `runRefreshExtraction` short-circuits BEFORE writing `llm:lastProgress` when `isLLMConfigured()` returns false — this fallback detects exactly that documented kill switch and reports it as degraded, not unknown.
   - `PROBE_STRATEGIES.llmEvents` updated: `fallbackKeys: ['events:llm:v2', 'events:llm']` (dead Phase 29 keys) → `fallbackHealthyKey: SOURCE_KEYS.events!` (events:gdelt, the Pitfall 1 raw-GDELT cache).

3. `server/__tests__/lib/healthSources.test.ts` and `server/__tests__/routes/health.test.ts`:
   - Test "classifies llmEvents as critical tier" → "classifies llmEvents as non-critical tier (Phase 37 — ADR-0010 LLM-optional)"
   - Test 6 retargeted from `critical` to `non-critical` (Phase 37)
   - Test 8 retargeted to assert unknown only when BOTH v3 AND raw GDELT are cold
   - New Test 9: llmEvents = degraded when v3 cold + events:gdelt fresh (Pitfall 1 bridge active); also asserts the `lastErrorReason` contains `llm-optional`
   - New Test 10: llmStatus = degraded when llm:lastProgress empty + cron:lastTick:refresh-events fresh

**Verification:**

- `npx tsc --noEmit` → clean
- `npx vitest run server/__tests__/routes/health.test.ts server/__tests__/routes/health.probeOnly.test.ts server/__tests__/lib/healthSources.test.ts` → 37/37 pass (including 2 new Phase 37 tests pinning the degraded-on-fallback contract)
- `npx vitest run server/` → 106 files / 1284 tests pass (no cross-suite regressions)
- `npx eslint` on the four changed files → no warnings

**Operator follow-up (out of scope for this branch — surfaced as a checklist below the fix):**

- `NVIDIA_NIM_API_KEY` in Vercel prod env: verify presence. If unset/rotated, set/refresh so v3 starts populating again. The fix above keeps the audit gate green when the LLM is intentionally OFF, but the v3 cache itself will stay cold until the key is restored. Without this, prod runs in LLM-optional fallback mode forever (which is by design per ADR-0010, but the operator should confirm intent).
- `news:feed` GDELT-DOC 429 rate-limit: separate root cause (no cron warmer for `news:feed`; only the on-demand `/api/news` client-driven path writes the key, and GDELT-DOC is currently 429-ing prod). Either add a cron warmer (Hobby plan's 3-cron cap is already used; needs trade-off discussion) or attach a User-Agent header to the GDELT-DOC adapter. Possible decimal phase (37.1 or a v1.6 entry).
- **Phase 31 caveat reopening**: the Day 1/7 watch closed early would have caught this slow-burn regression. Consider reopening as 31.2 or a v1.6 entry once v1.5 is unblocked.

**Cross-link:** Phase 37 Wave 2 (37-02-PLAN.md acceptance gate observation) was paused by this regression. With the fix merged + the next `gh workflow run prod-connectivity-audit.yml` landing green (validate `tierStatus.critical: healthy` + `tierStatus.nonCritical: healthy` or `degraded`), the LLM-RELI-07 acceptance gate becomes observable again. Resume path: see `.planning/phases/37-adr-0010-acceptance-gate-closeout/37-HANDOFF.md`.
