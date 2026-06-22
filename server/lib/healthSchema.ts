/**
 * Phase 28.1 W2 — Zod schema + inferred types for the GET /api/health
 * aggregate response.
 *
 * The schema is the single source of truth for the wire contract between
 * `server/routes/health.ts` (writer) and `src/hooks/useHealthStatus.ts`
 * (reader). The route runs `.parse(response)` in dev to fail loud on shape
 * drift; the client re-exports only the inferred TYPES (not the runtime
 * schema) via `src/lib/healthClient.ts`.
 *
 * `.strict()` mode rejects unknown fields — required by the Phase 27.4
 * canon (see `server/lib/llmSchema.ts` for precedent: every Zod object at
 * a network boundary uses `.strict()`).
 */

import { z } from 'zod';

/**
 * Four-state health enum derived per RESEARCH §Pattern 1:
 *   - healthy   = freshnessMs <= thresholdMs AND last probe succeeded
 *   - degraded  = thresholdMs < freshnessMs <= 2*thresholdMs
 *   - unhealthy = freshnessMs > 2*thresholdMs OR last probe threw
 *   - unknown   = freshnessMs === null AND no error history
 */
export const healthStatusEnum = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);
export type HealthStatus = z.infer<typeof healthStatusEnum>;

/**
 * Phase 46 HARD-02 (D-05) — Cron run-state SIBLING enum.
 *
 * This is a SEPARATE enum from `healthStatusEnum` BY DESIGN (Landmine 1/2,
 * Pitfall 1). The three-state cron run-detection signal (`unknown` =
 * pre-first-tick, `missed` = fired-then-silently-stopped, `healthy` =
 * within expected+grace) is surfaced on the cron endpoint rows via the
 * `missedRun` sibling field — NEVER folded into the wire `status` field.
 * `prod-connectivity-audit.yml` `okCron = ["healthy","degraded"].includes(
 * tierStatus.cron)` derives `tierStatus.cron` from the `status` enum; widening
 * `status` to carry `missed` would flip `okCron` and regress the LLM-RELI-07
 * milestone-close gate. The audit never reads `missedRun`.
 */
export const cronRunStateEnum = z.enum(['unknown', 'missed', 'healthy']);
export type CronRunState = z.infer<typeof cronRunStateEnum>;

/**
 * Endpoint-tier classification per CONTEXT D-26:
 *   - critical   → flights/ships/events (banner reaction)
 *   - non-critical → markets/news/water-precip/sources/llm-status (HUD dot)
 *   - static     → sites/water (log only; 24h-cached infrastructure)
 *   - probe-only → auth-check/geocode (200 check, no freshness concept)
 *   - cron       → cron-health/cron-warm/cron-refresh-events (banner only if all stale)
 */
export const healthTierEnum = z.enum(['critical', 'non-critical', 'static', 'probe-only', 'cron']);
export type HealthTier = z.infer<typeof healthTierEnum>;

/**
 * Per-endpoint health entry. One row per endpoint inventoried in W1
 * (`28.1-W1-AUDIT.md`). Static probes (auth-check/geocode) carry
 * `freshnessThresholdMs: 0` and `freshnessMs: null` — the status comes from
 * whether the probe call returned 200, not from cache age.
 */
export const endpointHealthSchema = z
  .object({
    name: z.string(),
    status: healthStatusEnum,
    tier: healthTierEnum,
    /** Unix ms of the last successful probe; null when never seen. */
    lastSuccessTs: z.number().nullable(),
    /** Sanitized error message from the last failed probe; null when last probe succeeded. */
    lastErrorReason: z.string().nullable(),
    /** Age of the cache entry / live state, in ms. null = no data observed yet. */
    freshnessMs: z.number().nullable(),
    /** D-25 freshness budget per endpoint. 0 for probe-only endpoints. */
    freshnessThresholdMs: z.number().int().nonnegative(),
    /** Probe round-trip duration; null when the probe failed before measurement. */
    latencyMs: z.number().nullable(),
    /**
     * Phase 46 HARD-02 — cron run-state SIBLING field (D-05). Present ONLY on
     * cron-tier rows; non-cron rows omit it. `.optional()` so old clients /
     * non-cron rows still parse under `.strict()`. This is the missed-run
     * signal — `status` stays in the 4-state `healthStatusEnum` and never
     * carries `missed` (Pitfall 1 / okCron audit-gate safety).
     */
    missedRun: cronRunStateEnum.optional(),
  })
  .strict();
export type EndpointHealth = z.infer<typeof endpointHealthSchema>;

/**
 * Per-tier rollup counts. Used by the DevApiStatus "All APIs" tab to render
 * tier-grouped row separators with per-tier health summaries, and by
 * HealthBanner to short-circuit when `summary.critical.unhealthy === 0`.
 */
const tierRollupSchema = z
  .object({
    healthy: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    unhealthy: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Probe-only tier has no degraded state — the endpoint is either reachable
 * or unreachable. Modeled separately so the tier rollup matches the
 * deriveStatus contract for that tier.
 */
const probeOnlyRollupSchema = z
  .object({
    healthy: z.number().int().nonnegative(),
    unhealthy: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();

export const healthResponseSchema = z
  .object({
    /** Map keyed by endpoint name (matches SOURCE_KEYS keys + non-cache endpoints). */
    endpoints: z.record(z.string(), endpointHealthSchema),
    summary: z
      .object({
        critical: tierRollupSchema,
        nonCritical: tierRollupSchema,
        static: tierRollupSchema,
        probeOnly: probeOnlyRollupSchema,
        cron: tierRollupSchema,
      })
      .strict(),
    /** Unix ms when the route handler assembled this response. */
    generatedAt: z.number(),
  })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;
