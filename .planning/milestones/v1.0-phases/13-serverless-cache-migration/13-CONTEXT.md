# Phase 13: Serverless Cache Migration - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace all in-memory server-side caching (EntityCache, GDELT eventMap, AISStream ships Map) with Upstash Redis so cached data persists across stateless serverless function invocations. This phase does NOT add the Vercel deployment entry point or vercel.json (that's Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Redis cache design
- Source-prefixed key naming: `flights:opensky`, `flights:adsb`, `flights:adsblol`, `events:gdelt`, `ships:ais`
- Metadata wrapper: store `{data, fetchedAt}` as JSON so routes can compute age and return `stale:true/false` — matches current `CacheResponse<T>` contract
- Generous TTLs: Redis TTL set to 10x logical TTL (e.g. `flights:opensky` logical=10s, redis_ttl=100s) so stale-but-servable data stays available for upstream error fallback
- Shared module-scope Upstash client: single `Redis` instance created at module scope in `server/cache/redis.ts`, reused across warm invocations (Upstash REST is stateless/HTTP-based, safe for this pattern)

### GDELT accumulator strategy
- Single JSON key at `events:gdelt` storing the full event map as one blob
- TTL guard: check `fetchedAt` age before hitting GDELT upstream; if <15min old, return cached accumulator without re-fetching
- On cache miss: fetch new GDELT batch, merge into previous cached events (upsert by event ID), prune stale entries, save back to Redis
- Event window: note that the 48h window has been updated in another branch to 6h default with custom range setting — researcher should reference latest code for the actual window value

### AISStream WebSocket approach
- On-demand connect-collect-close with merge: on `/api/ships` cache miss, open WS → subscribe → collect for N seconds → close → merge new ships into previous cached set → prune ships not seen in 10 minutes → cache result
- Collect window duration configurable via `AISSTREAM_COLLECT_MS` environment variable (default 5000ms)
- Ship staleness threshold: 10 minutes — ships not re-observed within 10 min are pruned from the accumulator
- Error handling: on WS connect failure or timeout, fall back to stale Redis cache with `stale: true`; if no cache exists at all, return 500

### Express ↔ Vercel boundary
- Phase 13 scope is cache-only: replace in-memory caches with Redis, make AISStream on-demand. No Vercel entry point or vercel.json (Phase 14)
- Replace EntityCache entirely — delete `server/cache/entityCache.ts`, no dual-mode fallback. Local dev requires Upstash credentials (free tier)
- Keep `app.listen()` in `server/index.ts` for local dev (isMainModule guard unchanged)
- Remove `connectAISStream()` call from server startup — ships are now fetched on-demand

### Claude's Discretion
- Exact Redis key expiry multiplier (10x is guidance, not rigid)
- Error retry logic details for Redis operations
- Whether to create a thin Redis cache wrapper class or use raw `redis.get/set` calls in routes
- Test strategy for Redis operations (mock @upstash/redis or use test instance)

</decisions>

<specifics>
## Specific Ideas

- User mentioned the event window has been updated in a separate branch to 6h default with a custom range setting — implementation should check the latest code rather than assuming 48h
- Collect + merge pattern for ships was chosen specifically to build up coverage over time (first cold start ~10-30 ships, after several polls ~100+)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/cache/entityCache.ts`: Simple class with get/set/clear — the Redis replacement should mirror this interface
- `server/types.ts`: `CacheResponse<T>` type with `data`, `stale`, `lastFresh` — Redis wrapper must return this same shape
- `server/constants.ts`: `CACHE_TTL` object with per-source TTL values — reuse for logical TTL, multiply for Redis TTL
- `server/adapters/aisstream.ts`: WebSocket connection + message parsing logic — parsing can be reused in on-demand collect function

### Established Patterns
- Cache-first route pattern: check cache → if fresh return cached → if stale fetch upstream → on error serve stale cache. All three routes (flights, events, ships) should follow this
- `RateLimitError` handling in flights route — Redis version should preserve this behavior
- Module-scope instances (3 EntityCache instances in flights.ts) — Redis client follows same pattern

### Integration Points
- `server/routes/flights.ts`: 3 EntityCache instances → Redis get/set calls
- `server/routes/events.ts`: in-memory eventMap → Redis get/set with merge logic
- `server/routes/ships.ts`: calls `getShips()` / `getLastMessageTime()` → calls new on-demand `collectShips()` + Redis
- `server/index.ts`: remove `connectAISStream()` import and call
- `.env`: new vars needed: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AISSTREAM_COLLECT_MS`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-serverless-cache-migration*
*Context gathered: 2026-03-18*
