// @vitest-environment node
/**
 * Phase 28.2.6 Plan 01 Task 2 — D-04 / D-11 two-key discipline guard.
 *
 * Asserts:
 *  1. `events:llm:v3` (terminal key) holds `ConflictEventEntity[]` shape —
 *     every element has `id/lat/lng/type` and NEVER the envelope keys
 *     `progress/complete/generatedAt`. This guards against a regression of
 *     Phase 27.4.1 commit `a5c8846`.
 *  2. `events:llm:v3:partial` (observability key) holds `LLMCachePayload`
 *     envelope shape `{events, progress, complete, generatedAt}`. The
 *     extractor's writePartialCache is the only writer and we never confuse
 *     the two keys.
 *  3. `runEval()` is called exactly ONCE per run (Pitfall 8). The
 *     intermediate-flush helper does NOT call runEval.
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
      const batchEvents = enrichedEventsByBatch[c] ?? [];
      allEvents.push(...batchEvents);
      // Simulate the v3 extractor's writePartialCache writing an envelope to
      // events:llm:v3:partial for each batch — this is what production does
      // (per Phase 27.4.1 D-07). Required to exercise Test 2's assertion.
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
    // Final partial-cache write with complete=true, mirroring v3 extractor.
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

async function driveRun(numBatches: number) {
  totalBatchesForRun = numBatches;
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
  mockEnv.LLM_FLUSH_EVERY_N_BATCHES = 5;
});

describe('runRefreshExtraction — D-04/D-11 two-key discipline + Pitfall 8', () => {
  it('two-key discipline: events:llm:v3 holds ConflictEventEntity[] (NOT LLMCachePayload envelope)', async () => {
    await driveRun(12);

    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    // Expect at least 2 — one intermediate flush at batch 10, one final.
    expect(terminalCalls.length).toBeGreaterThanOrEqual(2);

    for (const [, data] of terminalCalls) {
      expect(Array.isArray(data)).toBe(true);
      const arr = data as Array<Record<string, unknown>>;
      expect(arr.length).toBeGreaterThan(0);
      const first = arr[0]!;
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('lat');
      expect(first).toHaveProperty('lng');
      expect(first).toHaveProperty('type');
      // Negative shape — must NOT have envelope keys.
      expect(first).not.toHaveProperty('progress');
      expect(first).not.toHaveProperty('complete');
      expect(first).not.toHaveProperty('generatedAt');
    }
  });

  it('two-key discipline: events:llm:v3:partial holds LLMCachePayload envelope', async () => {
    await driveRun(12);

    const partialCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3:partial');
    expect(partialCalls.length).toBeGreaterThan(0);

    for (const [, data] of partialCalls) {
      const env = data as Record<string, unknown>;
      expect(env).toHaveProperty('events');
      expect(env).toHaveProperty('progress');
      expect(env).toHaveProperty('complete');
      expect(env).toHaveProperty('generatedAt');
      expect(typeof env.progress).toBe('string');
    }
  });

  it('intermediate flushes do NOT call runEval() (Pitfall 8)', async () => {
    await driveRun(12);
    // runEval is called once after the FINAL geocode — never per intermediate
    // flush. If a regression makes the periodic-flush helper call runEval(),
    // daily LLM token spend triples.
    expect(runEvalSpy).toHaveBeenCalledTimes(1);
  });
});
