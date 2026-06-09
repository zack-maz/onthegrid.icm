# Graceful Degradation Contract

This document describes what happens at each layer of the Iran
Conflict Monitor when a dependency fails or is unreachable. The app
is designed to stay useful under partial failure — a single broken
dependency should degrade the experience, never take down the whole
product.

This is the **contract** the app makes to operators and users: a
clear statement of which failure modes cause what visible effect,
so that operators know what "degraded" should look like and users
know that what they see is intentional, not a bug.

All contracts in this document are grounded in real code paths in
the repository as of Phase 26.4 and **proven by automated tests
where possible.** The Redis-death chaos test
(`server/__tests__/resilience/redis-death.test.ts`) exercises the
full cache-layer degradation path.

---

## Cache Layer: Upstash Redis

**Normal:** Every cache operation hits Upstash REST via the
`@upstash/redis` client. On hit, return the cached value. On miss,
fetch upstream, `cacheSetSafe` the result, return fresh.

**Degraded — Upstash unreachable, misconfigured, or timed out:**
`cacheGetSafe` and `cacheSetSafe` in
[`server/cache/redis.ts`](../server/cache/redis.ts) catch every
failure mode of the Upstash call:

- Synchronous throws from the `@upstash/redis` client (auth
  failure, JSON parse error, etc.)
- HTTP network errors (`fetch failed`, `ETIMEDOUT`,
  `ECONNREFUSED`)
- **Hung calls** — when `UPSTASH_REDIS_REST_URL` is missing or the
  network is partitioned, the client retries internally and
  blocks indefinitely. The `withTimeout` helper wraps both safe
  functions in `Promise.race` against a `REDIS_OP_TIMEOUT_MS =
2000` timeout, so the worst case is a 2-second wait before
  falling through. Added in Phase 26.4 Plan 03 after the chaos
  test exposed the gap.

On any of these failures, the safe wrappers fall through to a
process-local `Map<string, CacheEntry<T>>` called `memCache`.
Subsequent requests in the same function instance benefit from the
warmed in-memory cache. New function instances start with an empty
in-memory cache but still serve — the first request per instance
fetches upstream, the rest serve from memory.

**Contract:**

- **No user-facing 500s from Redis failures.** The chaos test
  asserts all 8 cached routes return 200-degraded or 502/503
  (upstream-specific), never 500.
- **Responses may be slower.** Until the in-memory cache warms,
  every request hits the upstream adapter. Typical first-request
  latency climbs from ~100 ms to 2-3 s.
- **`/health` endpoint reports `{status: 'degraded', redis:
false}`.** Consumed by Vercel cron and any external monitoring.
- **Degradation is transparent.** Responses with `degraded: true`
  in the response envelope signal to the UI that the cache is in
  fallback mode; the UI doesn't need to change behavior beyond
  showing the connection dot color.
- **Proven by the chaos test.** See
  [`server/__tests__/resilience/redis-death.test.ts`](../server/__tests__/resilience/redis-death.test.ts)
  — mocks `@upstash/redis` to throw on every call and asserts the
  contract above for all 8 cached routes.

### Pitfall 1 contract — the "map never goes blank" invariant

The v3 LLM pipeline is **optional**. When `events:llm:v3` is empty
or stale, `/api/events` serves raw GDELT via the Pitfall 1 cache
bridge in
[`server/routes/events.ts`](../server/routes/events.ts) (reading
the `events:gdelt` cache populated by the raw-GDELT adapter). The
map never goes blank — only enrichment quality degrades from v3
(CAMEO classification + LLM-resolved precise coordinates) to raw
GDELT (CAMEO classification only, ACTIONGEO coordinates).

This contract is **invariant** and proven by
[`server/__tests__/resilience/redis-death.test.ts`](../server/__tests__/resilience/redis-death.test.ts).
When the test kills the Upstash Redis connection mid-request, the
system continues to serve raw GDELT events; the map renders with
degraded enrichment but is never blank.

**v1 and v2 LLM extractors were deleted in Phase 29** (see
[ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md)).
No fallback to a prior pipeline version exists in the codebase.
The terminal fallback is raw GDELT — the same data source the LLM
enriches when healthy. The full chain documented in this contract
is:

```text
v3 (cron-driven extraction, daily 04:00 UTC) → raw GDELT (Pitfall 1 cache bridge terminal fallback)
```

Older planning artifacts (ROADMAP.md success criteria, etc.) may
reference a legacy multi-version cascade framing that names v1
and v2 as intermediate fallbacks — that wording predates Phase 29
deletion and is preserved in planning text as historical brief.
Public docs (this file) describe shipped reality.

---

## Data Source Layer: 8 upstream APIs

