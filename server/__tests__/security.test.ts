// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { FlightEntity, ConflictEventEntity } from '../types.js';

// Mock config module with test credentials (spread actual to preserve constants)
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  const mockCfg = {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'SECRET_OPENSKY_CLIENT_ID', clientSecret: 'SECRET_OPENSKY_CLIENT_SECRET' },
    aisstream: { apiKey: 'SECRET_AISSTREAM_API_KEY' },
    acled: { email: 'SECRET_ACLED_EMAIL@example.com', password: 'SECRET_ACLED_PASSWORD' },
    newsRelevanceThreshold: 0.7,
    eventConfidenceThreshold: 0.35,
    eventMinSources: 2,
    eventCentroidPenalty: 0.7,
    eventExcludedCameo: ['180', '192'],
    bellingcatCorroborationBoost: 0.2,
  };
  return { ...actual, config: mockCfg, loadConfig: () => mockCfg, getConfig: () => mockCfg };
});

// Mock rate limiter -- pass through for security tests
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../middleware/rateLimit.js', () => ({
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

// Mock Redis cache
vi.mock('../cache/redis.js', () => ({
  redis: {
    ping: vi.fn(async () => 'PONG'),
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheGetSafe: vi.fn(async () => null),
  cacheSetSafe: vi.fn(async () => {}),
}));

// Mock the adapter modules to return test data without hitting upstream APIs
vi.mock('../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(
    async (): Promise<FlightEntity[]> => [
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
    ],
  ),
}));

vi.mock('../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

vi.mock('../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
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

vi.mock('../adapters/acled.js', () => ({
  fetchEvents: vi.fn(
    async (): Promise<ConflictEventEntity[]> => [
      {
        id: 'event-IRN12345',
        type: 'ground_combat' as const,
        lat: 35.6892,
        lng: 51.389,
        timestamp: Date.now(),
        label: 'Conventional military force',
        data: {
          eventType: 'Conventional military force',
          subEventType: 'CAMEO 190',
          fatalities: 0,
          actor1: 'Military Forces of Iran',
          actor2: 'Unknown',
          notes: 'Test event',
          source: 'Test Source',
          goldsteinScale: -9.5,
          locationName: 'Tehran, Iran',
          cameoCode: '190',
        },
      },
    ],
  ),
}));

describe('Security: No credential leaks in API responses', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const { createApp } = await import('../index.js');
    const app = createApp();

    // Start on random port
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

  it('GET /api/flights response does not contain OpenSky credentials', async () => {
    const res = await fetch(`${baseUrl}/api/flights`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_OPENSKY_CLIENT_ID');
    expect(text).not.toContain('SECRET_OPENSKY_CLIENT_SECRET');
  });

  it('GET /api/ships response does not contain AISStream API key', async () => {
    const res = await fetch(`${baseUrl}/api/ships`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_AISSTREAM_API_KEY');
  });

  it('GET /api/events response does not contain ACLED credentials', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_ACLED_EMAIL@example.com');
    expect(text).not.toContain('SECRET_ACLED_PASSWORD');
  });

  it('GET /api/flights?source=adsb response does not contain ADS-B Exchange API key', async () => {
    const res = await fetch(`${baseUrl}/api/flights?source=adsb`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_ADSB_API_KEY');
  });
});
