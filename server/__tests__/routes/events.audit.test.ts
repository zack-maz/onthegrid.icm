// @vitest-environment node
/**
 * Phase 28.2 Plan 03 Task 4 — operator-action audit log completeness.
 *
 * 6-test matrix per PLAN.md:
 *   1. POST /llm-pipeline {version: 'v3'} → 200, audit SADD operation:'pipeline-swap'
 *   2. POST /llm-pipeline {version: 'v1'} (rollback) → 200, audit SADD with args.version:'v1'
 *   3. POST /llm-pipeline {version: null} (clear) → 200, audit SADD with args.version:null
 *   4. POST /llm-pipeline {version: 'v9'} → 400, audit SADD NOT called
 *   5. AI-SPEC §5 audit-trail completeness rubric — successful op produces SADD on operator:audit-log
 *   6. NO audit entry contains the raw DASHBOARD_PASSWORD
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { CacheResponse } from '../../types.js';
import type { Server } from 'http';

// ------------------------------------------------------------------------
// Hoisted mocks
// ------------------------------------------------------------------------

const {
  mockSadd,
  mockScard,
  mockSpop,
  mockSrem,
  mockExpire,
  mockIncr,
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
} = vi.hoisted(() => ({
  mockSadd: vi.fn(async () => 1),
  mockScard: vi.fn(async () => 1),
  mockSpop: vi.fn(async () => null),
  mockSrem: vi.fn(async () => 1),
  mockExpire: vi.fn(async () => 1),
  mockIncr: vi.fn(async () => 1),
  mockRedisGet: vi.fn(async (_key: string): Promise<unknown> => null),
  mockRedisSet: vi.fn(async (_key: string, _value: unknown, _opts?: unknown) => 'OK'),
  mockRedisDel: vi.fn(async (_key: string) => 1),
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
  isLLMConfigured: vi.fn(() => false),
}));
vi.mock('../../lib/eventGrouping.js', () => ({ groupGdeltRows: vi.fn(() => []) }));
vi.mock('../../lib/llmEventExtractor.js', () => ({
  processEventGroups: vi.fn(async () => null),
  geocodeEnrichedEvents: vi.fn(async () => []),
}));
vi.mock('../../lib/llmEventExtractor.v2.js', () => ({
  processEventGroupsV2: vi.fn(async () => ({
    events: [],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  })),
  BATCH_SIZE: 2,
}));
vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  processEventGroupsV3: vi.fn(async () => ({
    events: [],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  })),
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
  prioritizeBySeverity: vi.fn(async (g: unknown[]) => g),
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

const SECRET_TEST_PASSWORD = 'audit-test-password-32-chars-x';

describe('/llm-pipeline + /llm-replay — Phase 28.2 Plan 03 audit-trail completeness', () => {
  let server: Server;
  let baseUrl: string;
  const originalEnv = process.env.NODE_ENV;
  const originalPwd = process.env.DASHBOARD_PASSWORD;
  const originalPipelineV3 = process.env.LLM_PIPELINE_V3;

  beforeEach(async () => {
    cacheStore.clear();
    mockSadd.mockReset().mockResolvedValue(1);
    mockScard.mockReset().mockResolvedValue(1);
    mockSpop.mockReset().mockResolvedValue(null);
    mockSrem.mockReset().mockResolvedValue(1);
    mockExpire.mockReset().mockResolvedValue(1);
    mockIncr.mockReset().mockResolvedValue(1);
    mockRedisGet.mockReset().mockImplementation(async () => null);
    mockRedisSet.mockReset().mockResolvedValue('OK');
    mockRedisDel.mockReset().mockResolvedValue(1);

    // Run in dev so dashboardAuth bypasses on the unit-test fast path. The
    // /llm-pipeline + /llm-replay endpoints register unconditionally per
    // Phase 27.4.4 Plan 02, but the prod-Bearer code path is exercised
    // separately in events.test.ts.
    process.env.NODE_ENV = 'test';
    process.env.DASHBOARD_PASSWORD = SECRET_TEST_PASSWORD;
    process.env.LLM_PIPELINE_V3 = 'true';

    // Reset any in-memory pipeline override left over from a previous suite.
    const { setPipelineOverride } = await import('../../config.js');
    setPipelineOverride(null);

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
    process.env.NODE_ENV = originalEnv;
    if (originalPwd === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = originalPwd;
    if (originalPipelineV3 === undefined) delete process.env.LLM_PIPELINE_V3;
    else process.env.LLM_PIPELINE_V3 = originalPipelineV3;
  });

  // Test 1 — pipeline-swap audit on success
  it('POST /llm-pipeline {version: v3} appends audit-log SADD with operation:pipeline-swap', async () => {
    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v3' }),
    });
    expect(res.status).toBe(200);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(1);
    const payload = JSON.parse(auditCalls[0][1] as string);
    expect(payload.operation).toBe('pipeline-swap');
    expect(payload.args.version).toBe('v3');
    expect(payload.result).toBe('ok');
    expect(typeof payload.bearerFingerprint).toBe('string');
    expect(payload.bearerFingerprint.length).toBe(8);
  });

  // Test 2 — rollback path
  it('POST /llm-pipeline {version: v1} (rollback) audits with args.version=v1', async () => {
    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v1' }),
    });
    expect(res.status).toBe(200);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(1);
    const payload = JSON.parse(auditCalls[0][1] as string);
    expect(payload.args.version).toBe('v1');
  });

  // Test 3 — clear path (version: null)
  it('POST /llm-pipeline {version: null} (clear) audits with args.version=null', async () => {
    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: null }),
    });
    expect(res.status).toBe(200);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(1);
    const payload = JSON.parse(auditCalls[0][1] as string);
    expect(payload.args.version).toBe(null);
  });

  // Test 4 — invalid version → 400, NO audit entry
  it('POST /llm-pipeline {version: v9} → 400, audit SADD NOT called', async () => {
    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v9' }),
    });
    expect(res.status).toBe(400);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(0);
  });

  // Test 5 — AI-SPEC §5 audit-trail completeness rubric
  it('AI-SPEC §5 — successful pipeline-swap appends a parseable Redis SADD entry on operator:audit-log', async () => {
    const t0 = Date.now();

    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v2' }),
    });
    expect(res.status).toBe(200);

    const t1 = Date.now();
    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(1);

    const payload = JSON.parse(auditCalls[0][1] as string);
    expect(typeof payload.timestamp).toBe('number');
    expect(payload.timestamp).toBeGreaterThanOrEqual(t0);
    expect(payload.timestamp).toBeLessThanOrEqual(t1);
    // EXPIRE call is part of the same audit-log write — operator:audit-log
    // gets a 30d TTL refresh on every append.
    const expireCalls = mockExpire.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(expireCalls.length).toBe(1);
    expect(expireCalls[0][1]).toBe(30 * 86400);
  });

  // Test 6 — secret hygiene: NO audit entry contains the raw DASHBOARD_PASSWORD
  it('audit entry never contains the raw DASHBOARD_PASSWORD — only the SHA-256 fingerprint', async () => {
    const res = await fetch(`${baseUrl}/api/events/llm-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'v3' }),
    });
    expect(res.status).toBe(200);

    const auditCalls = mockSadd.mock.calls.filter((c) => c[0] === 'operator:audit-log');
    expect(auditCalls.length).toBe(1);

    const rawString = auditCalls[0][1] as string;
    // T-28.2-03-01 hard assertion: the raw password MUST NOT appear anywhere
    // in the JSON-encoded payload.
    expect(rawString).not.toContain(SECRET_TEST_PASSWORD);

    // The fingerprint must be deterministic SHA-256(password).slice(0, 8).
    const { bearerFingerprint } = await import('../../lib/operatorAudit.js');
    const expected = bearerFingerprint(SECRET_TEST_PASSWORD);
    const payload = JSON.parse(rawString);
    expect(payload.bearerFingerprint).toBe(expected);
  });
});
