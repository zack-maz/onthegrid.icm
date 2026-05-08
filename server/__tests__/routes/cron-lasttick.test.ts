// @vitest-environment node
/**
 * Phase 28.2.7 R1 — contract tests for `cron:lastTick:<name>` writers
 * across all three Vercel cron handlers (cron-health, cron-warm,
 * refresh-events-cron).
 *
 * Six cases:
 *   1. cron-health writes cron:lastTick:health after body succeeds (D-03).
 *   2. cron-warm writes cron:lastTick:warm when both fetches succeed.
 *   3. cron-warm writes cron:lastTick:warm when one fulfills + one rejects (D-04).
 *   4. cron-warm does NOT write cron:lastTick:warm when both reject (D-04).
 *   5. refresh-events-cron writes cron:lastTick:refresh-events when
 *      runRefreshExtraction resolves.
 *   6. refresh-events-cron does NOT write the tick when runRefreshExtraction
 *      throws (D-03 honest-failure).
 */

import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Hoisted mocks (must come before vi.mock calls) ----
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CRON_SECRET: '' as string },
}));

const cacheStore = new Map<string, unknown>();
const cacheSetSpy = vi.fn(async (key: string, data: unknown, _ttl: number) => {
  cacheStore.set(key, data);
});
const cacheGetSpy = vi.fn(async (_key: string, _maxAgeMs: number) => null);

// Mock the redis module — both routes import from it
vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: cacheGetSpy,
  cacheSetSafe: cacheSetSpy,
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

vi.mock('../../config.js', () => ({
  env: mockEnv,
  WATER_REDIS_TTL_SEC: 86_400,
}));

// Mock LLM eval harness so cron-health doesn't attempt real LLM calls
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: vi.fn().mockResolvedValue({
    within5km: 5,
    within20km: 10,
    within100km: 20,
    total: 50,
  }),
  runAdversarialEval: vi.fn().mockResolvedValue({
    total: 10,
    blocked: 10,
    leaked: 0,
    score: 1.0,
    byCategory: {},
    generatedAt: Date.now(),
  }),
}));

// Mock overpass adapters so cron-warm doesn't attempt real fetches
const mockFetchSites = vi.fn();
const mockFetchWater = vi.fn();
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: (...args: unknown[]) => mockFetchSites(...args),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: (...args: unknown[]) => mockFetchWater(...args),
}));

// Mock LLM extraction pipeline for refresh-events-cron
const mockRunRefresh = vi.fn();
vi.mock('../../lib/llmExtractionPipeline.js', () => ({
  runRefreshExtraction: (...args: unknown[]) => mockRunRefresh(...args),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// ---- Helpers (copied verbatim from refresh-events-cron.test.ts) ----
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
    if (layer.route?.methods.get) return layer.route.stack[0].handle;
  }
  throw new Error('No GET handler found');
}

// ---- Tests ----
describe('cron handlers — Phase 28.2.7 R1 lastTick writers', () => {
  beforeEach(() => {
    cacheStore.clear();
    cacheSetSpy.mockClear();
    mockEnv.CRON_SECRET = '';
    mockFetchSites.mockReset();
    mockFetchWater.mockReset();
    mockRunRefresh.mockReset();
  });

  describe('cron-health (D-03)', () => {
    it('writes cron:lastTick:health after body succeeds', async () => {
      const before = Date.now();
      const { cronHealthRouter } = await import('../../routes/cron-health.js');
      const handler = extractHandler(cronHealthRouter);
      const { req, res } = createReqRes();
      await handler(req, res);
      const after = Date.now();

      expect(cacheStore.has('cron:lastTick:health')).toBe(true);
      const tick = cacheStore.get('cron:lastTick:health');
      expect(typeof tick).toBe('number');
      expect(tick as number).toBeGreaterThanOrEqual(before);
      expect(tick as number).toBeLessThanOrEqual(after);
      expect(cacheSetSpy).toHaveBeenCalledWith('cron:lastTick:health', expect.any(Number), 604_800);
    });
  });

  describe('cron-warm (D-04 partial-or-better)', () => {
    it('writes cron:lastTick:warm when both fetches succeed', async () => {
      mockFetchSites.mockResolvedValue({ sites: [{ id: 1 }], stats: {} });
      mockFetchWater.mockResolvedValue({ facilities: [{ id: 1 }], stats: {} });

      const { cronWarmRouter } = await import('../../routes/cron-warm.js');
      const handler = extractHandler(cronWarmRouter);
      const { req, res } = createReqRes();
      await handler(req, res);

      expect(cacheStore.has('cron:lastTick:warm')).toBe(true);
    });

    it('writes cron:lastTick:warm when one fetch succeeds and one rejects (D-04)', async () => {
      mockFetchSites.mockResolvedValue({ sites: [{ id: 1 }], stats: {} });
      mockFetchWater.mockRejectedValue(new Error('Overpass timeout'));

      const { cronWarmRouter } = await import('../../routes/cron-warm.js');
      const handler = extractHandler(cronWarmRouter);
      const { req, res } = createReqRes();
      await handler(req, res);

      expect(cacheStore.has('cron:lastTick:warm')).toBe(true);
    });

    it('does NOT write cron:lastTick:warm when both fetches reject (D-04 full failure)', async () => {
      mockFetchSites.mockRejectedValue(new Error('Overpass timeout'));
      mockFetchWater.mockRejectedValue(new Error('Overpass timeout'));

      const { cronWarmRouter } = await import('../../routes/cron-warm.js');
      const handler = extractHandler(cronWarmRouter);
      const { req, res } = createReqRes();
      await handler(req, res);

      expect(cacheStore.has('cron:lastTick:warm')).toBe(false);
    });
  });

  describe('refresh-events-cron (D-03 + D-05)', () => {
    it('writes cron:lastTick:refresh-events after runRefreshExtraction resolves', async () => {
      mockRunRefresh.mockResolvedValue({ dispatched: true, schemaVersion: 'v3' });

      const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
      const handler = extractHandler(refreshEventsCronRouter);
      const { req, res } = createReqRes();
      await handler(req, res);

      expect(cacheStore.has('cron:lastTick:refresh-events')).toBe(true);
      expect(cacheSetSpy).toHaveBeenCalledWith(
        'cron:lastTick:refresh-events',
        expect.any(Number),
        604_800,
      );
    });

    it('does NOT write cron:lastTick:refresh-events when runRefreshExtraction throws (D-03 honest-failure)', async () => {
      mockRunRefresh.mockRejectedValue(new Error('NIM throttle'));

      const { refreshEventsCronRouter } = await import('../../routes/refresh-events-cron.js');
      const handler = extractHandler(refreshEventsCronRouter);
      const { req, res, getStatus } = createReqRes();
      await handler(req, res);

      expect(getStatus()).toBe(500);
      expect(cacheStore.has('cron:lastTick:refresh-events')).toBe(false);
    });
  });
});
