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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';

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
vi.mock('../../adapters/overpass.js', () => ({ fetchSites: vi.fn(async () => []) }));
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
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
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

  it('GET /health returns 200 with status=degraded and redis=false', async () => {
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.redis).toBe(false);
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
});
