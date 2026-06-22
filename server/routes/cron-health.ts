import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { redis, cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { env } from '../config.js';
import { CRON_LASTTICK_TTL_SEC, SOURCE_KEYS } from '../lib/healthSources.js';
import { runEval, runAdversarialEval } from '../lib/llmEvalHarness.js';
import { logger } from '../lib/logger.js';
import { appendTrendSample } from '../lib/trendHistory.js';
import { URL_LIVENESS_COUNT_KEY } from '../lib/urlLiveness.js';

import type { AdversarialEvalResult } from '../lib/llmEvalHarness.js';

const log = logger.child({ module: 'cron-health' });

export const cronHealthRouter = Router();

// Phase 28.1 W2 — SOURCE_KEYS deduplicated to server/lib/healthSources.ts.
// W1 audit DRIFT-1/2/3 fixes (news:feed, sites:v3, water:facilities:v4) now
// land here automatically because the shared module is the single writer.

/** If a source's lastFresh is older than this, log a warning */
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

cronHealthRouter.get('/', async (req, res) => {
  // Phase 27.4.6 D-09 — auth gate added when CRON_SECRET is set. Empty env
  // preserves the existing un-authed dev behavior (matches cron-warm +
  // the original cron-health surface). Mirrors eval-cron.ts:33-40.
  //
  // Phase 28.2.7 follow-up (WR-04) — switched from string `!==` to
  // `timingSafeEqual` for constant-time byte compare. Plain string compare
  // is timing-leaky in principle (early-exit on the first differing byte);
  // matches the posture set by `server/middleware/dashboardAuth.ts:55-64`
  // and `server/middleware/rateLimit.ts:81-86`. Length check fires before
  // `timingSafeEqual` per the Node.js contract (the helper throws on
  // mismatched lengths). Length is not the secret — only the bytes are —
  // so an early-exit on length is safe.
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

  const now = Date.now();
  let redisOk = false;

  // Ping Redis
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    log.error('Redis ping failed');
  }

  // Query per-source freshness
  const sources: Record<string, { lastFresh: number | null; stale: boolean }> = {};
  const warnings: string[] = [];

  await Promise.all(
    Object.entries(SOURCE_KEYS).map(async ([name, key]) => {
      try {
        const entry = await cacheGetSafe(key, 999_999_999);
        const lastFresh = entry?.lastFresh ?? null;
        const stale = lastFresh !== null && now - lastFresh > STALE_THRESHOLD_MS;

        sources[name] = { lastFresh, stale };

        if (stale) {
          const ageMin = Math.round((now - lastFresh!) / 60_000);
          warnings.push(`${name}: stale (${ageMin}min old)`);
        } else if (lastFresh === null) {
          warnings.push(`${name}: no data`);
        }
      } catch {
        sources[name] = { lastFresh: null, stale: false };
        warnings.push(`${name}: fetch error`);
      }
    }),
  );

  // Log results
  if (warnings.length > 0) {
    log.warn({ warningCount: warnings.length, warnings }, 'source health warnings');
  } else {
    log.info('all sources healthy');
  }

  // Phase 27.4.6 D-09 — fold eval-drift into cron-health. Replaces the
  // dropped /api/cron/eval schedule (route file is preserved for manual
  // ops). Eval runs on cron-health's daily 0 0 * * * tick — decoupled from
  // refresh-events extraction success (D-08 NIM-throttle resilience). Wrap
  // in try/catch so an eval failure never degrades the health response.
  let evalScore: {
    within5km: number;
    within20km: number;
    within100km: number;
    total: number;
  } | null = null;
  let evalError: string | null = null;
  try {
    evalScore = await runEval();
    log.info({ evalScore }, 'eval drift check complete');
  } catch (err) {
    evalError = err instanceof Error ? err.message : String(err);
    log.warn({ err: evalError }, 'eval drift check threw — continuing health response');
  }

  // Phase 28.2 Plan 03 Task 5 / B-2 — adversarial sub-eval folded in AFTER
  // the accuracy eval. Same daily 0 0 * * * tick produces both signals; no
  // new vercel.json cron entry needed (Hobby cap = 3 preserved). The merged
  // dashboard tab in Plan 05 reads `events:llm-eval-adversarial:v3` Redis
  // sidecar to render `Prompt-injection robustness: blocked/total`.
  let adversarialResult: AdversarialEvalResult | null = null;
  let adversarialError: string | null = null;
  try {
    adversarialResult = await runAdversarialEval();
    log.info({ adversarialResult }, 'adversarial sub-eval complete');
  } catch (err) {
    adversarialError = err instanceof Error ? err.message : String(err);
    log.warn({ err: adversarialError }, 'adversarial sub-eval threw — continuing health response');
  }

  // Phase 28.2.7 R1 D-03 — cron:lastTick:health writer. Write AFTER eval +
  // source-freshness checks succeed, so probe shows 'healthy' iff cron
  // actually completed its work. cacheSetSafe is degrade-open (Redis
  // failure swallowed; memCache populated). D-11: bare Date.now() value.
  await cacheSetSafe('cron:lastTick:health', Date.now(), CRON_LASTTICK_TTL_SEC);

  // Phase 45 DASH-READ-05 (CONTEXT D-01/D-02) — append ONE daily trend sample
  // to the bounded `dashboard:trends:history` ring AFTER the lastTick:health
  // write. This is the SOLE writer (no new cron — D-01). The whole append is
  // try/caught so a trend-write failure NEVER degrades the health response
  // (mirrors the eval/adversarial try/catch posture above).
  //
  // cronAgeMs is computed per cron from its `cron:lastTick:{name}` key: a present
  // tick yields `now - tickTs`; an ABSENT key yields `null` (degrade-open —
  // never fabricate 0; a stalled cron reads as null/stale, itself a valid
  // DASH-READ-05 signal per D-02). The tickTs read mirrors `probeCronTick`'s
  // `typeof entry.data === 'number' ? entry.data : entry.lastFresh` shape.
  try {
    const sampleNow = Date.now();
    const cronNames = ['health', 'warm', 'refresh-events'] as const;
    const ages = await Promise.all(
      cronNames.map(async (name) => {
        const entry = await cacheGetSafe<number>(`cron:lastTick:${name}`, 999_999_999);
        if (entry === null) return null;
        const tickTs = typeof entry.data === 'number' ? entry.data : entry.lastFresh;
        return sampleNow - tickTs;
      }),
    );

    // Dead-URL sidecar — same key + defensive coercion as operator-status.ts
    // (`Number(raw) || 0` + `Math.max(0, ...)` handles null/string/NaN/underflow).
    let deadUrlCount = 0;
    try {
      const raw = await redis.get<number | string>(URL_LIVENESS_COUNT_KEY);
      deadUrlCount = Math.max(0, Number(raw) || 0);
    } catch (err) {
      log.warn({ err }, 'failed to read events:url-liveness-count for trend sample');
    }

    await appendTrendSample({
      sampledAt: new Date(sampleNow).toISOString(),
      cronAgeMs: {
        // `?? null` collapses the `| undefined` that noUncheckedIndexedAccess
        // adds to these in-bounds tuple reads back to the degrade-open `null`
        // the TrendSample contract expects (absent → null, never fabricate).
        health: ages[0] ?? null,
        warm: ages[1] ?? null,
        'refresh-events': ages[2] ?? null,
      },
      deadUrlCount,
    });
  } catch (err) {
    log.warn({ err }, 'trend sample append threw — continuing health response');
  }

  res.json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk,
    timestamp: new Date().toISOString(),
    sources,
    warnings,
    evalScore,
    evalError,
    adversarialResult,
    adversarialError,
  });
});
