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
} from '../../lib/llmTokenBudget.js';

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
