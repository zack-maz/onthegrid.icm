// @vitest-environment node
/**
 * Phase 28.2.6 Plan 01 Task 1 — D-03 cadence assertion.
 *
 * Drives `runRefreshExtraction` through a controlled number of batches and
 * asserts that `cacheSetSafe('events:llm:v3', ...)` fires every N batches
 * (intermediate flush) AND once more at end-of-pipeline (final flush).
 *
 * The cadence default N=10 is encoded in `env.LLM_FLUSH_EVERY_N_BATCHES`;
 * tests vary the value via the hoisted mockEnv to exercise the env-tunable
 * path without redeploys.
 *
 * Per RESEARCH §Pattern 3 + Pitfall 2: the cadence counter MUST live inside
 * the `onBatchComplete` callback (driven by `finishBatch`'s monotonic
 * `++completedBatchesCounter`). We pin LLM_V3_CONCURRENCY=1 here so completion
 * order equals submission order — keeps the cadence assertion deterministic.
 *
 * Per Pitfall 4: each terminal-key write merges with prior cache via id-key
 * Map. The "no premature flush" case proves N=10 is honored (no clobber under
 * concurrency=12 in prod).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — registered BEFORE import() of the module under test.
// ---------------------------------------------------------------------------

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: 'fake',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 90000,
    LLM_V3_CONCURRENCY: 1, // serialize so completion order == submission order
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    LLM_FLUSH_EVERY_N_BATCHES: 10, // NEW env var introduced by Task 4a
    CRON_SECRET: '',
  },
}));

// In-memory cache store — captures terminal-key writes for assertion.
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
  isPipelineV3: vi.fn().mockReturnValue(true),
  isPipelineV2: vi.fn().mockReturnValue(false),
  getPipelineVersion: vi.fn().mockReturnValue('v3'),
  getPipelineOverride: vi.fn().mockReturnValue('v3'),
  setPipelineOverride: vi.fn(),
}));

// Mock @vercel/functions so any waitUntil call (Plan 02 will introduce one)
// invokes the promise eagerly under test.
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    void p.catch(() => {});
  },
}));

// Logger — silent to keep test output clean.
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

// Configured LLM passthrough — required so the configured-guard at
// runRefreshExtraction:154 doesn't short-circuit before the IIFE.
vi.mock('../../adapters/llm-provider.js', () => ({
  isLLMConfigured: () => true,
  callLLM: vi.fn(),
}));

// Token budget helpers — no soft-cap pause, prioritize as-is.
vi.mock('../../lib/llmTokenBudget.js', () => ({
  shouldPauseNewEvents: vi.fn().mockResolvedValue(false),
  prioritizeBySeverity: vi.fn(async (groups: unknown[]) => groups),
}));

// Dev file cache — no-ops.
vi.mock('../../cache/devFileCache.js', () => ({
  saveDevLLMCache: vi.fn(),
  saveDevLLMCacheV2: vi.fn(),
}));

// Source tier — passthrough.
vi.mock('../../lib/sourceTiers.js', () => ({
  getHighestTier: vi.fn().mockReturnValue(2),
}));

// Eval harness — captured so we can assert it was called only once per run.
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

// Event grouping — passthrough builder maps each raw entity to a single group.
const groupGdeltRowsMock = vi.fn();
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: groupGdeltRowsMock,
}));

// llmProgress singleton — mutating mock so updateProgress shows through to
// runRefreshExtraction's pipeline-busy guard at L175-181.
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

// Mock the barrel processEventGroups + geocodeEnrichedEvents so we drive
// batch completions deterministically. processEventGroups receives an
// onBatchComplete callback; we invoke it N times serially to simulate N
// batches completing.
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
      // Mirror v3 extractor's writePartialCache semantics — write the
      // running EnrichedEventV3[] array to the partial-cache key after
      // every batch so the periodic-flush callback (which reads
      // events:llm:v3:partial via cacheGetSafe) sees the just-completed
      // window. The partial-cache shape is LLMCachePayload (envelope).
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
      // Drive the callback synchronously between batches.
      // Support both sync and async signatures (Task 3 widens to async).
      const ret = onBatchComplete?.(c, total);
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        await ret;
      }
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
  const out = events.map((e, i) => ({
    ...e,
    resolvedLat: 35.0 + i * 0.001,
    resolvedLng: 50.0 + i * 0.001,
    displayName: `Test Site ${(e as { groupKey: string }).groupKey}`,
    geocodeProvenance: 'nominatim-direct' as const,
    precision: 'city' as const,
    suspect: false,
    actionGeoDistanceKm: 0,
  }));
  if (typeof onProgress === 'function') {
    onProgress(out.length, out.length);
  }
  return { schemaVersion: input.schemaVersion, events: out };
});

vi.mock('../../lib/llmEventExtractor.js', () => ({
  processEventGroups: processEventGroupsMock,
  geocodeEnrichedEvents: geocodeEnrichedEventsMock,
}));

vi.mock('../../lib/llmEventExtractor.v2.js', () => ({
  BATCH_SIZE: 2,
}));

// ---------------------------------------------------------------------------
// Helpers — build deterministic groups + enriched-event payloads.
// ---------------------------------------------------------------------------

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

function makeGroup(key: string): {
  key: string;
  entities: MinimalEntity[];
  centroidLat: number;
  centroidLng: number;
  primaryCameo: string;
  timestamp: number;
  totalMentions: number;
  totalSources: number;
  sourceUrls: string[];
} {
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

/**
 * Drive a fresh `runRefreshExtraction` run with N batches, each producing
 * 1 enriched v3 event. Returns the resolved RunRefreshResult.
 */
