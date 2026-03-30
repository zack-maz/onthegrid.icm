# Phase 13: Serverless Cache Migration - Research

**Researched:** 2026-03-19
**Domain:** Server-side caching migration (in-memory to Upstash Redis)
**Confidence:** HIGH

## Summary

Phase 13 replaces all in-memory server-side caches (EntityCache, GDELT eventMap, AISStream ships Map) with Upstash Redis so cached data persists across stateless serverless function invocations. The codebase has three data routes (flights, ships, events), each with distinct caching strategies that must be individually migrated to Redis.

The `@upstash/redis` SDK (v1.37.x) is an HTTP/REST-based Redis client specifically designed for serverless environments. It requires no persistent TCP connection, automatically serializes/deserializes JSON, and works identically in local dev and Vercel serverless functions. The SDK uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables.

The most complex migration is AISStream, which must change from a persistent WebSocket connection to an on-demand connect-collect-close pattern. The GDELT events route has a merge/accumulate pattern that must be preserved via Redis read-modify-write. The flights route is straightforward -- three EntityCache instances become three Redis key lookups.

**Primary recommendation:** Use `@upstash/redis` with a thin wrapper module (`server/cache/redis.ts`) that encapsulates get/set with JSON metadata (`{data, fetchedAt}`) and staleness computation, keeping the `CacheResponse<T>` contract identical to the current `EntityCache` interface.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Source-prefixed key naming: `flights:opensky`, `flights:adsb`, `flights:adsblol`, `events:gdelt`, `ships:ais`
- Metadata wrapper: store `{data, fetchedAt}` as JSON so routes can compute age and return `stale:true/false` -- matches current `CacheResponse<T>` contract
- Generous TTLs: Redis TTL set to 10x logical TTL (e.g. `flights:opensky` logical=10s, redis_ttl=100s) so stale-but-servable data stays available for upstream error fallback
- Shared module-scope Upstash client: single `Redis` instance created at module scope in `server/cache/redis.ts`, reused across warm invocations
- GDELT accumulator: single JSON key at `events:gdelt` storing the full event map as one blob, with fetchedAt age check and merge-on-miss pattern
- AISStream on-demand: connect-collect-close with merge, configurable `AISSTREAM_COLLECT_MS` env var (default 5000ms), 10-min ship staleness prune, error falls back to stale Redis cache
- Replace EntityCache entirely -- delete `server/cache/entityCache.ts`, no dual-mode fallback. Local dev requires Upstash credentials (free tier)
- Keep `app.listen()` in `server/index.ts` for local dev
- Remove `connectAISStream()` call from server startup
- Phase 13 scope is cache-only: no Vercel entry point or vercel.json (that is Phase 14)

### Claude's Discretion
- Exact Redis key expiry multiplier (10x is guidance, not rigid)
- Error retry logic details for Redis operations
- Whether to create a thin Redis cache wrapper class or use raw `redis.get/set` calls in routes
- Test strategy for Redis operations (mock @upstash/redis or use test instance)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @upstash/redis | ^1.37.0 | HTTP-based Redis client | Only connectionless Redis client, designed for serverless; automatic JSON serialization; GA with professional support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ws | (none needed) | WebSocket client | NOT needed -- Node 22+ has built-in `WebSocket` global (already used by aisstream.ts) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @upstash/redis | ioredis | ioredis uses TCP connections which exhaust connection pools in serverless; @upstash/redis is HTTP-only |
| @upstash/redis | redis (node-redis) | Same TCP connection issue; @upstash/redis is purpose-built for serverless |

**Installation:**
```bash
npm install @upstash/redis
```

No dev dependencies needed -- `@upstash/redis` ships with TypeScript types.

## Architecture Patterns

### Recommended Project Structure
```
server/
├── cache/
│   ├── redis.ts          # Shared Upstash Redis client + cache helper functions (REPLACES entityCache.ts)
│   └── entityCache.ts    # DELETE this file
├── adapters/
│   └── aisstream.ts      # REWRITE: on-demand collectShips() instead of persistent connectAISStream()
├── routes/
│   ├── flights.ts        # MODIFY: replace EntityCache instances with redis get/set
│   ├── events.ts         # MODIFY: replace in-memory eventMap with Redis read-modify-write
│   └── ships.ts          # MODIFY: replace getShips()/getLastMessageTime() with redis-backed collectShips()
└── index.ts              # MODIFY: remove connectAISStream() import and call
```

