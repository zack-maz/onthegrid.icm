// @vitest-environment node
/**
 * Phase 28.2 Plan 02 — D-04 Bearer-bypass test matrix for `rateLimiters.public`.
 *
 * Folds Phase 999.1: when a valid `DASHBOARD_PASSWORD` Bearer is present on a
 * request hitting the global `ratelimit:public` 60-req/min tier, the limiter
 * is skipped. Per-endpoint tiers (`ratelimit:prod` prefix) STILL throttle
 * privileged callers — Test 7 codifies this so a future regression that
 * widens the bypass scope will fail loudly.
 *
 * Behavior contract (CONTEXT D-04 + PLAN truths):
 *   1. NODE_ENV !== 'production' AND no VERCEL — handler calls next() (existing
 *      dev-bypass; Test 1 verifies we did NOT regress it).
 *   2. NODE_ENV === 'production', no Bearer — handler delegates to limiter.limit().
 *   3. NODE_ENV === 'production', valid Bearer matches DASHBOARD_PASSWORD —
 *      handler skips limiter.limit() entirely on the public tier.
 *   4. NODE_ENV === 'production', wrong-length Bearer — handler does NOT skip,
 *      delegates to limiter.limit() (length precheck rejects before
 *      timingSafeEqual is reached).
 *   5. NODE_ENV === 'production', correct-length but wrong-bytes Bearer —
 *      handler does NOT skip, delegates to limiter.limit().
 *   6. NODE_ENV === 'production', DASHBOARD_PASSWORD unset (empty string) AND
 *      Bearer present — handler does NOT skip (no privileged caller is
 *      configured; this differs from `dashboardAuth` middleware which 503s).
 *   7. Per-endpoint tier (prefix !== 'ratelimit:public') with valid Bearer —
 *      handler does NOT skip; per-endpoint limit still applies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { Request, Response, NextFunction } from 'express';

// Module-level limit spy. The MockRatelimit class instances all share this so
// tests can assert "limit was called" / "limit was NOT called" regardless of
// which specific limiter (public vs flights) ran.
const mockLimit = vi.fn();

class MockRatelimit {
  limit = mockLimit;
  static slidingWindow(_tokens: number, _window: string) {
    return 'sliding-window-config';
  }
}

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

// Stub redis so module load doesn't try to connect to Upstash.
// Phase 46 HARD-01: the 429 branch fires `incr429` which calls
// `redis.incr`/`redis.expire`. Module-level mocks so the 429-sidecar tests can
// assert the dated key + EXPIRE-on-first AND a rejecting INCR (degrade-open).
const incrMock = vi.fn(async () => 1);
const expireMock = vi.fn(async () => 1);
vi.mock('../../cache/redis.js', () => ({
  redis: {
    ping: vi.fn(async () => 'PONG'),
    incr: (...a: unknown[]) => incrMock(...a),
    expire: (...a: unknown[]) => expireMock(...a),
  },
}));

// Force production so the limiter actually runs (it's a no-op in dev outside
// Test 1, which explicitly resets NODE_ENV).
vi.stubEnv('NODE_ENV', 'production');

// Import AFTER mocks. Both `rateLimiters.public` (prefix 'ratelimit:public')
// and `rateLimiters.flights` (default prefix 'ratelimit:prod') are needed to
// exercise the scope-of-bypass contract from Test 7.
const { rateLimiters, createRateLimiter, RATE_LIMITER_CONFIG } = await import('../rateLimit.js');

function createMockReq(authHeader: string | null): Partial<Request> {
  return {
    ip: '127.0.0.1',
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function createMockRes(): {
  res: Response;
  _status: { value: number };
  _json: { value: unknown };
  _headers: Record<string, string>;
} {
  const _status = { value: 200 };
  const _json = { value: null as unknown };
  const _headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      _status.value = code;
      return res;
    },
    json(body: unknown) {
      _json.value = body;
      return res;
    },
    set(name: string, value: string) {
      _headers[name] = value;
      return res;
    },
  } as unknown as Response;
  return { res, _status, _json, _headers };
}

describe('rate-limit bearer bypass (D-04, Phase 999.1 fold-in)', () => {
  const ORIG_NODE_ENV = process.env.NODE_ENV;
  const ORIG_VERCEL = process.env.VERCEL;
  const ORIG_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    mockLimit.mockReset();
    // Default: limiter approves the request. Tests that expect bypass assert
    // mockLimit was NEVER called; tests that expect throttle delegation
    // assert it WAS called.
    mockLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 60_000,
    });
    // Reset env per test. Production is the "interesting" mode; Test 1 flips
    // it explicitly.
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.DASHBOARD_PASSWORD;
  });

  afterEach(() => {
    if (ORIG_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIG_NODE_ENV;
    }
    if (ORIG_VERCEL === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = ORIG_VERCEL;
    }
    if (ORIG_PASSWORD === undefined) {
      delete process.env.DASHBOARD_PASSWORD;
    } else {
      process.env.DASHBOARD_PASSWORD = ORIG_PASSWORD;
    }
  });

  // -------------------------------------------------------------------------
  // Test 1 — existing dev-bypass: must continue calling next() immediately
  // -------------------------------------------------------------------------
  it('Test 1: dev short-circuit (NODE_ENV !== production AND no VERCEL) calls next() immediately', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL;
    const req = createMockReq(null);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2 — production, no Bearer: delegates to limiter.limit()
  // -------------------------------------------------------------------------
  it('Test 2: production with no Bearer header delegates to limiter.limit()', async () => {
    // DASHBOARD_PASSWORD set so the bypass branch can theoretically fire,
    // but the absent Authorization header rules it out.
    process.env.DASHBOARD_PASSWORD = 'op-secret-32characters-of-bytes!';
    const req = createMockReq(null);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 3 — production, valid Bearer: SKIPS limiter.limit() on public tier
  // -------------------------------------------------------------------------
  it('Test 3: production with valid Bearer skips ratelimit:public limiter entirely', async () => {
    const password = 'op-secret-32characters-of-bytes!';
    process.env.DASHBOARD_PASSWORD = password;
    const req = createMockReq(`Bearer ${password}`);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    // Bypass MUST fire — limiter never consulted, no Redis round-trip,
    // no X-RateLimit-* headers set.
    expect(mockLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 4 — wrong-length Bearer: NO bypass; delegates to limiter
  // -------------------------------------------------------------------------
  it('Test 4: production with wrong-length Bearer does NOT skip; delegates to limiter.limit()', async () => {
    process.env.DASHBOARD_PASSWORD = 'op-secret-32characters-of-bytes!';
    // Shorter than the configured password → length precheck rejects before
    // timingSafeEqual is reached (timingSafeEqual would throw on length
    // mismatch per Node.js contract, but we never get there).
    const req = createMockReq('Bearer too-short');
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 5 — correct-length but wrong-bytes Bearer: NO bypass
  // -------------------------------------------------------------------------
  it('Test 5: production with same-length but wrong-bytes Bearer does NOT skip; delegates to limiter.limit()', async () => {
    const password = 'op-secret-32characters-of-bytes!';
    process.env.DASHBOARD_PASSWORD = password;
    // Same length, last byte differs (constant-time compare must reject).
    const wrongBytes = 'op-secret-32characters-of-bytes?';
    expect(wrongBytes.length).toBe(password.length);
    const req = createMockReq(`Bearer ${wrongBytes}`);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 6 — DASHBOARD_PASSWORD unset (empty): NO bypass even with Bearer
  // -------------------------------------------------------------------------
  it('Test 6: production with empty DASHBOARD_PASSWORD does NOT bypass — falls through to limiter (differs from dashboardAuth which 503s)', async () => {
    // Explicitly leave DASHBOARD_PASSWORD unset.
    delete process.env.DASHBOARD_PASSWORD;
    const req = createMockReq('Bearer anything-even-correct-length-bytes-here');
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    // No privileged caller is configured → bypass MUST NOT fire. Limiter is
    // consulted as if the Bearer weren't present.
    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 7 — Phase 28.2 W6 audit-extension: per-endpoint tier ALSO bypasses
  //          on valid Bearer (was: per-endpoint tier still throttles). The
  //          original D-04 "defense in depth" carve-out was loosened after the
  //          W6 prod connectivity audit (run 25467532661) surfaced that
  //          per-endpoint 10/min limits reject the audit's own Bearer probes
  //          from a single GH-runner IP.
  // -------------------------------------------------------------------------
  it('Test 7: per-endpoint tier (ratelimit:prod prefix) DOES bypass on valid Bearer (W6 extension)', async () => {
    const password = 'op-secret-32characters-of-bytes!';
    process.env.DASHBOARD_PASSWORD = password;
    const flightsTier = createRateLimiter(120, 60); // default prefix 'ratelimit:prod'
    const req = createMockReq(`Bearer ${password}`);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await flightsTier(req as Request, res, next);

    // Bearer-attached operator/audit traffic skips the limiter on every tier.
    expect(mockLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Phase 46 HARD-01 (D-02) — 429 sidecar counter (degrade-open) + config table
// ===========================================================================
describe('rate-limit 429 sidecar counter (Phase 46 HARD-01, D-02)', () => {
  const ORIG_NODE_ENV = process.env.NODE_ENV;
  const ORIG_VERCEL = process.env.VERCEL;
  const ORIG_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    mockLimit.mockReset();
    incrMock.mockReset();
    expireMock.mockReset();
    // Default: limiter REJECTS so the 429 branch (and the counter) fires.
    mockLimit.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    incrMock.mockResolvedValue(1);
    expireMock.mockResolvedValue(1);
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.DASHBOARD_PASSWORD;
  });

  afterEach(() => {
    if (ORIG_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIG_NODE_ENV;
    if (ORIG_VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = ORIG_VERCEL;
    if (ORIG_PASSWORD === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = ORIG_PASSWORD;
  });

  it('fires INCR on the dated key `ratelimit:429:{tier}:{YYYY-MM-DD}` with EXPIRE-on-first (48h) on a 429', async () => {
    const req = createMockReq(null);
    const { res, _status, _json } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);

    // Response is the canonical 429 envelope.
    expect(_status.value).toBe(429);
    expect(_json.value).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
    expect(next).not.toHaveBeenCalled();

    // INCR fired against the dated key. The counter is fire-and-forget, so
    // await a microtask flush before asserting.
    await Promise.resolve();
    await Promise.resolve();
    const ymd = new Date().toISOString().slice(0, 10);
    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(incrMock).toHaveBeenCalledWith(`ratelimit:429:public:${ymd}`);
    // EXPIRE-on-first: used===1 → TTL set to 48h.
    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock).toHaveBeenCalledWith(`ratelimit:429:public:${ymd}`, 48 * 60 * 60);
  });

  it('does NOT re-issue EXPIRE on the second+ INCR of the day (EXPIRE-on-first only)', async () => {
    incrMock.mockResolvedValue(2); // not the first INCR of the day
    const req = createMockReq(null);
    const { res, _status } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(_status.value).toBe(429);
    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(expireMock).not.toHaveBeenCalled();
  });

  it('DEGRADE-OPEN: a rejecting INCR mock STILL yields a 429 (never a 500), and never throws', async () => {
    incrMock.mockRejectedValue(new Error('redis down'));
    const req = createMockReq(null);
    const { res, _status, _json } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    // The middleware promise must resolve, not reject (no propagation to the
    // Express error handler → no 500).
    await expect(rateLimiters.public(req as Request, res, next)).resolves.not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    // Response is STILL a 429 with the canonical envelope.
    expect(_status.value).toBe(429);
    expect(_json.value).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT fire the counter on a successful (non-429) request', async () => {
    mockLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 60_000,
    });
    const req = createMockReq(null);
    const { res } = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimiters.public(req as Request, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(incrMock).not.toHaveBeenCalled();
    expect(expireMock).not.toHaveBeenCalled();
  });

  it('RATE_LIMITER_CONFIG byte-matches the rateLimiters tier table', () => {
    // Every tier in the limiter table must have a config entry with the EXACT
    // max/windowSec passed to createRateLimiter — drift fails here.
    expect(RATE_LIMITER_CONFIG).toEqual({
      flights: { max: 120, windowSec: 60 },
      ships: { max: 60, windowSec: 60 },
      events: { max: 20, windowSec: 60 },
      news: { max: 20, windowSec: 60 },
      markets: { max: 30, windowSec: 60 },
      weather: { max: 10, windowSec: 60 },
      sites: { max: 10, windowSec: 60 },
      sources: { max: 30, windowSec: 60 },
      geocode: { max: 10, windowSec: 60 },
      water: { max: 10, windowSec: 60 },
      public: { max: 60, windowSec: 60 },
    });
    // Key set parity with the live limiter table (no tier missing/extra).
    expect(Object.keys(RATE_LIMITER_CONFIG).sort()).toEqual(Object.keys(rateLimiters).sort());
  });
});
