/**
 * Phase 32 (Plan 32-01) — UrlLiveness schema + tiered TTL surface.
 *
 * Foundation module for the ghost-event URL liveness pipeline. This file
 * lands the Zod contract + TTL upper-bound helper + Redis key namespace
 * constants BEFORE any writer / reader exists so future commits in plans
 * 32-02..32-06 compile against a pinned surface and a `.strict()` schema
 * drift fails the next `vitest run`.
 *
 * Decisions implemented in this file:
 *   - D-19  Per-event Redis key shape: `events:url-liveness:{eventId}`
 *           with a JSON value `{status, lastProbedAt, attemptCount,
 *           lastUrlProbed, lastHttpStatus}`.
 *   - D-20  Tiered TTL by status: `live` → 7d, terminal-dead
 *           (`404`/`403`/`dead-host`) → 24h, `unknown` → 1h.
 *   - D-22  Schema is `z.object({...}).strict()` so extra keys / missing
 *           fields / unknown enum values all throw at parse time. The
 *           D-22 contract test (`server/__tests__/lib/urlLiveness.schema.test.ts`)
 *           pins this BEFORE Plan 02 adds the probe writer — silent shape
 *           drift fails the next `vitest run`.
 *
 * NOT in this file (lands in Plans 02 + 03):
 *   - `probeUrl` HTTP HEAD/GET primitive (Plan 02 Task 1; D-16/D-17/D-18/D-21).
 *   - `runProbeSweep` orchestrator + per-host throttle map (Plan 02 Tasks 2-5).
 *   - `pruneDeadUrlEvents` Redis splice + audit-log helper (Plan 03 Task 1).
 *   - `events:url-liveness-count` sidecar INCR/DECR (Plan 02 Task 3 +
 *     Plan 03 Task 1 jointly maintain the integer; the key constant is
 *     declared here as the canonical single source of truth).
 *
 * The unused `log` binding is pre-wired so Plans 02/03 do not need to
 * re-edit the imports — they consume `log.info`/`log.warn`/`log.error`
 * inside the probe + sweep + prune helpers.
 */

import { z } from 'zod';

import { logger } from './logger.js';

// ============================================================================
// Redis key namespace constants
// ============================================================================

/**
 * D-19 — per-event URL-liveness key family prefix. Callers append the
 * event ID: `${URL_LIVENESS_KEY_PREFIX}${eventId}` → `events:url-liveness:abc123`.
 * Written by the probe sweep (Plan 32-02), DEL'd by `pruneDeadUrlEvents`
 * (Plan 32-03). Tiered TTL per status — see `ttlSecForStatus` below.
 */
export const URL_LIVENESS_KEY_PREFIX = 'events:url-liveness:';

/**
 * Pitfall 3 mitigation — sidecar integer key. Count of events whose primary
 * URL has terminal-dead status. INCR on live→dead transitions, DECR on
 * dead→non-dead AND on prune. No TTL (persistent). Avoids N Redis GETs per
 * dashboard poll. Maintained by Plan 32-02 (probe writer) and Plan 32-03
 * (prune helper); read by Plan 32-04 (`/api/operator-status` aggregator).
 */
export const URL_LIVENESS_COUNT_KEY = 'events:url-liveness-count';

// ============================================================================
// Zod schema + types (D-22 contract — pinned BEFORE any writer exists)
// ============================================================================

/**
 * D-07 + D-19 — five-status taxonomy. Terminal-dead statuses
 * (`404`/`403`/`dead-host`) count toward the dashboard dead-URL count
 * and are eligible for prune. `unknown` (5xx, network blip, transient
 * error) is excluded from the count and re-probed on the next sweep
 * tick. `live` is live.
 */
export const UrlLivenessStatusSchema = z.enum(['live', '404', '403', 'dead-host', 'unknown']);
export type UrlLivenessStatus = z.infer<typeof UrlLivenessStatusSchema>;

/**
 * D-22 contract — `.strict()` rejects extra keys, missing fields, AND
 * unknown enum values at parse time. The matching contract test at
 * `server/__tests__/lib/urlLiveness.schema.test.ts` pins this so future
 * shape drift fails the next `vitest run`.
 */
export const UrlLivenessSchema = z
  .object({
    status: UrlLivenessStatusSchema,
    lastProbedAt: z.string().datetime(),
    /**
     * D-12 + 32-RESEARCH.md A2 — monotonic-with-reset-on-live-or-unknown
     * transition. Increment ONLY when the latest probe status is
     * terminal-dead AND the prior stored status was also terminal-dead
     * (or no prior). Reset to 0 on any `live` or `unknown` transition.
     *
     * Pure-monotonic accumulation would conflate dead→live→dead with
     * three-in-a-row-dead and falsely trigger D-12's cron auto-prune
     * `attemptCount >= 3` gate. The monotonic-with-reset rule makes the
     * "≥3 consecutive terminal-dead ticks" semantics a one-line check
     * inside the probe writer (Plan 32-02 Task 3).
     */
    attemptCount: z.number().int().nonnegative(),
    lastUrlProbed: z.string().url(),
    lastHttpStatus: z.number().int().nullable(),
  })
  .strict();

export type UrlLiveness = z.infer<typeof UrlLivenessSchema>;

// ============================================================================
// D-20 tiered TTL (per status)
// ============================================================================

/**
 * D-20 — TTL ceilings by status. Re-probe cadence proportional to verdict
 * confidence: live verdicts last a week (no need to re-confirm fresh
 * content frequently), terminal-dead verdicts re-confirm daily (so the
 * prune list stays current as publishers move URLs), unknown verdicts
 * re-probe hourly (push toward a terminal verdict fast).
 *
 * The TTL itself is the GC mechanism — there is no separate cleanup
 * pass. When the per-event key expires, the next sweep tick re-probes it.
 *
 * Schema test (Plan 32-01 Task 3) asserts each value here matches the
 * D-20 upper-bound, so silent ceiling raises fail loudly.
 */
const TTL_SEC_BY_STATUS: Record<UrlLivenessStatus, number> = {
  live: 7 * 24 * 3600, // D-20: 7 days
  '404': 24 * 3600, // D-20: 24 hours
  '403': 24 * 3600, // D-20: 24 hours
  'dead-host': 24 * 3600, // D-20: 24 hours
  unknown: 3600, // D-20: 1 hour
};

/**
 * Look up the TTL (in seconds) for a given liveness status. Pure
 * function — no Redis call, no side effects. Used by the probe writer
 * (Plan 32-02) when calling `cacheSetSafe(key, entry, ttlSecForStatus(status))`.
 */
export function ttlSecForStatus(status: UrlLivenessStatus): number {
  return TTL_SEC_BY_STATUS[status];
}

// ============================================================================
// Module-private log binding (pre-wired for Plans 02/03)
// ============================================================================

/**
 * Pino child logger for the urlLiveness module. Pre-declared here so
 * Plans 02/03 (probe + sweep + prune helpers) do not need to re-edit
 * imports. Unused at this surface — referenced by `void` below to keep
 * the eslint `no-unused-vars` rule quiet at zero-cost.
 */
const log = logger.child({ module: 'urlLiveness' });
// Reference the binding so eslint's `no-unused-vars` (and TS's
// `noUnusedLocals` if it ever flips on) stays quiet until Plans 02/03
// land their consumers. Zero runtime cost (a property read on
// `pino.Logger`).
void log;
