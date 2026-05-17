// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger so the watchdog's log calls don't produce pino output
// during tests (and so we don't need a real pino transport).
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { withBatchWatchdog } from '../../lib/llmExtractorWatchdog.js';

describe('withBatchWatchdog (Phase 27.4.1 D-01/D-05; Phase 30 D-05 soft-warn retired)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('success path: returns T and never invokes onTimeout', async () => {
    const onTimeout = vi.fn().mockResolvedValue(undefined);

    const batchFn = vi.fn<() => Promise<string>>(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('ok'), 10);
        }),
    );

    const pending = withBatchWatchdog(batchFn, {
      timeoutMs: 100,
      batchIndex: 0,
      label: 'v3',
      onTimeout,
    });

    // Advance just enough for the work promise to resolve.
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;

    expect(result).toBe('ok');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('hard-timeout path: returns null, invokes onTimeout exactly once, and late resolution does NOT invoke onTimeout again (D-05)', async () => {
    const onTimeout = vi.fn().mockResolvedValue(undefined);

    // This batch never resolves on its own — only the timeout will fire.
    // We capture the resolver so we can fire it AFTER the timeout and
    // prove the late-resolve path does not re-invoke onTimeout (D-05).
    let lateResolver: ((v: string) => void) | undefined;
    const batchFn = vi.fn<() => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          lateResolver = resolve;
        }),
    );

    const pending = withBatchWatchdog(batchFn, {
      timeoutMs: 50,
      batchIndex: 7,
      label: 'v3',
      onTimeout,
    });

    // Advance past the hard-timeout.
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;

    expect(result).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Now resolve the batch promise late — onTimeout must NOT fire again.
    lateResolver?.('late-ignored');
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('late-resolve clobber-prevention: after hard-timeout, batch resolving later does not flip onTimeout invocation count', async () => {
    const onTimeout = vi.fn().mockResolvedValue(undefined);

    let lateResolver: ((v: string) => void) | undefined;
    const batchFn = vi.fn<() => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          lateResolver = resolve;
        }),
    );

    const pending = withBatchWatchdog(batchFn, {
      timeoutMs: 30,
      batchIndex: 1,
      label: 'v3',
      onTimeout,
    });

    // Fire hard-timeout.
    await vi.advanceTimersByTimeAsync(30);
    const result = await pending;
    expect(result).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Resolve the underlying batch promise AFTER the race is over. The
    // watchdog's late-resolve guard (trailing .catch + timedOut flag) must
    // absorb this silently. No new onTimeout invocation, no thrown error.
    lateResolver?.('this-should-be-ignored');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
