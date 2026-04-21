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

// ---------------------------------------------------------------------------
// Phase 27.4 v2 extensions — covers the optional observability fields added
// to LLMPipelineProgress + LLMRunSummary (D-19, D-20, D-22, D-23, D-30,
// D-31, D-32, D-39). Existing tests above are untouched; beforeEach resets
// the singleton via INITIAL_PROGRESS which now includes these fields as
// `undefined`, so a dirty singleton from a prior test cannot bleed in.
// ---------------------------------------------------------------------------

describe('Phase 27.4 v2 extensions', () => {
  beforeEach(() => {
    Object.assign(llmProgress, INITIAL_PROGRESS);
  });

  it('resetProgress clears all v2 optional fields', () => {
    llmProgress.callHistory = [
      {
        provider: 'cerebras',
        model: 'x',
        tokensIn: 1,
        tokensOut: 1,
        durationMs: 1,
        ok: true,
        batchSize: 1,
        timestamp: 1,
      },
    ];
    llmProgress.dlqCount = 5;
    llmProgress.suspectCount = 3;
    llmProgress.tokenCounters = { cerebras: 100, groq: 50 };
    llmProgress.breakerState = { cerebras: 'paused', groq: 'ok' };
    llmProgress.evalScore = { within5km: 1, within20km: 2, within100km: 3, total: 4 };
    llmProgress.provenanceCounts = { 'own-site-snapshot': 2 };
    llmProgress.schemaVersion = 'v2';

    resetProgress();

    expect(llmProgress.callHistory).toBeUndefined();
    expect(llmProgress.dlqCount).toBeUndefined();
    expect(llmProgress.suspectCount).toBeUndefined();
    expect(llmProgress.tokenCounters).toBeUndefined();
    expect(llmProgress.breakerState).toBeUndefined();
    expect(llmProgress.evalScore).toBeUndefined();
    expect(llmProgress.provenanceCounts).toBeUndefined();
    expect(llmProgress.schemaVersion).toBeUndefined();
  });

  it('updateProgress merges v2 fields without touching v1 fields', () => {
    resetProgress();
    updateProgress({ totalGroups: 10 });
    updateProgress({
      callHistory: [
        {
          provider: 'groq',
          model: 'y',
          tokensIn: 5,
          tokensOut: 5,
          durationMs: 1,
          ok: true,
          batchSize: 2,
          timestamp: 1,
        },
      ],
    });

    expect(llmProgress.totalGroups).toBe(10);
    expect(llmProgress.callHistory).toHaveLength(1);
    expect(llmProgress.callHistory?.[0]?.provider).toBe('groq');
    // v1 fields from resetProgress still present
    expect(llmProgress.stage).toBe('grouping');
  });

  it('buildSummary threads schemaVersion + tokenCounters + evalScore + suspectCount when set', () => {
    resetProgress();
    updateProgress({
      schemaVersion: 'v2',
      tokenCounters: { cerebras: 100, groq: 50 },
      evalScore: { within5km: 10, within20km: 15, within100km: 20, total: 25 },
      suspectCount: 3,
      dlqCount: 2,
      provenanceCounts: { 'own-site-snapshot': 7, 'nominatim-direct': 5 },
    });

    const s = buildSummary();

    expect(s.schemaVersion).toBe('v2');
    expect(s.tokenCounters).toEqual({ cerebras: 100, groq: 50 });
    expect(s.evalScore?.total).toBe(25);
    expect(s.suspectCount).toBe(3);
    expect(s.dlqCount).toBe(2);
    expect(s.provenanceCounts?.['own-site-snapshot']).toBe(7);
  });
});
