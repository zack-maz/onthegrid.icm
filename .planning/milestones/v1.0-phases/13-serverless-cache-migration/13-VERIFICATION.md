---
phase: 13-serverless-cache-migration
verified: 2026-03-20T18:20:00Z
status: passed
score: 27/27 must-haves verified
re_verification: true
  previous_status: passed
  previous_score: 23/23
  gaps_closed:
    - "On first request after cold start (empty Redis), backfill seeds historical events covering days since WAR_START"
    - "Subsequent requests within Redis TTL do NOT re-trigger backfill (only normal 15-minute fetch)"
    - "Date range filter shows events across full war timeline, not just the latest 15-minute window"
    - "Backfill results are merged into Redis accumulator using same merge-by-ID pattern as normal fetch"
  gaps_remaining: []
  regressions: []
---

# Phase 13: Serverless Cache Migration — Verification Report

**Phase Goal:** Replace all in-memory server-side caches with Upstash Redis so cached data persists across stateless serverless function invocations
**Verified:** 2026-03-20T18:20:00Z
**Status:** passed
**Re-verification:** Yes — after Plan 04 gap closure (lazy GDELT backfill)

---

## Goal Achievement

### Observable Truths

All must-haves are drawn directly from the four plan frontmatter `must_haves.truths` blocks.

#### Plan 01 Truths (Redis cache module + flights route)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `cacheGet` returns null when Redis key does not exist | VERIFIED | `server/__tests__/redis-cache.test.ts` line 36-39, implementation returns `null` when `redis.get` returns null (`server/cache/redis.ts` line 28) |
| 2 | `cacheGet` returns fresh `CacheResponse` when data is within logical TTL | VERIFIED | Test line 42-53, implementation computes `stale = Date.now() - entry.fetchedAt > logicalTtlMs` |
| 3 | `cacheGet` returns `stale:true` `CacheResponse` when data exceeds logical TTL | VERIFIED | Test line 55-67 with `vi.advanceTimersByTime(10_001)`, implementation same staleness formula |
| 4 | `cacheSet` stores `{data, fetchedAt}` with Redis `EX` TTL | VERIFIED | Test line 69-78 verifies stored shape, implementation line 49-50 uses `{ ex: redisTtlSec }` |
| 5 | Flights route reads/writes from Redis instead of EntityCache | VERIFIED | `server/routes/flights.ts` imports `cacheGet, cacheSet` from `../cache/redis.js`, no EntityCache import anywhere in server/ |
| 6 | Flights route serves stale Redis cache on upstream error | VERIFIED | `flights.ts` lines 78-80: catches error, serves `cached` if present |
| 7 | Flights route preserves RateLimitError handling | VERIFIED | `flights.ts` lines 71-76: `instanceof RateLimitError` branch with 429 and `rateLimited` flag |
| 8 | `CacheResponse<T>` shape is preserved for flights | VERIFIED | Route returns `{ data, stale, lastFresh }` on cache miss (line 66) and serves full `CacheResponse` on cache hit |

#### Plan 02 Truths (AISStream + ships route)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9 | Ships route reads/writes from Redis instead of in-memory Map | VERIFIED | `server/routes/ships.ts` lines 2,14,45: imports and calls `cacheGet(SHIPS_KEY)` / `cacheSet(SHIPS_KEY, merged)` |
| 10 | AISStream uses on-demand connect-collect-close instead of persistent WebSocket | VERIFIED | `server/adapters/aisstream.ts` exports only `collectShips()`, opens WS, uses `setTimeout` to close after `collectMs`, no persistent connection |
| 11 | Fresh ships are merged with previously cached ships on each collect | VERIFIED | `ships.ts` lines 26-34: seeds `shipMap` from `cached.data`, overwrites with `fresh` |
| 12 | Ships not seen in 10 minutes are pruned from the accumulator | VERIFIED | `ships.ts` lines 37-42: prunes entries where `ship.timestamp < now - STALE_THRESHOLD_MS` (600_000) |
| 13 | Ships route falls back to stale Redis cache when WebSocket fails | VERIFIED | `ships.ts` lines 48-50: catch block returns `{ ...cached, stale: true }` if cached exists |
| 14 | `CacheResponse<T>` shape is preserved for ships | VERIFIED | Ships route returns `{ data, stale, lastFresh }`, test suite verifies shape explicitly |

