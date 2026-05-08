// @vitest-environment node
import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { deriveStatus } from '../../lib/healthSources.js';

// ---- Hoisted mocks (must come before vi.mock calls) ----
const cacheGetSpy = vi.fn(async (_key: string, _maxAgeMs: number) => null);

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: cacheGetSpy,
  cacheSetSafe: vi.fn(),
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

vi.mock('../../config.js', () => ({
  env: { CRON_SECRET: '', DASHBOARD_PASSWORD: '' },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// ---- Helpers (copied from health.test.ts pattern) ----
function createReqRes(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const req = {
    headers: lower,
    header: (name: string) => lower[name.toLowerCase()],
    query,
  } as unknown as import('express').Request;
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
  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => body as Record<string, unknown> | undefined,
  };
}

interface RouteLayer {
  route?: { methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
}
function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.methods.get) return layer.route.stack[0]!.handle;
  }
  throw new Error('No GET handler found');
}

// ---- Tests ----
describe('probeProbeOnly — Phase 28.2.7 R3 honest-stub contract', () => {
  beforeEach(() => {
    cacheGetSpy.mockClear();
  });

  it('deriveStatus(0, 0, false) === "healthy" (pure-function invariant)', () => {
    // Direct import + call — no mocks, fastest assertion. SPEC R3 acceptance:
    // "Vitest unit test asserts probeProbeOnly() returns freshnessMs: 0 AND
    //  deriveStatus(probeProbeOnly().freshnessMs, 0, false) === 'healthy'".
    // This test asserts the right-hand side of the conjunction.
    expect(deriveStatus(0, 0, false)).toBe('healthy');
  });

  it('/api/health endpoints.authCheck has freshnessMs:0 AND status:"healthy"', async () => {
    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<string, { freshnessMs: number | null; status: string; tier: string }>;
    };
    expect(body.endpoints.authCheck!.freshnessMs).toBe(0);
    expect(body.endpoints.authCheck!.status).toBe('healthy');
    expect(body.endpoints.authCheck!.tier).toBe('probe-only');
  });

  it('/api/health endpoints.geocode has freshnessMs:0 AND status:"healthy"', async () => {
    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<string, { freshnessMs: number | null; status: string; tier: string }>;
    };
    expect(body.endpoints.geocode!.freshnessMs).toBe(0);
    expect(body.endpoints.geocode!.status).toBe('healthy');
    expect(body.endpoints.geocode!.tier).toBe('probe-only');
  });

  it('/api/health summary.probeOnly === { healthy: 2, unhealthy: 0, unknown: 0 }', async () => {
    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      summary: { probeOnly: { healthy: number; unhealthy: number; unknown: number } };
    };
    expect(body.summary.probeOnly).toEqual({ healthy: 2, unhealthy: 0, unknown: 0 });
  });

  it('regression guard — neither authCheck nor geocode has freshnessMs:null (R3 bug shape)', async () => {
    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<string, { freshnessMs: number | null }>;
    };
    // Pre-R3 fix, both of these were null. If a future regression re-introduces
    // the null shape, this test fails LOUDLY before it reaches prod.
    expect(body.endpoints.authCheck!.freshnessMs).not.toBeNull();
    expect(body.endpoints.geocode!.freshnessMs).not.toBeNull();
  });
});
