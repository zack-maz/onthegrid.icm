// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { ShipEntity, CacheResponse } from '../../types.js';

// Sample ship entities for testing
const shipA: ShipEntity = {
  id: 'ship-111111111',
  type: 'ship',
  lat: 27.5,
  lng: 52.3,
  timestamp: Date.now(),
  label: 'VESSEL ALPHA',
  data: {
    mmsi: 111111111,
    shipName: 'VESSEL ALPHA',
    speedOverGround: 12.5,
    courseOverGround: 180.0,
    trueHeading: 175,
  },
};

const shipB: ShipEntity = {
  id: 'ship-222222222',
  type: 'ship',
  lat: 30.0,
  lng: 50.0,
  timestamp: Date.now(),
  label: 'VESSEL BRAVO',
  data: {
    mmsi: 222222222,
    shipName: 'VESSEL BRAVO',
    speedOverGround: 8.0,
    courseOverGround: 90.0,
    trueHeading: 85,
  },
};

// Module-level mock function for collectShips
const mockCollectShips = vi.fn(async (): Promise<ShipEntity[]> => [shipB]);

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const redisStore = new Map<string, CacheEntry<unknown>>();

// Mock rate limiter -- pass through for route tests
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimitMiddleware: _passThrough,
  rateLimiters: {
    flights: _passThrough, ships: _passThrough, events: _passThrough, news: _passThrough,
    markets: _passThrough, weather: _passThrough, sites: _passThrough, sources: _passThrough,
    geocode: _passThrough,
  },
}));

// Mock config module
vi.mock('../../config.js', () => ({
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  }),
  getConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  }),
}));

// Mock flight adapters (needed because flights route imports them)
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

vi.mock('../../adapters/adsb-exchange.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

// Mock aisstream adapter with collectShips
vi.mock('../../adapters/aisstream.js', () => ({
  collectShips: (...args: unknown[]) => mockCollectShips(...args),
}));

// Mock GDELT adapter (events.ts runs module-level backfill code)
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/overpass.js', () => ({ fetchSites: vi.fn(async () => []) }));
vi.mock('../../adapters/gdelt-doc.js', () => ({ fetchGdeltArticles: vi.fn(async () => []) }));
vi.mock('../../adapters/rss.js', () => ({ fetchAllRssFeeds: vi.fn(async () => []), RSS_FEEDS: [] }));
vi.mock('../../adapters/yahoo-finance.js', () => ({ fetchMarkets: vi.fn(async () => []), isValidRange: vi.fn(() => true) }));
vi.mock('../../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));
vi.mock('../../adapters/nominatim.js', () => ({ reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })) }));

// Mock Redis cache module with in-memory store
const _mockCacheGet = vi.fn(async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
  const entry = redisStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
  return { data: entry.data, stale, lastFresh: entry.fetchedAt };
});
const _mockCacheSet = vi.fn(async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
  redisStore.set(key, { data, fetchedAt: Date.now() });
});
vi.mock('../../cache/redis.js', () => ({
  redis: { ping: vi.fn(async () => 'PONG') },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

describe('Ships Route', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Clear the mock Redis store for fresh cache per test
    redisStore.clear();

    // Reset mock call history and restore default implementations
    mockCollectShips.mockClear();
    mockCollectShips.mockImplementation(async () => [shipB]);

    const { createApp } = await import('../../index.js');
    const app = createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
  });

  it('returns fresh cached data without calling collectShips when cache is fresh', async () => {
    // Seed the Redis store with fresh cached data
    redisStore.set('ships:ais', {
      data: [shipA],
      fetchedAt: Date.now(), // fresh (within 30s logical TTL)
    });

    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockCollectShips).not.toHaveBeenCalled();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ship-111111111');
    expect(body.stale).toBe(false);
  });

  it('calls collectShips on cache miss and returns result', async () => {
    // No cache seeded -- cache miss
    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockCollectShips).toHaveBeenCalledTimes(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ship-222222222');
    expect(body.stale).toBe(false);
  });

  it('merges fresh ships with previously cached ships', async () => {
    // Seed cache with ship A (but make it stale so collectShips is called)
    redisStore.set('ships:ais', {
      data: [shipA],
      fetchedAt: Date.now() - 31_000, // stale (past 30s logical TTL)
    });

    // collectShips returns ship B
    mockCollectShips.mockImplementation(async () => [shipB]);

    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((s: ShipEntity) => s.id);
    expect(ids).toContain('ship-111111111');
    expect(ids).toContain('ship-222222222');
  });

  it('prunes ships older than 10 minutes from merged result', async () => {
    const tenMinutesAgo = Date.now() - 601_000; // older than 10 min

    const staleShip: ShipEntity = {
      ...shipA,
      timestamp: tenMinutesAgo,
    };

    // Seed cache with stale ship A
    redisStore.set('ships:ais', {
      data: [staleShip],
      fetchedAt: Date.now() - 31_000, // stale cache
    });

    // collectShips returns fresh ship B
    mockCollectShips.mockImplementation(async () => [shipB]);

    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    // Ship A should be pruned (timestamp > 10 min old), only ship B remains
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ship-222222222');
  });

  it('falls back to stale cache with stale:true when collectShips throws', async () => {
    // Seed cache with stale data
    redisStore.set('ships:ais', {
      data: [shipA],
      fetchedAt: Date.now() - 31_000, // stale
    });

    mockCollectShips.mockRejectedValueOnce(new Error('WebSocket failed'));

    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ship-111111111');
  });

  it('returns 500 when collectShips throws and no cache exists', async () => {
    // No cache seeded
    mockCollectShips.mockRejectedValueOnce(new Error('WebSocket failed'));

    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Ship data unavailable');
  });

  it('response shape matches CacheResponse<ShipEntity[]>', async () => {
    const res = await fetch(`${baseUrl}/api/ships`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('stale');
    expect(body).toHaveProperty('lastFresh');
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.stale).toBe('boolean');
    expect(typeof body.lastFresh).toBe('number');
  });
});