### Pattern 1: Redis Cache Module (`server/cache/redis.ts`)
**What:** A single module exporting a shared Redis client and typed cache helper functions
**When to use:** Every route that needs to read or write cached data

```typescript
import { Redis } from '@upstash/redis';

// Module-scope client -- reused across warm serverless invocations
// Upstash REST is stateless/HTTP-based, safe for this pattern
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export async function cacheGet<T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> {
  const entry = await redis.get<CacheEntry<T>>(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  return {
    data: entry.data,
    stale: age > logicalTtlMs,
    lastFresh: entry.fetchedAt,
  };
}

export async function cacheSet<T>(key: string, data: T, redisTtlSec: number): Promise<void> {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  await redis.set(key, entry, { ex: redisTtlSec });
}

export { redis };
```

**Key insight:** `@upstash/redis` automatically serializes objects to JSON on `set()` and deserializes them on `get()`. The `redis.get<CacheEntry<T>>(key)` generic ensures type-safe deserialization. No manual `JSON.stringify/parse` needed.

### Pattern 2: Cache-First Route with Redis
**What:** Routes check Redis first, fetch upstream on miss/stale, fall back to stale cache on error
**When to use:** All three data routes (flights, events, ships)

```typescript
// flights route example -- same pattern for all sources
const cached = await cacheGet<FlightEntity[]>('flights:adsblol', CACHE_TTL.adsblolFlights);
if (cached && !cached.stale) {
  return res.json(cached);
}

try {
  const flights = await fetchAdsbLol();
  await cacheSet('flights:adsblol', flights, Math.ceil(CACHE_TTL.adsblolFlights * 10 / 1000));
  res.json({ data: flights, stale: false, lastFresh: Date.now() });
} catch (err) {
  if (cached) {
    res.json(cached); // serve stale
  } else {
    throw err;
  }
}
```

### Pattern 3: On-Demand WebSocket Collect
**What:** Open WS, subscribe, collect messages for N seconds, close, merge with previous cached data
**When to use:** AISStream ships endpoint

```typescript
export async function collectShips(collectMs: number): Promise<ShipEntity[]> {
  return new Promise((resolve, reject) => {
    const collected = new Map<number, ShipEntity>();
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    const timeout = setTimeout(() => {
      ws.close();
      resolve(Array.from(collected.values()));
    }, collectMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        APIKey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: [[[IRAN_BBOX.south, IRAN_BBOX.west], [IRAN_BBOX.north, IRAN_BBOX.east]]],
        FilterMessageTypes: ['PositionReport'],
      }));
    });

    ws.addEventListener('message', async (event) => {
      // Parse and collect -- same logic as current handler
      // ...
      collected.set(mmsi, entity);
    });

    ws.addEventListener('error', (err) => {
      clearTimeout(timeout);
      ws.close();
      reject(err);
    });
  });
}
```

### Pattern 4: GDELT Accumulator via Redis Read-Modify-Write
**What:** Read existing events from Redis, fetch new batch from GDELT, merge, prune stale, write back
**When to use:** Events route

```typescript
// Read previous accumulator from Redis
const cached = await cacheGet<ConflictEventEntity[]>('events:gdelt', CACHE_TTL.events);
if (cached && !cached.stale) {
  return res.json(cached);
}

// Fetch new batch
const fresh = await fetchEvents();

// Merge with previous (if any)
const previousMap = new Map<string, ConflictEventEntity>();
if (cached) {
  for (const e of cached.data) previousMap.set(e.id, e);
}
for (const e of fresh) previousMap.set(e.id, e);

// Prune events before WAR_START
for (const [id, event] of previousMap) {
  if (event.timestamp < WAR_START) previousMap.delete(id);
}

const merged = Array.from(previousMap.values());
await cacheSet('events:gdelt', merged, Math.ceil(CACHE_TTL.events * 10 / 1000));
res.json({ data: merged, stale: false, lastFresh: Date.now() });
```

