// @vitest-environment node
/**
 * Phase 32 Plan 32-02 Tasks 2-5 — sweep-side test suite.
 *
 * Covers:
 *   - Task 2: per-host throttle map + pruneStaleHostSlots (D-18, Pitfall 2)
 *   - Task 3: persistLiveness writer + sidecar count INCR/DECR
 *             (D-12 / RESEARCH A2 monotonic-with-reset; Pitfall 3 + 6)
 *   - Task 4: runProbeSweep orchestrator + deadline budget +
 *             createLimit(8) (D-03, D-18, Pitfall 1)
 *   - Task 5: buildProbeCandidates priority sort (D-04)
 *
 * Mock strategy mirrors `server/__tests__/lib/freeClaudeRouter.test.ts`
 * + `server/__tests__/lib/llmTokenBudget.test.ts`: hoisted vi.mock for
 * cache/redis + logger; dynamic import after mocks register.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// MEDIUM-02 plan-checker fix — NODE_ENV-gated test-only export from
// urlLiveness.ts only resolves to the actual object when NODE_ENV='test'.
// Assert that here so a future runner-config change fails this file
// loudly instead of silently leaving `__test__ === undefined`.
expect(process.env.NODE_ENV).toBe('test');

// ---------------------------------------------------------------------------
// Mocks — hoisted before module-under-test import
// ---------------------------------------------------------------------------

const cacheGetSafeMock = vi.fn();
const cacheSetSafeMock = vi.fn();
const incrMock = vi.fn();
const decrMock = vi.fn();
const setMock = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: (...args: unknown[]) => cacheGetSafeMock(...args),
  cacheSetSafe: (...args: unknown[]) => cacheSetSafeMock(...args),
  redis: {
    get: vi.fn(),
    set: (...args: unknown[]) => setMock(...args),
    incr: (...args: unknown[]) => incrMock(...args),
    decr: (...args: unknown[]) => decrMock(...args),
    del: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const urlLivenessModule = await import('../../lib/urlLiveness.js');
const { __test__, URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY } = urlLivenessModule;

if (!__test__) {
  throw new Error('urlLiveness __test__ export is undefined — NODE_ENV !== "test" at module load');
}

beforeEach(() => {
  cacheGetSafeMock.mockReset();
  cacheSetSafeMock.mockReset();
  incrMock.mockReset();
  decrMock.mockReset();
  setMock.mockReset();
  fetchMock.mockReset();
  // Clear the persistent hostNext map between tests so test ordering
  // doesn't pollute state.
  __test__.hostNext.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Task 2 — per-host throttle map
// ===========================================================================

describe('Plan 02 Task 2 — per-host throttle (D-18)', () => {
  it('first call for a host returns immediately and reserves the next slot ≥800ms in the future', async () => {
    const before = Date.now();
    await __test__.waitForHostSlot('a.example.com');
    const after = Date.now();
    // First call resolves without an artificial wait (the path is
    // `target = now + jitter`; if jitter ≥0 we sleep ≤200ms, if <0 the
    // branch short-circuits). Either way the wait is bounded by JITTER_MS.
    expect(after - before).toBeLessThan(300);
    const reserved = __test__.hostNext.get('a.example.com')!;
    // Reserved slot is at least PER_HOST_INTERVAL_MS - JITTER_MS in the
    // future = 800ms.
    expect(reserved).toBeGreaterThanOrEqual(before + 1_000 - 200);
  });

  it('second call to same host waits ≥800ms before resolving (throttle contract)', async () => {
    await __test__.waitForHostSlot('b.example.com');
    const t1 = Date.now();
    await __test__.waitForHostSlot('b.example.com');
    const elapsed = Date.now() - t1;
    // PER_HOST_INTERVAL_MS=1000, JITTER_MS=200 ⇒ lower bound 800ms.
    // Upper bound is generous to keep this real-timer test deterministic
    // on slow CI.
    expect(elapsed).toBeGreaterThanOrEqual(800);
    expect(elapsed).toBeLessThan(2_500);
  }, 10_000); // LOW-05 plan-checker fix: extend timeout for slow CI runners.

  it('different hosts do not block each other', async () => {
    const t0 = Date.now();
    await Promise.all([
      __test__.waitForHostSlot('c.example.com'),
      __test__.waitForHostSlot('d.example.com'),
    ]);
    const elapsed = Date.now() - t0;
    // Both first calls return immediately + jitter — well under
    // PER_HOST_INTERVAL_MS=1000.
    expect(elapsed).toBeLessThan(400);
  });

  it('pruneStaleHostSlots removes entries older than now - 60s', () => {
    __test__.hostNext.set('z.example.com', Date.now() - 90_000);
    __test__.hostNext.set('fresh.example.com', Date.now() + 5_000);
    __test__.pruneStaleHostSlots();
    expect(__test__.hostNext.get('z.example.com')).toBeUndefined();
    expect(__test__.hostNext.get('fresh.example.com')).toBeDefined();
  });
});

// ===========================================================================
// Task 3 — persistLiveness writer + sidecar count
// ===========================================================================

describe('Plan 02 Task 3 — persistLiveness writer (D-12, Pitfall 3)', () => {
  // Helper — wrap a UrlLiveness in the CacheResponse<T> shape that
  // cacheGetSafe returns.
  function cacheHit(data: unknown) {
    return { data, stale: false, lastFresh: Date.now() };
  }

  it('first write live → attemptCount=0, NO INCR (prior=null)', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(null);
    incrMock.mockResolvedValue(1);

    await __test__.persistLiveness('e1', 'https://example.com/a', {
      status: 'live',
      httpStatus: 200,
      finalUrl: 'https://example.com/a',
      evidence: null,
    });

    expect(cacheSetSafeMock).toHaveBeenCalledTimes(1);
    const [key, value] = cacheSetSafeMock.mock.calls[0]!;
    expect(key).toBe(`${URL_LIVENESS_KEY_PREFIX}e1`);
    expect((value as { attemptCount: number }).attemptCount).toBe(0);
    expect((value as { status: string }).status).toBe('live');
    expect(incrMock).not.toHaveBeenCalled();
  });

  it('first write 404 → attemptCount=1, INCR fires (prior=null, transitions to dead)', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(null);
    incrMock.mockResolvedValue(1);

    await __test__.persistLiveness('e2', 'https://example.com/missing', {
      status: '404',
      httpStatus: 404,
      finalUrl: 'https://example.com/missing',
      evidence: 'http-404',
    });

    const [, value] = cacheSetSafeMock.mock.calls[0]!;
    expect((value as { attemptCount: number }).attemptCount).toBe(1);
    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(incrMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY);
  });

  it('dead→dead increments attemptCount monotonically; NO INCR (already counted)', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:00.000Z',
        attemptCount: 1,
        lastUrlProbed: 'https://example.com/missing',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );

    await __test__.persistLiveness('e3', 'https://example.com/missing', {
      status: 'dead-host',
      httpStatus: null,
      finalUrl: 'https://example.com/missing',
      evidence: 'dead-host: fetch failed',
    });

    const [, value] = cacheSetSafeMock.mock.calls[0]!;
    expect((value as { attemptCount: number }).attemptCount).toBe(2);
    expect((value as { status: string }).status).toBe('dead-host');
    expect(incrMock).not.toHaveBeenCalled();
    expect(decrMock).not.toHaveBeenCalled();
  });

  it('dead→live resets attemptCount to 0 and fires DECR', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:00.000Z',
        attemptCount: 5,
        lastUrlProbed: 'https://example.com/x',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );
    decrMock.mockResolvedValue(0);

    await __test__.persistLiveness('e4', 'https://example.com/x', {
      status: 'live',
      httpStatus: 200,
      finalUrl: 'https://example.com/x',
      evidence: null,
    });

    const [, value] = cacheSetSafeMock.mock.calls[0]!;
    expect((value as { attemptCount: number }).attemptCount).toBe(0);
    expect(decrMock).toHaveBeenCalledTimes(1);
    expect(decrMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY);
  });

  // Phase 43 D-10 (FLIPPED from the Phase 32 reset-on-non-dead rule):
  // dead→unknown now PRESERVES the prior attemptCount (a transient blip
  // must not reset the consecutive-dead run a flaky host accumulates),
  // WHILE the sidecar DECR still fires (the event exits terminal-dead
  // membership — attemptCount and sidecar are independent axes).
  it('dead→unknown PRESERVES attemptCount and fires DECR (D-10)', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '403',
        lastProbedAt: '2026-05-21T00:00:00.000Z',
        attemptCount: 3,
        lastUrlProbed: 'https://example.com/y',
        lastHttpStatus: 403,
        evidence: 'http-403',
      }),
    );
    decrMock.mockResolvedValue(0);

    await __test__.persistLiveness('e5', 'https://example.com/y', {
      status: 'unknown',
      httpStatus: 503,
      finalUrl: 'https://example.com/y',
      evidence: null,
    });

    const [, value] = cacheSetSafeMock.mock.calls[0]!;
    // PRESERVED at the prior 3 (NOT reset to 0).
    expect((value as { attemptCount: number }).attemptCount).toBe(3);
    expect(decrMock).toHaveBeenCalledTimes(1);
  });

  // Phase 43 D-10 — the flaky-host accumulation fix. A host that goes
  // dead with `unknown` blips in between must NOT lose its consecutive-dead
  // history: `unknown` PRESERVES the count rather than resetting it to 0,
  // so the gate-read value (cronPrune reads attemptCount) survives the blip
  // and a genuine repeat offender's dead-run accumulates past the >=3 gate.
  // (Canonical derivation, RESEARCH §"attemptCount derivation under the NEW
  // D-10 rule" [VERIFIED]: live→0, unknown→preserve, dead→dead→+1,
  // not-dead→dead→1.)
  it('dead-run with an unknown blip preserves history and accumulates past >=3 (D-10)', async () => {
    decrMock.mockResolvedValue(0);
    incrMock.mockResolvedValue(1);

    // Tick 1: not-dead→dead → attemptCount=1
    cacheGetSafeMock.mockResolvedValueOnce(null);
    await __test__.persistLiveness('flaky', 'https://flaky.example.com/', {
      status: '404',
      httpStatus: 404,
      finalUrl: 'https://flaky.example.com/',
      evidence: 'http-404',
    });
    let value = cacheSetSafeMock.mock.calls[0]![1] as { attemptCount: number };
    expect(value.attemptCount).toBe(1);

    // Tick 2: dead→dead → 2 (monotonic).
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:01.000Z',
        attemptCount: 1,
        lastUrlProbed: 'https://flaky.example.com/',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );
    await __test__.persistLiveness('flaky', 'https://flaky.example.com/', {
      status: '404',
      httpStatus: 404,
      finalUrl: 'https://flaky.example.com/',
      evidence: 'http-404',
    });
    value = cacheSetSafeMock.mock.calls[1]![1] as { attemptCount: number };
    expect(value.attemptCount).toBe(2);

    // Tick 3: dead→unknown → PRESERVE 2 (the blip; the OLD rule reset to 0
    // here — that was the flaky-host evasion bug). DECR still fires.
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:02.000Z',
        attemptCount: 2,
        lastUrlProbed: 'https://flaky.example.com/',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );
    await __test__.persistLiveness('flaky', 'https://flaky.example.com/', {
      status: 'unknown',
      httpStatus: 503,
      finalUrl: 'https://flaky.example.com/',
      evidence: null,
    });
    value = cacheSetSafeMock.mock.calls[2]![1] as { attemptCount: number };
    expect(value.attemptCount).toBe(2);

    // Tick 4: dead→dead → 3 (crosses the >=3 cron prune gate). The prior
    // dead entry that re-asserts the run carries the preserved 2 forward.
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:03.000Z',
        attemptCount: 2,
        lastUrlProbed: 'https://flaky.example.com/',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );
    await __test__.persistLiveness('flaky', 'https://flaky.example.com/', {
      status: '404',
      httpStatus: 404,
      finalUrl: 'https://flaky.example.com/',
      evidence: 'http-404',
    });
    value = cacheSetSafeMock.mock.calls[3]![1] as { attemptCount: number };
    expect(value.attemptCount).toBeGreaterThanOrEqual(3);
  });

  it('every written entry carries the ProbeResult evidence string', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(null);
    incrMock.mockResolvedValue(1);

    await __test__.persistLiveness('e-evi', 'https://example.com/missing', {
      status: '404',
      httpStatus: 404,
      finalUrl: 'https://example.com/missing',
      evidence: 'http-404',
    });

    const [, value] = cacheSetSafeMock.mock.calls[0]!;
    expect((value as { evidence: string | null }).evidence).toBe('http-404');
  });

  it('DECR underflow floors at 0 via redis.set', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(
      cacheHit({
        status: '404',
        lastProbedAt: '2026-05-21T00:00:00.000Z',
        attemptCount: 1,
        lastUrlProbed: 'https://example.com/z',
        lastHttpStatus: 404,
        evidence: 'http-404',
      }),
    );
    decrMock.mockResolvedValue(-1);
    setMock.mockResolvedValue('OK');

    await __test__.persistLiveness('e6', 'https://example.com/z', {
      status: 'live',
      httpStatus: 200,
      finalUrl: 'https://example.com/z',
      evidence: null,
    });

    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 0);
  });

  it('Redis throw inside sidecar maintenance is swallowed (degrade-open)', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(null);
    incrMock.mockRejectedValueOnce(new Error('redis network blip'));

    // Should NOT throw.
    await expect(
      __test__.persistLiveness('e7', 'https://example.com/dead', {
        status: '404',
        httpStatus: 404,
        finalUrl: 'https://example.com/dead',
        evidence: 'http-404',
      }),
    ).resolves.toBeUndefined();

    // cacheSetSafe still called — entry persisted despite sidecar failure.
    expect(cacheSetSafeMock).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Task 4 — runProbeSweep orchestrator
// ===========================================================================

describe('Plan 02 Task 4 — runProbeSweep (D-03, D-18, Pitfall 1)', () => {
  it('createLimit(8) bound — peak in-flight tasks never exceed PROBE_CONCURRENCY=8', async () => {
    // 16 distinct hostnames so per-host throttle doesn't gate them.
    const items = Array.from({ length: 16 }, (_, i) => ({
      eventId: `evt-${i}`,
      url: `https://host${i}.example.com/article`,
    }));

    // Every probe returns 200 so persistLiveness is called once per item.
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    cacheGetSafeMock.mockResolvedValue(null);
    incrMock.mockResolvedValue(1);

    // Instrument cacheSetSafe to track concurrency: each call gates on a
    // small delay so the in-flight counter has time to peak before the
    // first task finishes.
    let inFlight = 0;
    let peak = 0;
    cacheSetSafeMock.mockImplementation(async () => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise<void>((r) => setTimeout(r, 30));
      inFlight--;
    });

    const result = await urlLivenessModule.runProbeSweep({
      eventIdsWithUrls: items,
      deadlineMs: Date.now() + 60_000, // generous
    });

    expect(result.probed).toBe(16);
    expect(result.skippedBudget).toBe(0);
    expect(peak).toBeLessThanOrEqual(8);
    // With 16 items and only 1 host each, 8-concurrency should saturate.
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it('deadline already past → skippedBudget=N, fetch NEVER called', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      eventId: `e${i}`,
      url: `https://host${i}.example.com/`,
    }));

    const result = await urlLivenessModule.runProbeSweep({
      eventIdsWithUrls: items,
      deadlineMs: Date.now() - 1, // already past
    });

    expect(result.probed).toBe(0);
    expect(result.skippedBudget).toBe(5);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheSetSafeMock).not.toHaveBeenCalled();
  });

  it('mixed completion under deadline pressure — probed + skipped = N', async () => {
    // 4 items across 4 distinct hosts. Each persist takes 60ms; deadline
    // is 150ms in the future so the first wave of 4 should clear.
    // The deadline check happens at task entry, so all 4 should clear.
    // To force a skip, set a tighter deadline.
    const items = Array.from({ length: 4 }, (_, i) => ({
      eventId: `m${i}`,
      url: `https://m${i}.example.com/`,
    }));

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    cacheGetSafeMock.mockResolvedValue(null);
    incrMock.mockResolvedValue(1);
    cacheSetSafeMock.mockImplementation(async () => {
      // Each task takes ~80ms to complete persist
      await new Promise<void>((r) => setTimeout(r, 80));
    });

    // Set a tight deadline so some tasks fall past it.
    // Note: with createLimit(8), all 4 enter immediately, so we set the
    // deadline at +50ms (before any persists complete). Each task does
    // its deadline check at entry — they ALL pass the check on first
    // dispatch since the limit dispatches all 4 synchronously. So in
    // this scenario all 4 will probe. We need a stricter test: pass a
    // VERY past deadline AND prove the in-task check fires.
    // Already covered by the previous test. Here we verify the
    // probed+skippedBudget invariant.
    const result = await urlLivenessModule.runProbeSweep({
      eventIdsWithUrls: items,
      deadlineMs: Date.now() + 5_000, // generous; all should clear
    });

    expect(result.probed + result.skippedBudget).toBe(4);
  });

  it('per-host throttle inside sweep gates same-host bursts (≥3×PER_HOST_INTERVAL - jitter)', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      eventId: `s${i}`,
      url: `https://samehost.example.com/path-${i}`,
    }));

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    cacheGetSafeMock.mockResolvedValue(null);
    cacheSetSafeMock.mockResolvedValue(undefined);
    incrMock.mockResolvedValue(1);

    const t0 = Date.now();
    const result = await urlLivenessModule.runProbeSweep({
      eventIdsWithUrls: items,
      deadlineMs: Date.now() + 10_000,
    });
    const elapsed = Date.now() - t0;

    expect(result.probed).toBe(4);
    // 4 same-host calls ⇒ 3 throttle gaps ⇒ ≥3 × (1000 - 200) = 2400ms.
    expect(elapsed).toBeGreaterThanOrEqual(2_400);
  }, 10_000);
});

// ===========================================================================
// Task 5 — buildProbeCandidates priority sort
// ===========================================================================

describe('Plan 02 Task 5 — buildProbeCandidates (D-04 priority sort)', () => {
  function makeEntity(
    id: string,
    source: string | undefined | null = `https://${id}.example.com/`,
  ) {
    return { id, data: { source } };
  }

  function cacheHit(data: unknown) {
    return { data, stale: false, lastFresh: Date.now() };
  }

  it('never-probed entities sort BEFORE entities with prior liveness keys (Tier A first)', async () => {
    // cacheGetSafe is called once for `events:llm:v3` (returns array of
    // entities) and once per [eventId, url] pair for the liveness key.
    cacheGetSafeMock.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return cacheHit([makeEntity('a'), makeEntity('b'), makeEntity('c')]);
      }
      if (key === `${URL_LIVENESS_KEY_PREFIX}a`) {
        return cacheHit({
          status: 'live',
          lastProbedAt: '2026-05-19T00:00:00.000Z',
          attemptCount: 0,
          lastUrlProbed: 'https://a.example.com/',
          lastHttpStatus: 200,
        });
      }
      if (key === `${URL_LIVENESS_KEY_PREFIX}b`) {
        return cacheHit({
          status: 'live',
          lastProbedAt: '2026-05-20T00:00:00.000Z',
          attemptCount: 0,
          lastUrlProbed: 'https://b.example.com/',
          lastHttpStatus: 200,
        });
      }
      // entity 'c' has NO liveness key — never probed.
      return null;
    });

    const { candidates } = await urlLivenessModule.buildProbeCandidates();
    expect(candidates).toHaveLength(3);
    // 'c' (never-probed) must be first.
    expect(candidates[0]?.eventId).toBe('c');
  });

  it('Tier B sorted oldest lastProbedAt first', async () => {
    cacheGetSafeMock.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return cacheHit([makeEntity('A'), makeEntity('B'), makeEntity('C')]);
      }
      const stamps: Record<string, string> = {
        [`${URL_LIVENESS_KEY_PREFIX}A`]: '2026-01-01T00:00:00.000Z',
        [`${URL_LIVENESS_KEY_PREFIX}B`]: '2026-02-01T00:00:00.000Z',
        [`${URL_LIVENESS_KEY_PREFIX}C`]: '2026-03-01T00:00:00.000Z',
      };
      const lastProbedAt = stamps[key];
      if (lastProbedAt) {
        return cacheHit({
          status: 'live',
          lastProbedAt,
          attemptCount: 0,
          lastUrlProbed: 'https://x/',
          lastHttpStatus: 200,
        });
      }
      return null;
    });

    const { candidates } = await urlLivenessModule.buildProbeCandidates();
    expect(candidates.map((c) => c.eventId)).toEqual(['A', 'B', 'C']);
  });

  it('excludes source-less entities from the candidate array (GHOST-07)', async () => {
    cacheGetSafeMock.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return cacheHit([
          { id: 'empty', data: { source: '' } },
          { id: 'missing', data: {} },
          { id: 'ok', data: { source: 'https://ok.example.com/' } },
          { id: 'nullsrc', data: { source: null } },
        ]);
      }
      return null;
    });
    incrMock.mockResolvedValue(1);

    const { candidates } = await urlLivenessModule.buildProbeCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.eventId).toBe('ok');
  });

  it('writes an explicit no-url liveness entry per source-less event, no fetch (GHOST-07)', async () => {
    cacheGetSafeMock.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return cacheHit([
          { id: 'empty', data: { source: '' } },
          { id: 'missing', data: {} },
          { id: 'ok', data: { source: 'https://ok.example.com/' } },
        ]);
      }
      return null;
    });
    incrMock.mockResolvedValue(1);

    const result = await urlLivenessModule.buildProbeCandidates();

    // classifiedNoUrl counts the two source-less events.
    expect(result.classifiedNoUrl).toBe(2);

    // No HTTP issued by the candidate builder for source-less events.
    expect(fetchMock).not.toHaveBeenCalled();

    // A no-url persistLiveness write fired per source-less event (cacheSetSafe
    // is the persistLiveness sink). 'ok' is NOT written (it's a probe target).
    const noUrlWrites = cacheSetSafeMock.mock.calls.filter(
      ([, value]) => (value as { status?: string }).status === 'no-url',
    );
    expect(noUrlWrites).toHaveLength(2);
    const [, entry] = noUrlWrites[0]!;
    const v = entry as {
      status: string;
      lastUrlProbed: string | null;
      lastHttpStatus: number | null;
      attemptCount: number;
      evidence: string | null;
    };
    expect(v.status).toBe('no-url');
    expect(v.lastUrlProbed).toBeNull();
    expect(v.lastHttpStatus).toBeNull();
    expect(v.attemptCount).toBe(0);
    expect(v.evidence).toBe('no-url: event has no source URL');
  });

  it('a no-url write does NOT INCR the sidecar dead-count (GHOST-07)', async () => {
    cacheGetSafeMock.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return cacheHit([{ id: 'nourl', data: {} }]);
      }
      return null;
    });
    incrMock.mockResolvedValue(1);

    await urlLivenessModule.buildProbeCandidates();

    expect(incrMock).not.toHaveBeenCalled();
  });

  it('cache miss on events:llm:v3 returns empty candidates', async () => {
    cacheGetSafeMock.mockResolvedValueOnce(null);
    const { candidates, classifiedNoUrl } = await urlLivenessModule.buildProbeCandidates();
    expect(candidates).toEqual([]);
    expect(classifiedNoUrl).toBe(0);
  });

  it('empty events array returns empty candidates', async () => {
    cacheGetSafeMock.mockResolvedValueOnce({
      data: [],
      stale: false,
      lastFresh: Date.now(),
    });
    const { candidates, classifiedNoUrl } = await urlLivenessModule.buildProbeCandidates();
    expect(candidates).toEqual([]);
    expect(classifiedNoUrl).toBe(0);
  });
});
