// @vitest-environment node
/**
 * Phase 39 SC39-3 gap closure — honest run-record accounting (WR-01 + WR-04).
 *
 * These tests would have CAUGHT the two server-side flight-recorder defects:
 *
 *   WR-01 — a run where batches FAIL must report `batchesFailed > 0` and a
 *           non-green outcome. Before the fix, `finishBatch()` ticked the
 *           completed-batch counter on every terminal branch, so the run record
 *           derived `batchesFailed = totalBatches - completedBatches ≈ 0` and a
 *           fully-failed run painted SUCCESS/green. We drive the extractor mock
 *           so it stamps `llmProgress.failedBatches` (the new honest tally) and
 *           assert the CLOSED run record carries it through, with `dlqDelta`
 *           computed from the SCARD open/close snapshot.
 *
 *   WR-04 — `runEval()`'s result must reach the closed run record's `evalScore`.
 *           We assert the snapshot carries the real harness shape
 *           (`{ within5km, within20km, within100km, total }`).
 *
 * The run record is captured by spying on `closeRunRecord` (the terminal
 * re-LPUSH). We assert on its argument rather than on Redis internals so the
 * test pins the public RunHistoryEntry contract the FlightRecorder reads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: 'fake',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 120_000,
    LLM_V3_CONCURRENCY: 1,
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    LLM_BATCH_SIZE: 2,
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

// SCARD-backed DLQ size — drives the dlqDelta open/close snapshot (WR-01).
let dlqSize = 0;
const scardMock = vi.fn(async () => dlqSize);

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: cacheGetSpy,
  cacheSetSafe: cacheSetSpy,
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    scard: (...args: unknown[]) => scardMock(...args),
  },
}));

vi.mock('../../config.js', () => ({ env: mockEnv }));

vi.mock('../../lib/safeWaitUntil.js', () => ({
  safeWaitUntil: (p: Promise<unknown>) => {
    void p.catch(() => {});
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
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

// Real eval harness shape (server/lib/llmEvalHarness.ts EvalScore) — NO `.score`.
const evalShape = {
  within5km: 30,
  within20km: 42,
  within100km: 48,
  total: 50,
  actorMatchRate: 0.6,
};
const runEvalSpy = vi.fn().mockResolvedValue(evalShape);
vi.mock('../../lib/llmEvalHarness.js', () => ({ runEval: runEvalSpy }));

const groupGdeltRowsMock = vi.fn();
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: groupGdeltRowsMock,
  dedupHighConfidence: vi.fn((entities: unknown[]) => entities),
}));

// DLQ — countDLQ() is the open/close snapshot source for dlqDelta. Route it
// through scardMock so per-call sequencing (mockImplementationOnce for the open
// snapshot, then a steady close value) drives the delta exactly like the real
// SCARD-backed countDLQ() would across a run.
vi.mock('../../lib/llmDLQ.js', () => ({
  countDLQ: vi.fn(async () => scardMock()),
}));

const { llmProgressSingleton } = vi.hoisted(() => ({
  llmProgressSingleton: { stage: 'idle' } as Record<string, unknown>,
}));
vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn((patch: Record<string, unknown>) => {
    Object.assign(llmProgressSingleton, patch);
  }),
  resetProgress: vi.fn(() => {
    for (const k of Object.keys(llmProgressSingleton)) delete llmProgressSingleton[k];
    llmProgressSingleton.stage = 'grouping';
    llmProgressSingleton.startedAt = Date.now();
  }),
  llmProgress: llmProgressSingleton,
  buildSummary: vi.fn().mockReturnValue({}),
}));

// Capture run-record lifecycle. closeRunRecord's argument IS the terminal
// RunHistoryEntry the FlightRecorder reads (WR-01 + WR-04 assertions).
const openRunRecordMock = vi.fn(async () => {});
const closeRunRecordMock = vi.fn(async () => {});
vi.mock('../../lib/llmRunHistory.js', () => ({
  openRunRecord: openRunRecordMock,
  closeRunRecord: closeRunRecordMock,
}));

// URL-liveness post-step — stub to no-ops so the finally block doesn't touch
// real Redis / Nominatim in this accounting test.
vi.mock('../../lib/urlLiveness.js', () => ({
  buildProbeCandidates: vi.fn(async () => []),
  pruneDeadUrlEvents: vi.fn(async () => ({ prunedCount: 0, prunedIds: [] })),
  runProbeSweep: vi.fn(async () => ({ probed: 0, skippedBudget: 0 })),
  SWEEP_SAFETY_MARGIN_MS: 60_000,
}));

/**
 * Extractor mock. `failedBatches` controls how many batches stamp the new
 * honest failure tally onto the progress singleton (WR-01). `produceEvents`
 * controls whether the run yields enriched events (so we can model a fully
 * failed run vs. a partial run).
 */
let mockFailedBatches = 0;
let mockProduceEvents = true;
const processEventGroupsMock = vi.fn(
  async (
    groups: unknown[],
    onBatchComplete?: (completed: number, total: number) => void | Promise<void>,
  ) => {
    const total = groups.length;
    // Stamp totalBatches like the real pipeline does (one batch per group here).
    llmProgressSingleton.totalBatches = total;
    // Emulate the v3 extractor's per-failure tally.
    if (mockFailedBatches > 0) {
      llmProgressSingleton.failedBatches = mockFailedBatches;
    }
    const events = mockProduceEvents
      ? groups.map((g) => {
          const key = (g as { key: string }).key;
          return {
            schemaVersion: 'v3' as const,
            groupKey: key,
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
          } as Record<string, unknown>;
        })
      : [];
    for (let c = 1; c <= total; c++) {
      const ret = onBatchComplete?.(c, total);
      if (ret && typeof (ret as Promise<void>).then === 'function') await ret;
    }
    // Honest extractor contract: null events when every batch failed.
    return {
      schemaVersion: 'v3' as const,
      events: events.length === 0 ? null : events,
      matchedNewsByGroup: new Map(),
      bellingcatByGroup: new Map(),
    };
  },
);

