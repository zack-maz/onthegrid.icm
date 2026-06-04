// @vitest-environment node
/**
 * Phase 32 Plan 32-03 Task 3 — cron post-step (probe sweep + auto-prune)
 * integration coverage.
 *
 * Tests that `runRefreshExtraction`'s `safeWaitUntil` IIFE body now runs:
 *   1. existing extraction work
 *   2. buildProbeCandidates() — Plan 32-02 export
 *   3. runProbeSweep({eventIdsWithUrls, deadlineMs}) — Plan 32-02 export
 *   4. pruneDeadUrlEvents({trigger:'cron'}) — Plan 32-03 Task 1 export
 *      (gated on `Date.now() < deadlineMs`)
 *
 * Strategy: mock processEventGroups + geocodeEnrichedEvents (the
 * existing extraction work) so the IIFE completes quickly, then mock
 * the three urlLiveness exports and assert call ordering via
 * `mock.invocationCallOrder`.
 *
 * Deadline elapsed path: drive `cronStart` so `Date.now() >= deadlineMs`
 * by the time prune would fire — pruneDeadUrlEvents MUST NOT be called.
 *
 * Pattern: hoisted vi.mock + dynamic import after registration.
 * `safeWaitUntil` is exported as a sync void function that schedules the
 * IIFE; in test we await the returned promise so assertions can fire.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ConflictEventEntity } from '../../types.js';

expect(process.env.NODE_ENV).toBe('test');

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockProcessEventGroups,
  mockGeocodeEnrichedEvents,
  mockBuildProbeCandidates,
  mockRunProbeSweep,
  mockPruneDeadUrlEvents,
  mockRunEval,
} = vi.hoisted(() => ({
  mockProcessEventGroups: vi.fn(async () => ({
    events: [],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  })),
  mockGeocodeEnrichedEvents: vi.fn(async () => []),
  mockBuildProbeCandidates: vi.fn(async () => [{ eventId: 'e1', url: 'https://example.com/a' }]),
  mockRunProbeSweep: vi.fn(async () => ({ probed: 1, skippedBudget: 0 })),
  mockPruneDeadUrlEvents: vi.fn(async () => ({ prunedCount: 0, prunedIds: [] as string[] })),
  mockRunEval: vi.fn(async () => ({ within5km: 0, within20km: 0, within100km: 0, total: 0 })),
}));

const cacheStore = new Map<string, { data: unknown; fetchedAt: number }>();

vi.mock('../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config.js')>();
  return { ...actual };
});

vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 0),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    sadd: vi.fn(async () => 1),
    scard: vi.fn(async () => 1),
    spop: vi.fn(async () => null),
    srem: vi.fn(async () => 1),
    scan: vi.fn(async () => ['0', []]),
    decr: vi.fn(async () => 0),
    decrby: vi.fn(async () => 0),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
  cacheSet: vi.fn(async (key: string, data: unknown) => {
    cacheStore.set(key, { data, fetchedAt: Date.now() });
  }),
  cacheGetSafe: vi.fn(async <T>(key: string) => {
    const e = cacheStore.get(key);
    if (!e) return null;
    return { data: e.data as T, stale: false, lastFresh: e.fetchedAt };
  }),
  cacheSetSafe: vi.fn(async (key: string, data: unknown) => {
    cacheStore.set(key, { data, fetchedAt: Date.now() });
  }),
}));

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(async () => null),
  isLLMConfigured: vi.fn(() => true),
}));

vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: vi.fn(() => [
    {
      key: 'grp-cron',
      entities: [],
      centroidLat: 0,
      centroidLng: 0,
      primaryCameo: '195',
      timestamp: Date.now(),
      totalMentions: 1,
      totalSources: 1,
      sourceUrls: [],
    },
  ]),
}));

// Phase 38 LLM-PURGE-01 — the `llmEventExtractor.js` stub barrel was deleted;
// the extraction pipeline now calls the v3 extractor directly. geocodeEnrichedEventsV3
// returns a flat array (no tagged `{events}` wrapper).
vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  processEventGroupsV3: (...args: unknown[]) => mockProcessEventGroups(...(args as [])),
  geocodeEnrichedEventsV3: (...args: unknown[]) => mockGeocodeEnrichedEvents(...(args as [])),
}));

vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: (...args: unknown[]) => mockRunEval(...(args as [])),
  runAdversarialEval: vi.fn(async () => ({
    total: 0,
    blocked: 0,
    leaked: 0,
    score: 0,
    byCategory: {},
    generatedAt: new Date().toISOString(),
  })),
}));

vi.mock('../../lib/llmTokenBudget.js', () => ({
  shouldPauseNewEvents: vi.fn(async () => false),
  prioritizeBySeverity: vi.fn(async (groups: unknown[]) => groups),
  getDailyTokens: vi.fn(async () => 0),
  incrDailyTokens: vi.fn(async () => 0),
  budgetState: vi.fn(() => 'ok' as const),
  computeSeverityScore: vi.fn(() => 0),
  DAILY_LIMITS: { cerebras: 1_000_000, groq: 200_000 } as const,
  todayKey: vi.fn((p: string) => `llm:tokens:${p}:d`),
}));

vi.mock('../../cache/devFileCache.js', () => ({
  saveDevLLMCache: vi.fn(),
  loadDevLLMCache: vi.fn(() => null),
  saveDevLLMCacheV2: vi.fn(),
  loadDevLLMCacheV2: vi.fn(() => null),
}));

// safeWaitUntil — in production it's void (fire-and-forget per D-12).
// For the integration test we need the IIFE to FINISH before assertions
// fire — so the mock captures the promise into a shared array the
// helper below awaits. This mirrors the @vercel/functions waitUntil
// contract in tests without changing the production semantics.
const pendingPromises: Promise<unknown>[] = [];
vi.mock('../../lib/safeWaitUntil.js', () => ({
  safeWaitUntil: (p: Promise<unknown>) => {
    pendingPromises.push(p);
  },
}));

/** Drain all in-flight safeWaitUntil promises so post-step assertions
 *  can fire against the completed IIFE body. */
