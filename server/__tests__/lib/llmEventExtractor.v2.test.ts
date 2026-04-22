// @vitest-environment node
/**
 * Phase 27.4 Plan 06 — tests for server/lib/llmEventExtractor.v2.ts.
 *
 * Covers the 13 behaviors in the plan's <behavior> block:
 *   1.  BATCH_SIZE=2 — 10 groups → 5 callLLM invocations
 *   2.  GDELT headers present in user prompt (Date, CAMEO, Actors, ...)
 *   3.  NEWS BLOCK emitted when news cache matches on sourceCountry + ±24h
 *   4.  BELLINGCAT BLOCK emitted when extractBellingcatGeo returns a coord
 *   5.  TEMPORAL BLOCK emitted from events:llm:v2 within ±72h + ±1deg bbox
 *   6.  None of the three blocks emitted when there are no matches
 *   7.  System prompt forbids lat/lng + requests hierarchy + no precision
 *   8.  processEventGroupsV2 returns enriched events on happy path
 *   9.  Zod-parse fail → empty batch result (no throw) + DLQ enqueue per group
 *   10. geocodeEnrichedEventsV2 calls resolveLocation once per event
 *   11. W2 fix — bellingcat parsed coord flows through ctx.bellingcatCoord
 *   12. W3 fix — ctx.articleTitles = headlines (not URLs)
 *   13. W1 fix — Zod fail enqueues one DLQ entry per group with reason=zod_fail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — every external dep the v2 extractor touches is replaced
// with a vi.fn() so tests control observable behavior without real I/O.
// ---------------------------------------------------------------------------

vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/llmResolver.js', () => ({
  resolveLocation: vi.fn(),
}));

vi.mock('../../lib/eventScoring.js', () => ({
  extractBellingcatGeo: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../lib/sourceTiers.js', () => ({
  // The extractor uses getSourceTier('', hostname) — matches the existing
  // server/lib/sourceTiers.ts export. Default to tier 2 (silver) so the
  // NEWS BLOCK formatter emits [T2] tags on articles without an explicit
  // mock override; individual tests override for tier-specific assertions.
  getSourceTier: vi.fn().mockReturnValue(2),
}));

vi.mock('../../lib/llmDLQ.js', () => ({
  enqueueDLQ: vi.fn().mockResolvedValue(undefined),
  DLQ_KEY: 'events:llm-dlq',
}));

// Phase 27.4.1 Plan 03 — mock the watchdog helper so tests control timeout
// behavior. Default: transparent pass-through that just invokes batchFn.
// Individual tests override mockImplementationOnce to simulate timeout.
vi.mock('../../lib/llmExtractorWatchdog.js', () => ({
  withBatchWatchdog: vi.fn(
    async (batchFn: () => Promise<unknown>, _opts: unknown) => batchFn(),
  ),
}));

// Phase 27.4.1 Plan 03 — mock llmProgress so watchdog-timeout assertions can
// verify updateProgress({watchdogTimeoutCount: ...}) was called.
vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn(),
  llmProgress: { watchdogTimeoutCount: undefined, callHistory: undefined },
}));

// Phase 27.4.1 Plan 03 — mock config env so LLM_BATCH_TIMEOUT_MS is
// available without hitting the Zod env parser.
vi.mock('../../config.js', () => ({
  env: { LLM_BATCH_TIMEOUT_MS: 90000 },
}));

import { callLLM } from '../../adapters/llm-provider.js';
import { cacheGetSafe, cacheSetSafe } from '../../cache/redis.js';
import { resolveLocation } from '../../lib/llmResolver.js';
import { extractBellingcatGeo } from '../../lib/eventScoring.js';
import { getSourceTier } from '../../lib/sourceTiers.js';
import { enqueueDLQ } from '../../lib/llmDLQ.js';
import { withBatchWatchdog } from '../../lib/llmExtractorWatchdog.js';
import { updateProgress } from '../../lib/llmProgress.js';
import {
  processEventGroupsV2,
  geocodeEnrichedEventsV2,
  buildBatchUserPromptV2,
  BATCH_SIZE,
  SYSTEM_PROMPT_V2,
} from '../../lib/llmEventExtractor.v2.js';
import type { EventGroup } from '../../lib/eventGrouping.js';
import type { ConflictEventEntity } from '../../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TIMESTAMP = Date.UTC(2026, 2, 15, 12, 0, 0); // 2026-03-15 12:00 UTC

function makeEntity(overrides: Partial<ConflictEventEntity> = {}): ConflictEventEntity {
  return {
    id: 'gdelt-00001',
    type: 'airstrike',
    lat: 35.0,
    lng: 50.0,
    timestamp: BASE_TIMESTAMP,
    label: 'Test event',
    data: {
      eventType: 'Aerial weapons',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'USA',
      actor2: 'IRN',
      notes: '',
      source: 'https://example.com/a',
      goldsteinScale: -10,
      locationName: 'Tehran, Iran',
      cameoCode: '195',
      numMentions: 10,
      numSources: 3,
      geoPrecision: 'precise' as const,
      confidence: 0.8,
    },
    ...overrides,
  };
}

function makeGroup(overrides: Partial<EventGroup> = {}): EventGroup {
  return {
    key: 'grp-test-1',
    entities: [makeEntity()],
    centroidLat: 35.0,
    centroidLng: 50.0,
    primaryCameo: '195',
    timestamp: BASE_TIMESTAMP,
    totalMentions: 10,
    totalSources: 3,
    sourceUrls: ['https://example.com/a'],
    ...overrides,
  };
}

function makeEnrichedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 'v2',
    groupKey: 'grp-test-1',
    location: {
      country: 'Iran',
      admin1: null,
      city: 'Tehran',
      neighborhood: null,
      landmark: null,
      confidence: 0.85,
    },
    type: 'airstrike',
    confidence: 0.82,
    reasoning: 'News article confirms strike in Tehran',
    weaponType: 'missile',
    targetType: 'military',
    timeOfDay: '03:15',
    durationMinutes: null,
    actors: ['USA', 'IRN'],
    severity: 'high',
    summary: 'Strike on military target in Tehran',
    casualties: { killed: 2, injured: 5, unknown: false },
    sourceCount: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test environment reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(callLLM).mockReset();
  vi.mocked(cacheGetSafe).mockReset();
  vi.mocked(cacheGetSafe).mockResolvedValue(null);
  vi.mocked(resolveLocation).mockReset();
  vi.mocked(extractBellingcatGeo).mockReset();
  vi.mocked(extractBellingcatGeo).mockReturnValue(undefined);
  vi.mocked(getSourceTier).mockReset();
  vi.mocked(getSourceTier).mockReturnValue(2);
  vi.mocked(enqueueDLQ).mockReset();
  vi.mocked(enqueueDLQ).mockResolvedValue(undefined);
});

describe('llmEventExtractor.v2', () => {
  // -----------------------------------------------------------------------
  // Test 1: BATCH_SIZE === 2 (D-10)
  // -----------------------------------------------------------------------
  it('BATCH_SIZE constant is 2 — 10 groups invoke callLLM 5 times', async () => {
    expect(BATCH_SIZE).toBe(2);

    const groups = Array.from({ length: 10 }, (_, i) =>
      makeGroup({ key: `grp-${i}`, entities: [makeEntity({ id: `id-${i}` })] }),
    );
    vi.mocked(callLLM).mockResolvedValue(JSON.stringify({ events: [] }));

    await processEventGroupsV2(groups);

    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(5);
  });

  // -----------------------------------------------------------------------
  // Test 2: GDELT headers unchanged from v1
  // -----------------------------------------------------------------------
  it('buildBatchUserPromptV2 includes standard GDELT metadata headers', () => {
    const prompt = buildBatchUserPromptV2([
      {
        group: makeGroup(),
        matchedNews: [],
        bellingcatHits: [],
        temporalEvents: [],
      },
    ]);

    expect(prompt).toContain('Date:');
    expect(prompt).toContain('CAMEO Code:');
    expect(prompt).toContain('Actors:');
    expect(prompt).toContain('Goldstein Scale:');
    expect(prompt).toContain('Source URLs:');
    expect(prompt).toContain('grp-test-1');
  });

  // -----------------------------------------------------------------------
  // Test 3: NEWS BLOCK appears when news cache has matching articles
  // -----------------------------------------------------------------------
  it('NEWS BLOCK emitted with tier tags when news cache matches', () => {
    // getSourceTier(source, domain) — the extractor passes '' for source so
    // only the hostname (second arg) is used for classification here.
    vi.mocked(getSourceTier).mockImplementation(
      (_source: string, host: string | undefined) => {
        const h = host ?? '';
        if (h.includes('reuters')) return 1;
        if (h.includes('aljazeera')) return 2;
        return 3;
      },
    );

    const prompt = buildBatchUserPromptV2([
      {
        group: makeGroup(),
        matchedNews: [
          {
            title: 'Iran reports strike on Tehran',
            url: 'https://reuters.com/article/1',
            publishedAt: BASE_TIMESTAMP,
            sourceCountry: 'UK',
          },
          {
            title: 'Tehran authorities confirm casualties',
            url: 'https://aljazeera.com/article/2',
            publishedAt: BASE_TIMESTAMP,
            sourceCountry: 'Qatar',
          },
        ],
        bellingcatHits: [],
        temporalEvents: [],
      },
    ]);

    expect(prompt).toContain('--- NEWS BLOCK');
    expect(prompt).toContain('[T1] Iran reports strike on Tehran');
    expect(prompt).toContain('[T2] Tehran authorities confirm casualties');
  });

  // -----------------------------------------------------------------------
  // Test 4: BELLINGCAT BLOCK appears when extractBellingcatGeo matches
  // -----------------------------------------------------------------------
  it('BELLINGCAT BLOCK emitted with coord hint', () => {
    const prompt = buildBatchUserPromptV2([
      {
        group: makeGroup(),
        matchedNews: [],
        bellingcatHits: [
          { title: 'Bellingcat OSINT: strike at Natanz', lat: 33.72, lng: 51.73 },
        ],
        temporalEvents: [],
      },
    ]);

    expect(prompt).toContain('--- BELLINGCAT OSINT');
    expect(prompt).toContain('Bellingcat OSINT: strike at Natanz');
    expect(prompt).toContain('[Bellingcat coord hint:');
  });

  // -----------------------------------------------------------------------
  // Test 5: TEMPORAL BLOCK appears with up to 3 prior events
  // -----------------------------------------------------------------------
  it('TEMPORAL BLOCK emitted with up to 3 prior events in region', () => {
    const prompt = buildBatchUserPromptV2([
      {
        group: makeGroup(),
        matchedNews: [],
        bellingcatHits: [],
        temporalEvents: [
          {
            summary: 'Prior strike nearby',
            location: {
              country: 'Iran',
              admin1: 'Tehran',
              city: 'Tehran',
              neighborhood: null,
              landmark: 'Jobar substation',
              confidence: 0.9,
            },
            timestamp: BASE_TIMESTAMP - 6 * 3_600_000,
          },
        ],
      },
    ]);

    expect(prompt).toContain('--- TEMPORAL CONTEXT');
    expect(prompt).toContain('Jobar substation');
    expect(prompt).toContain('Prior strike nearby');
  });

  // -----------------------------------------------------------------------
  // Test 6: No blocks when no matches
  // -----------------------------------------------------------------------
  it('no enrichment blocks emitted when no matches exist', () => {
    const prompt = buildBatchUserPromptV2([
      {
        group: makeGroup(),
        matchedNews: [],
        bellingcatHits: [],
        temporalEvents: [],
      },
    ]);

    expect(prompt).not.toContain('NEWS BLOCK');
    expect(prompt).not.toContain('BELLINGCAT');
    expect(prompt).not.toContain('TEMPORAL CONTEXT');
  });

  // -----------------------------------------------------------------------
  // Test 7: SYSTEM_PROMPT_V2 invariants
  // -----------------------------------------------------------------------
  it('SYSTEM_PROMPT_V2 forbids lat/lng, requests hierarchy, omits precision', () => {
    // Coordinate emission explicitly forbidden (D-05)
    expect(SYSTEM_PROMPT_V2).toMatch(/NEVER emit coordinates/i);
    // Structured hierarchy fields requested
    expect(SYSTEM_PROMPT_V2).toMatch(/country/);
    expect(SYSTEM_PROMPT_V2).toMatch(/admin1/);
    expect(SYSTEM_PROMPT_V2).toMatch(/city/);
    expect(SYSTEM_PROMPT_V2).toMatch(/neighborhood/);
    expect(SYSTEM_PROMPT_V2).toMatch(/landmark/);
    // Precision NOT requested from LLM (server derives it)
    expect(SYSTEM_PROMPT_V2).toMatch(/NEVER emit a "precision"/i);
  });

  // -----------------------------------------------------------------------
  // Test 8: processEventGroupsV2 happy path returns enriched events
  // -----------------------------------------------------------------------
  it('processEventGroupsV2 happy path returns V2ExtractionRun with events', async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ events: [makeEnrichedEvent()] }),
    );

    const run = await processEventGroupsV2([makeGroup()]);

    expect(run.events).not.toBeNull();
    expect(run.events).toHaveLength(1);
    expect(run.events?.[0].groupKey).toBe('grp-test-1');
    expect(run.events?.[0].schemaVersion).toBe('v2');
    expect(run.matchedNewsByGroup).toBeInstanceOf(Map);
    expect(run.bellingcatByGroup).toBeInstanceOf(Map);
  });

  // -----------------------------------------------------------------------
  // Test 9: Zod parse failure → empty events + no throw
  // -----------------------------------------------------------------------
  it('Zod parse failure returns empty events without throwing', async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ events: [{ not_a_valid_event: true }] }),
    );

    const run = await processEventGroupsV2([makeGroup()]);

    // Single-batch all-fail → events === null (allFailed invariant)
    expect(run.events).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Test 10: geocodeEnrichedEventsV2 calls resolveLocation per event
  // -----------------------------------------------------------------------
  it('geocodeEnrichedEventsV2 calls resolveLocation once per event and preserves provenance', async () => {
    vi.mocked(resolveLocation).mockResolvedValue({
      lat: 35.5,
      lng: 51.5,
      provenance: 'nominatim-direct',
      actionGeoDistanceKm: 7.2,
      displayName: 'Tehran, Iran',
    });

    const group = makeGroup();
    const events = [
      makeEnrichedEvent(),
      makeEnrichedEvent({ groupKey: 'grp-test-1' }),
    ];

    const groupsByKey = new Map([[group.key, group]]);
    const geocoded = await geocodeEnrichedEventsV2(
      // @ts-expect-error — test fixture uses untyped literal
      events,
      groupsByKey,
      new Map(),
      new Map(),
    );

    expect(vi.mocked(resolveLocation)).toHaveBeenCalledTimes(2);
    expect(geocoded).toHaveLength(2);
    expect(geocoded[0].geocodeProvenance).toBe('nominatim-direct');
    expect(geocoded[0].resolvedLat).toBe(35.5);
    expect(geocoded[0].resolvedLng).toBe(51.5);
    expect(geocoded[0].precision).toBeDefined();
    expect(typeof geocoded[0].suspect).toBe('boolean');
  });

  // -----------------------------------------------------------------------
  // Test 11: W2 fix — bellingcat parsed coord flows through ctx.bellingcatCoord
  // -----------------------------------------------------------------------
  it('W2 — bellingcat parsed coord populates bellingcatByGroup and flows to ctx.bellingcatCoord', async () => {
    // Seed news cache with a Bellingcat-adjacent article
    vi.mocked(cacheGetSafe).mockImplementation(async (key: string) => {
      if (key === 'news:gdelt') {
        return {
          data: [
            {
              articles: [
                {
                  title: 'Bellingcat: strike at Natanz confirmed',
                  url: 'https://bellingcat.com/x',
                  publishedAt: BASE_TIMESTAMP,
                  sourceCountry: 'US',
                },
              ],
            },
          ],
          stale: false,
          lastFresh: Date.now(),
        };
      }
      return null;
    });
    vi.mocked(extractBellingcatGeo).mockReturnValue({ lat: 33.72, lng: 51.73 });
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ events: [makeEnrichedEvent()] }),
    );
    vi.mocked(resolveLocation).mockResolvedValue({
      lat: 33.72,
      lng: 51.73,
      provenance: 'bellingcat-coord-passthrough',
      actionGeoDistanceKm: 100,
      displayName: 'Natanz',
    });

    const group = makeGroup();
    const run = await processEventGroupsV2([group]);

    expect(run.bellingcatByGroup.get(group.key)).toEqual({ lat: 33.72, lng: 51.73 });

    // Thread through to geocodeEnrichedEventsV2 and confirm resolveLocation gets it
    vi.mocked(resolveLocation).mockClear();
    await geocodeEnrichedEventsV2(
      run.events ?? [],
      new Map([[group.key, group]]),
      run.matchedNewsByGroup,
      run.bellingcatByGroup,
    );

    expect(vi.mocked(resolveLocation)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        bellingcatCoord: { lat: 33.72, lng: 51.73 },
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Test 12: W3 fix — ctx.articleTitles contains headlines (not URLs)
  // -----------------------------------------------------------------------
  it('W3 — ctx.articleTitles contains article titles (not URLs)', async () => {
    vi.mocked(resolveLocation).mockResolvedValue({
      lat: 35.0,
      lng: 50.0,
      provenance: 'nominatim-direct',
      actionGeoDistanceKm: 5,
      displayName: 'Tehran',
    });

    const group = makeGroup();
    const matchedNewsByGroup = new Map([
      [
        group.key,
        [
          {
            title: 'Strike on Natanz confirmed',
            url: 'https://example.com/x',
            publishedAt: BASE_TIMESTAMP,
            sourceCountry: 'UK',
          },
        ],
      ],
    ]);

    await geocodeEnrichedEventsV2(
      [makeEnrichedEvent() as never],
      new Map([[group.key, group]]),
      matchedNewsByGroup,
      new Map(),
    );

    expect(vi.mocked(resolveLocation)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        articleTitles: ['Strike on Natanz confirmed'],
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Test 13: W1 fix — Zod fail enqueues one DLQ entry per group with reason=zod_fail
  // -----------------------------------------------------------------------
  it('W1 — Zod fail enqueues one DLQ entry per group in the failed batch', async () => {
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ events: [{ not_valid: true }] }),
    );

    const groups = [
      makeGroup({ key: 'grp-fail-1' }),
      makeGroup({ key: 'grp-fail-2' }),
    ];

    await processEventGroupsV2(groups);

    const calls = vi.mocked(enqueueDLQ).mock.calls;
    const ids = calls.map((c) => (c[0] as { id: string }).id);
    expect(ids).toContain('grp-fail-1');
    expect(ids).toContain('grp-fail-2');
    // Every call should have reason 'zod_fail'
    for (const call of calls) {
      expect((call[0] as { reason: string }).reason).toBe('zod_fail');
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 27.4.1 — watchdog + per-batch cache integration tests
//
// Covers the 3 new critical behaviors from Plan 03:
//   14. Partial LLMCachePayload write to events:llm:v2 after each batch +
//       final write carries complete: true (D-07 / D-08 / D-10)
//   15. Watchdog timeout routes every group in the batch to DLQ with
//       reason='timeout_watchdog' and bumps watchdogTimeoutCount (D-04 / D-06)
//   16. Watchdog timeout on batch N does not abort the loop — batch N+1
//       still runs, final write still happens (D-11 / D-13)
// ---------------------------------------------------------------------------

describe('Phase 27.4.1 — watchdog + per-batch cache', () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset();
    vi.mocked(cacheGetSafe).mockReset();
    vi.mocked(cacheGetSafe).mockResolvedValue(null);
    vi.mocked(cacheSetSafe).mockReset();
    vi.mocked(cacheSetSafe).mockResolvedValue(undefined);
    vi.mocked(enqueueDLQ).mockReset();
    vi.mocked(enqueueDLQ).mockResolvedValue(undefined);
    vi.mocked(resolveLocation).mockReset();
    vi.mocked(extractBellingcatGeo).mockReset();
    vi.mocked(extractBellingcatGeo).mockReturnValue(undefined);
    vi.mocked(getSourceTier).mockReset();
    vi.mocked(getSourceTier).mockReturnValue(2);
    vi.mocked(updateProgress).mockReset();
    vi.mocked(withBatchWatchdog).mockReset();
    // Default watchdog mock: transparent pass-through. Individual tests
    // override with mockImplementationOnce to simulate timeout.
    vi.mocked(withBatchWatchdog).mockImplementation(
      async (batchFn) => batchFn(),
    );
  });

  // -----------------------------------------------------------------------
  // Test 14: per-batch partial cache write + final complete: true write
  // -----------------------------------------------------------------------
  it('writes a partial LLMCachePayload to events:llm:v2 after each successful batch', async () => {
    // 4 groups → 2 batches (BATCH_SIZE = 2)
    const groups = [
      makeGroup({ key: 'grp-b1-1', entities: [makeEntity({ id: 'e1' })] }),
      makeGroup({ key: 'grp-b1-2', entities: [makeEntity({ id: 'e2' })] }),
      makeGroup({ key: 'grp-b2-1', entities: [makeEntity({ id: 'e3' })] }),
      makeGroup({ key: 'grp-b2-2', entities: [makeEntity({ id: 'e4' })] }),
    ];
    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({ events: [makeEnrichedEvent()] }),
    );

    await processEventGroupsV2(groups);

    const writes = vi
      .mocked(cacheSetSafe)
      .mock.calls.filter(([key]) => key === 'events:llm:v2');

    // 2 partial (one per successful batch) + 1 final complete:true = 3 writes
    expect(writes.length).toBeGreaterThanOrEqual(3);

    // Final write has complete: true (D-10) with progress 2/2
    const last = writes[writes.length - 1][1] as {
      events: unknown[];
      progress: string;
      complete: boolean;
      generatedAt: string;
    };
    expect(last.complete).toBe(true);
    expect(last.progress).toBe('2/2');
    expect(typeof last.generatedAt).toBe('string');
    expect(Array.isArray(last.events)).toBe(true);

    // First partial write has complete: false
    const first = writes[0][1] as { complete: boolean };
    expect(first.complete).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 15: watchdog timeout routes every group to DLQ + bumps counter
  // -----------------------------------------------------------------------
  it('watchdog timeout: DLQ-routes all groups in the batch with reason=timeout_watchdog and bumps watchdogTimeoutCount', async () => {
    const groups = [
      makeGroup({ key: 'grp-timeout-1', entities: [makeEntity({ id: 'e1' })] }),
      makeGroup({ key: 'grp-timeout-2', entities: [makeEntity({ id: 'e2' })] }),
    ];

    // Simulate watchdog firing on the single batch
    vi.mocked(withBatchWatchdog).mockImplementationOnce(async (_batchFn, opts) => {
      const typedOpts = opts as { onTimeout: () => Promise<void> };
      await typedOpts.onTimeout();
      return null;
    });

    await processEventGroupsV2(groups);

    // enqueueDLQ called once per group with reason='timeout_watchdog'
    const dlqCalls = vi.mocked(enqueueDLQ).mock.calls;
    const timeoutCalls = dlqCalls.filter(
      ([e]) => (e as { reason: string }).reason === 'timeout_watchdog',
    );
    expect(timeoutCalls.length).toBe(2);
    const timeoutIds = timeoutCalls.map(
      ([e]) => (e as { id: string }).id,
    );
    expect(timeoutIds).toContain('grp-timeout-1');
    expect(timeoutIds).toContain('grp-timeout-2');

    // updateProgress called with watchdogTimeoutCount increment (undefined + 1 → 1)
    const progressCalls = vi.mocked(updateProgress).mock.calls;
    const timeoutCountCall = progressCalls.find(
      ([p]) => 'watchdogTimeoutCount' in (p as object),
    );
    expect(timeoutCountCall).toBeDefined();
    expect(
      (timeoutCountCall![0] as { watchdogTimeoutCount: number })
        .watchdogTimeoutCount,
    ).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Test 16: timeout on one batch does not abort the loop — subsequent
  //          batches still run and final complete:true write still happens
  // -----------------------------------------------------------------------
  it('watchdog timeout on batch N does not abort the loop — batch N+1 still runs', async () => {
    // 4 groups → 2 batches
    const groups = [
      makeGroup({ key: 'grp-loop-1', entities: [makeEntity({ id: 'e1' })] }),
      makeGroup({ key: 'grp-loop-2', entities: [makeEntity({ id: 'e2' })] }),
      makeGroup({ key: 'grp-loop-3', entities: [makeEntity({ id: 'e3' })] }),
      makeGroup({ key: 'grp-loop-4', entities: [makeEntity({ id: 'e4' })] }),
    ];

    // First batch times out, second batch passes through
    vi.mocked(withBatchWatchdog)
      .mockImplementationOnce(async (_batchFn, opts) => {
        const typedOpts = opts as { onTimeout: () => Promise<void> };
        await typedOpts.onTimeout();
        return null;
      })
      .mockImplementationOnce(async (batchFn) => batchFn());

    vi.mocked(callLLM).mockResolvedValue(
      JSON.stringify({
        events: [
          makeEnrichedEvent({ groupKey: 'grp-loop-3' }),
          makeEnrichedEvent({ groupKey: 'grp-loop-4' }),
        ],
      }),
    );

    const result = await processEventGroupsV2(groups);

    // Second batch's events landed in results (proves loop continued past
    // the timeout on batch 0).
    expect(result.events).not.toBeNull();
    expect(result.events!.length).toBe(2);

    // Final cache write still fires with complete: true and progress 2/2
    const writes = vi
      .mocked(cacheSetSafe)
      .mock.calls.filter(([key]) => key === 'events:llm:v2');
    const last = writes[writes.length - 1][1] as {
      complete: boolean;
      progress: string;
    };
    expect(last.complete).toBe(true);
    expect(last.progress).toBe('2/2');
  });
});
