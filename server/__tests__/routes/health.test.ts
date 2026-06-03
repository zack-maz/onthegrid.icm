// @vitest-environment node
/**
 * Phase 28.1 W2 Task 2 — Extended /api/health aggregate endpoint coverage.
 *
 * The health route now emits a HealthResponse per server/lib/healthSchema.ts:
 *   - per-endpoint freshness derivation against D-25 thresholds
 *   - per-endpoint D-26 tier classification
 *   - tier-grouped summary rollup
 *
 * Mounting: route handler is reused between `/health` (legacy) and
 * `/api/health` (new). Body is identical except for `generatedAt`.
 */

import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { healthResponseSchema } from '../../lib/healthSchema.js';

const mockPing = vi.fn<() => Promise<string>>();
const mockCacheGetSafe = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  redis: { ping: (...args: unknown[]) => mockPing(...(args as [])) },
  cacheGet: (...args: unknown[]) => mockCacheGetSafe(...args),
  cacheGetSafe: (...args: unknown[]) => mockCacheGetSafe(...args),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// Stub llmProgress to a deterministic shape so freshness derivation is testable.
const mockProgress = {
  stage: 'idle' as const,
  startedAt: null as number | null,
  completedAt: null as number | null,
};
vi.mock('../../lib/llmProgress.js', () => ({
  get llmProgress() {
    return mockProgress;
  },
}));

interface RouteLayer {
  route?: { methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
}

function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) if (layer.route?.methods.get) return layer.route.stack[0].handle;
  throw new Error('No GET handler found on router');
}

function createReqRes() {
  const req = {} as import('express').Request;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  } as unknown as import('express').Response;
  return { req, res, getStatus: () => statusCode, getBody: () => body as Record<string, unknown> };
}

beforeEach(() => {
  mockPing.mockReset();
  mockCacheGetSafe.mockReset();
  mockProgress.stage = 'idle';
  mockProgress.startedAt = null;
  mockProgress.completedAt = null;
});

