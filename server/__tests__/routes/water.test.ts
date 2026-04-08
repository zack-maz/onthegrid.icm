// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { WaterFacility, CacheResponse } from '../../types.js';

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Module-level mock functions
const mockFetchWaterFacilities = vi.fn(async (): Promise<WaterFacility[]> => []);
const mockFetchPrecipitation = vi.fn(async () => []);

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

// Mock all existing adapters
vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
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
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
}));
vi.mock('../../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));

// Mock water adapters
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: (...args: unknown[]) => mockFetchWaterFacilities(...args),
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: (...args: unknown[]) => mockFetchPrecipitation(...args),
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

// Sample water facility fixture
const sampleFacility: WaterFacility = {
  id: 'water-12345',
  type: 'water',
  facilityType: 'dam',
  lat: 33.3,
  lng: 44.4,
  label: 'Mosul Dam',
  osmId: 12345,
  stress: {
    bws_raw: 3.5,
    bws_score: 3.5,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.3,
  },
};

describe('Water Routes (/api/water)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    mockFetchWaterFacilities.mockClear();
    mockFetchPrecipitation.mockClear();
    mockFetchWaterFacilities.mockResolvedValue([]);
    mockFetchPrecipitation.mockResolvedValue([]);

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

  describe('GET /api/water', () => {
    it('returns 200 with { data, stale: false, lastFresh } on cache miss + successful fetch', async () => {
      mockFetchWaterFacilities.mockResolvedValue([sampleFacility]);

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: 'water-12345',
        type: 'water',
        facilityType: 'dam',
        label: 'Mosul Dam',
      });
      expect(typeof body.lastFresh).toBe('number');
    });

    it('returns cached data when cache is fresh (does not call fetchWaterFacilities)', async () => {
      redisStore.set('water:facilities', {
        data: [sampleFacility],
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(mockFetchWaterFacilities).not.toHaveBeenCalled();
    });

    it('returns stale cache when upstream fails but cache exists', async () => {
      redisStore.set('water:facilities', {
        data: [sampleFacility],
        fetchedAt: Date.now() - 90_000_000, // stale (>24h)
      });

      mockFetchWaterFacilities.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('returns empty array with stale:true when upstream fails and no cache exists', async () => {
      mockFetchWaterFacilities.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.lastFresh).toBe(0);
    });
  });

  describe('GET /api/water/precip', () => {
    it('returns precipitation data for cached facilities', async () => {
      // Pre-populate facility cache
      redisStore.set('water:facilities', {
        data: [sampleFacility],
        fetchedAt: Date.now(),
      });

      const precipData = [
        { lat: 33.3, lng: 44.4, last30DaysMm: 15.2, anomalyRatio: 0.8, updatedAt: Date.now() },
      ];
      mockFetchPrecipitation.mockResolvedValue(precipData);

      const res = await fetch(`${baseUrl}/api/water/precip`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        lat: 33.3,
        lng: 44.4,
        last30DaysMm: 15.2,
      });
    });

    it('returns cached precip data when cache is fresh', async () => {
      const precipData = [
        { lat: 33.3, lng: 44.4, last30DaysMm: 15.2, anomalyRatio: 0.8, updatedAt: Date.now() },
      ];
      redisStore.set('water:precip', {
        data: precipData,
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water/precip`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockFetchPrecipitation).not.toHaveBeenCalled();
    });
  });
});
