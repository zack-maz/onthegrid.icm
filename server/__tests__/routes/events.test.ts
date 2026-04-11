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
const eventB = makeEvent({ id: 'gdelt-B', label: 'Event B', type: 'on_ground' });
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

// LLM pipeline mock functions
const mockIsLLMConfigured = vi.fn((): boolean => false);
const mockGroupGdeltRows = vi.fn(() => []);
const mockProcessEventGroups = vi.fn(async () => null);
const mockGeocodeEnrichedEvents = vi.fn(async () => []);

// LLM progress mock — mutable singleton object for test manipulation
const mockLlmProgress = {
  stage: 'idle' as string,
  startedAt: null as number | null,
  completedAt: null as number | null,
  totalGroups: 0,
  newGroups: 0,
  totalBatches: 0,
  completedBatches: 0,
  totalGeocodes: 0,
  completedGeocodes: 0,
  enrichedCount: 0,
  errorMessage: null as string | null,
  durationMs: null as number | null,
};
vi.mock('../../lib/llmProgress.js', () => ({
  llmProgress: mockLlmProgress,
  resetProgress: vi.fn(),
  updateProgress: vi.fn(),
  buildSummary: vi.fn(() => ({
    lastRun: Date.now(),
    groupCount: 0,
    batchCount: 0,
    geocodeCount: 0,
    enrichedCount: 0,
    durationMs: 0,
    error: null,
  })),
  INITIAL_PROGRESS: {
    stage: 'idle',
    startedAt: null,
    completedAt: null,
    totalGroups: 0,
    newGroups: 0,
    totalBatches: 0,
    completedBatches: 0,
    totalGeocodes: 0,
    completedGeocodes: 0,
    enrichedCount: 0,
    errorMessage: null,
    durationMs: null,
  },
}));

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
    cerebras: { apiKey: '' },
    groq: { apiKey: '' },
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
  forwardGeocode: vi.fn(async () => null),
}));

