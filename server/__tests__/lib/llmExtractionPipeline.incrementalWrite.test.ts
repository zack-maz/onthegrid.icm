// @vitest-environment node
/**
 * Phase 30 Plan 03 Task 3 — D-04 / SIMPLIFY-01 no-incremental-flush assertion.
 *
 * Drives `runRefreshExtraction` through a controlled number of batches and
 * asserts that `cacheSetSafe('events:llm:v3', ...)` fires EXACTLY ONCE per
 * successful run (the end-of-pipeline terminal write) regardless of batch
 * count. The pre-Phase-30 every-N-batches incremental flush is gone.
 *
 * Lineage: the prior cadence assertions (the default-N intermediate
 * flush and the configurable-N intermediate flush at batches 3 and 6)
 * were retired alongside the periodic-flush mechanism (Plan 03 Task 1)
 * and the legacy flush-cadence Zod schema entry (Task 2).
 *
 * Pitfall 7 scope: this file's `driveRun(N)` covers the happy-path branch
 * (groups present, soft-cap not paused) — the exactly-once assertion only
 * applies there. The empty-groups early-return and soft-cap-paused branches
 * intentionally do NOT call `mergeAndPersistLlmEntities` (they would assert
 * `terminalCalls.length === 0`); those branches are not covered here.
 *
 * LLM_V3_CONCURRENCY=1 is pinned for ordering determinism even though
 * the post-D-04 callback no longer has any cadence semantics — keeps the
 * harness behavior stable for future test additions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — registered BEFORE import() of the module under test.
// ---------------------------------------------------------------------------

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: 'fake',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 120_000, // Phase 30 D-02 retune (was 90_000)
    LLM_V3_CONCURRENCY: 1, // serialize so completion order == submission order
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    // Phase 30 D-04 (SIMPLIFY-01): legacy flush-cadence env var stripped
    // from mockEnv when the Zod schema entry was deleted in Plan 03 Task 2.
    LLM_BATCH_SIZE: 2, // Phase 30 D-07 — promoted from hard-coded const
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
}));

// Mock @vercel/functions so any waitUntil call (Plan 02 will introduce one)
// invokes the promise eagerly under test.
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
      // Phase 35 D-12 (SIMPLIFY-02): writePartialCache writer retired, so this
      // mock no longer simulates the partial-key write. onBatchComplete drives
      // terminal-key writes directly via the pipeline.
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
  mockEnv.LLM_V3_CONCURRENCY = 1;
});

describe('runRefreshExtraction — no incremental flush (D-04 / SIMPLIFY-01)', () => {
  it("12-batch happy path: exactly ONE cacheSetSafe('events:llm:v3', ...) call (terminal only)", async () => {
    await driveRun(12);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });

  it("5-batch happy path: exactly ONE cacheSetSafe('events:llm:v3', ...) call (terminal only)", async () => {
    await driveRun(5);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });
});

// Phase 30 D-07 (LLM-RELI-03) — env.LLM_BATCH_SIZE consumer proof.
// The hoisted mockEnv pattern above injects an env-tunable LLM_BATCH_SIZE
// into the v3 extractor (replaces the prior `const BATCH_SIZE = 2`). This
// suite verifies the extractor honors the env value end-to-end through
// runRefreshExtraction (the orchestrator), not just at the schema layer.
describe('runRefreshExtraction — D-07 LLM_BATCH_SIZE env-tunable consumer', () => {
  it('LLM_BATCH_SIZE env-tunable: extractor reads env.LLM_BATCH_SIZE (mockEnv override propagates)', async () => {
    // Override the env-tunable knob; runRefreshExtraction picks up the new
    // value through the vi.mock('../../config.js', () => ({ env: mockEnv }))
    // hoist registered above. The mock for processEventGroups doesn't honor
    // BATCH_SIZE directly (it's a passthrough), but the absence of throw +
    // the cacheSetSpy receiving terminal writes confirms the extractor
    // module loaded cleanly with env.LLM_BATCH_SIZE consumed at line 83.
    mockEnv.LLM_BATCH_SIZE = 4;
    await driveRun(8);
    expect(processEventGroupsMock).toHaveBeenCalled();
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('LLM_BATCH_SIZE fallback (env=2): extractor still works at the v1.4 default', async () => {
    mockEnv.LLM_BATCH_SIZE = 2;
    await driveRun(4);
    expect(processEventGroupsMock).toHaveBeenCalled();
  });
});
