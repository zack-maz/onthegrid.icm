// @vitest-environment node
/**
 * Phase 45 DASH-READ-05 — trendHistory unit tests.
 *
 * Covers the bounded trend-history ring (`dashboard:trends:history`), a verbatim
 * structural copy of `llm:runs:history`:
 *   1. appendTrendSample LPUSHes one JSON entry then LTRIMs to the 30 newest
 *      (cap 30 → ltrim(KEY, 0, 29)).
 *   2. appendTrendSample sets a 30d TTL (30*24*3600 sec) via expire after push.
 *   3. readTrendHistory returns parsed entries newest-first, parsing both
 *      raw-string and already-object Upstash REST shapes.
 *   4. degrade-open — a redis throw inside append is swallowed (no throw); a
 *      redis throw inside read returns [] (never throws).
 *   5. a single sample carries the four scalar series fields (three cronAgeMs
 *      + deadUrlCount) plus a sampledAt ISO timestamp (shape pin).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { lpushMock, ltrimMock, expireMock, lrangeMock } = vi.hoisted(() => ({
  lpushMock: vi.fn(),
  ltrimMock: vi.fn(),
  expireMock: vi.fn(),
  lrangeMock: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    lpush: (...args: unknown[]) => lpushMock(...args),
    ltrim: (...args: unknown[]) => ltrimMock(...args),
    expire: (...args: unknown[]) => expireMock(...args),
    lrange: (...args: unknown[]) => lrangeMock(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
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
} from '../../lib/trendHistory.js';

function sample(over: Partial<TrendSample> = {}): TrendSample {
  return {
    sampledAt: '2026-06-22T00:00:00.000Z',
    cronAgeMs: { health: 1000, warm: 2000, 'refresh-events': 3000 },
    deadUrlCount: 4,
    ...over,
  };
}

beforeEach(() => {
  lpushMock.mockReset().mockResolvedValue(1);
  ltrimMock.mockReset().mockResolvedValue('OK');
  expireMock.mockReset().mockResolvedValue(1);
  lrangeMock.mockReset().mockResolvedValue([]);
});

describe('trendHistory', () => {
  it('appendTrendSample LPUSHes one JSON entry then LTRIMs to the 30 newest (cap 30)', async () => {
    await appendTrendSample(sample());

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lpushMock.mock.calls[0][0]).toBe(TREND_HISTORY_KEY);
    expect(lpushMock.mock.calls[0][0]).toBe('dashboard:trends:history');
    const pushed = JSON.parse(lpushMock.mock.calls[0][1] as string) as TrendSample;
    expect(pushed.sampledAt).toBe('2026-06-22T00:00:00.000Z');

    // Cap 30 → LTRIM(KEY, 0, 29).
    expect(ltrimMock).toHaveBeenCalledWith(TREND_HISTORY_KEY, 0, 29);
    expect(TREND_MAX).toBe(30);
  });

  it('appendTrendSample sets a 30d TTL via expire after every push', async () => {
    await appendTrendSample(sample());

    expect(expireMock).toHaveBeenCalledWith(TREND_HISTORY_KEY, 30 * 24 * 3600);
    expect(TREND_TTL_SEC).toBe(30 * 24 * 3600);
  });

  it('readTrendHistory returns parsed entries newest-first, parsing raw-string AND object shapes', async () => {
    const a = sample({ sampledAt: '2026-06-22T00:00:00.000Z', deadUrlCount: 1 });
    const b = sample({ sampledAt: '2026-06-21T00:00:00.000Z', deadUrlCount: 2 });
    // Head = newest. Mixed shapes: raw-string + already-deserialized object.
    lrangeMock.mockResolvedValue([JSON.stringify(a), b]);

    const out = await readTrendHistory();
    expect(out).toHaveLength(2);
    expect(out[0].sampledAt).toBe('2026-06-22T00:00:00.000Z'); // newest at head
    expect(out[0].deadUrlCount).toBe(1);
    expect(out[1].sampledAt).toBe('2026-06-21T00:00:00.000Z');
    expect(out[1].deadUrlCount).toBe(2);
    expect(lrangeMock).toHaveBeenCalledWith(TREND_HISTORY_KEY, 0, TREND_MAX - 1);
  });

  it('degrades open: a redis throw inside append is swallowed (no throw escapes)', async () => {
    lpushMock.mockRejectedValue(new Error('redis down'));
    await expect(appendTrendSample(sample())).resolves.toBeUndefined();
  });

  it('degrades open: a redis throw inside read returns [] (never throws)', async () => {
    lrangeMock.mockRejectedValue(new Error('redis down'));
    await expect(readTrendHistory()).resolves.toEqual([]);
  });

  it('a single sample carries the four scalar series fields + a sampledAt ISO timestamp (shape pin)', async () => {
    const s = sample({
      sampledAt: '2026-06-22T12:34:56.000Z',
      cronAgeMs: { health: 10, warm: 20, 'refresh-events': 30 },
      deadUrlCount: 7,
    });
    await appendTrendSample(s);

    const pushed = JSON.parse(lpushMock.mock.calls[0][1] as string) as TrendSample;
    // sampledAt is an ISO8601 string that round-trips through Date.
    expect(typeof pushed.sampledAt).toBe('string');
    expect(new Date(pushed.sampledAt).toISOString()).toBe('2026-06-22T12:34:56.000Z');
    // Four scalar series fields: three cronAgeMs + deadUrlCount.
    expect(pushed.cronAgeMs.health).toBe(10);
    expect(pushed.cronAgeMs.warm).toBe(20);
    expect(pushed.cronAgeMs['refresh-events']).toBe(30);
    expect(pushed.deadUrlCount).toBe(7);
  });

  it('a null cronAge survives the round-trip (degrade-open: stalled cron reads as null, not 0)', async () => {
    const s = sample({ cronAgeMs: { health: null, warm: 2000, 'refresh-events': null } });
    await appendTrendSample(s);

    const pushed = JSON.parse(lpushMock.mock.calls[0][1] as string) as TrendSample;
    expect(pushed.cronAgeMs.health).toBeNull();
    expect(pushed.cronAgeMs.warm).toBe(2000);
    expect(pushed.cronAgeMs['refresh-events']).toBeNull();
  });
});
