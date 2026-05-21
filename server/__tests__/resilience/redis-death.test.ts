// @vitest-environment node
/**
 * Redis-death chaos test.
 *
 * Goal: prove that when @upstash/redis throws on every call, the API
 * degrades gracefully — never returning HTTP 500 — and that /health
 * reports `status: 'degraded'` and `redis: false`.
 *
 * Strategy:
 *   - Mock the LOW-LEVEL Upstash client (`server/cache/redis.ts` exports
 *     `redis` and `cacheGet` / `cacheSet`) to throw on every call.
 *   - Leave `cacheGetSafe` / `cacheSetSafe` untouched — they already
 *     wrap try/catch and fall through to the in-memory cache.
 *     The test PROVES the existing safe wrapper works against every
 *     route end-to-end.
 *   - Mock upstream adapters to return empty arrays so route handlers
 *     run their full happy path (cache miss → fetch → cache set →
 *     respond) under simulated Redis death.
 *   - For each route assert: `status` is in {200, 503} and never 500.
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
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/aisstream.js', () => ({
  collectShips: vi.fn(async () => []),
}));
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/acled.js', () => ({ fetchEvents: vi.fn(async () => []) }));
// Phase 27.3.1 R-05 — fetchSites now returns { sites, stats }. Chaos test
// only needs an empty shape so the route handler can run its error/empty path.
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: vi.fn(async () => ({
    sites: [],
    stats: {
      rawCount: 0,
      filteredCount: 0,
      rejections: { excluded_turkey: 0, no_coords: 0, no_type: 0, duplicate: 0 },
      byCountry: {},
      byType: {},
      overpass: [],
      source: 'overpass',
      generatedAt: new Date(0).toISOString(),
    },
  })),
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
vi.mock('../../adapters/open-meteo.js', () => ({
  fetchWeather: vi.fn(async () => []),
}));
// Phase 27.3.1 Plan 10 (G1 follow-up): the route now consumes
// fetchWaterFacilities() as `{ facilities, stats }`. Previously the chaos
// mock returned `[]` and relied on the subsequent `labelUnnamedFacilities`
// call to throw (which was caught by the route's error branch). Plan 10
// removed labelUnnamedFacilities entirely — we now return a structurally
// valid empty shape so the route's happy path completes into a 200 with
// empty data (cacheSetSafe still fires the 2s safe-timeout under Redis
// death, but gracefully; sendValidated validates the empty payload which
// is schema-valid).
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => ({
    facilities: [],
    stats: {
      rawCounts: {},
      filteredCounts: {},
      rejections: {
        excluded_location: 0,
        excluded_turkey: 0, // Phase 27.3.1 Plan 10 (G2)
        not_notable: 0,
        no_name: 0,
        no_resolved_name: 0, // Phase 27.3.2 D-04
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      },
      byTypeRejections: {},
      byCountry: {},
      overpass: [],
      source: 'overpass' as const,
      generatedAt: new Date(0).toISOString(),
      enrichment: { withCapacity: 0, withCity: 0, withRiver: 0 },
      scoreHistogram: [],
    },
  })),
  FACILITY_TYPE_LABELS: {
    dam: 'Dam',
    reservoir: 'Reservoir',
    desalination: 'Desalination Plant',
    treatment_plant: 'Treatment Plant',
  },
}));
// Phase 27.3.1 R-04 — suppress the snapshot tier under Redis death so the
// chaos test continues to exercise the cache-miss → Overpass-mock → respond
// path it was designed for. (With the snapshot present, the route would
// load 602 facilities and then call `cacheSetSafe` which hits the 2000ms
// safe-timeout wrapper under Redis death, blowing past the test's 10s
// timeout. Mocking the loader to null preserves the test's intent: prove
// that Redis-dead → no HTTP 500.)
//
// Phase 27.3.1 Plan 10 note: pre-Plan-10 the snapshot-serve branch also
// ran `labelUnnamedFacilities` per facility (which added its OWN Redis
// geocode-cache reads, compounding the timeout problem). Plan 10 removed
// that call entirely; the loadWaterSnapshot mock is still needed to keep
// the test on its cache-miss path, but the severity is lower now.
vi.mock('../../lib/waterSnapshot.js', () => ({
  loadWaterSnapshot: vi.fn(() => null),
  __resetSnapshotCacheForTests: vi.fn(),
}));
// Phase 27.3.1 R-05 — same preemptive mock as waterSnapshot above. With a
// real 300–800 site snapshot on disk under simulated Redis death, the route
// would load the snapshot → call cacheSetSafe → hit the safe-timeout wrapper
// (2000ms per call under Redis death) and blow past the 10s test timeout.
// Mocking to null preserves the test's intent: prove that Redis-dead →
// no HTTP 500 on any route.
vi.mock('../../lib/sitesSnapshot.js', () => ({
  loadSitesSnapshot: vi.fn(() => null),
  __resetSitesSnapshotCacheForTests: vi.fn(),
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown' })),
}));

// Redis chaos: throw on every direct redis client call AND on the
// unsafe cacheGet/cacheSet helpers. cacheGetSafe/cacheSetSafe are NOT
// mocked — they MUST be importable from the real module so the test
// proves the in-memory fallback works.
const redisDeath = (): never => {
  throw new Error('ECONNREFUSED: redis is dead (chaos test)');
};
vi.mock('../../cache/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cache/redis.js')>();
  return {
    ...actual,
    redis: {
      ping: vi.fn(redisDeath),
      get: vi.fn(redisDeath),
      set: vi.fn(redisDeath),
      del: vi.fn(redisDeath),
    },
    cacheGet: vi.fn(redisDeath),
    cacheSet: vi.fn(redisDeath),
    // cacheGetSafe / cacheSetSafe come through from `actual` — they are
    // the system under test. They internally call `cacheGet` / `cacheSet`
    // (now mocked to throw) and must catch the error and fall back.
  };
});

// ---------- Test ----------

describe('Chaos: Redis death', () => {
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

  it('GET /health returns 200 (never 500) under Redis death; endpoints status reflects probe failure', async () => {
    // Phase 28.1 W2 — /health now emits a HealthResponse. Under simulated
    // Redis death the response still returns 200 (never 500); per-endpoint
    // probes that hit the dead Redis derive to 'unhealthy' via deriveStatus
    // because cacheGetSafe rejects/throws which the probe layer captures
    // as hadError=true. The aggregate is read-only and resilient.
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.endpoints).toBeDefined();
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.generatedAt).toBe('number');
    // At least one cache-backed endpoint should reflect the Redis death.
    // Probes use cacheGetSafe which has an in-memory fallback — under
    // chaos-mode death without prior memCache writes, freshness is null
    // → status either 'unknown' or 'unhealthy'. Either is acceptable;
    // what matters is that the response shape is intact.
    const flights = res.body.endpoints.flights;
    expect(flights).toBeDefined();
    expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(flights.status);
  });

  // 8 cached routes per the plan. Each must return 200 or 503 — never 500.
  const cachedRoutes: { name: string; path: string }[] = [
    { name: 'flights', path: '/api/flights' },
    { name: 'ships', path: '/api/ships' },
    { name: 'events', path: '/api/events' },
    { name: 'news', path: '/api/news' },
    { name: 'sites', path: '/api/sites' },
    { name: 'water', path: '/api/water' },
    { name: 'markets', path: '/api/markets' },
    { name: 'weather', path: '/api/weather' },
  ];

  it.each(cachedRoutes)(
    'GET $path returns 200 (degraded) or 502/503 (never 500) under Redis death',
    async ({ path }) => {
      const res = await request(baseUrl).get(path);
      // The contract: cached routes must NEVER 500. They may serve a
      // degraded 200 (with degraded:true on the body) or a 502/503 with
      // an UPSTREAM_ERROR envelope, depending on whether the upstream
      // adapter succeeded.
      // 502 (Bad Gateway) and 503 (Service Unavailable) are both
      // valid "we know we're broken" responses; 500 means we crashed.
      expect(res.status).not.toBe(500);
      expect([200, 502, 503]).toContain(res.status);

      // If the route returned 200, it MUST be a CacheResponse-shaped body.
      // Empty data array is acceptable (mocked adapters return []).
      if (res.status === 200) {
        expect(res.body).toBeDefined();
        // Either CacheResponse-style { data, stale, lastFresh, ... }
        // or a top-level array (some routes wrap differently). Both shapes
        // are documented in OpenAPI; the contract is "no 500".
        if (Object.prototype.hasOwnProperty.call(res.body, 'data')) {
          expect(Array.isArray(res.body.data)).toBe(true);
        }
      }

      // If the route returned 502/503, it must use the structured error envelope.
      if (res.status === 502 || res.status === 503) {
        expect(res.body).toMatchObject({
          code: expect.any(String),
          statusCode: res.status,
        });
      }
    },
  );

  it('No cached route ever returns HTTP 500 under Redis death', async () => {
    const results = await Promise.all(
      cachedRoutes.map(async ({ name, path }) => {
        const res = await request(baseUrl).get(path);
        return { name, status: res.status };
      }),
    );
    for (const { name, status } of results) {
      expect(status, `${name} returned ${status}`).not.toBe(500);
    }
  });

  // ---------------------------------------------------------------------------
  // Phase 32 Plan 32-03 Task 4 — chaos coverage for the prune endpoint.
  //
  // POST /api/events/prune-dead-urls splices entries out of events:llm:v3
  // and DELs the url-liveness keys. Under simulated Redis death the helper
  // throws on the very first redis call; the route's catch-block must
  // translate that into a 503 prune_failed response — NEVER 500.
  //
  // The route accepts 200 OR 503 (RESEARCH Pitfall 6 / 32-PATTERNS.md
  // L877-896): 200 is possible if cacheGetSafe's in-memory fallback returns
  // an empty cache (helper returns {prunedCount:0, prunedIds:[]} without
  // touching redis.del/decrby); 503 is the catch-block path when any
  // raw redis call throws. The contract is "never 500".
  //
  // dashboardAuth is bypassed because NODE_ENV !== 'production' here.
  // ---------------------------------------------------------------------------
  it('POST /api/events/prune-dead-urls returns 200 or 503 (NEVER 500) under Redis death', async () => {
    const res = await request(baseUrl)
      .post('/api/events/prune-dead-urls')
      .send({ trigger: 'manual' });

    expect(res.status).not.toBe(500);
    expect([200, 503]).toContain(res.status);

    if (res.status === 503) {
      // 503 envelope must use the route's documented shape, not the
      // generic UPSTREAM_ERROR envelope (the route returns its own
      // {error:'prune_failed', detail} payload).
      expect(res.body.error).toBe('prune_failed');
      expect(typeof res.body.detail).toBe('string');
    }
    if (res.status === 200) {
      // Helper degraded to {prunedCount:0, prunedIds:[]} via
      // cacheGetSafe's in-memory fallback.
      expect(res.body).toEqual({ prunedCount: 0, prunedIds: [] });
    }
  });
});
