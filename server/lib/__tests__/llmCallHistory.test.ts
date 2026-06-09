// @vitest-environment node
/**
 * Phase 39 OBS-FLIGHT-01 / -05 / -06 — llmCallHistory unit tests.
 *
 * Covers the Redis-backed bounded call-history ring (`llm:calls:history`):
 *   1. appendCallHistory issues lpush + ltrim(0, 499) + expire(30d)
 *   2. listCallHistory parses BOTH string members AND already-deserialized
 *      objects (Upstash dual-shape parseEntry guard, Pitfall 3)
 *   3. cold-start hydrate populates the empty singleton on the first call and
 *      the module-level flag short-circuits the second call (no second lrange)
 *   4. a thrown redis op makes append a degrade-open no-op (no throw) and list
 *      returns [] (observability-only contract)
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

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

// The hydration helper mutates the llmProgress singleton; import the real
// module so the test can read/clear its callHistory between cases.
import {
  appendCallHistory,
  listCallHistory,
  hydrateCallHistoryIfCold,
  __resetCallHistoryHydrationForTest,
} from '../llmCallHistory.js';
import { llmProgress, type CallHistoryEntry } from '../llmProgress.js';

function makeEntry(over: Partial<CallHistoryEntry> = {}): CallHistoryEntry {
  return {
    provider: 'nvidia_nim',
    model: 'qwen-235b',
    tokensIn: 100,
    tokensOut: 50,
    durationMs: 1200,
    ok: true,
    batchSize: 8,
    timestamp: Date.now(),
    runId: 'run-abc',
    batchIndex: 0,
    ...over,
  };
}

beforeEach(() => {
  lpushMock.mockReset().mockResolvedValue(1);
  ltrimMock.mockReset().mockResolvedValue('OK');
  expireMock.mockReset().mockResolvedValue(1);
  lrangeMock.mockReset().mockResolvedValue([]);
  llmProgress.callHistory = undefined;
  __resetCallHistoryHydrationForTest();
});

describe('llmCallHistory', () => {
  it('appendCallHistory issues lpush + ltrim(0, 499) + expire(30d)', async () => {
    const entry = makeEntry();
    await appendCallHistory(entry);

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lpushMock.mock.calls[0][0]).toBe('llm:calls:history');
    expect(lpushMock.mock.calls[0][1]).toBe(JSON.stringify(entry));

    expect(ltrimMock).toHaveBeenCalledTimes(1);
    expect(ltrimMock.mock.calls[0]).toEqual(['llm:calls:history', 0, 499]);

    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock.mock.calls[0]).toEqual(['llm:calls:history', 30 * 24 * 3600]);
  });

  it('listCallHistory parses BOTH string and already-deserialized object members', async () => {
    const a = makeEntry({ runId: 'a' });
    const b = makeEntry({ runId: 'b' });
    // Mixed array: a JSON string + an already-parsed object (Upstash REST).
    lrangeMock.mockResolvedValue([JSON.stringify(a), b]);

    const out = await listCallHistory();
    expect(out).toHaveLength(2);
    expect(out[0].runId).toBe('a');
    expect(out[1].runId).toBe('b');
  });

  it('cold-start hydrate populates the empty singleton once; flag prevents re-LRANGE', async () => {
    const fromRedis = [makeEntry({ runId: 'r1' }), makeEntry({ runId: 'r2' })];
    lrangeMock.mockResolvedValue(fromRedis.map((e) => JSON.stringify(e)));

    expect(llmProgress.callHistory).toBeUndefined();

    await hydrateCallHistoryIfCold();
    expect(llmProgress.callHistory).toBeDefined();
    expect(llmProgress.callHistory).toHaveLength(2);
    expect(lrangeMock).toHaveBeenCalledTimes(1);

    // Second invocation short-circuits on the module flag — no second lrange.
    await hydrateCallHistoryIfCold();
    expect(lrangeMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT overwrite a non-empty in-memory singleton on hydrate', async () => {
    llmProgress.callHistory = [makeEntry({ runId: 'in-memory' })];
    lrangeMock.mockResolvedValue([JSON.stringify(makeEntry({ runId: 'from-redis' }))]);

    await hydrateCallHistoryIfCold();
    expect(llmProgress.callHistory).toHaveLength(1);
    expect(llmProgress.callHistory?.[0].runId).toBe('in-memory');
  });

  it('degrades open: a thrown redis op makes append a no-op and list returns []', async () => {
    lpushMock.mockRejectedValue(new Error('redis down'));
    lrangeMock.mockRejectedValue(new Error('redis down'));

    // Append must not throw.
    await expect(appendCallHistory(makeEntry())).resolves.toBeUndefined();
    // List returns [] on failure.
    await expect(listCallHistory()).resolves.toEqual([]);
  });

  // Phase 39 OBS-FLIGHT-05 (Plan 02) — back-correlation contract. Mirrors the
  // freeClaudeRouter callHistory writer: a call entry synthesized while a run is
  // active inherits llmProgress.runId, and the dual-write persists that runId in
  // the JSON payload LPUSH'd to llm:calls:history so the flight recorder can
  // group calls by their parent run.
  it('back-correlates: a call entry built from llmProgress.runId carries it through the dual-write', async () => {
    llmProgress.runId = 'run-back-correlate-xyz';

    // Synthesize an entry exactly as the success-path writer in
    // freeClaudeRouter.ts does (runId inherited from the singleton, batchIndex
    // from the threaded opts).
    const entry = makeEntry({ runId: llmProgress.runId ?? '', batchIndex: 3 });
    expect(entry.runId).toBe('run-back-correlate-xyz');

    await appendCallHistory(entry);

    // The LPUSH'd JSON payload round-trips the runId + batchIndex.
    const persisted = JSON.parse(lpushMock.mock.calls[0][1] as string) as CallHistoryEntry;
    expect(persisted.runId).toBe('run-back-correlate-xyz');
    expect(persisted.batchIndex).toBe(3);

    llmProgress.runId = undefined; // restore for subsequent cases
  });
});
