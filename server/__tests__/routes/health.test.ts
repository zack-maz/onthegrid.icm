// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';

// Mock redis module before importing health router
const mockPing = vi.fn<() => Promise<string>>();
const mockCacheGet = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  redis: { ping: (...args: unknown[]) => mockPing(...(args as [])) },
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
}));

// Helper: create a minimal request/response pair for Express handler testing
function createReqRes() {
  const req = {} as import('express').Request;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
  } as unknown as import('express').Response;
  return { req, res, getStatus: () => statusCode, getBody: () => body as Record<string, unknown> };
}

describe('Health endpoint', () => {
  beforeEach(() => {
    mockPing.mockReset();
    mockCacheGet.mockReset();
  });

  it('returns status ok and redis true when ping succeeds', async () => {
    mockPing.mockResolvedValue('PONG');
    mockCacheGet.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');

    // Extract the GET / handler from the router
    const { req, res, getBody } = createReqRes();
    const handler = extractHandler(healthRouter);
    await handler(req, res);

    const body = getBody();
    expect(body.status).toBe('ok');
    expect(body.redis).toBe(true);
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.latencyMs).toBe('number');
    expect(body.sources).toBeDefined();
    expect(typeof body.estimatedDailyCommands).toBe('number');
  });

  it('returns status degraded and redis false when ping throws', async () => {
    mockPing.mockRejectedValue(new Error('Connection refused'));
    mockCacheGet.mockResolvedValue(null);

    const { healthRouter } = await import('../../routes/health.js');

    const { req, res, getBody } = createReqRes();
    const handler = extractHandler(healthRouter);
    await handler(req, res);

    const body = getBody();
    expect(body.status).toBe('degraded');
    expect(body.redis).toBe(false);
  });

  it('includes sources object with timestamp numbers', async () => {
    const now = Date.now();
    mockPing.mockResolvedValue('PONG');
    mockCacheGet.mockImplementation(async (key: string) => {
      if (key === 'flights:adsblol') return { data: [], stale: false, lastFresh: now - 5000 };
      if (key === 'events:gdelt') return { data: [], stale: false, lastFresh: now - 60000 };
      return null;
    });

    const { healthRouter } = await import('../../routes/health.js');

    const { req, res, getBody } = createReqRes();
    const handler = extractHandler(healthRouter);
    await handler(req, res);

    const body = getBody();
    const sources = body.sources as Record<string, number | null>;
    expect(sources.flights).toBe(now - 5000);
    expect(sources.events).toBe(now - 60000);
    expect(sources.ships).toBeNull();
  });
});

/**
 * Extract the first GET handler from an Express Router.
 * Express stores route layers in router.stack.
 */
function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: Array<{ route?: { methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }>).stack;
  for (const layer of stack) {
    if (layer.route?.methods.get) {
      return layer.route.stack[0].handle as (req: import('express').Request, res: import('express').Response) => Promise<void>;
    }
  }
  throw new Error('No GET handler found on router');
}
