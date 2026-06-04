// @vitest-environment node
//
// Phase 30 D-01 — retryAfterMs capture on NIM 429 catch path.
//
// Path A (header present): NIM honors Retry-After on 429 — analyzer reads
// retryAfterMs directly. Path B (header absent): NIM omits Retry-After —
// analyzer infers recovery from timestamp gaps. Both paths must be supported
// because NIM's 429 header surface is undocumented (RESEARCH Pitfall 2).
//
// Per the RESEARCH §"`retryAfterMs` capture (D-01)" insertion site:
// freeClaudeRouter.ts catch block (~lines 448-477) populates retryAfterMs
// from `(err as { headers?: Record<string,string> }).headers['retry-after']
// ?? headers['Retry-After']` with a parseFloat NaN guard. Field lives on
// the new callHistory row pushed via updateProgress.
//
// Test preamble + hoisted mocks copied verbatim from freeClaudeRouter.test.ts
// (the analog test). Only the test assertions differ — same mockOpenAI class
// pattern, same vi.mock targets, same dynamic import after mocks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before importing the module-under-test
// ---------------------------------------------------------------------------

const createMock = vi.fn();
vi.mock('openai', () => {
  // Constructor-callable default export per freeClaudeRouter.test.ts lines 9-21.
  // Plain `vi.fn().mockImplementation(...)` does NOT work with `new OpenAI(...)`
  // under Vitest ESM interop.
  class MockOpenAI {
    chat = { completions: { create: (...args: unknown[]) => createMock(...args) } };
    constructor(_opts: unknown) {
      // no-op
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
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));

const isAvailableMock = vi.fn().mockReturnValue(true);
const recordMock = vi.fn();
vi.mock('../../lib/llmCircuitBreaker.js', () => ({
  isAvailable: (...args: unknown[]) => isAvailableMock(...args),
  record: (...args: unknown[]) => recordMock(...args),
}));

// Dynamic import after mocks are registered. Importing llmProgress here so
// we can inspect callHistory directly — the singleton is the same module
// instance the router writes through.
const { callLLM } = await import('../../lib/freeClaudeRouter.js');
const { llmProgress } = await import('../../lib/llmProgress.js');

// ---------------------------------------------------------------------------
// MockAPIError — simulates the OpenAI SDK's APIError shape sufficient for the
// router's `err instanceof Error && 'headers' in err` check. Real OpenAI SDK
// exposes `headers: Record<string, string>` on APIError; we mirror that shape.
// ---------------------------------------------------------------------------

class MockAPIError extends Error {
  headers: Record<string, string>;
  constructor(message: string, headers: Record<string, string>) {
    super(message);
    this.name = 'APIError';
    this.headers = headers;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  isAvailableMock.mockReturnValue(true);
  getMock.mockResolvedValue(0);
  incrMock.mockResolvedValue(1);
  expireMock.mockResolvedValue(1);
  // Clear callHistory between tests so each assertion targets only the row
  // written by THIS test's catch-block fire.
  llmProgress.callHistory = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Path A (D-01) — Retry-After header present
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — retryAfterMs Path A (header present)', () => {
  it('A1: 429 with `retry-after: 1.5` populates retryAfterMs = 1500 (parseFloat × 1000)', async () => {
    // First attempt: 429 with lower-case header. Second attempt: success so the
    // call doesn't fall through to OpenRouter (keeps assertion focused).
    createMock
      .mockRejectedValueOnce(new MockAPIError('429 rate limit', { 'retry-after': '1.5' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    // Phase 39 OBS-FLIGHT-05: the success path now ALSO prepends a callHistory
    // row, so the 429 failure row is no longer guaranteed to sit at index 0.
    // Target the failure row by predicate (the only `ok:false` row this test
    // produces) so the retryAfterMs assertion stays focused on the 429 catch.
    const row = llmProgress.callHistory?.find((r) => !r.ok);
    expect(row).toBeDefined();
    expect(row?.retryAfterMs).toBe(1500);
    expect(row?.ok).toBe(false);
    expect(row?.provider).toBe('nvidia_nim');
  });

  it('A2: 429 with capital-case `Retry-After: 2` populates retryAfterMs = 2000 (case-insensitive)', async () => {
    createMock
      .mockRejectedValueOnce(new MockAPIError('429 rate limit', { 'Retry-After': '2' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    const row = llmProgress.callHistory?.find((r) => !r.ok);
    expect(row?.retryAfterMs).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Path B (D-01) — Retry-After header absent or malformed
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — retryAfterMs Path B (header absent / malformed)', () => {
  it('B1: 429 with empty headers populates retryAfterMs = null (analyzer infers from gaps)', async () => {
    createMock
      .mockRejectedValueOnce(new MockAPIError('429 rate limit', {}))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    const row = llmProgress.callHistory?.find((r) => !r.ok);
    expect(row).toBeDefined();
    expect(row?.retryAfterMs).toBeNull();
  });

  it('B2: 429 with malformed `retry-after: not-a-number` populates retryAfterMs = null (parseFloat NaN guard)', async () => {
    createMock
      .mockRejectedValueOnce(new MockAPIError('429 rate limit', { 'retry-after': 'not-a-number' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    const row = llmProgress.callHistory?.find((r) => !r.ok);
    expect(row?.retryAfterMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Non-rate-limit path — retryAfterMs only populated when bucket === 'rate_limit'
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — retryAfterMs non-rate-limit path', () => {
  it('N1: non-429 network error produces retryAfterMs = null (only populated on rate_limit bucket)', async () => {
    // ENOTFOUND is classified as bucket='network' by classifyError — the
    // retryAfterMs branch should NOT fire for non-rate-limit errors even if
    // the error happens to carry a headers field. Use a vanilla Error here so
    // even the `'headers' in err` guard is irrelevant — the bucket gate fails
    // first.
    createMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.nvidia.com'));
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    // First row is the most recently prepended — NIM's network failure.
    const row = llmProgress.callHistory?.[0];
    expect(row).toBeDefined();
    // retryAfterMs is null for non-rate-limit errors.
    expect(row?.retryAfterMs).toBeNull();
    // Sanity: this row reflects a failed call.
    expect(row?.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Breaker idempotency regression guard (RESEARCH gotcha 2) — retryAfterMs
// capture must NOT introduce a duplicate `record(name, 'err')` call.
// ---------------------------------------------------------------------------

describe('freeClaudeRouter — retryAfterMs does not pollute breaker window', () => {
  it('G1: 429-then-success-on-retry still records exactly one breaker outcome (ok only)', async () => {
    // Mirrors P1 from freeClaudeRouter.test.ts:194-211 — Phase 27.4.4 Plan 02
    // moved record('err') out of the per-attempt catch block so a single
    // retried-and-succeeded call doesn't pollute the breaker window. D-01's
    // retryAfterMs capture must NOT regress this invariant.
    createMock
      .mockRejectedValueOnce(new MockAPIError('429 rate limit', { 'retry-after': '1' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    await callLLM([{ role: 'user', content: 'hi' }], '{}');
    const errCalls = recordMock.mock.calls.filter(([, outcome]) => outcome === 'err');
    const okCalls = recordMock.mock.calls.filter(([, outcome]) => outcome === 'ok');
    expect(errCalls.length).toBe(0);
    expect(okCalls.length).toBe(1);
  });
});
