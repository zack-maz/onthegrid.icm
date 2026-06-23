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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// incr/expire present so the 429-counter (Phase 46 HARD-01) doesn't throw at
// module-load wiring; the bypass-proof tests never reach the 429 branch.
vi.mock('../cache/redis.js', () => ({
  redis: {
    ping: vi.fn(async () => 'PONG'),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
  },
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

  it('is configured with a 60 req/60s ceiling', () => {
    // slidingWindow was called once per limiter at module load. The public
    // tier is 60 per 60s — sized to absorb AppShell's ~9-hook mount burst
    // plus steady-state polling for one or two open tabs without tripping
    // legitimate dashboard sessions. Per-endpoint limiters underneath
    // dominate for the 10-req/min routes (sites/water/weather/geocode);
    // public is a coarse abuse filter, not the route-level budget.
    // History: was 6/60s pre-Phase-28.1; raised when the dashboard's own
    // mount burst started self-tripping. See Phase 28.2 D-04 for the
    // planned Bearer-bypass that will tighten anonymous traffic again.
    const publicConfigCall = slidingWindowSpy.mock.calls.find(
      ([tokens, window]) => tokens === 60 && window === '60 s',
    );
    expect(publicConfigCall).toBeDefined();
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

/**
 * Phase 46 HARD-01 (D-03) — 999.1 Bearer-bypass coverage proof.
 *
 * The operator dashboard polls hit the public global pre-filter AND the
 * per-endpoint limiters (flights/ships/events/…). The W6 audit-extension
 * (rateLimit.ts:53-93) loosened the bypass so a valid DASHBOARD_PASSWORD
 * Bearer reaches `next()` on EVERY tier, not just `public` — otherwise the
 * audit's own Bearer-attached probes (and the operator's cold-start polling
 * burst) self-throttle on the 10/min per-endpoint tiers.
 *
 * This block PROVES (per D-03) that property for the public tier AND every
 * per-endpoint tier in `rateLimiters`, by driving each tier's middleware with
 * a valid Bearer under stubbed production env and asserting:
 *   - next() is called (bypass reached), AND
 *   - limiter.limit is NOT invoked (the bypass short-circuits before it).
 *
 * It also keeps the empty-DASHBOARD_PASSWORD fall-through assertion (a missing
 * privileged caller falls through to the limiter — NOT a 503).
 *
 * This is a TEST-ONLY proof — no change to the bypass logic in rateLimit.ts.
 */
describe('Bearer-bypass coverage — public AND every per-endpoint tier (Phase 46 D-03 / 999.1)', () => {
  const PASSWORD = 'op-secret-32characters-of-bytes!';
  const ORIG_PASSWORD = process.env.DASHBOARD_PASSWORD;

  // Every tier in the live `rateLimiters` table. The proof must cover all of
  // them — not just `public` — so a future regression that re-scopes the
  // bypass to the public tier only would fail here.
  const ALL_TIERS = Object.keys(rateLimiters) as Array<keyof typeof rateLimiters>;

  beforeEach(() => {
    mockLimit.mockReset();
    // If the bypass somehow did NOT fire, the limiter would approve — making a
    // missing-bypass bug visible only via the `mockLimit` call assertion below.
    mockLimit.mockResolvedValue({
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    });
    process.env.DASHBOARD_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    if (ORIG_PASSWORD === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = ORIG_PASSWORD;
  });

  it('covers every rateLimiters tier (sanity: the table has the expected 11 tiers)', () => {
    expect(ALL_TIERS.sort()).toEqual(
      [
        'events',
        'flights',
        'geocode',
        'markets',
        'news',
        'public',
        'ships',
        'sites',
        'sources',
        'water',
        'weather',
      ].sort(),
    );
  });

  for (const tier of [
    'flights',
    'ships',
    'events',
    'news',
    'markets',
    'weather',
    'sites',
    'sources',
    'geocode',
    'water',
    'public',
  ] as const) {
    it(`tier '${tier}': a valid Bearer reaches next() and NEVER invokes limiter.limit (bypass)`, async () => {
      const req = {
        ip: '203.0.113.7',
        headers: { authorization: `Bearer ${PASSWORD}` },
      } as Request;
      const res = createRes() as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      await rateLimiters[tier](req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      // The bypass short-circuits BEFORE the limiter is consulted — no Redis
      // round-trip, no X-RateLimit-* headers.
      expect(mockLimit).not.toHaveBeenCalled();
    });
  }

  it('empty DASHBOARD_PASSWORD falls through to the limiter (NOT a 503) even with a Bearer present', async () => {
    delete process.env.DASHBOARD_PASSWORD;
    const req = { ip: '203.0.113.7', headers: { authorization: `Bearer ${PASSWORD}` } } as Request;
    const res = createRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    // No privileged caller configured → bypass MUST NOT fire on any tier.
    await rateLimiters.flights(req, res, next);

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    // Definitely not a 503 — the limiter approved this request.
    expect((res as unknown as { _status: number })._status).toBe(200);
  });
});