**Normal:** Each source polls on its own cadence (flights 5 s,
ships 30 s, events 15 min, news 15 min, sites 24 h, water 6 h,
markets 60 s, weather 10 min — see
[`docs/architecture/data-flows.md`](./architecture/data-flows.md)
for the full per-source diagrams). Fresh responses replace cached
data atomically via `cacheSetSafe`.

**Degraded — upstream source unreachable or returning errors:**

- The adapter catches the upstream error inside its `try/catch`
  block and the route responds with the most recent cached value.
- The response envelope sets `stale: true` and `lastFresh` points
  to the timestamp of the last successful fetch.
- `/api/{source}` returns HTTP 200, never 5xx, for upstream
  failure alone. (The chaos test specifically asserts this.)
- The frontend stores (`flightStore`, `shipStore`, `eventStore`,
  etc.) read the `stale` field and update the `ConnectionStatus`
  to `'stale'`.
- `StatusPanel` renders the affected source's connection dot in
  **yellow** (stale) rather than **green** (connected) or **red**
  (error).
- If the cache is also missing (cold start + upstream down), the
  route returns an empty array with `stale: true` and
  `lastFresh: 0` — never 500.

**Contract:**

- **Users always see data, even if stale.** The last-known
  position of flights, the last-known ship list, the last-known
  event set all persist through upstream failure.
- **Staleness is surfaced visually.** Connection health dots in
  the StatusPanel are the user-facing indicator; detail panels
  show "Updated X ago" timestamps.
- **No single source failure takes down the app.** The 8 sources
  are independent: if GDELT goes down, flights and ships and
  markets and everything else continue unaffected.
- **Stale threshold per source** is defined in the frontend store
  (e.g. flights 60 s, ships 120 s). If no fresh data arrives
  within that window, the store clears the affected entities to
  prevent dangerously outdated positions from persisting on the
  map. Events have no stale prune because they are historical.

---

## Response Layer: Zod validation (Plan 26.4-03)

**Normal:** API responses are parsed through Zod schemas (see
[`server/schemas/cacheResponse.ts`](../server/schemas/cacheResponse.ts))
via the `sendValidated<S>(res, schema, payload)` helper before
calling `res.json()`. The helper is wired into the flights, events,
and water routes as proof-of-concept (3 of 14 cached routes; the
remaining 11 are a mechanical follow-up).

**Degraded — schema mismatch:**

- **In development or test mode**, a schema mismatch throws
  `AppError(500, 'RESPONSE_SCHEMA_MISMATCH')` which is caught by
  the error handler and surfaces as a dev-visible 500. This makes
  the drift loud during iteration so it gets fixed immediately.
- **In production**, a schema mismatch logs a `warn`-level Pino
  line via the route's child logger _and sends the payload
  anyway_ (fail-open). This is intentional: a strict schema
  mismatch in production shouldn't take down the service just
  because the implementation drifted from the OpenAPI spec. The
  warning surfaces the drift for later fix without causing a
  cascade.
- Drift between implementation and the hand-written `openapi.yaml`
  contract becomes a _fixable bug_ in the log stream, not an
  _outage_ at runtime.

**Contract:**

- **Dev:** strict schema enforcement — fail loud, fix before merge.
- **Prod:** log mismatch for triage, serve the request.
- **Belt-and-suspenders with input validation.** `validateQuery`
  catches bad client inputs on the way in; `sendValidated`
  catches implementation drift on the way out. Both layers
  together are the Palantir-style double-validation pattern from
  [ADR-0006](./adr/0006-pino-and-zod-for-production-hardening.md).
- **Proven by unit tests.** See
  `server/__tests__/middleware/validateResponse.test.ts` — 6
  tests covering happy path, unknown-field stripping, dev throw,
  test-mode throw, prod warn behaviour, and missing `req.path`
  edge case.

---

## Frontend Layer: Lost Contact

**Normal:** Entities update on each poll. The Detail panel shows
live data for the selected entity, with "Updated X ago"
timestamps that tick every second.

**Degraded — entity disappears from the backend response:**

- `useSelectedEntity` (see
  [`src/hooks/useSelectedEntity.ts`](../src/hooks/useSelectedEntity.ts))
  detects that the previously-selected entity is no longer in any
  store's entity array.
- The detail panel switches into a "LOST CONTACT" state: the
  content stays populated with the _last-known values_ but is
  visually grayed out (grayscale + opacity-50 overlay) with a
  "LOST CONTACT" banner.
- The user can dismiss the panel or keep it open as a reference
  for the last-known state.

**Contract:**

- **Users never see a blank detail panel when an entity drops.**
  The last-known data persists, clearly marked as stale, until
  the user dismisses the panel.
- **Last-known position is preserved in memory** as long as the
  panel is open. Lost-contact tracking uses a React `useRef` so
  the last-known data survives React re-renders that would
  otherwise wipe it.
- **Applies to all MapEntity types.** Flights, ships, and events
  all go through the same `useSelectedEntity` hook.

---

