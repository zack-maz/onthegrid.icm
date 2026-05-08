// @vitest-environment node
/**
 * Phase 27.4.6 Task 5 — /api/cron/health D-09 eval-fold coverage.
 *
 * Three cases:
 *   1. CRON_SECRET empty → un-authed; runEval invoked + evalScore in response.
 *   2. CRON_SECRET set + wrong Bearer → 401, runEval NOT called.
 *   3. runEval throws → response still 200 with evalScore=null + evalError populated.
 */

import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({ mockEnv: { CRON_SECRET: '' } }));
vi.mock('../../config.js', () => ({ env: mockEnv }));

vi.mock('../../cache/redis.js', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG') },
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  // Phase 28.2.7 R1 — cron-health now writes cron:lastTick:health via
  // cacheSetSafe before res.json. Mock must export it or the route's
  // module-eval throws ESM resolution error in vitest.
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));

const mockRunEval = vi.fn().mockResolvedValue({
  within5km: 5,
  within20km: 47,
  within100km: 50,
  total: 50,
});
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: (...args: unknown[]) => mockRunEval(...args),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

function createReqRes(headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const req = {
    headers: lower,
    header: (n: string) => lower[n.toLowerCase()],
  } as unknown as import('express').Request;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(c: number) {
      statusCode = c;
      return res;
    },
    json(d: unknown) {
      body = d;
      return res;
    },
  } as unknown as import('express').Response;
  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => body as Record<string, unknown>,
  };
}

interface RouteLayer {
  route?: { methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
}
function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) if (layer.route?.methods.get) return layer.route.stack[0].handle;
  throw new Error('No GET handler');
}

beforeEach(() => {
  mockRunEval.mockClear();
  mockRunEval.mockResolvedValue({
    within5km: 5,
    within20km: 47,
    within100km: 50,
    total: 50,
  });
  mockEnv.CRON_SECRET = '';
});

describe('/api/cron/health (D-09 eval-drift fold)', () => {
  it('un-authed when CRON_SECRET empty; runEval called and evalScore in response', async () => {
    const { cronHealthRouter } = await import('../../routes/cron-health.js');
    const handler = extractHandler(cronHealthRouter);
    const { req, res, getStatus, getBody } = createReqRes();
    await handler(req, res);
    expect(getStatus()).toBe(200);
    const body = getBody();
    expect(body.evalScore).toEqual({
      within5km: 5,
      within20km: 47,
      within100km: 50,
      total: 50,
    });
    expect(body.redis).toBe(true);
    expect(mockRunEval).toHaveBeenCalledTimes(1);
  });

  it('CRON_SECRET set + wrong Bearer → 401; runEval NOT called', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { cronHealthRouter } = await import('../../routes/cron-health.js');
    const handler = extractHandler(cronHealthRouter);
    const { req, res, getStatus } = createReqRes({ Authorization: 'Bearer wrong' });
    await handler(req, res);
    expect(getStatus()).toBe(401);
    expect(mockRunEval).not.toHaveBeenCalled();
  });

  it('runEval throws → response still 200 with evalScore=null + evalError populated', async () => {
    mockRunEval.mockRejectedValueOnce(new Error('eval boom'));
    const { cronHealthRouter } = await import('../../routes/cron-health.js');
    const handler = extractHandler(cronHealthRouter);
    const { req, res, getStatus, getBody } = createReqRes();
    await handler(req, res);
    expect(getStatus()).toBe(200);
    const body = getBody();
    expect(body.evalScore).toBeNull();
    expect(body.evalError).toContain('eval boom');
  });
});
