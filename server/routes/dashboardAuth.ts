import { Router } from 'express';

import { dashboardAuth } from '../middleware/dashboardAuth.js';

/**
 * Phase 27.4.4 Plan 02 — dashboard auth probe.
 *
 * The client calls GET /api/dashboard/auth-check with `Authorization:
 * Bearer <key>`. The middleware enforces the same gate the cutover and
 * replay endpoints use; if the response is 200 the client persists the
 * key in localStorage and unhides the DevApiStatus dashboard.
 *
 * In dev (NODE_ENV !== 'production') the middleware bypasses the check
 * and the route returns `{ ok: true, mode: 'dev-bypass' }` so the
 * client knows it can skip the modal entirely.
 */
export const dashboardAuthRouter = Router();

dashboardAuthRouter.get('/auth-check', dashboardAuth, (_req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.json({ ok: true, mode: isProd ? 'authenticated' : 'dev-bypass' });
});
