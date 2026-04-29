/**
 * Phase 27.4.4 Plan 02 — minimal pLimit-equivalent concurrency limiter.
 *
 * Caps simultaneous in-flight async tasks at `maxConcurrent`. Returns a
 * function that wraps a Promise-returning thunk; calling the wrapper
 * either runs the thunk immediately (if there's capacity) or queues it
 * until an in-flight task completes. The wrapper resolves with the
 * thunk's value (or rejects with its error).
 *
 * Why we don't use the npm `p-limit` package:
 *   - This is a 30-LOC primitive with a stable interface.
 *   - Adding a dependency for it touches package.json + lockfile and
 *     forces a re-audit; the existing dependency footprint is small
 *     and we'd rather keep it that way.
 *   - The behavior we need (FIFO queue, no abort, no priority) is
 *     trivial to implement correctly.
 *
 * Used in the v3 extractor's batch loop: each batch's LLM call is
 * routed through `limit(() => callLLM(...))`, capping concurrent
 * requests at LLM_V3_CONCURRENCY (default 12). Drives wall-clock from
 * ~95 min → ~10 min for a 197-batch run while staying well under the
 * 40-req/min NIM ceiling.
 *
 * Concurrency safety:
 *   - JavaScript event loop is single-threaded; the inFlight counter and
 *     queue array reads/writes are atomic between awaits.
 *   - The `next()` function is only called inside resolvers, so there's
 *     no double-decrement of inFlight.
 *   - FIFO ordering is preserved: tasks resolve in submission order via
 *     queue.shift(), but their fn() can complete in any order.
 */

export type LimitWrapper = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimit(maxConcurrent: number): LimitWrapper {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(`createLimit: maxConcurrent must be a positive integer, got ${maxConcurrent}`);
  }

  let inFlight = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (inFlight >= maxConcurrent) return;
    const runner = queue.shift();
    if (!runner) return;
    inFlight++;
    runner();
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const runner = (): void => {
        // Defensive: an empty queue + empty maxConcurrent would short-circuit
        // here. fn() may throw synchronously OR return a rejected promise; we
        // catch both via Promise.resolve().then(...).
        Promise.resolve()
          .then(fn)
          .then(
            (value) => {
              inFlight--;
              resolve(value);
              next();
            },
            (err) => {
              inFlight--;
              reject(err);
              next();
            },
          );
      };
      queue.push(runner);
      next();
    });
  };
}
