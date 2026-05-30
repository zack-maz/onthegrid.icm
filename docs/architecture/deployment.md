# Deployment Architecture

The project deploys to Vercel as a hybrid: the Vite SPA is served as
static assets from the edge CDN, and every `/api/*` and `/health`
request is routed to a single serverless function. There's no long-
running server, no Docker, no Kubernetes — just static files and
per-request lambdas.

## Topology

```mermaid
flowchart TD
    user([Browser])

    subgraph vercel[Vercel]
        edge[Edge CDN<br/>respects Cache-Control<br/>s-maxage headers]
        static[Static Vite bundle<br/>dist/*]
        lambda[Serverless function<br/>api/vercel-entry.js<br/>tsup from server/vercel.ts<br/>Pro maxDuration 800s]
    end

    subgraph upstash[Upstash]
        redis[(Redis REST<br/>stateless cache)]
    end

    subgraph sources[Upstream data sources]
        external[OpenSky / adsb.lol / AISStream /<br/>GDELT v2 / GDELT DOC / Overpass /<br/>Yahoo / Open-Meteo / Nominatim]
    end

    subgraph crons[Vercel Cron Scheduler]
        health[/api/cron/health/]
        warm[/api/cron/warm/]
        refresh[/api/cron/refresh-events/]
    end

    user -->|HTTPS| edge
    edge -->|/ | static
    edge -->|/api/*, /health| lambda
    lambda --> redis
    lambda --> external

    crons -->|daily 00:00 UTC| lambda
    crons -->|daily 12:00 UTC| lambda
    crons -->|daily 04:00 UTC| lambda
```

- **Single serverless function.** `vercel.json` rewrites every
  `/api/*`, `/api/cron/*`, and `/health` path to
  `/api/vercel-entry`. This is a thin wrapper that calls the
  `createApp()` factory from
  [`server/app.ts`](../../server/app.ts) and hands the resulting
  Express app to `serverless-http`. One function, all routes.
- **Vercel Pro `maxDuration: 800` (Phase 29 D-08).** `vercel.json`
  pins `functions["api/vercel-entry.js"].maxDuration = 800` so the
  daily LLM extraction cron has the wall-clock headroom it needs
  (measured ~125s typical, ~10min worst-case during throttle).
  Hobby tier's 60s ceiling was incompatible with the v3 cron run.
- **Edge CDN first.** Every cached route emits a `Cache-Control`
  header with `s-maxage` and `stale-while-revalidate`, so a burst of
  identical requests never reaches the function. The lambda is a
  cache miss handler.
