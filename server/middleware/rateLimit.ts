import type { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../cache/redis.js';

/**
 * Create a sliding-window rate limiter middleware backed by Upstash Redis.
 *
 * - Skips entirely in non-production / non-Vercel environments to keep the
 *   local dev loop fast and avoid Redis writes during tests.
 * - Identifies callers by `req.ip`, falling back to the `x-forwarded-for`
 *   header when behind a proxy, then `'anonymous'` for sandboxed tools.
 * - Always sets `X-RateLimit-{Limit,Remaining,Reset}` response headers so
 *   clients can implement client-side backoff.
 * - On rejection, returns the canonical error envelope from
 *   `server/middleware/errorHandler.ts`:
 *
 *   ```json
 *   { "error": "Too many requests", "code": "RATE_LIMITED", "statusCode": 429 }
 *   ```
 *
 * @param maxRequests Max requests per window per caller.
 * @param windowSec Sliding window duration in seconds.
 * @param prefix Redis key prefix (defaults to `'ratelimit:prod'`). Pass a
 *   dedicated prefix like `'ratelimit:public'` when namespacing a baseline
 *   tier separately from per-endpoint tiers so their counters don't collide.
 */
export function createRateLimiter(
  maxRequests: number,
  windowSec: number,
  prefix: string = 'ratelimit:prod',
) {
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    prefix,
  });

  return async function rateLimitHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Skip rate limiting in local development
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      next();
      return;
    }

    const identifier = req.ip ?? (req.headers['x-forwarded-for'] as string) ?? 'anonymous';

    const result = await limiter.limit(identifier);

    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(result.reset));

    if (!result.success) {
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
      return;
    }

    next();
  };
}

/**
 * Per-endpoint rate limiters with tuned limits.
 *
 * Limits are deliberately differentiated by client polling cadence and
 * upstream cost: routes with aggressive client polling (flights, ships) get
 * the largest budgets, expensive serverless routes (events, news) get the
 * smallest, and routes that fetch once per session (sites, water) sit in
 * between. All limits are per-IP per-minute.
 */
export const rateLimiters = {
  /** 120 req/min — flights poll every 5s in the browser; allow 2x headroom for tab focus bursts. */
  flights: createRateLimiter(120, 60),
  /** 60 req/min — ships poll every 30s; allow burst when AISStream batches arrive. */
  ships: createRateLimiter(60, 60),
  /** 20 req/min — events served from 15-min GDELT cache; clients rarely re-fetch. */
  events: createRateLimiter(20, 60),
  /** 20 req/min — news served from 15-min GDELT DOC cache; matches events cadence. */
  news: createRateLimiter(20, 60),
  /** 30 req/min — markets poll every 60s; allow modest burst on tab focus. */
  markets: createRateLimiter(30, 60),
  /** 10 req/min — weather refreshed at 30-min cache TTL; barely polled. */
  weather: createRateLimiter(10, 60),
  /** 10 req/min — sites are static infrastructure, fetched once on mount. */
  sites: createRateLimiter(10, 60),
  /** 30 req/min — /api/sources is a lightweight config check, can spike on UI mounts. */
  sources: createRateLimiter(30, 60),
  /** 10 req/min — Nominatim downstream caps us at 1 rps; cache aggressively. */
  geocode: createRateLimiter(10, 60),
  /** 10 req/min — water facilities are static, fetched once on mount. */
  water: createRateLimiter(10, 60),
  /**
   * 6 req/min — portfolio demo baseline tier.
   *
   * Applied as a _global_ pre-filter across all `/api/*` routes in
   * `server/index.ts`, running _before_ the per-endpoint limiters above.
   * Its job is to protect the live demo URL (published in the README hero
   * after Phase 26.4-04) from scraper abuse. The Redis command budget is
   * already at ~92% per `.planning/STATE.md`; a single aggressive crawler
   * could otherwise tip it over.
   *
   * Why 6 and not 10? The smallest per-endpoint tier (sites/weather/water/
   * geocode) is 10 req/min, so 6 is strictly tighter. A legitimate browser
   * session that respects the UI polling cadence will never touch this
   * ceiling — it only bites scrapers and `curl` loops. A user who bumps
   * into it gets the canonical 429 envelope and can back off politely.
   *
   * Key prefix `'ratelimit:public'` namespaces this tier's counters so they
   * don't collide with per-endpoint counters under `'ratelimit:prod'`.
   */
  public: createRateLimiter(6, 60, 'ratelimit:public'),
} as const;
