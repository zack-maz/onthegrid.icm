// ---------------------------------------------------------------------------
// LLM Pipeline Progress Tracking
//
// Module-level singleton tracking the state of the fire-and-forget LLM
// enrichment pipeline. On Vercel Fluid Compute, module-level state survives
// warm starts. Cold starts reset to idle; Redis summary provides fallback.
// ---------------------------------------------------------------------------

import type { GeocodeProvenance } from './llmSchema.js';

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

  /** D-39: which extractor schema produced this run. (Added in Plan 01.) */
  schemaVersion?: 'v1' | 'v2';

  /**
   * D-19: last N=20 LLM calls (shift-append). Populated via updateProgress.
   *
   * `skipReason` marks synthetic entries for skipped attempts that never touched
   * the network (breaker paused, hard-cap budget, no client configured). These
   * are logged so DevApiStatus can explain `completedBatches=N, enrichedCount=0`
   * outcomes instead of presenting an empty call history with no diagnosis.
   */
  callHistory?: Array<{
    provider: 'cerebras' | 'groq';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    skipReason?: 'breaker' | 'hard_cap' | 'no_client';
  }>;

  /** D-32: per-provider daily token counters mirrored from Redis for fast read. */
  tokenCounters?: { cerebras: number; groq: number };

  /** D-30: bounded DLQ size for DevApiStatus badge. */
  dlqCount?: number;

  /** D-31: sliding-window circuit-breaker state per provider. */
  breakerState?: { cerebras: 'ok' | 'paused'; groq: 'ok' | 'paused' };

  /** D-20: latest eval harness score (also written to Redis summary on completion). */
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };

  /** D-22 aggregate: counts per resolver provenance path for DevApiStatus pie. */
  provenanceCounts?: Partial<Record<GeocodeProvenance, number>>;

  /** D-23: derived "suspect" event count for last run. */
  suspectCount?: number;
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
  schemaVersion?: 'v1' | 'v2';
  // Phase 27.4 additional summary fields (optional for read-compat):
  tokenCounters?: { cerebras: number; groq: number };
  dlqCount?: number;
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  provenanceCounts?: Partial<Record<GeocodeProvenance, number>>;
  suspectCount?: number;
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
  };
}
