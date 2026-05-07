/**
 * Phase 28.2.6 Plan 02 — Vercel waitUntil shim with local-dev fallback.
 *
 * On Vercel Fluid Compute, the function instance is killed at res.end()
 * unless a promise has been registered with waitUntil(). The bare
 * `void (async () => {...})()` IIFE pattern (used pre-28.2.6) silently
 * loses the work because the runtime stops the event loop after the
 * response finishes.
 *
 * Outside Vercel — Express dev or Vitest — `@vercel/functions`' waitUntil
 * is `getContext().waitUntil?.(promise)`. getContext() returns {} when
 * the Vercel request-context global is absent; the optional-chain
 * short-circuits to undefined; the promise IS NEVER RUN.
 *
 * This shim:
 *   1. Detects Vercel runtime via globalThis[Symbol.for('@vercel/request-context')]
 *      (the same probe @vercel/functions' own getContext uses).
 *   2. On Vercel: delegates to waitUntil() with try/catch so internal
 *      errors don't crash the cron route.
 *   3. Off Vercel: falls back to `promise.catch(err => log.warn(...))` so
 *      the work runs, late rejections are logged (not unhandled), and
 *      the dev workflow stays identical to pre-Plan-02 behavior.
 *
 * Why we don't import @vercel/functions' own waitUntil directly:
 *   - That call silently no-ops in Express dev (Pitfall 1 from RESEARCH).
 *   - Wrapping it gives us a single integration point for both runtimes
 *     so callers don't need a Vercel-vs-local code branch.
 *
 * Why we use Symbol.for('@vercel/request-context') instead of the build-time
 * VERCEL env var:
 *   - The VERCEL env var is set at build time, not request time, so it can
 *     bleed into test environments and lie to us at runtime.
 *   - The Symbol-keyed global is the runtime context signal Vercel itself
 *     uses internally (verified at packages/functions/src/get-context.ts).
 *   - Pitfall 5 from RESEARCH documents the failure mode.
 *
 * Returns void (not Promise<void>) so callers cannot accidentally `await`
 * it — D-12 hard block. `await`ing the IIFE was the failure mode in
 * commit b016a5c (reverted in b4bf4a3).
 */

import { waitUntil } from '@vercel/functions';

import { logger } from './logger.js';

const log = logger.child({ module: 'safeWaitUntil' });

/**
 * The same Symbol.for() Vercel uses internally to key the request-context
 * global. Stable across @vercel/functions ^3.x lifecycle.
 */
const VERCEL_CTX = Symbol.for('@vercel/request-context');

/**
 * Run a promise as background work. On Vercel: keeps the function instance
 * alive past res.end() until the promise resolves OR the function hits its
 * maxDuration ceiling. Off Vercel: the work runs to completion in the
 * normal Node event loop; rejected promises are caught and logged.
 *
 * @param promise — fire-and-forget work that should run to completion.
 * @returns void — never await this. D-12 hard block.
 */
export function safeWaitUntil(promise: Promise<unknown>): void {
  const hasVercelContext =
    typeof (globalThis as Record<symbol, unknown>)[VERCEL_CTX] !== 'undefined';

  if (hasVercelContext) {
    try {
      waitUntil(promise);
    } catch (vercelErr) {
      // Defensive: if @vercel/functions' waitUntil throws (e.g., TypeError
      // on non-Promise input), don't propagate to the cron route. Fall
      // back to the local-dev catch path so the work still runs and the
      // error is logged.
      log.warn(
        { err: vercelErr },
        'waitUntil threw on Vercel runtime; falling back to local catch',
      );
      promise.catch((err) => {
        log.warn({ err }, 'safeWaitUntil-fallback IIFE rejected (after Vercel-path throw)');
      });
    }
  } else {
    // Local Express dev / Vitest. The runtime won't kill the function at
    // res.end(), so a bare unawaited promise runs to completion. catch()
    // swallows so a failure here doesn't escape as an unhandled rejection.
    promise.catch((err) => {
      log.warn({ err }, 'safeWaitUntil-fallback IIFE rejected (local dev)');
    });
  }
}
