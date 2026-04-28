// ---------------------------------------------------------------------------
// LLM Pipeline Progress Tracking
//
// Module-level singleton tracking the state of the fire-and-forget LLM
// enrichment pipeline. On Vercel Fluid Compute, module-level state survives
// warm starts. Cold starts reset to idle; Redis summary provides fallback.
// ---------------------------------------------------------------------------

import type { GeocodeProvenance } from './llmSchema.js';
import type { Provider } from './llmCircuitBreaker.js';

/**
 * Live progress state for the LLM enrichment pipeline.
 * Tracks stage transitions and batch/geocode completion counts.
 *
 * Phase 27.4 extensions (D-19, D-20, D-22, D-23, D-30, D-31, D-32, D-39)
 * are all OPTIONAL so pre-27.4 callers that instantiate LLMPipelineProgress
 * with only the v1 fields remain type-compatible. New observability data
 * (call history, token counters, DLQ, breaker, eval, provenance, suspects)
 * is surfaced to DevApiStatus through /api/events/llm-status.
 */
export interface LLMPipelineProgress {
  stage: 'idle' | 'grouping' | 'llm-processing' | 'geocoding' | 'done' | 'error';
  startedAt: number | null;
  completedAt: number | null;

  // Grouping stage
  totalGroups: number;
  newGroups: number;

  // LLM processing stage
  totalBatches: number;
  completedBatches: number;

  // Geocoding stage
  totalGeocodes: number;
  completedGeocodes: number;

  // Results
  enrichedCount: number;
  errorMessage: string | null;
  durationMs: number | null;

  // ---------------------------------------------------------------------
  // Phase 27.4 extensions — all optional so v1 readers continue to work.
  // ---------------------------------------------------------------------

  /**
   * D-39: which extractor schema produced this run. (Added in Plan 01.)
   * Phase 27.4.3 Plan 02a: widened to include 'v3' for the free-claude-code
   * routing pipeline (NVIDIA NIM / OpenRouter cascade). v3 cache writes set
   * this field so /llm-status consumers can branch on it.
   */
  schemaVersion?: 'v1' | 'v2' | 'v3';

  /**
   * D-19: last N=20 LLM calls (shift-append). Populated via updateProgress.
   *
   * `skipReason` marks synthetic entries for skipped attempts that never touched
   * the network (breaker paused, hard-cap budget, no client configured). These
   * are logged so DevApiStatus can explain `completedBatches=N, enrichedCount=0`
   * outcomes instead of presenting an empty call history with no diagnosis.
   *
   * Phase 27.4.3 Plan 02a:
   * - `provider` widened to include 'nvidia_nim' | 'openrouter' (v3 routers).
   *   Inline literal kept here (not the breaker `Provider` re-export) so
   *   /llm-status JSON consumers see the same string union as the wire type.
   * - `routingReason` added to surface the v3 fall-through cascade ('primary'
   *   for first-try, 'fall_through:<reason>' for subsequent providers).
   * - `skipReason` widened with two v3-specific values ('rate_limit_window',
   *   'daily_cap') so synthetic skip entries from the v3 RollingWindow
   *   limiter and per-provider daily caps render distinctly.
   * - 'watchdog-soft-warn' added to skipReason — Phase 27.4.1 added a
   *   synthetic call-history entry under that exact label; including it on
   *   the type contract here drops the ad-hoc `as const` at the writer site.
   */
  callHistory?: Array<{
    // Phase 27.4.3 (D-09 + Plan 02a): inline literal union covering all four
    // providers. Kept inline (not `Provider`) so the JSON serialization of
    // /llm-status matches the wire type 1:1 — clients import this same union.
    provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    /** v3 routing trace: 'primary' for first-try, 'fall_through:<reason>' for cascade hops. */
    routingReason?: 'primary' | string;
    skipReason?:
      | 'breaker'
      | 'hard_cap'
      | 'no_client'
      | 'rate_limit_window'
      | 'daily_cap'
      | 'watchdog-soft-warn';
  }>;

  /** D-32: per-provider daily token counters mirrored from Redis for fast read. */
  tokenCounters?: { cerebras: number; groq: number };

