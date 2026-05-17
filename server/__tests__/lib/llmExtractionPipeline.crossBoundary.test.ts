// @vitest-environment node
/**
 * Phase 30 Plan 03 Task 3 — D-04 / SIMPLIFY-01 no-mid-run-write invariant.
 *
 * Pre-Phase-30 this file (Phase 28.2.6 Plan 01 Task 2 — D-07) asserted that
 * two consecutive partial runs (5 batches → simulated Vercel function-kill,
 * then 5 batches in a follow-up tick) produced the SAME final cache state
 * as one continuous 10-batch run. The mid-run durability guarantee was
 * provided by the periodic-flush mechanism (every-N-batches
 * `mergeAndPersistLlmEntities` call from `onBatchComplete`).
 *
 * Phase 30 D-04 retires that mechanism on the Pro 800s ceiling (CONTEXT
 * D-04 / threat model T-30-03: mid-run-crash now loses all progress is
 * `accept`'d — Plan 06 Run 2 validated 0 watchdog hard-kills inside budget,
 * so the crash window is negligible).
 *
 * Post-Phase-30 invariants validated here:
 *   - A mid-run abort (simulated function-kill before the terminal write
 *     completes) leaves the `events:llm:v3` key EMPTY. No partial state is
 *     persisted to the terminal key from within the batch loop.
 *   - The terminal write fires exactly once at the end of a complete
 *     happy-path run (mirrors the same invariant tested by
 *     llmExtractionPipeline.terminalShape.test.ts; kept here for the
 *     mid-run-abort negative-shape coverage that lives in this file).
 *
 * The Pitfall 1 cache bridge in `server/routes/events.ts` is the runtime
 * fallback that preserves the "map never goes blank" contract under
 * mid-run-crash (`events:gdelt` raw bridge); that contract is verified by
 * the route's own test, not here.
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
});

describe('runRefreshExtraction — no mid-run terminal write (D-04 / SIMPLIFY-01)', () => {
  it('mid-run abort (function-kill before terminal write): events:llm:v3 stays empty', async () => {
    // Drive 10 groups but abort the IIFE after batch 5 (simulated Vercel
    // function-kill). Pre-Phase-30 the periodic-flush at batch 5 would have
    // persisted 5 events to the terminal key; post-D-04 there is no mid-run
    // write site, so the terminal key remains absent (CONTEXT D-04 / threat
    // model T-30-03 accepted disposition: mid-run-crash loses all progress).
    await driveRun(10, { abortAt: 5 });
    const partialAfterAbort = cacheStore.get('events:llm:v3') as
      | Array<{ id: string }>
      | undefined;
    expect(partialAfterAbort).toBeUndefined();

    // The cacheSetSpy should also reflect zero terminal writes during the
    // aborted run — negative-shape coverage for the periodic-flush deletion.
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(0);
  });

  it('happy-path 10-batch run: events:llm:v3 receives exactly ONE terminal write', async () => {
    await driveRun(10);

    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    // Phase 30 D-04 (SIMPLIFY-01): periodic-flush retired; the single
    // end-of-pipeline mergeAndPersistLlmEntities call is now the sole
    // writer of the terminal cache key. Mirrors the exactly-once invariant
    // asserted in llmExtractionPipeline.terminalShape.test.ts; kept here
    // for the cross-file durability-and-shape regression surface.
    expect(terminalCalls.length).toBe(1);

    const finalEntities = terminalCalls[0]![1] as Array<{ id: string }>;
    expect(Array.isArray(finalEntities)).toBe(true);
    // All 10 batches each emitted 1 enriched event in the harness; the
    // terminal write should carry all 10 after the post-loop geocode.
    expect(finalEntities.length).toBe(10);
    // Stable ordering for diff-friendliness on regression.
    const sorted = sortById(finalEntities);
    expect(sorted[0]!.id).toBeDefined();
  });
});