#### Plan 03 Truths (events route + cleanup)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 15 | Events route reads/writes from Redis accumulator instead of in-memory `eventMap` | VERIFIED | `server/routes/events.ts` lines 2,20,48: imports and calls `cacheGet(EVENTS_KEY)` / `cacheSet(EVENTS_KEY, merged)` |
| 16 | Events route merges fresh GDELT events with previously cached events | VERIFIED | `events.ts` lines 46-51: seeds `eventMap` from `cached.data`, overwrites with `fresh` events |
| 17 | Events route prunes events before WAR_START | VERIFIED | `events.ts` lines 73-78: deletes entries where `event.timestamp < WAR_START` |
| 18 | Events route checks Redis `fetchedAt` age before hitting GDELT upstream | VERIFIED | `events.ts` lines 38-40: `if (cached && !cached.stale) return res.json(cached)` — returns before calling `fetchEvents()` |
| 19 | Events route has no module-level backfill or file I/O | VERIFIED | No `readFileSync`/`writeFileSync`/`backfillEvents` at module scope; test asserts `mockFetchEvents` not called at import time |
| 20 | `server/index.ts` no longer imports or calls `connectAISStream()` | VERIFIED | `server/index.ts` has no aisstream import; no `connectAISStream` reference anywhere in production code |
| 21 | `EntityCache` class file is deleted | VERIFIED | `server/cache/entityCache.ts` does not exist; grep for `EntityCache` in server/ returns no matches |
| 22 | `CacheResponse<T>` shape is preserved for events | VERIFIED | `events.ts` returns `{ data, stale, lastFresh }` on both success and error paths |
| 23 | Server still runs locally with `app.listen()` for development | VERIFIED | `server/index.ts` lines 36-48: `isMainModule` guard calls `app.listen(port)` |

#### Plan 04 Truths (lazy GDELT backfill — gap closure)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 24 | On first request after cold start (empty Redis), backfill seeds historical events covering days since WAR_START | VERIFIED | `events.ts` lines 54-67: `if (!cached && (await shouldBackfill()))` block calls `backfillEvents(backfillDays)` where `backfillDays = Math.ceil((Date.now() - WAR_START) / 86_400_000)` |
| 25 | Subsequent requests within Redis TTL do NOT re-trigger backfill | VERIFIED | `shouldBackfill()` checks `redis.get(BACKFILL_KEY)`; after first backfill, timestamp stored with 1-hour cooldown; test "records backfill timestamp...prevents re-trigger" confirms this |
| 26 | Date range filter shows events across full war timeline, not just the latest 15-minute window | VERIFIED | Backfill feeds full war timeline into Redis accumulator; frontend `DateRangeFilter.tsx` and `filterStore.ts` accept events from WAR_START onward — all 67 frontend filter tests pass |
| 27 | Backfill results are merged into Redis accumulator using same merge-by-ID pattern as normal fetch | VERIFIED | `events.ts` lines 59-61: backfill events are `eventMap.set(event.id, event)` before fresh events, ensuring fresh wins on duplicate IDs; confirmed by deduplication test |