### Anti-Patterns to Avoid
- **Dual-mode cache (in-memory + Redis):** The user explicitly decided against fallback to in-memory. Delete EntityCache entirely.
- **Persistent WebSocket in serverless:** The AISStream connection must be on-demand (connect-collect-close), not a persistent reconnecting WS.
- **Synchronous backfill on startup:** The current events route runs `backfillEvents()` at module load time. This must be removed or made lazy for serverless (modules re-execute on cold start).
- **File-system state (`.backfill-state.json`):** The current events route writes backfill state to disk. This will not work in serverless (read-only filesystem). Remove or migrate to Redis.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization for Redis | Manual JSON.stringify/parse | @upstash/redis automatic serialization | SDK handles it transparently; typing works with generics |
| HTTP Redis client | Custom fetch-based REST wrapper | @upstash/redis | Handles auth, retries, keepalive, error parsing |
| Connection pooling | Custom pool manager | @upstash/redis (connectionless) | HTTP-based, no connections to pool |
| TTL management | Manual expiry checks + cleanup | Redis built-in `EX` option on `SET` | Redis handles eviction automatically |

**Key insight:** `@upstash/redis` is specifically designed for the stateless serverless pattern. Every HTTP request is independent -- no connection state, no pool, no cleanup.

## Common Pitfalls

### Pitfall 1: Module-Level Side Effects in Serverless
**What goes wrong:** The current `events.ts` runs backfill at module load time (lines 65-78). In serverless, modules re-execute on every cold start, causing redundant multi-day backfills.
**Why it happens:** Module-level code runs every time the function cold starts (every ~5-15 minutes on Vercel).
**How to avoid:** Remove the module-level backfill. Instead, check the Redis `events:gdelt` key's `fetchedAt` to determine if data is fresh. Only fetch the latest 15-minute batch on each request.
**Warning signs:** Slow cold starts, excessive GDELT downloads, hitting GDELT rate limits.

### Pitfall 2: Backfill State File on Read-Only Filesystem
**What goes wrong:** `events.ts` reads/writes `.backfill-state.json` to disk (lines 11-25). Serverless functions have read-only filesystems.
**Why it happens:** Pattern was designed for persistent server process.
**How to avoid:** Remove file-based backfill state entirely. The Redis cache itself serves as the state -- if `events:gdelt` exists and is fresh, no backfill needed.
**Warning signs:** ENOENT or EACCES errors in logs.

### Pitfall 3: WebSocket Timeout in Serverless
**What goes wrong:** AISStream collect phase runs for 5+ seconds. Vercel serverless functions have a 10s default timeout (60s max on Pro plan). If WS connect is slow, collect window may eat into the timeout budget.
**Why it happens:** WebSocket handshake + subscription takes 1-2s, leaving only 3-8s for data collection.
**How to avoid:** Keep `AISSTREAM_COLLECT_MS` default at 5000ms. Add a hard timeout safety net. Track elapsed time from function start, not just WS open.
**Warning signs:** Function timeouts (504 Gateway Timeout), incomplete ship data.

### Pitfall 4: Redis Payload Size
**What goes wrong:** The GDELT event accumulator can contain hundreds of events. Each `ConflictEventEntity` is ~500 bytes JSON. 1000 events = ~500KB. Upstash free tier has 256MB storage limit.
**Why it happens:** Accumulating all events since WAR_START in one key.
**How to avoid:** This is within limits for 6h window (~50-200 events typically). The generous Redis TTL (10x = 2.5 hours for events) means old data eventually expires. Monitor key sizes.
**Warning signs:** Slow Redis get/set latency (>100ms for large payloads).

### Pitfall 5: Race Conditions on Read-Modify-Write
**What goes wrong:** Two concurrent requests to `/api/events` both read the same cached events, both fetch new GDELT data, and one overwrites the other's merge.
**Why it happens:** Redis GET + SET is not atomic.
**How to avoid:** Acceptable for this use case -- GDELT updates every 15 minutes, so concurrent requests are rare and data is idempotent. The worst case is a missed merge that self-corrects on next poll. No need for Redis transactions or WATCH.
**Warning signs:** Occasional small event count drops that self-correct.

