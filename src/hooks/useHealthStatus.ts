import { useEffect, useRef, useState } from 'react';
import type { HealthResponse } from '@/lib/healthClient';

/**
 * Phase 28.1 W2 — 60s tab-visibility-aware poller for `/api/health`.
 *
 * **Single-call invariant:** This hook MUST be invoked exactly once across
 * the entire app, inside `HealthStatusProvider`. Both `HealthBanner` and
 * the `DevApiStatus` "All APIs" tab consume the value via
 * `useHealthStatusContext()` to share one poll cadence — calling the hook
 * directly in those components would double the `/api/health` poll rate.
 *
 * Pattern matches `useNewsPolling.ts` (recursive setTimeout +
 * visibilitychange listener; CLAUDE.md "Flight Data Patterns").
 *
 * On poll error: keeps the last successful `health` (don't blank the UI),
 * exposes `error` so the All APIs tab can render a "Last poll failed at
 * {time}. Showing cached values." banner-strip per UI-SPEC §State
 * Visualization.
 */

export const HEALTH_POLL_INTERVAL = 60_000; // 60s — UI-SPEC §useHealthStatus default

export interface UseHealthStatusValue {
  health: HealthResponse | null;
  loading: boolean;
  error: Error | null;
  /** Unix ms of the last successful poll; null until first success. */
  lastSuccessAt: number | null;
}

export function useHealthStatus(intervalMs: number = HEALTH_POLL_INTERVAL): UseHealthStatusValue {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/health');
        if (cancelled) return;
        if (!res.ok) {
          setError(new Error(`/api/health responded ${res.status}`));
          setLoading(false);
          return;
        }
        const data = (await res.json()) as HealthResponse;
        if (cancelled) return;
        setHealth(data);
        setError(null);
        setLastSuccessAt(Date.now());
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setLoading(false);
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      timeoutRef.current = setTimeout(async () => {
        await fetchHealth();
        schedulePoll();
      }, intervalMs);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // Tab becomes visible — fire an immediate fetch then resume polling.
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        void fetchHealth().then(schedulePoll);
      }
    };

    void fetchHealth().then(schedulePoll);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // intentionally empty deps — interval is module-load constant; the
    // recursive scheduler closes over `intervalMs` from the outer scope at
    // mount time. Changing intervalMs at runtime is not a supported case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { health, loading, error, lastSuccessAt };
}
