// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Mock config before importing createApp
vi.mock('../../config.js', () => ({
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: '', clientSecret: '' },
    aisstream: { apiKey: '' },
    acled: { email: '', password: '' },
    newsRelevanceThreshold: 0.7,
  }),
  getConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: '', clientSecret: '' },
    aisstream: { apiKey: '' },
    acled: { email: '', password: '' },
    newsRelevanceThreshold: 0.7,
  }),
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: '', clientSecret: '' },
    aisstream: { apiKey: '' },
    acled: { email: '', password: '' },
    newsRelevanceThreshold: 0.7,
  },
  // Re-export constants that routes import from config
  WAR_START: Date.UTC(2026, 1, 28),
  IRAN_BBOX: { south: 0, north: 50, west: 20, east: 80 },
  IRAN_CENTER: { lat: 28, lon: 45 },
  ADSB_RADIUS_NM: 1200,
  CACHE_TTL: { flights: 5000, adsblolFlights: 30000, events: 900000 },
  SITES_CACHE_TTL: 86400000,
  NEWS_CACHE_TTL: 900000,
  NEWS_REDIS_TTL_SEC: 9000,
  NEWS_SLIDING_WINDOW_MS: 604800000,
  MARKETS_CACHE_TTL: 60000,
  MARKETS_REDIS_TTL_SEC: 600,
  WEATHER_CACHE_TTL: 600000,
  WEATHER_REDIS_TTL_SEC: 6000,
  WEATHER_CACHE_KEY: 'weather:open-meteo',
  WATER_CACHE_TTL: 86400000,
  WATER_REDIS_TTL_SEC: 259200,
  WATER_PRECIP_CACHE_TTL: 21600000,
  WATER_PRECIP_REDIS_TTL_SEC: 216000,
  KNOTS_TO_MS: 0.514444,
  FEET_TO_METERS: 0.3048,
  FPM_TO_MS: 0.00508,
}));

// Mock rate limiter
const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
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

// Mock all adapters
vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
  collectShips: vi.fn(async () => []),
}));
vi.mock('../../adapters/gdelt.js', () => ({ fetchEvents: vi.fn(async () => []) }));
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
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown' })),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));

// Mock Redis
vi.mock('../../cache/redis.js', () => ({
  redis: { ping: vi.fn(async () => 'PONG') },
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheGetSafe: vi.fn(async () => null),
  cacheSetSafe: vi.fn(async () => {}),
}));

describe('X-Request-ID tracing', () => {
  let baseUrl: string;
  let server: import('node:http').Server;

  // Setup: create and start server once for all tests
  beforeAll(async () => {
    const { createApp } = await import('../../index.js');
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

  it('response includes X-Request-ID header with UUID format', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const requestId = res.headers.get('x-request-id');

    expect(requestId).toBeTruthy();
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('echoes back X-Request-ID from request header', async () => {
    const customId = 'my-custom-trace-id-12345';
    const res = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Request-ID': customId },
    });
    const requestId = res.headers.get('x-request-id');

    expect(requestId).toBe(customId);
  });

  it('generates unique IDs for different requests', async () => {
    const res1 = await fetch(`${baseUrl}/health`);
    const res2 = await fetch(`${baseUrl}/health`);

    const id1 = res1.headers.get('x-request-id');
    const id2 = res2.headers.get('x-request-id');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
