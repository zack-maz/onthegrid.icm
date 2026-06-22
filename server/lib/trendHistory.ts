/**
 * Phase 45 DASH-READ-05 — Server-backed bounded trend-history ring.
 *
 * Backs the four dashboard trend sparklines (CONTEXT D-02): one daily sample
 * carries the freshness age of all three crons (health / warm / refresh-events)
 * plus the terminal-dead URL count. The ring is written ONCE-DAILY by the
 * EXISTING `/api/cron/health` handler (CONTEXT D-01 — no new cron) and read
 * through the EXISTING `/api/operator-status` aggregator (no new endpoint).
 *
 * This module is a verbatim structural copy of `server/lib/llmRunHistory.ts`:
 * same bounded LPUSH+LTRIM ring, same dual-shape `parseEntry`, same degrade-open
 * posture (every Redis call try/caught; this module NEVER throws). It reads as
 * "the same kind of thing" to a maintainer (CONTEXT specifics).
 *
 * Bounded at 30 entries (`TREND_MAX`, CONTEXT D-03 — one month of daily samples)
 * via native LTRIM; 30d TTL (`TREND_TTL_SEC`), matching `llm:runs:history`
 * retention exactly.
 *
 * Registry note (for the Phase 49 registry sweep): the Redis key is
 * `dashboard:trends:history` — a bounded LPUSH+LTRIM 30-cap / 30d-TTL ring in
 * the same family as `llm:calls:history` / `llm:runs:history` /
 * `events:llm-pipeline-audit`.
 */

import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

const log = logger.child({ module: 'trend-history' });

/** Redis key for the trend-history ring (LPUSH+LTRIM 30-cap, 30d TTL). */
export const TREND_HISTORY_KEY = 'dashboard:trends:history';
/** CONTEXT D-03 — one month of daily samples. */
export const TREND_MAX = 30;
/** 30d TTL — matches `llm:runs:history` retention exactly. */
export const TREND_TTL_SEC = 30 * 24 * 3600;

/**
 * One daily trend sample. `cronAgeMs` carries the freshness age (ms since the
 * last successful tick) of each cron at sample time; `null` means the cron's
 * `cron:lastTick:{name}` key was absent (degrade-open — a stalled cron reads as
 * null/stale, which is itself a valid DASH-READ-05 signal per CONTEXT D-02, NOT
 * a fabricated 0). `deadUrlCount` is the O(1) `events:url-liveness-count`
 * sidecar value at sample time.
 */
export interface TrendSample {
  /** ISO8601 timestamp of when this sample was taken. */
  sampledAt: string;
  cronAgeMs: {
    health: number | null;
    warm: number | null;
    'refresh-events': number | null;
  };
  deadUrlCount: number;
}

/**
 * Parse a list member that may be JSON text or an already-deserialized object
 * (Upstash REST dual-shape — copied from `llmRunHistory.ts`).
 */
function parseEntry(raw: unknown): TrendSample | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as TrendSample;
    if (raw && typeof raw === 'object') return raw as TrendSample;
    return null;
  } catch {
    return null;
  }
}

/**
 * LPUSH a sample, then LTRIM to the 30 newest and refresh the 30d TTL — all in
 * ONE Upstash REST round-trip via `redis.pipeline()` (Phase 45 WR-02). The three
 * commands now execute atomically, removing the partial-write TTL gap: a kill
 * between lpush and expire previously left a no-TTL key, and a kill between lpush
 * and ltrim left the ring transiently at 31 entries. The reader still caps at
 * `TREND_MAX - 1`, so the cap-30 bound (ltrim 0..29) stays pinned.
 *
 * Degrade-open: any Redis throw is logged and swallowed; this NEVER throws
 * (mirrors `pushRecord`).
 */
export async function appendTrendSample(sample: TrendSample): Promise<void> {
  try {
    await redis
      .pipeline()
      .lpush(TREND_HISTORY_KEY, JSON.stringify(sample)) // newest at head
      .ltrim(TREND_HISTORY_KEY, 0, TREND_MAX - 1) // native bounded ring (cap 30 → 0..29)
      .expire(TREND_HISTORY_KEY, TREND_TTL_SEC)
      .exec();
  } catch (err) {
    log.warn({ err }, 'trendHistory append failed'); // never throw
  }
}

/**
 * Return up to `limit` trend samples, newest first. Parses both raw-string and
 * already-object Upstash REST shapes; filters unparseable entries. Degrade-open
 * → [] on Redis failure (copied from `listRunHistory` minus the dedupe — trend
 * samples have no dedupe key).
 */
export async function readTrendHistory(limit = TREND_MAX): Promise<TrendSample[]> {
  try {
    const raw = await redis.lrange(TREND_HISTORY_KEY, 0, limit - 1);
    return raw.map((r) => parseEntry(r)).filter((x): x is TrendSample => x !== null);
  } catch {
    return [];
  }
}
