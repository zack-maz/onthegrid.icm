// @vitest-environment node
/**
 * Phase 28.2.7 R2 — contract tests for llm:lastProgress write-through and
 * Redis-backed probeLlmStatus read.
 *
 * Seven cases:
 *   1. resetProgress() writes llm:lastProgress to Redis with the
 *      {startedAt:<number>, completedAt:null} shape and 604_800 TTL (D-01).
 *   2. updateProgress({completedBatches: 3, totalBatches: 10}) does NOT write
 *      to Redis — mid-run batch updates skip the guard (D-02 mid-run skip).
 *   3. updateProgress({completedAt: <number>, stage: 'done'}) writes to Redis
 *      exactly once with the preserved startedAt + new completedAt (D-02
 *      terminal write).
 *   4. /api/health round-trip with Redis pre-populated + fresh in-memory
 *      singleton returns endpoints.llmStatus.freshnessMs !== null and
 *      status === 'healthy' (SPEC R2 acceptance / D-08 Redis-first).
 *   5. /api/health round-trip with BOTH Redis empty AND singleton at
 *      INITIAL_PROGRESS returns endpoints.llmStatus.freshnessMs === null and
 *      status === 'unknown' (D-09 no fresh-deploy bias).
 *   6. /api/health round-trip with Redis empty + populated in-memory
 *      singleton falls back to the singleton (degrade-open).
 *   7. /api/health round-trip with Redis throwing on the llm:lastProgress
 *      read + populated in-memory singleton falls back to the singleton
 *      (Phase 28.1 W2 degrade-open contract).
 */

import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Hoisted mocks (must come before vi.mock calls) ----
const cacheStore = new Map<string, unknown>();
const cacheSetSpy = vi.fn(async (key: string, data: unknown, _ttl: number) => {
  cacheStore.set(key, { data, fetchedAt: Date.now() });
});
const cacheGetSpy = vi.fn(async (key: string, _maxAgeMs: number) => {
  if (!cacheStore.has(key)) return null;
  const entry = cacheStore.get(key) as { data: unknown; fetchedAt: number };
  return { data: entry.data, stale: false, lastFresh: entry.fetchedAt };
});

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

async function settle() {
  // Allow `void cacheSetSafe(...)` fire-and-forget calls to flush.
  await new Promise((r) => setImmediate(r));
}

// ---- Tests ----
describe('llmProgress write-through (R2 D-01 + D-02)', () => {
  beforeEach(async () => {
    cacheStore.clear();
    cacheSetSpy.mockClear();
    cacheGetSpy.mockClear();
    const { llmProgress, INITIAL_PROGRESS } = await import('../../lib/llmProgress.js');
    Object.assign(llmProgress, INITIAL_PROGRESS);
  });

  it('resetProgress() writes llm:lastProgress with {startedAt, completedAt:null} (D-01)', async () => {
    const before = Date.now();
    const { resetProgress } = await import('../../lib/llmProgress.js');
    resetProgress();
    await settle();
    const after = Date.now();

    expect(cacheStore.has('llm:lastProgress')).toBe(true);
    const stored = cacheStore.get('llm:lastProgress') as {
      data: { startedAt: number | null; completedAt: number | null };
    };
    expect(typeof stored.data.startedAt).toBe('number');
    expect(stored.data.startedAt).toBeGreaterThanOrEqual(before);
    expect(stored.data.startedAt).toBeLessThanOrEqual(after);
    expect(stored.data.completedAt).toBeNull();

    // TTL argument check
    expect(cacheSetSpy).toHaveBeenCalledWith(
      'llm:lastProgress',
      expect.objectContaining({ startedAt: expect.any(Number), completedAt: null }),
      604_800,
    );
  });

  it('updateProgress() does NOT write on mid-run batch progress (D-02 skip)', async () => {
    const { resetProgress, updateProgress } = await import('../../lib/llmProgress.js');
    resetProgress();
    await settle();
    cacheSetSpy.mockClear();

    // Mid-run updates — completedAt absent from partial → no write
    updateProgress({ completedBatches: 3, totalBatches: 10 });
    updateProgress({ completedGeocodes: 5, totalGeocodes: 10 });
    updateProgress({ stage: 'llm-processing' });
    await settle();

    expect(cacheSetSpy).not.toHaveBeenCalled();
  });

  it('updateProgress() writes when partial.completedAt is set (D-02 terminal)', async () => {
    const { resetProgress, updateProgress, llmProgress } = await import('../../lib/llmProgress.js');
    resetProgress();
    await settle();
    const startedAt = llmProgress.startedAt;
    cacheSetSpy.mockClear();

    const completedAt = Date.now();
    updateProgress({ completedAt, stage: 'done' });
    await settle();

    expect(cacheSetSpy).toHaveBeenCalledTimes(1);
    const stored = cacheStore.get('llm:lastProgress') as {
      data: { startedAt: number | null; completedAt: number | null };
    };
    expect(stored.data.startedAt).toBe(startedAt);
    expect(stored.data.completedAt).toBe(completedAt);
  });
});

