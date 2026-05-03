/**
 * Phase 27.3.1 Plan 12 G6 — shared API connection-status helpers.
 *
 * Extracted from src/components/ui/DevApiStatus.tsx so Topbar's
 * DevApiStatusTrigger (dev-only, tree-shakeable) can reuse effectiveStatus
 * without importing a UI component (which would trip the
 * react-refresh/only-export-components rule).
 *
 * Pure functions; no React imports.
 */

/** Stuck threshold: no update in 2 minutes while still 'loading' */
const STUCK_THRESHOLD_MS = 120_000;

/**
 * Normalise raw connection status + count + lastFetch into an "effective"
 * display status:
 *   - 'stuck': loading, lastFetch exists, but older than STUCK_THRESHOLD_MS
 *   - 'init':  loading, no lastFetch yet
 *   - 'empty': connected but count === 0
 *   - otherwise: pass-through
 */
export function effectiveStatus(status: string, count: number, lastFetch: number | null): string {
  if (status === 'loading' && lastFetch && Date.now() - lastFetch > STUCK_THRESHOLD_MS)
    return 'stuck';
  if (status === 'loading' && !lastFetch) return 'init';
  if (status === 'connected' && count === 0) return 'empty';
  return status;
}
