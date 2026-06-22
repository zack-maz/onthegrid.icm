/**
 * Phase 46 CRON-WATCH-01 — Server-backed bounded cron-stability watch ring.
 *
 * Backs the NON-BLOCKING 7-day cron-stability watch (CONTEXT D-07/D-08/D-09):
 * one daily sample carries the freshness age of all three crons (health / warm
 * / refresh-events), the eval bundle (5/20/100km), DLQ count, breaker trips, and
 * a PASS/FAIL verdict. The ring is written ONCE-DAILY by the EXISTING
 * `/api/cron/health` handler (CONTEXT D-07 — no new cron, no new endpoint) and
 * read through `readWatchHistory` + mirrored to the human-readable `46-WATCH.md`
 * artifact (the dated ring is the source of truth; the artifact is the readable
 * mirror).
 *
 * This module is a verbatim structural copy of `server/lib/trendHistory.ts`
 * (itself a verbatim copy of `llmRunHistory.ts`): same bounded `redis.pipeline()`
 * LPUSH+LTRIM+EXPIRE ring, same dual-shape `parseEntry`, same degrade-open
 * posture (every Redis call try/caught; this module NEVER throws — a watch-write
 * failure must NEVER degrade the `/api/cron/health` response, Pitfall 4). It
 * reads as "the same kind of thing" to a maintainer.
 *
 * Bounded at 14 entries (`CRON_WATCH_MAX`, CONTEXT D-07 — the 7-day watch + a
 * one-week buffer, within the documented 7–14 bound) via native LTRIM; ~30d TTL
 * (`CRON_WATCH_TTL_SEC`), matching the `trendHistory` / `llm:runs:history`
 * retention family.
 *
 * Registry note: the Redis key is `cron:watch:v2.0` — a bounded LPUSH+LTRIM
 * 14-cap / ~30d-TTL ring in the same family as `dashboard:trends:history` /
 * `llm:calls:history` / `llm:runs:history`. Registered in CLAUDE.md.
 */

import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

const log = logger.child({ module: 'cron-watch' });

/** Redis key for the cron-stability watch ring (LPUSH+LTRIM 14-cap, ~30d TTL). */
export const CRON_WATCH_KEY = 'cron:watch:v2.0';
/** CONTEXT D-07 — the 7-day watch + a one-week buffer (within the 7–14 bound). */
export const CRON_WATCH_MAX = 14;
/** ~30d TTL — matches the `dashboard:trends:history` / `llm:runs:history` family. */
export const CRON_WATCH_TTL_SEC = 30 * 24 * 3600;

/**
 * One daily cron-stability watch sample. Modeled on the v1.5 Phase 31
 * `watch-log.json` row. `cronAgeMs` carries the freshness age (ms since the last
 * successful tick) of each cron at sample time; `null` means the cron's
 * `cron:lastTick:{name}` key was absent (degrade-open — a stalled cron reads as
 * null/stale, itself a valid signal, NOT a fabricated 0). `eval` is the
 * resolver-only accuracy bundle already computed by the health handler. `result`
 * is the rolled-up PASS/FAIL verdict for the day.
 */
export interface WatchSample {
  /** ISO8601 timestamp of when this sample was taken. */
  sampledAt: string;
  /** UTC calendar date (YYYY-MM-DD) of the tick — one row per natural cron day. */
  tickDate: string;
  cronAgeMs: {
    health: number | null;
    warm: number | null;
    'refresh-events': number | null;
  };
  eval: {
    at5km: number;
    at20km: number;
    at100km: number;
  };
  dlqCount: number;
  breakerTrips: number;
  result: 'PASS' | 'FAIL';
}

/**
 * Parse a list member that may be JSON text or an already-deserialized object
 * (Upstash REST dual-shape — copied from `trendHistory.ts`).
 */
function parseEntry(raw: unknown): WatchSample | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as WatchSample;
    if (raw && typeof raw === 'object') return raw as WatchSample;
    return null;
  } catch {
    return null;
  }
}

/**
 * LPUSH a sample, then LTRIM to the 14 newest and refresh the ~30d TTL — all in
 * ONE Upstash REST round-trip via `redis.pipeline()` (Phase 45 WR-02). The three
 * commands execute atomically, removing the partial-write TTL gap: a kill between
 * lpush and expire would otherwise leave a no-TTL key, and a kill between lpush
 * and ltrim would leave the ring transiently at 15 entries. The reader caps at
 * `CRON_WATCH_MAX - 1`, so the cap-14 bound (ltrim 0..13) stays pinned.
 *
 * Degrade-open: any Redis throw is logged and swallowed; this NEVER throws
 * (mirrors `appendTrendSample`). The caller (cron-health.ts) additionally wraps
 * this in its own try/catch so a watch-write failure can never degrade the
 * health-cron response (Pitfall 4).
 */
export async function appendWatchSample(sample: WatchSample): Promise<void> {
  try {
    await redis
      .pipeline()
      .lpush(CRON_WATCH_KEY, JSON.stringify(sample)) // newest at head
      .ltrim(CRON_WATCH_KEY, 0, CRON_WATCH_MAX - 1) // native bounded ring (cap 14 → 0..13)
      .expire(CRON_WATCH_KEY, CRON_WATCH_TTL_SEC)
      .exec();
  } catch (err) {
    log.warn({ err }, 'cronWatch append failed'); // never throw
  }
}

/**
 * Return up to `limit` watch samples, newest first. Parses both raw-string and
 * already-object Upstash REST shapes; filters unparseable entries. Degrade-open
 * → [] on Redis failure (copied from `readTrendHistory`).
 */
export async function readWatchHistory(limit = CRON_WATCH_MAX): Promise<WatchSample[]> {
  try {
    const raw = await redis.lrange(CRON_WATCH_KEY, 0, limit - 1);
    return raw.map((r) => parseEntry(r)).filter((x): x is WatchSample => x !== null);
  } catch {
    return [];
  }
}