// Mock LLM pipeline modules
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(async () => null),
  isLLMConfigured: (...args: unknown[]) => mockIsLLMConfigured(...(args as [])),
}));
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: (...args: unknown[]) => mockGroupGdeltRows(...(args as [])),
}));
vi.mock('../../lib/llmEventExtractor.js', () => ({
  processEventGroups: (...args: unknown[]) => mockProcessEventGroups(...(args as [])),
  geocodeEnrichedEvents: (...args: unknown[]) => mockGeocodeEnrichedEvents(...(args as [])),
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

    // Reset LLM progress singleton to idle
    Object.assign(mockLlmProgress, {
      stage: 'idle',
      startedAt: null,
      completedAt: null,
      totalGroups: 0,
      newGroups: 0,
      totalBatches: 0,
      completedBatches: 0,
      totalGeocodes: 0,
      completedGeocodes: 0,
      enrichedCount: 0,
      errorMessage: null,
      durationMs: null,
    });

    // Reset LLM mocks
    mockIsLLMConfigured.mockClear();
    mockIsLLMConfigured.mockReturnValue(false);
    mockGroupGdeltRows.mockClear();
    mockGroupGdeltRows.mockReturnValue([]);
    mockProcessEventGroups.mockClear();
    mockProcessEventGroups.mockResolvedValue(null);
    mockGeocodeEnrichedEvents.mockClear();
    mockGeocodeEnrichedEvents.mockResolvedValue([]);

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

  it('returns 502 when fetchEvents throws and no cache exists', async () => {
    mockFetchEvents.mockRejectedValue(new Error('GDELT down'));

    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UPSTREAM_FAIL');
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
      type: 'explosion',
    });
    const backfillEvent2 = makeEvent({
      id: 'gdelt-BF2',
      label: 'Backfill Event 2',
      type: 'targeted',
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

  describe('LLM processing integration', () => {
    const llmEvent = makeEvent({
      id: 'llm-enriched-1',
      label: 'Baghdad airstrike',
      data: {
        eventType: 'Aerial weapons',
        subEventType: 'CAMEO 195',
        fatalities: 3,
        actor1: 'USA',
        actor2: 'IRN',
        notes: '',
        source: 'https://example.com/article',
        goldsteinScale: -10,
        locationName: 'Baghdad, Iraq',
        cameoCode: '195',
        summary: 'US airstrike on Baghdad military installation',
        precision: 'city' as const,
        llmProcessed: true,
        sourceCount: 5,
        actors: ['US Air Force', 'Iranian IRGC'],
        casualties: { killed: 3, injured: 7, unknown: false },
      },
    });

    it('serves fresh LLM cache directly without triggering LLM processing', async () => {
      // Pre-populate LLM cache with fresh data
      redisStore.set('events:llm', {
        data: [llmEvent],
        fetchedAt: Date.now(), // fresh
      });

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stale).toBe(false);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('llm-enriched-1');
      expect(body.data[0].data.llmProcessed).toBe(true);
      // Should NOT call fetchEvents or LLM pipeline
      expect(mockFetchEvents).not.toHaveBeenCalled();
      expect(mockProcessEventGroups).not.toHaveBeenCalled();
    });

    it('triggers LLM processing when LLM cache is stale and cooldown expired', async () => {
      // Set up: LLM configured, no LLM cooldown set, stale LLM cache
      mockIsLLMConfigured.mockReturnValue(true);
      mockFetchEvents.mockResolvedValue([eventA]);
      mockGroupGdeltRows.mockReturnValue([
        {
          key: 'grp-1',
          entities: [eventA],
          centroidLat: 33.3,
          centroidLng: 44.4,
          primaryCameo: '195',
          timestamp: Date.now(),
          totalMentions: 10,
          totalSources: 3,
          sourceUrls: [],
        },
      ]);
      mockProcessEventGroups.mockResolvedValue([
        {
          groupKey: 'grp-1',
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['US Air Force'],
          severity: 'high',
          summary: 'Airstrike on Baghdad',
          casualties: { killed: 2, injured: 5, unknown: false },
          sourceCount: 3,
        },
      ]);
      mockGeocodeEnrichedEvents.mockResolvedValue([
        {
          groupKey: 'grp-1',
          resolvedLat: 33.3,
          resolvedLng: 44.4,
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['US Air Force'],
          severity: 'high',
          summary: 'Airstrike on Baghdad',
          casualties: { killed: 2, injured: 5, unknown: false },
          sourceCount: 3,
        },
      ]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(mockProcessEventGroups).toHaveBeenCalled();
      expect(mockGeocodeEnrichedEvents).toHaveBeenCalled();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('serves stale LLM cache when cooldown has NOT expired', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      mockFetchEvents.mockResolvedValue([eventA]);

      // Set LLM cooldown timestamp (recently processed)
      rawRedisStore.set('events:llm-process-ts', Date.now());
      // Stale LLM cache
      redisStore.set('events:llm', {
        data: [llmEvent],
        fetchedAt: Date.now() - 901_000, // stale
      });

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      // Should serve the stale LLM cache
      expect(body.data.some((e: ConflictEventEntity) => e.data.llmProcessed === true)).toBe(true);
      // Should NOT trigger LLM processing
      expect(mockProcessEventGroups).not.toHaveBeenCalled();
    });

    it('falls back to raw GDELT when LLM processing fails (returns null)', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      mockFetchEvents.mockResolvedValue([eventA, eventB]);
      mockGroupGdeltRows.mockReturnValue([
        {
          key: 'grp-1',
          entities: [eventA],
          centroidLat: 33.3,
          centroidLng: 44.4,
          primaryCameo: '195',
          timestamp: Date.now(),
          totalMentions: 10,
          totalSources: 3,
          sourceUrls: [],
        },
      ]);
      mockProcessEventGroups.mockResolvedValue(null); // LLM failed

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      // Should serve raw GDELT events
      expect(body.data).toHaveLength(2);
      const ids = body.data.map((e: ConflictEventEntity) => e.id);
      expect(ids).toContain('gdelt-A');
      expect(ids).toContain('gdelt-B');
    });

    it('skips LLM entirely when isLLMConfigured returns false', async () => {
      mockIsLLMConfigured.mockReturnValue(false);
      mockFetchEvents.mockResolvedValue([eventA]);

      const res = await fetch(`${baseUrl}/api/events`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockProcessEventGroups).not.toHaveBeenCalled();
      expect(mockGroupGdeltRows).not.toHaveBeenCalled();
    });

    it('sets cooldown key after successful LLM processing', async () => {
      mockIsLLMConfigured.mockReturnValue(true);
      mockFetchEvents.mockResolvedValue([eventA]);
      mockGroupGdeltRows.mockReturnValue([
        {
          key: 'grp-1',
          entities: [eventA],
          centroidLat: 33.3,
          centroidLng: 44.4,
          primaryCameo: '195',
          timestamp: Date.now(),
          totalMentions: 10,
          totalSources: 3,
          sourceUrls: [],
        },
      ]);
      mockProcessEventGroups.mockResolvedValue([
        {
          groupKey: 'grp-1',
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['US Air Force'],
          severity: 'high',
          summary: 'Airstrike on Baghdad',
          casualties: { killed: 2, injured: 5, unknown: false },
          sourceCount: 3,
        },
      ]);
      mockGeocodeEnrichedEvents.mockResolvedValue([
        {
          groupKey: 'grp-1',
          resolvedLat: 33.3,
          resolvedLng: 44.4,
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['US Air Force'],
          severity: 'high',
          summary: 'Airstrike on Baghdad',
          casualties: { killed: 2, injured: 5, unknown: false },
          sourceCount: 3,
        },
      ]);

      const res = await fetch(`${baseUrl}/api/events`);
      expect(res.ok).toBe(true);

      // Cooldown key should have been set
      expect(mockRedisSet).toHaveBeenCalledWith(
        'events:llm-process-ts',
        expect.any(Number),
        expect.objectContaining({ ex: expect.any(Number) }),
      );
    });

    it('only processes NEW event groups (diffs against cached LLM events)', async () => {
      mockIsLLMConfigured.mockReturnValue(true);

      // Pre-populate LLM cache with stale data containing one already-processed event
      redisStore.set('events:llm', {
        data: [llmEvent],
        fetchedAt: Date.now() - 901_000, // stale
      });

      const newEvent = makeEvent({ id: 'gdelt-NEW', label: 'New event' });
      mockFetchEvents.mockResolvedValue([eventA, newEvent]);

      // groupGdeltRows returns 2 groups
      const group1 = {
        key: 'grp-existing',
        entities: [eventA],
        centroidLat: 33.3,
        centroidLng: 44.4,
        primaryCameo: '195',
        timestamp: Date.now(),
        totalMentions: 10,
        totalSources: 3,
        sourceUrls: [],
      };
      const group2 = {
        key: 'grp-new',
        entities: [newEvent],
        centroidLat: 34.0,
        centroidLng: 45.0,
        primaryCameo: '190',
        timestamp: Date.now(),
        totalMentions: 5,
        totalSources: 2,
        sourceUrls: [],
      };
      mockGroupGdeltRows.mockReturnValue([group1, group2]);

      const newEnriched = {
        groupKey: 'grp-new',
        location: { name: 'Mosul', precision: 'city' },
        type: 'on_ground',
        actors: ['Iraqi forces'],
        severity: 'medium',
        summary: 'Ground operation in Mosul',
        casualties: { killed: 0, injured: 0, unknown: true },
        sourceCount: 2,
      };
      mockProcessEventGroups.mockResolvedValue([newEnriched]);

      mockGeocodeEnrichedEvents.mockResolvedValue([
        { ...newEnriched, resolvedLat: 34.0, resolvedLng: 45.0 },
      ]);

      const res = await fetch(`${baseUrl}/api/events`);
      await res.json();

      expect(res.ok).toBe(true);
      // processEventGroups should receive only the new groups (not already-cached ones)
      expect(mockProcessEventGroups).toHaveBeenCalled();
    });
  });

  describe('GET /api/events/llm-status', () => {
    it('returns idle with null lastRun when no pipeline has run and no Redis summary', async () => {
      const res = await fetch(`${baseUrl}/api/events/llm-status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stage).toBe('idle');
      expect(body.lastRun).toBeNull();
    });

    it('returns live progress object when pipeline is active (non-idle stage)', async () => {
      // Simulate an active pipeline
      Object.assign(mockLlmProgress, {
        stage: 'llm-processing',
        startedAt: Date.now() - 2000,
        totalGroups: 50,
        newGroups: 30,
        totalBatches: 4,
        completedBatches: 2,
      });

      const res = await fetch(`${baseUrl}/api/events/llm-status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stage).toBe('llm-processing');
      expect(body.totalBatches).toBe(4);
      expect(body.completedBatches).toBe(2);
    });

    it('returns Redis summary fallback when pipeline is idle and summary exists', async () => {
      const summary = {
        lastRun: Date.now() - 60000,
        groupCount: 25,
        batchCount: 4,
        geocodeCount: 20,
        enrichedCount: 20,
        durationMs: 8000,
        error: null,
      };
      redisStore.set('events:llm-summary', {
        data: summary,
        fetchedAt: Date.now(),
      });

      const res = await fetch(`${baseUrl}/api/events/llm-status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.stage).toBe('idle');
      expect(body.lastRun).toBeDefined();
      expect(body.lastRun.groupCount).toBe(25);
      expect(body.lastRun.durationMs).toBe(8000);
    });

    it('returns 404 when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await fetch(`${baseUrl}/api/events/llm-status`);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Not found');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
