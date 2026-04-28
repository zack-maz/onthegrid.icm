// @vitest-environment node
/**
 * Phase 27.4.4 Plan 01 Task 7 (D-18) — lineage pre-filter unit tests.
 *
 * Seven cases driving processEventGroupsV3's group-level lineage pre-filter:
 *   1. computeGroupLineageHash is deterministic.
 *   2. computeGroupLineageHash sorts sourceUrls before hashing.
 *   3. V3_LINEAGE_PREFILTER=false → pre-filter loop is bypassed (no Redis reads).
 *   4. V3_LINEAGE_PREFILTER=true + cache hit AND age < 7d → group skipped, cached
 *      event pushed to results, lineagePrefilterStats.hitCount increments.
 *   5. V3_LINEAGE_PREFILTER=true + cache hit AND age >= 7d → group falls through
 *      to LLM call (TTL-expiry semantics).
 *   6. V3_LINEAGE_PREFILTER=true + cache miss → group falls through to LLM call,
 *      lineagePrefilterStats.missCount increments.
 *   7. lineagePrefilterEnabled mirrors env.V3_LINEAGE_PREFILTER on the
 *      llmProgress singleton update at run start.
 *
 * Mock pattern mirrors llmEventExtractor.v3-adaptive.test.ts (mutating
 * updateProgress mock so production reads of `llmProgress.X` see the running
 * tally during a test).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted env mock — mutated per test.
// ---------------------------------------------------------------------------

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
// Hoisted singletons — Redis stub + llmProgress.
// ---------------------------------------------------------------------------

const { redisGetMock, redisSetMock, redisSetexMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn<(key: string) => Promise<unknown>>().mockResolvedValue(null),
  redisSetMock: vi.fn().mockResolvedValue(undefined),
  redisSetexMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: (key: string) => redisGetMock(key),
    set: (...args: unknown[]) => redisSetMock(...args),
    setex: (...args: unknown[]) => redisSetexMock(...args),
    hset: vi.fn().mockResolvedValue(undefined),
    expire: vi.fn().mockResolvedValue(undefined),
    zadd: vi.fn().mockResolvedValue(undefined),
    zremrangebyrank: vi.fn().mockResolvedValue(undefined),
  },
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));

const { llmProgressSingleton } = vi.hoisted(() => ({
  llmProgressSingleton: {
    lineagePrefilterStats: undefined,
    lineagePrefilterEnabled: undefined,
    adaptiveBatchEnabled: undefined,
    adaptiveBatchStats: undefined,
    callHistory: undefined,
    schemaFailures: undefined,
    routingTrace: undefined,
    recentEvents: undefined,
    watchdogTimeoutCount: undefined,
  } as Record<string, unknown>,
}));

vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn((patch: Record<string, unknown>) => {
    Object.assign(llmProgressSingleton, patch);
  }),
  llmProgress: llmProgressSingleton,
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

vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(),
  prewarmIfCold: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../lib/llmDLQ.js', () => ({
  enqueueDLQ: vi.fn().mockResolvedValue(undefined),
  DLQ_KEY: 'events:llm-dlq',
}));

vi.mock('../../lib/llmExtractorWatchdog.js', () => ({
  withBatchWatchdog: vi.fn(async (batchFn: () => Promise<unknown>) => batchFn()),
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

// ---------------------------------------------------------------------------
// Imports — must come AFTER vi.mock so the module loader picks up the stubs.
// ---------------------------------------------------------------------------

import { computeGroupLineageHash, GROUP_LINEAGE_KEY_PREFIX } from '../../lib/llmLineage.js';
import { callLLM as freeClaudeCallLLM } from '../../lib/freeClaudeRouter.js';
import { withBatchWatchdog } from '../../lib/llmExtractorWatchdog.js';
import { processEventGroupsV3 } from '../../lib/llmEventExtractor.v3.js';
import { llmProgress } from '../../lib/llmProgress.js';
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

function makeGroup(
  key: string,
  entityId: string,
  sourceUrls: string[] = ['https://example.com/x'],
  totalMentions = 5,
): EventGroup {
  return {
    key,
    entities: [makeEntity(entityId)],
    centroidLat: 35,
    centroidLng: 50,
    primaryCameo: '195',
    timestamp: BASE_TS,
    totalMentions,
    totalSources: 2,
    sourceUrls,
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

const cachedEventPayload = (groupKey: string): Record<string, unknown> => ({
  schemaVersion: 'v3',
  groupKey,
  location: {
    country: 'IR',
    admin1: null,
    city: null,
    neighborhood: null,
    landmark: null,
    confidence: 0.9,
  },
  type: 'airstrike',
  confidence: 0.9,
  reasoning: 'cached',
  weaponType: null,
  targetType: null,
  timeOfDay: null,
  durationMinutes: null,
  actors: [],
  severity: 'medium',
  summary: 'cached summary',
  casualties: { killed: 0, injured: 0, unknown: false },
  sourceCount: 1,
});

const watchdogPassThrough = async <T>(fn: () => Promise<T>): Promise<T> => fn();

beforeEach(() => {
  vi.mocked(freeClaudeCallLLM).mockReset();
  vi.mocked(withBatchWatchdog).mockReset();
  vi.mocked(withBatchWatchdog).mockImplementation(watchdogPassThrough);
  redisGetMock.mockReset();
  redisGetMock.mockResolvedValue(null);
  redisSetMock.mockReset();
  redisSetexMock.mockReset();
  // Reset llmProgress fields per test (mutate in place — module singleton).
  for (const k of Object.keys(llmProgress)) {
    (llmProgress as Record<string, unknown>)[k] = undefined;
  }
  // Reset env flags to default OFF.
  mockEnv.V3_LINEAGE_PREFILTER = false;
});

describe('lineage pre-filter (D-18)', () => {
  it('computeGroupLineageHash is deterministic — same group input → same hex digest', () => {
    const a = computeGroupLineageHash({
      key: 'g1',
      sourceUrls: ['https://a.com', 'https://b.com'],
      totalMentions: 5,
    });
    const b = computeGroupLineageHash({
      key: 'g1',
      sourceUrls: ['https://a.com', 'https://b.com'],
      totalMentions: 5,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computeGroupLineageHash sorts sourceUrls — order-permuted input produces identical hash (defends against upstream ordering noise)', () => {
    const ordered = computeGroupLineageHash({
      key: 'g1',
      sourceUrls: ['https://a.com', 'https://b.com', 'https://c.com'],
      totalMentions: 5,
    });
    const permuted = computeGroupLineageHash({
      key: 'g1',
      sourceUrls: ['https://c.com', 'https://a.com', 'https://b.com'],
      totalMentions: 5,
    });
    expect(ordered).toBe(permuted);
  });

  it('V3_LINEAGE_PREFILTER=false → pre-filter loop is bypassed entirely; all groups pass to LLM call (regression)', async () => {
    mockEnv.V3_LINEAGE_PREFILTER = false;
    vi.mocked(freeClaudeCallLLM).mockResolvedValue({
      content: validBatchResponse('g1', 'g2'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];

    await processEventGroupsV3(groups);

    expect(redisGetMock).not.toHaveBeenCalled();
    expect(freeClaudeCallLLM).toHaveBeenCalledTimes(1);
    expect(llmProgress.lineagePrefilterEnabled).toBe(false);
  });

  it('V3_LINEAGE_PREFILTER=true + cache hit AND age < 7d → group skipped, cached event pushed to results, lineagePrefilterStats.hitCount increments', async () => {
    mockEnv.V3_LINEAGE_PREFILTER = true;
    const fresh = makeGroup('g1', 'e1');
    const stale = makeGroup('g2', 'e2');
    const freshHash = computeGroupLineageHash({
      key: fresh.key,
      sourceUrls: fresh.sourceUrls,
      totalMentions: fresh.totalMentions,
    });
    const freshKey = `${GROUP_LINEAGE_KEY_PREFIX}${freshHash}`;
    const recentTs = Date.now() - 1_000; // 1s ago

    redisGetMock.mockImplementation(async (key: string) => {
      if (key === freshKey) {
        return JSON.stringify({
          event: cachedEventPayload('g1'),
          ts: recentTs,
        });
      }
      return null;
    });

    vi.mocked(freeClaudeCallLLM).mockResolvedValue({
      content: validBatchResponse('g2'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });

    const result = await processEventGroupsV3([fresh, stale]);

    expect(result.events?.length).toBe(2);
    const groupKeys = (result.events ?? []).map((e) => e.groupKey).sort();
    expect(groupKeys).toEqual(['g1', 'g2']);
    expect(llmProgress.lineagePrefilterStats).toEqual({ hitCount: 1, missCount: 1 });
    // freeClaudeCallLLM was only invoked for the missed group g2.
    expect(freeClaudeCallLLM).toHaveBeenCalledTimes(1);
  });

  it('V3_LINEAGE_PREFILTER=true + cache hit AND age >= 7d → group falls through to LLM call (TTL-expiry semantics)', async () => {
    mockEnv.V3_LINEAGE_PREFILTER = true;
    const group = makeGroup('g1', 'e1');
    const hash = computeGroupLineageHash({
      key: group.key,
      sourceUrls: group.sourceUrls,
      totalMentions: group.totalMentions,
    });
    const cacheKey = `${GROUP_LINEAGE_KEY_PREFIX}${hash}`;
    const expiredTs = Date.now() - 8 * 24 * 3600 * 1000; // 8d ago

    redisGetMock.mockImplementation(async (key: string) => {
      if (key === cacheKey) {
        return JSON.stringify({
          event: cachedEventPayload('g1'),
          ts: expiredTs,
        });
      }
      return null;
    });

    vi.mocked(freeClaudeCallLLM).mockResolvedValue({
      content: validBatchResponse('g1'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });

    await processEventGroupsV3([group]);

    expect(freeClaudeCallLLM).toHaveBeenCalledTimes(1);
    expect(llmProgress.lineagePrefilterStats).toEqual({ hitCount: 0, missCount: 1 });
  });

  it('V3_LINEAGE_PREFILTER=true + cache miss → group falls through to LLM call, lineagePrefilterStats.missCount increments', async () => {
    mockEnv.V3_LINEAGE_PREFILTER = true;
    const groups = [makeGroup('g1', 'e1'), makeGroup('g2', 'e2')];
    redisGetMock.mockResolvedValue(null);
    vi.mocked(freeClaudeCallLLM).mockResolvedValue({
      content: validBatchResponse('g1', 'g2'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });

    await processEventGroupsV3(groups);

    expect(redisGetMock).toHaveBeenCalledTimes(2);
    expect(freeClaudeCallLLM).toHaveBeenCalledTimes(1);
    expect(llmProgress.lineagePrefilterStats).toEqual({ hitCount: 0, missCount: 2 });
  });

  it('lineagePrefilterEnabled mirrors env.V3_LINEAGE_PREFILTER on the llmProgress singleton update', async () => {
    mockEnv.V3_LINEAGE_PREFILTER = true;
    redisGetMock.mockResolvedValue(null);
    vi.mocked(freeClaudeCallLLM).mockResolvedValue({
      content: validBatchResponse('g1'),
      routing: [
        { provider: 'nvidia_nim', model: 'qwen', reason: 'primary', timestamp: Date.now() },
      ],
    });

    await processEventGroupsV3([makeGroup('g1', 'e1')]);

    expect(llmProgress.lineagePrefilterEnabled).toBe(true);
  });
});