describe('probeLlmStatus Redis-first read (R2 D-08 + D-09 + D-10)', () => {
  beforeEach(async () => {
    cacheStore.clear();
    cacheSetSpy.mockClear();
    cacheGetSpy.mockClear();
    const { llmProgress, INITIAL_PROGRESS } = await import('../../lib/llmProgress.js');
    Object.assign(llmProgress, INITIAL_PROGRESS);
  });

  it('returns freshnessMs !== null when Redis has data and singleton is fresh (SPEC R2 acceptance / D-08)', async () => {
    // Pre-write Redis directly (simulates Vercel cold-start: another instance ran cron)
    const startedAt = Date.now() - 10_000;
    const completedAt = Date.now() - 5_000;
    cacheStore.set('llm:lastProgress', {
      data: { startedAt, completedAt },
      fetchedAt: Date.now(),
    });

    // Confirm fresh singleton — D-10 invariant precondition
    const { llmProgress } = await import('../../lib/llmProgress.js');
    expect(llmProgress.startedAt).toBeNull();
    expect(llmProgress.completedAt).toBeNull();

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<
        string,
        { freshnessMs: number | null; status: string; lastSuccessTs: number | null }
      >;
    };
    expect(body.endpoints.llmStatus!.freshnessMs).not.toBeNull();
    expect(body.endpoints.llmStatus!.lastSuccessTs).toBe(completedAt);
    expect(body.endpoints.llmStatus!.status).toBe('healthy');

    // D-10: probe is read-only — singleton must remain at INITIAL_PROGRESS
    expect(llmProgress.startedAt).toBeNull();
    expect(llmProgress.completedAt).toBeNull();
  });

  it('returns freshnessMs:null and status:unknown when BOTH Redis and singleton are empty (D-09)', async () => {
    // cacheStore is empty (cleared in beforeEach); singleton at INITIAL_PROGRESS
    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<string, { freshnessMs: number | null; status: string }>;
    };
    expect(body.endpoints.llmStatus!.freshnessMs).toBeNull();
    expect(body.endpoints.llmStatus!.status).toBe('unknown');
  });

  it('falls back to in-memory singleton when Redis returns null (degrade-open)', async () => {
    // cacheStore empty → cacheGetSpy returns null
    // Populate in-memory singleton instead
    const completedAt = Date.now() - 1_000;
    const { llmProgress } = await import('../../lib/llmProgress.js');
    llmProgress.startedAt = completedAt - 5_000;
    llmProgress.completedAt = completedAt;

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<
        string,
        { freshnessMs: number | null; status: string; lastSuccessTs: number | null }
      >;
    };
    expect(body.endpoints.llmStatus!.freshnessMs).not.toBeNull();
    expect(body.endpoints.llmStatus!.lastSuccessTs).toBe(completedAt);
  });

  it('falls back to in-memory singleton when Redis throws (degrade-open)', async () => {
    // Make cacheGetSafe throw on next call (Redis down)
    cacheGetSpy.mockImplementationOnce(async () => {
      throw new Error('Redis ECONNREFUSED');
    });

    const completedAt = Date.now() - 1_000;
    const { llmProgress } = await import('../../lib/llmProgress.js');
    llmProgress.startedAt = completedAt - 5_000;
    llmProgress.completedAt = completedAt;

    const { healthRouter } = await import('../../routes/health.js');
    const handler = extractHandler(healthRouter);
    const { req, res, getBody } = createReqRes();
    await handler(req, res);

    const body = getBody() as {
      endpoints: Record<string, { freshnessMs: number | null; lastSuccessTs: number | null }>;
    };
    expect(body.endpoints.llmStatus!.freshnessMs).not.toBeNull();
    expect(body.endpoints.llmStatus!.lastSuccessTs).toBe(completedAt);
  });
});