  /** D-30: bounded DLQ size for DevApiStatus badge. */
  dlqCount?: number;

  /**
   * D-31: sliding-window circuit-breaker state per provider.
   * Phase 27.4.3 (D-09): widened to all four providers; getBreakerState now
   * returns nvidia_nim + openrouter alongside cerebras + groq.
   */
  breakerState?: Record<Provider, 'ok' | 'paused'>;

  /** D-20: latest eval harness score (also written to Redis summary on completion). */
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };

  /** D-22 aggregate: counts per resolver provenance path for DevApiStatus pie. */
  provenanceCounts?: Partial<Record<GeocodeProvenance, number>>;

  /** D-23: derived "suspect" event count for last run. */
  suspectCount?: number;

  /** Phase 27.4.1 D-06: count of batches killed by the timeout watchdog in current run. */
  watchdogTimeoutCount?: number;

  // ---------------------------------------------------------------------
  // Phase 27.4.4 — v3 latency-remediation observability fields. All optional
  // + additive; v2 readers ignore unknown fields. Populated by the v3
  // extractor when adaptive batching / lineage pre-filter / cold-start
  // pre-warm fire (Tasks 6 / 7 / 8 of Plan 01). The 3 DevApiStatus cells
  // (Task 10) consume these field clusters in a single atomic commit.
  // ---------------------------------------------------------------------

  /** D-04 — adaptive split-on-timeout counters. splitCount = batches the helper
   *  was called for; retrySuccess/retryFail = groups whose split half passed/failed;
   *  dlqEnqueueCount = entries the helper enqueued with v3:adaptive-retry-fail. */
  adaptiveBatchStats?: {
    splitCount: number;
    retrySuccess: number;
    retryFail: number;
    dlqEnqueueCount: number;
  };
  /** D-04 — mirrors env.V3_ADAPTIVE_BATCH at run start so the dashboard cell
   *  shows active state even before any batch times out. */
  adaptiveBatchEnabled?: boolean;

  /** D-18 — lineage pre-filter counters. hitCount = groups served from
   *  cached enriched event < 7d old; missCount = groups falling through to LLM. */
  lineagePrefilterStats?: {
    hitCount: number;
    missCount: number;
  };
  /** D-18 — mirrors env.V3_LINEAGE_PREFILTER at run start. */
  lineagePrefilterEnabled?: boolean;

  /** D-21 — NIM cold-start pre-warm telemetry. prewarmCount = number of
   *  prewarmIfCold() calls that fired a synthetic warmup request this run.
   *  prewarmState = current warm/cold-fired/unknown state of the NIM client. */
  prewarmCount?: number;
  lastPrewarmTs?: number | null;
  prewarmState?: 'warm' | 'cold-fired' | 'unknown';

  // ---------------------------------------------------------------------
  // Phase 27.4.3 Plan 02a — v3 observability fields (D-12, D-14, D-19).
  //
  // All optional + additive — v2 cache readers ignore unknown fields.
  // The fields are populated by Plan 02b's instrumentation (this plan is
  // type-only so the contract is settled before the extractor work begins).
  // ---------------------------------------------------------------------

  /** D-12 (v3): chronological trace of routing decisions per batch — drives the Routing Trace block. */
  routingTrace?: Array<{
    ts: number;
    batch: number;
    provider: 'nvidia_nim' | 'openrouter';
    model: string;
    reason: string;
  }>;

  /**
   * D-14 (v3): per-provider latency histogram for the dashboard sparklines.
   * `samples` is the underlying ring buffer (capped at 100 by Plan 02b's
   * instrumentation) used to recompute p50/p95/p99/sparkline on each insert.
   * The /llm-status route maps this field to the client-facing `latency`
   * name (UI-SPEC §"Data freshness" line 317) and drops `samples` —
   * `samples` is server-only.
   */
  latencyHistogram?: Record<
    'nvidia_nim' | 'openrouter',
    { p50: number; p95: number; p99: number; sparkline: number[]; samples: number[] }
  >;

  /** D-12 (v3): rate-limit headroom — both per-minute window + per-day cap, with optional per-model breakout. */
  rateLimit?: Record<
    'nvidia_nim' | 'openrouter',
    {
      used: number;
      cap: number;
      window: 'minute' | 'day';
      perModel?: Record<string, { used: number; cap: number }>;
    }
  >;

  /** D-19 (v3): structured failure breakdown — feeds the Schema Failures block. */
  schemaFailures?: Record<
    'nvidia_nim' | 'openrouter',
    { total: number; malformedJson: number; missingField: number; typeMismatch: number }
  >;

  /** D-19 (v3): per-provider error taxonomy histogram — feeds the Error Taxonomy block. */
  errorTaxonomy?: Record<
    'nvidia_nim' | 'openrouter',
    Record<
      | 'rate_limit'
      | 'timeout'
      | 'malformed_json'
      | 'schema_fail'
      | 'network'
      | 'upstream_500'
      | 'other',
      number
    >
  >;

  /** D-12 (v3): shadow cost calculator — what the run WOULD have cost on Anthropic Sonnet. */
  costShadow?: { tokensIn: number; tokensOut: number; usd: number };

  /**
   * Phase 27.4.3 Plan 02a (B-2): live ring buffer of recent enriched events
   * with their lineage fields. Mirrored to LLMRunSummary on completion so
   * cold-start dashboard reads see the same drill-down list.
   *
   * Element type extension (see RecentEnrichedEvent below) carries the new
   * reasoningTrace + lineageHash optional fields populated by Plan 02b.
   */
  recentEvents?: RecentEnrichedEvent[];
}

