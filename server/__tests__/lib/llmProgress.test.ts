// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  llmProgress,
  resetProgress,
  updateProgress,
  buildSummary,
  INITIAL_PROGRESS,
} from '../../lib/llmProgress.js';
import type { LLMRunSummary } from '../../lib/llmProgress.js';

describe('llmProgress', () => {
  beforeEach(() => {
    // Reset singleton to initial state between tests
    Object.assign(llmProgress, INITIAL_PROGRESS);
  });

  it('singleton starts in idle stage with all counters at 0', () => {
    expect(llmProgress.stage).toBe('idle');
    expect(llmProgress.startedAt).toBeNull();
    expect(llmProgress.completedAt).toBeNull();
    expect(llmProgress.totalGroups).toBe(0);
    expect(llmProgress.newGroups).toBe(0);
    expect(llmProgress.totalBatches).toBe(0);
    expect(llmProgress.completedBatches).toBe(0);
    expect(llmProgress.totalGeocodes).toBe(0);
    expect(llmProgress.completedGeocodes).toBe(0);
    expect(llmProgress.enrichedCount).toBe(0);
    expect(llmProgress.errorMessage).toBeNull();
    expect(llmProgress.durationMs).toBeNull();
  });

  it('resetProgress sets stage to grouping and records startedAt timestamp', () => {
    const before = Date.now();
    resetProgress();
    const after = Date.now();

    expect(llmProgress.stage).toBe('grouping');
    expect(llmProgress.startedAt).toBeGreaterThanOrEqual(before);
    expect(llmProgress.startedAt).toBeLessThanOrEqual(after);
  });

  it('resetProgress clears previous run data', () => {
    // Simulate a completed run
    Object.assign(llmProgress, {
      stage: 'done',
      completedAt: Date.now() - 1000,
      totalGroups: 50,
      newGroups: 30,
      totalBatches: 4,
      completedBatches: 4,
      totalGeocodes: 30,
      completedGeocodes: 30,
      enrichedCount: 28,
      errorMessage: 'some previous error',
      durationMs: 12345,
    });

    resetProgress();

    expect(llmProgress.stage).toBe('grouping');
    expect(llmProgress.completedAt).toBeNull();
    expect(llmProgress.totalGroups).toBe(0);
    expect(llmProgress.newGroups).toBe(0);
    expect(llmProgress.totalBatches).toBe(0);
    expect(llmProgress.completedBatches).toBe(0);
    expect(llmProgress.totalGeocodes).toBe(0);
    expect(llmProgress.completedGeocodes).toBe(0);
    expect(llmProgress.enrichedCount).toBe(0);
    expect(llmProgress.errorMessage).toBeNull();
    expect(llmProgress.durationMs).toBeNull();
    expect(llmProgress.startedAt).not.toBeNull();
  });

  it('updateProgress merges partial fields without resetting unrelated fields', () => {
    resetProgress();
    const startedAt = llmProgress.startedAt;

    updateProgress({ totalGroups: 50, newGroups: 30 });

    expect(llmProgress.totalGroups).toBe(50);
    expect(llmProgress.newGroups).toBe(30);
    // Unrelated fields should be preserved
    expect(llmProgress.stage).toBe('grouping');
    expect(llmProgress.startedAt).toBe(startedAt);
    expect(llmProgress.completedBatches).toBe(0);

    updateProgress({ stage: 'llm-processing', totalBatches: 4 });

    expect(llmProgress.stage).toBe('llm-processing');
    expect(llmProgress.totalBatches).toBe(4);
    // Previous updates preserved
    expect(llmProgress.totalGroups).toBe(50);
    expect(llmProgress.newGroups).toBe(30);
  });

  it('buildSummary returns LLMRunSummary from current progress state', () => {
    // Simulate a completed pipeline run
    const now = Date.now();
    Object.assign(llmProgress, {
      stage: 'done',
      startedAt: now - 5000,
      completedAt: now,
      totalGroups: 50,
      newGroups: 30,
      totalBatches: 4,
      completedBatches: 4,
      totalGeocodes: 28,
      completedGeocodes: 28,
      enrichedCount: 28,
      errorMessage: null,
      durationMs: 5000,
    });

    const summary: LLMRunSummary = buildSummary();

    expect(summary.lastRun).toBe(now);
    expect(summary.groupCount).toBe(30);
    expect(summary.batchCount).toBe(4);
    expect(summary.geocodeCount).toBe(28);
    expect(summary.enrichedCount).toBe(28);
    expect(summary.durationMs).toBe(5000);
    expect(summary.error).toBeNull();
  });

  it('buildSummary includes error message when pipeline errored', () => {
    const now = Date.now();
    Object.assign(llmProgress, {
      stage: 'error',
      startedAt: now - 3000,
      completedAt: now,
      totalGroups: 20,
      newGroups: 10,
      totalBatches: 2,
      completedBatches: 1,
      totalGeocodes: 0,
      completedGeocodes: 0,
      enrichedCount: 0,
      errorMessage: 'LLM provider timeout',
      durationMs: 3000,
    });

    const summary = buildSummary();

    expect(summary.error).toBe('LLM provider timeout');
    expect(summary.lastRun).toBe(now);
    expect(summary.durationMs).toBe(3000);
  });
});
