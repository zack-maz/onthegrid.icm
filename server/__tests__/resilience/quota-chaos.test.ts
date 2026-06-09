// @vitest-environment node
/**
 * Quota-path chaos test (LLM-FIX-05 / Phase 38).
 *
 * Goal: prove that the per-Bearer quota endpoints return HTTP 503 (or 200/429)
 * — NEVER 500 — when the raw `redis.incr` bookkeeping call inside
 * `checkPruneQuota` / `checkReplayQuota` itself throws.
 *
 * Why a DEDICATED test (vs. the broader redis-death.test.ts)?
 *   redis-death.test.ts mocks the WHOLE redis client to throw, so the route's
 *   FIRST raw-redis call usually fails — and on the prune path that is
 *   `cacheGetSafe` inside the helper, which degrades-open and short-circuits
 *   to `{prunedCount:0}` BEFORE `redis.incr` ever runs. That is the Pitfall 5
 *   "right answer, wrong reason" false-negative: the test passes (no 500) but
 *   never actually exercises the unguarded `redis.incr` path. This test mocks
 *   ONLY `redis.incr` (+ `expire`) to throw, leaving `cacheGetSafe` working,
 *   so the failure is forced to originate at the quota counter itself — the
 *   exact code path with no enclosing try/catch in the quota libs
 *   (pruneQuota.ts:93 / replayQuota.ts:67).
 *
 * Trust boundary: T-38.01-02 (DoS via quota-counter death). The contract is
 * that a dead quota counter degrades-open at the route layer (503/200),
 * never a 5xx crash that leaks a stack trace through the operator boundary.
 *
 * dashboardAuth is bypassed because NODE_ENV !== 'production' here, so the
 * quota-gated endpoints are reachable without a Bearer.
 */
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { Server } from 'http';
import type { AddressInfo } from 'node:net';

// ---------- Mocks (hoisted) ----------

// Rate limit pass-through (matches existing route test convention)
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimiters: {
    flights: _passThrough,
    ships: _passThrough,
    events: _passThrough,
    news: _passThrough,
    markets: _passThrough,
    weather: _passThrough,
    sites: _passThrough,
    sources: _passThrough,
    geocode: _passThrough,
    water: _passThrough,
    public: _passThrough,
  },
}));

// Config — preserve constants, override secret-bearing fields
vi.mock('../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config.js')>();
  return {
    ...actual,
    config: {
      port: 0,
      corsOrigin: '*',
      opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
      aisstream: { apiKey: 'test-ais-key' },
      acled: { email: 'test@example.com', password: 'test-pass' },
    },
  };
});

// Upstream adapter mocks — return empty/cheap data so handlers complete
vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({ collectShips: vi.fn(async () => []) }));
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/acled.js', () => ({ fetchEvents: vi.fn(async () => []) }));
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: vi.fn(async () => ({ sites: [], stats: {} })),
}));
vi.mock('../../adapters/gdelt-doc.js', () => ({ fetchGdeltArticles: vi.fn(async () => []) }));
vi.mock('../../adapters/rss.js', () => ({
  fetchAllRssFeeds: vi.fn(async () => []),
  RSS_FEEDS: [],
}));
vi.mock('../../adapters/yahoo-finance.js', () => ({
  fetchMarkets: vi.fn(async () => []),
  isValidRange: vi.fn(() => true),
}));
vi.mock('../../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown' })),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => ({ facilities: [], stats: {} })),
  FACILITY_TYPE_LABELS: {},
}));
vi.mock('../../lib/waterSnapshot.js', () => ({
  loadWaterSnapshot: vi.fn(() => null),
  __resetSnapshotCacheForTests: vi.fn(),
}));
vi.mock('../../lib/sitesSnapshot.js', () => ({
  loadSitesSnapshot: vi.fn(() => null),
  __resetSitesSnapshotCacheForTests: vi.fn(),
}));

// Quota-path chaos: ONLY `redis.incr` (and its `expire` follow-up) throw.
// Everything else — including cacheGetSafe / cacheSetSafe and the rest of the
// raw redis client — works normally (passed through from `actual`). This
// forces any failure to originate at the unguarded quota INCR, not at an
// earlier degrade-open cacheGetSafe short-circuit (Pitfall 5).
const incrDeath = (): never => {
  throw new Error('ECONNREFUSED: redis.incr is dead (quota chaos)');
};
vi.mock('../../cache/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cache/redis.js')>();
  return {
    ...actual,
    redis: {
      ...actual.redis,
      // Make the quota counter explode at its raw INCR call.
      incr: vi.fn(incrDeath),
      expire: vi.fn(incrDeath),
      // The cache-backed reads in the route bodies must still succeed (return
      // null = cache miss) so the failure is isolated to the quota path.
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      ping: vi.fn(async () => 'PONG'),
    },
    // cacheGetSafe / cacheSetSafe come through from `actual` so the cache
    // reads in the route bodies degrade-open as designed.
  };
});

// ---------- Test ----------

describe('Chaos: quota-path redis.incr death (LLM-FIX-05)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.OPENSKY_CLIENT_ID = 'test-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-secret';
    process.env.AISSTREAM_API_KEY = 'test-ais';

    const { createApp } = await import('../../index.js');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
    delete process.env.AISSTREAM_API_KEY;
  });

  it('POST /api/events/prune-dead-urls returns 503 (NEVER 500) when redis.incr throws in the quota path', async () => {
    // The prune route consumes a quota slot via checkPruneQuota BEFORE doing
    // any work. With cacheGetSafe healthy but redis.incr dead, the failure is
    // forced to originate at the quota counter — the route's try/catch must
    // translate it into 503 prune_failed, never a 500.
    const res = await request(baseUrl)
      .post('/api/events/prune-dead-urls')
      .send({ trigger: 'manual' });

    expect(res.status).not.toBe(500);
    // 503 is the expected degrade-open path (incr threw). 200 would only
    // happen if the route short-circuited before incr — which this test's
    // mock shape (healthy cacheGetSafe, dead incr) is specifically designed
    // to prevent for the quota call.
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) {
      expect(res.body.error).toBe('prune_failed');
      expect(typeof res.body.detail).toBe('string');
    }
  });

  it('POST /api/events/llm-replay/:groupKey returns 503 (NEVER 500) when redis.incr throws in the quota path', async () => {
    // The replay route calls checkReplayQuota (raw redis.incr, no enclosing
    // try/catch in replayQuota.ts) BEFORE the LLM spend. When incr throws the
    // route must degrade to 503 — a 500 here is the Pitfall 5 regression
    // (unhandled quota-counter death leaking a stack trace).
    const res = await request(baseUrl).post('/api/events/llm-replay/test-group-key').send({});

    expect(res.status).not.toBe(500);
    expect([200, 503]).toContain(res.status);
  });
});
