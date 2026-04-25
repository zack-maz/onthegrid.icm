// ---------------------------------------------------------------------------
// Phase 27.4.1 — Per-batch timeout watchdog for LLM extractor batches.
//
// Wraps a per-batch Promise with:
//   * Soft-warn threshold  (D-02, default 60s) — log only, non-terminating.
//   * Hard-timeout          (D-01, default 90s) — `Promise.race` rejection.
//   * Late-resolve guard    (D-05) — a `timedOut` closure flag prevents the
//     late-arriving batch promise from invoking onTimeout a second time or
//     propagating side-effects to the caller once the race has been lost.
//
// Caller composes `onTimeout` (typically DLQ enqueue + progress telemetry
// increment) so this module remains free of redis + progress imports — it is
// a pure timing primitive that both v1 and v2 extractors (Wave 2) will wrap
// their `callLLM()` invocations with.
//
// Design mirrors `server/cache/redis.ts::withTimeout` (the canonical Promise.race
// + setTimeout pattern already in use for Redis ops) but adds soft-warn, a
// typed options bag, and a null-return-on-timeout contract.
// ---------------------------------------------------------------------------

import { logger } from './logger.js';

const log = logger.child({ module: 'llm-watchdog' });

/**
 * Options for `withBatchWatchdog`.
 *
 * `onTimeout` is invoked ONCE on hard-timeout. The caller composes whatever
 * side-effects should happen (DLQ enqueue, progress counter bump, structured
 * log entry). The watchdog itself does not touch Redis or progress state.
 *
 * `onSoftWarn` is optional and invoked AT MOST ONCE when the batch crosses
 * the soft-warn threshold AND is still running. If the batch completes before
 * softWarnMs elapses, `onSoftWarn` is never called.
 */
export interface BatchWatchdogOptions {
  /** Hard kill threshold in ms — D-01 default 90_000. */
  timeoutMs: number;
  /** Soft-warn threshold in ms — D-02 default 60_000. Must be < timeoutMs. */
  softWarnMs: number;
  /** Zero-based batch index, for error messages and log correlation. */
  batchIndex: number;
  /** Pipeline label (e.g. 'v1' | 'v2') — appears in the timeout error msg. */
  label: string;
  /**
   * Invoked once on hard-timeout. Typical composition:
   *   `async () => { await enqueueDLQ({reason:'timeout_watchdog',...});
   *                  updateProgress({ watchdogTimeoutCount: n+1 }); }`
   * Rejections thrown here are logged and swallowed — the watchdog still
   * returns `null` to the caller.
   */
  onTimeout: () => Promise<void>;
  /**
   * Invoked once when the soft-warn threshold elapses mid-flight. Receives
   * the elapsed ms at the moment of firing (equal to softWarnMs). Optional.
   */
  onSoftWarn?: (elapsedMs: number) => void;
}

/**
 * Wrap a batch promise with timeout + soft-warn + late-resolve guard.
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

  const softWarnTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    if (!timedOut) {
      try {
        opts.onSoftWarn?.(opts.softWarnMs);
        log.info(
          { batchIndex: opts.batchIndex, label: opts.label, softWarnMs: opts.softWarnMs },
          'batch crossed soft-warn threshold (still running)',
        );
      } catch (err) {
        log.warn({ err }, 'onSoftWarn handler threw — suppressed');
      }
    }
  }, opts.softWarnMs);

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
    if (softWarnTimer) clearTimeout(softWarnTimer);
    if (hardTimer) clearTimeout(hardTimer);
  }
}
