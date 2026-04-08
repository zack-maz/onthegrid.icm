// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';
import type { FlightEntity, CacheResponse } from '../types.js';

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Mock config before importing createApp (spread actual to preserve constants)
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  const mockCfg = {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: '', clientSecret: '' },
    aisstream: { apiKey: '' },
    acled: { email: '', password: '' },
    newsRelevanceThreshold: 0.7,
    eventConfidenceThreshold: 0.35,
    eventMinSources: 2,
    eventCentroidPenalty: 0.7,
    eventExcludedCameo: ['180', '192'],
    bellingcatCorroborationBoost: 0.2,
  };
  return { ...actual, config: mockCfg, loadConfig: () => mockCfg, getConfig: () => mockCfg };
});

// Mock rate limiter -- pass through for server tests
const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../middleware/rateLimit.js', () => ({
  rateLimiters: {
    flights: passThrough,
    ships: passThrough,
    events: passThrough,
    news: passThrough,
    markets: passThrough,
    weather: passThrough,
    sites: passThrough,
    sources: passThrough,
    geocode: passThrough,
    water: passThrough,
    public: passThrough,
  },
}));

// Mock adapters for flight route tests
const mockFetchFlights = vi.fn();
vi.mock('../adapters/opensky.js', () => ({
  fetchFlights: (...args: unknown[]) => mockFetchFlights(...args),
}));

vi.mock('../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

// Mock aisstream adapter (ships route imports getShips/getLastMessageTime)
vi.mock('../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
  collectShips: vi.fn(async () => []),
}));

// Mock GDELT adapter -- events.ts only imports fetchEvents (no backfillEvents)
vi.mock('../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));
vi.mock('../adapters/overpass.js', () => ({ fetchSites: vi.fn(async () => []) }));
vi.mock('../adapters/gdelt-doc.js', () => ({ fetchGdeltArticles: vi.fn(async () => []) }));
vi.mock('../adapters/rss.js', () => ({ fetchAllRssFeeds: vi.fn(async () => []), RSS_FEEDS: [] }));
vi.mock('../adapters/yahoo-finance.js', () => ({
  fetchMarkets: vi.fn(async () => []),
  isValidRange: vi.fn(() => true),
}));
vi.mock('../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));
vi.mock('../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
}));
vi.mock('../adapters/overpass-water.js', () => ({ fetchWaterFacilities: vi.fn(async () => []) }));
vi.mock('../adapters/open-meteo-precip.js', () => ({ fetchPrecipitation: vi.fn(async () => []) }));

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
vi.mock('../cache/redis.js', () => ({
  redis: { ping: vi.fn(async () => 'PONG') },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { createApp } = await import('../index.js');
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

describe('Express server', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.redis).toBe(true);
    expect(typeof body.uptime).toBe('number');
  });

  it('unknown route returns 404', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('CORS Access-Control-Allow-Origin defaults to * when CORS_ORIGIN not set', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('server boots without OpenSky/AISStream API keys', async () => {
    // The server is already running with empty string API keys (via mock config)
    // Verify it responds normally
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

describe('Flights route cache-first behavior', () => {
  const mockFlights: FlightEntity[] = [
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

  beforeEach(() => {
    redisStore.clear();
    mockFetchFlights.mockReset();
    mockFetchFlights.mockResolvedValue(mockFlights);
  });

  it('serves cached data on second request without calling upstream again', async () => {
    process.env.OPENSKY_CLIENT_ID = 'test-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-secret';

    // First request: should call upstream fetchFlights (explicit opensky source)
    const res1 = await fetch(`${baseUrl}/api/flights?source=opensky`);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { data: FlightEntity[]; stale: boolean };
    expect(body1.data).toHaveLength(1);
    expect(body1.stale).toBe(false);
    expect(mockFetchFlights).toHaveBeenCalledTimes(1);

    // Second request: should serve from cache (no upstream call)
    const res2 = await fetch(`${baseUrl}/api/flights?source=opensky`);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { data: FlightEntity[]; stale: boolean };
    expect(body2.data).toHaveLength(1);
    expect(body2.stale).toBe(false);

    // fetchFlights should NOT have been called again
    expect(mockFetchFlights).toHaveBeenCalledTimes(1);

    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
  });
});