### Pitfall 6: Upstash Free Tier Command Budget
**What goes wrong:** 500K commands/month budget gets exhausted by frequent polling.
**Why it happens:** Each route hit = 1 GET + potentially 1 SET = 2 commands. With 3 routes and client polling every 5-30s, commands add up.
**How to avoid:** The cache-first pattern is the mitigation -- fresh cache hits are 1 GET only (no SET). With proper TTLs, upstream fetches (and thus SETs) happen infrequently. Estimate: ~3 GETs per client poll cycle every 5s = ~52K/day = ~1.6M/month. This exceeds free tier (500K). Budget is $0.20/100K beyond that = ~$2.20/month.
**Warning signs:** 429 responses from Upstash REST API. Monitor via Upstash dashboard.

## Code Examples

### Current EntityCache Interface (to be replaced)
```typescript
// server/cache/entityCache.ts -- WILL BE DELETED
class EntityCache<T> {
  get(): CacheResponse<T> | null       // Sync, in-memory
  set(data: T): void                   // Sync, in-memory
  clear(): void                        // Sync, in-memory
}
```

### Replacement Redis Cache Functions
```typescript
// server/cache/redis.ts -- NEW
import { Redis } from '@upstash/redis';
import type { CacheResponse } from '../types.js';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// Note: all cache operations are now async (returns Promise)
export async function cacheGet<T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> {
  const entry = await redis.get<CacheEntry<T>>(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  return {
    data: entry.data,
    stale: age > logicalTtlMs,
    lastFresh: entry.fetchedAt,
  };
}

export async function cacheSet<T>(key: string, data: T, redisTtlSec: number): Promise<void> {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  await redis.set(key, entry, { ex: redisTtlSec });
}

export { redis };
```

### Flights Route Migration (before/after key change)
```typescript
// BEFORE: synchronous in-memory cache
const cached = cache.get();        // sync
cache.set(flights);                // sync

// AFTER: async Redis cache
const cached = await cacheGet<FlightEntity[]>(cacheKey, ttl);  // async
await cacheSet(cacheKey, flights, redisTtl);                    // async
```

### AISStream On-Demand Collect Pattern
```typescript
// server/adapters/aisstream.ts -- REWRITTEN
import type { ShipEntity } from '../types.js';
import { IRAN_BBOX } from '../constants.js';

const DEFAULT_COLLECT_MS = 5000;

export async function collectShips(): Promise<ShipEntity[]> {
  const collectMs = Number(process.env.AISSTREAM_COLLECT_MS ?? DEFAULT_COLLECT_MS);
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) throw new Error('AISSTREAM_API_KEY not configured');

  return new Promise<ShipEntity[]>((resolve, reject) => {
    const collected = new Map<number, ShipEntity>();
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    const timer = setTimeout(() => {
      ws.close();
      resolve(Array.from(collected.values()));
    }, collectMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[IRAN_BBOX.south, IRAN_BBOX.west], [IRAN_BBOX.north, IRAN_BBOX.east]]],
        FilterMessageTypes: ['PositionReport'],
      }));
    });

    ws.addEventListener('message', async (event) => {
      // ... same parsing logic as current handler ...
      // collected.set(mmsi, entity);
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error('AISStream WebSocket connection failed'));
    });
  });
}

// Remove: connectAISStream(), getShips(), getLastMessageTime(), ships Map, lastMessageTime
```

