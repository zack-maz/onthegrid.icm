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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';
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

  it('Test 4: summary.critical sums to exactly 3 (flights/ships/events)', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGetSafe.mockResolvedValue({
      data: [],
      stale: false,
      lastFresh: Date.now() - 1_000,
    });

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = healthResponseSchema.parse(getBody());
    const c = body.summary.critical;
    expect(c.healthy + c.degraded + c.unhealthy + c.unknown).toBe(3);
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
});
