import { useEffect, useRef } from 'react';

import { dashboardAuthHeaders } from '@/lib/dashboardAuth';
import { useWaterStore } from '@/stores/waterStore';
import type { PrecipitationData } from '@/stores/waterStore';

// Phase 28.1 W5 D-12 — env-tunable water-precip polling cadence. Default
// preserves pre-W5 behavior (6h poll, matches Open-Meteo precip refresh).
export const WATER_PRECIP_POLL_INTERVAL = Number(
  import.meta.env.VITE_POLL_WATER_PRECIP_MS ?? 21_600_000,
);

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
  const recordPrecipFetch = useWaterStore((s) => s.recordPrecipFetch);
  const setPrecipNextPollAt = useWaterStore((s) => s.setPrecipNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchPrecip = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();

      try {
        const res = await fetch('/api/water/precip', { headers: dashboardAuthHeaders() });
        if (cancelled) return;
        if (!res.ok) {
          // Silently swallow error — stale precipitation data is acceptable
          recordPrecipFetch(false, Date.now() - start);
          return;
        }
        const data: PrecipResponse = await res.json();
        updatePrecipitation(data.data);
        recordPrecipFetch(true, Date.now() - start, data.data.length);
      } catch {
        // Silently swallow — stale precipitation data is acceptable; do not clear facilities.
        // Record failure for observability but do NOT call setError (preserving silent swallow design).
        recordPrecipFetch(false, Date.now() - start);
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      const nextTs = Date.now() + WATER_PRECIP_POLL_INTERVAL;
      setPrecipNextPollAt(nextTs);
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
        setPrecipNextPollAt(null);
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
      setPrecipNextPollAt(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updatePrecipitation, recordPrecipFetch, setPrecipNextPollAt]);
}
