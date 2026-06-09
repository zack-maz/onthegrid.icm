// @vitest-environment node
/**
 * Phase 29 Plan 09 — LLM-optional architecture integration test (LLM-RELI-05 / D-04).
 *
 * Asserts the "map never goes blank when both LLM keys are absent" contract:
 *
 *   1. With `isLLMConfigured()` returning false (both NIM + OpenRouter keys
 *      absent), `GET /api/events` returns 200 OK with a non-empty data array
 *      sourced from raw GDELT through the simplified Pitfall 1 cache bridge
 *      (post-Plan-07: v3 LLM cache → raw GDELT terminal fallback).
 *
 *   2. `freeClaudeRouter.callLLM` is NEVER invoked from the events-route hot
 *      path when keys are absent. The cron-only extraction (Phase 27.4.6)
 *      remains the sole writer of `events:llm:v3`; this test confirms a
 *      user-facing GET never triggers an upstream LLM call regardless of
 *      pipeline state.
 *
 * Runs on every PR — no `describe.skipIf` gate. This is the CI-enforced
 * regression guard for the LLM-optional architecture.
 *
 * Modeled on `server/__tests__/routes/events-fallback.test.ts` (the existing
 * graceful-degradation precedent). Mock surface mirrors that file so behavior
 * deltas are easy to attribute.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ConflictEventEntity, CacheResponse } from '../../types.js';
import type { Server } from 'http';

// ---------------------------------------------------------------------------
// Fixtures — raw GDELT shape (NOT enriched v3 shape).
// ConflictEventEntity.data matches the raw branch (cameoCode, actor1/2,
// goldsteinScale, locationName, etc.) — not the enriched branch (city,
// neighborhood, confidence as a v3 field, etc.).
// ---------------------------------------------------------------------------

const makeRawEvent = (overrides: Partial<ConflictEventEntity> = {}): ConflictEventEntity => ({
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

const rawEventA = makeRawEvent({ id: 'gdelt-RAW-A', label: 'Raw GDELT event A' });
const rawEventB = makeRawEvent({
  id: 'gdelt-RAW-B',
  label: 'Raw GDELT event B',
  type: 'on_ground',
});

// ---------------------------------------------------------------------------
// In-memory Redis stores
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();
const rawRedisStore = new Map<string, unknown>();

// ---------------------------------------------------------------------------
// Module-level mock functions
// ---------------------------------------------------------------------------

const mockFetchEvents = vi.fn(async (): Promise<ConflictEventEntity[]> => [rawEventA, rawEventB]);
const mockBackfillEvents = vi.fn(async (): Promise<ConflictEventEntity[]> => []);

// LLM gating — FORCE the LLM-optional code path. The whole point of this
// suite is to assert behavior when both NIM + OpenRouter keys are absent.
const mockIsLLMConfigured = vi.fn((): boolean => false);
const mockCallLLM = vi.fn(async (): Promise<string | null> => null);

// freeClaudeRouter — the actual upstream caller invoked by the v3 extractor +
// reranker. We assert this is NEVER called from the events route when keys
// are absent. (Cron-only `runRefreshExtraction` is the sole writer; this
// test confirms the user-facing GET never triggers an LLM call.)
const mockRouterCallLLM = vi.fn(
  async (): Promise<{ content: string | null; provider: string; latencyMs: number }> => ({
    content: null,
    provider: 'mock',
    latencyMs: 0,
  }),
);
const mockPrewarmIfCold = vi.fn(async (): Promise<void> => undefined);

const mockForwardGeocode = vi.fn(async () => null);

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

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

// Upstream adapters (other routes are inert)
vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));
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
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
  FACILITY_TYPE_LABELS: {
    dam: 'Dam',
    reservoir: 'Reservoir',
    desalination: 'Desalination Plant',
    treatment_plant: 'Treatment Plant',
  },
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));

// LLM provider — the surface gate. `isLLMConfigured` returns false; `callLLM`
// is the legacy shim and should not be invoked from the events GET path.
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...(args as [unknown, unknown])),
  isLLMConfigured: (...args: unknown[]) => mockIsLLMConfigured(...(args as [])),
}));

// freeClaudeRouter — the actual upstream caller. RESEARCH.md Code Examples
// names this mock explicitly because Phase 27.4.3 repointed v3 + reranker at
// the router directly (Pitfall 3 fix), bypassing the llm-provider shim. We
// assert .not.toHaveBeenCalled() on this in the second test case.
vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: (...args: unknown[]) => mockRouterCallLLM(...(args as [unknown, unknown, unknown?])),
  prewarmIfCold: (...args: unknown[]) => mockPrewarmIfCold(...(args as [])),
}));

// Nominatim — geocoding should not run when LLM is disabled, but mock for
// import-resolution safety.
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
  forwardGeocode: (...args: unknown[]) => mockForwardGeocode(...(args as [unknown])),
}));

// Dev file cache — must return null so the LLM-cache miss falls through to
// the raw GDELT path. Mirrors the events.test.ts mock shape.
vi.mock('../../cache/devFileCache.js', () => ({
  saveDevLLMCache: vi.fn(),
  loadDevLLMCache: vi.fn(() => null),
  saveDevLLMCacheV2: vi.fn(),
  loadDevLLMCacheV2: vi.fn(() => null),
  saveDevWaterCache: vi.fn(),
  loadDevWaterCache: vi.fn(() => null),
}));

// Redis cache mock — in-memory, no upstream.
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
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    sadd: vi.fn(async () => 1),
    scard: vi.fn(async () => 1),
    spop: vi.fn(async () => null),
    srem: vi.fn(async () => 1),
    del: vi.fn(async () => 1),
  },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('LLM-optional architecture (LLM-RELI-05 / D-04)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    rawRedisStore.clear();
    mockFetchEvents.mockClear();
    mockFetchEvents.mockResolvedValue([rawEventA, rawEventB]);
    mockBackfillEvents.mockClear();
    mockBackfillEvents.mockResolvedValue([]);
    mockRedisGet.mockClear();
    mockRedisGet.mockImplementation(async (key: string) => rawRedisStore.get(key) ?? null);
    mockRedisSet.mockClear();
    mockIsLLMConfigured.mockClear();
    mockIsLLMConfigured.mockReturnValue(false); // LLM-optional code path
    mockCallLLM.mockClear();
    mockCallLLM.mockResolvedValue(null);
    mockRouterCallLLM.mockClear();
    mockPrewarmIfCold.mockClear();
    mockForwardGeocode.mockClear();
    mockForwardGeocode.mockResolvedValue(null);

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

  it('serves raw GDELT through the cache bridge when both LLM keys are absent', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const body = (await res.json()) as { data: ConflictEventEntity[]; stale?: boolean };

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);

    const ids = body.data.map((e) => e.id);
    expect(ids).toContain('gdelt-RAW-A');
    expect(ids).toContain('gdelt-RAW-B');
  });

  it('does NOT call freeClaudeRouter.callLLM when isLLMConfigured returns false', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.ok).toBe(true);

    // The "map never goes blank" contract requires that a user-facing GET
    // /api/events NEVER triggers an upstream LLM call. The cron-only
    // `runRefreshExtraction` helper (Phase 27.4.6) is the sole writer of
    // events:llm:v3; this assertion confirms the route stays cache-read-only
    // when keys are absent.
    expect(mockRouterCallLLM).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
