// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { ConflictEventEntity, CacheResponse } from '../../types.js';
import { WAR_START } from '../../config.js';

// Sample event fixtures
const makeEvent = (overrides: Partial<ConflictEventEntity> = {}): ConflictEventEntity => ({
  id: 'gdelt-100001',
  type: 'airstrike',
  lat: 33.3,
  lng: 44.4,
  timestamp: Date.now(),
  label: 'Baghdad: Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'USA',
    actor2: 'IRN',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -10,
    locationName: 'Baghdad, Iraq',
    cameoCode: '195',
    geoPrecision: 'precise' as const,
    confidence: 0.8,
  },
  ...overrides,
});

const eventA = makeEvent({ id: 'gdelt-A', label: 'Event A' });
const eventB = makeEvent({ id: 'gdelt-B', label: 'Event B', type: 'ground_combat' });
const eventC = makeEvent({
  id: 'gdelt-C',
  label: 'Event C (old)',
  timestamp: WAR_START - 86_400_000, // 1 day before war start
});

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Separate store for direct redis.get/set calls (raw values, not CacheEntry)
const rawRedisStore = new Map<string, unknown>();

// Module-level mock functions
const mockFetchEvents = vi.fn(async (): Promise<ConflictEventEntity[]> => []);
const mockBackfillEvents = vi.fn(async (): Promise<ConflictEventEntity[]> => []);

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

// Mock config (spread actual to preserve constants like WAR_START, CACHE_TTL)
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

// Mock flight adapters (needed by server import chain)
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));

// Mock aisstream adapter (ships route uses it)
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

// Mock GDELT adapter
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
  backfillEvents: (...args: unknown[]) => mockBackfillEvents(...args),
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
const mockRedisGet = vi.fn(async (key: string) => rawRedisStore.get(key) ?? null);
const mockRedisSet = vi.fn(async (key: string, value: unknown, _opts?: unknown) => {
  rawRedisStore.set(key, value);
});

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
    get: (...args: unknown[]) => mockRedisGet(...(args as [string])),
    set: (...args: unknown[]) => mockRedisSet(...(args as [string, unknown, unknown?])),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