### Ships Route with Redis Merge Pattern
```typescript
// server/routes/ships.ts -- REWRITTEN
import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { collectShips } from '../adapters/aisstream.js';
import type { ShipEntity } from '../types.js';

const SHIPS_KEY = 'ships:ais';
const LOGICAL_TTL_MS = 30_000;       // 30s logical freshness
const REDIS_TTL_SEC = 300;            // 5min Redis TTL (10x logical)
const STALE_THRESHOLD_MS = 600_000;   // 10min -- prune ships not seen in 10 min

export const shipsRouter = Router();

shipsRouter.get('/', async (_req, res) => {
  const cached = await cacheGet<ShipEntity[]>(SHIPS_KEY, LOGICAL_TTL_MS);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    const fresh = await collectShips();
    // Merge with previous cached set
    const shipMap = new Map<string, ShipEntity>();
    if (cached) {
      for (const ship of cached.data) shipMap.set(ship.id, ship);
    }
    for (const ship of fresh) shipMap.set(ship.id, ship);

    // Prune ships not seen in 10 minutes
    const cutoff = Date.now() - STALE_THRESHOLD_MS;
    for (const [id, ship] of shipMap) {
      if (ship.timestamp < cutoff) shipMap.delete(id);
    }

    const merged = Array.from(shipMap.values());
    await cacheSet(SHIPS_KEY, merged, REDIS_TTL_SEC);
    res.json({ data: merged, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[ships] collect error:', (err as Error).message);
    if (cached) {
      res.json({ ...cached, stale: true });
    } else {
      res.status(500).json({ error: 'Ship data unavailable' });
    }
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory EntityCache | Redis-backed cache | Phase 13 | Data persists across cold starts |
| Persistent AISStream WS | On-demand collect-close | Phase 13 | Works in serverless (no long-lived connections) |
| Module-level backfill | Lazy fetch on request | Phase 13 | No cold-start penalty, no filesystem writes |
| File-based backfill state | Redis cache freshness check | Phase 13 | Works on read-only filesystem |

**Deprecated/outdated:**
- `EntityCache` class: replaced entirely by Redis cache functions
- `connectAISStream()`: replaced by `collectShips()`
- `.backfill-state.json`: replaced by Redis key freshness

## Open Questions

1. **Redis TTL multiplier precision**
   - What we know: User guidance is 10x. Exact values per key: `flights:opensky` = 100s, `flights:adsb` = 2600s, `flights:adsblol` = 300s, `events:gdelt` = 9000s (2.5 hours).
   - What's unclear: Whether 10x is too generous for flights:adsb (2600s = 43 minutes of stale data).
   - Recommendation: Use 10x as stated. ADS-B Exchange updates every 260s and the free tier has tight rate limits, so 43 minutes of stale fallback is reasonable for error recovery.

2. **Ships cache logical TTL**
   - What we know: Current `CACHE_TTL.ships = 0` (N/A for WebSocket push). Now that ships are polled on-demand, a logical TTL is needed.
   - What's unclear: The exact value.
   - Recommendation: 30 seconds (same as client polling interval for ships). Redis TTL = 300s (5 minutes). This allows stale-but-servable fallback for WS failures.

3. **GDELT backfill on first cold start (empty Redis)**
   - What we know: Current server runs a multi-day backfill at startup. With serverless, this cannot happen at module load.
   - What's unclear: Should the first request trigger a backfill, or just start accumulating from the latest 15-minute batch?
   - Recommendation: Start from latest batch only. The 6h default date filter on the client already limits the visible window. Backfilling days of data on a single serverless request would timeout. If needed, a separate one-off script can seed the cache.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (test section, `// @vitest-environment node` per server test file) |