**Score:** 27/27 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/cache/redis.ts` | VERIFIED | 52 lines; exports `cacheGet`, `cacheSet`, `redis`; uses `@upstash/redis` `new Redis(...)` |
| `server/__tests__/redis-cache.test.ts` | VERIFIED | 87 lines (>40 min); 5 tests all passing |
| `server/adapters/aisstream.ts` | VERIFIED | 99 lines; exports only `collectShips()`; no persistent WebSocket exports |
| `server/routes/ships.ts` | VERIFIED | 55 lines (>30 min); Redis cache-first with merge/prune |
| `server/__tests__/routes/ships.test.ts` | VERIFIED | >50 min; tests all passing |
| `server/__tests__/adapters/aisstream.test.ts` | VERIFIED | >40 min; tests all passing |
| `server/routes/events.ts` | VERIFIED | 95 lines; Redis accumulator with merge/prune, lazy backfill on cache miss, no module-level side effects |
| `server/__tests__/routes/events.test.ts` | VERIFIED | 388 lines (>280 min); 14 tests total (8 existing + 6 new backfill tests) all passing |
| `.env.example` | VERIFIED | Contains `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `AISSTREAM_COLLECT_MS` |
| `server/cache/entityCache.ts` | VERIFIED DELETED | File does not exist; zero references in server/ |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/routes/flights.ts` | `server/cache/redis.ts` | `import { cacheGet, cacheSet }` | WIRED | Line 2 imports; `cacheGet('flights:opensky'...)` called at line 57 |
| `server/cache/redis.ts` | `@upstash/redis` | `new Redis(...)` | WIRED | Line 1 import; line 5 `new Redis({url, token})` |
| `server/routes/ships.ts` | `server/cache/redis.ts` | `import { cacheGet, cacheSet }` | WIRED | Line 2 imports; `cacheGet('ships:ais'...)` called at line 14 |
| `server/routes/ships.ts` | `server/adapters/aisstream.ts` | `import { collectShips }` | WIRED | Line 3 imports; `collectShips()` called at line 23 |
| `server/adapters/aisstream.ts` | WebSocket | `new WebSocket(...)` | WIRED | Line 25 `new WebSocket('wss://stream.aisstream.io/v0/stream')` |
| `server/routes/events.ts` | `server/cache/redis.ts` | `import { cacheGet, cacheSet, redis }` | WIRED | Line 2 imports `redis` for direct backfill timestamp tracking; `cacheGet/cacheSet` for accumulator |
| `server/routes/events.ts` | `server/adapters/gdelt.ts` | `import { fetchEvents, backfillEvents }` | WIRED | Line 3 imports both; `fetchEvents()` called at line 43, `backfillEvents(backfillDays)` called at line 57 |
| `server/routes/events.ts` | `redis.get/set` | backfill timestamp tracking | WIRED | `redis.get(BACKFILL_KEY)` in `shouldBackfill()` line 27; `redis.set(BACKFILL_KEY, ...)` at line 62 |
| `server/index.ts` | `server/adapters/aisstream.ts` | `connectAISStream` removed | VERIFIED ABSENT | No aisstream import in `server/index.ts`; grep returns no matches in production code |

---

### Requirements Coverage

No requirement IDs were declared in any plan's `requirements:` frontmatter field (all four plans show `requirements: []`). No REQUIREMENTS.md entries are mapped to Phase 13. This is a deployment milestone. Coverage check: N/A.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server/__tests__/server.test.ts` | 53-57 | Stale aisstream mock: exports `getShips`, `getLastMessageTime`, `connectAISStream` alongside `collectShips` | Info | Mock exports functions that no longer exist on the adapter; tests still pass because Vitest allows extra mock exports |
| `server/__tests__/security.test.ts` | 89-93 | Stale aisstream mock: only exports old symbols, missing `collectShips` | Warning | Ships route in security tests calls real `collectShips()`, which attempts real Redis (no credentials), producing "[Upstash Redis] Redis client was initialized without url or token" warning in test output. Tests still pass. |
| `server/__tests__/routes/sources.test.ts` | 18-22 | Stale aisstream mock: only old exports, no `collectShips` | Warning | Same as security.test.ts — ships route falls back to error path. Tests still pass because sources route tests don't call `/api/ships`. |
| `server/__tests__/routes/events.test.ts` | 84-88 | Stale aisstream mock with old exports (leftover from pre-Plan 02) | Info | No impact; ships route not called in events tests. |

None of the above are blockers. All 144 server tests pass. The stale mocks in `security.test.ts` and `sources.test.ts` were pre-existing files outside all Phase 13 plan scopes.

---

### Human Verification Required

None. All phase goals are verifiable programmatically:

- Redis module existence and correctness: verified via unit tests (5/5 passing)
- Route migration: verified via grep and integration tests (144/144 passing)
- EntityCache deletion: verified via filesystem check (file absent, zero references)
- Lazy backfill trigger and cooldown: verified via 6 new dedicated tests
- Backfill merge-by-ID deduplication: verified via dedicated deduplication test
- No module-level side effects: verified via test assertion and grep
- Server `app.listen()` preserved: verified via code inspection

The actual Upstash Redis connection (requiring live credentials) cannot be integration-tested locally but is a deployment concern addressed in Phase 14 (Vercel deployment).

---

### Re-verification Summary

**Previous verification (2026-03-19):** 23/23 truths passed — Plans 01-03 complete.

**Gap identified in UAT:** Date range filter showed no historical conflict events because the serverless migration (Plan 03) removed the startup backfill mechanism, leaving the Redis event accumulator seeded only from 15-minute GDELT increments after deployment.

**Plan 04 closure:** Lazy on-demand backfill added to the events route. On first request when Redis is empty, `backfillEvents(days)` is called to seed the full war timeline. A 1-hour cooldown via Redis prevents hammering the GDELT master file list on repeated cache misses.

**Result:** All 27/27 must-have truths verified. No regressions. 144/144 server tests pass. Phase 13 goal fully achieved.

---

_Verified: 2026-03-20T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
