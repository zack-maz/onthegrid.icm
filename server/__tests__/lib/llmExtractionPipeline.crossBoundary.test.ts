// @vitest-environment node
/**
 * Phase 28.2.6 Plan 01 Task 2 — D-07 cross-function-boundary state preservation.
 *
 * Asserts that two consecutive partial runs (5 batches → simulated Vercel
 * function-kill, then 5 batches in a follow-up tick) produce the SAME final
 * cache state as one continuous 10-batch run. Locks in the resume invariant
 * provided by the existing `cachedLlmKeys` lineage filter at L213-221.
 *
 * Plus a Task 4b D-05 quality-invariant case that proves periodic-flush
 * geocode quality matches final-flush geocode quality on equivalent slices —
 * the closure-state matchedNews/bellingcat accumulators give the periodic
 * flush the same context the final flush has.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: 'fake',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 120_000, // Phase 30 D-02 retune (was 90_000)
    LLM_V3_CONCURRENCY: 1,
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    LLM_FLUSH_EVERY_N_BATCHES: 5,
    LLM_BATCH_SIZE: 2, // Phase 30 D-07 — env-tunable (was hard-coded const)
    CRON_SECRET: '',
  },
}));

const cacheStore = new Map<string, unknown>();
const cacheSetSpy = vi.fn(async (key: string, data: unknown, _ttl: number) => {
  cacheStore.set(key, data);
});
const cacheGetSpy = vi.fn(async (key: string, _maxAgeMs: number) =>
  cacheStore.has(key) ? { data: cacheStore.get(key), fetchedAt: Date.now() } : null,
);

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: cacheGetSpy,
  cacheSetSafe: cacheSetSpy,
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../config.js', () => ({
  env: mockEnv,
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    void p.catch(() => {});
  },
}));

// Phase 28.2.6 Plan 02 cross-plan defense — Task 3 swapped the IIFE wrapper
// from `void (async () => {...})()` to `safeWaitUntil((async () => {...})())`.
// The local-dev fallback in safeWaitUntil runs `promise.catch(...)` so the IIFE
// still executes under test, but we mock the shim itself for clarity + so a
// future regression that changes safeWaitUntil's local-dev path can't silently
// break these tests. The pre-existing `vi.mock('@vercel/functions', ...)` is
// retained as defense-in-depth — if anyone later removes the safeWaitUntil
// mock, the @vercel/functions mock still keeps the IIFE running under test.
vi.mock('../../lib/safeWaitUntil.js', () => ({
  safeWaitUntil: (p: Promise<unknown>) => {
    void p.catch(() => {});
  },
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

vi.mock('../../adapters/llm-provider.js', () => ({
  isLLMConfigured: () => true,
  callLLM: vi.fn(),
}));

vi.mock('../../lib/llmTokenBudget.js', () => ({
  shouldPauseNewEvents: vi.fn().mockResolvedValue(false),
  prioritizeBySeverity: vi.fn(async (groups: unknown[]) => groups),
}));

vi.mock('../../cache/devFileCache.js', () => ({
  saveDevLLMCache: vi.fn(),
  saveDevLLMCacheV2: vi.fn(),
}));

vi.mock('../../lib/sourceTiers.js', () => ({
  getHighestTier: vi.fn().mockReturnValue(2),
}));

const runEvalSpy = vi.fn().mockResolvedValue({
  score: 0.85,
  withinKm5: 30,
  withinKm20: 35,
  withinKm100: 40,
  total: 50,
});
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: runEvalSpy,
}));

const groupGdeltRowsMock = vi.fn();
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: groupGdeltRowsMock,
}));

const { llmProgressSingleton } = vi.hoisted(() => ({
  llmProgressSingleton: { stage: 'idle' } as Record<string, unknown>,
}));
vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn((patch: Record<string, unknown>) => {
    Object.assign(llmProgressSingleton, patch);
  }),
  resetProgress: vi.fn(() => {
    for (const k of Object.keys(llmProgressSingleton)) {
      delete llmProgressSingleton[k];
    }
    llmProgressSingleton.stage = 'grouping';
    llmProgressSingleton.startedAt = Date.now();
  }),
  llmProgress: llmProgressSingleton,
  buildSummary: vi.fn().mockReturnValue({}),
}));

let totalBatchesForRun = 0;
let abortAtBatch: number | null = null;
const enrichedEventsByBatch: Record<number, unknown[]> = {};

const processEventGroupsMock = vi.fn(
  async (
    _groups: unknown[],
    onBatchComplete?:
      | ((completed: number, total: number) => void)
      | ((completed: number, total: number) => Promise<void>),
  ) => {
    const total = totalBatchesForRun;
    const allEvents: unknown[] = [];
    for (let c = 1; c <= total; c++) {
      if (abortAtBatch !== null && c > abortAtBatch) {
        // Simulate Vercel function kill — batches beyond abortAtBatch never
        // produce events and never invoke the callback.
        break;
      }
      const batchEvents = enrichedEventsByBatch[c] ?? [];
      allEvents.push(...batchEvents);
      // Mirror v3 extractor's writePartialCache so the periodic-flush
      // callback can read the just-completed window from
      // events:llm:v3:partial.
      await cacheSetSpy(
        'events:llm:v3:partial',
        {
          events: allEvents.slice(),
          progress: `${c}/${total}`,
          complete: false,
          generatedAt: new Date().toISOString(),
        },
        9000,
      );
      const ret = onBatchComplete?.(c, total);
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        await ret;
      }
    }
    if (abortAtBatch !== null) {
      // Throw to short-circuit the rest of the IIFE — final geocode + cache
      // write never run. The pipeline's outer try/catch catches the error,
      // logs it, and the IIFE exits — same surface as a Vercel kill.
      throw new Error('SIMULATED_VERCEL_KILL');
    }
    // Final partial-cache write with complete=true.
    await cacheSetSpy(
      'events:llm:v3:partial',
      {
        events: allEvents.slice(),
        progress: `${total}/${total}`,
        complete: true,
        generatedAt: new Date().toISOString(),
      },
      9000,
    );
    return {
      schemaVersion: 'v3' as const,
      events: allEvents,
      matchedNewsByGroup: new Map(),
      bellingcatByGroup: new Map(),
    };
  },
);

const geocodeEnrichedEventsMock = vi.fn(async (input: any, _groups: any, onProgress?: any) => {
  const events = input.events as Array<Record<string, unknown>>;
  const out = events.map((e) => {
    const groupKey = (e as { groupKey: string }).groupKey;
    return {
      ...e,
      resolvedLat: 35.0 + groupKey.length * 0.001,
      resolvedLng: 50.0 + groupKey.length * 0.001,
      displayName: `Test Site ${groupKey}`,
      geocodeProvenance: 'nominatim-direct' as const,
      precision: 'city' as const,
      suspect: false,
      actionGeoDistanceKm: 0,
    };
  });
  if (typeof onProgress === 'function') {
    onProgress(out.length, out.length);
  }
  return { schemaVersion: input.schemaVersion, events: out };
});

vi.mock('../../lib/llmEventExtractor.js', () => ({
  processEventGroups: processEventGroupsMock,
  geocodeEnrichedEvents: geocodeEnrichedEventsMock,
}));

interface MinimalEntity {
  id: string;
  type: string;
  lat: number;
  lng: number;
  timestamp: number;
  label: string;
  data: Record<string, unknown>;
}

function makeRawEntity(id: string): MinimalEntity {
  return {
    id,
    type: 'airstrike',
    lat: 35,
    lng: 50,
    timestamp: Date.UTC(2026, 3, 15),
    label: 't',
    data: {
      eventType: 'Aerial weapons',
      cameoCode: '195',
      numMentions: 5,
      numSources: 2,
    },
  };
}

function makeGroup(key: string) {
  return {
    key,
    entities: [makeRawEntity(`raw-${key}`)],
    centroidLat: 35,
    centroidLng: 50,
    primaryCameo: '195',
    timestamp: Date.UTC(2026, 3, 15),
    totalMentions: 5,
    totalSources: 2,
    sourceUrls: ['https://example.com'],
  };
}

function makeEnrichedV3Event(groupKey: string): Record<string, unknown> {
  return {
    schemaVersion: 'v3',
    groupKey,
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
  };
}

async function driveRun(numBatches: number, opts?: { abortAt?: number }) {
  totalBatchesForRun = numBatches;
  abortAtBatch = opts?.abortAt ?? null;
  for (let c = 1; c <= numBatches; c++) {
    enrichedEventsByBatch[c] = [makeEnrichedV3Event(`g${c}`)];
  }
  const rawEvents = Array.from({ length: numBatches }, (_, i) => makeRawEntity(`raw-${i + 1}`));
  cacheStore.set('events:gdelt', rawEvents);
  groupGdeltRowsMock.mockReturnValue(
    Array.from({ length: numBatches }, (_, i) => makeGroup(`g${i + 1}`)),
  );

  const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
  await runRefreshExtraction({ triggeredBy: 'cron', forceCooldown: true });
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const sortById = <T extends { id?: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));

beforeEach(() => {
  cacheStore.clear();
  cacheSetSpy.mockClear();
  cacheGetSpy.mockClear();
  processEventGroupsMock.mockClear();
  geocodeEnrichedEventsMock.mockClear();
  groupGdeltRowsMock.mockClear();
  runEvalSpy.mockClear();
  for (const k of Object.keys(llmProgressSingleton)) {
    delete llmProgressSingleton[k];
  }
  llmProgressSingleton.stage = 'idle';
  abortAtBatch = null;
  mockEnv.LLM_FLUSH_EVERY_N_BATCHES = 5;
});

describe('runRefreshExtraction — D-07 cross-function-boundary state preservation', () => {
  it('two consecutive partial 5-batch runs produce same final state as one continuous 10-batch run', async () => {
    // Run 1: drive 10 groups but abort the IIFE after batch 5 (simulated kill).
    await driveRun(10, { abortAt: 5 });
    const partialAfterRun1 = cacheStore.get('events:llm:v3') as Array<{ id: string }> | undefined;
    // After 5 batches with FLUSH_EVERY_N=5, there should be exactly 5 events
    // persisted by the periodic flush (Task 4b will land this behavior).
    expect(Array.isArray(partialAfterRun1)).toBe(true);
    expect(partialAfterRun1!.length).toBe(5);

    // Run 2: relaunch with cacheStore intact. The lineage filter at
    // runRefreshExtraction:213-221 sees the 5 ids in the cache and skips
    // them; processes the remaining 5 + final flush.
    // Reset progress so the busy-guard doesn't block.
    llmProgressSingleton.stage = 'idle';
    await driveRun(10);
    const finalAfterRun2 = cacheStore.get('events:llm:v3') as Array<{ id: string }>;

    // Run 3 (control): cold-cache continuous 10-batch run.
    cacheStore.clear();
    llmProgressSingleton.stage = 'idle';
    await driveRun(10);
    const finalAfterRun3 = cacheStore.get('events:llm:v3') as Array<{ id: string }>;

    expect(sortById(finalAfterRun2)).toEqual(sortById(finalAfterRun3));
  });

  it('periodic flush geocode quality equals final flush geocode quality (D-05)', async () => {
    // Drive a clean 10-batch run with FLUSH_EVERY_N=5 — periodic flush at 5,
    // final flush at 10. Capture every terminal-key write.
    await driveRun(10);

    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBeGreaterThanOrEqual(2);

    interface PrecisionEntity {
      id?: string;
      data?: { precision?: string };
    }
    const buildPrecisionHistogram = (entities: PrecisionEntity[]) => {
      const hist: Record<string, number> = {};
      for (const e of entities) {
        const p = e.data?.precision ?? 'unknown';
        hist[p] = (hist[p] ?? 0) + 1;
      }
      return hist;
    };

    const periodicSlice = terminalCalls[0]![1] as PrecisionEntity[];
    const finalAll = terminalCalls[terminalCalls.length - 1]![1] as PrecisionEntity[];

    // The events from the periodic-flush slice should exist (with same id) in
    // the final all-events array. Their precision histograms must match —
    // proves periodic-flush geocode quality equals final-flush geocode quality.
    const finalSliceMatchingPeriodic = finalAll.filter((e) =>
      periodicSlice.some((p) => p.id === e.id),
    );

    expect(buildPrecisionHistogram(finalSliceMatchingPeriodic)).toEqual(
      buildPrecisionHistogram(periodicSlice),
    );
  });
});
