// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../cache/redis.js', () => {
  const incrbyMock = vi.fn();
  const expireMock = vi.fn();
  const execMock = vi.fn();
  const getMock = vi.fn();

  const multi = () => {
    const chain = {
      incrby: (...a: unknown[]) => {
        incrbyMock(...a);
        return chain;
      },
      expire: (...a: unknown[]) => {
        expireMock(...a);
        return chain;
      },
      exec: () => execMock(),
    };
    return chain;
  };

  return {
    redis: {
      multi,
      get: (...a: unknown[]) => getMock(...a),
    },
    // expose mocks for test access
    __mocks: { incrbyMock, expireMock, execMock, getMock },
  };
});

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import * as redisMod from '../../cache/redis.js';
import {
  incrDailyTokens,
  getDailyTokens,
  budgetState,
  todayKey,
  DAILY_LIMITS,
  shouldPauseNewEvents,
  prioritizeBySeverity,
} from '../../lib/llmTokenBudget.js';

import type { EventGroup } from '../../lib/eventGrouping.js';
import type { ConflictEventEntity } from '../../types.js';

// Access the mock handles attached by the factory.
const mocks = (redisMod as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> })
  .__mocks;
const { incrbyMock, expireMock, execMock, getMock } = mocks;

describe('llmTokenBudget (D-32..D-36)', () => {
  beforeEach(() => {
    incrbyMock.mockReset();
    expireMock.mockReset();
    execMock.mockReset().mockResolvedValue([0, 1]);
    getMock.mockReset().mockResolvedValue(null);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TB1: todayKey(cerebras) returns llm:tokens:cerebras:YYYY-MM-DD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:34:56Z'));
    expect(todayKey('cerebras')).toBe('llm:tokens:cerebras:2026-04-20');
    expect(todayKey('groq')).toBe('llm:tokens:groq:2026-04-20');
  });

  it('TB2: incrDailyTokens(cerebras, 500) calls redis.multi().incrby + expire(172800)', async () => {
    execMock.mockResolvedValue([500, 1]);
    const result = await incrDailyTokens('cerebras', 500);
    expect(incrbyMock).toHaveBeenCalledWith(expect.stringMatching(/^llm:tokens:cerebras:/), 500);
    expect(expireMock).toHaveBeenCalledWith(expect.stringMatching(/^llm:tokens:cerebras:/), 172800);
    expect(result).toBe(500);
  });

  it('TB3: budgetState(cerebras, 799_999) returns ok (< 80%)', () => {
    expect(budgetState('cerebras', 799_999)).toBe('ok');
  });

  it('TB4: budgetState(cerebras, 800_000) returns soft (=== 80%)', () => {
    expect(budgetState('cerebras', 800_000)).toBe('soft');
  });

  it('TB5: budgetState(cerebras, 949_999) returns soft', () => {
    expect(budgetState('cerebras', 949_999)).toBe('soft');
  });

  it('TB6: budgetState(cerebras, 950_000) returns hard (=== 95%)', () => {
    expect(budgetState('cerebras', 950_000)).toBe('hard');
  });

  it('TB7: groq thresholds — ok < 160K, soft >= 160K, hard >= 190K', () => {
    expect(budgetState('groq', 159_999)).toBe('ok');
    expect(budgetState('groq', 160_000)).toBe('soft');
    expect(budgetState('groq', 190_000)).toBe('hard');
  });

  it('TB8: getDailyTokens returns 0 when Redis key absent', async () => {
    getMock.mockResolvedValue(null);
    expect(await getDailyTokens('cerebras')).toBe(0);
  });

  it('TB9: incrDailyTokens swallows Redis errors (returns 0)', async () => {
    execMock.mockRejectedValue(new Error('redis down'));
    const result = await incrDailyTokens('cerebras', 500);
    expect(result).toBe(0);
  });

  it('DAILY_LIMITS record exposes Cerebras 1M and Groq 200K', () => {
    expect(DAILY_LIMITS.cerebras).toBe(1_000_000);
    expect(DAILY_LIMITS.groq).toBe(200_000);
  });
});

// ---------------------------------------------------------------------------
// Task 3 (Phase 27.4 D-33 / D-35 / B5 fix) — soft-cap helpers.
// ---------------------------------------------------------------------------

