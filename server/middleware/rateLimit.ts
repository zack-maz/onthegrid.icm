import type { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../cache/redis.js';

export function createRateLimiter(maxRequests: number, windowSec: number) {
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    prefix: 'ratelimit:prod',
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

    const identifier =
      req.ip ?? (req.headers['x-forwarded-for'] as string) ?? 'anonymous';

    const result = await limiter.limit(identifier);

    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(result.reset));

    if (!result.success) {
      res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED', statusCode: 429 });
      return;
    }

    next();
  };
}

/** Per-endpoint rate limiters with tuned limits */
export const rateLimiters = {
  flights: createRateLimiter(120, 60),
  ships: createRateLimiter(60, 60),
  events: createRateLimiter(20, 60),
  news: createRateLimiter(20, 60),
  markets: createRateLimiter(30, 60),
  weather: createRateLimiter(10, 60),
  sites: createRateLimiter(10, 60),
  sources: createRateLimiter(30, 60),
  geocode: createRateLimiter(10, 60),
  water: createRateLimiter(10, 60),
} as const;

/** @deprecated Use rateLimiters[route] for per-endpoint limits */
export const rateLimitMiddleware = createRateLimiter(60, 60);
