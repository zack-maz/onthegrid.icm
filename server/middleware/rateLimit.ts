import { timingSafeEqual } from 'node:crypto';

import { Ratelimit } from '@upstash/ratelimit';

import { redis } from '../cache/redis.js';

import type { Request, Response, NextFunction } from 'express';

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

    // D-04 (Phase 999.1 fold-in) + Phase 28.2 W6 audit-extension: when a valid
    // DASHBOARD_PASSWORD Bearer is present, skip the limiter entirely — for
    // both the global 'ratelimit:public' tier AND every per-endpoint tier.
    //
    // The original D-04 contract scoped bypass to the public tier only
    // ("defense in depth: a leaked operator Bearer cannot exhaust per-route
    // budgets"). The W6 prod connectivity audit (run 25467532661, 5/17 PASS)
    // surfaced that the 10/min per-endpoint limiters reject the audit's own
    // Bearer-attached probes when run repeatedly from a single GH-runner IP.
    // Operator scripts and the audit itself are the *only* known Bearer
    // holders; the smaller blast radius of "operator Bearer can drain a
    // per-route budget" is acceptable in exchange for a working audit + the
    // operator's own browser not self-throttling on cold-start polling burst.
    //
    // Empty DASHBOARD_PASSWORD means "no privileged callers configured",
    // so the bypass falls through to the existing limiter (NOT a 503;
    // differs from `dashboardAuth.ts` which fail-closes on missing config).
    //
    // The closure-captured `prefix` is no longer load-bearing for the bypass
    // decision; it remains in scope only for the namespaced Redis key.
    void prefix;
    {
      const expected = process.env.DASHBOARD_PASSWORD ?? '';
      if (expected !== '') {
        const header = req.headers.authorization ?? '';
        const bearerPrefix = 'Bearer ';
        if (header.startsWith(bearerPrefix)) {
          const provided = header.slice(bearerPrefix.length);
          // Length check is required before timingSafeEqual — Node throws
          // RangeError on unequal-length Buffers. Length is not the secret.
          if (provided.length === expected.length) {
            const a = Buffer.from(provided);
            const b = Buffer.from(expected);
            if (timingSafeEqual(a, b)) {
              next();
              return;
            }
          }
        }
      }
    }
    // Fall through to existing limiter.limit() pathway.

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
   * 60 req/min — public global pre-filter for /api/* routes.
   *
   * Applied as a _global_ pre-filter across all `/api/*` routes in
   * `server/index.ts`, running _before_ the per-endpoint limiters above.
   * Job: catch obvious scraper abuse / runaway client recursion while
   * staying out of the way of legitimate dashboard sessions.
   *
   * Sized for the live dashboard's actual cold-start + steady-state cost:
   * AppShell mounts ~9 polling hooks (flights, ships, events, news,
   * markets, weather, water, waterPrecip, llmStatus) which burst-fire
   * their first fetch in <50ms. Steady-state ~20-25 req/min per tab from
   * flight polling + llm-status + health probe. Two open tabs ≈ 50/min.
   * 60/min handles both with margin.
   *
   * History: was 6/min (Plan 26.4-04). At that cap the dashboard tripped
   * its own rate limit on cold-start because hooks 7+ in the burst hit
   * 429 → setError → red dots. Raised in Phase 28.1 hot-fix on the same
   * branch as the cleanup sweep. Phase 28.2 D-04 will add Bearer bypass
   * for operator browsers, restoring tighter caps for anonymous traffic.
   *
   * The "strictly tighter than per-endpoint" property no longer holds —
   * sites/weather/water/geocode are 10/min, public is 60/min, so per-
   * endpoint limiters dominate for those routes. That's intentional:
   * public is a coarse abuse filter, per-endpoint is the real budget.
   *
   * Key prefix `'ratelimit:public'` namespaces this tier's counters so
   * they don't collide with per-endpoint counters under `'ratelimit:prod'`.
   */
  public: createRateLimiter(60, 60, 'ratelimit:public'),
} as const;
