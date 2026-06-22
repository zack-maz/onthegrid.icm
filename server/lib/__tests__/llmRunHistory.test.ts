// @vitest-environment node
/**
 * Phase 39 OBS-FLIGHT-02 — llmRunHistory unit tests.
 *
 * Covers the per-run summary ring (`llm:runs:history`) open/close lifecycle and
 * the re-LPUSH + dedupe-by-runId reader (GA-2):
 *   1. openRunRecord LPUSHes a `{ outcome:'running', completedAt:null }` record
 *   2. closeRunRecord re-LPUSHes a terminal record (a SECOND lpush, NOT lset)
 *   3. listRunHistory dedupes running+terminal for one runId → ONE terminal entry
 *   4. a never-closed `running` record survives dedupe and is returned (Pitfall 5)
 *   5. a thrown redis op makes writes no-ops and list returns []
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { lpushMock, ltrimMock, expireMock, lrangeMock, lsetMock } = vi.hoisted(() => ({
  lpushMock: vi.fn(),
  ltrimMock: vi.fn(),
  expireMock: vi.fn(),
  lrangeMock: vi.fn(),
  lsetMock: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  redis: {
    lpush: (...args: unknown[]) => lpushMock(...args),
    ltrim: (...args: unknown[]) => ltrimMock(...args),
    expire: (...args: unknown[]) => expireMock(...args),
    lrange: (...args: unknown[]) => lrangeMock(...args),
    lset: (...args: unknown[]) => lsetMock(...args),
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import {
  openRunRecord,
  closeRunRecord,
  listRunHistory,
  hydrateRunHistoryIfCold,
  __resetRunHistoryHydrationForTest,
} from '../llmRunHistory.js';

import type { RunHistoryEntry } from '../llmProgress.js';

function terminal(over: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    runId: 'run-1',
    startedAt: '2026-06-04T00:00:00.000Z',
    completedAt: '2026-06-04T00:05:00.000Z',
    outcome: 'completed',
    batchCount: 10,
    batchesCompleted: 10,
    batchesFailed: 0,
    tokenSpend: { nvidia_nim: 1234 },
    evalScore: undefined,
    dlqDelta: 0,
    watchdogTimeouts: 0,
    durationMs: 300000,
    pipelineVersion: 'v3',
    ...over,
  };
}

function running(runId: string): RunHistoryEntry {
  return terminal({ runId, outcome: 'running', completedAt: null });
}

beforeEach(() => {
  lpushMock.mockReset().mockResolvedValue(1);
  ltrimMock.mockReset().mockResolvedValue('OK');
  expireMock.mockReset().mockResolvedValue(1);
  lrangeMock.mockReset().mockResolvedValue([]);
  lsetMock.mockReset().mockResolvedValue('OK');
  __resetRunHistoryHydrationForTest();
});

describe('llmRunHistory', () => {
  it('openRunRecord LPUSHes a running record with completedAt:null', async () => {
    await openRunRecord({ runId: 'run-x', startedAt: '2026-06-04T00:00:00.000Z' });

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lpushMock.mock.calls[0][0]).toBe('llm:runs:history');
    const pushed = JSON.parse(lpushMock.mock.calls[0][1] as string) as RunHistoryEntry;
    expect(pushed.runId).toBe('run-x');
    expect(pushed.outcome).toBe('running');
    expect(pushed.completedAt).toBeNull();

    expect(ltrimMock).toHaveBeenCalledWith('llm:runs:history', 0, 199);
    expect(expireMock).toHaveBeenCalledWith('llm:runs:history', 30 * 24 * 3600);
  });

  it('closeRunRecord re-LPUSHes a terminal record (NOT lset)', async () => {
    await closeRunRecord(terminal({ runId: 'run-y', outcome: 'completed' }));

    expect(lpushMock).toHaveBeenCalledTimes(1);
    expect(lsetMock).not.toHaveBeenCalled();
    const pushed = JSON.parse(lpushMock.mock.calls[0][1] as string) as RunHistoryEntry;
    expect(pushed.outcome).toBe('completed');
  });

  it('listRunHistory dedupes running+terminal for one runId, keeping the terminal head', async () => {
    // Head = newest. Terminal was re-LPUSHed AFTER the running record, so it
    // sits at the head; the running record sits deeper.
    lrangeMock.mockResolvedValue([
      JSON.stringify(terminal({ runId: 'A', outcome: 'completed' })),
      JSON.stringify(running('A')),
      JSON.stringify(running('B')),
    ]);

    const out = await listRunHistory();
    expect(out).toHaveLength(2); // one per runId
    const a = out.find((r) => r.runId === 'A');
    const b = out.find((r) => r.runId === 'B');
    expect(a?.outcome).toBe('completed'); // terminal head-first wins
    expect(b?.outcome).toBe('running'); // never-closed survivor (Pitfall 5)
  });

  it('returns a never-closed running record (Pitfall 5 — the run that died)', async () => {
    lrangeMock.mockResolvedValue([JSON.stringify(running('orphan'))]);
    const out = await listRunHistory();
    expect(out).toHaveLength(1);
    expect(out[0].runId).toBe('orphan');
    expect(out[0].outcome).toBe('running');
    expect(out[0].completedAt).toBeNull();
  });

  it('degrades open: thrown redis op makes writes no-ops and list returns []', async () => {
    lpushMock.mockRejectedValue(new Error('redis down'));
    lrangeMock.mockRejectedValue(new Error('redis down'));

    await expect(
      openRunRecord({ runId: 'z', startedAt: '2026-06-04T00:00:00.000Z' }),
    ).resolves.toBeUndefined();
    await expect(closeRunRecord(terminal())).resolves.toBeUndefined();
    await expect(listRunHistory()).resolves.toEqual([]);
  });

  it('hydrateRunHistoryIfCold runs once (flag prevents re-LRANGE)', async () => {
    lrangeMock.mockResolvedValue([JSON.stringify(terminal())]);
    await hydrateRunHistoryIfCold();
    await hydrateRunHistoryIfCold();
    expect(lrangeMock).toHaveBeenCalledTimes(1);
  });

  // HARD-03 NAMED GAP (D-10/D-11) — hydration-throw no-op + flag-stays-set.
  // Distinct from the happy-path flag-guard case above: here the LRANGE inside
  // hydrate throws MID-HYDRATE. The contract is (a) hydrate resolves (never
  // throws — listRunHistory swallows to []), and (b) the hydration flag STAYS
  // set so a second call is a no-op (no retry-loop / no second LRANGE).
  it('hydrate is a no-op when LRANGE throws mid-hydrate; flag stays set (no retry-loop)', async () => {
    lrangeMock.mockRejectedValue(new Error('redis down'));
    __resetRunHistoryHydrationForTest();

    // First call: resolves despite the throw.
    await expect(hydrateRunHistoryIfCold()).resolves.toBeUndefined();
    expect(lrangeMock).toHaveBeenCalledTimes(1);

    // Second call: flag stays set → short-circuit, NO re-LRANGE (no retry-loop).
    await expect(hydrateRunHistoryIfCold()).resolves.toBeUndefined();
    expect(lrangeMock).toHaveBeenCalledTimes(1);
  });
});
