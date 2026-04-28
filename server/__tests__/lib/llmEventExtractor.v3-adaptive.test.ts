// @vitest-environment node
/**
 * Phase 27.4.4 Plan 01 Task 6 (D-04) — adaptive batching unit tests.
 *
 * Six tests covering splitBatchOnTimeout's behavior via the
 * processEventGroupsV3 main loop:
 *   1. V3_ADAPTIVE_BATCH=false  → existing v3:timeout_watchdog DLQ behavior preserved.
 *   2. V3_ADAPTIVE_BATCH=true + first half passes, second half fails → 1 event in results, 1 DLQ entry.
 *   3. V3_ADAPTIVE_BATCH=true + both halves pass → 2 events, 0 DLQ.
 *   4. V3_ADAPTIVE_BATCH=true + both halves fail → 2 DLQ entries with reason v3:adaptive-retry-fail.
 *   5. Counter shape — splitCount/retrySuccess/retryFail/dlqEnqueueCount increment correctly.
 *   6. Split-then-success does NOT increment watchdogTimeoutCount (Trigger 1 invariant).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: '',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 90000,
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
  },
}));

// ---------------------------------------------------------------------------
// Hoisted mocks.
// ---------------------------------------------------------------------------

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
  redis: {
    get: vi.fn().mockResolvedValue(null),
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

vi.mock('../../lib/llmExtractorWatchdog.js', () => ({
  withBatchWatchdog: vi.fn(async (batchFn: () => Promise<unknown>, _opts: unknown) => batchFn()),
}));

const { llmProgressSingleton } = vi.hoisted(() => ({
  llmProgressSingleton: {
    watchdogTimeoutCount: undefined,
    callHistory: undefined,
    adaptiveBatchStats: undefined,
    adaptiveBatchEnabled: undefined,
    schemaFailures: undefined,
    routingTrace: undefined,
    recentEvents: undefined,
  } as Record<string, unknown>,
}));
vi.mock('../../lib/llmProgress.js', () => ({
  // Mutating mock — updateProgress applies the patch to the singleton so
  // production reads of `llmProgress.X` see the running tally during a test.
  updateProgress: vi.fn((patch: Record<string, unknown>) => {
    Object.assign(llmProgressSingleton, patch);
  }),
  llmProgress: llmProgressSingleton,
}));

vi.mock('../../lib/llmLineage.js', () => ({
  appendLineage: vi.fn().mockResolvedValue({ lineageHash: 'mock-hash' }),
}));

vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(),
  prewarmIfCold: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/pipelineAudit.js', () => ({
  appendPipelineAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../config.js', () => ({
  env: mockEnv,
  isPipelineV3: vi.fn().mockReturnValue(true),
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
  setPipelineOverride: vi.fn(),
}));

import { callLLM as freeClaudeCallLLM } from '../../lib/freeClaudeRouter.js';
import { enqueueDLQ } from '../../lib/llmDLQ.js';
import { withBatchWatchdog } from '../../lib/llmExtractorWatchdog.js';
import { updateProgress, llmProgress } from '../../lib/llmProgress.js';
import { processEventGroupsV3 } from '../../lib/llmEventExtractor.v3.js';
import type { EventGroup } from '../../lib/eventGrouping.js';
import type { ConflictEventEntity } from '../../types.js';

const BASE_TS = Date.UTC(2026, 3, 15);

function makeEntity(id: string): ConflictEventEntity {
  return {
    id,
    type: 'airstrike',
    lat: 35,
    lng: 50,
    timestamp: BASE_TS,
    label: 't',
    data: {
      eventType: 'Aerial weapons',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'X',
      actor2: 'Y',
      notes: '',
      source: 'https://example.com/x',
      goldsteinScale: -5,
      locationName: 'Tehran',
      cameoCode: '195',
      numMentions: 5,
      numSources: 2,
      geoPrecision: 'precise' as const,
      confidence: 0.7,
    },
  };
}

function makeGroup(key: string, entityId: string): EventGroup {
  return {
    key,
    entities: [makeEntity(entityId)],
    centroidLat: 35,
    centroidLng: 50,
    primaryCameo: '195',
    timestamp: BASE_TS,
    totalMentions: 5,
    totalSources: 2,
    sourceUrls: ['https://example.com/x'],
  };
}

const validBatchResponse = (...keys: string[]): string =>
  JSON.stringify({
    events: keys.map((k) => ({
      schemaVersion: 'v3',
      groupKey: k,
      location: {
        country: 'IR',
        admin1: null,
        city: null,
        neighborhood: null,
        landmark: null,
        confidence: 0.7,
      },
      type: 'airstrike',
      confidence: 0.7,
      reasoning: 'test',
      weaponType: null,
      targetType: null,
      timeOfDay: null,
      durationMinutes: null,
      actors: [],
      severity: 'medium',
      summary: 'test summary',
      casualties: { killed: 0, injured: 0, unknown: false },
      sourceCount: 1,
    })),
  });

beforeEach(() => {
  vi.mocked(freeClaudeCallLLM).mockReset();
  vi.mocked(enqueueDLQ).mockReset();
  vi.mocked(enqueueDLQ).mockResolvedValue(undefined);
  vi.mocked(withBatchWatchdog).mockReset();
  vi.mocked(updateProgress).mockReset();
  // Reset llmProgress fields per test (mutate in place — module singleton).
  for (const k of Object.keys(llmProgress)) {
    (llmProgress as Record<string, unknown>)[k] = undefined;
  }
  // Reset env flags
  mockEnv.V3_ADAPTIVE_BATCH = false;
});

// Helper: simulate watchdog timeout (fires onTimeout, returns null).
const watchdogTimeout = async (_fn: () => Promise<unknown>, opts: unknown): Promise<null> => {
  const typedOpts = opts as { onTimeout: () => Promise<void> };
  await typedOpts.onTimeout();
  return null;
};

// Helper: simulate watchdog pass-through (calls batchFn, returns its result).
const watchdogPassThrough = async <T>(fn: () => Promise<T>): Promise<T> => fn();

describe('v3 adaptive batching (D-04)', () => {
  it('V3_ADAPTIVE_BATCH=false → existing v3:timeout_watchdog DLQ behavior preserved (regression)', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = false;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    vi.mocked(withBatchWatchdog).mockImplementationOnce(watchdogTimeout);

    await processEventGroupsV3(groups);

    const dlqCalls = vi.mocked(enqueueDLQ).mock.calls;
    const timeoutEntries = dlqCalls.filter(
      ([e]) => (e as { reason: string }).reason === 'v3:timeout_watchdog',
    );
    expect(timeoutEntries.length).toBe(2);
    const adaptiveEntries = dlqCalls.filter(
      ([e]) => (e as { reason: string }).reason === 'v3:adaptive-retry-fail',
    );
    expect(adaptiveEntries.length).toBe(0);
  });

  it('V3_ADAPTIVE_BATCH=true + first half passes, second half fails → 1 success in results, 1 DLQ entry with reason v3:adaptive-retry-fail', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    // 1st watchdog call: main batch times out.
    // 2nd: first half (g1) passes through.
    // 3rd: second half (g2) times out.
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogPassThrough)
      .mockImplementationOnce(watchdogTimeout);
    vi.mocked(freeClaudeCallLLM).mockResolvedValueOnce({
      content: validBatchResponse('g1'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });

    const result = await processEventGroupsV3(groups);

    expect(result.events?.length).toBe(1);
    expect(result.events?.[0]?.groupKey).toBe('g1');
    const adaptiveDlq = vi
      .mocked(enqueueDLQ)
      .mock.calls.filter(([e]) => (e as { reason: string }).reason === 'v3:adaptive-retry-fail');
    expect(adaptiveDlq.length).toBe(1);
    expect((adaptiveDlq[0]?.[0] as { id: string }).id).toBe('g2');
  });

  it('V3_ADAPTIVE_BATCH=true + both halves pass → 2 successes in results, 0 DLQ entries', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogPassThrough)
      .mockImplementationOnce(watchdogPassThrough);
    vi.mocked(freeClaudeCallLLM)
      .mockResolvedValueOnce({
        content: validBatchResponse('g1'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      })
      .mockResolvedValueOnce({
        content: validBatchResponse('g2'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      });

    const result = await processEventGroupsV3(groups);

    expect(result.events?.length).toBe(2);
    const adaptiveDlq = vi
      .mocked(enqueueDLQ)
      .mock.calls.filter(([e]) => (e as { reason: string }).reason === 'v3:adaptive-retry-fail');
    expect(adaptiveDlq.length).toBe(0);
  });

  it('V3_ADAPTIVE_BATCH=true + both halves fail → 2 DLQ entries with reason v3:adaptive-retry-fail, adaptiveBatchStats.retryFail=2', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogTimeout);

    await processEventGroupsV3(groups);

    const adaptiveDlq = vi
      .mocked(enqueueDLQ)
      .mock.calls.filter(([e]) => (e as { reason: string }).reason === 'v3:adaptive-retry-fail');
    expect(adaptiveDlq.length).toBe(2);
    const ids = adaptiveDlq.map(([e]) => (e as { id: string }).id);
    expect(ids).toContain('g1');
    expect(ids).toContain('g2');
    // Final adaptiveBatchStats.retryFail=2 (1 per failed half group)
    const statsUpdates = vi
      .mocked(updateProgress)
      .mock.calls.filter(([p]) => 'adaptiveBatchStats' in (p as object));
    const finalStats = statsUpdates[statsUpdates.length - 1]?.[0] as {
      adaptiveBatchStats: { retryFail: number };
    };
    expect(finalStats.adaptiveBatchStats.retryFail).toBe(2);
  });

  it('adaptiveBatchStats counter shape — splitCount/retrySuccess/retryFail/dlqEnqueueCount increment correctly', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    // Both halves pass scenario.
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogPassThrough)
      .mockImplementationOnce(watchdogPassThrough);
    vi.mocked(freeClaudeCallLLM)
      .mockResolvedValueOnce({
        content: validBatchResponse('g1'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      })
      .mockResolvedValueOnce({
        content: validBatchResponse('g2'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      });

    await processEventGroupsV3(groups);

    const statsUpdates = vi
      .mocked(updateProgress)
      .mock.calls.filter(([p]) => 'adaptiveBatchStats' in (p as object));
    const finalStats = statsUpdates[statsUpdates.length - 1]?.[0] as {
      adaptiveBatchStats: {
        splitCount: number;
        retrySuccess: number;
        retryFail: number;
        dlqEnqueueCount: number;
      };
    };
    expect(finalStats.adaptiveBatchStats.splitCount).toBe(1);
    expect(finalStats.adaptiveBatchStats.retrySuccess).toBe(2);
    expect(finalStats.adaptiveBatchStats.retryFail).toBe(0);
    expect(finalStats.adaptiveBatchStats.dlqEnqueueCount).toBe(0);
  });

  it('split-then-success does NOT increment watchdogTimeoutCount (so D-13 Trigger 1 threshold logic remains correct under adaptive)', async () => {
    mockEnv.V3_ADAPTIVE_BATCH = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(watchdogTimeout)
      .mockImplementationOnce(watchdogPassThrough)
      .mockImplementationOnce(watchdogPassThrough);
    vi.mocked(freeClaudeCallLLM)
      .mockResolvedValueOnce({
        content: validBatchResponse('g1'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      })
      .mockResolvedValueOnce({
        content: validBatchResponse('g2'),
        routing: [
          { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
        ],
      });

    await processEventGroupsV3(groups);

    const wdcCalls = vi
      .mocked(updateProgress)
      .mock.calls.filter(([p]) => 'watchdogTimeoutCount' in (p as object));
    expect(wdcCalls.length).toBe(0);
  });
});
