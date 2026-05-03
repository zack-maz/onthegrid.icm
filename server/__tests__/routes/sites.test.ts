// @vitest-environment node
/**
 * Phase 27.3.1 R-05 — /api/sites route tier tests.
 *
 * Mirrors server/__tests__/routes/water.test.ts R-04 snapshot tier block.
 * Covers:
 *   - Redis cache hit (source='redis')
 *   - Redis cold + snapshot present (source='snapshot', fetchSites NOT called)
 *   - Redis cold + snapshot absent (source='overpass', fetchSites called)
 *   - refresh=true bypasses snapshot
 *   - Upstream error + stale cache → serves stale with source='redis'
 *   - Upstream error + no cache → 502
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { SiteEntity, CacheResponse } from '../../types.js';
import type { Server } from 'http';

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

/**
 * Zod-valid SiteFilterStats stub. sitesResponseSchema requires the full
 * R-05 shape once filterStats is present (strict validator).
 */
const emptyStats = {
  rawCount: 0,
  filteredCount: 0,
  rejections: {
    excluded_turkey: 0,
    no_coords: 0,
    no_type: 0,
    duplicate: 0,
  },
  byCountry: {} as Record<string, Record<string, number>>,
  byType: {} as Record<string, number>,
  overpass: [] as {
    facilityType: string;
    mirror: string;
    status: number;
    durationMs: number;
    attempts: number;
    ok: boolean;
  }[],
  source: 'overpass' as const,
  generatedAt: new Date(0).toISOString(),
};

// Module-level mock functions
const mockFetchSites = vi.fn(
  async (): Promise<{ sites: SiteEntity[]; stats: typeof emptyStats }> => ({
    sites: [],
    stats: emptyStats,
  }),
);

// Rate limiter pass-through
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

// Mock unrelated adapters to isolate /api/sites
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
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => ({ facilities: [], stats: {} })),
  FACILITY_TYPE_LABELS: { dam: 'Dam', reservoir: 'Reservoir', desalination: 'Desalination Plant' },
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));
vi.mock('../../cache/devFileCache.js', () => ({
  saveDevWaterCache: vi.fn(),
  loadDevWaterCache: vi.fn(() => null),
  saveDevLLMCache: vi.fn(),
  loadDevLLMCache: vi.fn(() => null),
}));
vi.mock('../../lib/waterSnapshot.js', () => ({
  loadWaterSnapshot: vi.fn(() => null),
  __resetSnapshotCacheForTests: vi.fn(),
}));

// Mock fetchSites (the SUT's upstream fetcher)
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: (...args: unknown[]) => mockFetchSites(...args),
  classifySiteType: vi.fn(),
  normalizeElement: vi.fn(),
}));

