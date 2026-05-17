// ---------------------------------------------------------------------------
// Phase 27.4.1 — Per-batch timeout watchdog for LLM extractor batches.
// Phase 30 D-05 / SIMPLIFY-03 — single-tier hard-kill watchdog. The 60s
// soft-warn tier was retired here because Run 1 measured 0 watchdog timeouts
// at p95 batch latency 33s vs. the prior 60s threshold; the historical
// Cerebras-running-slow signal it carried is gone with Cerebras (Phase 29
// D-01); and soft-warn data is now derivable post-run from the analyzer's
// latency histogram (Phase 30 Plan 01 D-01).
//
// Wraps a per-batch Promise with:
//   * Hard-timeout          (D-01, default 90s) — `Promise.race` rejection.
//   * Late-resolve guard    (D-05) — a `timedOut` closure flag prevents the
//     late-arriving batch promise from invoking onTimeout a second time or
//     propagating side-effects to the caller once the race has been lost.
//
// Caller composes `onTimeout` (typically DLQ enqueue + progress telemetry
// increment) so this module remains free of redis + progress imports — it is
// a pure timing primitive that the v3 extractor wraps its `callLLM()`
// invocations with.
//
// Design mirrors `server/cache/redis.ts::withTimeout` (the canonical Promise.race
// + setTimeout pattern already in use for Redis ops) but adds a typed options
// bag and a null-return-on-timeout contract.
// ---------------------------------------------------------------------------

import { logger } from './logger.js';

const log = logger.child({ module: 'llm-watchdog' });

/**
 * Options for `withBatchWatchdog`.
 *
 * `onTimeout` is invoked ONCE on hard-timeout. The caller composes whatever
 * side-effects should happen (DLQ enqueue, progress counter bump, structured
 * log entry). The watchdog itself does not touch Redis or progress state.
 */
export interface BatchWatchdogOptions {
  /** Hard kill threshold in ms — D-01 default 90_000. */
  timeoutMs: number;
  /** Zero-based batch index, for error messages and log correlation. */
  batchIndex: number;
  /** Pipeline label (e.g. 'v3') — appears in the timeout error msg. */
  label: string;
  /**
   * Invoked once on hard-timeout. Typical composition:
   *   `async () => { await enqueueDLQ({reason:'timeout_watchdog',...});
   *                  updateProgress({ watchdogTimeoutCount: n+1 }); }`
   * Rejections thrown here are logged and swallowed — the watchdog still
   * returns `null` to the caller.
   */
  onTimeout: () => Promise<void>;
}

/**
 * Wrap a batch promise with a hard-timeout + late-resolve guard.
 *
 * Contract:
 *   - Returns T when batchFn resolves before timeoutMs.
 *   - Returns null when batchFn is killed by the hard-timeout (onTimeout
 *     has been awaited by the time this returns).
 *   - Rethrows when batchFn rejects before the hard-timeout (behaviorally
 *     identical to calling batchFn() directly — the caller's try/catch sees
 *     the same error path as pre-watchdog code).
 *   - A batch promise that resolves or rejects AFTER the timeout fires is
 *     silently discarded — onTimeout is NOT invoked again and no return
 *     value clobbers the null the caller has already received (D-05).
 */
export async function withBatchWatchdog<T>(
  batchFn: () => Promise<T>,
  opts: BatchWatchdogOptions,
): Promise<T | null> {
  let timedOut = false;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;

  const workPromise = batchFn();

  // Late-resolve guard: once timedOut flips true, these handlers are no-ops.
  // The trailing `.catch(() => {})` prevents Node from treating a late
  // rejection as an unhandled promise rejection after the race is over.
  workPromise.catch(() => {});

  const timeoutPromise = new Promise<never>((_, reject) => {
    hardTimer = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(`batch ${opts.batchIndex} (${opts.label}) timed out after ${opts.timeoutMs}ms`),
      );
    }, opts.timeoutMs);
  });

  try {
    const result = await Promise.race([workPromise, timeoutPromise]);
    // Work resolved first — return its value. Clean up timers in finally.
    return result;
  } catch (err) {
    if (timedOut) {
      // Hard-timeout path: invoke caller's onTimeout hook then return null.
      log.warn(
        { batchIndex: opts.batchIndex, label: opts.label, timeoutMs: opts.timeoutMs },
        'batch hard-timeout triggered',
      );
      try {
        await opts.onTimeout();
      } catch (hookErr) {
        log.error(
          { err: hookErr, batchIndex: opts.batchIndex, label: opts.label },
          'onTimeout hook threw — suppressed, returning null',
        );
      }
      return null;
    }
    // Work rejected before timeout — propagate the original error.
    throw err;
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
}
