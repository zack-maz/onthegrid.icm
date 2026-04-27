// @vitest-environment node
/**
 * Phase 27.4.4 Plan 01 Task 0a / Task 6 (D-04) — adaptive batching unit tests.
 *
 * Stub file: six pending cases. Task 6 flips them green when splitBatchOnTimeout
 * lands in server/lib/llmEventExtractor.v3.ts behind V3_ADAPTIVE_BATCH=true.
 *
 * Mock pattern copied verbatim from llmEventExtractor.v2.test.ts (lines 1-90)
 * + llmAutoRollback.test.ts env mock shape, augmented with V3_ADAPTIVE_BATCH:
 * false (default OFF) and V3_WATCHDOG_ROLLBACK_THRESHOLD: 2 (D-13 ready).
 */

import { describe, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — copied verbatim from llmEventExtractor.v2.test.ts pattern.
// ---------------------------------------------------------------------------

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
  redis: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../lib/llmResolver.js', () => ({
  resolveLocation: vi.fn(),
}));

vi.mock('../../lib/eventScoring.js', () => ({
  extractBellingcatGeo: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../lib/sourceTiers.js', () => ({
  getSourceTier: vi.fn().mockReturnValue(2),
}));

vi.mock('../../lib/llmDLQ.js', () => ({
  enqueueDLQ: vi.fn().mockResolvedValue(undefined),
  DLQ_KEY: 'events:llm-dlq',
}));

// Watchdog mock — default transparent pass-through; per-test overrides
// mockImplementationOnce to simulate timeouts that trigger split-and-retry.
vi.mock('../../lib/llmExtractorWatchdog.js', () => ({
  withBatchWatchdog: vi.fn(async (batchFn: () => Promise<unknown>, _opts: unknown) => batchFn()),
}));

vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn(),
  llmProgress: {
    watchdogTimeoutCount: undefined,
    callHistory: undefined,
    adaptiveBatchStats: undefined,
    adaptiveBatchEnabled: undefined,
  },
}));

vi.mock('../../lib/llmLineage.js', () => ({
  appendLineage: vi.fn().mockResolvedValue({ lineageHash: 'mock-hash' }),
}));

vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(),
}));

// Phase 27.4.4 D-04 + D-13 — env mock with adaptive batch + retuned threshold.
// Default V3_ADAPTIVE_BATCH=false preserves existing v3:timeout_watchdog DLQ
// behavior (regression test 1). Tests flip via direct env mutation in beforeEach.
vi.mock('../../config.js', () => ({
  env: {
    NVIDIA_NIM_API_KEY: '',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 90000,
    V3_ADAPTIVE_BATCH: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
  },
  isPipelineV3: vi.fn().mockReturnValue(true),
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
  setPipelineOverride: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test cases — six placeholders flipped green by Task 6.
// ---------------------------------------------------------------------------

describe('v3 adaptive batching (D-04)', () => {
  it.todo(
    'V3_ADAPTIVE_BATCH=false → existing v3:timeout_watchdog DLQ behavior preserved (regression)',
  );
  it.todo(
    'V3_ADAPTIVE_BATCH=true + first half passes, second half fails → 1 success in results, 1 DLQ entry with reason v3:adaptive-retry-fail',
  );
  it.todo('V3_ADAPTIVE_BATCH=true + both halves pass → 2 successes in results, 0 DLQ entries');
  it.todo(
    'V3_ADAPTIVE_BATCH=true + both halves fail → 2 DLQ entries with reason v3:adaptive-retry-fail, adaptiveBatchStats.retryFail=2',
  );
  it.todo(
    'adaptiveBatchStats counter shape — splitCount/retrySuccess/retryFail/dlqEnqueueCount increment correctly',
  );
  it.todo(
    'split-then-success does NOT increment watchdogTimeoutCount (so D-13 Trigger 1 threshold logic remains correct under adaptive)',
  );
});
