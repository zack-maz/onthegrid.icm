// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { GeocodedLocation } from '../../adapters/nominatim.js';

// Module-level mock function for the adapter
const mockReverseGeocode = vi.fn(
  async (): Promise<GeocodedLocation> => ({
    city: 'Baghdad',
    country: 'Iraq',
    display: 'Baghdad, Iraq',
  }),
);

// In-memory cache store
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Mock rate limiter
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimitMiddleware: _passThrough,
  rateLimiters: {
    flights: _passThrough, ships: _passThrough, events: _passThrough, news: _passThrough,
    markets: _passThrough, weather: _passThrough, sites: _passThrough, sources: _passThrough,
    geocode: _passThrough,
  },
}));

// Mock config
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

// Mock all adapters to avoid import chain issues
vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-exchange.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));
vi.mock('../../adapters/acled.js', () => ({ fetchEvents: vi.fn(async () => []) }));
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
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

// Mock Nominatim adapter
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: (...args: unknown[]) => mockReverseGeocode(...args),
}));

// Mock Redis cache module with in-memory store
const _mockCacheGetSafe = vi.fn(
  async <T>(key: string, logicalTtlMs: number) => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  },
);
const _mockCacheSetSafe = vi.fn(
  async <T>(key: string, data: T, _redisTtlSec: number) => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  },
);
vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: _mockCacheGetSafe,
  cacheSet: _mockCacheSetSafe,
  cacheGetSafe: _mockCacheGetSafe,
  cacheSetSafe: _mockCacheSetSafe,
}));

describe('Geocode Route (/api/geocode)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    mockReverseGeocode.mockClear();
    _mockCacheGetSafe.mockClear();
    _mockCacheSetSafe.mockClear();
    mockReverseGeocode.mockResolvedValue({
      city: 'Baghdad',
      country: 'Iraq',
      display: 'Baghdad, Iraq',
    });

    vi.resetModules();
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

  it('returns 400 when lat/lon missing', async () => {
    const res = await fetch(`${baseUrl}/api/geocode`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lat and lon/);
  });

  it('returns 400 when lat/lon are not numbers', async () => {
    const res = await fetch(`${baseUrl}/api/geocode?lat=abc&lon=xyz`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid numbers/);
  });

  it('returns cached result on cache hit (does not call Nominatim)', async () => {
    // Pre-populate cache with quantized key
    const cacheKey = 'geocode:33.25,44.25';
    redisStore.set(cacheKey, {
      data: { city: 'Cached City', country: 'Iraq', display: 'Cached City, Iraq' },
      fetchedAt: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/geocode?lat=33.254&lon=44.249`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.data.city).toBe('Cached City');
    expect(body.stale).toBe(false);
    expect(mockReverseGeocode).not.toHaveBeenCalled();
  });

  it('calls Nominatim and caches result on cache miss', async () => {
    const res = await fetch(`${baseUrl}/api/geocode?lat=33.25&lon=44.25`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.data.city).toBe('Baghdad');
    expect(body.data.country).toBe('Iraq');
    expect(body.stale).toBe(false);
    expect(typeof body.lastFresh).toBe('number');

    expect(mockReverseGeocode).toHaveBeenCalledTimes(1);
    expect(_mockCacheSetSafe).toHaveBeenCalledWith(
      'geocode:33.25,44.25',
      { city: 'Baghdad', country: 'Iraq', display: 'Baghdad, Iraq' },
      90 * 24 * 60 * 60, // 90-day hard TTL
    );
  });

  it('quantizes coordinates to 2 decimal places in cache key', async () => {
    // 33.9876 rounds to 33.99, 44.1234 rounds to 44.12
    const res = await fetch(`${baseUrl}/api/geocode?lat=33.9876&lon=44.1234`);
    expect(res.ok).toBe(true);

    // Verify cache was checked with quantized key
    expect(_mockCacheGetSafe).toHaveBeenCalledWith(
      'geocode:33.99,44.12',
      expect.any(Number),
    );

    // Verify Nominatim was called with quantized coords
    expect(mockReverseGeocode).toHaveBeenCalledWith(33.99, 44.12);
  });
});
