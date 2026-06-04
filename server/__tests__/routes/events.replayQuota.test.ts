// @vitest-environment node
/**
 * Phase 28.2 Plan 03 Task 3 — /llm-replay quota + audit + Pitfall-6 wiring.
 *
 * 7-test matrix per PLAN.md:
 *   1. (RED-now-GREEN) at-cap → 200, under-cap; 51st → 429+Retry-After
 *   2. Under-cap call returns 200 with {old, new}, quota counter incremented
 *   3. At-cap call (50th INCR) still allowed (cap inclusive)
 *   4. Over-cap call (51st INCR) → 429 + Retry-After + resetsAt body
 *   5. Pitfall 6 — /llm-replay does not write events:llm:v3
 *      (W-5 byte-identity Redis-snapshot test)
 *   6. Audit log SADD called once with operation:'replay' on success
 *   7. Audit log SADD NOT called on quota-exceeded 429
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ConflictEventEntity, CacheResponse } from '../../types.js';
import type { Server } from 'http';

// ------------------------------------------------------------------------
// Hoisted mocks — these spies are referenced from both module factories
// (vi.mock callbacks) and individual tests. vi.hoisted() ensures the
// declarations land in the test file's pre-import phase, matching the
// existing pattern in server/lib/__tests__/replayQuota.test.ts.
// ------------------------------------------------------------------------

const {
  mockIncr,
  mockExpire,
  mockSadd,
  mockScard,
  mockSpop,
  mockSrem,
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
  mockProcessV3,
  mockGroupGdeltRows,
} = vi.hoisted(() => ({
  mockIncr: vi.fn(async () => 1),
  mockExpire: vi.fn(async () => 1),
  mockSadd: vi.fn(async () => 1),
  mockScard: vi.fn(async () => 1),
  mockSpop: vi.fn(async () => null),
  mockSrem: vi.fn(async () => 1),
  mockRedisGet: vi.fn(async (_key: string): Promise<unknown> => null),
  mockRedisSet: vi.fn(async (_key: string, _value: unknown, _opts?: unknown) => 'OK'),
  mockRedisDel: vi.fn(async (_key: string) => 1),
  mockProcessV3: vi.fn(async () => ({
    events: [
      {
        id: 'gdelt-fresh',
        type: 'airstrike',
        lat: 33.3,
        lng: 44.4,
        timestamp: Date.now(),
        label: 'fresh extraction',
        data: {
          eventType: 'Aerial weapons',
          subEventType: 'CAMEO 195',
          fatalities: 1,
          actor1: 'USA',
          actor2: 'IRN',
          notes: '',
          source: 'https://example.com',
          goldsteinScale: -10,
          locationName: 'Baghdad',
          cameoCode: '195',
          geoPrecision: 'precise' as const,
          confidence: 0.9,
        },
      },
    ],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  })),
  mockGroupGdeltRows: vi.fn(() => [
    {
      key: 'grp-quota',
      entities: [],
      centroidLat: 33.3,
      centroidLng: 44.4,
      primaryCameo: '195',
      timestamp: Date.now(),
      totalMentions: 5,
      totalSources: 2,
      sourceUrls: [],
    },
  ]),
}));

// In-memory CacheResponse store backing cacheGetSafe.
const cacheStore = new Map<string, { data: unknown; fetchedAt: number }>();

// Pass-through middleware for rate limiter.
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
    acled: { email: 'x@y.com', password: 'p' },
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

vi.mock('../../adapters/opensky.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));
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
vi.mock('../../adapters/open-meteo.js', () => ({ fetchWeather: vi.fn(async () => []) }));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown' })),
  forwardGeocode: vi.fn(async () => null),
}));
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(async () => null),
  isLLMConfigured: vi.fn(() => true),
}));
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: (...args: unknown[]) => mockGroupGdeltRows(...(args as [])),
}));
// Phase 38 LLM-PURGE-01 — the `llmEventExtractor.js` stub barrel was deleted;
// the /llm-replay endpoint AND the extraction pipeline call the v3 extractor directly.
vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  processEventGroupsV3: (...args: unknown[]) => mockProcessV3(...(args as [])),
  geocodeEnrichedEventsV3: vi.fn(async () => []),
}));
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: vi.fn(async () => ({ within5km: 0, within20km: 0, within100km: 0, total: 0 })),
  runAdversarialEval: vi.fn(async () => ({
    total: 0,
    blocked: 0,
    leaked: 0,
    score: 0,
    byCategory: {},
    generatedAt: new Date().toISOString(),
  })),
}));
vi.mock('../../lib/llmDLQ.js', () => ({
  listDLQ: vi.fn(async () => []),
  enqueueDLQ: vi.fn(async () => {}),
  countDLQ: vi.fn(async () => 0),
  DLQ_KEY: 'events:llm-dlq',
}));
vi.mock('../../lib/llmTokenBudget.js', () => ({
  shouldPauseNewEvents: vi.fn(async () => false),
  prioritizeBySeverity: vi.fn(async (groups: unknown[]) => groups),
  getDailyTokens: vi.fn(async () => 0),
  incrDailyTokens: vi.fn(async () => 0),
  budgetState: vi.fn(() => 'ok' as const),
  computeSeverityScore: vi.fn(() => 0),
  DAILY_LIMITS: { cerebras: 1_000_000, groq: 200_000 } as const,
  todayKey: vi.fn((p: string) => `llm:tokens:${p}:d`),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
  FACILITY_TYPE_LABELS: { dam: 'Dam', reservoir: 'Reservoir' },
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));
vi.mock('../../cache/devFileCache.js', () => ({
  saveDevLLMCache: vi.fn(),
  loadDevLLMCache: vi.fn(() => null),
  saveDevLLMCacheV2: vi.fn(),
  loadDevLLMCacheV2: vi.fn(() => null),
  saveDevWaterCache: vi.fn(),
  loadDevWaterCache: vi.fn(() => null),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...(args as [string])),
    set: (...args: unknown[]) => mockRedisSet(...(args as [string, unknown, unknown?])),
    del: (...args: unknown[]) => mockRedisDel(...(args as [string])),
    incr: (...args: unknown[]) => mockIncr(...(args as [string])),
    expire: (...args: unknown[]) => mockExpire(...(args as [string, number])),
    sadd: (...args: unknown[]) => mockSadd(...(args as [string, string])),
    scard: (...args: unknown[]) => mockScard(...(args as [string])),
    spop: (...args: unknown[]) => mockSpop(...(args as [string])),
    srem: (...args: unknown[]) => mockSrem(...(args as [string, string])),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: vi.fn(async <T>(key: string, _ttl: number): Promise<CacheResponse<T> | null> => {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    return { data: entry.data as T, stale: false, lastFresh: entry.fetchedAt };
  }),
  cacheSet: vi.fn(async <T>(key: string, data: T, _ttl: number): Promise<void> => {
    cacheStore.set(key, { data, fetchedAt: Date.now() });
  }),
  cacheGetSafe: vi.fn(async <T>(key: string, _ttl: number): Promise<CacheResponse<T> | null> => {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    return { data: entry.data as T, stale: false, lastFresh: entry.fetchedAt };
  }),
  cacheSetSafe: vi.fn(async <T>(key: string, data: T, _ttl: number): Promise<void> => {
    cacheStore.set(key, { data, fetchedAt: Date.now() });
  }),
}));

const seedReplayCaches = (groupKey: string) => {
  const enriched: ConflictEventEntity = {
    id: `llm-v3-${groupKey}`,
    type: 'airstrike',
    lat: 33.3,
    lng: 44.4,
    timestamp: Date.now(),
    label: 'cached old',
    data: {
      eventType: 'Aerial weapons',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'USA',
      actor2: 'IRN',
      notes: '',
      source: 'https://example.com',
      goldsteinScale: -10,
      locationName: 'Baghdad',
      cameoCode: '195',
      geoPrecision: 'precise' as const,
      confidence: 0.8,
    },
  };
  const raw: ConflictEventEntity = { ...enriched, id: 'gdelt-raw' };
  cacheStore.set('events:llm:v3', { data: [enriched], fetchedAt: Date.now() });
  cacheStore.set('events:gdelt', { data: [raw], fetchedAt: Date.now() });
};

describe('/llm-replay — Phase 28.2 Plan 03 quota + audit + Pitfall 6', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    cacheStore.clear();
    mockIncr.mockReset().mockResolvedValue(1);
    mockExpire.mockReset().mockResolvedValue(1);
    mockSadd.mockReset().mockResolvedValue(1);
    mockScard.mockReset().mockResolvedValue(1);
    mockSpop.mockReset().mockResolvedValue(null);
    mockSrem.mockReset().mockResolvedValue(1);
    mockRedisGet.mockReset().mockImplementation(async () => null);
    mockRedisSet.mockReset().mockResolvedValue('OK');
    mockRedisDel.mockReset().mockResolvedValue(1);
    mockProcessV3.mockClear();

    // Phase 29 D-02 part C — pipeline-version env flag setup deleted; the
    // active extractor is v3-only and no longer reads LLM_PIPELINE_V2/V3.

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

  // Test 1 — at-cap path returns 429 + Retry-After (header semantics)
  it('51st replay call → 429 with positive Retry-After header', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(51);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  // Test 2 — under-cap call returns 200 with {old, new}; quota counter incremented
  it('under-cap call returns 200 with diff payload, quota INCR called once', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(5);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { old?: { id?: string }; new?: { id?: string } };
    expect(body.old).toBeTruthy();
    expect(body.new).toBeTruthy();
    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockProcessV3).toHaveBeenCalledTimes(1);
  });

  // Test 3 — at-cap (50th INCR) is INCLUSIVE allowed
  it('50th call (INCR returns 50) still allowed', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(50);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  // Test 4 — over-cap response body shape
  it('over-cap 429 body contains error code, message, resetsAt', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(51);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    const body = (await res.json()) as { error?: string; message?: string; resetsAt?: string };
    expect(body.error).toBe('replay_quota_exceeded');
    expect(typeof body.message).toBe('string');
    expect(body.message).toContain('50');
    expect(typeof body.resetsAt).toBe('string');
    expect(body.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  // Test 5 — Pitfall 6 — /llm-replay does not write events:llm:v3
  // (W-5 byte-identity Redis-snapshot test, primary check)
  it('Pitfall 6 — /llm-replay does not write events:llm:v3', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(1);

    // Capture the byte-shape of the terminal cache BEFORE the request.
    const beforeEntry = cacheStore.get('events:llm:v3');
    const beforeJson = beforeEntry ? JSON.stringify(beforeEntry.data) : null;

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(200);

    // Capture the byte-shape AFTER. The handler MUST NOT have mutated it.
    const afterEntry = cacheStore.get('events:llm:v3');
    const afterJson = afterEntry ? JSON.stringify(afterEntry.data) : null;

    expect(afterJson).toBe(beforeJson);
  });

  // Test 6 — audit log SADD called once on success path
  it('successful replay appends audit-log SADD with operation:replay', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(1);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(200);

    expect(mockSadd).toHaveBeenCalled();
    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(auditCalls[0][1] as string);
    expect(payload.operation).toBe('replay');
    expect(payload.args.groupKey).toBe('grp-quota');
    expect(payload.result).toBe('ok');
    expect(typeof payload.bearerFingerprint).toBe('string');
    expect(payload.bearerFingerprint.length).toBe(8);
  });

  // Test 7 — audit log NOT called on quota-exceeded 429 path
  it('quota-exceeded 429 does NOT write to operator:audit-log', async () => {
    seedReplayCaches('grp-quota');
    mockIncr.mockResolvedValue(51);

    const res = await fetch(`${baseUrl}/api/events/llm-replay/grp-quota`, { method: 'POST' });
    expect(res.status).toBe(429);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(0);
  });
});