describe('GET /api/health (W2 extended)', () => {
  it('Test 1: returns Zod-valid HealthResponse on the happy path', async () => {
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (_key: string) => ({
      data: [],
      stale: false,
      lastFresh: now - 5_000,
    }));

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody();
    // Should parse cleanly under .strict()
    const parsed = healthResponseSchema.parse(body);
    expect(typeof parsed.generatedAt).toBe('number');
    expect(parsed.endpoints.flights?.tier).toBe('critical');
    expect(parsed.endpoints.flights?.status).toBe('healthy');
  });

  it('Test 2: cold cache (Redis returns null) → endpoint status === unknown', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.flights?.status).toBe('unknown');
    expect(body.endpoints.flights?.freshnessMs).toBeNull();
    expect(body.endpoints.flights?.lastSuccessTs).toBeNull();
  });

  it('Test 3: cacheGetSafe throws → endpoint status === unhealthy', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockRejectedValue(new Error('redis exploded'));

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.flights?.status).toBe('unhealthy');
    expect(body.endpoints.flights?.lastErrorReason).toBeTruthy();
  });

  it('Test 4: summary.critical sums to the count of critical-tier endpoints', async () => {
    // Derives the expected count from TIER_BY_ENDPOINT to stay
    // regression-resilient as critical endpoints are added (e.g.,
    // 28.2.5 D-06 added llmEvents: 'critical' as the 4th critical entry).
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue({
      data: [],
      stale: false,
      lastFresh: Date.now() - 1_000,
    });

    const { healthRouter } = await import('../../routes/health.js');
    const { TIER_BY_ENDPOINT } = await import('../../lib/healthSources.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    const c = body.summary.critical;
    const expectedCriticalCount = Object.values(TIER_BY_ENDPOINT).filter(
      (t) => t === 'critical',
    ).length;
    expect(c.healthy + c.degraded + c.unhealthy + c.unknown).toBe(expectedCriticalCount);
  });

  it('Test 5a: response includes every endpoint declared in TIER_BY_ENDPOINT', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');
    const { TIER_BY_ENDPOINT } = await import('../../lib/healthSources.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    for (const name of Object.keys(TIER_BY_ENDPOINT)) {
      expect(body.endpoints[name], `endpoint ${name} missing from response`).toBeDefined();
      expect(body.endpoints[name]?.tier).toBe(TIER_BY_ENDPOINT[name]);
    }
  });

  it('Test 5b: probe-only endpoints (authCheck, geocode) carry threshold=0 + freshnessMs=null', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.authCheck?.freshnessThresholdMs).toBe(0);
    expect(body.endpoints.authCheck?.tier).toBe('probe-only');
    expect(body.endpoints.geocode?.freshnessThresholdMs).toBe(0);
    expect(body.endpoints.geocode?.tier).toBe('probe-only');
  });

  it('Test 6: degraded threshold (between 1x and 2x) → status === degraded', async () => {
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      // flights threshold = 2 min = 120_000ms; pick a freshness of 150_000 ms
      // (> threshold, < 2*threshold) so flights derives to 'degraded'.
      if (key === 'flights:adsblol') {
        return { data: [], stale: false, lastFresh: now - 150_000 };
      }
      return { data: [], stale: false, lastFresh: now - 1_000 };
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.flights?.status).toBe('degraded');
  });

  it('Test 5c (Phase 28.2.5 D-08): waterPrecip probes via SOURCE_KEYS indirection and reports healthy on fresh cache', async () => {
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'water:precip') {
        return {
          data: [{ lat: 32, lng: 51, last30DaysMm: 12, anomalyRatio: 0.8, updatedAt: now - 1000 }],
          stale: false,
          lastFresh: now - 1_000,
        };
      }
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.waterPrecip).toBeDefined();
    expect(body.endpoints.waterPrecip?.status).toBe('healthy');
    expect(body.endpoints.waterPrecip?.tier).toBe('non-critical');
  });

  it('Test 6 (Phase 37 — ADR-0010 LLM-optional): endpoint llmEvents exists with non-critical tier + 26h threshold', async () => {
    // Demoted from `critical` to `non-critical` in Phase 37 fix/prod-audit-tier-regression.
    // The 26h threshold survives unchanged (matches cron triad cadence).
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.llmEvents).toBeDefined();
    expect(body.endpoints.llmEvents?.tier).toBe('non-critical');
    expect(body.endpoints.llmEvents?.freshnessThresholdMs).toBe(26 * 60 * 60_000);
  });

  it('Test 7 (Phase 28.2.5 D-06): llmEvents reports healthy on fresh events:llm:v3 envelope', async () => {
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return { data: [], stale: false, lastFresh: now - 1_000 };
      }
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.llmEvents?.status).toBe('healthy');
  });

  it('Test 8 (Phase 37 — ADR-0010 LLM-optional): llmEvents is unknown when BOTH v3 AND raw GDELT are cold', async () => {
    // Operator signal — both the enriched cache AND the Pitfall 1 raw-GDELT
    // fallback are empty. The user-facing /api/events would return empty too,
    // so this is a genuine degradation needing operator attention.
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.llmEvents?.status).toBe('unknown');
  });

  it('Test 9 (Phase 37 — ADR-0010 LLM-optional): llmEvents is DEGRADED when v3 is cold but raw GDELT is fresh (Pitfall 1 bridge active)', async () => {
    // Phase 37 fix/prod-audit-tier-regression — the LLM-optional contract.
    // ADR-0010 documents "unset both LLM credentials" as a kill switch; the
    // route then serves raw GDELT via the Pitfall 1 bridge. The audit's D-03
    // rule (non-critical accepts healthy OR degraded but NOT unknown) needs
    // this degraded signal to pass when the kill switch is engaged on
    // purpose — otherwise an intentional, documented degradation would fail
    // the prod-connectivity-audit acceptance gate.
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') return null;
      if (key === 'events:gdelt') {
        return { data: [], stale: false, lastFresh: now - 60_000 };
      }
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.llmEvents?.status).toBe('degraded');
    expect(body.endpoints.llmEvents?.lastErrorReason ?? '').toMatch(/llm-optional/);
  });

  it('Test 10 (Phase 37 — ADR-0010 LLM-optional): llmStatus is DEGRADED when llm:lastProgress is empty but refresh-events cron is fresh', async () => {
    // Companion to Test 9 for the llmStatus probe — when both Redis and the
    // in-memory singleton report no completed extraction, the cron-tick
    // freshness disambiguates between "pipeline broken" (unknown) and
    // "kill switch engaged but cron is firing on schedule" (degraded).
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    // llm:lastProgress empty; cron:lastTick:refresh-events fresh.
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'llm:lastProgress') return null;
      if (key === 'cron:lastTick:refresh-events') {
        return { data: now - 60_000, stale: false, lastFresh: now - 60_000 };
      }
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.llmStatus?.status).toBe('degraded');
  });

  it('Test 11 (Phase 37 — fix/news-feed-rss-fallback): news is DEGRADED when news:feed is cold but news:feed:rss-only sidecar is fresh', async () => {
    // Phase 37 fix/news-feed-rss-fallback — the GDELT-DOC-optional contract
    // for the news subsystem. GDELT-DOC's IP-based 429 throttle is sticky
    // for hours across Vercel function-pool IPs; when GDELT fails but the
    // RSS-only fallback produces ≥1 article, server/routes/news.ts writes
    // the news:feed:rss-only sidecar timestamp. This probe must surface
    // `degraded` (graceful degradation engaged, audit D-03 non-critical
    // tier rule passes) instead of `unknown` (broken, audit D-03 fails) —
    // mirrors Test 9's llmEvents fallback wiring byte-for-byte.
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'news:feed') return null;
      if (key === 'news:feed:rss-only') {
        return { data: now - 60_000, stale: false, lastFresh: now - 60_000 };
      }
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.news?.status).toBe('degraded');
    expect(body.endpoints.news?.lastErrorReason ?? '').toMatch(/fallback-active/);
  });

  it('Test 12 (Phase 37 — fix/news-feed-rss-fallback): news is UNKNOWN when BOTH news:feed AND news:feed:rss-only are cold', async () => {
    // Phase 37 fix/news-feed-rss-fallback — total-outage honesty. When the
    // primary news:feed cache AND the RSS-only sidecar are BOTH cold, the
    // probe must report `unknown`, NOT `degraded` — this is the audit's
    // honest-failure signal for a true upstream blackout (both GDELT and
    // every RSS feed unreachable, or fresh-deploy cold cache).
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockImplementation(async (_key: string) => null);

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    expect(body.endpoints.news?.status).toBe('unknown');
  });
});
