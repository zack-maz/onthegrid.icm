// @vitest-environment node
/**
 * Phase 35 D-12 (SIMPLIFY-02) one-key discipline guard.
 *
 * Asserts:
 *  1. `events:llm:v3` (terminal key) holds `ConflictEventEntity[]` shape —
 *     every element has `id/lat/lng/type` and NEVER the envelope keys
 *     `progress/complete/generatedAt`. This guards against a regression of
 *     Phase 27.4.1 commit `a5c8846`.
 *  2. `runEval()` is called exactly ONCE per run (Pitfall 8). The
 *     intermediate-flush helper does NOT call runEval.
 *
 * Phase 35 D-12 (SIMPLIFY-02): the prior Test 2 (`events:llm:v3:partial`
 * holds LLMCachePayload envelope) was deleted alongside the writePartialCache
 * writer retirement. The terminal-key Test 1 is preserved; the one-key
 * discipline replaces the prior two-key discipline.
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
    // Phase 30 D-04 (SIMPLIFY-01): legacy flush-cadence env var stripped
    // from mockEnv when the Zod schema entry was deleted in Plan 03 Task 2.
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
  // GDELT-MATCH-02 — pipeline runs dedup pre-pass before grouping; identity
  // mock keeps these assertions driving group keys through groupGdeltRowsMock.
  dedupHighConfidence: vi.fn((entities: unknown[]) => entities),
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
      // Phase 35 D-12 (SIMPLIFY-02): writePartialCache writer retired, so this
      // mock no longer simulates the partial-key write. Only onBatchComplete
      // drives terminal-key writes via the pipeline now.
      const ret = onBatchComplete?.(c, total);
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        await ret;
      }
    }
    return {
      schemaVersion: 'v3' as const,
      events: allEvents,
      matchedNewsByGroup: new Map(),
      bellingcatByGroup: new Map(),
    };
  },
);

// Phase 38 LLM-PURGE-01 — pipeline now imports the v3 extractor directly
// (the `llmEventExtractor.js` stub barrel was deleted). geocodeEnrichedEventsV3
// takes the v3-native signature `(events, groupsByKey, matchedNewsByGroup,
// bellingcatByGroup, onComplete)` and returns a flat array (no tagged shape).
const geocodeEnrichedEventsMock = vi.fn(
  async (
    events: Array<Record<string, unknown>>,
    _groupsByKey: any,
    _matchedNews: any,
    _bellingcat: any,
    onProgress?: any,
  ) => {
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
    return out;
  },
);

vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  processEventGroupsV3: processEventGroupsMock,
  geocodeEnrichedEventsV3: geocodeEnrichedEventsMock,
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
});

describe('runRefreshExtraction — Phase 35 D-12 one-key discipline + Pitfall 8', () => {
  it('one-key discipline: events:llm:v3 holds ConflictEventEntity[] (terminal-key shape)', async () => {
    await driveRun(12);

    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    // Phase 30 D-04 (SIMPLIFY-01): the prior assertion was
    // `.toBeGreaterThanOrEqual(2)` (1 intermediate flush at batch 10 +
    // 1 terminal). With the periodic-flush mechanism retired the terminal
    // write is the sole writer, so the happy-path expectation is exactly 1.
    expect(terminalCalls.length).toBe(1);

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

  it('intermediate flushes do NOT call runEval() (Pitfall 8)', async () => {
    await driveRun(12);
    // runEval is called once after the FINAL geocode — never per intermediate
    // flush. If a regression makes the periodic-flush helper call runEval(),
    // daily LLM token spend triples.
    expect(runEvalSpy).toHaveBeenCalledTimes(1);
  });

  it('mergeAndPersistLlmEntities is called exactly once per successful run (D-04 / SIMPLIFY-01)', async () => {
    await driveRun(12);
    // mergeAndPersistLlmEntities is the writer of events:llm:v3. Pre-Phase-30
    // it fired every N batches (incremental flush); Phase 30 D-04 retires
    // that tier and the helper is now invoked exactly once at end-of-pipeline.
    // Mirrors the runEval-exactly-once assertion shape above.
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });
});
