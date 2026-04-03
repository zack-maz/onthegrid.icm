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

  useEffect(() => {
    let cancelled = false;

    const fetchPrecip = async (): Promise<void> => {
      if (cancelled) return;

      try {
        const res = await fetch('/api/water/precip');
        if (cancelled) return;
        if (!res.ok) throw new Error(`Water precip API ${res.status}`);
        const data: PrecipResponse = await res.json();
        updatePrecipitation(data.data);
      } catch (err) {
        if (!cancelled) {
          console.warn('[water-precip] fetch error:', err);
          // Don't clear facilities -- stale precip is fine
        }
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updatePrecipitation]);
}