## Rate Limit Layer

**Normal:** Every `/api/*` request passes through a two-tier rate
limiter (see
[`server/middleware/rateLimit.ts`](../server/middleware/rateLimit.ts)):

1. `rateLimiters.public` baseline tier at 60 req/min per IP
   (raised from 6 req/min in Phase 28.1 — see commit context in
   `server/middleware/rateLimit.ts`), prefixed `ratelimit:public`,
   applied to every `/api/*` request. Skipped on a valid
   `DASHBOARD_PASSWORD` Bearer via `timingSafeEqual` constant-time
   compare (per-endpoint tiers below still apply).
2. Per-endpoint limiter (`rateLimiters.flights`, `.events`, etc.)
   with tuned ceilings per route.

Each call to the limiter is itself a Redis command (Upstash
`@upstash/ratelimit`), so rate limit health is tied to cache
health.

**Degraded — rate limiter hits:**

- **When a limit is exceeded:** the middleware returns HTTP 429
  with the canonical error envelope
  `{error: 'Too many requests', code: 'RATE_LIMITED',
statusCode: 429}` and sets `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, and `X-RateLimit-Reset` response
  headers.
- **When Upstash is unreachable** (see Cache Layer above): the
  rate limiter itself can fail. Rather than gate traffic behind
  a broken counter, the limiter is skipped in non-production
  environments by design, and in production a Redis failure on
  the limiter path results in a fail-open (the request
  proceeds). This is the opposite of the cache-layer behavior —
  we prefer to _let traffic through_ when the counter is down,
  rather than block legitimate users because we can't measure.

**Contract:**

- **Exceeded limits return a canonical 429 envelope** with
  machine-readable `code: 'RATE_LIMITED'` for clients to handle.
- **`X-RateLimit-*` headers** are always set so well-behaved
  clients can implement backoff.
- **Limiter failure is fail-open**, not fail-closed. Users get
  through; operators see the Redis-down log entries and act via
  the runbook.

---

## `/health` Endpoint Contract

`/health` is intentionally **not** rate-limited and **not** cached.
It is the one endpoint that must always respond, even during heavy
degradation.

Response shape (stable contract):

```json
{
  "status": "ok" | "degraded",
  "redis": true | false,
  "uptime": 1234,
  "sources": {
    "flights": { "lastFresh": "2026-04-08T12:34:56Z", "stale": false },
    "ships":   { "lastFresh": "2026-04-08T12:34:56Z", "stale": false },
    "events":  { "lastFresh": "2026-04-08T12:34:56Z", "stale": false }
  }
}
```

- `status: 'ok'` means all sources are within their stale
  thresholds and Redis is reachable.
- `status: 'degraded'` means at least one source is stale or
  Redis is in in-memory fallback mode.
- `redis: false` specifically means Upstash was unreachable on
  the last probe — the in-memory fallback is active.
- The endpoint itself always returns HTTP 200. Degradation is
  surfaced in the body, not the HTTP status, so `/health` doesn't
  trigger Vercel cron retries unnecessarily.

**Consumed by:**

- Vercel cron `/api/cron/health` — aggregates recent runs for
  dashboard surfacing.
- External monitors (if wired) — should poll `/health` every
  30-60 seconds and alert on `status: 'degraded'` persisting for
  more than 5 minutes.
- The chaos test — asserts `{status: 'degraded', redis: false}`
  when `@upstash/redis` is mocked to throw on every call.

---

## Summary Table

| Layer                   | Failure mode        | User-facing outcome                    | Proof                                          |
| ----------------------- | ------------------- | -------------------------------------- | ---------------------------------------------- |
| Upstash Redis           | Unreachable / hung  | In-memory fallback, slower but working | Chaos test + `withTimeout` 2000 ms cap         |
| Upstream API            | Timeout / 4xx       | Stale data + yellow StatusPanel dot    | Stale-serve path in each route                 |
| Zod response validation | Schema drift        | Dev: 500 throw; Prod: warn + send      | `validateResponse.test.ts` covers both         |
| Rate limiter            | Redis down          | Fail-open, request proceeds            | Limiter skips non-production by design         |
| Frontend                | Entity dropped      | "LOST CONTACT" gray banner             | `useSelectedEntity` ref-based last-known       |
| Vercel function         | 800 s timeout (Pro) | 504 once, retry serves from warm cache | Cron warming + CDN `s-maxage` mitigates        |
| `/health`               | Always 200          | Body reflects degradation              | Endpoint is rate-limit-exempt and cache-exempt |

For specific operational procedures when each failure mode fires,
see [`docs/runbook.md`](./runbook.md). For the decision rationale
behind each layer's design, see the relevant ADR in
[`docs/adr/`](./adr/README.md).

---

_This contract is a living document. Changes to degradation
semantics should land alongside a code change and should also
update the chaos test and the runbook to stay consistent._
