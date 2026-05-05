// @vitest-environment node
/**
 * Phase 27.4.3 Plan 05 D-17 — auto-rollback ladder unit tests.
 *
 * Covers both triggers:
 *   1. checkWatchdogRecurrenceTrigger — fires when llmProgress.watchdogTimeoutCount >= 3
 *      AND v3 is the active pipeline. Flips override v3 -> v2 + appends D-15
 *      audit entry with trigger 'auto:watchdog_recurrence'.
 *   2. checkEvalDropTrigger — fires when (newWithin20kmRatio < baselineRatio - 0.05)
 *      AND v3 is the active pipeline. Flips override v3 -> v2 + appends D-15
 *      audit entry with trigger 'auto:eval_drop'.
 *
 * Negative paths:
 *   - Both triggers are no-ops when v3 is NOT the active pipeline (so a v2 / v1
 *     run can't accidentally flip the override).
 *   - watchdog trigger does NOT fire on count < 3 (transient incident vs. recurrence).
 *   - eval-drop trigger does NOT fire when drop < 5pp (substantial movement bar).
 *   - eval-drop trigger handles the cacheSetSafe envelope (`{data: EvalScore, fetchedAt}`)
 *     AND raw object AND null AND malformed JSON without throwing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — registered BEFORE import() of the module under test.
// ---------------------------------------------------------------------------

// Redis stub — `redis.get` for the baseline read, `redis.set` for the override
// write. Both are vi.fn() so per-test we can configure return values + assert
// call shape.
const redisGetMock = vi.fn();
const redisSetMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => redisGetMock(...args),
    set: (...args: unknown[]) => redisSetMock(...args),
  },
}));

// pipelineAudit stub — assert calls + extract the trigger / from / to / reason fields.
const appendPipelineAuditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../lib/pipelineAudit.js', () => ({
  appendPipelineAudit: (...args: unknown[]) => appendPipelineAuditMock(...args),
}));

// config — control isPipelineV3() return value per-test, capture setPipelineOverride() calls.
// Phase 27.4.4 D-13 — env is hoisted as a mutable mockEnv so per-test
// V3_WATCHDOG_ROLLBACK_THRESHOLD overrides drive the env-tunable threshold path.
const isPipelineV3Mock = vi.fn();
const setPipelineOverrideMock = vi.fn();
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: '',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 90000,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    // Phase 27.4.4 Plan 02 — parallel batch concurrency. Tests run a small
    // number of batches; the limit value just needs to be a positive int.
    LLM_V3_CONCURRENCY: 12,
  },
}));
vi.mock('../../config.js', () => ({
  isPipelineV3: (...args: unknown[]) => isPipelineV3Mock(...args),
  setPipelineOverride: (...args: unknown[]) => setPipelineOverrideMock(...args),
  env: mockEnv,
  // Used by the v3 extractor (not exercised by these tests but imported).
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
}));

// llmProgress — module-level singleton; mutate per-test to inject watchdogTimeoutCount.
vi.mock('../../lib/llmProgress.js', () => ({
  llmProgress: { watchdogTimeoutCount: 0 } as { watchdogTimeoutCount?: number },
  updateProgress: vi.fn(),
}));

// logger — silent.
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// freeClaudeRouter — imported transitively by v3 extractor. Stub callLLM so
// the module imports cleanly without trying to instantiate OpenAI clients.
vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(),
}));

// llmLineage — imported transitively. Stub to avoid Redis writes in tests.
vi.mock('../../lib/llmLineage.js', () => ({
  appendLineage: vi.fn().mockResolvedValue({ lineageHash: 'mock-hash' }),
}));

// llmDLQ — stubbed for completeness.
vi.mock('../../lib/llmDLQ.js', () => ({
  enqueueDLQ: vi.fn().mockResolvedValue(undefined),
}));

// Imports AFTER mocks are registered.
import {
  checkWatchdogRecurrenceTrigger,
  checkEvalDropTrigger,
} from '../../lib/llmEventExtractor.v3.js';
import { llmProgress } from '../../lib/llmProgress.js';

// ---------------------------------------------------------------------------
// Per-test reset.
// ---------------------------------------------------------------------------

beforeEach(() => {
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisSetMock.mockResolvedValue(undefined);
  appendPipelineAuditMock.mockReset();
  appendPipelineAuditMock.mockResolvedValue(undefined);
  isPipelineV3Mock.mockReset();
  setPipelineOverrideMock.mockReset();
  llmProgress.watchdogTimeoutCount = 0;
  // Phase 27.4.4 D-13 — restore default threshold between tests so a custom
  // override in one test cannot bleed into the next.
  mockEnv.V3_WATCHDOG_ROLLBACK_THRESHOLD = 2;
});

// ===========================================================================
// Trigger 1 — watchdog recurrence
// ===========================================================================

describe('D-17 Trigger 1 — checkWatchdogRecurrenceTrigger', () => {
  it('flips v3 -> v2 + records audit entry when watchdogTimeoutCount >= 3 and v3 is active', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    llmProgress.watchdogTimeoutCount = 3;

    const result = await checkWatchdogRecurrenceTrigger();

    expect(result.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
    expect(redisSetMock).toHaveBeenCalledWith('events:llm-pipeline-override', 'v2', {
      ex: 7 * 24 * 3600,
    });
    expect(appendPipelineAuditMock).toHaveBeenCalledTimes(1);
    const entry = appendPipelineAuditMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.trigger).toBe('auto:watchdog_recurrence');
    expect(entry.from).toBe('v3');
    expect(entry.to).toBe('v2');
    expect(entry.reason).toMatch(/watchdogTimeoutCount=3/);
    expect(typeof entry.ts).toBe('number');
    expect(['dev', 'cron', 'production']).toContain(entry.operator);
  });

  it('is a no-op when watchdogTimeoutCount < threshold (transient, not recurrence)', async () => {
    // D-13: default threshold is 2, so count=1 is below the bar.
    isPipelineV3Mock.mockReturnValue(true);
    llmProgress.watchdogTimeoutCount = 1;

    const result = await checkWatchdogRecurrenceTrigger();

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(appendPipelineAuditMock).not.toHaveBeenCalled();
  });

  it('is a no-op when v3 is NOT the active pipeline even with watchdog count >= 3', async () => {
    isPipelineV3Mock.mockReturnValue(false);
    llmProgress.watchdogTimeoutCount = 5;

    const result = await checkWatchdogRecurrenceTrigger();

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
    expect(appendPipelineAuditMock).not.toHaveBeenCalled();
  });

  it('handles redis.set failure gracefully (audit still appended)', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    llmProgress.watchdogTimeoutCount = 4;
    redisSetMock.mockRejectedValueOnce(new Error('redis down'));

    const result = await checkWatchdogRecurrenceTrigger();

    expect(result.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
    expect(appendPipelineAuditMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // Phase 27.4.4 D-13 — env-tunable threshold (default 2 + custom value).
  // ---------------------------------------------------------------------

  it('D-13 default threshold is 2 — count=2 triggers rollback (recurrence boundary at the new default)', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    mockEnv.V3_WATCHDOG_ROLLBACK_THRESHOLD = 2; // explicit, not relying on beforeEach
    llmProgress.watchdogTimeoutCount = 2;

    const result = await checkWatchdogRecurrenceTrigger();

    expect(result.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
    const entry = appendPipelineAuditMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.reason).toMatch(/watchdogTimeoutCount=2 \(>= 2\)/);
  });

  it('D-13 custom threshold honored — V3_WATCHDOG_ROLLBACK_THRESHOLD=5 keeps count=4 a no-op, count=5 triggers', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    mockEnv.V3_WATCHDOG_ROLLBACK_THRESHOLD = 5;

    llmProgress.watchdogTimeoutCount = 4;
    const below = await checkWatchdogRecurrenceTrigger();
    expect(below.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();

    llmProgress.watchdogTimeoutCount = 5;
    const at = await checkWatchdogRecurrenceTrigger();
    expect(at.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
    const entry = appendPipelineAuditMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.reason).toMatch(/watchdogTimeoutCount=5 \(>= 5\)/);
  });
});

// ===========================================================================
// Trigger 2 — eval drop
// ===========================================================================

describe('D-17 Trigger 2 — checkEvalDropTrigger', () => {
  // The cacheSetSafe envelope shape: { data: EvalScore, fetchedAt }.
  const envelopedBaseline = (within20km: number, total: number) => ({
    data: { within5km: 0, within20km, within100km: total, total },
    fetchedAt: 1700000000000,
  });

  it('flips v3 -> v2 when newRatio drops >= 5pp from enveloped baseline AND v3 is active', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    redisGetMock.mockResolvedValue(envelopedBaseline(47, 50)); // baseline ratio 0.940

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.85 });

    expect(result.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
    expect(redisSetMock).toHaveBeenCalledWith('events:llm-pipeline-override', 'v2', {
      ex: 7 * 24 * 3600,
    });
    expect(appendPipelineAuditMock).toHaveBeenCalledTimes(1);
    const entry = appendPipelineAuditMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.trigger).toBe('auto:eval_drop');
    expect(entry.from).toBe('v3');
    expect(entry.to).toBe('v2');
    expect(entry.reason).toMatch(/eval drop 0\.0[89]\d/);
  });

  it('is a no-op when drop < 5pp (e.g. 4pp)', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    redisGetMock.mockResolvedValue(envelopedBaseline(47, 50)); // baseline 0.940

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.91 }); // drop = 0.030

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
    expect(appendPipelineAuditMock).not.toHaveBeenCalled();
  });

  it('is a no-op when v3 is NOT the active pipeline even with a large drop', async () => {
    isPipelineV3Mock.mockReturnValue(false);
    redisGetMock.mockResolvedValue(envelopedBaseline(47, 50));

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.5 });

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
  });

  it('accepts a raw-object baseline shape (legacy / un-enveloped) without crashing', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    // Some legacy writers may have stored the score directly (not enveloped).
    redisGetMock.mockResolvedValue({
      within5km: 0,
      within20km: 47,
      within100km: 50,
      total: 50,
    });

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.85 });

    expect(result.rolledBack).toBe(true);
    expect(setPipelineOverrideMock).toHaveBeenCalledWith('v2');
  });

  it('handles missing baseline (null) without crashing or rolling back', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    redisGetMock.mockResolvedValue(null);

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.0 });

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
  });

  it('handles redis.get rejection gracefully (no rollback, no throw)', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    redisGetMock.mockRejectedValue(new Error('redis network failure'));

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.5 });

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
    expect(appendPipelineAuditMock).not.toHaveBeenCalled();
  });

  it('treats a baseline with total=0 as missing (no division-by-zero rollback)', async () => {
    isPipelineV3Mock.mockReturnValue(true);
    redisGetMock.mockResolvedValue(envelopedBaseline(0, 0));

    const result = await checkEvalDropTrigger({ newWithin20kmRatio: 0.0 });

    expect(result.rolledBack).toBe(false);
    expect(setPipelineOverrideMock).not.toHaveBeenCalled();
  });
});
