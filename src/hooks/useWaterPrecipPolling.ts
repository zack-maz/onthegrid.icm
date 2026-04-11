import { useEffect, useRef } from 'react';
import { useWaterStore } from '@/stores/waterStore';
import type { PrecipitationData } from '@/stores/waterStore';

export const WATER_PRECIP_POLL_INTERVAL = 21_600_000; // 6 hours

interface PrecipResponse {
  data: PrecipitationData[];
  stale: boolean;
  lastFresh: number;
}

/**
 * Polls /api/water/precip every 6 hours with tab visibility awareness.
 * Uses recursive setTimeout (not setInterval) to avoid overlapping async fetches.
 */
export function useWaterPrecipPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatePrecipitation = useWaterStore((s) => s.updatePrecipitation);
  const recordFetch = useWaterStore((s) => s.recordFetch);
  const setNextPollAt = useWaterStore((s) => s.setNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchPrecip = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();

      try {
        const res = await fetch('/api/water/precip');
        if (cancelled) return;
        if (!res.ok) {
          // Silently swallow error — stale precipitation data is acceptable
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: PrecipResponse = await res.json();
        updatePrecipitation(data.data);
        recordFetch(true, Date.now() - start);
      } catch {
        // Silently swallow — stale precipitation data is acceptable; do not clear facilities.
        // Record failure for observability but do NOT call setError (preserving silent swallow design).
        recordFetch(false, Date.now() - start);
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      const nextTs = Date.now() + WATER_PRECIP_POLL_INTERVAL;
      setNextPollAt(nextTs);
      timeoutRef.current = setTimeout(async () => {
        await fetchPrecip();
        schedulePoll();
      }, WATER_PRECIP_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setNextPollAt(null);
      } else {
        fetchPrecip().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    fetchPrecip().then(schedulePoll);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setNextPollAt(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updatePrecipitation, recordFetch, setNextPollAt]);
}
