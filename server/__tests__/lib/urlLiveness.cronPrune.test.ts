// @vitest-environment node
/**
 * Phase 32 Plan 32-03 Task 1 — pruneDeadUrlEvents helper test matrix.
 *
 * Covers:
 *   - D-12 attemptCount>=3 gate on cron trigger (terminal-dead AND ≥3 ticks)
 *   - manual trigger has NO attemptCount gate
 *   - D-07 unknown / live statuses NEVER pruned (either trigger)
 *   - D-14 audit-log shape per RESEARCH Common Op 2 path (b):
 *       {operation:'prune-dead-urls', args:{trigger, prunedCount, prunedIds},
 *        result:'ok'}
 *   - RESEARCH A8 — cron trigger writes bearerFingerprint:'cron:refresh-events'
 *   - LLM cache splice → cacheSetSafe(events:llm:v3, spliced, LLM_REDIS_TTL_SEC)
 *   - bulk redis.del(events:url-liveness:{B,E,...}) for the pruned set
 *   - sidecar count DECR by prunedCount (Pitfall 3 paired with persistLiveness INCR)
 *
 * MEDIUM-01 (plan-checker): the SCAN iteration inside pruneDeadUrlEvents
 * pins the Upstash signature `Promise<[string | number, string[]]>` via an
 * `as` cast — the executor mirrors Plan 04 buildDeadUrlSample's pattern.
 *
 * Mock strategy mirrors urlLiveness.sweep.test.ts: hoisted vi.mock for
 * cache/redis + operatorAudit + logger; dynamic import after mocks register.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// MEDIUM-02 plan-checker fix — assert NODE_ENV='test'.
expect(process.env.NODE_ENV).toBe('test');

// ---------------------------------------------------------------------------
// Mocks — hoisted before module-under-test import
// ---------------------------------------------------------------------------

const cacheGetSafeMock = vi.fn();
const cacheSetSafeMock = vi.fn();
const scanMock = vi.fn();
const delMock = vi.fn();
const decrbyMock = vi.fn();
const decrMock = vi.fn();
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
    decr: (...args: unknown[]) => decrMock(...args),
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

// Stub fetch (probe code path is imported transitively even though this
// test never triggers it).
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Dynamic import after mock registration.
const { pruneDeadUrlEvents, URL_LIVENESS_KEY_PREFIX } = await import('../../lib/urlLiveness.js');

// ---------------------------------------------------------------------------
// Seed helper — five synthetic events + their per-event liveness entries.
//
//   A → 404, attemptCount=1   (single-tick dead — cron skips, manual prunes)
//   B → dead-host, attemptCount=3 (3-tick dead — both triggers prune)
//   C → unknown, attemptCount=5  (D-07 NEVER pruned regardless of count)
//   D → live, attemptCount=0    (NEVER pruned)
//   E → 403, attemptCount=4    (4-tick dead — both triggers prune)
// ---------------------------------------------------------------------------

const EVENTS = [
  { id: 'A' },
  { id: 'B' },
  { id: 'C' },
  { id: 'D' },
  { id: 'E' },
];

const LIVENESS_BY_ID: Record<string, {
  status: 'live' | '404' | '403' | 'dead-host' | 'unknown';
  attemptCount: number;
  lastUrlProbed: string;
  lastHttpStatus: number | null;
  lastProbedAt: string;
}> = {
  A: { status: '404', attemptCount: 1, lastUrlProbed: 'https://a.example/x', lastHttpStatus: 404, lastProbedAt: '2026-05-20T00:00:00.000Z' },
  B: { status: 'dead-host', attemptCount: 3, lastUrlProbed: 'https://b.example/x', lastHttpStatus: null, lastProbedAt: '2026-05-20T00:00:00.000Z' },
  C: { status: 'unknown', attemptCount: 5, lastUrlProbed: 'https://c.example/x', lastHttpStatus: 500, lastProbedAt: '2026-05-20T00:00:00.000Z' },
  D: { status: 'live', attemptCount: 0, lastUrlProbed: 'https://d.example/x', lastHttpStatus: 200, lastProbedAt: '2026-05-20T00:00:00.000Z' },
  E: { status: '403', attemptCount: 4, lastUrlProbed: 'https://e.example/x', lastHttpStatus: 403, lastProbedAt: '2026-05-20T00:00:00.000Z' },
};

function seedCacheGetSafe(): void {
  cacheGetSafeMock.mockImplementation(async (key: string) => {
    if (key === 'events:llm:v3') {
      return { data: EVENTS, stale: false, lastFresh: Date.now() };
    }
    if (key.startsWith(URL_LIVENESS_KEY_PREFIX)) {
      const id = key.slice(URL_LIVENESS_KEY_PREFIX.length);
      const entry = LIVENESS_BY_ID[id];
      if (!entry) return null;
      return { data: entry, stale: false, lastFresh: Date.now() };
    }
    return null;
  });
}

function seedScan(): void {
  // SCAN returns the five liveness keys in one page (cursor → '0').
  // Pin Upstash signature `Promise<[string | number, string[]]>` per
  // MEDIUM-01. Returning cursor as the string '0' is the canonical
  // "end of iteration" sentinel for @upstash/redis ^1.37.0.
  scanMock.mockResolvedValueOnce([
    '0',
    EVENTS.map((e) => `${URL_LIVENESS_KEY_PREFIX}${e.id}`),
  ]);
}

beforeEach(() => {
  cacheGetSafeMock.mockReset();
  cacheSetSafeMock.mockReset();
  scanMock.mockReset();
  delMock.mockReset();
  decrbyMock.mockReset();
  decrMock.mockReset();
  setMock.mockReset();
  appendAuditMock.mockReset();

  cacheSetSafeMock.mockResolvedValue(undefined);
  delMock.mockResolvedValue(0);
  decrbyMock.mockResolvedValue(0);
  decrMock.mockResolvedValue(0);
  setMock.mockResolvedValue('OK');
  appendAuditMock.mockResolvedValue(undefined);
});

describe('Phase 32 D-12/D-13/D-14 — pruneDeadUrlEvents', () => {
  it('cron trigger prunes only attemptCount>=3 terminal-dead events (B, E)', async () => {
    seedCacheGetSafe();
    seedScan();

    const result = await pruneDeadUrlEvents({ trigger: 'cron' });

    expect(result.prunedCount).toBe(2);
    expect(result.prunedIds.sort()).toEqual(['B', 'E']);
  });

  it('manual trigger prunes ALL terminal-dead events regardless of attemptCount (A, B, E)', async () => {
    seedCacheGetSafe();
    seedScan();

    const result = await pruneDeadUrlEvents({ trigger: 'manual', fingerprint: 'fp-test' });

    expect(result.prunedCount).toBe(3);
    expect(result.prunedIds.sort()).toEqual(['A', 'B', 'E']);
  });

  it('unknown status is NEVER pruned even with attemptCount>=3', async () => {
    seedCacheGetSafe();
    seedScan();

    const cron = await pruneDeadUrlEvents({ trigger: 'cron' });
    expect(cron.prunedIds).not.toContain('C');

    seedScan();
    const manual = await pruneDeadUrlEvents({ trigger: 'manual' });
    expect(manual.prunedIds).not.toContain('C');
  });

  it('live status is NEVER pruned', async () => {
    seedCacheGetSafe();
    seedScan();

    const cron = await pruneDeadUrlEvents({ trigger: 'cron' });
    expect(cron.prunedIds).not.toContain('D');

    seedScan();
    const manual = await pruneDeadUrlEvents({ trigger: 'manual' });
    expect(manual.prunedIds).not.toContain('D');
  });

  it('audit-log entry: cron trigger uses bearerFingerprint cron:refresh-events (RESEARCH A8)', async () => {
    seedCacheGetSafe();
    seedScan();

    await pruneDeadUrlEvents({ trigger: 'cron' });

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const entry = appendAuditMock.mock.calls[0]?.[0] as {
      operation: string;
      bearerFingerprint: string;
      args: { trigger: string; prunedCount: number; prunedIds: string[] };
      result: string;
    };
    expect(entry.operation).toBe('prune-dead-urls');
    expect(entry.bearerFingerprint).toBe('cron:refresh-events');
    expect(entry.result).toBe('ok');
    expect(entry.args.trigger).toBe('cron');
    expect(entry.args.prunedCount).toBe(2);
    expect(entry.args.prunedIds.sort()).toEqual(['B', 'E']);
  });

  it('audit-log entry: manual trigger uses caller-supplied fingerprint', async () => {
    seedCacheGetSafe();
    seedScan();

    await pruneDeadUrlEvents({ trigger: 'manual', fingerprint: 'fp-abc' });

    const entry = appendAuditMock.mock.calls[0]?.[0] as {
      bearerFingerprint: string;
      args: { trigger: string };
    };
    expect(entry.bearerFingerprint).toBe('fp-abc');
    expect(entry.args.trigger).toBe('manual');
  });

  it('events:llm:v3 splice writes spliced array back via cacheSetSafe with LLM TTL', async () => {
    seedCacheGetSafe();
    seedScan();

    await pruneDeadUrlEvents({ trigger: 'cron' });

    // cacheSetSafe MUST be called for events:llm:v3 with spliced array.
    const v3WriteCalls = cacheSetSafeMock.mock.calls.filter((c) => c[0] === 'events:llm:v3');
    expect(v3WriteCalls.length).toBe(1);

    const [, spliced, ttl] = v3WriteCalls[0]!;
    expect(Array.isArray(spliced)).toBe(true);
    // 5 originals − 2 pruned (B, E) = 3 remaining.
    expect((spliced as Array<{ id: string }>).length).toBe(3);
    const remainingIds = (spliced as Array<{ id: string }>).map((e) => e.id).sort();
    expect(remainingIds).toEqual(['A', 'C', 'D']);

    // TTL must be the LLM cache TTL (9000s — Plan 32-03 imports the constant).
    expect(ttl).toBe(9000);
  });

  it('redis.del invoked with the pruned url-liveness keys', async () => {
    seedCacheGetSafe();
    seedScan();

    await pruneDeadUrlEvents({ trigger: 'cron' });

    expect(delMock).toHaveBeenCalled();
    // Implementation may pass the keys as a single array OR as variadic args.
    // Accept either shape: collect all string args and assert membership.
    const allArgs = delMock.mock.calls.flatMap((call) =>
      call.flatMap((a) => (Array.isArray(a) ? a : [a])),
    );
    const keys = allArgs.filter((a): a is string => typeof a === 'string');
    expect(keys).toContain(`${URL_LIVENESS_KEY_PREFIX}B`);
    expect(keys).toContain(`${URL_LIVENESS_KEY_PREFIX}E`);
    expect(keys).not.toContain(`${URL_LIVENESS_KEY_PREFIX}C`);
    expect(keys).not.toContain(`${URL_LIVENESS_KEY_PREFIX}D`);
  });

  it('sidecar count DECR fires with prunedCount (Pitfall 3 paired with persistLiveness INCR)', async () => {
    seedCacheGetSafe();
    seedScan();

    await pruneDeadUrlEvents({ trigger: 'cron' });

    // Implementation may call decrby(KEY, n) OR call decr(KEY) n times — accept either.
    if (decrbyMock.mock.calls.length > 0) {
      // decrby path: single call with (KEY, count).
      const [key, n] = decrbyMock.mock.calls[0]!;
      expect(key).toBe('events:url-liveness-count');
      expect(n).toBe(2);
    } else {
      // decr-loop path: two calls.
      expect(decrMock.mock.calls.length).toBe(2);
      for (const call of decrMock.mock.calls) {
        expect(call[0]).toBe('events:url-liveness-count');
      }
    }
  });

  it('returns {prunedCount:0, prunedIds:[]} when events:llm:v3 cache is empty', async () => {
    // No seed — cacheGetSafe returns null for everything.
    cacheGetSafeMock.mockResolvedValue(null);
    scanMock.mockResolvedValueOnce(['0', []]);

    const result = await pruneDeadUrlEvents({ trigger: 'cron' });

    expect(result.prunedCount).toBe(0);
    expect(result.prunedIds).toEqual([]);
    // No splice write when nothing to prune.
    expect(cacheSetSafeMock).not.toHaveBeenCalledWith(
      'events:llm:v3',
      expect.anything(),
      expect.anything(),
    );
  });
});
