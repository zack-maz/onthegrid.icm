// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { WaterFacility, CacheResponse } from '../../types.js';
import type { Server } from 'http';

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

/**
 * Zod-valid empty WaterFilterStats stub. Phase 27.3 Plan 01 added
 * waterFilterStatsSchema to server/schemas/cacheResponse.ts requiring all 5
 * sub-fields; the Zod wrapper is `.optional()` but once present the inner
 * object must be well-formed. Serves both as a passing fixture and a
 * reference for what a fresh-fetch filterStats payload looks like.
 *
 * Phase 27.3.1 R-08 (Plan 03): extended with byCountry (D-28), overpass (D-29),
 * source + generatedAt (D-30), and byTypeRejections (D-31). Schema is `.strict()`
 * on these fields once filterStats is present, so fixtures MUST include them.
 */
const emptyStats = {
  rawCounts: {} as Record<string, number>,
  filteredCounts: {} as Record<string, number>,
  rejections: {
    excluded_location: 0,
    // Phase 27.3.1 Plan 10 (G2) — Turkey country-exclusion bucket.
    excluded_turkey: 0,
    not_notable: 0,
    no_name: 0,
    // Phase 27.3.2 D-04 — Latin-script admission bucket.
    no_resolved_name: 0,
    duplicate: 0,
    low_score: 0,
    no_city: 0,
  },
  byTypeRejections: {} as Record<
    string,
    {
      excluded_location: number;
      excluded_turkey: number; // Phase 27.3.1 Plan 10 (G2)
      not_notable: number;
      no_name: number;
      no_resolved_name: number; // Phase 27.3.2 D-04
      duplicate: number;
      low_score: number;
      no_city: number;
    }
  >, // Phase 27.3.1 R-08 D-31 (Plan 10 G2 added excluded_turkey, Plan 27.3.2 added no_resolved_name)
  byCountry: {} as Record<string, Record<string, number>>, // Phase 27.3.1 R-08 D-28
  overpass: [] as {
    facilityType: string;
    mirror: string;
    status: number;
    durationMs: number;
    attempts: number;
    ok: boolean;
  }[], // Phase 27.3.1 R-08 D-29
  source: 'overpass' as const, // Phase 27.3.1 R-08 D-30
  generatedAt: new Date(0).toISOString(),
  enrichment: { withCapacity: 0, withCity: 0, withRiver: 0 },
  scoreHistogram: [] as { bucket: string; count: number }[],
};

// Module-level mock functions
const mockFetchWaterFacilities = vi.fn(
  async (): Promise<{ facilities: WaterFacility[]; stats: typeof emptyStats }> => ({
    facilities: [],
    stats: emptyStats,
  }),
);
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
vi.mock('../../cache/devFileCache.js', () => ({
  saveDevWaterCache: vi.fn(),
  loadDevWaterCache: vi.fn(() => null),
  saveDevLLMCache: vi.fn(),
  loadDevLLMCache: vi.fn(() => null),
}));

// Mock water adapters
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: (...args: unknown[]) => mockFetchWaterFacilities(...args),
  FACILITY_TYPE_LABELS: {
    dam: 'Dam',
    reservoir: 'Reservoir',
    desalination: 'Desalination Plant',
  },
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: (...args: unknown[]) => mockFetchPrecipitation(...args),
}));

