// @vitest-environment node
/**
 * Phase 27.4.6 Task 5 — /api/cron/refresh-events route coverage.
 *
 * Six cases:
 *   1. CRON_SECRET set + Authorization missing → 401, runRefreshExtraction NOT called.
 *   2. CRON_SECRET set + wrong Bearer → 401, runRefreshExtraction NOT called.
 *   3. CRON_SECRET set + correct Bearer + cooldown elapsed → 200 dispatched=true,
 *      forceCooldown=false (D-04).
 *   4. correct Bearer + cooldown active → 200 dispatched=false reason=cooldown (D-02).
 *   5. ?force=true with correct Bearer → forceCooldown:true passed to helper (D-11).
 *   6. helper reports coldCacheBypass=true → response surfaces it (D-10).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CRON_SECRET: '' },
}));

vi.mock('../../config.js', () => ({
  env: mockEnv,
}));

const mockRunRefresh = vi.fn();
vi.mock('../../lib/llmExtractionPipeline.js', () => ({
  runRefreshExtraction: (...args: unknown[]) => mockRunRefresh(...args),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

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
    getBody: () => body as Record<string, unknown>,
  };
}

interface RouteLayer {
  route?: { methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
}
function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.methods.get) return layer.route.stack[0].handle;
  }
  throw new Error('No GET handler found');
}

beforeEach(() => {
  mockRunRefresh.mockReset();
  mockEnv.CRON_SECRET = '';
});

describe('/api/cron/refresh-events', () => {
  it('CRON_SECRET set + Authorization missing → 401, runRefreshExtraction NOT called', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res, getStatus, getBody } = createReqRes();
    await handler(req, res);
    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: 'unauthorized' });
    expect(mockRunRefresh).not.toHaveBeenCalled();
  });

  it('CRON_SECRET set + wrong Bearer → 401', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res, getStatus } = createReqRes({ Authorization: 'Bearer wrong' });
    await handler(req, res);
    expect(getStatus()).toBe(401);
    expect(mockRunRefresh).not.toHaveBeenCalled();
  });

  it('CRON_SECRET set + correct Bearer + cooldown elapsed → 200 dispatched=true; forceCooldown=false', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    mockRunRefresh.mockResolvedValue({
      dispatched: true,
      schemaVersion: 'v3',
      coldCacheBypass: false,
    });
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res, getStatus, getBody } = createReqRes({
      Authorization: 'Bearer s3cret',
    });
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getBody()).toMatchObject({ ok: true, dispatched: true, schemaVersion: 'v3' });
    expect(mockRunRefresh).toHaveBeenCalledTimes(1);
    expect(mockRunRefresh).toHaveBeenCalledWith({
      triggeredBy: 'cron',
      forceCooldown: false,
    });
  });

  it('correct Bearer + cooldown active → 200 dispatched=false reason=cooldown (D-02)', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    mockRunRefresh.mockResolvedValue({
      dispatched: false,
      reason: 'cooldown',
      schemaVersion: 'v3',
    });
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res, getBody } = createReqRes({ Authorization: 'Bearer s3cret' });
    await handler(req, res);
    expect(getBody()).toMatchObject({ ok: true, dispatched: false, reason: 'cooldown' });
  });

  it('?force=true with correct Bearer → forceCooldown: true passed to helper (D-11)', async () => {
    mockEnv.CRON_SECRET = 's3cret';
    mockRunRefresh.mockResolvedValue({ dispatched: true, schemaVersion: 'v3' });
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res } = createReqRes({ Authorization: 'Bearer s3cret' }, { force: 'true' });
    await handler(req, res);
    expect(mockRunRefresh).toHaveBeenCalledWith({
      triggeredBy: 'cron',
      forceCooldown: true,
    });
  });

  it('helper reports coldCacheBypass=true → response surfaces it (D-10)', async () => {
    mockEnv.CRON_SECRET = '';
    mockRunRefresh.mockResolvedValue({
      dispatched: true,
      coldCacheBypass: true,
      schemaVersion: 'v3',
    });
    const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
    const handler = extractHandler(refreshEventsCronRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);
    expect(getBody()).toMatchObject({
      ok: true,
      dispatched: true,
      coldCacheBypass: true,
    });
  });
});