const geocodeEnrichedEventsMock = vi.fn(
  async (events: Array<Record<string, unknown>>, _g: any, _n: any, _b: any, onProgress?: any) => {
    const out = events.map((e) => ({
      ...e,
      resolvedLat: 35,
      resolvedLng: 50,
      displayName: 'Test',
      geocodeProvenance: 'nominatim-direct' as const,
      precision: 'city' as const,
      suspect: false,
      actionGeoDistanceKm: 0,
    }));
    if (typeof onProgress === 'function') onProgress(out.length, out.length);
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
    data: { eventType: 'Aerial weapons', cameoCode: '195', numMentions: 5, numSources: 2 },
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

async function driveRunWithGroups(groupKeys: string[]) {
  const rawEvents = groupKeys.map((k) => makeRawEntity(`raw-${k}`));
  cacheStore.set('events:gdelt', rawEvents);
  groupGdeltRowsMock.mockReturnValue(groupKeys.map(makeGroup));

  const { runRefreshExtraction } = await import('../../lib/llmExtractionPipeline.js');
  await runRefreshExtraction({ triggeredBy: 'cron', forceCooldown: true });
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
}

/** The terminal RunHistoryEntry handed to closeRunRecord (last call). */
function lastClosedRecord() {
  const calls = closeRunRecordMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0] as {
    outcome: string;
    batchCount: number;
    batchesCompleted: number;
    batchesFailed: number;
    dlqDelta: number;
    evalScore: unknown;
  };
}

beforeEach(() => {
  cacheStore.clear();
  cacheSetSpy.mockClear();
  cacheGetSpy.mockClear();
  scardMock.mockClear();
  processEventGroupsMock.mockClear();
  geocodeEnrichedEventsMock.mockClear();
  groupGdeltRowsMock.mockClear();
  runEvalSpy.mockClear();
  openRunRecordMock.mockClear();
  closeRunRecordMock.mockClear();
  dlqSize = 0;
  mockFailedBatches = 0;
  mockProduceEvents = true;
  for (const k of Object.keys(llmProgressSingleton)) delete llmProgressSingleton[k];
  llmProgressSingleton.stage = 'idle';
});

describe('Phase 39 SC39-3 WR-01 — honest batchesFailed + dlqDelta', () => {
  it('a fully-failed run reports batchesFailed > 0 and an honest (non-success) outcome', async () => {
    // Every batch fails: extractor stamps failedBatches and returns null events.
    mockFailedBatches = 2;
    mockProduceEvents = false;
    // DLQ grows from 0 → 2 across the run (each failed batch enqueued its group).
    scardMock.mockImplementationOnce(async () => 0); // open snapshot
    scardMock.mockImplementation(async () => 2); // close snapshot + thereafter

    await driveRunWithGroups(['a-1', 'b-1']);

    const rec = lastClosedRecord();
    // Honest failure tally — the OLD derivation (total - completedBatches) was 0.
    expect(rec.batchCount).toBe(2);
    expect(rec.batchesFailed).toBe(2);
    expect(rec.batchesCompleted).toBe(0); // zero genuine successes
    // Null extraction → 'error' outcome (a non-green band), never 'completed'.
    expect(rec.outcome).toBe('error');
    // Real DLQ growth surfaced (was hardcoded 0 before WR-01).
    expect(rec.dlqDelta).toBe(2);
  });

  it('a partial run (some batches failed, some succeeded) reports a non-zero batchesFailed', async () => {
    // 2 groups; 1 batch fails but the run still produces events.
    mockFailedBatches = 1;
    mockProduceEvents = true;
    scardMock.mockImplementationOnce(async () => 5); // open
    scardMock.mockImplementation(async () => 6); // close (one new DLQ entry)

    await driveRunWithGroups(['a-1', 'b-1']);

    const rec = lastClosedRecord();
    expect(rec.batchCount).toBe(2);
    expect(rec.batchesFailed).toBe(1);
    expect(rec.batchesCompleted).toBe(1); // total - failed
    // Run completed (produced events) → outcome 'completed'; the FlightRecorder
    // maps completed + batchesFailed>0 to the 'partial' (yellow) band.
    expect(rec.outcome).toBe('completed');
    expect(rec.dlqDelta).toBe(1);
  });

  it('a clean run reports batchesFailed === 0 and dlqDelta === 0 (still SUCCESS/green)', async () => {
    mockFailedBatches = 0;
    mockProduceEvents = true;
    scardMock.mockImplementation(async () => 3); // unchanged across run

    await driveRunWithGroups(['a-1', 'b-1']);

    const rec = lastClosedRecord();
    expect(rec.batchesFailed).toBe(0);
    expect(rec.batchesCompleted).toBe(2);
    expect(rec.dlqDelta).toBe(0);
    expect(rec.outcome).toBe('completed');
  });
});

describe('Phase 39 SC39-3 WR-04 — eval score written into the run record', () => {
  it('closed run record carries the real harness eval shape (within20km/total)', async () => {
    await driveRunWithGroups(['a-1', 'b-1']);

    expect(runEvalSpy).toHaveBeenCalled();
    const rec = lastClosedRecord();
    expect(rec.evalScore).toEqual(evalShape);
    // The eval shape has NO `.score` key — it carries the bucket+total contract
    // the client normalizeEvalScore (WR-05) now reads.
    expect((rec.evalScore as Record<string, unknown>).within20km).toBe(42);
    expect((rec.evalScore as Record<string, unknown>).total).toBe(50);
  });
});
