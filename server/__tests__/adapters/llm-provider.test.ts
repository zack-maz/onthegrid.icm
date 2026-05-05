import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

// Mock the openai module with a proper class constructor
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: Record<string, unknown>) {
      // noop - just captures the config
    }
  }
  return { default: MockOpenAI };
});

// Mock config to provide API keys
vi.mock('../../config.js', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    env: {
      ...(orig.env as Record<string, unknown>),
      CEREBRAS_API_KEY: 'test-cerebras-key',
      GROQ_API_KEY: 'test-groq-key',
    },
    isPipelineV2: () => false,
  };
});

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Phase 27.4 mocks: breaker, budget, progress. These are module-level
// singletons in prod; replacing the module gives us per-test control.
vi.mock('../../lib/llmCircuitBreaker.js', () => ({
  isAvailable: vi.fn().mockReturnValue(true),
  record: vi.fn(),
  getBreakerState: vi.fn().mockReturnValue({ cerebras: 'ok', groq: 'ok' }),
}));

vi.mock('../../lib/llmTokenBudget.js', () => ({
  getDailyTokens: vi.fn().mockResolvedValue(0),
  incrDailyTokens: vi.fn().mockResolvedValue(0),
  budgetState: vi.fn().mockReturnValue('ok'),
}));

vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn(),
  llmProgress: { callHistory: undefined },
}));

// Skip real backoff sleeps so tests don't wait 1-4s between retries.
vi.useFakeTimers({ shouldAdvanceTime: true });

import {
  isAvailable as mockIsAvailable,
  record as mockRecord,
} from '../../lib/llmCircuitBreaker.js';
import { updateProgress as mockUpdateProgress } from '../../lib/llmProgress.js';
import {
  getDailyTokens as mockGetDailyTokens,
  incrDailyTokens as mockIncrDailyTokens,
  budgetState as mockBudgetState,
} from '../../lib/llmTokenBudget.js';

const isAvailableFn = vi.mocked(mockIsAvailable);
const recordFn = vi.mocked(mockRecord);
const getDailyTokensFn = vi.mocked(mockGetDailyTokens);
const incrDailyTokensFn = vi.mocked(mockIncrDailyTokens);
const budgetStateFn = vi.mocked(mockBudgetState);
const updateProgressFn = vi.mocked(mockUpdateProgress);

