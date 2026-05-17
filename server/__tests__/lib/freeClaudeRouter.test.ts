// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before importing the module-under-test
// ---------------------------------------------------------------------------

const createMock = vi.fn();
vi.mock('openai', () => {
  // Provide a constructor-callable default export so `new OpenAI({...})` in the
  // module-under-test resolves correctly under Vitest's ESM interop. A plain
  // `vi.fn().mockImplementation(...)` is NOT detected as a class constructor
  // by Node's `new` operator under all transpile pipelines.
  class MockOpenAI {
    chat = { completions: { create: (...args: unknown[]) => createMock(...args) } };
    constructor(_opts: unknown) {
      // no-op — args ignored, behavior is provided by `chat.completions.create` mock
    }
  }
  return { default: MockOpenAI };
});

vi.mock('../../config.js', () => ({
  env: { NVIDIA_NIM_API_KEY: 'test-nvapi', OPENROUTER_API_KEY: 'test-or' },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

const incrMock = vi.fn().mockResolvedValue(1);
const getMock = vi.fn().mockResolvedValue(0);
const expireMock = vi.fn().mockResolvedValue(1);
vi.mock('../../cache/redis.js', () => ({
  redis: { incr: incrMock, get: getMock, expire: expireMock },
}));

const isAvailableMock = vi.fn().mockReturnValue(true);
const recordMock = vi.fn();
vi.mock('../../lib/llmCircuitBreaker.js', () => ({
  isAvailable: (...args: unknown[]) => isAvailableMock(...args),
  record: (...args: unknown[]) => recordMock(...args),
}));

// Dynamic import after mocks are registered.
const { callLLM, stripReasoningBlocks, classifyError, __internal } =
  await import('../../lib/freeClaudeRouter.js');

beforeEach(() => {
  vi.clearAllMocks();
  isAvailableMock.mockReturnValue(true);
  getMock.mockResolvedValue(0);
  incrMock.mockResolvedValue(1);
  expireMock.mockResolvedValue(1);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Group 1 — Rolling-window rate limiter (R1-R3)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — rolling-window rate limiter', () => {
  it('R1: empty window — canRequest returns true', () => {
    const w = new __internal.RollingWindow(40, 60_000);
    expect(w.canRequest()).toBe(true);
  });

  it('R2: 40 consume calls fill the window — 41st returns false', () => {
    const w = new __internal.RollingWindow(40, 60_000);
    for (let i = 0; i < 40; i++) w.consume();
    expect(w.canRequest()).toBe(false);
  });

  it('R3: 60s after first consume — evict drops it and canRequest returns true again', () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const w = new __internal.RollingWindow(40, 60_000);
    for (let i = 0; i < 40; i++) w.consume();
    expect(w.canRequest()).toBe(false);
    vi.setSystemTime(t0 + 60_001);
    expect(w.canRequest()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — 429 backoff path (B1-B3)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — 429 backoff path', () => {
  it('B1: 429 triggers retry — succeeds on attempt 2', async () => {
    createMock
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const { content, routing } = await callLLM([{ role: 'user', content: 'hi' }], '{}');
    expect(content).toBe('{"ok":true}');
    expect(routing[0]?.provider).toBe('nvidia_nim');
  });

  it('B2: NIM exhausts RETRY_ATTEMPTS=3 of 429s — falls through to OpenRouter', async () => {
    // Phase 30 D-02 tune: RETRY_ATTEMPTS bumped 2→3, so NIM needs THREE
    // rejections (not two) to exhaust the per-provider retry budget before
    // the cascade falls through to OpenRouter. BACKOFF_MS = [2000, 8000,
    // 32000] means real-time waits would exceed the default 10s test
    // timeout; fake timers + advanceTimersByTimeAsync make the sleeps
    // instant while preserving the retry-loop's sequential awaits.
    vi.useFakeTimers();
    createMock
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const callPromise = callLLM([{ role: 'user', content: 'hi' }], '{}');
    // Advance through the two BACKOFF[0]=2000 + BACKOFF[1]=8000 sleeps that
    // separate the 3 NIM attempts (no sleep after the third — exhausted).
    await vi.advanceTimersByTimeAsync(2000 + 500); // JITTER_MS ±500
    await vi.advanceTimersByTimeAsync(8000 + 500);
    const { content, routing } = await callPromise;
    expect(content).toBe('{"ok":true}');
    expect(routing.length).toBeGreaterThanOrEqual(2);
    expect(routing[1]?.provider).toBe('openrouter');
    expect(String(routing[1]?.reason)).toContain('fall_through');
  });

  it('B3: all providers exhausted — returns null', async () => {
    // Phase 30 D-02 tune: RETRY_ATTEMPTS=3 + BACKOFF=[2000,8000,32000]
    // means the worst-case retry-exhaustion wall-clock is ~42s per provider
    // = ~84s for both providers. Use fake timers to keep the test inside
    // its 10s budget while still proving the cascade exits with null.
    vi.useFakeTimers();
    createMock.mockRejectedValue(new Error('429 rate limit'));
    const callPromise = callLLM([{ role: 'user', content: 'hi' }], '{}');
    // Drain the full retry budget across both providers (2 backoffs per
    // provider since attempt N has no trailing sleep on exhaustion).
    // BACKOFF[0]=2000, BACKOFF[1]=8000 per attempt-pair × 2 providers.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10_000); // covers 2000+8000+jitter
    }
    const { content, routing } = await callPromise;
    expect(content).toBeNull();
    expect(routing.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — <think>-block stripping (T1-T3)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — <think>-block stripping', () => {
  it('T1: strips <think>...</think> blocks', () => {
    expect(stripReasoningBlocks('<think>foo</think>{"a":1}')).toBe('{"a":1}');
  });

  it('T2: strips reasoning_content: prefix line', () => {
    expect(stripReasoningBlocks('reasoning_content: blah\n{"a":1}')).toBe('{"a":1}');
  });

  it('T3: tolerates unclosed <think> block — returns a string, no throw', () => {
    const out = stripReasoningBlocks('<think>foo{"a":1}');
    expect(typeof out).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Cap fall-through (F1-F2)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — cap fall-through', () => {
  it('F1: NVIDIA NIM circuit-broken — routes to OpenRouter', async () => {
    isAvailableMock.mockImplementation((p: string) => p !== 'nvidia_nim');
    createMock.mockResolvedValue({ choices: [{ message: { content: '{"x":2}' } }] });
    const { content, routing } = await callLLM([{ role: 'user', content: 'hi' }], '{}');
    expect(content).toBe('{"x":2}');
    expect(routing[0]?.provider).toBe('nvidia_nim');
    expect(String(routing[0]?.reason)).toContain('breaker');
    expect(routing[1]?.provider).toBe('openrouter');
  });

  it('F2: both providers unavailable — null content', async () => {
    isAvailableMock.mockReturnValue(false);
    const { content, routing } = await callLLM([{ role: 'user', content: 'hi' }], '{}');
    expect(content).toBeNull();
    expect(routing.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 5 — Error taxonomy classification (E1-E4)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — error taxonomy', () => {
  it('E1: 429 + rate limit -> rate_limit', () => {
    expect(classifyError(new Error('HTTP 429 rate limit exceeded'))).toBe('rate_limit');
  });

  it('E2: timeout -> timeout', () => {
    expect(classifyError(new Error('socket timeout after 30s'))).toBe('timeout');
  });

  it('E3: ENOTFOUND -> network', () => {
    expect(classifyError(new Error('getaddrinfo ENOTFOUND api.nvidia.com'))).toBe('network');
  });

  it('E4: 5xx -> upstream_500', () => {
    expect(classifyError(new Error('HTTP 502 bad gateway'))).toBe('upstream_500');
  });
});

// ---------------------------------------------------------------------------
// Group 6 — Phase 27.4.4 Plan 02: breaker accuracy + skipOpenRouter (P1-P3)
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — breaker semantics (per-call, not per-attempt)', () => {
  it('P1: 429-then-success-on-retry records only ok to the breaker (not err+ok)', async () => {
    // The pre-Plan-02 implementation called record(name, "err") inside the
    // catch block on EVERY failed attempt. A single retried-and-succeeded
    // call would push (err, ok) into the breaker window, polluting the
    // 30%-error-rate threshold. Plan 02 moves the err record outside the
    // retry loop so it fires once-per-call only when retries are exhausted.
    createMock
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const { content } = await callLLM([{ role: 'user', content: 'hi' }], '{}');
    expect(content).toBe('{"ok":true}');
    // record should be called exactly once (with 'ok'), NOT (err, ok).
    const calls = recordMock.mock.calls;
    const errCalls = calls.filter(([, outcome]) => outcome === 'err');
    const okCalls = calls.filter(([, outcome]) => outcome === 'ok');
    expect(errCalls.length).toBe(0);
    expect(okCalls.length).toBe(1);
  });

  it('P2: retries-exhausted records err exactly once (not per-attempt)', async () => {
    // When NIM 429s on every retry attempt, only ONE 'err' should land in
    // the breaker window for that call (not RETRY_ATTEMPTS errs).
    // Phase 30 D-02 tune: RETRY_ATTEMPTS=3 + BACKOFF=[2000,8000,32000]
    // means the test would block on ~84s of real-time sleep without fake
    // timers. Drain through the backoffs to assert the err-record count.
    vi.useFakeTimers();
    createMock.mockRejectedValue(new Error('429 rate limit'));
    const callPromise = callLLM([{ role: 'user', content: 'hi' }], '{}');
    // 2 backoffs per provider × 2 providers = 4 sleeps (max 8s+jitter each).
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await callPromise;
    // First provider attempted then exhausted -> one 'err' for nvidia_nim.
    // Second provider also exhausted -> one more 'err' for openrouter.
    const errCalls = recordMock.mock.calls.filter(([, outcome]) => outcome === 'err');
    // Exactly 2 'err' records total — one per provider, NOT one per attempt.
    expect(errCalls.length).toBe(2);
    expect(errCalls[0]?.[0]).toBe('nvidia_nim');
    expect(errCalls[1]?.[0]).toBe('openrouter');
  });
});

describe('freeClaudeRouter — skipOpenRouter option', () => {
  it('P3: skipOpenRouter=true excludes OR from cascade even on full NIM failure', async () => {
    // With skipOpenRouter set, the v3 extractor opts out of the OR fallback.
    // OR is unusable on free tier (~16/16 rate_limit observed in dev runs).
    // When NIM fails, the call returns null content — no OR attempt fires.
    // Phase 30 D-02 tune: RETRY_ATTEMPTS=3 means NIM-only path waits
    // BACKOFF[0]=2000 + BACKOFF[1]=8000 = 10s+jitter before exhausting,
    // which would tip the test over the 10s timeout. Use fake timers.
    vi.useFakeTimers();
    createMock.mockRejectedValue(new Error('429 rate limit'));
    const callPromise = callLLM([{ role: 'user', content: 'hi' }], '{}', {
      skipOpenRouter: true,
    });
    await vi.advanceTimersByTimeAsync(2000 + 500);
    await vi.advanceTimersByTimeAsync(8000 + 500);
    const { content, routing } = await callPromise;
    expect(content).toBeNull();
    // Routing trace contains only NIM entries (no openrouter).
    const orEntries = routing.filter((r) => r.provider === 'openrouter');
    expect(orEntries.length).toBe(0);
    expect(routing.some((r) => r.provider === 'nvidia_nim')).toBe(true);
  });
});
