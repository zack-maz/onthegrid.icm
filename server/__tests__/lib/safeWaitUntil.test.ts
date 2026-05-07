// @vitest-environment node
/**
 * Phase 28.2.6 Plan 02 Task 1 — RED test for the safeWaitUntil shim.
 *
 * Locks the contract documented in CONTEXT D-09 / D-10 / D-12 and
 * RESEARCH §Pattern 1 + §Pitfall 5:
 *   1. On Vercel runtime (Symbol.for('@vercel/request-context') present in
 *      globalThis), the shim delegates to @vercel/functions' waitUntil.
 *   2. On non-Vercel runtimes (Express dev / Vitest), the shim falls back
 *      to `promise.catch(err => log.warn(...))` so the work runs AND late
 *      rejections never escape as unhandled rejections.
 *   3. The shim NEVER throws — neither on rejected promises in either path
 *      nor when @vercel/functions' waitUntil itself throws (e.g., TypeError
 *      on non-Promise input — see vercel/vercel
 *      packages/functions/src/wait-until.ts:5-7).
 *   4. The function returns `void` (not `Promise<void>`) — D-12 type-system
 *      enforcement that prevents callers from accidentally awaiting it.
 *
 * The test file MUST currently fail to import because
 * server/lib/safeWaitUntil.ts does not yet exist. Running vitest must
 * either fail to resolve the import OR all 5 tests fail. This is Wave 0's
 * gate — confirms the test exists before Task 2's implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — registered BEFORE import() of the module under test.
// ---------------------------------------------------------------------------

const { mockWaitUntil } = vi.hoisted(() => ({ mockWaitUntil: vi.fn() }));
vi.mock('@vercel/functions', () => ({ waitUntil: mockWaitUntil }));

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: mockWarn, error: vi.fn(), debug: vi.fn() }),
  },
}));

// Import AFTER mocks are set up so the SUT picks up the mocked logger + waitUntil.
import { safeWaitUntil } from '../../lib/safeWaitUntil.js';

const VERCEL_CTX = Symbol.for('@vercel/request-context');

describe('safeWaitUntil', () => {
  beforeEach(() => {
    mockWaitUntil.mockReset();
    mockWarn.mockReset();
    delete (globalThis as Record<symbol, unknown>)[VERCEL_CTX];
  });

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[VERCEL_CTX];
  });

  it('invokes waitUntil when Vercel context is present', () => {
    (globalThis as Record<symbol, unknown>)[VERCEL_CTX] = {
      get: () => ({ waitUntil: mockWaitUntil }),
    };
    const p = Promise.resolve('done');
    safeWaitUntil(p);
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    expect(mockWaitUntil).toHaveBeenCalledWith(p);
  });

  it('falls back to promise.catch when Vercel context is absent', async () => {
    const err = new Error('local-dev rejection');
    const p = Promise.reject(err);
    safeWaitUntil(p);
    // Wait for the catch handler to run (clearer intent than setImmediate).
    await vi.waitFor(() => expect(mockWarn.mock.calls.length).toBeGreaterThan(0), {
      timeout: 100,
    });
    expect(mockWaitUntil).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const callArgs = mockWarn.mock.calls[0];
    expect(callArgs![0]).toMatchObject({ err });
  });

  it('does not throw on local-dev path even when promise rejects', async () => {
    const p = Promise.reject(new Error('boom'));
    // Synchronous throw guard
    expect(() => safeWaitUntil(p)).not.toThrow();
    // Drain enough microtasks for the .catch handler to run; vitest fails the
    // test if an unhandled rejection escapes.
    await vi.waitFor(() => true, { timeout: 50 });
    // No unhandled rejection should escape (Vitest would fail the test if one did).
  });

  it('does not throw on Vercel path even when waitUntil itself throws', () => {
    (globalThis as Record<symbol, unknown>)[VERCEL_CTX] = {
      get: () => ({ waitUntil: mockWaitUntil }),
    };
    mockWaitUntil.mockImplementation(() => {
      throw new TypeError('vercel internal error');
    });
    const p = Promise.resolve();
    expect(() => safeWaitUntil(p)).not.toThrow();
  });

  it('returns void (not a promise)', () => {
    const result = safeWaitUntil(Promise.resolve());
    expect(result).toBeUndefined();
  });
});
