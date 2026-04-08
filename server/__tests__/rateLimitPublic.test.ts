// @vitest-environment node
/**
 * Tests for the `rateLimiters.public` baseline tier.
 *
 * The public tier is a stricter per-IP throttle added in Plan 26.4-04 to
 * protect the live demo URL from scraper abuse when it's published in the
 * portfolio README. It runs as a baseline across the entire `/api/*` surface
 * on top of the existing per-endpoint limiters (flights, events, etc.).
 *
 * Numbers: 6 requests per 60s (10x smaller than the smallest per-endpoint
 * ceiling of 10 req/min, so anything that trips the public tier would never
 * reach the per-endpoint limiter anyway).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Track arguments passed into Ratelimit.slidingWindow so we can assert the
// configured ceiling. This is the most reliable way to inspect the
// max/window of a specific tier without dissecting the Upstash internals.
const slidingWindowSpy = vi.fn((tokens: number, window: string) => ({
  __type: 'sliding-window-config',
  tokens,
  window,
}));

const mockLimit = vi.fn();

class MockRatelimit {
  limit = mockLimit;
  static slidingWindow(tokens: number, window: string) {
    return slidingWindowSpy(tokens, window);
  }
}

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

vi.mock('../cache/redis.js', () => ({
  redis: { ping: vi.fn(async () => 'PONG') },
}));

// Force production mode so the limiter actually runs (it's a no-op in dev).
vi.stubEnv('NODE_ENV', 'production');

const { rateLimiters } = await import('../middleware/rateLimit.js');

function createReq(ip = '203.0.113.7'): Partial<Request> {
  return { ip, headers: {} };
}

function createRes() {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
    set(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res;
}

describe('rateLimiters.public — portfolio demo tier', () => {
  beforeEach(() => {
    mockLimit.mockReset();
  });

  it('exists as a middleware function', () => {
    expect(rateLimiters.public).toBeDefined();
    expect(typeof rateLimiters.public).toBe('function');
  });

  it('is configured with a strict 6 req/60s ceiling', () => {
    // slidingWindow was called once per limiter at module load. The public
    // tier must be 6 per 60s — tighter than the smallest per-endpoint tier
    // (10 req/min) so it acts as a baseline gate before per-endpoint limits.
    const publicConfigCall = slidingWindowSpy.mock.calls.find(
      ([tokens, window]) => tokens === 6 && window === '60 s',
    );
    expect(publicConfigCall).toBeDefined();
  });

  it('is tighter than the smallest per-endpoint limiter (sites/weather/geocode/water = 10 req/min)', () => {
    // We can't read the tokens back off the mock directly, so instead we
    // assert the public tier config (6,60) was registered AND the smallest
    // per-endpoint tier (10,60) was also registered. 6 < 10 proves tighter.
    const publicCfg = slidingWindowSpy.mock.calls.find(
      ([tokens, window]) => tokens === 6 && window === '60 s',
    );
    const smallestPerEndpointCfg = slidingWindowSpy.mock.calls.find(
      ([tokens, window]) => tokens === 10 && window === '60 s',
    );
    expect(publicCfg).toBeDefined();
    expect(smallestPerEndpointCfg).toBeDefined();
  });

  it('returns the canonical 429 error envelope when the ceiling is exceeded', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 6,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    const req = createReq() as Request;
    const res = createRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res as unknown as { _status: number })._status).toBe(429);
    expect((res as unknown as { _json: unknown })._json).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
  });

  it('returns 429 on the 7th request from the same IP within the window', async () => {
    // Sequence: 6 successes, then 1 failure. The 7th is the one we assert.
    mockLimit
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 5, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 4, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 3, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 2, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 1, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: true, limit: 6, remaining: 0, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({
        success: false,
        limit: 6,
        remaining: 0,
        reset: Date.now() + 60_000,
      });

    const statuses: number[] = [];

    for (let i = 0; i < 7; i++) {
      const req = createReq() as Request;
      const res = createRes() as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;
      await rateLimiters.public(req, res, next);
      statuses.push((res as unknown as { _status: number })._status);
    }

    // First 6 pass through (next() called, status stays at default 200),
    // the 7th is rejected with 429.
    expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(statuses[6]).toBe(429);
    expect(mockLimit).toHaveBeenCalledTimes(7);
  });

  it('sets X-RateLimit-* response headers on every call', async () => {
    const resetTime = Date.now() + 55_000;
    mockLimit.mockResolvedValue({
      success: true,
      limit: 6,
      remaining: 5,
      reset: resetTime,
    });

    const req = createReq() as Request;
    const res = createRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req, res, next);

    const headers = (res as unknown as { _headers: Record<string, string> })._headers;
    expect(headers['X-RateLimit-Limit']).toBe('6');
    expect(headers['X-RateLimit-Remaining']).toBe('5');
    expect(headers['X-RateLimit-Reset']).toBe(String(resetTime));
    expect(next).toHaveBeenCalled();
  });
});