| Quick run command | `npx vitest run server/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CACHE-01 | Redis cache get returns null on empty cache | unit | `npx vitest run server/__tests__/redis-cache.test.ts -x` | No -- Wave 0 |
| CACHE-02 | Redis cache get returns fresh data within logical TTL | unit | `npx vitest run server/__tests__/redis-cache.test.ts -x` | No -- Wave 0 |
| CACHE-03 | Redis cache get returns stale:true after logical TTL | unit | `npx vitest run server/__tests__/redis-cache.test.ts -x` | No -- Wave 0 |
| CACHE-04 | Redis cache set stores {data, fetchedAt} with EX TTL | unit | `npx vitest run server/__tests__/redis-cache.test.ts -x` | No -- Wave 0 |
| FLIGHT-01 | Flights route uses Redis cache instead of EntityCache | unit | `npx vitest run server/__tests__/routes/flights.test.ts -x` | Yes -- update existing |
| FLIGHT-02 | Flights route serves stale cache on upstream error | unit | `npx vitest run server/__tests__/routes/flights.test.ts -x` | Yes -- update existing |
| FLIGHT-03 | Flights route preserves RateLimitError handling | unit | `npx vitest run server/__tests__/routes/flights.test.ts -x` | Yes -- update existing |
| EVENTS-01 | Events route reads/merges from Redis accumulator | unit | `npx vitest run server/__tests__/routes/events.test.ts -x` | No -- Wave 0 |
| EVENTS-02 | Events route prunes pre-WAR_START entries | unit | `npx vitest run server/__tests__/routes/events.test.ts -x` | No -- Wave 0 |
| SHIPS-01 | Ships route calls collectShips() on cache miss | unit | `npx vitest run server/__tests__/routes/ships.test.ts -x` | No -- Wave 0 |
| SHIPS-02 | Ships route merges fresh + cached ships | unit | `npx vitest run server/__tests__/routes/ships.test.ts -x` | No -- Wave 0 |
| SHIPS-03 | Ships route prunes ships older than 10 minutes | unit | `npx vitest run server/__tests__/routes/ships.test.ts -x` | No -- Wave 0 |
| SHIPS-04 | Ships route falls back to stale cache on WS error | unit | `npx vitest run server/__tests__/routes/ships.test.ts -x` | No -- Wave 0 |
| AIS-01 | collectShips() opens WS, subscribes, collects, closes | unit | `npx vitest run server/__tests__/adapters/aisstream.test.ts -x` | Yes -- update existing |
| AIS-02 | collectShips() respects AISSTREAM_COLLECT_MS timeout | unit | `npx vitest run server/__tests__/adapters/aisstream.test.ts -x` | Yes -- update existing |
| STARTUP-01 | server/index.ts no longer imports connectAISStream | unit | `npx vitest run server/__tests__/server.test.ts -x` | Yes -- update existing |
| STARTUP-02 | EntityCache file is deleted | manual-only | `ls server/cache/entityCache.ts` should fail | N/A |
| API-01 | CacheResponse<T> shape preserved for all routes | unit | `npx vitest run server/ -x` | Covered by route tests |

### Test Strategy for Redis Operations

**Recommendation: Mock `@upstash/redis` with `vi.mock()`**

The cleanest approach for unit tests is to mock the entire `server/cache/redis.ts` module:

```typescript
// In test files
vi.mock('../../cache/redis.js', () => {
  const store = new Map<string, unknown>();
  return {
    cacheGet: vi.fn(async (key: string, logicalTtlMs: number) => {
      const entry = store.get(key) as { data: unknown; fetchedAt: number } | undefined;
      if (!entry) return null;
      const age = Date.now() - entry.fetchedAt;
      return { data: entry.data, stale: age > logicalTtlMs, lastFresh: entry.fetchedAt };
    }),
    cacheSet: vi.fn(async (key: string, data: unknown) => {
      store.set(key, { data, fetchedAt: Date.now() });
    }),
    redis: { get: vi.fn(), set: vi.fn() },
  };
});
```

This avoids needing a real Redis instance or Docker container for tests.

### Sampling Rate
- **Per task commit:** `npx vitest run server/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/redis-cache.test.ts` -- unit tests for new redis.ts cache module
- [ ] `server/__tests__/routes/events.test.ts` -- events route test (currently no test file)
- [ ] `server/__tests__/routes/ships.test.ts` -- ships route test (currently no test file)
- [ ] Update `server/__tests__/routes/flights.test.ts` -- replace EntityCache mocks with redis.ts mocks
- [ ] Update `server/__tests__/adapters/aisstream.test.ts` -- test collectShips() instead of connectAISStream()
- [ ] Update `server/__tests__/server.test.ts` -- remove connectAISStream mock, verify no startup WS call
- [ ] `server/__tests__/cache.test.ts` -- DELETE (tests EntityCache which is being deleted)

## Sources

### Primary (HIGH confidence)
- @upstash/redis npm package (v1.37.0) -- installation, API surface, auto JSON serialization
- Upstash official docs (connectwithupstashredis, advanced) -- initialization patterns, automaticDeserialization option, timeout config
- Upstash official docs (developing) -- testing with SRH (Serverless Redis HTTP), Docker-based test setup

### Secondary (MEDIUM confidence)
- Upstash pricing page -- free tier: 500K commands/month, 256MB storage, $0.20/100K beyond
- Upstash pipeline docs -- `redis.pipeline()` with chained commands and typed `exec<[T1, T2]>()`
- GitHub upstash/redis-js -- `set()` with `{ ex: seconds }` for TTL, GA project status

### Tertiary (LOW confidence)
- WebSocket connect-collect-close serverless pattern -- synthesized from multiple sources, not a published pattern. Needs careful timeout testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @upstash/redis is the de facto standard for serverless Redis, well-documented, GA status
- Architecture: HIGH -- patterns are straightforward translations of existing cache-first logic to async Redis operations
- Pitfalls: HIGH -- identified from direct code analysis (module-level side effects, file writes, WS lifecycle)
- AISStream on-demand pattern: MEDIUM -- novel pattern specific to this project, needs careful timeout management

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- @upstash/redis is GA, Upstash pricing stable)