// Phase 27.3.1 R-04 — mock the snapshot loader so the route's tier 3 can be
// exercised without a real src/data/water-facilities.json on disk. Defaults
// to null (snapshot absent) so existing tests fall through to Overpass as
// before; tier-specific tests below override per-test.
const mockLoadWaterSnapshot = vi.fn<() => unknown>(() => null);
vi.mock('../../lib/waterSnapshot.js', () => ({
  loadWaterSnapshot: () => mockLoadWaterSnapshot(),
  __resetSnapshotCacheForTests: vi.fn(),
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
    mockFetchWaterFacilities.mockResolvedValue({ facilities: [], stats: emptyStats });
    mockFetchPrecipitation.mockResolvedValue([]);
    // Phase 27.3.1 R-04 — default snapshot-absent; per-test overrides below.
    mockLoadWaterSnapshot.mockReset();
    mockLoadWaterSnapshot.mockReturnValue(null);

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
      mockFetchWaterFacilities.mockResolvedValue({
        facilities: [sampleFacility],
        stats: emptyStats,
      });

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
      // Phase 27.3.1 Plan 11 G3 — Redis key bumped to water:facilities:v3 and
      // payload is now the envelope `{ facilities, filterStats }`, not a bare
      // array.
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: emptyStats },
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
      // Phase 27.3.1 Plan 11 G3 — envelope shape under the bumped key.
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: emptyStats },
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

  /**
   * Phase 27.3.1 R-04 — committed JSON snapshot tier.
   *
   * Verifies the new tier slots between dev file cache and Overpass:
   *   Redis → devFileCache (dev only) → snapshot → Overpass
   *
   * The R-07 invariant ("Overpass never on a user request path") is tested
   * by asserting `fetchWaterFacilities` is NOT called when the snapshot is
   * present and Redis + devFileCache miss.
   */
  describe('R-04 snapshot tier', () => {
    const snapshotFacility: WaterFacility = {
      id: 'water-99001',
      type: 'water',
      facilityType: 'dam',
      lat: 35.84,
      lng: 38.55,
      label: 'Tabqa Dam',
      osmId: 99001,
      stress: {
        bws_raw: 4.3,
        bws_score: 4.3,
        bws_label: 'Extremely High',
        drr_score: 3.8,
        gtd_score: 3.5,
        sev_score: 3.2,
        iav_score: 2.8,
        compositeHealth: 0.2,
      },
    };

    const snapshotStats = {
      ...emptyStats,
      filteredCounts: { dams: 515, reservoirs: 73, desalination: 15 },
      source: 'snapshot' as const,
      generatedAt: '2026-04-19T07:00:00.000Z',
    };

    it("serves snapshot with source='snapshot' when Redis is cold and dev cache is empty", async () => {
      mockLoadWaterSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T07:00:00.000Z',
        facilities: [snapshotFacility],
        stats: snapshotStats,
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ id: 'water-99001', label: 'Tabqa Dam' });
      expect(body.filterStats.source).toBe('snapshot');
      expect(body.filterStats.generatedAt).toBe('2026-04-19T07:00:00.000Z');
      // R-07: Overpass must NOT be called
      expect(mockFetchWaterFacilities).not.toHaveBeenCalled();
    });

    it('populates Redis from the snapshot so subsequent hits serve source=redis', async () => {
      mockLoadWaterSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T07:00:00.000Z',
        facilities: [snapshotFacility],
        stats: snapshotStats,
      });

      // First hit — should populate Redis from snapshot
      const res1 = await fetch(`${baseUrl}/api/water`);
      const body1 = await res1.json();
      expect(body1.filterStats.source).toBe('snapshot');

      // Second hit — Redis is now warm
      const res2 = await fetch(`${baseUrl}/api/water`);
      const body2 = await res2.json();
      expect(body2.filterStats.source).toBe('redis');
      expect(body2.data).toHaveLength(1);
      expect(mockFetchWaterFacilities).not.toHaveBeenCalled();
    });

    it('falls through to Overpass when snapshot is absent (existing behavior preserved)', async () => {
      mockLoadWaterSnapshot.mockReturnValue(null);
      mockFetchWaterFacilities.mockResolvedValue({
        facilities: [sampleFacility],
        stats: emptyStats,
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockFetchWaterFacilities).toHaveBeenCalledTimes(1);
    });

    it('refresh=true bypasses the snapshot tier and hits Overpass', async () => {
      mockLoadWaterSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T07:00:00.000Z',
        facilities: [snapshotFacility],
        stats: snapshotStats,
      });
      mockFetchWaterFacilities.mockResolvedValue({
        facilities: [sampleFacility],
        stats: { ...emptyStats, source: 'overpass' as const },
      });

      const res = await fetch(`${baseUrl}/api/water?refresh=true`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(mockFetchWaterFacilities).toHaveBeenCalledTimes(1);
      expect(body.filterStats.source).toBe('overpass');
      // Snapshot loader should NOT have been consulted on a forced refresh
      expect(mockLoadWaterSnapshot).not.toHaveBeenCalled();
    });
  });

  /**
   * Phase 27.3.1 Plan 11 G3 — Redis envelope round-trip for R-08 observability.
   *
   * Pre-Plan-11 the Redis write path stored a bare WaterFacility[] and the
   * cache-hit response synthesized zero-filterStats via buildEmptyFilterStats.
   * Post-Plan-11 both the facilities AND the filterStats travel together
   * inside a `{ facilities, filterStats }` envelope under the bumped key
   * `water:facilities:v3`. Cache-hit responses spread the cached filterStats
   * and overwrite `source: 'redis'` + `generatedAt: ISO(lastFresh)` so
   * DevApiStatus renders populated byCountry / byTypeRejections / overpass
   * tallies with accurate provenance.
   */
  describe('Phase 27.3.1 Plan 11 — Redis envelope for R-08 observability (G3)', () => {
    const populatedStats = {
      ...emptyStats,
      rawCounts: { dams: 8699, reservoirs: 15355, desalination: 63 },
      filteredCounts: { dams: 370, reservoirs: 52, desalination: 15 },
      rejections: {
        excluded_location: 42,
        excluded_turkey: 165,
        not_notable: 1100,
        no_name: 139,
        no_resolved_name: 0,
        duplicate: 87,
        low_score: 0,
        no_city: 12,
      },
      byTypeRejections: {
        dams: {
          excluded_location: 30,
          excluded_turkey: 100,
          not_notable: 700,
          no_name: 90,
          no_resolved_name: 0,
          duplicate: 50,
          low_score: 0,
          no_city: 6,
        },
        reservoirs: {
          excluded_location: 12,
          excluded_turkey: 65,
          not_notable: 400,
          no_name: 49,
          no_resolved_name: 0,
          duplicate: 37,
          low_score: 0,
          no_city: 6,
        },
      },
      byCountry: {
        Iran: { dam: 51, reservoir: 6 },
        Iraq: { dam: 46, reservoir: 11 },
        'Saudi Arabia': { dam: 67, desalination: 1 },
      },
      overpass: [
        {
          facilityType: 'dams',
          mirror: 'primary',
          status: 200,
          durationMs: 18000,
          attempts: 1,
          ok: true,
        },
      ],
      // Source='snapshot' on purpose — the cache-hit branch MUST overwrite it
      // to 'redis' so DevApiStatus reports the serve-tier accurately even
      // though the stats originally came from the snapshot that warmed Redis.
      source: 'snapshot' as const,
      generatedAt: '2026-04-19T07:47:27.465Z',
    };

    it('cache-hit response returns populated byCountry from cached payload', async () => {
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.filterStats.byCountry.Iran.dam).toBe(51);
      expect(body.filterStats.byCountry.Iraq.reservoir).toBe(11);
      expect(body.filterStats.byCountry['Saudi Arabia'].desalination).toBe(1);
    });

    it('cache-hit response overrides source to "redis" regardless of persisted value', async () => {
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(body.filterStats.source).toBe('redis');
    });

    it('cache-hit response overrides generatedAt to cache lastFresh ISO', async () => {
      // Use a fresh lastFresh so the cache entry is NOT stale; the route's
      // cache-hit branch is what we're testing.
      const lastFreshMs = Date.now() - 1000;
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: lastFreshMs,
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(body.filterStats.generatedAt).toBe(new Date(lastFreshMs).toISOString());
    });

    it('cache-hit preserves rejections counts from cached payload', async () => {
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(body.filterStats.rejections.no_name).toBe(139);
      expect(body.filterStats.rejections.excluded_turkey).toBe(165);
      expect(body.filterStats.rejections.not_notable).toBe(1100);
    });

    it('cache-hit preserves byTypeRejections + overpass[] from cached payload', async () => {
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(body.filterStats.byTypeRejections.dams.no_name).toBe(90);
      expect(body.filterStats.overpass).toHaveLength(1);
      expect(body.filterStats.overpass[0].facilityType).toBe('dams');
      expect(body.filterStats.overpass[0].ok).toBe(true);
    });

    it('fresh Overpass path stores the envelope to Redis', async () => {
      mockFetchWaterFacilities.mockResolvedValue({
        facilities: [sampleFacility],
        stats: { ...emptyStats, source: 'overpass' as const },
      });

      // Force a refresh so we hit the Overpass branch unambiguously.
      const res = await fetch(`${baseUrl}/api/water?refresh=true`);
      expect(res.ok).toBe(true);

      // Inspect what the in-memory Redis mock received.
      const stored = redisStore.get('water:facilities:v3');
      expect(stored).toBeDefined();
      expect(stored!.data).toMatchObject({
        facilities: expect.any(Array),
        filterStats: expect.objectContaining({ source: 'overpass' }),
      });
      expect((stored!.data as { facilities: unknown[] }).facilities).toHaveLength(1);
    });

    it('snapshot tier path stores the envelope to Redis (snapshot warm path)', async () => {
      mockLoadWaterSnapshot.mockReturnValue({
        generatedAt: '2026-04-19T07:00:00.000Z',
        facilities: [sampleFacility],
        stats: { ...populatedStats, source: 'snapshot' as const },
      });

      await fetch(`${baseUrl}/api/water`);

      const stored = redisStore.get('water:facilities:v3');
      expect(stored).toBeDefined();
      expect(stored!.data).toMatchObject({
        facilities: expect.any(Array),
        filterStats: expect.objectContaining({
          // Snapshot warms Redis with the snapshot's own stats; the route's
          // cache-hit branch is responsible for overriding source to 'redis'
          // on subsequent reads (covered by the source-override test above).
          source: 'snapshot',
          byCountry: expect.any(Object),
        }),
      });
    });

    it('error path with stale cached payload returns stats from cache with source=redis', async () => {
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: populatedStats },
        fetchedAt: Date.now() - 90_000_000, // stale (>24h)
      });
      mockFetchWaterFacilities.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.filterStats.source).toBe('redis');
      expect(body.filterStats.byCountry.Iran).toBeDefined();
      expect(body.filterStats.rejections.no_name).toBe(139);
    });

    it('error path WITHOUT cache returns buildEmptyFilterStats with source=overpass', async () => {
      mockFetchWaterFacilities.mockRejectedValue(new Error('Overpass down'));

      const res = await fetch(`${baseUrl}/api/water`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(true);
      expect(body.filterStats.source).toBe('overpass');
      expect(body.filterStats.byCountry).toEqual({});
    });

    it('Redis key is water:facilities:v3 (regression guard for operator grep)', async () => {
      mockFetchWaterFacilities.mockResolvedValue({
        facilities: [sampleFacility],
        stats: { ...emptyStats, source: 'overpass' as const },
      });

      // Force refresh path so cacheSetSafe fires with a known payload.
      await fetch(`${baseUrl}/api/water?refresh=true`);

      // v2 key must exist; old key must not.
      expect(redisStore.has('water:facilities:v3')).toBe(true);
      expect(redisStore.has('water:facilities')).toBe(false);
    });

    it('/api/water/precip unwraps .facilities from cached envelope', async () => {
      const f2: WaterFacility = {
        ...sampleFacility,
        id: 'water-22222',
        osmId: 22222,
        lat: 32.1,
        lng: 45.6,
      };
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility, f2], filterStats: emptyStats },
        fetchedAt: Date.now(),
      });
      mockFetchPrecipitation.mockResolvedValue([
        { lat: 33.3, lng: 44.4, last30DaysMm: 15.2, anomalyRatio: 0.8, updatedAt: Date.now() },
        { lat: 32.1, lng: 45.6, last30DaysMm: 9.3, anomalyRatio: 0.5, updatedAt: Date.now() },
      ]);

      const res = await fetch(`${baseUrl}/api/water/precip`);
      expect(res.ok).toBe(true);

      // fetchPrecipitation should have received the two coordinate tuples
      // unwrapped from the envelope — NOT a bare object like `{facilities:...}`.
      expect(mockFetchPrecipitation).toHaveBeenCalledTimes(1);
      const locations = mockFetchPrecipitation.mock.calls[0]![0] as { lat: number; lng: number }[];
      expect(locations).toHaveLength(2);
      expect(locations[0]).toMatchObject({ lat: 33.3, lng: 44.4 });
      expect(locations[1]).toMatchObject({ lat: 32.1, lng: 45.6 });
    });
  });

  describe('GET /api/water/precip', () => {
    it('returns precipitation data for cached facilities', async () => {
      // Phase 27.3.1 Plan 11 G3 — envelope shape under the bumped key so the
      // precip handler's cached-facilities read unwraps .facilities correctly.
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: emptyStats },
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

    it('LLM-FIX-02 (D-05): writes a fresh failed sentinel on total Open-Meteo batch failure', async () => {
      // Cache the facilities so the precip handler reaches the fetch path,
      // then force fetchPrecipitation to return [] (all batches failed).
      // The route must write a distinguishable, FRESH sentinel envelope
      // `{ data: [], failed: true, fetchedAt }` to water:precip so the audit
      // tier reads degraded-not-unknown — not skip the write (which left the
      // key cold = unknown). The HTTP response still serves empty data.
      redisStore.set('water:facilities:v3', {
        data: { facilities: [sampleFacility], filterStats: emptyStats },
        fetchedAt: Date.now(),
      });
      mockFetchPrecipitation.mockResolvedValue([]);

      const before = Date.now();
      const res = await fetch(`${baseUrl}/api/water/precip`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toEqual([]);

      // Assert the sentinel was written to water:precip with a fresh
      // fetchedAt and the failed: true flag.
      const sentinelCall = _mockCacheSet.mock.calls.find(
        (call) => call[0] === 'water:precip' && (call[1] as { failed?: boolean })?.failed === true,
      );
      expect(sentinelCall).toBeDefined();
      const sentinelPayload = sentinelCall![1] as {
        data: unknown[];
        failed: boolean;
        fetchedAt: number;
      };
      expect(sentinelPayload.data).toEqual([]);
      expect(sentinelPayload.failed).toBe(true);
      expect(sentinelPayload.fetchedAt).toBeGreaterThanOrEqual(before);
    });

    it('LLM-FIX-02 (D-05): tolerates a cached failed sentinel without throwing', async () => {
      // A degraded sentinel sitting in cache must normalize to empty data,
      // NOT leak the { failed: true } envelope to the client and NOT 500.
      redisStore.set('water:precip', {
        data: { data: [], failed: true, fetchedAt: Date.now() },
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/water/precip`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.data.failed).toBeUndefined();
      expect(mockFetchPrecipitation).not.toHaveBeenCalled();
    });
  });
});
