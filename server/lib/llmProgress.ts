// ---------------------------------------------------------------------------
// LLM Pipeline Progress Tracking
//
// Module-level singleton tracking the state of the fire-and-forget LLM
// enrichment pipeline. On Vercel Fluid Compute, module-level state survives
// warm starts. Cold starts reset to idle; Redis summary provides fallback.
// ---------------------------------------------------------------------------

/**
 * Live progress state for the LLM enrichment pipeline.
 * Tracks stage transitions and batch/geocode completion counts.
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
}

/**
 * Summary of a completed LLM pipeline run, persisted to Redis.
 * Read by /api/events/llm-status when the pipeline is idle.
 */
export interface LLMRunSummary {
  lastRun: number;
  groupCount: number;
  batchCount: number;
  geocodeCount: number;
  enrichedCount: number;
  durationMs: number;
  error: string | null;
}

/** Initial state for the progress singleton. */
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
  };
}
