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
import type { Provider as BreakerProvider } from './llmCircuitBreaker.js';

const log = logger.child({ module: 'llm-token-budget' });

// Phase 27.4.3 (D-04): re-export the widened breaker Provider so callers that
// hold a `Provider` from llmCircuitBreaker can pass it to budget functions
// without an extra cast. The v3 cascade (server/lib/freeClaudeRouter.ts) does
// NOT use llmTokenBudget — D-04 retired this module from the v3 path. The
// nvidia_nim/openrouter limits below are zero-cost type-compat defaults that
// resolve to budgetState='hard' if ever invoked, which would safely skip the
// provider rather than corrupt counters.
export type Provider = BreakerProvider;

/** Daily token ceilings per provider (free tier). */
export const DAILY_LIMITS: Record<Provider, number> = {
  cerebras: 1_000_000,
  groq: 200_000,
  // Phase 27.4.3: v3 path uses freeClaudeRouter, not this module. These zero
  // limits are present purely for Record<Provider, number> exhaustiveness
  // and would force a 'hard' budgetState if ever invoked — safe fail-closed.
  nvidia_nim: 0,
  openrouter: 0,
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

// ---------------------------------------------------------------------------
// Phase 27.4 D-33 / D-35 — soft-cap helpers for Plan 06's events.ts handler.
//
// The callLLM adapter already handles the 'hard' cap path (D-34) by returning
// null when both providers are hard-capped, which triggers graceful
// degradation to raw GDELT. The two helpers below cover the 'soft' band:
//
//   shouldPauseNewEvents()  — D-33: return true when EITHER provider is soft-
//                             capped; handler serves cached LLM entities
//                             instead of enqueuing new extractions.
//   prioritizeBySeverity()  — D-35: reorder EventGroups so the BATCH_SIZE
//                             slice consumed by processEventGroupsV2 contains
//                             the highest-severity events; no-op when not
//                             soft-capped to avoid overhead on the hot path.
// ---------------------------------------------------------------------------

import type { EventGroup } from './eventGrouping.js';
import type { ConflictEventEntity, ConflictEventType } from '../types.js';

/**
 * Type-based severity weights for conflict event types. Same weights as the
 * client-side `src/lib/severity.ts` so the two scorers agree qualitatively.
 * Duplicated on purpose — server code avoids reaching into `src/`.
 */
const TYPE_WEIGHTS: Record<ConflictEventType, number> = {
  airstrike: 10,
  explosion: 8,
  targeted: 8,
  on_ground: 6,
  other: 3,
};

/**
 * Severity score for a single ConflictEventEntity.
 *
 * Formula mirrors computeSeverityScore() in src/lib/severity.ts but runs in
 * the server without the cross-boundary import:
 *   typeWeight * log2(1 + mentions) * log2(1 + sources) * recencyDecay
 * where recencyDecay = 1 / (1 + ageHours / 24).
 */
function scoreEntity(e: ConflictEventEntity): number {
  const typeWeight = TYPE_WEIGHTS[e.type] ?? 3;
  const mentions = e.data.numMentions ?? 1;
  const sources = e.data.numSources ?? 1;
  const ageHours = Math.max(0, (Date.now() - e.timestamp) / 3_600_000);
  const recency = 1 / (1 + ageHours / 24);
  return typeWeight * Math.log2(1 + mentions) * Math.log2(1 + sources) * recency;
}

/**
 * Severity score for an event group — max across its entities so a group
 * containing one high-severity event doesn't hide behind low-severity noise.
 */
export function computeSeverityScore(group: EventGroup): number {
  if (group.entities.length === 0) return 0;
  let best = 0;
  for (const e of group.entities) {
    const s = scoreEntity(e);
    if (s > best) best = s;
  }
  return best;
}

/**
 * D-33: Pause new-event LLM processing whenever EITHER provider is in the
 * soft-cap state (>= 80% of daily budget). Events.ts reads this once per
 * /api/events cycle; when true the handler serves cached entities and logs
 * LLM_PAUSED_SOFT_CAP. Hard cap (D-34) is already handled by callLLM
 * returning null for fallback to raw GDELT — this helper is the soft-cap-
 * specific gate so cached LLM data keeps serving even while extraction
 * pauses.
 */
export async function shouldPauseNewEvents(): Promise<boolean> {
  const [cerebrasUsed, groqUsed] = await Promise.all([
    getDailyTokens('cerebras'),
    getDailyTokens('groq'),
  ]);
  return (
    budgetState('cerebras', cerebrasUsed) === 'soft' || budgetState('groq', groqUsed) === 'soft'
  );
}

/**
 * D-35: Under soft-cap, reorder event groups so the BATCH_SIZE slice
 * consumed by processEventGroupsV2 contains the highest-severity events.
 * No-op when both providers are 'ok' to avoid overhead in the common case.
 *
 * Ties broken by timestamp desc so newest high-severity events run first
 * when scores are equal.
 */
export async function prioritizeBySeverity(groups: EventGroup[]): Promise<EventGroup[]> {
  const paused = await shouldPauseNewEvents();
  if (!paused) return groups; // common case — skip sort entirely
  return groups
    .slice()
    .sort((a, b) => computeSeverityScore(b) - computeSeverityScore(a) || b.timestamp - a.timestamp);
}