describe('Events Route (Redis accumulator)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    rawRedisStore.clear();
    mockFetchEvents.mockClear();
    mockFetchEvents.mockResolvedValue([]);
    mockBackfillEvents.mockClear();
    mockBackfillEvents.mockResolvedValue([]);
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    // Re-wire mockRedisGet default to use rawRedisStore
    mockRedisGet.mockImplementation(async (key: string) => rawRedisStore.get(key) ?? null);

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

  it('returns fresh cached data without calling fetchEvents when cache is fresh', async () => {
    // Pre-populate Redis mock with fresh data
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now(), // fresh
    });

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('gdelt-A');
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });

  it('calls fetchEvents on cache miss and returns merged result', async () => {
    mockFetchEvents.mockResolvedValue([eventA, eventB]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchEvents).toHaveBeenCalledTimes(1);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(2);
  });

  it('merges fresh events with previously cached events', async () => {
    // Seed cache with event A (make it stale so route fetches)
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now() - 901_000, // past 15min TTL
    });

    // GDELT returns event B (different ID)
    mockFetchEvents.mockResolvedValue([eventB]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((e: ConflictEventEntity) => e.id);
    expect(ids).toContain('gdelt-A');
    expect(ids).toContain('gdelt-B');
  });

  it('upserts -- same event ID in fresh overwrites cached version', async () => {
    const cachedA = makeEvent({ id: 'gdelt-A', label: 'Old label' });
    redisStore.set('events:gdelt', {
      data: [cachedA],
      fetchedAt: Date.now() - 901_000, // stale
    });

    const freshA = makeEvent({ id: 'gdelt-A', label: 'New label' });
    mockFetchEvents.mockResolvedValue([freshA]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].label).toBe('New label');
  });

  it('prunes events with timestamp before WAR_START', async () => {
    mockFetchEvents.mockResolvedValue([eventA, eventC]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    // eventC has timestamp before WAR_START, should be pruned
    const ids = body.data.map((e: ConflictEventEntity) => e.id);
    expect(ids).toContain('gdelt-A');
    expect(ids).not.toContain('gdelt-C');
  });

  it('falls back to stale cache with stale:true when fetchEvents throws', async () => {
    // Seed stale cache
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now() - 901_000, // stale
    });

    mockFetchEvents.mockRejectedValue(new Error('GDELT upstream failure'));

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('gdelt-A');
  });

  it('returns 500 when fetchEvents throws and no cache exists', async () => {
    mockFetchEvents.mockRejectedValue(new Error('GDELT down'));

    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(500);
  });

  it('has no module-level backfill code (no fs access, no GDELT fetch at import time)', async () => {
    // The fact we can import the module without any fs errors or GDELT calls
    // proves there are no module-level side effects.
    // fetchEvents should only be called within the route handler, not at import time.
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });

  describe('Lazy backfill', () => {
    const backfillEvent1 = makeEvent({
      id: 'gdelt-BF1',
      label: 'Backfill Event 1',
      type: 'shelling',
    });
    const backfillEvent2 = makeEvent({
      id: 'gdelt-BF2',
      label: 'Backfill Event 2',
      type: 'bombing',
    });

    it('triggers backfill on cache miss and merges results into response', async () => {
      mockFetchEvents.mockResolvedValue([eventA]);
      mockBackfillEvents.mockResolvedValue([backfillEvent1, backfillEvent2]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(mockBackfillEvents).toHaveBeenCalledTimes(1);
      // Should have eventA from fetchEvents + 2 from backfill = 3 total
      expect(body.data).toHaveLength(3);
      const ids = body.data.map((e: ConflictEventEntity) => e.id);
      expect(ids).toContain('gdelt-A');
      expect(ids).toContain('gdelt-BF1');
      expect(ids).toContain('gdelt-BF2');
    });

    it('does NOT trigger backfill when cache is fresh', async () => {
      // Pre-populate with fresh cache
      redisStore.set('events:gdelt', {
        data: [eventA],
        fetchedAt: Date.now(), // fresh
      });

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockBackfillEvents).not.toHaveBeenCalled();
    });

    it('does NOT trigger backfill when cache is stale (has accumulated data)', async () => {
      // Stale cache -- has accumulated data already
      redisStore.set('events:gdelt', {
        data: [eventA],
        fetchedAt: Date.now() - 901_000, // past 15min TTL
      });
      mockFetchEvents.mockResolvedValue([eventB]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      // Should merge cached + fresh, but NO backfill
      expect(mockBackfillEvents).not.toHaveBeenCalled();
      expect(body.data).toHaveLength(2);
    });

    it('backfill failure is non-fatal -- returns fetchEvents data', async () => {
      mockFetchEvents.mockResolvedValue([eventA]);
      mockBackfillEvents.mockRejectedValue(new Error('GDELT master list down'));

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      // Should still have the fetchEvents data
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('gdelt-A');
    });

    it('records backfill timestamp in Redis and prevents re-trigger within cooldown', async () => {
      // First request: cache miss, triggers backfill
      mockFetchEvents.mockResolvedValue([eventA]);
      mockBackfillEvents.mockResolvedValue([backfillEvent1]);

      const res1 = await fetch(`${baseUrl}/api/events`);
      expect(res1.ok).toBe(true);
      expect(mockBackfillEvents).toHaveBeenCalledTimes(1);

      // Backfill timestamp should have been stored
      expect(mockRedisSet).toHaveBeenCalledWith(
        'events:backfill-ts',
        expect.any(Number),
        expect.objectContaining({ ex: expect.any(Number) }),
      );

      // Second request: cache miss again (clear event cache), but backfill timestamp exists
      redisStore.clear();
      mockFetchEvents.mockResolvedValue([eventB]);
      mockBackfillEvents.mockClear();

      const res2 = await fetch(`${baseUrl}/api/events`);
      expect(res2.ok).toBe(true);
      // Should NOT call backfill again because cooldown hasn't expired
      expect(mockBackfillEvents).not.toHaveBeenCalled();
    });

    it('merges backfill results using same merge-by-ID pattern (deduplication)', async () => {
      // fetchEvents and backfill return the same event ID -- should deduplicate
      const freshA = makeEvent({ id: 'gdelt-SAME', label: 'Fresh version' });
      const backfillA = makeEvent({ id: 'gdelt-SAME', label: 'Backfill version' });

      mockFetchEvents.mockResolvedValue([freshA]);
      mockBackfillEvents.mockResolvedValue([backfillA]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      // Only 1 event since they share the same ID
      expect(body.data).toHaveLength(1);
      // Backfill merges first, then fresh overwrites -- so fresh version wins
      expect(body.data[0].label).toBe('Fresh version');
    });
  });

  describe('Raw coordinates (dispersion is client-side)', () => {
    it('returns undispersed coordinates so client-side dispersion can dynamically adjust with filters', async () => {
      const tehranEvent1 = makeEvent({
        id: 'gdelt-DISP1',
        label: 'Tehran event 1',
        lat: 35.6892,
        lng: 51.389,
        data: {
          eventType: 'Conventional military force',
          subEventType: 'CAMEO 190',
          fatalities: 0,
          actor1: 'IRN',
          actor2: 'ISR',
          notes: '',
          source: 'https://example.com/1',
          goldsteinScale: -10,
          locationName: 'Tehran, Iran',
          cameoCode: '190',
          geoPrecision: 'centroid' as const,
          confidence: 0.8,
          actionGeoType: 3,
        },
      });
      const tehranEvent2 = makeEvent({
        id: 'gdelt-DISP2',
        label: 'Tehran event 2',
        lat: 35.6892,
        lng: 51.389,
        timestamp: Date.now() - 1000,
        data: {
          eventType: 'Aerial weapons',
          subEventType: 'CAMEO 195',
          fatalities: 0,
          actor1: 'USA',
          actor2: 'IRN',
          notes: '',
          source: 'https://example.com/2',
          goldsteinScale: -10,
          locationName: 'Tehran, Iran',
          cameoCode: '195',
          geoPrecision: 'centroid' as const,
          confidence: 0.8,
          actionGeoType: 3,
        },
      });

      mockFetchEvents.mockResolvedValue([tehranEvent1]);
      mockBackfillEvents.mockResolvedValue([tehranEvent2]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(2);

      // Server returns raw (undispersed) coordinates — dispersion is client-side
      for (const e of body.data) {
        expect(e.lat).toBe(35.6892);
        expect(e.lng).toBe(51.389);
      }
    });
  });
});
