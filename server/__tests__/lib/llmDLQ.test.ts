// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis — must be hoisted before importing the module-under-test.
const saddMock = vi.fn();
const smembersMock = vi.fn();
const scardMock = vi.fn();
const sremMock = vi.fn();
const expireMock = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  redis: {
    sadd: (...args: unknown[]) => saddMock(...args),
    smembers: (...args: unknown[]) => smembersMock(...args),
    scard: (...args: unknown[]) => scardMock(...args),
    srem: (...args: unknown[]) => sremMock(...args),
    expire: (...args: unknown[]) => expireMock(...args),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { enqueueDLQ, listDLQ, countDLQ, DLQ_KEY } from '../../lib/llmDLQ.js';

describe('llmDLQ (D-30)', () => {
  beforeEach(() => {
    saddMock.mockReset().mockResolvedValue(1);
    smembersMock.mockReset().mockResolvedValue([]);
    scardMock.mockReset().mockResolvedValue(0);
    sremMock.mockReset().mockResolvedValue(1);
    expireMock.mockReset().mockResolvedValue(1);
  });

  it('DLQ1: enqueueDLQ calls redis.sadd + redis.expire with DLQ_KEY', async () => {
    await enqueueDLQ({
      id: 'g1',
      reason: 'zod_fail',
      lastError: 'short error',
      timestamp: 1,
    });
    expect(saddMock).toHaveBeenCalledTimes(1);
    expect(saddMock.mock.calls[0][0]).toBe(DLQ_KEY);
    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0][0]).toBe(DLQ_KEY);
    // TTL must be 7 days in seconds
    expect(expireMock.mock.calls[0][1]).toBe(7 * 24 * 3600);
  });

  it('DLQ2: lastError longer than 500 chars is truncated', async () => {
    const longError = 'x'.repeat(2000);
    await enqueueDLQ({
      id: 'g2',
      reason: 'retry_exhausted',
      lastError: longError,
      timestamp: 2,
    });
    const payload = saddMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(payload) as { lastError: string };
    expect(parsed.lastError.length).toBe(500);
  });

  it('DLQ3: when SCARD > 200, oldest-by-timestamp entries are SREM-ed back to 200', async () => {
    // Simulate 205 existing entries — timestamps 1..205
    const entries = Array.from({ length: 205 }, (_, i) => ({
      id: `g${i}`,
      reason: 'zod_fail' as const,
      lastError: 'err',
      timestamp: i + 1,
    }));
    const payloads = entries.map((e) => JSON.stringify(e));
    scardMock.mockResolvedValue(206); // after enqueue, 206 exist
    smembersMock.mockResolvedValue(payloads);

    await enqueueDLQ({
      id: 'newest',
      reason: 'llm_null',
      lastError: 'err',
      timestamp: 9999,
    });

    // Should SREM 6 oldest (206 - 200 = 6). The oldest timestamps are 1..6.
    expect(sremMock).toHaveBeenCalledTimes(1);
    const sremCall = sremMock.mock.calls[0];
    expect(sremCall[0]).toBe(DLQ_KEY);
    // variadic srem(key, ...members) — members start at index 1
    const removedPayloads = sremCall.slice(1) as string[];
    expect(removedPayloads).toHaveLength(6);
    const removedTimestamps = removedPayloads
      .map((p) => (JSON.parse(p) as { timestamp: number }).timestamp)
      .sort((a, b) => a - b);
    expect(removedTimestamps).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('DLQ4: listDLQ(50) returns at most 50 entries sorted newest-first', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      id: `g${i}`,
      reason: 'zod_fail' as const,
      lastError: 'err',
      timestamp: i + 1,
    }));
    smembersMock.mockResolvedValue(entries.map((e) => JSON.stringify(e)));

    const result = await listDLQ(50);
    expect(result).toHaveLength(50);
    // Highest-timestamp entry comes first
    expect(result[0].timestamp).toBe(100);
    expect(result[49].timestamp).toBe(51);
  });

  it('DLQ5: countDLQ returns scard result, and 0 when Redis unreachable', async () => {
    scardMock.mockResolvedValue(42);
    expect(await countDLQ()).toBe(42);

    scardMock.mockRejectedValue(new Error('redis down'));
    expect(await countDLQ()).toBe(0);
  });

  it('DLQ6: all three functions swallow Redis errors — never throw', async () => {
    saddMock.mockRejectedValue(new Error('redis down'));
    expireMock.mockRejectedValue(new Error('redis down'));
    scardMock.mockRejectedValue(new Error('redis down'));
    smembersMock.mockRejectedValue(new Error('redis down'));
    sremMock.mockRejectedValue(new Error('redis down'));

    // Must not throw
    await expect(
      enqueueDLQ({ id: 'g1', reason: 'zod_fail', lastError: 'err', timestamp: 1 }),
    ).resolves.toBeUndefined();
    await expect(listDLQ()).resolves.toEqual([]);
    await expect(countDLQ()).resolves.toBe(0);
  });
});
