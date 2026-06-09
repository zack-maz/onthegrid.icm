// @vitest-environment node
/**
 * Phase 28.2 Plan 03 Task 2 — replayQuota unit tests.
 *
 * 7-test matrix per PLAN.md:
 *   1. (RED) module exists / imports resolve
 *   2. First call → INCR returns 1, EXPIRE called with 48h
 *   3. Subsequent calls (2..50) → allowed:true, EXPIRE NOT called
 *   4. 51st call → allowed:false, used:51, retryAfterSeconds positive
 *   5. Different fingerprints same day → independent counters
 *   6. resetsAt is next UTC midnight (pinned via fake timers)
 *   7. retryAfterSeconds is positive even at sub-minute boundaries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { incrMock, expireMock, ttlMock } = vi.hoisted(() => ({
  incrMock: vi.fn(),
  expireMock: vi.fn(),
  ttlMock: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    incr: (...args: unknown[]) => incrMock(...args),
    expire: (...args: unknown[]) => expireMock(...args),
    ttl: (...args: unknown[]) => ttlMock(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import { checkReplayQuota } from '../../lib/replayQuota.js';

beforeEach(() => {
  incrMock.mockReset().mockResolvedValue(1);
  expireMock.mockReset().mockResolvedValue(1);
  ttlMock.mockReset().mockResolvedValue(-1);
  vi.useFakeTimers();
  // Pin time mid-day UTC so resetsAt math is unambiguous.
  vi.setSystemTime(new Date('2026-05-04T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('replayQuota', () => {
  // Test 1 — module exists / imports resolve
  it('exports checkReplayQuota', () => {
    expect(typeof checkReplayQuota).toBe('function');
  });

  // Test 2 — first call of the day
  it('first call: INCR returns 1, EXPIRE called with 48h, allowed:true', async () => {
    incrMock.mockResolvedValue(1);
    const result = await checkReplayQuota('aaaa1111');

    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(incrMock.mock.calls[0][0]).toBe('operator:replay-quota:aaaa1111:2026-05-04');

    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0][0]).toBe('operator:replay-quota:aaaa1111:2026-05-04');
    expect(expireMock.mock.calls[0][1]).toBe(48 * 3600);

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.cap).toBe(50);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.resetsAt).toBe('2026-05-05T00:00:00.000Z');
  });

  // Test 3 — under cap, mid-day usage (INCR returns 25). WR-04: EXPIRE is now
  // re-asserted on EVERY call (idempotent TTL refresh) so a counter whose first
  // EXPIRE failed during a Redis flap self-heals instead of leaking TTL-less.
  it('under-cap subsequent call: EXPIRE re-asserted (WR-04 self-heal)', async () => {
    incrMock.mockResolvedValue(25);
    const result = await checkReplayQuota('bbbb2222');

    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0][0]).toBe('operator:replay-quota:bbbb2222:2026-05-04');
    expect(expireMock.mock.calls[0][1]).toBe(48 * 3600);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(25);
  });

  // Test 4 — at cap (50th call) is still allowed; only 51st blocks.
  it('50th call still allowed; 51st returns allowed:false with positive retryAfter', async () => {
    incrMock.mockResolvedValue(50);
    const at = await checkReplayQuota('cccc3333');
    expect(at.allowed).toBe(true);
    expect(at.used).toBe(50);

    incrMock.mockResolvedValue(51);
    const over = await checkReplayQuota('cccc3333');
    expect(over.allowed).toBe(false);
    expect(over.used).toBe(51);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number.isInteger(over.retryAfterSeconds)).toBe(true);
  });

  // Test 5 — fingerprint isolation: different keys, independent counters.
  it('different fingerprints use independent Redis keys', async () => {
    incrMock.mockResolvedValueOnce(1).mockResolvedValueOnce(51);
    const a = await checkReplayQuota('aaaaaaaa');
    const b = await checkReplayQuota('bbbbbbbb');

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);

    expect(incrMock.mock.calls[0][0]).toBe('operator:replay-quota:aaaaaaaa:2026-05-04');
    expect(incrMock.mock.calls[1][0]).toBe('operator:replay-quota:bbbbbbbb:2026-05-04');
  });

  // Test 6 — resetsAt computation pinned to next UTC midnight
  it('resetsAt is next UTC midnight ISO timestamp', async () => {
    incrMock.mockResolvedValue(2);
    const result = await checkReplayQuota('dddd4444');
    expect(result.resetsAt).toBe('2026-05-05T00:00:00.000Z');

    // Verify retryAfterSeconds matches (resetsAt - now)
    // Now: 2026-05-04T15:00:00Z; reset: 2026-05-05T00:00:00Z = 9h = 32400s
    expect(result.retryAfterSeconds).toBe(32400);
  });

  // Test 7 — retryAfterSeconds always >= 1 even at sub-second boundaries
  it('retryAfterSeconds floors at 1 even one second before midnight', async () => {
    vi.setSystemTime(new Date('2026-05-04T23:59:59.500Z'));
    incrMock.mockResolvedValue(2);
    const result = await checkReplayQuota('eeee5555');
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    // resetsAt is still next UTC midnight after the pinned "now"
    expect(result.resetsAt).toBe('2026-05-05T00:00:00.000Z');
  });
});