describe('llm-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults since clearAllMocks wipes implementations.
    isAvailableFn.mockReturnValue(true);
    getDailyTokensFn.mockResolvedValue(0);
    incrDailyTokensFn.mockResolvedValue(0);
    budgetStateFn.mockReturnValue('ok');
  });

  it('returns parsed content when Cerebras succeeds', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"events":[]}' } }],
      usage: { total_tokens: 100, prompt_tokens: 80, completion_tokens: 20 },
    });

    const result = await callLLM([{ role: 'user', content: 'test' }], {
      type: 'object',
      properties: {},
    });

    expect(result).toBe('{"events":[]}');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen-3-235b-a22b-instruct-2507' }),
    );
  });

  it('falls back to Groq when Cerebras retries are exhausted', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    // Cerebras fails on both retry attempts
    createMock.mockRejectedValueOnce(new Error('Cerebras down'));
    createMock.mockRejectedValueOnce(new Error('Cerebras down again'));
    // Groq succeeds on first attempt
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"events":[{"id":"1"}]}' } }],
      usage: { total_tokens: 150, prompt_tokens: 100, completion_tokens: 50 },
    });

    const promise = callLLM([{ role: 'user', content: 'test' }], {
      type: 'object',
      properties: {},
    });
    // Advance past the 1s retry backoff.
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toBe('{"events":[{"id":"1"}]}');
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('returns null when both providers fail all retries', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    // 4 failures: Cerebras 1s retry, Cerebras retry-2, Groq 1s retry, Groq retry-2
    createMock.mockRejectedValue(new Error('down'));

    const promise = callLLM([{ role: 'user', content: 'test' }], {
      type: 'object',
      properties: {},
    });
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;

    expect(result).toBeNull();
  });

  it('uses qwen-3-235b for Cerebras and openai/gpt-oss-120b for Groq', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
    });

    await callLLM([{ role: 'user', content: 'test' }], { type: 'object', properties: {} });
    // Post-debug: Cerebras model swapped from gpt-oss-120b (gated to higher
    // tiers) to qwen-3-235b-a22b-instruct-2507 (open on the default tier).
    expect(createMock.mock.calls[0][0].model).toBe('qwen-3-235b-a22b-instruct-2507');
  });

  // ------------------------------------------------------------------------
  // Phase 27.4 D-28/D-29/D-31/D-32 integration tests
  // ------------------------------------------------------------------------

  describe('Phase 27.4 integration (D-28/D-29/D-31/D-32)', () => {
    it('A: when breaker trips for cerebras, skips cerebras and tries groq', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      isAvailableFn.mockImplementation((p) => p !== 'cerebras');

      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
      });

      const result = await callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });

      expect(result).toBe('{"ok":true}');
      // Only one call should have occurred — groq only.
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock.mock.calls[0][0].model).toBe('openai/gpt-oss-120b');
    });

    it('B: when budget is hard for cerebras, skips cerebras', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      budgetStateFn.mockImplementation((p) => (p === 'cerebras' ? 'hard' : 'ok'));

      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
      });

      const result = await callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });

      expect(result).toBe('{"ok":true}');
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock.mock.calls[0][0].model).toBe('openai/gpt-oss-120b');
    });

    it('C: on success, incrDailyTokens called with res.usage.total_tokens', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 12345, prompt_tokens: 10000, completion_tokens: 2345 },
      });

      await callLLM([{ role: 'user', content: 'test' }], { type: 'object', properties: {} });
      expect(incrDailyTokensFn).toHaveBeenCalledWith('cerebras', 12345);
    });

    it('D: on transient error, retry with ~1s backoff happens ONCE then falls to groq', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // Cerebras fails twice (both retry attempts), then Groq succeeds.
      createMock.mockRejectedValueOnce(new Error('cerebras err1'));
      createMock.mockRejectedValueOnce(new Error('cerebras err2'));
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 100, prompt_tokens: 80, completion_tokens: 20 },
      });

      const promise = callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toBe('{"ok":true}');
      // Cerebras retried once + Groq succeeded on first attempt = 3 calls.
      expect(createMock).toHaveBeenCalledTimes(3);
      // record('err') called for both cerebras failures.
      const errRecordCalls = recordFn.mock.calls.filter((c) => c[1] === 'err');
      expect(errRecordCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('E: on total failure across both providers, callLLM returns null', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      createMock.mockRejectedValue(new Error('all down'));

      const promise = callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });
      await vi.advanceTimersByTimeAsync(10000);
      const result = await promise;

      expect(result).toBeNull();
    });

    it('F: appendCallHistory via updateProgress happens on every attempt (ok and err)', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // One failure, then one success.
      createMock.mockRejectedValueOnce(new Error('boom'));
      createMock.mockRejectedValueOnce(new Error('boom'));
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 77, prompt_tokens: 60, completion_tokens: 17 },
      });

      const promise = callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // updateProgress called with callHistory at least 3 times — once per attempt
      const historyCalls = updateProgressFn.mock.calls.filter(
        (c) => c[0] && typeof c[0] === 'object' && 'callHistory' in (c[0] as object),
      );
      expect(historyCalls.length).toBeGreaterThanOrEqual(3);
      // The first (newest) call history entry should carry the success marker
      const lastHistoryCall = historyCalls[historyCalls.length - 1][0] as {
        callHistory?: Array<{ ok: boolean; tokensIn: number; provider: string }>;
      };
      expect(lastHistoryCall.callHistory).toBeDefined();
      expect(lastHistoryCall.callHistory![0].ok).toBe(true);
      expect(lastHistoryCall.callHistory![0].tokensIn).toBe(60);
    });

    it('G: updateProgress with breakerState called after provider exhaustion', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // Both providers fail all retries — should trigger breakerState update.
      createMock.mockRejectedValue(new Error('down'));

      const promise = callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      const breakerCalls = updateProgressFn.mock.calls.filter(
        (c) => c[0] && typeof c[0] === 'object' && 'breakerState' in (c[0] as object),
      );
      expect(breakerCalls.length).toBeGreaterThanOrEqual(2); // one per provider exhaustion
    });

    // ------------------------------------------------------------------------
    // Phase 27.4 post-review follow-up — synthetic skip-entry telemetry.
    //
    // When a provider attempt is bypassed without touching the network
    // (breaker paused, hard cap reached, or no API key configured), we
    // append a synthetic callHistory entry with `skipReason` set so
    // DevApiStatus Events tab can explain "0 enriched" runs instead of
    // presenting an empty history with no actionable diagnosis.
    // ------------------------------------------------------------------------

    type CallHistoryEntry = {
      provider: string;
      ok: boolean;
      tokensIn: number;
      tokensOut: number;
      durationMs: number;
      skipReason?: 'breaker' | 'hard_cap' | 'no_client';
    };
    /**
     * Aggregate the newest entry from every updateProgress({callHistory})
     * call. The mocked `llmProgress` singleton is frozen with
     * `callHistory: undefined`, so `appendCallHistory` always prepends onto
     * an empty list and emits a 1-entry update per append. Collecting the
     * first entry of each gives the full append sequence in order.
     */
    function collectCallHistory(): CallHistoryEntry[] {
      const historyCalls = updateProgressFn.mock.calls.filter(
        (c) => c[0] && typeof c[0] === 'object' && 'callHistory' in (c[0] as object),
      );
      return historyCalls
        .map((c) => (c[0] as { callHistory: CallHistoryEntry[] }).callHistory[0])
        .filter((e): e is CallHistoryEntry => e !== undefined);
    }

    it('H: breaker-paused provider produces synthetic skipReason="breaker" entry', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // Cerebras breaker paused, groq ok — cerebras should produce skip entry.
      isAvailableFn.mockImplementation((p) => p !== 'cerebras');
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
      });

      await callLLM([{ role: 'user', content: 'test' }], { type: 'object', properties: {} });

      const history = collectCallHistory();
      const skipEntries = history.filter((h) => h.skipReason === 'breaker');
      expect(skipEntries.length).toBe(1);
      expect(skipEntries[0].provider).toBe('cerebras');
      expect(skipEntries[0].ok).toBe(false);
      expect(skipEntries[0].tokensIn).toBe(0);
      expect(skipEntries[0].tokensOut).toBe(0);
      expect(skipEntries[0].durationMs).toBe(0);
    });

    it('I: hard-cap budget produces synthetic skipReason="hard_cap" entry', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // Cerebras hard-capped, groq ok — cerebras should produce skip entry.
      budgetStateFn.mockImplementation((p) => (p === 'cerebras' ? 'hard' : 'ok'));
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
      });

      await callLLM([{ role: 'user', content: 'test' }], { type: 'object', properties: {} });

      const history = collectCallHistory();
      const skipEntries = history.filter((h) => h.skipReason === 'hard_cap');
      expect(skipEntries.length).toBe(1);
      expect(skipEntries[0].provider).toBe('cerebras');
      expect(skipEntries[0].ok).toBe(false);
    });

    it('J: when BOTH providers skip, callHistory has 2 skip entries and result is null', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      // Both providers hard-capped — 0 network calls, 2 skip entries, null result.
      budgetStateFn.mockReturnValue('hard');

      const result = await callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });

      expect(result).toBeNull();
      // createMock never invoked — no network activity.
      expect(createMock).not.toHaveBeenCalled();
      const history = collectCallHistory();
      const skipEntries = history.filter((h) => h.skipReason === 'hard_cap');
      expect(skipEntries.length).toBe(2);
      expect(skipEntries.map((e) => e.provider).sort()).toEqual(['cerebras', 'groq']);
    });
  });
});