/**
 * Summary of a completed LLM pipeline run, persisted to Redis.
 * Read by /api/events/llm-status when the pipeline is idle.
 *
 * Phase 27.4 extensions mirror the subset of LLMPipelineProgress fields
 * worth persisting for cold-start dashboard reads — token counters, DLQ
 * depth, eval score, provenance aggregate, and suspect count survive the
 * pipeline completing and inform the /llm-status endpoint even when the
 * module-level progress singleton has been dropped by a cold start.
 */
export interface LLMRunSummary {
  lastRun: number;
  groupCount: number;
  batchCount: number;
  geocodeCount: number;
  enrichedCount: number;
  durationMs: number;
  error: string | null;
  source?: 'pipeline' | 'dev-file-cache';
  /** Phase 27.4.3 Plan 02a: widened to include 'v3' for the free-claude-code routing pipeline. */
  schemaVersion?: 'v1' | 'v2' | 'v3';
  // Phase 27.4 additional summary fields (optional for read-compat):
  tokenCounters?: { cerebras: number; groq: number };
  dlqCount?: number;
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  provenanceCounts?: Partial<Record<GeocodeProvenance, number>>;
  suspectCount?: number;
  /** Phase 27.4.1 D-06 / 27.4.2 P6: count of batches killed by the timeout watchdog in last run. */
  watchdogTimeoutCount?: number;

  // Phase 27.4.4 — v3 latency-remediation summary mirror of the live fields
  // added to LLMPipelineProgress above. Optional + additive; v2 readers ignore.
  adaptiveBatchStats?: {
    splitCount: number;
    retrySuccess: number;
    retryFail: number;
    dlqEnqueueCount: number;
  };
  adaptiveBatchEnabled?: boolean;
  lineagePrefilterStats?: {
    hitCount: number;
    missCount: number;
  };
  lineagePrefilterEnabled?: boolean;
  prewarmCount?: number;
  lastPrewarmTs?: number | null;
  prewarmState?: 'warm' | 'cold-fired' | 'unknown';

  // ---------------------------------------------------------------------
  // Phase 27.4.3 Plan 02a — v3 observability mirror of LLMPipelineProgress.
  //
  // Persisted to Redis at end-of-run so cold-start dashboard reads — which
  // can only load the Redis summary, not the in-memory singleton — still
  // see the v3 routing trace, latency histogram, rate-limit headroom,
  // schema failures, error taxonomy, and shadow cost. callHistory mirror
  // covers the same widened provider + skipReason union as the live
  // singleton above.
  //
  // recentEvents is intentionally NOT mirrored here — element type
  // extension below (RecentEnrichedEvent gains reasoningTrace + lineageHash
  // per B-2) covers Plan 04's DrillDownRow surface.
  // ---------------------------------------------------------------------