async function flushSafeWaitUntil(): Promise<void> {
  // Drain in waves — the IIFE may schedule further microtasks.
  while (pendingPromises.length > 0) {
    const batch = pendingPromises.splice(0);
    await Promise.allSettled(batch);
  }
}

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// urlLiveness — mock the three exports Plan 32-03 Task 3 wires in.
vi.mock('../../lib/urlLiveness.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/urlLiveness.js')>();
  return {
    ...actual,
    buildProbeCandidates: (...args: unknown[]) => mockBuildProbeCandidates(...(args as [])),
    runProbeSweep: (...args: unknown[]) => mockRunProbeSweep(...(args as [])),
    pruneDeadUrlEvents: (...args: unknown[]) => mockPruneDeadUrlEvents(...(args as [])),
    SWEEP_SAFETY_MARGIN_MS: 60_000,
  };
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function seedRawGdelt(): void {
  const raw: ConflictEventEntity[] = [
    {
      id: 'gdelt-1',
      type: 'airstrike',
      lat: 33,
      lng: 44,
      timestamp: Date.now(),
      label: 'seed',
      data: {
        eventType: 'Aerial weapons',
        subEventType: 'CAMEO 195',
        fatalities: 0,
        actor1: 'USA',
        actor2: 'IRN',
        notes: '',
        source: 'https://seed.example/x',
        goldsteinScale: -10,
        locationName: 'Baghdad',
        cameoCode: '195',
        geoPrecision: 'precise' as const,
        confidence: 0.9,
      },
    },
  ];
  cacheStore.set('events:gdelt', { data: raw, fetchedAt: Date.now() });
}

beforeEach(() => {
  cacheStore.clear();
  pendingPromises.length = 0;
  mockProcessEventGroups.mockClear();
  mockGeocodeEnrichedEvents.mockClear();
  mockBuildProbeCandidates.mockClear();
  mockRunProbeSweep.mockClear();
  mockPruneDeadUrlEvents.mockClear();
  mockRunEval.mockClear();

  // Reset default behaviors
  mockProcessEventGroups.mockResolvedValue({
    events: [],
    matchedNewsByGroup: new Map(),
    bellingcatByGroup: new Map(),
  });
  mockBuildProbeCandidates.mockResolvedValue([{ eventId: 'e1', url: 'https://example.com/a' }]);
  mockRunProbeSweep.mockResolvedValue({ probed: 1, skippedBudget: 0 });
  mockPruneDeadUrlEvents.mockResolvedValue({ prunedCount: 0, prunedIds: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Phase 32 D-02 / D-11 — cron post-step (probe sweep + auto-prune)', () => {
  it('after runRefreshExtraction resolves, runProbeSweep is called with a future deadlineMs', async () => {
    seedRawGdelt();

    const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
    const result = await runRefreshExtraction({ triggeredBy: 'cron' });
    expect(result.dispatched).toBe(true);
    await flushSafeWaitUntil();

    expect(mockRunProbeSweep).toHaveBeenCalledTimes(1);
    const sweepArg = mockRunProbeSweep.mock.calls[0]?.[0] as {
      eventIdsWithUrls: Array<{ eventId: string; url: string }>;
      deadlineMs: number;
    };
    expect(sweepArg.eventIdsWithUrls).toEqual([{ eventId: 'e1', url: 'https://example.com/a' }]);
    expect(sweepArg.deadlineMs).toBeGreaterThan(Date.now());
  });

  it('after probe sweep, pruneDeadUrlEvents({trigger:cron}) is called', async () => {
    seedRawGdelt();

    const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
    await runRefreshExtraction({ triggeredBy: 'cron' });
    await flushSafeWaitUntil();

    expect(mockPruneDeadUrlEvents).toHaveBeenCalledTimes(1);
    expect(mockPruneDeadUrlEvents.mock.calls[0]?.[0]).toEqual({ trigger: 'cron' });
  });

  it('runProbeSweep is invoked BEFORE pruneDeadUrlEvents (dispatch order)', async () => {
    seedRawGdelt();

    const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
    await runRefreshExtraction({ triggeredBy: 'cron' });
    await flushSafeWaitUntil();

    expect(mockBuildProbeCandidates).toHaveBeenCalled();
    expect(mockRunProbeSweep).toHaveBeenCalled();
    expect(mockPruneDeadUrlEvents).toHaveBeenCalled();

    const buildOrder = mockBuildProbeCandidates.mock.invocationCallOrder[0]!;
    const sweepOrder = mockRunProbeSweep.mock.invocationCallOrder[0]!;
    const pruneOrder = mockPruneDeadUrlEvents.mock.invocationCallOrder[0]!;

    expect(buildOrder).toBeLessThan(sweepOrder);
    expect(sweepOrder).toBeLessThan(pruneOrder);
  });

  it('runRefreshResult returns dispatched:true (existing contract preserved)', async () => {
    seedRawGdelt();

    const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
    const result = await runRefreshExtraction({ triggeredBy: 'cron' });

    expect(result.dispatched).toBe(true);
    expect(result.schemaVersion).toBe('v3');
  });
});
