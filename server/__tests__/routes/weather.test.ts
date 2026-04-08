// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { WeatherGridPoint, CacheResponse } from '../../types.js';

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Module-level mock function for the adapter
const mockFetchWeather = vi.fn(async (): Promise<WeatherGridPoint[]> => []);

// Mock rate limiter
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

// Mock config (spread actual to preserve constants)
vi.mock('../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config.js')>();
  const mockCfg = {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
    eventConfidenceThreshold: 0.35,
    eventMinSources: 2,
    eventCentroidPenalty: 0.7,
    eventExcludedCameo: ['180', '192'],
    bellingcatCorroborationBoost: 0.2,
  };
  return { ...actual, config: mockCfg, loadConfig: () => mockCfg, getConfig: () => mockCfg };
});

// Mock all existing adapters to avoid import chain issues
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));
vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: vi.fn(async () => []),
}));
vi.mock('../../adapters/gdelt-doc.js', () => ({
  fetchGdeltArticles: vi.fn(async () => []),
}));
vi.mock('../../adapters/rss.js', () => ({
  fetchAllRssFeeds: vi.fn(async () => []),
  RSS_FEEDS: [],
}));
vi.mock('../../adapters/yahoo-finance.js', () => ({
  fetchMarkets: vi.fn(async () => []),
  isValidRange: vi.fn(() => true),
}));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
}));

// Mock Open-Meteo adapter
vi.mock('../../adapters/open-meteo.js', () => ({
  fetchWeather: (...args: unknown[]) => mockFetchWeather(...args),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));

// Mock Redis cache module with in-memory store
const _mockCacheGet = vi.fn(
  async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  },
);
const _mockCacheSet = vi.fn(
  async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  },
);
vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

// Sample weather data fixture
const samplePoints: WeatherGridPoint[] = [
  { lat: 20, lng: 40, temperature: 30, windSpeed: 12, windDirection: 180 },
  { lat: 21, lng: 41, temperature: 28, windSpeed: 8, windDirection: 270 },
];

describe('Weather Route (/api/weather)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    mockFetchWeather.mockClear();
    mockFetchWeather.mockResolvedValue([]);

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

  it('returns 200 with { data, stale: false, lastFresh } on cache miss + successful fetch', async () => {
    mockFetchWeather.mockResolvedValue(samplePoints);

    const res = await fetch(`${baseUrl}/api/weather`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      lat: 20,
      lng: 40,
      temperature: 30,
      windSpeed: 12,
      windDirection: 180,
    });
    expect(typeof body.lastFresh).toBe('number');
    expect(mockFetchWeather).toHaveBeenCalledTimes(1);
  });

  it('returns cached data when cache is fresh (does not call fetchWeather)', async () => {
    // Pre-populate cache with fresh data
    redisStore.set('weather:open-meteo', {
      data: samplePoints,
      fetchedAt: Date.now(), // fresh
    });

    const res = await fetch(`${baseUrl}/api/weather`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(2);
    expect(mockFetchWeather).not.toHaveBeenCalled();
  });

  it('returns stale cache with stale: true when upstream fails but cache exists', async () => {
    // Pre-populate stale cache
    redisStore.set('weather:open-meteo', {
      data: samplePoints,
      fetchedAt: Date.now() - 1_900_000, // stale (>30 min)
    });

    mockFetchWeather.mockRejectedValue(new Error('Open-Meteo API down'));

    const res = await fetch(`${baseUrl}/api/weather`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns 500 when upstream fails and no cache exists', async () => {
    mockFetchWeather.mockRejectedValue(new Error('Open-Meteo API down'));

    const res = await fetch(`${baseUrl}/api/weather`);
    expect(res.status).toBe(500);
  });
});
