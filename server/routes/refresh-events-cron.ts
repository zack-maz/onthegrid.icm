/**
 * Phase 27.4.6 D-04 + D-05 + D-11 — daily LLM v3 extraction trigger.
 *
 * Vercel cron GETs `/api/cron/refresh-events` once per day (vercel.json
 * schedule `0 4 * * *`). The handler:
 *   1. If `env.CRON_SECRET` is non-empty, requires `Authorization: Bearer
 *      <CRON_SECRET>`. Missing/wrong → 401. Empty env preserves un-authed
 *      dev behavior (matches cron-warm / cron-health today).
 *   2. Reads `?force=true` query param (D-11). When true (and Bearer is
 *      valid), passes `forceCooldown: true` to runRefreshExtraction so the
 *      15-min cooldown is bypassed. Use case: post-bug-fix re-extraction,
 *      post-cache-flush warm-up, testing during deploys.
 *   3. Calls `runRefreshExtraction({triggeredBy: 'cron', forceCooldown})`.
 *      The helper handles the cold-cache probe (D-10), cooldown check, and
 *      LLM-configured guard.
 *   4. Returns 200 with `{ok: true, durationMs, ...result}` on dispatch (or
 *      skip). Vercel cron treats any 2xx as success; D-08 NIM-throttle
 *      failures surface via DLQ + breaker telemetry, NOT via this route's
 *      status. Map serves raw GDELT during the throttle window (Pitfall 1
 *      bridge) so a failed cron run never blanks the dashboard.
 */

import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { cacheSetSafe } from '../cache/redis.js';
import { env } from '../config.js';
import { CRON_LASTTICK_TTL_SEC } from '../lib/healthSources.js';
import { runRefreshExtraction } from '../lib/llmExtractionPipeline.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'refresh-events-cron' });

export const refreshEventsCronRouter = Router();

refreshEventsCronRouter.get('/', async (req, res) => {
  // D-05 — auth gate. Empty CRON_SECRET keeps the route un-authed (matches
  // cron-warm / cron-health behavior); any non-empty value enforces Bearer.
  //
  // Phase 28.2.7 follow-up (WR-04) — switched from string `!==` to
  // `timingSafeEqual` for constant-time byte compare. Same rationale as
  // cron-health.ts: matches `dashboardAuth.ts` + `rateLimit.ts` posture so
  // ALL Bearer-gated surfaces share the constant-time pattern. Length is
  // not the secret, so length-mismatch early-exit is safe.
  if (env.CRON_SECRET) {
    const auth = req.header('Authorization') ?? req.header('authorization') ?? '';
    const expected = `Bearer ${env.CRON_SECRET}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  // D-11 — operator force-trigger via ?force=true (auth-gated above).
  const forceCooldown = req.query.force === 'true';

  const t0 = Date.now();
  try {
    const result = await runRefreshExtraction({
      triggeredBy: 'cron',
      forceCooldown,
    });
    const durationMs = Date.now() - t0;
    log.info({ result, durationMs, forceCooldown }, 'refresh-events cron dispatched');
    // Phase 28.2.7 R1 D-05 — cron:lastTick:refresh-events writer. Write at
    // route handler (NOT inside runRefreshExtraction — helper has non-cron
    // callers). D-03: write AFTER body succeeds; the catch block at line 57+
    // never reaches this line, so a runRefreshExtraction throw means probe
    // stays 'unknown' (correct: NIM throttle / extraction failed). D-11:
    // bare Date.now() value.
    await cacheSetSafe('cron:lastTick:refresh-events', Date.now(), CRON_LASTTICK_TTL_SEC);
    res.status(200).json({ ok: true, durationMs, ...result });
  } catch (err) {
    const durationMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, durationMs }, 'refresh-events cron failed');
    res.status(500).json({
      ok: false,
      error: 'refresh_failed',
      detail: message.slice(0, 200),
      durationMs,
    });
  }
});
