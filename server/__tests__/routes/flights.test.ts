// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { FlightEntity } from '../../types.js';

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

// Module-level mock functions that persist across vi.resetModules()
const mockFetchOpenSky = vi.fn(async (): Promise<FlightEntity[]> => mockOpenSkyFlights);
const mockFetchAdsb = vi.fn(async (): Promise<FlightEntity[]> => mockAdsbFlights);

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

vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));

describe('Flight Route Dispatch', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Set ADS-B Exchange API key for tests
    process.env.ADSB_EXCHANGE_API_KEY = 'test-adsb-key';

    // Reset mock call history and restore default implementations
    mockFetchOpenSky.mockClear();
    mockFetchOpenSky.mockImplementation(async () => mockOpenSkyFlights);
    mockFetchAdsb.mockClear();
    mockFetchAdsb.mockImplementation(async () => mockAdsbFlights);

    // Reset modules to get fresh cache instances per test
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
    delete process.env.ADSB_EXCHANGE_API_KEY;
  });

  it('GET /api/flights (no source param) dispatches to OpenSky adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('abc123');
  });

  it('GET /api/flights?source=opensky dispatches to OpenSky adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=opensky`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('abc123');
  });

  it('GET /api/flights?source=adsb dispatches to ADS-B Exchange adapter', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchAdsb).toHaveBeenCalledTimes(1);
    expect(mockFetchOpenSky).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('def456');
  });

  it('GET /api/flights?source=invalid falls back to OpenSky', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=invalid`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);
    expect(mockFetchAdsb).not.toHaveBeenCalled();
    expect(body.data[0].data.icao24).toBe('abc123');
  });

  it('uses separate caches per source', async () => {
    // First request to OpenSky
    const res1 = await fetch(`${baseUrl}/api/flights?source=opensky`);
    expect(res1.ok).toBe(true);
    expect(mockFetchOpenSky).toHaveBeenCalledTimes(1);

    // Request to ADS-B -- should NOT serve from OpenSky cache
    const res2 = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body2 = await res2.json();
    expect(res2.ok).toBe(true);
    expect(mockFetchAdsb).toHaveBeenCalledTimes(1);
    expect(body2.data[0].data.icao24).toBe('def456');
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

    // Advance time past TTL to make cache stale (260s + 1s)
    const originalNow = Date.now;
    let timeOffset = 0;
    Date.now = () => originalNow() + timeOffset;
    timeOffset = 261_000;

    // Now cache is stale, adapter will be called but throws RateLimitError
    mockFetchAdsb.mockRejectedValueOnce(new RateLimitError('Rate limit exceeded'));

    const res2 = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body2 = await res2.json();

    expect(res2.ok).toBe(true);
    expect(body2.rateLimited).toBe(true);
    expect(body2.data[0].data.icao24).toBe('def456');

    Date.now = originalNow;
  });

  it('returns 503 when ADS-B source requested but API key not set', async () => {
    delete process.env.ADSB_EXCHANGE_API_KEY;

    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('API key not configured');
  });

  it('ADS-B Exchange API key does not appear in response', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const text = await res.text();

    expect(text).not.toContain('test-adsb-key');
  });
});