  callHistory?: Array<{
    provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    routingReason?: 'primary' | string;
    skipReason?:
      | 'breaker'
      | 'hard_cap'
      | 'no_client'
      | 'rate_limit_window'
      | 'daily_cap'
      | 'watchdog-soft-warn';
  }>;

  routingTrace?: Array<{
    ts: number;
    batch: number;
    provider: 'nvidia_nim' | 'openrouter';
    model: string;
    reason: string;
  }>;

  latencyHistogram?: Record<
    'nvidia_nim' | 'openrouter',
    { p50: number; p95: number; p99: number; sparkline: number[]; samples: number[] }
  >;

  rateLimit?: Record<
    'nvidia_nim' | 'openrouter',
    {
      used: number;
      cap: number;
      window: 'minute' | 'day';
      perModel?: Record<string, { used: number; cap: number }>;
    }
  >;

  schemaFailures?: Record<
    'nvidia_nim' | 'openrouter',
    { total: number; malformedJson: number; missingField: number; typeMismatch: number }
  >;

  errorTaxonomy?: Record<
    'nvidia_nim' | 'openrouter',
    Record<
      | 'rate_limit'
      | 'timeout'
      | 'malformed_json'
      | 'schema_fail'
      | 'network'
      | 'upstream_500'
      | 'other',
      number
    >
  >;

  costShadow?: { tokensIn: number; tokensOut: number; usd: number };

  /**
   * Phase 27.4.3 Plan 02a (B-2): last N enriched events with their lineage
   * fields populated. Element type extension carries reasoningTrace +
   * lineageHash so Plan 04 Task 3 DrillDownRow can render them under TS
   * strict mode without `as any` or TS2339.
   *
   * Server-side recentEvents element type is locally declared to avoid a
   * circular import with /llm-status route and to keep llmProgress.ts
   * dependency-light. The two new optional fields land here AND on the
   * client mirror in src/hooks/useLLMStatusPolling.ts in the SAME COMMIT
   * (A9 atomic invariant per the project canon).
   */
  recentEvents?: RecentEnrichedEvent[];
}

// ---------------------------------------------------------------------------
// RecentEnrichedEvent (server-side mirror).
//
// Phase 27.4.3 Plan 02a / B-2: this element type backs LLMRunSummary.recentEvents
// and gains two new optional fields:
//   - reasoningTrace: <think>...</think> text stripped from the raw v3 LLM
//     response by Plan 02b's lineage helper. NULLable / optional because v1
//     and v2 LLM responses don't carry think tags.
//   - lineageHash: sha256(prompt || model || eventId) — used by Plan 04's
//     DrillDownRow extension to anchor the "copy lineage" button and
//     identify replayable events. Optional because v1/v2 paths predate the
//     lineage helper.
//
// Plan 04 Task 3 reads these fields directly under TS strict mode — that's
// the ONLY consumer; the field is otherwise observability-only. Threat
// surface declared here, populated in Plan 02b. (See plan threat_model
// T-27.4.3-02a-02 — accept disposition, DEV-only consumer.)
// ---------------------------------------------------------------------------

export interface RecentEnrichedEvent {
  groupKey: string;
  location: {
    country: string | null;
    admin1: string | null;
    city: string | null;
    neighborhood: string | null;
    landmark: string | null;
  };
  precision: 'exact' | 'neighborhood' | 'city' | 'region';
  confidence: number;
  reasoning: string;
  weaponType: string | null;
  targetType: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  provenance: GeocodeProvenance;
  sources: string[];
  fetchedAt: number;
  // === Phase 27.4.3 Plan 02a (B-2): populated by Plan 02b lineage helper. ===
  // Plan 04 Task 3 DrillDownRow renders these directly under TS strict mode.
  reasoningTrace?: string;
  lineageHash?: string;
}

/**
 * Initial state for the progress singleton.
 *
 * Phase 27.4 optional fields are seeded to `undefined` so resetProgress()
 * (which Object.assigns INITIAL_PROGRESS over the mutable singleton) clears
 * them between runs — a lingering evalScore from yesterday's run would
 * otherwise mislead DevApiStatus when today's run hasn't populated it yet.
 */
