/**
 * Phase 32 D-15 — per-Bearer prune quota.
 *
 * Caps `POST /api/events/prune-dead-urls` at 50 calls per UTC day per
 * Bearer fingerprint. Beyond the cap, the route returns HTTP 429 with a
 * `Retry-After` header pointing to next UTC midnight so a single
 * compromised Bearer cannot drain the event cache within minutes.
 *
 * Mirrors server/lib/replayQuota.ts verbatim per CONTEXT D-15
 * ("consistency-with-existing-pattern wins"). The only behavioral
 * differences from replayQuota are:
 *   - Redis key prefix: `operator:prune-quota:` (distinct namespace)
 *   - JSDoc references the prune endpoint (Plan 32-03) rather than llm-replay
 *   - Type / function names: PruneQuotaResult / checkPruneQuota
 *
 * All other values are identical:
 *   - CAP = 50 (matches replayQuota — D-15 explicit "50/24h matches /llm-replay")
 *   - QUOTA_TTL_SEC = 48h sliding window (24h lookback + 24h buffer)
 *   - INCR-then-EXPIRE-on-first-call idiom
 *   - UTC midnight reset calculation via Date.UTC()
 *   - Lazy `await import('../cache/redis.js')` so vitest mocks of the
 *     redis module apply consistently with the rest of the test suite
 *     (matches replayQuota.ts:61 + llmDLQ.ts pattern)
 *
 * Implementation mirrors server/lib/llmTokenBudget.ts INCR-with-TTL
 * pattern:
 *   - INCR `operator:prune-quota:{fingerprint}:{YYYY-MM-DD}` on every call
 *   - When INCR returns 1 (first call of the day), EXPIRE the key to 48h
 *     so the UI gets a 24h lookback window even after rollover
 *   - Compare returned counter to the hard-coded cap (NOT env-tunable per
 *     CONTEXT D-09 "no new env-tunable surfaces")
 *
 * Bearer fingerprints are produced by server/lib/operatorAudit.bearerFingerprint
 * so audit log + quota counter share one identity model. The cron
 * trigger (Plan 32-03) uses the literal string `'cron:refresh-events'` as
 * its fingerprint per CONTEXT D-11 and bypasses this quota entirely
 * (system caller — not subject to operator-tier rate limiting).
 *
 * Threat model: T-32-09 (DoS via prune endpoint flooding). 50 prunes ×
 * Redis splice ops is well below any single-Bearer blast-radius concern;
 * the cap is set for consistency with /llm-replay rather than security
 * minimum.
 */

/** CONTEXT D-15 cap. Hard-coded per "no new env-tunable surfaces". */
const CAP = 50;

/** Redis key namespace for the per-day per-Bearer counter. */
const QUOTA_KEY_PREFIX = 'operator:prune-quota:';

/** TTL applied on the first INCR of each new day's key. */
const QUOTA_TTL_SEC = 48 * 3600;

/** Result of a single quota probe. */
export interface PruneQuotaResult {
  /** false when the Bearer has exceeded the cap for this UTC day. */
  allowed: boolean;
  /** Counter value INCLUDING the current attempt (post-INCR). */
  used: number;
  /** CONTEXT D-15 hard cap (50). */
  cap: number;
  /** ISO timestamp of the next UTC midnight — when the counter rolls over. */
  resetsAt: string;
  /** Seconds until `resetsAt`. Always >= 1 (Math.ceil floor). Used for
   *  the HTTP `Retry-After` response header. */
  retryAfterSeconds: number;
}

/**
 * Probe + increment the per-Bearer quota counter for the current UTC day.
 * Always increments — calling this consumes one prune slot regardless of
 * whether the result is allowed. (The 51st call returns allowed:false
 * with `used: 51` so the operator can see they overshot by exactly one.)
 *
 * Caller is expected to short-circuit on `allowed === false` and respond
 * with HTTP 429 + `Retry-After: ${result.retryAfterSeconds}` header.
 *
 * NOTE: mirrors server/lib/replayQuota.ts; consistency-with-existing-pattern
 * per CONTEXT D-15. If a future incident requires diverging caps (e.g.
 * tighter destructive-action limit), this is the file to edit — and the
 * test in `server/__tests__/lib/pruneQuota.test.ts` is the regression
 * guardrail.
 */
export async function checkPruneQuota(fingerprint: string): Promise<PruneQuotaResult> {
  // Lazy import so vitest mocks of '../cache/redis.js' apply consistently
  // with the rest of the test suite (matches replayQuota.ts:61 pattern).
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