/** Minimal ConflictEventEntity factory for fixtures. */
function mkEntity(
  type: 'airstrike' | 'on_ground' | 'explosion' | 'targeted' | 'other',
  opts: { mentions?: number; sources?: number; tier?: number; timestamp?: number } = {},
): ConflictEventEntity {
  const now = Date.now();
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    type,
    lat: 33,
    lng: 44,
    timestamp: opts.timestamp ?? now,
    label: 'test',
    data: {
      cameoCode: '190',
      numMentions: opts.mentions ?? 1,
      numSources: opts.sources ?? 1,
      sourceTier: opts.tier ?? 2,
      actor1: 'A',
      actor2: 'B',
      goldsteinScale: -5,
      source: 'http://example.com',
    } as ConflictEventEntity['data'],
  } as ConflictEventEntity;
}

function mkGroup(
  type: 'airstrike' | 'on_ground' | 'explosion' | 'targeted' | 'other',
  opts: { mentions?: number; sources?: number; timestamp?: number } = {},
): EventGroup {
  const entity = mkEntity(type, opts);
  return {
    key: `grp-${entity.id}`,
    entities: [entity],
    centroidLat: 33,
    centroidLng: 44,
    primaryCameo: '190',
    timestamp: opts.timestamp ?? Date.now(),
    totalMentions: opts.mentions ?? 1,
    totalSources: opts.sources ?? 1,
    sourceUrls: ['http://example.com'],
  };
}

describe('shouldPauseNewEvents (D-33)', () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue(null);
  });

  it('TB10: returns false when both cerebras and groq are in ok state', async () => {
    // 0 tokens used for each → ok/ok
    getMock.mockResolvedValue(0);
    expect(await shouldPauseNewEvents()).toBe(false);
  });

  it('TB11: returns true when cerebras is soft-capped (>= 80% of 1M)', async () => {
    getMock.mockImplementation((key: string) => {
      if (typeof key === 'string' && key.includes('cerebras')) return Promise.resolve(800_000);
      return Promise.resolve(0);
    });
    expect(await shouldPauseNewEvents()).toBe(true);
  });

  it('TB12: returns true when groq is soft-capped even if cerebras is ok', async () => {
    getMock.mockImplementation((key: string) => {
      if (typeof key === 'string' && key.includes('groq')) return Promise.resolve(160_000);
      return Promise.resolve(0);
    });
    expect(await shouldPauseNewEvents()).toBe(true);
  });

  it('TB13: returns false when BOTH providers are hard-capped (soft gate only fires on soft state)', async () => {
    // Hard cap for both — soft-cap gate is specifically for the 'soft' band.
    getMock.mockImplementation((key: string) => {
      if (typeof key === 'string' && key.includes('cerebras')) return Promise.resolve(960_000);
      if (typeof key === 'string' && key.includes('groq')) return Promise.resolve(195_000);
      return Promise.resolve(0);
    });
    expect(await shouldPauseNewEvents()).toBe(false);
  });
});

describe('prioritizeBySeverity (D-35)', () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue(null);
  });

  it('TB14: returns groups unchanged (reference equality) when neither provider is soft-capped', async () => {
    getMock.mockResolvedValue(0);
    const groups = [mkGroup('airstrike'), mkGroup('on_ground'), mkGroup('other')];
    const result = await prioritizeBySeverity(groups);
    expect(result).toBe(groups); // reference equality — no sort overhead
  });

  it('TB15: returns a NEW array sorted by severity desc when soft-capped', async () => {
    getMock.mockImplementation((key: string) => {
      if (typeof key === 'string' && key.includes('cerebras')) return Promise.resolve(800_000);
      return Promise.resolve(0);
    });
    const low = mkGroup('other', { mentions: 1, sources: 1 });
    const mid = mkGroup('on_ground', { mentions: 5, sources: 3 });
    const high = mkGroup('airstrike', { mentions: 20, sources: 10 });
    const groups = [low, mid, high];
    const result = await prioritizeBySeverity(groups);

    // NEW array (not the same reference)
    expect(result).not.toBe(groups);
    // Highest-severity group at index 0
    expect(result[0]).toBe(high);
    expect(result[result.length - 1]).toBe(low);
  });

  it('TB16: ties broken deterministically by timestamp desc', async () => {
    getMock.mockImplementation((key: string) => {
      if (typeof key === 'string' && key.includes('cerebras')) return Promise.resolve(800_000);
      return Promise.resolve(0);
    });
    // Two groups with identical severity inputs but different timestamps.
    const older = mkGroup('airstrike', { mentions: 5, sources: 3, timestamp: 1000 });
    const newer = mkGroup('airstrike', { mentions: 5, sources: 3, timestamp: 2000 });
    const result = await prioritizeBySeverity([older, newer]);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(older);
  });
});
