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

const mockAdsbFlights: FlightEntity[] = [
  {
    id: 'flight-def456',
    type: 'flight',
    lat: 32.5,
    lng: 53.0,
    timestamp: Date.now(),
    label: 'UAE789',
    data: {
      icao24: 'def456',
      callsign: 'UAE789',
      originCountry: '',
      velocity: 174.4,
      heading: 90,
      altitude: 11582.4,
      onGround: false,
      verticalRate: 0,
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
const mockFetchAdsb = vi.fn(async (): Promise<FlightEntity[]> => mockAdsbFlights);
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
  rateLimitMiddleware: _passThrough,
  rateLimiters: {
    flights: _passThrough, ships: _passThrough, events: _passThrough, news: _passThrough,
    markets: _passThrough, weather: _passThrough, sites: _passThrough, sources: _passThrough,
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
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
  }),
}));

vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: (...args: unknown[]) => mockFetchOpenSky(...args),
}));

vi.mock('../../adapters/adsb-exchange.js', () => ({
  fetchFlights: (...args: unknown[]) => mockFetchAdsb(...args),
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

// Mock Redis cache module with in-memory store
vi.mock('../../cache/redis.js', () => ({
  redis: {},
  cacheGet: vi.fn(async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  }),
  cacheSet: vi.fn(async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  }),
}));

describe('Flight Route Dispatch', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Clear the mock Redis store for fresh cache per test
    redisStore.clear();

    // Set credential env vars for tests
    process.env.ADSB_EXCHANGE_API_KEY = 'test-adsb-key';
    process.env.OPENSKY_CLIENT_ID = 'test-opensky-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-opensky-secret';

    // Reset mock call history and restore default implementations
    mockFetchOpenSky.mockClear();
    mockFetchOpenSky.mockImplementation(async () => mockOpenSkyFlights);
    mockFetchAdsb.mockClear();
    mockFetchAdsb.mockImplementation(async () => mockAdsbFlights);
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
    delete process.env.ADSB_EXCHANGE_API_KEY;
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
  });

  it('GET /api/flights (no source param) dispatches to adsblol adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('lol789');
  });

  it('GET /api/flights?source=opensky dispatches to OpenSky adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(mockFetchAdsbLol).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('abc123');
  });

  it('GET /api/flights?source=adsb dispatches to ADS-B Exchange adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsb).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(mockFetchAdsbLol).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('def456');
  });

  it('GET /api/flights?source=adsblol dispatches to adsb-lol adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsblol`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('lol789');
  });

  it('GET /api/flights?source=invalid falls back to adsblol', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=invalid`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('lol789');
  });

  it('uses separate caches per source', async () => {
    // First request to adsblol
    const res1 = await fetch(`${baseUrl}/api/flights?source=adsblol`);
    expect(res1.ok).toBe(true);
    expect(mockFetchAdsbLol).toHaveBeenCalledTimes(1);

    // Request to ADS-B -- should NOT serve from adsblol cache
    const res2 = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body2 = await res2.json();
    expect(res2.ok).toBe(true);
    expect(mockFetchAdsb).toHaveBeenCalledTimes(1);
    expect(body2.data[0].data.icao24).toBe('def456');

    // Request to OpenSky -- should NOT serve from other caches
    const res3 = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body3 = await res3.json();
    expect(res3.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(body3.data[0].data.icao24).toBe('abc123');
  });

  it('returns 429 when ADS-B adapter throws RateLimitError and no cache exists', async () => {
    const { RateLimitError } = await import('../../types.js');

    mockFetchAdsb.mockRejectedValueOnce(new RateLimitError('Rate limit exceeded'));

    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.rateLimited).toBe(true);
    expect(body.error).toBe('Rate limited');
  });

  it('returns rateLimited flag with stale cache data when rate limited', async () => {
    const { RateLimitError } = await import('../../types.js');

    // First request populates cache
    const res1 = await fetch(`${baseUrl}/api/flights?source=adsb`);
    expect(res1.ok).toBe(true);

    // Manually set the fetchedAt in the past to make cache stale
    const entry = redisStore.get('flights:adsb');
    if (entry) {
      entry.fetchedAt = Date.now() - 261_000; // past ADS-B TTL (260s)
    }

    // Now cache is stale, adapter will be called but throws RateLimitError
    mockFetchAdsb.mockRejectedValueOnce(new RateLimitError('Rate limit exceeded'));

    const res2 = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body2 = await res2.json();

    expect(res2.ok).toBe(true);
    expect(body2.rateLimited).toBe(true);
    expect(body2.data[0].data.icao24).toBe('def456');
  });

  it('returns 503 when ADS-B source requested but API key not set', async () => {
    delete process.env.ADSB_EXCHANGE_API_KEY;

    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('API key not configured');
  });

  it('returns 503 when OpenSky source requested but credentials not set', async () => {
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;

    const res = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('credentials not configured');
  });

  it('ADS-B Exchange API key does not appear in response', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const text = await res.text();

    expect(text).not.toContain('test-adsb-key');
  });
});
