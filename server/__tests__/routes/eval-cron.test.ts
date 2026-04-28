// @vitest-environment node
/**
 * Phase 27.4.4 Plan 01 Task 9 (D-14) — /api/cron/eval auth + happy path
 * unit tests.
 *
 * Four cases:
 *   1. CRON_SECRET set + Authorization missing → 401, runEval NOT called.
 *   2. CRON_SECRET set + Authorization wrong → 401, runEval NOT called.
 *   3. CRON_SECRET set + Authorization "Bearer <secret>" → 200 with score +
 *      durationMs + ratioWithin20km, runEval called once.
 *   4. CRON_SECRET unset/empty → request allowed (preserves un-authed
 *      cron-warm/cron-health behavior), runEval called.
 *
 * Mock pattern mirrors server/__tests__/routes/health.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';

// Hoisted mutable env mock so per-test CRON_SECRET overrides drive the
// auth gate path. The real config.ts reads CRON_SECRET via Zod at module-init;
// we mock the export here so the route picks up our value.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CRON_SECRET: '' },
}));

vi.mock('../../config.js', () => ({
  env: mockEnv,
  isPipelineV3: vi.fn().mockReturnValue(true),
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
  setPipelineOverride: vi.fn(),
}));

// Mock the eval harness so the route can be imported without spinning up
// a real LLM run. Default returns a healthy 50-event score.
const mockRunEval = vi.fn().mockResolvedValue({
  within5km: 5,
  within20km: 47,
  within100km: 50,
  total: 50,
});
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: (...args: unknown[]) => mockRunEval(...args),
}));

// Silent logger.
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Helper: minimal request/response pair for Express handler testing with
// optional headers support so auth tests can populate Authorization without
// instantiating real Express.
function createReqRes(headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const req = {
    headers: lower,
    header: (name: string) => lower[name.toLowerCase()],
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
  return { req, res, getStatus: () => statusCode, getBody: () => body as Record<string, unknown> };
}

interface RouteLayer {
  route?: {
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
}

function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.methods.get || layer.route?.methods.post) {
      return layer.route.stack[0].handle as (
        req: import('express').Request,
        res: import('express').Response,
      ) => Promise<void>;
    }
  }
  throw new Error('No GET/POST handler found on router');
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

describe('/api/cron/eval auth gate (D-14)', () => {
  it('CRON_SECRET set + Authorization missing → 401 {error: "unauthorized"}; runEval NOT called', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { evalCronRouter } = await import('../../routes/eval-cron.js');
    const handler = extractHandler(evalCronRouter);
    const { req, res, getStatus, getBody } = createReqRes();

    await handler(req, res);

    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: 'unauthorized' });
    expect(mockRunEval).not.toHaveBeenCalled();
  });

  it('CRON_SECRET set + Authorization wrong → 401 {error: "unauthorized"}; runEval NOT called', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { evalCronRouter } = await import('../../routes/eval-cron.js');
    const handler = extractHandler(evalCronRouter);
    const { req, res, getStatus, getBody } = createReqRes({
      Authorization: 'Bearer wrongtoken',
    });

    await handler(req, res);

    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: 'unauthorized' });
    expect(mockRunEval).not.toHaveBeenCalled();
  });

  it('CRON_SECRET set + Authorization "Bearer <secret>" → 200 {status: "ok", score, durationMs, ratioWithin20km: 0.94}; runEval called exactly once', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { evalCronRouter } = await import('../../routes/eval-cron.js');
    const handler = extractHandler(evalCronRouter);
    const { req, res, getStatus, getBody } = createReqRes({
      Authorization: 'Bearer s3cret',
    });

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const body = getBody();
    expect(body.status).toBe('ok');
    expect(body.score).toEqual({ within5km: 5, within20km: 47, within100km: 50, total: 50 });
    expect(typeof body.durationMs).toBe('number');
    expect(body.ratioWithin20km).toBeCloseTo(0.94, 5);
    expect(mockRunEval).toHaveBeenCalledTimes(1);
  });

  it('CRON_SECRET unset/empty → request allowed through (preserves existing un-authed cron-warm/cron-health behavior); runEval called', async () => {
    mockEnv.CRON_SECRET = '';
    const { evalCronRouter } = await import('../../routes/eval-cron.js');
    const handler = extractHandler(evalCronRouter);
    const { req, res, getStatus, getBody } = createReqRes();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const body = getBody();
    expect(body.status).toBe('ok');
    expect(body.score).toEqual({ within5km: 5, within20km: 47, within100km: 50, total: 50 });
    expect(body.ratioWithin20km).toBeCloseTo(0.94, 5);
    expect(mockRunEval).toHaveBeenCalledTimes(1);
  });
});