async function driveRun(numBatches: number) {
  totalBatchesForRun = numBatches;
  for (let c = 1; c <= numBatches; c++) {
    enrichedEventsByBatch[c] = [makeEnrichedV3Event(`g${c}`)];
  }
  // Stub the raw cache so the helper proceeds past the no_raw_events guard.
  const rawEvents = Array.from({ length: numBatches }, (_, i) => makeRawEntity(`raw-${i + 1}`));
  cacheStore.set('events:gdelt', rawEvents);
  groupGdeltRowsMock.mockReturnValue(
    Array.from({ length: numBatches }, (_, i) => makeGroup(`g${i + 1}`)),
  );

  const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
  await runRefreshExtraction({ triggeredBy: 'cron', forceCooldown: true });
  // Drain microtasks so the IIFE inside runRefreshExtraction has a chance to
  // complete. Multiple ticks are required because the IIFE awaits multiple
  // levels of internal promises (extract -> geocode -> persist).
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
  // Reset llmProgress so the pipeline-busy guard doesn't block the next run.
  for (const k of Object.keys(llmProgressSingleton)) {
    delete llmProgressSingleton[k];
  }
  llmProgressSingleton.stage = 'idle';
  // Reset env to default cadence.
  mockEnv.LLM_FLUSH_EVERY_N_BATCHES = 10;
  mockEnv.LLM_V3_CONCURRENCY = 1;
});

describe('runRefreshExtraction — D-03 incremental terminal-key cadence', () => {
  it("cadence: cacheSetSafe('events:llm:v3', ...) is called every 10 batches", async () => {
    await driveRun(12);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("no premature flush: under 10 batches there is exactly ONE cacheSetSafe('events:llm:v3', ...) call (final-only)", async () => {
    await driveRun(5);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });

  it('configurable: LLM_FLUSH_EVERY_N_BATCHES=3 fires intermediate at batch 3 and 6', async () => {
    mockEnv.LLM_FLUSH_EVERY_N_BATCHES = 3;
    await driveRun(7);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    // Two intermediate flushes (batches 3 and 6) + 1 final flush = 3 total.
    expect(terminalCalls.length).toBe(3);
  });
});
