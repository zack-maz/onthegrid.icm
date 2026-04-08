// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { FlightEntity } from '../../types.js';
import type { CacheResponse } from '../../types.js';

const mockOpenSkyFlights: FlightEntity[] = [
  {
    id: 'flight-abc123',
    type: 'flight',
    lat: 35.6,
    lng: 51.5,
    timestamp: Date.now(),
    label: 'IRN1234',
    data: {
      icao24: 'abc123',
      callsign: 'IRN1234',
      originCountry: 'Iran',
      velocity: 250,
      heading: 180,
      altitude: 10000,
      onGround: false,
      verticalRate: -5.0,
      unidentified: false,
    },
  },
];

const mockAdsbLolFlights: FlightEntity[] = [
  {
    id: 'flight-lol789',
    type: 'flight',
    lat: 33.0,
    lng: 54.0,
    timestamp: Date.now(),
    label: 'LOL999',
    data: {
      icao24: 'lol789',
      callsign: 'LOL999',
      originCountry: '',
      velocity: 200,
      heading: 45,
      altitude: 12000,
      onGround: false,
      verticalRate: 0,
      unidentified: false,
    },
  },
];

// Module-level mock functions that persist across tests
const mockFetchOpenSky = vi.fn(async (): Promise<FlightEntity[]> => mockOpenSkyFlights);
const mockFetchAdsbLol = vi.fn(async (): Promise<FlightEntity[]> => mockAdsbLolFlights);

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const redisStore = new Map<string, CacheEntry<unknown>>();

// Mock rate limiter -- pass through for route tests
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

// Mock config module (spread actual to preserve constants like CACHE_TTL, IRAN_BBOX, etc.)
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

vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: (...args: unknown[]) => mockFetchOpenSky(...args),
}));

vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: (...args: unknown[]) => mockFetchAdsbLol(...args),
}));

vi.mock('../../adapters/aisstream.js', () => ({
  collectShips: vi.fn(async () => []),
}));

vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));
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
vi.mock('../../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
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
  redis: { ping: vi.fn(async () => 'PONG') },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

describe('Flight Route Dispatch', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Clear the mock Redis store for fresh cache per test
    redisStore.clear();

    // Set credential env vars for tests
    process.env.OPENSKY_CLIENT_ID = 'test-opensky-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-opensky-secret';

    // Reset mock call history and restore default implementations
    mockFetchOpenSky.mockClear();
    mockFetchOpenSky.mockImplementation(async () => mockOpenSkyFlights);
    mockFetchAdsbLol.mockClear();
    mockFetchAdsbLol.mockImplementation(async () => mockAdsbLolFlights);

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
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
  });

  it('GET /api/flights (no source param) dispatches to adsblol adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('lol789');
  });

  it('GET /api/flights?source=opensky dispatches to OpenSky adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(mockFetchAdsbLol).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('abc123');
  });

  it('GET /api/flights?source=adsblol dispatches to adsb-lol adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsblol`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('lol789');
  });

  it('GET /api/flights?source=invalid returns 400 validation error', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=invalid`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockFetchAdsbLol).not.toHaveBeenCalled();
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
  });

  it('uses separate caches per source', async () => {
    // First request to adsblol
    const res1 = await fetch(`${baseUrl}/api/flights?source=adsblol`);
    expect(res1.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);

    // Request to OpenSky -- should NOT serve from adsblol cache
    const res2 = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body2 = await res2.json();
    expect(res2.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(body2.data[0].data.icao24).toBe('abc123');
  });

  it('returns 503 when OpenSky source requested but credentials not set', async () => {
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;

    const res = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('credentials not configured');
  });
});
