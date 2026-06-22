// @vitest-environment node
/**
 * Phase 44 — reconcileDeadUrlCount() drift-repair test.
 *
 * Root cause (this turn): the `events:url-liveness-count` sidecar has NO TTL
 * and only mutates on dead<->live transitions + prune. A terminal-dead key
 * that expires on its finite TTL (or whose event leaves the daily probe set)
 * is never decremented, so the counter drifts upward unboundedly. Observed in
 * prod as deadUrlCount=202 with ZERO live `events:url-liveness:*` keys — the
 * "Prune N dead events" button then prunes 0 and looks broken.
 *
 * reconcileDeadUrlCount() SCANs the keyspace, counts entries where
 * isTerminalDead(status) is true, and SETs the sidecar to that authoritative
 * total. Mock strategy mirrors urlLiveness.cronPrune.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

expect(process.env.NODE_ENV).toBe('test');

const cacheGetSafeMock = vi.fn();
const scanMock = vi.fn();
const setMock = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: (...args: unknown[]) => cacheGetSafeMock(...args),
  cacheSetSafe: vi.fn(),
  redis: {
    get: vi.fn(),
    set: (...args: unknown[]) => setMock(...args),
    del: vi.fn(),
    scan: (...args: unknown[]) => scanMock(...args),
    decr: vi.fn(),
    decrby: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../lib/operatorAudit.js', () => ({
  appendOperatorAuditEntry: vi.fn(),
  bearerFingerprint: (s: string) => `fp-${s.slice(0, 4)}`,
  OPERATOR_AUDIT_KEY: 'operator:audit-log',
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.stubGlobal('fetch', vi.fn());

const { reconcileDeadUrlCount, URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY } =
  await import('../../lib/urlLiveness.js');

const k = (id: string) => `${URL_LIVENESS_KEY_PREFIX}${id}`;

/** One-shot SCAN: cursor '0' returns every key then terminates. */
function seedScan(keys: string[]): void {
  scanMock.mockImplementation((cursor: string | number) => {
    if (cursor === '0' || cursor === 0) return Promise.resolve(['0', keys]);
    return Promise.resolve(['0', []]);
  });
}

function seedEntries(entries: Record<string, { status: string; attemptCount?: number }>): void {
  cacheGetSafeMock.mockImplementation((key: string) => {
    const id = key.startsWith(URL_LIVENESS_KEY_PREFIX)
      ? key.slice(URL_LIVENESS_KEY_PREFIX.length)
      : null;
    const e = id ? entries[id] : undefined;
    if (!e) return Promise.resolve(null);
    return Promise.resolve({
      data: {
        status: e.status,
        lastProbedAt: '2026-06-21T00:00:00.000Z',
        attemptCount: e.attemptCount ?? 1,
        lastUrlProbed: `https://example.com/${id}`,
        lastHttpStatus: null,
        evidence: null,
      },
      fetchedAt: Date.now(),
    });
  });
}

beforeEach(() => {
  scanMock.mockReset();
  cacheGetSafeMock.mockReset();
  setMock.mockReset();
});

describe('reconcileDeadUrlCount', () => {
  it('repairs an over-stated counter when the keyspace has drained empty', async () => {
    // Prod repro: sidecar says 202, zero live liveness keys.
    seedScan([]);
    seedEntries({});

    const result = await reconcileDeadUrlCount();

    expect(result).toBe(0);
    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 0);
  });

  it('sets the sidecar to the count of terminal-dead keys, ignoring live/unknown/no-url', async () => {
    seedScan([k('A'), k('B'), k('C'), k('D'), k('E')]);
    seedEntries({
      A: { status: '404' }, // terminal-dead
      B: { status: 'dead-host' }, // terminal-dead
      C: { status: '403' }, // terminal-dead (counts toward membership)
      D: { status: 'live' }, // NOT dead
      E: { status: 'unknown' }, // NOT dead
    });

    const result = await reconcileDeadUrlCount();

    expect(result).toBe(3);
    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 3);
  });

  it('degrades open (returns null, never throws) when the SCAN throws', async () => {
    scanMock.mockRejectedValue(new Error('redis down'));

    const result = await reconcileDeadUrlCount();

    expect(result).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });
});