// Phase 27.3.1 R-05 — snapshot loader mock (mirrors water pattern)
const mockLoadSitesSnapshot = vi.fn<() => unknown>(() => null);
vi.mock('../../lib/sitesSnapshot.js', () => ({
  loadSitesSnapshot: () => mockLoadSitesSnapshot(),
  __resetSitesSnapshotCacheForTests: vi.fn(),
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

// Sample site fixture
const sampleSite: SiteEntity = {
  id: 'site-12345',
  type: 'site',
  siteType: 'nuclear',
  lat: 28.83,
  lng: 50.88,
  label: 'Bushehr Nuclear Power Plant',
  operator: 'AEOI',
  osmId: 12345,
};

const snapshotSite: SiteEntity = {
  id: 'site-99001',
  type: 'site',
  siteType: 'naval',
  lat: 30.5,
  lng: 47.8,
  label: 'Umm Qasr Naval Base',
  osmId: 99001,
};

describe('Sites Routes (/api/sites)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    mockFetchSites.mockClear();
    mockFetchSites.mockResolvedValue({ sites: [], stats: emptyStats });
    mockLoadSitesSnapshot.mockReset();
    mockLoadSitesSnapshot.mockReturnValue(null);

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

  describe('GET /api/sites — base behavior', () => {
    it('returns 200 with successful fetch when snapshot + Redis both miss', async () => {
      mockFetchSites.mockResolvedValue({ sites: [sampleSite], stats: emptyStats });
      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();
      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: 'site-12345',
        type: 'site',
        siteType: 'nuclear',
      });
    });

    it('returns cached data when Redis is warm (source=redis)', async () => {
      // Phase 27.3.1 Plan 11 G4 — envelope `{ sites, filterStats }` under the
      // bumped key sites:v3. Pre-Plan-11 the value was a bare SiteEntity[]
      // under sites:v2.
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: emptyStats },
        fetchedAt: Date.now(),
      });
      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();
      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.filterStats?.source).toBe('redis');
      expect(mockFetchSites).not.toHaveBeenCalled();
    });
  });

  describe('R-05 snapshot tier', () => {
    const snapshotStats = {
      ...emptyStats,
      filteredCount: 1,
      byType: { naval: 1 },
      byCountry: { Iraq: { naval: 1 } },
      source: 'snapshot' as const,
      generatedAt: '2026-04-19T08:00:00.000Z',
    };

    it("serves snapshot with source='snapshot' when Redis is cold", async () => {
      mockLoadSitesSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T08:00:00.000Z',
        sites: [snapshotSite],
        stats: snapshotStats,
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ id: 'site-99001', label: 'Umm Qasr Naval Base' });
      expect(body.filterStats.source).toBe('snapshot');
      expect(body.filterStats.generatedAt).toBe('2026-04-19T08:00:00.000Z');
      // R-07: fetchSites must NOT be called when snapshot serves cold start
      expect(mockFetchSites).not.toHaveBeenCalled();
    });

    it('populates Redis from snapshot so subsequent hits serve source=redis', async () => {
      mockLoadSitesSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T08:00:00.000Z',
        sites: [snapshotSite],
        stats: snapshotStats,
      });

      const res1 = await fetch(`${baseUrl}/api/sites`);
      const body1 = await res1.json();
      expect(body1.filterStats.source).toBe('snapshot');

      const res2 = await fetch(`${baseUrl}/api/sites`);
      const body2 = await res2.json();
      expect(body2.filterStats.source).toBe('redis');
      expect(body2.data).toHaveLength(1);
      expect(mockFetchSites).not.toHaveBeenCalled();
    });

    it('falls through to Overpass (fetchSites) when snapshot is absent', async () => {
      mockLoadSitesSnapshot.mockReturnValue(null);
      mockFetchSites.mockResolvedValue({
        sites: [sampleSite],
        stats: { ...emptyStats, source: 'overpass', filteredCount: 1 },
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.filterStats?.source).toBe('overpass');
      expect(mockFetchSites).toHaveBeenCalledTimes(1);
    });

    it('refresh=true bypasses the snapshot tier and hits fetchSites', async () => {
      mockLoadSitesSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T08:00:00.000Z',
        sites: [snapshotSite],
        stats: snapshotStats,
      });
      mockFetchSites.mockResolvedValue({
        sites: [sampleSite],
        stats: { ...emptyStats, source: 'overpass' as const, filteredCount: 1 },
      });

      const res = await fetch(`${baseUrl}/api/sites?refresh=true`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(mockFetchSites).toHaveBeenCalledTimes(1);
      expect(body.filterStats?.source).toBe('overpass');
      // Snapshot loader should NOT have been consulted on a forced refresh
      expect(mockLoadSitesSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('returns stale cache when upstream fetchSites fails but cache exists', async () => {
      // Phase 27.3.1 Plan 11 G4 — envelope shape under the bumped key.
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: emptyStats },
        fetchedAt: Date.now() - 90_000_000, // stale (>24h)
      });
      mockFetchSites.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  /**
   * Phase 27.3.1 Plan 11 G4 — Redis envelope round-trip for R-05 observability.
   *
   * Mirrors water.test.ts Plan 11 G3 block exactly, adapted for the sites
   * shape: `{ sites, filterStats }` under `sites:v3` (bumped from sites:v2).
   * Pre-Plan-11 the Redis write path stored a bare SiteEntity[]; the
   * cache-hit response then synthesized zero-tally filterStats via
   * buildEmptyFilterStats. Post-Plan-11 the envelope round-trips through
   * Redis so DevApiStatus renders populated byType / byCountry / overpass
   * tallies with accurate provenance.
   */
  describe('Phase 27.3.1 Plan 11 — Redis envelope for R-05 observability (G4)', () => {
    const populatedStats = {
      ...emptyStats,
      rawCount: 876,
      filteredCount: 720,
      rejections: {
        excluded_turkey: 156,
        no_coords: 0,
        no_type: 0,
        duplicate: 0,
      },
      byCountry: {
        Iran: { airbase: 30, port: 5 },
        'Saudi Arabia': { airbase: 25, oil: 40 },
      },
      byType: { airbase: 284, port: 232, oil: 99, naval: 60, nuclear: 45 },
      overpass: [
        {
          facilityType: 'all',
          mirror: 'primary',
          status: 200,
          durationMs: 12000,
          attempts: 1,
          ok: true,
        },
      ],
      // Source='snapshot' on purpose — the cache-hit branch MUST overwrite it
      // to 'redis' so DevApiStatus reports the serve-tier accurately even
      // though the stats originally came from the snapshot that warmed Redis.
      source: 'snapshot' as const,
      generatedAt: '2026-04-19T08:00:00.000Z',
    };

    it('cache-hit response returns populated byType from cached payload', async () => {
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.filterStats.byType.airbase).toBe(284);
      expect(body.filterStats.byType.port).toBe(232);
      expect(body.filterStats.byType.nuclear).toBe(45);
    });

    it('cache-hit response overrides source to "redis" regardless of persisted value', async () => {
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(body.filterStats.source).toBe('redis');
    });

    it('cache-hit response overrides generatedAt to cache lastFresh ISO', async () => {
      const lastFreshMs = Date.now() - 1000;
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: lastFreshMs,
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(body.filterStats.generatedAt).toBe(new Date(lastFreshMs).toISOString());
    });

    it('cache-hit preserves rejections.excluded_turkey + byCountry from cached payload', async () => {
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(body.filterStats.rejections.excluded_turkey).toBe(156);
      expect(body.filterStats.byCountry.Iran.airbase).toBe(30);
      expect(body.filterStats.byCountry['Saudi Arabia'].oil).toBe(40);
    });

    it('cache-hit preserves rawCount + filteredCount + overpass from cached payload', async () => {
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(body.filterStats.rawCount).toBe(876);
      expect(body.filterStats.filteredCount).toBe(720);
      expect(body.filterStats.overpass).toHaveLength(1);
      expect(body.filterStats.overpass[0].facilityType).toBe('all');
    });

    it('fresh Overpass path stores the envelope to Redis', async () => {
      mockFetchSites.mockResolvedValue({
        sites: [sampleSite],
        stats: { ...emptyStats, source: 'overpass' as const },
      });

      const res = await fetch(`${baseUrl}/api/sites?refresh=true`);
      expect(res.ok).toBe(true);

      const stored = redisStore.get('sites:v3');
      expect(stored).toBeDefined();
      expect(stored!.data).toMatchObject({
        sites: expect.any(Array),
        filterStats: expect.objectContaining({ source: 'overpass' }),
      });
      expect((stored!.data as { sites: unknown[] }).sites).toHaveLength(1);
    });

    it('snapshot tier path stores the envelope to Redis (snapshot warm path)', async () => {
      mockLoadSitesSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T08:00:00.000Z',
        sites: [snapshotSite],
        stats: { ...populatedStats, source: 'snapshot' as const },
      });

      await fetch(`${baseUrl}/api/sites`);

      const stored = redisStore.get('sites:v3');
      expect(stored).toBeDefined();
      expect(stored!.data).toMatchObject({
        sites: expect.any(Array),
        filterStats: expect.objectContaining({
          source: 'snapshot',
          byType: expect.any(Object),
        }),
      });
    });

    it('error path with stale cached payload returns stats from cache with source=redis', async () => {
      redisStore.set('sites:v3', {
        data: { sites: [sampleSite], filterStats: populatedStats },
        fetchedAt: Date.now() - 90_000_000, // stale (>24h)
      });
      mockFetchSites.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/sites`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.filterStats.source).toBe('redis');
      expect(body.filterStats.byType.airbase).toBe(284);
      expect(body.filterStats.rejections.excluded_turkey).toBe(156);
    });

    it('error path WITHOUT cache still throws AppError (502) — unchanged', async () => {
      mockFetchSites.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/sites`);
      expect(res.status).toBe(502);
    });

    it('Redis key is sites:v3 (regression guard for operator grep)', async () => {
      mockFetchSites.mockResolvedValue({
        sites: [sampleSite],
        stats: { ...emptyStats, source: 'overpass' as const },
      });

      await fetch(`${baseUrl}/api/sites?refresh=true`);

      // v3 key must exist; old v2 key must not.
      expect(redisStore.has('sites:v3')).toBe(true);
      expect(redisStore.has('sites:v2')).toBe(false);
    });
  });
});