- **SPA fallback.** The last rewrite rule sends any non-matching path
  to `/index.html`, which lets React Router (if we had one — we
  don't) or vanity URLs work without per-route config.

## Build pipeline

```bash
npm run build
```

Runs three steps in sequence:

1. **`vite build`** — bundles the React app into `dist/` (hashed JS,
   CSS, assets).
2. **`tsup server/vercel.ts`** — bundles the server entrypoint and
   every imported file (including adapters, routes, middleware) into
   a single output file at `api/vercel-entry.js`. The Vercel runtime
   discovers `api/vercel-entry.js` directly via the
   `functions["api/vercel-entry.js"]` config in `vercel.json` — no
   separate stub layer.
3. **`tsc -b`** — typechecks the server and app projects end-to-end.
   Fails the build on any type error; there is no `any` escape hatch
   tolerated (strict mode + `noUncheckedIndexedAccess` on the server).

Output:

- `dist/` — Vite-built SPA, uploaded as static assets.
- `api/vercel-entry.js` — single-file serverless bundle
  (`maxDuration: 800` configured for the daily LLM cron).

## Cache strategy

Per-endpoint cache headers are set by the
[`cacheControl(sMaxAge, staleWhileRevalidate)`](../../server/middleware/cacheControl.ts)
middleware. The tuple is chosen per route in
[`server/index.ts`](../../server/index.ts):

| Route          | `s-maxage` | `stale-while-revalidate` | Reason                                 |
| -------------- | ---------- | ------------------------ | -------------------------------------- |
| `/api/flights` | 5s         | 25s                      | Match client poll cadence              |
| `/api/ships`   | 10s        | 20s                      | Ships move slower than flights         |
| `/api/events`  | 5min       | 10min                    | GDELT updates every 15 minutes         |
| `/api/sources` | 1min       | 1min                     | Static per-source config               |
| `/api/sites`   | 1h         | 23h                      | OSM infrastructure is near-static      |
| `/api/news`    | 5min       | 10min                    | Matches GDELT DOC update frequency     |
| `/api/markets` | 30s        | 30s                      | Half the client poll interval          |
| `/api/weather` | 10min      | 20min                    | Open-Meteo hourly grid                 |
| `/api/geocode` | 24h        | 24h                      | Address lookups are effectively static |
| `/api/water`   | 1h         | 23h                      | Facility list is near-static           |
| `/health`      | no-store   | —                        | Must reflect current state             |
| `/api/cron/*`  | no-store   | —                        | Cron results are single-use            |

The two-tier scheme — CDN `s-maxage` in front of Redis logical TTL in
front of Redis hard TTL in front of in-memory fallback — gives us
four layers of cache before a cache miss can bubble up to an upstream
call:

```mermaid
flowchart LR
    req[Request] --> edge{Edge CDN<br/>s-maxage?}
    edge -->|hit| return1[Return]
    edge -->|miss| logical{Redis<br/>logical TTL?}
    logical -->|hit fresh| return2[Return]
    logical -->|stale but<br/>within hard TTL| return3[Return stale:true]
    logical -->|miss| mem{In-memory<br/>fallback?}
    mem -->|hit| return4[Return degraded:true]
    mem -->|miss| upstream[Fetch upstream]
    upstream --> populate[Populate Redis + mem] --> return5[Return]
```

## Cron jobs

Scheduled from `vercel.json` — Vercel Hobby/Pro tier caps at 3 cron
entries; all three slots are in active use:

```json
{
  "crons": [
    { "path": "/api/cron/health", "schedule": "0 0 * * *" },
    { "path": "/api/cron/warm", "schedule": "0 12 * * *" },
    { "path": "/api/cron/refresh-events", "schedule": "0 4 * * *" }
  ]
}
```

- **`/api/cron/health`** (daily at 00:00 UTC) — pings `/health`
  internally, logs the degraded-vs-healthy state of every upstream;
  runs `runEval()` resolver-only accuracy baseline + adversarial-eval
  drift detection. Surfaces silent upstream outages before a user
  notices.
- **`/api/cron/warm`** (daily at 12:00 UTC) — pre-fetches the
  Overpass key sites + water facility queries so a cold lambda doesn't
  block a user-facing request on a multi-second Overpass call. This
  is especially important because Vercel lambdas get cold quickly on
  low-traffic periods.
- **`/api/cron/refresh-events`** (daily at 04:00 UTC, Phase 29 D-08
  cron-only writer discipline) — sole writer of `events:llm:v3`.
  Runs `runRefreshExtraction()` in
  [`server/lib/llmExtractionPipeline.ts`](../../server/lib/llmExtractionPipeline.ts)
  which invokes the v3 extractor against the latest GDELT window.
  Cold-cache self-heal bypasses the 15-min cooldown when
  `events:llm:v3` is empty. Operator force-trigger via
  `?force=true` with valid Bearer (`DASHBOARD_PASSWORD`).

All three cron endpoints are gated by `CRON_SECRET` Bearer
authentication in production (Vercel injects the header
automatically on scheduled invocations). The operator force-trigger
path on `/api/cron/refresh-events` accepts either `CRON_SECRET` or
`DASHBOARD_PASSWORD` as the Bearer.

## Environment variables

The authoritative env schema is the Zod schema in
[`server/config.ts`](../../server/config.ts). The `.env.example` file
is a snapshot of that schema and is drift-checked in CI by
`scripts/check-env-example.ts`.

**Required** (the app crashes at startup if these are missing in
production):

- `UPSTASH_REDIS_REST_URL` — Upstash REST endpoint URL.
- `UPSTASH_REDIS_REST_TOKEN` — Upstash REST API token.

**Optional** (gracefully degrade if missing — empty string means
unconfigured, and routes that depend on them return a clean 4xx):

- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` — OAuth for the
  OpenSky flight source. Without them, adsb.lol remains available.
- `AISSTREAM_API_KEY` — required for `/api/ships`. Without it the
  route returns an empty array.
- `ACLED_EMAIL` / `ACLED_PASSWORD` — historical; ACLED adapter is
  preserved but not active.

**Tuning parameters** (optional, have sane defaults):

- `EVENT_CONFIDENCE_THRESHOLD`, `EVENT_MIN_SOURCES`,
  `EVENT_CENTROID_PENALTY`, `EVENT_EXCLUDED_CAMEO`,
  `BELLINGCAT_CORROBORATION_BOOST`, `NEWS_RELEVANCE_THRESHOLD` —
  GDELT event scoring knobs. See `server/config.ts` for defaults and
  acceptable ranges.

**Test mode.** When `NODE_ENV=test` or `VITEST=true`, the schema
parser injects safe defaults for the Upstash vars so unit tests can
import server modules without hitting a real Redis. Production still
fails loud on missing required vars.

## Failover posture

Three layers of resilience, documented in order of most-likely to
least-likely failure:

1. **In-memory fallback when Upstash is unreachable.**
   `cacheGetSafe` / `cacheSetSafe` wrap every Redis op in a 2000ms
   `Promise.race` timeout and fall through to a process-local `Map`
   on error or timeout. The response envelope carries
   `degraded: true` so the client can surface a "cached" indicator.
   Validated by the Phase 26.3 chaos test
   ([`server/__tests__/resilience/redis-death.test.ts`](../../server/__tests__/resilience/redis-death.test.ts)).

2. **Stale-while-revalidate via CDN.** When Redis is healthy but an
   upstream is slow, the CDN's `stale-while-revalidate` window lets
   Vercel return the last known response immediately while triggering
   a background refresh. Worst case: users see data that's up to
   `(s-maxage seconds) + (swr seconds)` old before the next write.

3. **`/health` degraded state.** The `/health` endpoint inspects the
   last-seen timestamps of every cache key and returns a
   machine-readable JSON describing which upstreams are healthy,
   stale, or degraded. The cron health check logs this daily so
   monitoring can alert on it.

The philosophy is "degrade visibly, never crash." A 500 from this
service means a bug, not an upstream outage.

## See also

- [`system-context.md`](./system-context.md) — altitude above this.
- [`data-flows.md`](./data-flows.md) — altitude below this, showing
  per-source cache behavior.
- [`../../server/openapi.yaml`](../../server/openapi.yaml) — the
  canonical API contract, including rate-limit ceilings and response
  envelopes.
