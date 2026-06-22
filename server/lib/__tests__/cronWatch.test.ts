// @vitest-environment node
/**
 * Phase 46 CRON-WATCH-01 — cronWatch degrade-open unit tests.
 *
 * `server/lib/cronWatch.ts` is a verbatim structural copy of
 * `server/lib/trendHistory.ts` (Phase 45 DASH-READ-05): the same bounded
 * `redis.pipeline()` LPUSH+LTRIM+EXPIRE ring + dual-shape `parseEntry` reader.
 * This test reuses the Pattern E mocked-Redis-throw harness adapted for the
 * `redis.pipeline()` API (verbatim from `trendHistory.test.ts:23-65`).
 *
 * Covers:
 *   1. appendWatchSample happy path issues lpush(KEY, json) + ltrim(0, MAX-1) +
 *      expire(TTL) + exec once, with the right key / cap / TTL.
 *   2. appendWatchSample with exec() rejecting → resolves no-throw (degrade-open).
 *   3. readWatchHistory happy path returns samples newest-first.
 *   4. readWatchHistory dual-shape parse (raw-string member + already-object
 *      member both parse — Upstash REST).
 *   5. readWatchHistory with lrange rejecting → returns [].
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
  appendWatchSample,
  readWatchHistory,
  CRON_WATCH_KEY,
  CRON_WATCH_MAX,
  CRON_WATCH_TTL_SEC,
  type WatchSample,
} from '../cronWatch.js';

function makeSample(over: Partial<WatchSample> = {}): WatchSample {
  return {
    sampledAt: '2026-06-22T00:00:00.000Z',
    tickDate: '2026-06-22',
    cronAgeMs: { health: 1000, warm: 2000, 'refresh-events': 3000 },
    eval: { at5km: 0.98, at20km: 0.98, at100km: 0.98 },
    dlqCount: 0,
    breakerTrips: 0,
    result: 'PASS',
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

describe('cronWatch', () => {
  it('exposes the cron:watch:v2.0 key, cap 14, ~30d TTL', () => {
    expect(CRON_WATCH_KEY).toBe('cron:watch:v2.0');
    expect(CRON_WATCH_MAX).toBe(14);
    expect(CRON_WATCH_TTL_SEC).toBe(30 * 24 * 3600);
  });

  it('appendWatchSample issues the bounded-ring pipeline (lpush + ltrim + expire + exec once)', async () => {
    const sample = makeSample();
    await appendWatchSample(sample);

    expect(pipelineMock).toHaveBeenCalledTimes(1);

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lpushMock.mock.calls[0][0]).toBe(CRON_WATCH_KEY);
    expect(lpushMock.mock.calls[0][1]).toBe(JSON.stringify(sample));

    expect(ltrimMock).toHaveBeenCalledTimes(1);
    expect(ltrimMock.mock.calls[0]).toEqual([CRON_WATCH_KEY, 0, CRON_WATCH_MAX - 1]);

    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0]).toEqual([CRON_WATCH_KEY, CRON_WATCH_TTL_SEC]);

    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('degrades open: appendWatchSample resolves no-throw when pipeline exec() rejects', async () => {
    execMock.mockRejectedValue(new Error('redis down'));
    await expect(appendWatchSample(makeSample())).resolves.toBeUndefined();
  });

  it('readWatchHistory returns samples newest-first', async () => {
    const newest = makeSample({ tickDate: '2026-06-22', result: 'PASS' });
    const older = makeSample({ tickDate: '2026-06-21', result: 'FAIL' });
    // lrange returns head-first (newest at index 0).
    lrangeMock.mockResolvedValue([JSON.stringify(newest), JSON.stringify(older)]);

    const out = await readWatchHistory();
    expect(out).toHaveLength(2);
    expect(out[0].tickDate).toBe('2026-06-22');
    expect(out[0].result).toBe('PASS');
    expect(out[1].tickDate).toBe('2026-06-21');
    expect(out[1].result).toBe('FAIL');
  });

  it('readWatchHistory parses BOTH raw-string and already-object members (Upstash dual-shape)', async () => {
    const asString = makeSample({ tickDate: '2026-06-20' });
    const asObject = makeSample({ tickDate: '2026-06-21' });
    // Mixed: a JSON string + an already-deserialized object (Upstash REST).
    lrangeMock.mockResolvedValue([JSON.stringify(asString), asObject]);

    const out = await readWatchHistory();
    expect(out).toHaveLength(2);
    expect(out[0].tickDate).toBe('2026-06-20');
    expect(out[1].tickDate).toBe('2026-06-21');
  });

  it('degrades open: readWatchHistory returns [] when lrange rejects', async () => {
    lrangeMock.mockRejectedValue(new Error('redis down'));
    await expect(readWatchHistory()).resolves.toEqual([]);
  });
});
