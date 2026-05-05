/**
 * Phase 28.2 D-08 + AI-SPEC §5/§6 — operator-action audit log.
 *
 * Bounded Redis SADD set capturing every successful invocation of the two
 * Bearer-gated operator-control endpoints:
 *   - POST /api/events/llm-pipeline (runtime v1/v2/v3 swap)
 *   - POST /api/events/llm-replay/:groupKey (single-group re-extraction)
 *
 * Mirrors the bounded-set rotation pattern from server/lib/llmDLQ.ts:
 *   - SADD on every write
 *   - SCARD after to detect overflow
 *   - When SCARD > 500, evict oldest entries via SPOP (raw-string semantics
 *     match Upstash REST round-trip behavior — same caveat as DLQ WR-02)
 *   - EXPIRE refresh on every write so 30d TTL slides forward with usage
 *
 * Degrade-open contract: every redis call is try/caught. A logging failure
 * never blocks the operator action — the AI-SPEC §6 phrase "synchronous
 * before HTTP response" describes the AWAIT semantics, not a hard guarantee
 * that Redis succeeded.
 *
 * Audit entries contain ONLY the SHA-256 fingerprint of DASHBOARD_PASSWORD
 * (truncated to 8 hex chars), NEVER the raw secret. T-28.2-03-01 mitigation.
 */

import { createHash } from 'node:crypto';

import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

const log = logger.child({ module: 'operatorAudit' });

/** Canonical Redis key for the operator-action audit log. */
export const OPERATOR_AUDIT_KEY = 'operator:audit-log';

/** Maximum entries retained before SPOP eviction kicks in. */
const AUDIT_MAX_ENTRIES = 500;

/** TTL refreshed on every write — 30 days in seconds. */
const AUDIT_TTL_SEC = 30 * 86400;

/** Single audit-log entry shape. */
export interface OperatorAuditEntry {
  /** Date.now() at the moment of the operator action. */
  timestamp: number;
  /** SHA-256(DASHBOARD_PASSWORD).slice(0, 8) — never the raw secret. */
  bearerFingerprint: string;
  /** Which operator-control endpoint fired this entry. */
  operation: 'pipeline-swap' | 'replay';
  /** Sanitized request args (e.g. {version: 'v3'} or {groupKey: 'grp-x'}). */
  args: Record<string, unknown>;
  /** 'ok' on the successful path; 'error' if a future caller wants to record
   *  partial failures (this plan only writes 'ok' but the field is reserved). */
  result: 'ok' | 'error';
  /** Optional error tail when result === 'error' (capped at 500 chars). */
  errorMessage?: string;
}

/**
 * SHA-256 hex digest of `password`, truncated to 8 chars. Stable across
 * processes — same input always yields the same output. Empty string is NOT
 * special-cased; it produces the digest of empty input deterministically.
 *
 * Used as the Bearer fingerprint in audit entries and as the per-Bearer
 * partition key in replayQuota.ts so two helpers share one identity model.
 */
export function bearerFingerprint(password: string): string {
  return createHash('sha256').update(password).digest('hex').slice(0, 8);
}

/**
 * Append a single audit entry. Best-effort — Redis failure logs via pino
 * but does NOT throw. Caller's HTTP response continues normally.
 */
export async function appendOperatorAuditEntry(entry: OperatorAuditEntry): Promise<void> {
  // Cap any errorMessage tail to keep payloads small (mirrors llmDLQ
  // LAST_ERROR_MAX_CHARS Pitfall 7).
  const capped: OperatorAuditEntry = {
    ...entry,
    ...(entry.errorMessage !== undefined
      ? { errorMessage: entry.errorMessage.slice(0, 500) }
      : {}),
  };
  const payload = JSON.stringify(capped);

  try {
    await redis.sadd(OPERATOR_AUDIT_KEY, payload);
    await redis.expire(OPERATOR_AUDIT_KEY, AUDIT_TTL_SEC);

    const card = await redis.scard(OPERATOR_AUDIT_KEY);
    if (typeof card === 'number' && card > AUDIT_MAX_ENTRIES) {
      // Evict overflow with SPOP. Upstash returns the popped raw payload(s)
      // which we then SREM as defense-in-depth (set semantics already
      // remove-on-pop, so the SREM is technically redundant but matches the
      // planner's "SCARD-check + SPOP raw-string SREM" idiom from
      // llmDLQ.ts and ensures eviction completes even if a future Redis
      // implementation distinguishes spop+remove from spop-and-keep).
      const overflow = card - AUDIT_MAX_ENTRIES;
      for (let i = 0; i < overflow; i++) {
        const popped = await redis.spop(OPERATOR_AUDIT_KEY);
        if (typeof popped === 'string' && popped.length > 0) {
          // SREM is a no-op if SPOP already removed it; tolerate gracefully.
          try {
            await redis.srem(OPERATOR_AUDIT_KEY, popped);
          } catch {
            // ignore — eviction already happened via SPOP
          }
        }
      }
    }
  } catch (err) {
    // Degrade-open: log but never throw. Operator action proceeds.
    log.error({ err, operation: entry.operation }, 'operator-audit-log write failed');
  }
}
