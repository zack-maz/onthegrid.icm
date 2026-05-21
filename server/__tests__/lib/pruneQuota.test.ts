// @vitest-environment node
/**
 * Phase 32 Plan 32-01 Task 4 — pruneQuota INCR / 50-cap / 51st-call /
 * UTC-midnight reset coverage.
 *
 * Mirrors the mock boilerplate from
 * server/__tests__/routes/events.replayQuota.test.ts:28-91 (vi.hoisted for
 * mockIncr + mockExpire). Tests the pure helper directly (no HTTP route)
 * because the route integration tests for `/api/events/prune-dead-urls`
 * land in Plan 32-03.
 *
 * MEDIUM-02 (plan-checker): assert NODE_ENV === 'test' at file-import
 * time so any future test-runner config drift (e.g. vitest no longer
 * forcing NODE_ENV=test) fails this file loudly rather than silently
 * compromising assertions that depend on test-mode behavior elsewhere.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// MEDIUM-02 plan-checker fix — assert NODE_ENV=test so any future runner
// config drift surfaces here rather than silently compromising assertions
// in modules that gate on test-mode behavior.
expect(process.env.NODE_ENV).toBe('test');

// Hoist Redis mocks so the vi.mock factory below can reference them in
// its closure (matches events.replayQuota.test.ts:28-91 pattern).
const { mockIncr, mockExpire } = vi.hoisted(() => ({
  mockIncr: vi.fn(async (_key: string): Promise<number> => 1),
  mockExpire: vi.fn(async (_key: string, _ttl: number): Promise<number> => 1),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    incr: (key: string) => mockIncr(key),
    expire: (key: string, ttl: number) => mockExpire(key, ttl),
  },
}));

// Dynamic import AFTER vi.mock registration so the mocked redis module
// is what `checkPruneQuota` resolves at runtime.
const { checkPruneQuota } = await import('../../lib/pruneQuota.js');

describe('Phase 32 D-15 — checkPruneQuota', () => {
  beforeEach(() => {
    mockIncr.mockReset();
    mockExpire.mockReset();
    mockExpire.mockResolvedValue(1);
  });

  it('INCR with first call sets EXPIRE QUOTA_TTL_SEC', async () => {
    mockIncr.mockResolvedValueOnce(1);

    const result = await checkPruneQuota('fp-abc');

    expect(mockIncr).toHaveBeenCalledTimes(1);
    const incrKey = mockIncr.mock.calls[0]?.[0];
    expect(incrKey).toMatch(/^operator:prune-quota:fp-abc:\d{4}-\d{2}-\d{2}$/);

    expect(mockExpire).toHaveBeenCalledTimes(1);
    const [expireKey, expireTtl] = mockExpire.mock.calls[0] ?? [];
    expect(expireKey).toBe(incrKey);
    expect(expireTtl).toBe(48 * 3600);

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.cap).toBe(50);
  });

  it('second call same day does NOT re-issue EXPIRE', async () => {
    mockIncr.mockResolvedValueOnce(2);

    const result = await checkPruneQuota('fp-abc');

    expect(mockIncr).toHaveBeenCalledTimes(1);
    expect(mockExpire).not.toHaveBeenCalled();
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
  });

  it('50th call returns allowed:true (cap inclusive)', async () => {
    mockIncr.mockResolvedValueOnce(50);

    const result = await checkPruneQuota('fp-heavy');

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(50);
    expect(result.cap).toBe(50);
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('51st call returns allowed:false + retryAfterSeconds > 0 + <= 86400', async () => {
    mockIncr.mockResolvedValueOnce(51);

    const result = await checkPruneQuota('fp-overshoot');

    expect(result.allowed).toBe(false);
    expect(result.used).toBe(51);
    expect(result.cap).toBe(50);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(86400);
  });

  it('resetsAt is next UTC midnight ISO', async () => {
    mockIncr.mockResolvedValueOnce(1);

    const result = await checkPruneQuota('fp-reset');

    const reset = new Date(result.resetsAt);
    expect(Number.isNaN(reset.getTime())).toBe(false);
    // UTC midnight: H/M/S/MS are all zero.
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
    expect(reset.getUTCSeconds()).toBe(0);
    expect(reset.getUTCMilliseconds()).toBe(0);
    // Reset must be in the future (or exactly now at the millisecond boundary).
    expect(reset.getTime()).toBeGreaterThanOrEqual(Date.now());
    // And at most 24h + 1s in the future (1s buffer for test-machine drift
    // between Date.now() inside the helper and Date.now() here).
    expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(86400 * 1000 + 1000);
  });

  it('key prefix is operator:prune-quota: (NOT operator:replay-quota:)', async () => {
    mockIncr.mockResolvedValueOnce(1);

    await checkPruneQuota('fp-prefix-check');

    const key = mockIncr.mock.calls[0]?.[0] ?? '';
    expect(key.startsWith('operator:prune-quota:')).toBe(true);
    expect(key.includes('replay-quota')).toBe(false);
  });
});
