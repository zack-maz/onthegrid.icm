// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';

// Mock config before importing the entry point (spread actual to preserve constants)
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

// Mock rate limiter -- pass through
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

// Mock adapters
vi.mock('../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
  collectShips: vi.fn(async () => []),
}));
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

// Mock Redis cache module
const _mockCacheGet = vi.fn(async () => null);
const _mockCacheSet = vi.fn(async () => undefined);
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

describe('Vercel entry point (server/vercel-entry.ts)', () => {
  it('has a default export', async () => {
    const mod = await import('../vercel-entry.js');
    expect(mod.default).toBeDefined();
  });

  it('default export is a function (handler)', async () => {
    const mod = await import('../vercel-entry.js');
    expect(typeof mod.default).toBe('function');
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.redis).toBe(true);
  });
});