export const INITIAL_PROGRESS: Readonly<LLMPipelineProgress> = {
  stage: 'idle',
  startedAt: null,
  completedAt: null,
  totalGroups: 0,
  newGroups: 0,
  totalBatches: 0,
  completedBatches: 0,
  totalGeocodes: 0,
  completedGeocodes: 0,
  enrichedCount: 0,
  errorMessage: null,
  durationMs: null,
  schemaVersion: undefined,
  callHistory: undefined,
  tokenCounters: undefined,
  dlqCount: undefined,
  breakerState: undefined,
  evalScore: undefined,
  provenanceCounts: undefined,
  suspectCount: undefined,
  watchdogTimeoutCount: undefined,
  // Phase 27.4.3 Plan 02a — v3 observability fields seeded undefined so
  // resetProgress() clears stale data between runs (e.g., a lingering
  // routingTrace from yesterday's v3 run would otherwise confuse today's
  // dashboard if today only ran v2).
  routingTrace: undefined,
  latencyHistogram: undefined,
  rateLimit: undefined,
  schemaFailures: undefined,
  errorTaxonomy: undefined,
  costShadow: undefined,
  recentEvents: undefined,
};

/**
 * Module-level singleton. Survives warm starts on Vercel Fluid Compute.
 * Cold starts reset to INITIAL_PROGRESS; Redis summary provides fallback.
 */
export const llmProgress: LLMPipelineProgress = { ...INITIAL_PROGRESS };

/**
 * Reset all progress fields and begin a new pipeline run.
 * Sets stage to 'grouping' and records the current timestamp.
 */
export function resetProgress(): void {
  Object.assign(llmProgress, INITIAL_PROGRESS, {
    startedAt: Date.now(),
    stage: 'grouping' as const,
  });
}

/**
 * Merge partial progress updates into the singleton.
 * Only overwrites fields present in the partial; all others are preserved.
 */
export function updateProgress(partial: Partial<LLMPipelineProgress>): void {
  Object.assign(llmProgress, partial);
}

/**
 * Build a summary of the current pipeline run for Redis persistence.
 * Called after the pipeline completes (done or error).
 *
 * Phase 27.4 additions (schemaVersion, tokenCounters, dlqCount, evalScore,
 * provenanceCounts, suspectCount) are threaded through from the live
 * progress singleton so cold-start dashboard reads — which can only load
 * the Redis summary, not the in-memory singleton — still see the full
 * observability surface.
 */
export function buildSummary(): LLMRunSummary {
  return {
    lastRun: llmProgress.completedAt ?? Date.now(),
    groupCount: llmProgress.newGroups,
    batchCount: llmProgress.completedBatches,
    geocodeCount: llmProgress.completedGeocodes,
    enrichedCount: llmProgress.enrichedCount,
    durationMs: llmProgress.durationMs ?? 0,
    error: llmProgress.errorMessage,
    source: 'pipeline',
    schemaVersion: llmProgress.schemaVersion,
    tokenCounters: llmProgress.tokenCounters,
    dlqCount: llmProgress.dlqCount,
    evalScore: llmProgress.evalScore,
    provenanceCounts: llmProgress.provenanceCounts,
    suspectCount: llmProgress.suspectCount,
    watchdogTimeoutCount: llmProgress.watchdogTimeoutCount,
    // Phase 27.4.3 Plan 02a — thread the new v3 observability fields into
    // the persisted Redis summary so cold-start dashboard reads see the
    // routing trace, latency histogram, rate-limit headroom, schema failures,
    // error taxonomy, shadow cost, callHistory mirror, and recentEvents
    // drill-down. callHistory is also persisted so the cold-start render
    // matches the live render exactly.
    callHistory: llmProgress.callHistory,
    routingTrace: llmProgress.routingTrace,
    latencyHistogram: llmProgress.latencyHistogram,
    rateLimit: llmProgress.rateLimit,
    schemaFailures: llmProgress.schemaFailures,
    errorTaxonomy: llmProgress.errorTaxonomy,
    costShadow: llmProgress.costShadow,
    recentEvents: llmProgress.recentEvents,
  };
}
