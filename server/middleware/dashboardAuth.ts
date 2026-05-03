import { timingSafeEqual } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';

/**
 * Phase 27.4.4 Plan 02 — Bearer-token middleware for the dashboard surfaces.
 *
 * Applied to:
 *   - GET  /api/events/llm-pipeline
 *   - POST /api/events/llm-pipeline   (the cutover endpoint)
 *   - POST /api/events/llm-replay/:groupKey
 *   - GET  /api/dashboard/auth-check  (client-side gate validation)
 *
 * Replaces the previous `NODE_ENV === 'production'` 404 gates on those
 * routes. The 404 model made the cutover POST physically unreachable from
 * the operator's laptop in prod, blocking Phase 27.4.4 Plan 02 Task 5.
 *
 * Behavior:
 *   - NODE_ENV !== 'production'           → bypass auth (dev keeps existing UX)
 *   - NODE_ENV === 'production' + empty   → 503 auth_not_configured (fail-closed)
 *   - NODE_ENV === 'production' + match   → next()
 *   - NODE_ENV === 'production' + bad     → 401 unauthorized
 *
 * The expected header shape is `Authorization: Bearer <DASHBOARD_PASSWORD>`.
 *
 * Comparison uses a constant-time check via `timingSafeEqual` on equal-length
 * Buffers to defang trivial timing-side-channel inference of the secret.
 * Lengths must match before calling `timingSafeEqual` per Node.js contract.
 */

export function dashboardAuth(req: Request, res: Response, next: NextFunction): void {
  // Dev / test bypass — preserves the existing local workflow where DevApiStatus
  // and the Topbar pipeline pill render without an explicit Bearer.
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const expected = process.env.DASHBOARD_PASSWORD ?? '';
  if (expected === '') {
    res.status(503).json({ error: 'auth_not_configured' });
    return;
  }

  const header = req.headers.authorization ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const provided = header.slice(prefix.length);

  // Constant-time compare — early-return on length mismatch is fine because
  // length is not the secret; only the bytes are.
  if (provided.length !== expected.length) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}
