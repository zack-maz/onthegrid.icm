/**
 * Phase 28.2 D-08 + AI-SPEC §6 — per-Bearer replay quota.
 *
 * Caps `POST /api/events/llm-replay/:groupKey` at 50 calls per UTC day per
 * Bearer fingerprint. Beyond the cap, the route returns HTTP 429 with a
 * `Retry-After` header pointing to next UTC midnight so a single compromised
 * Bearer cannot drain the daily LLM token budget within minutes.
 *
 * Implementation mirrors server/lib/llmTokenBudget.ts INCR-with-TTL pattern:
 *   - INCR `operator:replay-quota:{fingerprint}:{YYYY-MM-DD}` on every call
 *   - When INCR returns 1 (first call of the day), EXPIRE the key to 48h
 *     so the UI gets a 24h lookback window even after rollover
 *   - Compare returned counter to the hard-coded cap (NOT env-tunable per
 *     CONTEXT D-09 "no new env-tunable surfaces")
 *
 * Bearer fingerprints are produced by server/lib/operatorAudit.bearerFingerprint
 * so audit log + quota counter share one identity model.
 *
 * Threat model: T-28.2-03-02 (DoS via daily token budget exhaustion).
 * 50 replays × ~2K input tokens = 100K tokens/day worst case = 10% of the
 * Cerebras free-tier 1M/day budget — well below blast-radius concern even
 * under full quota exhaustion.
 */

/** AI-SPEC §6 cap. Hard-coded per CONTEXT D-09 (no new env-tunable surfaces). */
const CAP = 50;

/** Redis key namespace for the per-day per-Bearer counter. */
const QUOTA_KEY_PREFIX = 'operator:replay-quota:';

/** TTL applied on the first INCR of each new day's key. */
const QUOTA_TTL_SEC = 48 * 3600;

/** Result of a single quota probe. */
export interface ReplayQuotaResult {
  /** false when the Bearer has exceeded the cap for this UTC day. */
  allowed: boolean;
  /** Counter value INCLUDING the current attempt (post-INCR). */
  used: number;
  /** AI-SPEC §6 hard cap (50). */
  cap: number;
  /** ISO timestamp of the next UTC midnight — when the counter rolls over. */
  resetsAt: string;
  /** Seconds until `resetsAt`. Always >= 1 (Math.ceil floor). Used for
   *  the HTTP `Retry-After` response header. */
  retryAfterSeconds: number;
}

/**
 * Probe + increment the per-Bearer quota counter for the current UTC day.
 * Always increments — calling this consumes one replay slot regardless of
 * whether the result is allowed. (The 51st call returns allowed:false with
 * `used: 51` so the operator can see they overshot by exactly one.)
 *
 * Caller is expected to short-circuit on `allowed === false` and respond
 * with HTTP 429 + `Retry-After: ${result.retryAfterSeconds}` header.
 */
export async function checkReplayQuota(fingerprint: string): Promise<ReplayQuotaResult> {
  // Lazy import so vitest mocks of '../cache/redis.js' apply consistently
  // with the rest of the test suite (matches llmDLQ.ts pattern).
  const { redis } = await import('../cache/redis.js');

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
  const key = `${QUOTA_KEY_PREFIX}${fingerprint}:${ymd}`;

  const used = await redis.incr(key);
  if (used === 1) {
    // First call of the day — set the 48h sliding TTL.
    await redis.expire(key, QUOTA_TTL_SEC);
  }

  // Compute next UTC midnight using UTC components (not local time).
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  const resetsAt = next.toISOString();
  const retryAfterSeconds = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));

  return {
    allowed: used <= CAP,
    used,
    cap: CAP,
    resetsAt,
    retryAfterSeconds,
  };
}
