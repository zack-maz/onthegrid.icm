# Operations Runbook

This runbook documents the known failure modes of the Iran Conflict
Monitor, with concrete detection, remediation, and prevention notes
for each. The format is adapted from the Google SRE book runbook
pattern: one section per failure mode, with Symptom / Detection /
Cause / Remediation / Prevention.

All code references are relative repo paths. All log patterns
assume the Pino `pino-pretty` transport in dev or raw JSON lines in
production (see [ADR-0006](./adr/0006-pino-and-zod-for-production-hardening.md)).

Every failure mode in this runbook is **grounded in real code paths
that exist in the repository today** — this is an as-built document,
not aspirational operations advice.

---

## Table of contents

1. [Upstash Redis unreachable](#1-upstash-redis-unreachable)
2. [GDELT lastupdate.txt returns 404 or stale](#2-gdelt-lastupdatetxt-returns-404-or-stale)
3. [Overpass API timeout](#3-overpass-api-timeout)
4. [AISStream WebSocket disconnect mid-collect](#4-aisstream-websocket-disconnect-mid-collect)
5. [Yahoo Finance throttling](#5-yahoo-finance-throttling)
6. [Vercel function timeout (300s default / 800s configured ceiling)](#6-vercel-function-timeout-300s-default-800s-ceiling)
7. [Upstash command budget exhausted](#7-upstash-command-budget-exhausted)
8. [CORS misconfiguration after deploy](#8-cors-misconfiguration-after-deploy)
9. [Vercel cron job failure](#9-vercel-cron-job-failure)
10. [LLM pipeline hung / /api/events returning 500](#10-llm-pipeline-hung--apievents-returning-500)
11. [LLM Pipeline Disabled / Keys Absent](#11-llm-pipeline-disabled--keys-absent)
12. [Common log query patterns](#common-log-query-patterns)
13. [NIM throttle handling](#13-nim-throttle-handling-429-burst--circuit-breaker-trip)
14. [Cron architecture lessons](#14-cron-architecture-lessons-phase-2826-fire-and-forget-iife-incident)
15. [Force-trigger /api/cron/refresh-events](#15-force-trigger-apicronrefresh-events-operator-only)
16. [prod-connectivity-audit.yml retry path](#16-prod-connectivity-audityml-retry-path-workflow_dispatch)

---

## 1. Upstash Redis unreachable

**Symptom:** API responses slow but not failing. First-request
latency on a cold-started function spikes from ~100 ms to 2-3 s.
Subsequent requests in the same function instance are fast again
(in-memory cache warms). The UI shows yellow connection dots in the
StatusPanel (stale) rather than red (error).

**Detection:**

- Pino log entries with `module: 'cache/redis'` and `err.message`
  containing `fetch failed`, `ETIMEDOUT`, `timed out after 2000ms`,
  or `ECONNREFUSED`. The `timed out after 2000ms` message
  specifically means the new `REDIS_OP_TIMEOUT_MS` timeout tripped
  (see [`server/cache/redis.ts`](../server/cache/redis.ts) lines
  19-42).
- `/health` endpoint returns `{"status": "degraded", "redis":
false}`.
- Upstash dashboard shows the Redis database in error state, or
  command count at quota, or missing credentials.

**Cause:**

- Upstash REST endpoint transient error, network partition, or
  auth token expired/rotated.
- `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` env vars
  missing or misconfigured after a deploy (the Upstash client will
  attempt `fetch(undefined)` and retry internally, which is the
  specific failure mode the `withTimeout` wrapper closes).
- Upstash daily command quota exhausted — see failure mode 7.

**Remediation:**

1. Check the [Upstash dashboard](https://console.upstash.com/) for
   an incident or quota hit on the Redis database used by this app.
2. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   are set in Vercel env (Project Settings → Environment Variables),
   scoped to the target environment (production vs preview).
3. Rotate the token from the Upstash dashboard if it's been leaked
   or you suspect credential compromise — then update the Vercel
   env var and redeploy.
4. **The in-memory fallback keeps the app serving data
   automatically.** `cacheGetSafe` and `cacheSetSafe` in
   [`server/cache/redis.ts`](../server/cache/redis.ts) catch every
   Upstash failure (throws, timeouts, network errors) and fall
   through to a process-local `Map<string, CacheEntry>`. The user
   experiences at most one slow request per function instance (the
   one that warms the in-memory cache); subsequent requests in the
   same instance are fast.
5. If the in-memory cache was cold and the upstream adapter also
   failed, the route serves `stale: true` from whatever the route
   adapter returned (usually an empty array with `lastFresh: 0`),
   never a 500. See the graceful degradation contract
   ([`docs/degradation.md`](./degradation.md)) for the full
   contract.

**Prevention:**

- `cacheGetSafe` / `cacheSetSafe` with the 2000 ms `Promise.race`
  timeout wrapper prevents hung Upstash calls from freezing a Vercel
  lambda (the single most important resilience fix from Phase
  26.4-03).
- The chaos test
  [`server/__tests__/resilience/redis-death.test.ts`](../server/__tests__/resilience/redis-death.test.ts)
  mocks `@upstash/redis` to throw on every call and asserts all 8
  cached routes return 200/degraded or 502/503, never 500. Runs on
  every CI build.
- `/health` endpoint intentionally _not_ rate-limited and _not_
  cached so it can be polled aggressively during incidents.

---

## 2. GDELT lastupdate.txt returns 404 or stale

**Symptom:** `/api/events` returns the same events repeatedly on
every poll or reports `stale: true`. Notification center stops
surfacing new alerts. The StatusPanel connection dot for events
turns yellow.

**Detection:**

- Pino log entries with `module: 'adapters/gdelt'` and
  `err.message: 404` or `err.status: 404`.
- GDELT `lastupdate.txt` in the cache shows a timestamp more than
  an hour old (normal cadence is 15 minutes).
- Manual check:

  ```bash
  curl -sS http://data.gdeltproject.org/gdeltv2/lastupdate.txt
  ```

  A healthy response is a few bytes listing the latest export
  file. A 404, an empty response, or a page older than an hour
  indicates the GDELT publishing pipeline is paused.

**Cause:**

- GDELT publishing pipeline paused or delayed. This happens
  occasionally during holidays, server maintenance, or upstream
  news-scraping failures on GDELT's side.
- Less commonly: GDELT changes their URL scheme or retires the v2
  endpoint without notice. (Has not happened in the lifetime of
  this project, but a recovery plan exists via the backfill path.)

**Remediation:**

1. Check http://data.gdeltproject.org/gdeltv2/lastupdate.txt
   manually. If it 404s or is stale, the outage is upstream — wait
   15-60 minutes.
2. If persistent, hit the backfill endpoint to force a direct URL
   construction from yesterday's data:

   ```bash
   curl -sS 'https://your-deploy/api/events?backfill=true' | jq
   ```

   The backfill path in
   [`server/routes/events.ts`](../server/routes/events.ts)
   bypasses `lastupdate.txt` and directly constructs 4
   files/day-sampled GDELT URLs. It's gated by a 1-hour cooldown
   via the `events:backfill-ts` Redis key to prevent tight retry
   loops.

3. The backfill cooldown check is now wrapped in try/catch via
   `shouldBackfill()` and `recordBackfillTimestamp()` helpers
   (Phase 26.4-03) so a Redis failure doesn't propagate and the
   backfill attempts anyway — GDELT rate-limits itself via HTTP
   caching so repeat attempts are safe.
4. As a last resort: the `events:gdelt` Redis key holds the last
   good snapshot under a hard TTL that's 10× the logical TTL, so
   stale-but-servable data remains available for hours even if
   refreshes are failing.

**Prevention:**

- 1-hour backfill cooldown via `events:backfill-ts` Redis key
  prevents tight backfill retry loops exhausting the command
  budget.
- Vercel cron endpoint `/api/cron/warm` proactively refreshes the
  cache before it goes stale during low-traffic periods.
- Events route serves stale data with `stale: true` on upstream
  failure rather than propagating a 500, so the UI shows yellow
  dots instead of blank entity arrays.

---

## 3. Overpass API timeout

**Symptom:** `/api/sites` or `/api/water` first-load hangs for more
than 30 seconds, then returns an empty array with `stale: true`.
Subsequent loads within the 24 h cache window are instant.

**Detection:**

- Pino entries with `module: 'adapters/overpass'` or
  `module: 'adapters/overpass-water'` and `err.message: timeout`
  or `504`.
- Vercel function duration metric shows the route approaching the
  30 s route-level timeout cap.
- `sites:overpass` or `water:facilities` Redis keys missing or
  showing very old `fetchedAt` timestamps.

**Cause:**

- Overpass query is expensive for the full Middle East bounding
  box (5 facility types × ~4300 named features for water, or
  5 site types × the same region for sites). Primary Overpass
  endpoint (`overpass-api.de`) occasionally timeouts under load.
- Core/extended country split can partially fail — Phase 26.1
  added the distinction so the 12 core countries must succeed
  but the 11 extended countries are best-effort.

**Remediation:**

1. The adapter auto-retries against the `private.coffee` mirror on
   failure. Check Pino logs for `trying mirror` or
   `falling back to private.coffee`. See
   [`server/adapters/overpass.ts`](../server/adapters/overpass.ts)
   for the fallback chain.
2. If both Overpass and the mirror time out, the existing cache
   stays served — sites and water facilities are static
   infrastructure with a 24 h TTL, so the app continues functioning
   with yesterday's data.
3. Manual cache warm: force a fresh fetch with

   ```bash
   curl -sS 'https://your-deploy/api/sites?refresh=true'
   curl -sS 'https://your-deploy/api/water?refresh=true'
   ```

   The `refresh` query param is gated in production behind a
   `user-agent: vercel-cron` check to prevent abuse; for manual
   operator intervention, run the equivalent Overpass query
   locally (see the `queryOverpass` helper in the adapter) and
   populate the cache via a one-off node script.

4. If Overpass is down globally, reduce the query bbox in
   `overpass-water.ts` / `overpass.ts`, re-run locally, and warm
   cache from a local dump. This is an emergency procedure — the
   layer is a nice-to-have, not a core product dependency.

**Prevention:**

- Tiered query strategy from Phase 26.1: core country list must
  succeed, extended list is best-effort (partial data is better
  than no data).
- Primary endpoint + `private.coffee` mirror fallback.
- 24 h Redis cache means the Overpass query runs at most once per
  day under normal operation.
- Route-level 30 s timeout in
  [`server/routes/water.ts`](../server/routes/water.ts) returns an
  empty array with `stale: true` on timeout rather than propagating
  a 500 — the frontend degrades gracefully.

---

## 4. AISStream WebSocket disconnect mid-collect

**Symptom:** `/api/ships` returns fewer ships than expected, or an
empty array. The StatusPanel connection dot for ships turns yellow
(stale) or red (error).

**Detection:**

- Pino entries with a `module: 'adapters/aisstream'` context and
  WebSocket close codes (1006, 1008, 1011) in the error message.
- Response headers show AISStream auth failures via the x-ratelimit
  headers if the upstream is reachable but rejecting our token.
- Empty `ships:ais` Redis key after a fresh collect window.

**Cause:**

- AISStream rate-limits on the auth token. The free tier caps
  bandwidth per connection.
- WebSocket handshake fails due to auth token rotation,
  AISStream-side maintenance, or transient network.
- `AISSTREAM_API_KEY` env var missing or expired.

**Remediation:**

1. Verify `AISSTREAM_API_KEY` is set in Vercel env (Project
   Settings → Environment Variables, production scope). If
   missing, the ships layer is silently disabled (no error, just
   no ships on the map).
2. Rotate the key at https://aisstream.io/ if rate-limited.
3. The on-demand connect pattern means each `/api/ships` request
   opens its own WebSocket, collects for a fixed window, and
   closes — one failed request doesn't poison subsequent ones.
   Retry the request.
4. If the layer is persistently broken, the ships toggle can be
   turned off in the UI without affecting any other layer.

**Prevention:**

- On-demand connect + collect for N ms + close pattern (no
  persistent WebSocket) — every request is isolated. A failure
  on one poll doesn't compound.
- Ship data has a 120 s stale threshold on the client; the ship
  layer auto-clears if no fresh data arrives within that window,
  so stale ships don't persist on the map.
- AISStream is an optional dependency — the app works without it,
  just without the ships layer.

---

## 5. Yahoo Finance throttling

**Symptom:** `/api/markets` returns stale data or an empty
instruments array. The Markets slot in the UI shows "—" for
prices.

**Detection:**

- Pino entries with `module: 'adapters/yahoo-finance'` and HTTP
  429 or 403 status codes.
- `markets:yahoo` Redis key missing or very old.
- Yahoo Finance responses contain CAPTCHA challenge markup instead
  of JSON.

**Cause:**

- Yahoo's unofficial financial data API aggressively rate-limits
  repeat requests and occasionally blocks requests with outdated
  User-Agent strings.
- Our 60 s poll interval is at the threshold of what Yahoo will
  tolerate from a single source. A warm Vercel instance under
  moderate traffic should be fine; bursty traffic can trip it.

**Remediation:**

1. The 60 s cache TTL should prevent thundering herds. If the
   cache is breached (e.g. cache wiped after a deploy), wait 5
   minutes for Yahoo to cool down.
2. Check if the User-Agent in
   [`server/adapters/yahoo-finance.ts`](../server/adapters/yahoo-finance.ts)
   needs updating. Yahoo occasionally blocks outdated UA strings
   — rotate to a current browser UA and redeploy.
3. If persistent, increase the cache TTL for markets from 60 s to
   120 s temporarily to reduce upstream pressure. The markets
   layer is a secondary product signal; it can tolerate longer
   staleness.
4. Last resort: disable the markets layer via the UI toggle. The
   core map still works.

**Prevention:**

- 60 s Redis cache aligns with Yahoo's tolerance for repeat
  requests.
- Per-instrument batching in a single upstream call (one request
  for all 5 instruments) rather than 5 separate requests.
- Markets is explicitly a soft dependency — the app doesn't depend
  on it for any other layer's behavior.

---

<a id="6-vercel-function-timeout-300s-default-800s-ceiling"></a>

## 6. Vercel function timeout (300s default / 800s configured ceiling)

**Symptom:** `504 Gateway Timeout` on long-running routes. Most commonly `/api/cron/refresh-events` (which runs the v3 LLM extraction; expected to take ~10 minutes in the worst case under NIM throttle pressure). Less commonly on `/api/water`, `/api/sites`, or `/api/events` first-load after a deploy.

**Detection:**

- Vercel function logs show `ERROR: Task timed out after 800.00 seconds` (or `300.00` if `maxDuration` is omitted from the function in `vercel.json`).
- Vercel dashboard → Deployments → Functions tab shows the affected function's p99 duration approaching the configured `maxDuration`.
- For `/api/cron/refresh-events` specifically: `events:llm-summary:v3` shows `completedAt` unset hours after `startedAt`; `cron:lastTick:refresh-events` not updated.

**Cause:**

- Historical note: the pre-Phase-29 Hobby plan baseline was a hard 10-second timeout (the framing this section retained until Phase 36 D-14). Phase 29 D-08 upgraded to Vercel Pro and set `vercel.json functions."api/vercel-entry.js".maxDuration: 800` to accommodate worst-case LLM extraction runs (~10 minutes). The live ceiling is now 800s (Fluid-Compute-era default function timeout is 300s).
- Cold-start latency + upstream API latency together approaching the configured `maxDuration` on long-running paths. NIM throttle (Phase 30 / 34 measurements) is the dominant driver for `/api/cron/refresh-events`.
- Less commonly: Upstash command budget exhausted causing cache writes to fail silently; every request re-fetches upstream and accumulates latency.

**Remediation:**

1. For data routes (`/api/water`, `/api/sites`, etc.): retry. A warm cache responds in under 1 s.
2. For `/api/cron/refresh-events`: check `events:llm-summary:v3.lastError` for the failing provider (NIM circuit-breaker trip, OpenRouter dormancy, etc.). Cross-reference §13 NIM throttle handling.
3. If `maxDuration` was hit on extraction: the 90s `withBatchWatchdog` hard-kill (`server/lib/llmExtractorWatchdog.ts`) should have caught it before the function timeout; if it didn't, the watchdog is bypassed — check `LLM_BATCH_TIMEOUT_MS` env override.
4. Manually warm cache via `/api/cron/warm` (already a configured cron at 12:00 UTC); not required for incident response but accelerates recovery.

**Prevention:**

- `vercel.json functions."api/vercel-entry.js".maxDuration: 800` (Phase 29 D-08) — locked in as part of the Vercel Pro upgrade. Do NOT reduce without a compelling reason; the extraction path needs it.
- `Cache-Control: max-age=0, s-maxage=N` CDN headers serve most data-route requests from Vercel Edge without ever invoking the function.
- 2000 ms `REDIS_OP_TIMEOUT_MS` wrapper in [`server/cache/redis.ts`](../server/cache/redis.ts) caps hung Redis calls — leaves headroom for actual route logic.
- 90s `withBatchWatchdog` in [`server/lib/llmExtractorWatchdog.ts`](../server/lib/llmExtractorWatchdog.ts) hard-kills batch runs before they approach `maxDuration`; AbortController + generation counter prevents late-resolve cache clobber.
- Per-route timeout discipline: each upstream adapter wraps fetch with a fail-fast timeout (Overpass, Open-Meteo, NIM all bounded).

---

## 7. Upstash command budget exhausted

**Symptom:** All cache operations start failing with 429 after the
daily budget hits the quota. Visually identical to failure mode 1
(Upstash unreachable): yellow connection dots, stale responses,
slower API responses, `/health` reports
`{"status": "degraded", "redis": false}`.

**Detection:**

- Pino entries with `err.message` containing `rate limit exceeded`
  from Upstash.
- Upstash dashboard shows command count at or above the daily
  quota (~500 K commands/day on the free tier).
- Clock in the `/health` output is close to UTC midnight — quotas
  reset at UTC midnight on the free tier.

**Cause:**

- Scraper or crawler traffic bypassing the public rate limiter
  baseline (60 req/min per IP in `rateLimiters.public`, raised
  from 6 req/min in Phase 28.1 — see
  [`server/middleware/rateLimit.ts`](../server/middleware/rateLimit.ts)
  lines 100-120).
- Misconfigured polling cadence — a client polling every second
  instead of every 30 seconds would blow through the budget in
  hours.
- Runaway cache loop bug causing repeated cache writes to the
  same key.
- Legitimate usage spike during a news event.

**Remediation:**

1. **Identify the source of the command spike** via Pino log
   analysis. Filter by `module: 'cache/redis'` and group by
   request IP (in dev) or by route. The chatty module or route is
   the culprit.
2. **Tighten the public rate limiter tier** — edit
   `rateLimiters.public` in
   [`server/middleware/rateLimit.ts`](../server/middleware/rateLimit.ts)
   from 60 req/min down to (e.g.) 30 or 15 req/min and redeploy.
   This only affects public traffic; legitimate UI polling respects
   its own per-endpoint limiters, and a valid `DASHBOARD_PASSWORD`
   Bearer bypasses this tier entirely.
3. **Tighten the per-endpoint rate limiter** for the chatty route
   if scraper-driven. Each endpoint has a tuned ceiling; they can
   be dropped in an emergency.
4. **Wait for the daily reset at UTC midnight.** The in-memory
   fallback keeps the app serving data during the outage window.
5. **Emergency: upgrade the Upstash plan** to a paid tier with a
   higher command budget. Reversible.

**Prevention:**

- Per-endpoint rate limiters in
  [`server/middleware/rateLimit.ts`](../server/middleware/rateLimit.ts)
  (Phase 26.3 CLN-10) cap per-IP traffic per route.
- Public baseline tier `rateLimiters.public` (Phase 26.4-04;
  raised to 60 req/min in Phase 28.1) prefixed `ratelimit:public`
  runs _before_ per-endpoint limiters for any `/api/*` request,
  protecting against scraper abuse of the live demo URL. A valid
  `DASHBOARD_PASSWORD` Bearer skips this tier (per-endpoint tiers
  still apply).
- `public/robots.txt` disallows `/api/*` and `/health` so
  well-behaved crawlers never touch the upstream APIs.
- The in-memory fallback (failure mode 1) degrades gracefully
  when Upstash rejects commands — so a budget-exhausted state is
  slow-and-stale, not a full outage.

---

## 8. CORS misconfiguration after deploy

**Symptom:** Browser DevTools Network tab shows CORS errors on
`/api/*` requests. Frontend loads (SPA assets are served) but all
entity layers are blank because their fetch calls fail.

**Detection:**

- Browser DevTools: red blocked requests in the Network tab with
  `CORS error` or
  `Access to fetch at ... has been blocked by CORS policy`.
- Preflight `OPTIONS` requests show no `Access-Control-Allow-Origin`
  header in the response.
- Server Pino logs show the requests arriving and being served
  with `cors` middleware stripping the response headers.

**Cause:**

- `CORS_ORIGIN` env var doesn't match the deployed frontend origin.
  Most common on preview deploys where the URL is dynamic (e.g.
  `otg-iran-monitor-git-feature-branch.vercel.app`) and the
  env var is set to the production URL.
- Default CORS*ORIGIN is `*` (graceful config loader), so a
  missing env var is safe — a \_wrong\* env var is worse than a
  missing one.

**Remediation:**

1. **For preview deploys:** set `CORS_ORIGIN=*` in the Vercel
   preview environment (Project Settings → Environment Variables
   → Preview). This is safe because the app is public and
   unauthenticated.
2. **For production:** set `CORS_ORIGIN` to the exact origin of
   the production frontend URL (e.g.
   `https://otg-iran-monitor.vercel.app`), save, and redeploy.
3. Test after the redeploy with:

   ```bash
   curl -sSI -H 'Origin: https://your-frontend.example' 'https://your-api/api/health' | grep -i access-control
   ```

   A healthy response includes
   `Access-Control-Allow-Origin: https://your-frontend.example`.

**Prevention:**

- Default `CORS_ORIGIN=*` in the graceful config loader (Phase 14) prevents the "missing env var" flavor of this bug.
- Setting the production `CORS_ORIGIN` explicitly to the exact
  origin during the initial deploy makes preview deploys fall
  back to `*` cleanly.

---

## 9. Vercel cron job failure

**Symptom:** Cache grows progressively stale (responses show
timestamps hours old) even though the Vercel cron schedule is
configured to warm it. Users see yellow connection dots across
multiple layers even during low-traffic periods.

**Detection:**

- Vercel dashboard → Crons → shows recent runs with error status
  or no recent runs at all.
- `/api/cron/health` endpoint returns failed or missing timestamps
  for the warm routes.
- The `events:backfill-ts`, `water:facilities`, `sites:overpass`,
  or similar Redis keys all showing `fetchedAt` timestamps older
  than the cron schedule would imply.

**Cause:**

- `vercel.json` `crons` array misconfigured (bad schedule syntax,
  wrong endpoint path, missing auth).
- The cron endpoint itself is failing — e.g.
  `/api/cron/warm` times out because the function hits the
  configured 800s `maxDuration` ceiling (see failure mode 6).
- Vercel cron billing / plan limit reached (Pro allows up to 40
  cron entries; the project uses 3, so this is unlikely).

**Remediation:**

1. **Manually hit `/api/cron/warm`** to force a warm:

   ```bash
   curl -sS 'https://your-deploy/api/cron/warm' -H 'User-Agent: vercel-cron'
   ```

   The `User-Agent: vercel-cron` header is the production gate for
   the `refresh=true` query param (see
   [`server/routes/events.ts`](../server/routes/events.ts)).

2. **Check `vercel.json` `crons` array syntax.** Schedules are
   cron syntax (`"0 */15 * * *"`) pointing to an internal API
   route path. Wrong syntax silently disables the cron.
3. **Check the Vercel dashboard → Crons tab** for recent run
   history. Failed runs show the error; missing runs mean the
   schedule isn't being honored.
4. **If the cron endpoint is timing out**, see failure mode 6. The
   fix might be to split the warm endpoint into per-route warmers
   rather than a single warm-all endpoint.

**Prevention:**

- `/api/cron/health` endpoint surfaces failed runs — polling it
  from an external monitor catches cron failures before they
  become user-visible.
- Cache TTLs are intentionally longer than the cron schedule so
  a single missed warm doesn't cause an outage, only a bump in
  cold requests.
- Vercel cron billing is monitored via the dashboard.

---

## 10. LLM pipeline hung / `/api/events` returning 500

> **HISTORICAL — Phase 27.4.1 era. The v2 extractor and its Redis keys (`events:llm:v2`, `events:llm:v2:partial`) were deleted in Phase 29 (see [ADR-0010](adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md)). The terminal cache is now `events:llm:v3` with no partial-progress sidecar (Phase 35 SIMPLIFY-02). For a live v3 incident, use [§13 NIM throttle handling](#13-nim-throttle-handling), [§14 Cron architecture lessons](#14-cron-architecture-lessons), and [§15 Force-trigger runbook](#15-force-trigger-runbook). The diagnosis + recovery commands below are preserved as a postmortem record only.**

**Symptom:** `/api/events` returns HTTP 500 with `TypeError: events.map is not a function` or `llmCachedRef.data is not iterable`. Map either shows stale v1 data or goes blank depending on which cache path failed.

**Root cause (Phase 27.4.1 era, fixed in `a5c8846` + `e26ceca`):** shape drift between the v2 extractor's partial writes and the terminal reader's expected `ConflictEventEntity[]`. The fix splits the two concerns across two Redis keys:

- `events:llm:v2` — terminal, `ConflictEventEntity[]`, written only by `server/routes/events.ts:~1016` after geocoding completes. Served to users.
- `events:llm:v2:partial` — observability-only, `LLMCachePayload` envelope `{events, progress: 'N/M', complete, generatedAt}`, written per-batch by `writePartialCache` in `server/lib/llmEventExtractor.v2.ts`. NEVER served to users.

### Diagnosis

```bash
REDIS_URL=$(grep UPSTASH_REDIS_REST_URL .env | cut -d= -f2 | tr -d '"')
REDIS_TOKEN=$(grep UPSTASH_REDIS_REST_TOKEN .env | cut -d= -f2 | tr -d '"')

# Check terminal key shape — should be a JSON array starting with [
curl -s -H "Authorization: Bearer $REDIS_TOKEN" "$REDIS_URL/get/events:llm:v2" | head -c 100

# Check partial key — should be an envelope starting with {"events":[
curl -s -H "Authorization: Bearer $REDIS_TOKEN" "$REDIS_URL/get/events:llm:v2:partial" | head -c 100

# Check LLM pipeline progress
curl -s http://localhost:3001/api/events/llm-status | jq '{stage, completedBatches, totalBatches, watchdogTimeoutCount}'
```

### Recovery

**If `events:llm:v2` contains envelope data (regression):**

```bash
# Clear it — Pitfall 1 bridge will serve v1 cache automatically
curl -s -X POST -H "Authorization: Bearer $REDIS_TOKEN" "$REDIS_URL/del/events:llm:v2"
```

The reader at `server/routes/events.ts:675` now calls `coerceCachedEvents` which degrades an unexpected envelope to `[]` instead of throwing, so this case should no longer produce HTTP 500 as of `e26ceca`.

**If v2 extractor is stuck (batch N/M not advancing):**

```bash
# Clear the pipeline cooldown so a retrigger can fire
curl -s -X POST -H "Authorization: Bearer $REDIS_TOKEN" "$REDIS_URL/del/events:llm-process-ts"

# Check the watchdog-timeout counter — if it's incrementing, the extractor
# is recovering on its own; if 0 and no progress, the loop is truly hung
# and the server needs a restart
curl -s http://localhost:3001/api/events/llm-status | jq '.watchdogTimeoutCount'
```

### Tuning `LLM_BATCH_TIMEOUT_MS`

> **v3-era default:** 120000ms (120s) hard-kill, single-tier (Phase 30 SIMPLIFY-03 retired the 60s soft-warn). The historical 90s + 60s framing below applies to the v2 extractor only.

Default 120000ms (120s) hard-kill. Raise if NIM is consistently exceeding 120s under
high-traffic conditions (check `routingTrace` `skipReason: "timeout_watchdog"` entries
in the DLQ at `events:llm-dlq`):

```bash
# .env — takes effect on next server restart (node --watch does not reload env)
LLM_BATCH_TIMEOUT_MS=120000
```

The watchdog is a safety net, not a performance optimizer. Too-aggressive
timeouts false-positive DLQ legitimate slow batches.

### Prevention

- `events:llm:v2:partial` writes are type-enforced by `LLMCachePayload` —
  any future regression writing to the terminal key would trip the
  reader's `toEntityArray` guard, degrading to empty-array-served rather
  than 500.
- Server test suite (`npx vitest run server/`) includes integration tests
  for the watchdog + cache accumulation paths in
  `server/__tests__/lib/llmEventExtractor.v2.test.ts`.

### Why this matters

- **Severity:** the map goes blank if no v1 bridge cache is available;
  with v1 available, the bridge keeps the map rendering enriched events
  while the v2 path recovers. Graceful degradation contract holds.
- **Related commits:** `a5c8846` (partial key split), `e26ceca` (reader
  defense-in-depth). See CHANGELOG.md Phase 27.4.1 entry for the full
  incident narrative.

---

## 11. LLM Pipeline Disabled / Keys Absent

**Symptom:** Operator wants to disable LLM enrichment entirely, OR the
NIM + OpenRouter keys are temporarily revoked, OR a billing-test
scenario. The map must continue to render events from raw GDELT
through the Pitfall 1 cache bridge.

**Expected behavior:**

- `/api/events` returns events sourced from `events:gdelt` (raw GDELT,
  not LLM-enriched).
- `events:llm:v3` Redis cache stays empty (or expires naturally).
- `/api/cron/refresh-events` early-returns with
  `reason: 'llm_unconfigured'`.
- DevApiStatus API Health tab shows "Events (LLM)" row in
  unknown/degraded state; "Events (raw)" row in healthy state.

### Operator smoke test

1. Unset both LLM provider keys in the Vercel project's environment
   variables for the Production scope:
   - `NVIDIA_NIM_API_KEY`
   - `OPENROUTER_API_KEY`

   Dashboard: https://vercel.com/zack-mazs-projects/otg-iran-monitor/settings/environment-variables

2. Redeploy production so the new env state takes effect:

   ```bash
   vercel --prod
   ```

3. Confirm `/api/events` still returns events (sourced from raw GDELT
   through the Pitfall 1 cache bridge):

   ```bash
   curl -s https://otg-iran-monitor.vercel.app/api/events | jq '.data | length'
   ```

   Expected: a number greater than 0. If 0 or null, the GDELT raw
   cache is also empty — fall back to failure mode 2 (GDELT
   lastupdate.txt returns 404 or stale) for that diagnosis.

4. Confirm the response shape is raw GDELT (not LLM-enriched):

   ```bash
   curl -s https://otg-iran-monitor.vercel.app/api/events | jq '.data[0].data | keys'
   ```

   Expected keys: the raw-GDELT shape (CAMEO code, actors, Goldstein,
   mentions, source URL). LLM-enriched fields like `enrichedSummary`,
   `geocodeProvenance`, `precision`, and `confidence` should be
   absent.

5. Open the dashboard and load the DevApiStatus API Health tab
   (Bearer-gated in production — auth in via the dashboard password).
   Confirm:
   - "Events (raw)" row is **healthy** (probes `events:gdelt`).
   - "Events (LLM)" row is **unknown** or **degraded** (probes
     `events:llm:v3`, which stays empty).
   - The map UI renders events as expected — no blank canvas.

### Recovery (re-enable LLM)

1. Restore both env vars in the Vercel dashboard (same path as smoke
   step 1) with their previous values.

2. Redeploy:

   ```bash
   vercel --prod
   ```

3. Force-trigger the `/api/cron/refresh-events` cron so the cache
   fills immediately instead of waiting for the next 4am UTC tick:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     'https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true'
   ```

   `force=true` bypasses the 15-minute cooldown (`events:llm-process-ts`
   Redis key). The cron's cold-cache self-heal path also fires
   automatically on the next natural tick if you skip this step.

4. Watch the function logs for the >300s extraction run:

   ```bash
   vercel logs --since 10m | grep cron/refresh-events
   ```

   On success, the cron logs `runRefreshExtraction` completing with a
   batch count and a non-zero enrichedCount; on NIM-throttle days the
   watchdog kills batches and the DLQ fills (see failure mode 10 for
   the hung-pipeline pattern).

5. Re-run the smoke test's step 4 against `/api/events` — the response
   shape should now include the LLM-enriched fields, and the
   DevApiStatus "Events (LLM)" row should flip back to healthy once
   the cache has data.

### Why this matters

- **Severity:** NONE — by design. LLM-RELI-05 makes this a documented
  and tested mode, not a degraded state. The Pitfall 1 cache bridge
  in `server/routes/events.ts` is the load-bearing fallback that
  guarantees the map renders raw GDELT events when no LLM cache is
  available; the cron's `runRefreshExtraction` helper early-returns
  with `reason: 'llm_unconfigured'` when both keys are absent, so no
  budget is consumed and no errors propagate.
- **CI guard:** `server/__tests__/routes/llm-optional.test.ts`
  mechanically locks the contract on every PR — it mocks both
  `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` as undefined, hits
  `/api/events` through the Express harness, and asserts the
  response is sourced from raw GDELT, not from `events:llm:v3`. If a
  future refactor reintroduces a hard LLM dependency, that test
  fails before the change ships.
- **Related:** see "Pitfall 1 Cache Bridge" in the CLAUDE.md
  Serverless Cache registry for the bridge contract, and
  [ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) for the
  architectural rationale behind the v1.5 cascade narrowing
  (Cerebras + Groq removed; NIM + OpenRouter only) plus the
  optional-LLM design.

---

## Common log query patterns

These are grep-friendly patterns for filtering Pino log output (raw
JSON in production, `pino-pretty` in dev). In production, pipe
Vercel logs through `jq` or a log aggregator to filter by the
structured fields.

**By module (log source):**

```bash
# Upstash Redis cache layer
jq 'select(.module == "cache/redis")' vercel.log

# GDELT conflict events adapter
jq 'select(.module == "adapters/gdelt")' vercel.log

# Overpass (sites + water)
jq 'select(.module == "adapters/overpass" or .module == "adapters/overpass-water")' vercel.log

# AISStream
jq 'select(.module == "adapters/aisstream")' vercel.log

# Yahoo Finance markets
jq 'select(.module == "adapters/yahoo-finance")' vercel.log
```

**By request ID (trace a single request end-to-end):**

```bash
# Find all log lines for a single request (the X-Request-ID header
# is propagated into every log line by pino-http genReqId)
jq 'select(.req.id == "YOUR_REQUEST_ID")' vercel.log
```

**By error level:**

```bash
# All warnings and errors
jq 'select(.level >= 40)' vercel.log

# Errors only (pino level 50)
jq 'select(.level == 50)' vercel.log
```

**Verifying redaction is working:**

```bash
# Sanity check: no authorization headers appearing in logs
grep -i 'authorization.*[^[]REDACTED' vercel.log | grep -v REDACTED
# Should return no output. If it does, the redactPaths config in
# server/lib/logger.ts needs updating.
```

**Rate limiter hits:**

```bash
jq 'select(.res.statusCode == 429)' vercel.log
```

**Cache degradation indicators:**

```bash
# Responses marked degraded (in-memory fallback)
jq 'select(.degraded == true)' vercel.log

# Responses marked stale (upstream failed)
jq 'select(.stale == true)' vercel.log
```

---

## 12. Quarterly LLM Health Probes

Run `npm run probe:openrouter` once per quarter (or when the
`docs/architecture/llm-pipeline-reliability.md` Cascade Reality
section becomes >90 days old). Output is
`.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-or-pulse-snapshot.json`
plus a stdout `Decision` line. If `decision !== 'nim-only'`
(i.e., `rateLimitedPct < 90`), the OpenRouter free-tier may
again be a viable fallback — see
[`docs/architecture/llm-pipeline-reliability.md`](architecture/llm-pipeline-reliability.md)
§"Path to Re-Enable" for the cascade-restore steps. The probe
spends ~15% of the 200/day OpenRouter free-tier daily cap;
safe to re-run once per planning cycle.

---

## 13. NIM throttle handling (429 burst + circuit-breaker trip)

**Symptom:** v3 LLM extraction runs failing with sustained 429s from NIM. `events:llm-dlq` accumulating entries with `reason: 'throttled'`. Map continues to render (raw GDELT via Pitfall 1 bridge), but new events lack v3 enrichment for the affected extraction window.

**Detection:**

- Pino logs with `module: 'llm/freeClaudeRouter'` and HTTP status `429` clusters within the daily 4:00 UTC extraction window.
- `events:llm-eval-baseline:v3` accuracy drops at the next `/api/cron/health` run (eval-drift signal).
- `server/lib/llmCircuitBreaker.ts` opens (sliding 10-call window, >30% error rate trips a 5-minute pause).
- `/api/operator-status` `byBearer.replay24h` shows no operator force-triggers (so the throttle is from cron-only writes, not operator activity).

**Cause:**

- NIM ratelimits at ~40 requests/minute per token (Phase 30 measurement). The tuned `LLM_V3_CONCURRENCY=12` default targets ~26 req/min headroom under the cap, but batch bursts during retry can exceed the cap momentarily.
- Per CONTEXT.md `<canonical_refs>`: see [`docs/architecture/llm-pipeline-reliability.md`](./architecture/llm-pipeline-reliability.md) §"Multi-Provider Cascade (Phase 34)" for the empirical numbers and Path B remediation framing.
- OpenRouter cascade fallback would normally absorb the 429 burst, but OpenRouter is DORMANT per [ADR-0010 Phase 30.1 sub-block](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md). So NIM is the only path; throttle pressure has no relief valve.

**Remediation:**

1. Wait the 5-minute circuit-breaker cooldown. The watchdog will resume automatically on the next per-event invocation.
2. If circuit-breaker fails to close after 15 minutes: check `llm:tokens:nim:YYYY-MM-DD` for the daily token-budget counter. If hard cap (`budgetState: 'hard'`) was hit, the cascade bypasses NIM for the rest of the UTC day — operator can wait until next-day reset OR force-trigger via §15 with a fresh window.
3. Per Path B framing in [`llm-pipeline-reliability.md`](./architecture/llm-pipeline-reliability.md): if throttle is sustained > 1 hour, consider lowering `LLM_V3_CONCURRENCY` to 8 (env override) for the next deploy. Default is `12` for steady-state; `8` is a safer fallback under chronic throttle.
4. To resume manually: `GET /api/cron/refresh-events?force=true` with operator Bearer (see §15). Bypasses cooldown + self-heal.

**Prevention:**

- Tuned `LLM_V3_CONCURRENCY`, `LLM_BATCH_SIZE`, `LLM_BATCH_TIMEOUT_MS`, `BACKOFF_MS` defaults — see [`docs/architecture/llm-pipeline-reliability.md`](./architecture/llm-pipeline-reliability.md) "Tuned defaults reference" for the measured numbers.
- Circuit breaker (`server/lib/llmCircuitBreaker.ts`) — 5-min pause on >30% error rate in last 10 calls.
- Token-budget cap (`server/lib/llmTokenBudget.ts`) — soft 0.8 / hard 0.95 with 48h TTL.
- DLQ (`server/lib/llmDLQ.ts`) — bounded 200-entry / 7-day TTL captures failed extractions for retry triage.
- Watchdog (`server/lib/llmExtractorWatchdog.ts`) — 90s hard-kill prevents one stuck batch from blocking the whole extraction run.
- Pitfall 1 cache bridge (`server/routes/events.ts`) — terminal fallback to raw GDELT; map never goes blank during sustained throttle.
- Open item: re-enabling OpenRouter as a runtime fallback (currently DORMANT per Phase 30.1) would absorb throttle bursts. Decision deferred per [ADR-0010 Phase 30.1](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md); revisit if Pitfall 1 raw-GDELT fallback proves insufficient for operator quality bar.

---

## 14. Cron architecture lessons (Phase 28.2.6 fire-and-forget IIFE incident)

**Symptom:** Pre-Phase-29: `events:llm:v3` not updating between deploys. v3 extraction appeared to start (logs showed initialization) but never completed. `events:llm-summary:v3` had `startedAt` but no `completedAt`. Post-Phase-29: this failure mode is architecturally prevented (cron-only writer invariant).

**Detection (historical):**

- Vercel function logs showed v3 extraction initialization on `/api/events` requests, then no completion log.
- `events:llm:v3` stale for >24 hours despite continuous `/api/events` traffic.
- `events:llm-summary:v3.lastError` empty (no error was caught — the IIFE was killed silently).

**Cause (historical Phase 28.2.6 diagnosis):**

- Pre-Phase-29 v2 pattern triggered LLM extraction via a fire-and-forget IIFE from `/api/events` cache miss: `(async () => { await processEvents(); })();` with HTTP response sent immediately.
- Vercel Fluid Compute SILENTLY KILLS function instances once the HTTP response is sent, even if async work is still in flight. The IIFE was being terminated mid-extraction with no error surfaced.
- Documented in [ADR-0010 Phase 29 sub-block](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md). See also the Phase 28.2.6 phase folder under `.planning/milestones/v1.4-phases/` for the original incident diagnosis trail.

**Remediation (architectural — Phase 29 removed this failure mode):**

- v1 + v2 LLM extractors DELETED Phase 29 (Plans 04-06) per [ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md). No fire-and-forget IIFE path exists in the codebase.
- v3 extraction moved to cron-only trigger (`/api/cron/refresh-events`, daily 4:00 UTC).
- `/api/events` became cache-only — it serves `events:llm:v3` if present OR raw GDELT via Pitfall 1 bridge. It does NOT initiate extraction.

**Prevention (the anti-pattern that protects the system):**

- **Anti-pattern #17 (cron-only writer discipline):** ONLY `/api/cron/refresh-events` writes to `events:llm:v3`. Any new code that proposes writing to v3 production state from a non-cron path is reverted at code review. CLAUDE.md §LLM Event Pipeline names this invariant explicitly.
- Cold-cache self-heal: `runRefreshExtraction()` checks `events:llm:v3` size; if empty, bypasses the 15-min `events:llm-process-ts` cooldown. Prevents the v3 cache from being permanently empty after a Redis flush.
- Watchdog hard-kill (90s; see §13 + §10).
- `cron:lastTick:refresh-events` Redis sentinel (Phase 28.2.7 D-03) is written ONLY AFTER `runRefreshExtraction` resolves — honest-failure semantics. If the cron path is rewired to fire-and-forget, the sentinel stops advancing and `probeCronTick` flags it.
- **Regression detection:** if a new code path is added that writes to `events:llm:v3` outside the cron handler, the next `/api/cron/refresh-events` run will race-clobber it; symptoms look like flaky enrichment quality. Detect via: `git log -p server/routes/ server/lib/llmEvent*` greping for new `cacheSet*('events:llm:v3'` callsites outside `server/lib/llmExtractionPipeline.ts`.

---

## 15. Force-trigger `/api/cron/refresh-events` (operator-only)

**Symptom:** Operator needs to refresh `events:llm:v3` outside the daily 4:00 UTC cron window — e.g., after a NIM throttle clearance, after a new event of operational interest landed in GDELT, or to verify a deploy fix.

**Detection:** N/A — this is operator-initiated, not a failure mode.

**Cause:** Operator decision. Common triggers:

- Operator confirmed via §13 that NIM throttle has cleared and wants to backfill the missed window.
- A high-significance event landed in GDELT during the gap between cron windows.
- Post-deploy verification of an extraction-path fix.

**Remediation (how to invoke):**

1. **Required env:** Either `CRON_SECRET` (cron-path Bearer, used by Vercel's own cron runner) OR `DASHBOARD_PASSWORD` (operator-path Bearer). The endpoint accepts both — the cron runs use `CRON_SECRET`; the operator force-trigger path uses `DASHBOARD_PASSWORD`.
2. **Invocation:** `curl -H "Authorization: Bearer $DASHBOARD_PASSWORD" "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"`
3. **What `force=true` bypasses:**
   - The 15-minute `events:llm-process-ts` cooldown sentinel.
   - The empty-cache self-heal logic (which the cron path already bypasses on cold cache).
4. **What it does NOT bypass:**
   - Circuit-breaker state (if open, the cascade still pauses NIM — see §13).
   - Token-budget cap (if `budgetState: 'hard'`, the cascade still bypasses NIM for the rest of the UTC day).
   - 50/24h per-Bearer replay quota (separate quota; force-trigger is rate-limited per `operator:replay-quota:{fingerprint}:{YYYY-MM-DD}`).
5. **Expected response:** `{status: 'ran', startedAt: '...', completedAt: '...', summary: {...}}` or `{status: 'skipped', reason: 'cooldown_active'}` if Bearer-mismatch shielded the bypass.
6. **Audit trail:** Operator force-trigger appends a row to `operator:audit-log` (500-entry bounded set, 30d TTL). Surfaced in the API Health dashboard tab Operator Actions block.

**Prevention (when NOT to use force-trigger):**

- Routine daily refresh — the 4:00 UTC cron handles this; force-trigger wastes a quota slot.
- Suspected provider outage — first verify with §13; if NIM is truly down, force-triggering will just fail faster.
- Testing extraction logic in production — use a dev/preview deploy + dev `DASHBOARD_PASSWORD` instead.

---

## 16. `prod-connectivity-audit.yml` retry path (workflow_dispatch)

**Symptom:** `audit:connectivity:last-result` shows stale data (>24h old) OR `status: 'red'` OR `allTiersGreen: false` while the operator believes the system is actually healthy.

**Detection:**

- `/api/audit-status` returns `timestamp` more than 24 hours old.
- The API Health dashboard tab (Phase 28.2 W5 merge) shows the audit-result banner in degraded state.
- GitHub Actions tab for `otg-iran-monitor` shows the last `prod-connectivity-audit.yml` run as failed OR not run within the past 24 hours.

**Cause:**

- Scheduled GitHub Actions workflow `prod-connectivity-audit.yml` failed (transient network issue, GitHub Actions outage, expired GITHUB_TOKEN, etc.).
- Manual workflow_dispatch trigger not run after a known transient failure.

**Remediation:**

1. Open the GitHub Actions tab for `otg-iran-monitor`.
2. Select the `prod-connectivity-audit.yml` workflow.
3. Click "Run workflow" → workflow_dispatch trigger with default inputs.
4. Wait for completion (~2-5 minutes); confirm green run.
5. Verify `/api/audit-status` now returns fresh timestamp + `status: 'green'`.
6. **Expected payload shape** (the W-3 contract test pins this — see `server/__tests__/contract/audit-status-shape.test.ts`):

   ```json
   {
     "status": "green",
     "runId": "<gh-actions-run-id>",
     "timestamp": "<ISO-8601>",
     "endpoints": { "...": "..." },
     "durationMs": 1234,
     "allTiersGreen": true,
     "tierStatus": { "<tier>": { "status": "green", "evidence": {}, "timestamp": "..." } }
   }
   ```

**Prevention:**

- v1.5 acceptance gate (LLM-RELI-07): **3× consecutive `allTiersGreen=true`** runs unblocks v1.6 milestone close (Phase 37 territory). See [ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) for the acceptance-gate rationale.
- Workflow runs on a schedule; manual workflow_dispatch is the operator-controlled retry path.
- Audit-result endpoint (`/api/audit-status`) is degrade-open: no auth gate, returns `status: 'unknown'` if Redis is unreachable rather than failing closed. Prevents the audit surface from becoming an additional incident vector.

---

## See also

- [`docs/degradation.md`](./degradation.md) — graceful degradation
  contract that this runbook assumes as background.
- [`docs/adr/0001-upstash-redis-over-traditional-redis.md`](./adr/0001-upstash-redis-over-traditional-redis.md)
  — why Upstash, and the `REDIS_OP_TIMEOUT_MS` decision.
- [`docs/adr/0003-gdelt-v2-as-default-conflict-source.md`](./adr/0003-gdelt-v2-as-default-conflict-source.md)
  — GDELT upstream context for failure mode 2.
- [`docs/architecture/data-flows.md`](./architecture/data-flows.md)
  — per-source sequence diagrams matching each adapter named in
  this runbook.
- [`server/__tests__/resilience/redis-death.test.ts`](../server/__tests__/resilience/redis-death.test.ts)
  — chaos test that proves the degradation path for failure mode 1.

_Last updated: Phase 26.4 Plan 06. This runbook is an as-built
document grounded in the code as of that phase. Add new failure
modes as they surface in production; do not edit historical
entries without marking the change date._
