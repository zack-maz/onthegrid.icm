/**
 * Phase 27.4.4 Plan 01 Task 9 (D-14) — daily LLM evaluation cron route.
 *
 * Vercel cron POSTs `/api/cron/eval` once per day (vercel.json schedule
 * "0 4 * * *"). The handler:
 *   1. If `env.CRON_SECRET` is non-empty, requires the request to carry
 *      `Authorization: Bearer <CRON_SECRET>`. Missing/wrong → 401. Empty
 *      env preserves the existing un-authed behavior of cron-warm /
 *      cron-health (so dev workflows + Vercel projects without a secret
 *      keep working).
 *   2. Calls `runEval()` from `lib/llmEvalHarness.js` (resolver-only path —
 *      zero new LLM token spend) and returns the EvalScore plus the
 *      derived `ratioWithin20km` (D-25 deploy gate signal).
 *
 * The route's response is observability-only — Vercel cron treats any 2xx
 * as success. A degraded result (low ratio) is still 200; the operator
 * monitors the value via /api/events/llm-status.
 */

import { Router } from 'express';

import { env } from '../config.js';
import { runEval } from '../lib/llmEvalHarness.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'eval-cron' });

export const evalCronRouter = Router();

evalCronRouter.post('/', async (req, res) => {
  // D-14 — auth gate. Empty CRON_SECRET keeps the route un-authed (matches
  // cron-warm / cron-health behavior); any non-empty value enforces the
  // bearer token.
  if (env.CRON_SECRET) {
    const auth = req.header('Authorization') ?? req.header('authorization') ?? '';
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (auth !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  const t0 = Date.now();
  try {
    const score = await runEval();
    const durationMs = Date.now() - t0;
    const ratioWithin20km = score.total > 0 ? score.within20km / score.total : 0;
    log.info({ score, durationMs, ratioWithin20km }, 'eval cron run complete');
    res.status(200).json({
      status: 'ok',
      score,
      durationMs,
      ratioWithin20km,
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, durationMs }, 'eval cron run failed');
    res.status(500).json({ status: 'error', error: message, durationMs });
  }
});
