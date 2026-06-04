// @vitest-environment node
/**
 * Phase 32 Plan 32-03 Task 2 — POST /api/events/prune-dead-urls route
 * integration coverage.
 *
 * 8-test matrix per PLAN.md <action>:
 *   1. 401 without Bearer in prod (dashboardAuth gate proven)
 *   2. 200 with valid Bearer + trigger:manual under quota
 *   3. 200 at 50th call (cap inclusive)
 *   4. 429 + Retry-After at 51st call
 *   5. trigger:cron BYPASSES quota (D-15 cron-bypass)
 *   6. successful prune delegates to pruneDeadUrlEvents helper
 *   7. 503 on helper throw (chaos-test contract — never 500)
 *   8. audit-log written by helper, NOT route (no duplicate writes)
 *
 * Mock boilerplate cloned from server/__tests__/routes/events.replayQuota.test.ts
 * with one addition: vi.mock('../../lib/urlLiveness.js') stubs the helper
 * so the route is tested in isolation from the splice logic (which Task 1
 * already covers exhaustively).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { CacheResponse } from '../../types.js';
import type { Server } from 'http';

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.hoisted ensures pre-import phase availability)
// ---------------------------------------------------------------------------

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
  mockPruneHelper,
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
  mockPruneHelper: vi.fn(async () => ({ prunedCount: 0, prunedIds: [] as string[] })),
}));

const cacheStore = new Map<string, { data: unknown; fetchedAt: number }>();

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
  groupGdeltRows: vi.fn(() => []),
}));
// Phase 38 LLM-PURGE-01 — the `llmEventExtractor.js` stub barrel was deleted;
// the extraction pipeline now calls the v3 extractor directly.
vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  processEventGroupsV3: vi.fn(async () => ({
    events: [],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  })),
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
vi.mock('../../lib/pipelineAudit.js', () => ({
  appendPipelineAudit: vi.fn(async () => {}),
  listPipelineAudit: vi.fn(async () => []),
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
    scan: vi.fn(async () => ['0', []]),
    decr: vi.fn(async () => 0),
    decrby: vi.fn(async () => 0),
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

// Stub the urlLiveness module — the route delegates to pruneDeadUrlEvents
// which has its own exhaustive test coverage in Task 1. Re-export everything
// real, but route pruneDeadUrlEvents through the spy.
vi.mock('../../lib/urlLiveness.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/urlLiveness.js')>();
  return {
    ...actual,
    pruneDeadUrlEvents: (...args: unknown[]) => mockPruneHelper(...(args as [])),
  };
});

describe('POST /api/events/prune-dead-urls — Plan 32-03 Task 2', () => {
  let server: Server;
  let baseUrl: string;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDashboardPw = process.env.DASHBOARD_PASSWORD;

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
    mockPruneHelper.mockReset().mockResolvedValue({ prunedCount: 0, prunedIds: [] });

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
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDashboardPw === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = originalDashboardPw;
  });

  // Test 1 — Bearer gate proven in prod
  it('401 without Bearer in prod (dashboardAuth gate)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-pw';

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    expect(res.status).toBe(401);
    expect(mockPruneHelper).not.toHaveBeenCalled();
  });

  // Test 2 — under-cap manual call returns 200 with helper's result
  it('200 with valid Bearer + trigger:manual under quota', async () => {
    mockIncr.mockResolvedValue(1);
    mockPruneHelper.mockResolvedValue({
      prunedCount: 3,
      prunedIds: ['A', 'B', 'C'],
    });

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prunedCount: number; prunedIds: string[] };
    expect(body.prunedCount).toBe(3);
    expect(body.prunedIds).toEqual(['A', 'B', 'C']);
    expect(mockPruneHelper).toHaveBeenCalledTimes(1);
  });

  // Test 3 — 50th call (cap inclusive)
  it('200 at 50th call (cap inclusive)', async () => {
    mockIncr.mockResolvedValue(50);
    mockPruneHelper.mockResolvedValue({ prunedCount: 0, prunedIds: [] });

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    expect(res.status).toBe(200);
  });

  // Test 4 — 51st call → 429 + Retry-After
  it('429 + Retry-After at 51st call', async () => {
    mockIncr.mockResolvedValue(51);

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body = (await res.json()) as { error: string; message: string; resetsAt: string };
    expect(body.error).toBe('prune_quota_exceeded');
    expect(body.message).toContain('50');
    expect(body.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Helper NOT called — quota short-circuits before invocation.
    expect(mockPruneHelper).not.toHaveBeenCalled();
  });

  // Test 5 — CR-01 regression: request body `trigger:'cron'` MUST NOT
  // bypass the operator quota and MUST NOT spoof the audit-log fingerprint.
  // The cron path uses direct helper invocation; HTTP route is always manual.
  it('CR-01 — request-body trigger:cron does NOT bypass quota or spoof fingerprint', async () => {
    mockIncr.mockResolvedValue(1);
    mockPruneHelper.mockResolvedValue({ prunedCount: 1, prunedIds: ['X'] });

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'cron' }),
    });
    expect(res.status).toBe(200);

    // Quota counter IS incremented — the body-provided 'cron' is ignored.
    expect(mockIncr).toHaveBeenCalledTimes(1);
    // Helper invoked with trigger='manual' (NOT 'cron') and the operator's
    // own fingerprint (NOT the literal 'cron:refresh-events' sentinel).
    expect(mockPruneHelper).toHaveBeenCalledTimes(1);
    const [opts] = mockPruneHelper.mock.calls[0]! as Array<{
      trigger: string;
      fingerprint: string;
    }>;
    expect(opts.trigger).toBe('manual');
    expect(opts.fingerprint).not.toBe('cron:refresh-events');
    expect(opts.fingerprint.length).toBeGreaterThan(0);
  });

  // Test 5b — CR-01 regression: 51st call still 429s even with body trigger
  // forging 'cron'. Confirms the quota is unconditional on the HTTP route.
  it('CR-01 — request-body trigger:cron still hits the 50/24h cap (429)', async () => {
    mockIncr.mockResolvedValue(51);
    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'cron' }),
    });
    expect(res.status).toBe(429);
    expect(mockPruneHelper).not.toHaveBeenCalled();
  });

  // Test 6 — helper receives the right args
  it('successful prune delegates to pruneDeadUrlEvents helper with {trigger, fingerprint}', async () => {
    mockIncr.mockResolvedValue(1);
    mockPruneHelper.mockResolvedValue({ prunedCount: 0, prunedIds: [] });

    await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });

    expect(mockPruneHelper).toHaveBeenCalledTimes(1);
    const [opts] = mockPruneHelper.mock.calls[0]! as Array<{
      trigger: string;
      fingerprint: string;
    }>;
    expect(opts.trigger).toBe('manual');
    expect(typeof opts.fingerprint).toBe('string');
    expect(opts.fingerprint.length).toBeGreaterThan(0);
  });

  // Test 7 — 503 on helper throw (NEVER 500)
  it('503 on helper throw — chaos-test contract (NEVER 500)', async () => {
    mockIncr.mockResolvedValue(1);
    mockPruneHelper.mockRejectedValue(new Error('redis_down'));

    const res = await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe('prune_failed');
    expect(body.detail).toContain('redis_down');
  });

  // Test 8 — route does NOT write audit-log; helper is responsible
  it('route does NOT write to operator:audit-log on success — helper handles it', async () => {
    mockIncr.mockResolvedValue(1);
    mockPruneHelper.mockResolvedValue({ prunedCount: 0, prunedIds: [] });

    await fetch(`${baseUrl}/api/events/prune-dead-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' }),
    });

    // The helper IS mocked (returns {0, []}) — the real
    // appendOperatorAuditEntry would have written via SADD inside the
    // real helper, but since the helper is a spy, mockSadd MUST NOT be
    // called from the route's own code path. (i.e. the route delegates
    // audit-log responsibility to the helper; no double-write.)
    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(0);
  });
});
