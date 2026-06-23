// @vitest-environment node
/**
 * Phase 46 HARD-03 (Nyquist backfill) — trendHistory degrade-open unit tests.
 *
 * `server/lib/trendHistory.ts` (Phase 45 DASH-READ-05) shipped WITHOUT a
 * dedicated test file. This backfills its degrade-open throw coverage using the
 * Pattern E mocked-Redis-throw harness (`llmCallHistory.test.ts:17-32`), adapted
 * for the `redis.pipeline()` API: `appendTrendSample` issues a chained
 * lpush+ltrim+expire+exec; `readTrendHistory` reads via `lrange`.
 *
 * Covers:
 *   1. appendTrendSample happy path issues lpush(KEY, json) + ltrim(0, MAX-1) +
 *      expire(TTL) + exec once
 *   2. appendTrendSample with exec() rejecting → resolves no-throw (degrade-open)
 *   3. readTrendHistory happy path returns samples newest-first
 *   4. readTrendHistory dual-shape parse (raw-string member + already-object
 *      member both parse — Upstash REST)
 *   5. readTrendHistory with lrange rejecting → returns []
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { lpushMock, ltrimMock, expireMock, execMock, lrangeMock, pipelineMock } = vi.hoisted(() => {
  const lpush = vi.fn();
  const ltrim = vi.fn();
  const expire = vi.fn();
  const exec = vi.fn();
  // Chainable pipeline: lpush/ltrim/expire return `this`; exec() resolves/rejects.
  const chain = {
    lpush: (...a: unknown[]) => {
      lpush(...a);
      return chain;
    },
    ltrim: (...a: unknown[]) => {
      ltrim(...a);
      return chain;
    },
    expire: (...a: unknown[]) => {
      expire(...a);
      return chain;
    },
    exec: (...a: unknown[]) => exec(...a),
  };
  return {
    lpushMock: lpush,
    ltrimMock: ltrim,
    expireMock: expire,
    execMock: exec,
    lrangeMock: vi.fn(),
    pipelineMock: vi.fn(() => chain),
  };
});

vi.mock('../../cache/redis.js', () => ({
  redis: {
    pipeline: (...a: unknown[]) => pipelineMock(...a),
    lrange: (...a: unknown[]) => lrangeMock(...a),
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import {
  appendTrendSample,
  readTrendHistory,
  TREND_HISTORY_KEY,
  TREND_MAX,
  TREND_TTL_SEC,
  type TrendSample,
} from '../trendHistory.js';

function makeSample(over: Partial<TrendSample> = {}): TrendSample {
  return {
    sampledAt: '2026-06-22T00:00:00.000Z',
    cronAgeMs: { health: 1000, warm: 2000, 'refresh-events': 3000 },
    deadUrlCount: 5,
    ...over,
  };
}

beforeEach(() => {
  lpushMock.mockReset();
  ltrimMock.mockReset();
  expireMock.mockReset();
  execMock.mockReset().mockResolvedValue([]);
  lrangeMock.mockReset().mockResolvedValue([]);
  pipelineMock.mockClear();
});

describe('trendHistory', () => {
  it('appendTrendSample issues the bounded-ring pipeline (lpush + ltrim + expire + exec once)', async () => {
    const sample = makeSample();
    await appendTrendSample(sample);

    expect(pipelineMock).toHaveBeenCalledTimes(1);

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lpushMock.mock.calls[0][0]).toBe(TREND_HISTORY_KEY);
    expect(lpushMock.mock.calls[0][1]).toBe(JSON.stringify(sample));

    expect(ltrimMock).toHaveBeenCalledTimes(1);
    expect(ltrimMock.mock.calls[0]).toEqual([TREND_HISTORY_KEY, 0, TREND_MAX - 1]);

    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0]).toEqual([TREND_HISTORY_KEY, TREND_TTL_SEC]);

    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('degrades open: appendTrendSample resolves no-throw when pipeline exec() rejects', async () => {
    execMock.mockRejectedValue(new Error('redis down'));
    await expect(appendTrendSample(makeSample())).resolves.toBeUndefined();
  });

  it('readTrendHistory returns samples newest-first', async () => {
    const newest = makeSample({ sampledAt: '2026-06-22T00:00:00.000Z', deadUrlCount: 7 });
    const older = makeSample({ sampledAt: '2026-06-21T00:00:00.000Z', deadUrlCount: 3 });
    // lrange returns head-first (newest at index 0).
    lrangeMock.mockResolvedValue([JSON.stringify(newest), JSON.stringify(older)]);

    const out = await readTrendHistory();
    expect(out).toHaveLength(2);
    expect(out[0].sampledAt).toBe('2026-06-22T00:00:00.000Z');
    expect(out[0].deadUrlCount).toBe(7);
    expect(out[1].sampledAt).toBe('2026-06-21T00:00:00.000Z');
  });

  it('readTrendHistory parses BOTH raw-string and already-object members (Upstash dual-shape)', async () => {
    const asString = makeSample({ deadUrlCount: 1 });
    const asObject = makeSample({ deadUrlCount: 2 });
    // Mixed: a JSON string + an already-deserialized object (Upstash REST).
    lrangeMock.mockResolvedValue([JSON.stringify(asString), asObject]);

    const out = await readTrendHistory();
    expect(out).toHaveLength(2);
    expect(out[0].deadUrlCount).toBe(1);
    expect(out[1].deadUrlCount).toBe(2);
  });

  it('degrades open: readTrendHistory returns [] when lrange rejects', async () => {
    lrangeMock.mockRejectedValue(new Error('redis down'));
    await expect(readTrendHistory()).resolves.toEqual([]);
  });
});
