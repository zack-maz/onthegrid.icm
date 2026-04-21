/**
 * Phase 27.4 D-32..D-35: Per-provider daily token budget.
 *
 * Redis key `llm:tokens:{provider}:YYYY-MM-DD` (UTC date). 48h hard TTL
 * gives the UI a 24h lookback after rollover. Atomicity assumption per
 * RESEARCH.md A3 — Upstash multi() pipeline is sufficient for near-real-time
 * counters (race margin ~1-2%, acceptable at 80%/95% thresholds).
 */

import { redis } from '../cache/redis.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'llm-token-budget' });

export type Provider = 'cerebras' | 'groq';

/** Daily token ceilings per provider (free tier). */
export const DAILY_LIMITS: Record<Provider, number> = {
  cerebras: 1_000_000,
  groq: 200_000,
};

const TTL_48H_SEC = 172_800;
const SOFT_CAP_RATIO = 0.8;
const HARD_CAP_RATIO = 0.95;

export function todayKey(provider: Provider): string {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  return `llm:tokens:${provider}:${today}`;
}

export async function incrDailyTokens(provider: Provider, n: number): Promise<number> {
  if (n <= 0) return await getDailyTokens(provider);
  try {
    const key = todayKey(provider);
    const res = (await redis
      .multi()
      .incrby(key, n)
      .expire(key, TTL_48H_SEC)
      .exec()) as unknown as unknown[];
    const newVal = Array.isArray(res) ? (res[0] as number | undefined) : undefined;
    return typeof newVal === 'number' ? newVal : 0;
  } catch (err) {
    log.warn({ err, provider, n }, 'incrDailyTokens failed (redis unreachable)');
    return 0;
  }
}

export async function getDailyTokens(provider: Provider): Promise<number> {
  try {
    const v = await redis.get<number>(todayKey(provider));
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

export function budgetState(provider: Provider, used: number): 'ok' | 'soft' | 'hard' {
  const limit = DAILY_LIMITS[provider];
  if (used >= limit * HARD_CAP_RATIO) return 'hard';
  if (used >= limit * SOFT_CAP_RATIO) return 'soft';
  return 'ok';
}
