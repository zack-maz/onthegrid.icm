// @vitest-environment node
/**
 * Phase 44 — pruneDeadUrlEvents authoritative-counter repair.
 *
 * Before this fix the prune updated the `events:url-liveness-count` sidecar
 * with a DECRBY (prune path) and left it UNTOUCHED on the no-candidate path.
 * When the sidecar had already drifted upward (terminal-dead keys expired on
 * their TTL without a decrement — see urlLiveness.reconcile.test.ts), a manual
 * prune that found nothing left the phantom count in place, so the operator
 * button stayed broken. The prune now SETs the sidecar authoritatively to the
 * terminal-dead membership it actually observed minus what it pruned.
 *
 * Mock strategy mirrors urlLiveness.cronPrune.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

expect(process.env.NODE_ENV).toBe('test');

const cacheGetSafeMock = vi.fn();
const cacheSetSafeMock = vi.fn();
const scanMock = vi.fn();
const delMock = vi.fn();
const decrbyMock = vi.fn();
const setMock = vi.fn();
const appendAuditMock = vi.fn();

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: (...args: unknown[]) => cacheGetSafeMock(...args),
  cacheSetSafe: (...args: unknown[]) => cacheSetSafeMock(...args),
  redis: {
    get: vi.fn(),
    set: (...args: unknown[]) => setMock(...args),
    del: (...args: unknown[]) => delMock(...args),
    scan: (...args: unknown[]) => scanMock(...args),
    decr: vi.fn(),
    decrby: (...args: unknown[]) => decrbyMock(...args),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../../lib/operatorAudit.js', () => ({
  appendOperatorAuditEntry: (...args: unknown[]) => appendAuditMock(...args),
  bearerFingerprint: (s: string) => `fp-${s.slice(0, 4)}`,
  OPERATOR_AUDIT_KEY: 'operator:audit-log',
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.stubGlobal('fetch', vi.fn());

const { pruneDeadUrlEvents, URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY } =
  await import('../../lib/urlLiveness.js');
const { LLM_EVENTS_KEY_ACTIVE } = await import('../../lib/llmExtractionPipeline.js');

const k = (id: string) => `${URL_LIVENESS_KEY_PREFIX}${id}`;

function seedScan(keys: string[]): void {
  scanMock.mockImplementation((cursor: string | number) => {
    if (cursor === '0' || cursor === 0) return Promise.resolve(['0', keys]);
    return Promise.resolve(['0', []]);
  });
}

/**
 * cacheGetSafe dispatch: the v3 events array for LLM_EVENTS_KEY_ACTIVE,
 * a liveness entry for each `events:url-liveness:{id}` key.
 */
function seed(
  v3Ids: string[],
  liveness: Record<string, { status: string; attemptCount?: number }>,
): void {
  cacheGetSafeMock.mockImplementation((key: string) => {
    if (key === LLM_EVENTS_KEY_ACTIVE) {
      return Promise.resolve({ data: v3Ids.map((id) => ({ id })), fetchedAt: Date.now() });
    }
    const id = key.startsWith(URL_LIVENESS_KEY_PREFIX)
      ? key.slice(URL_LIVENESS_KEY_PREFIX.length)
      : null;
    const e = id ? liveness[id] : undefined;
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
  cacheSetSafeMock.mockReset();
  delMock.mockReset();
  decrbyMock.mockReset();
  setMock.mockReset();
  appendAuditMock.mockReset();
});

describe('pruneDeadUrlEvents — authoritative sidecar repair', () => {
  it('resets a drifted counter to 0 when a manual prune finds no live dead keys (prod repro)', async () => {
    // v3 has events, but the liveness keyspace has fully drained (keys expired).
    seed(['X', 'Y'], {});
    seedScan([]);

    const result = await pruneDeadUrlEvents({ trigger: 'manual', fingerprint: 'op' });

    expect(result).toEqual({ prunedCount: 0, prunedIds: [] });
    // The phantom count must be corrected to the real terminal-dead total (0).
    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 0);
  });

  it('sets the counter to (terminalDead - pruned), not a blind DECRBY, on a manual prune', async () => {
    // Two terminal-dead keys (A=404, B=403); manual prunes both → remaining 0.
    seed(['A', 'B'], { A: { status: '404' }, B: { status: '403' } });
    seedScan([k('A'), k('B')]);

    const result = await pruneDeadUrlEvents({ trigger: 'manual', fingerprint: 'op' });

    expect(result.prunedCount).toBe(2);
    expect(result.prunedIds.sort()).toEqual(['A', 'B']);
    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 0);
  });

  it('leaves cron-excluded terminal-dead members in the count on a cron prune', async () => {
    // A=dead-host attemptCount=3 (cron-prunable); B=403 attemptCount=4 (cron SKIPS,
    // still a terminal-dead member). After cron prune: pruned=1, remaining member=1.
    seed(['A', 'B'], {
      A: { status: 'dead-host', attemptCount: 3 },
      B: { status: '403', attemptCount: 4 },
    });
    seedScan([k('A'), k('B')]);

    const result = await pruneDeadUrlEvents({ trigger: 'cron' });

    expect(result.prunedIds).toEqual(['A']);
    expect(setMock).toHaveBeenCalledWith(URL_LIVENESS_COUNT_KEY, 1);
  });
});
