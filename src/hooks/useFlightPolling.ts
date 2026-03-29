import { useEffect, useRef } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import type { FlightEntity, CacheResponse } from '@/types/entities';

export const POLL_INTERVAL = 5_000;
// 60s threshold: flights at 250m/s drift ~15km, making positions meaningfully outdated
export const STALE_THRESHOLD = 60_000;

export function useFlightPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSource = useFlightStore((s) => s.activeSource);

  const setFlightData = useFlightStore((s) => s.setFlightData);
  const setError = useFlightStore((s) => s.setError);
  const setLoading = useFlightStore((s) => s.setLoading);
  const clearStaleData = useFlightStore((s) => s.clearStaleData);

  useEffect(() => {
    const url = `/api/flights?source=${activeSource}`;
    let cancelled = false;

    const fetchFlights = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Flights API ${res.status}`);
        const data: CacheResponse<FlightEntity[]> & { rateLimited?: boolean } = await res.json();
        setFlightData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const checkStaleness = (): void => {
      const { lastFresh } = useFlightStore.getState();
      if (lastFresh !== null && Date.now() - lastFresh > STALE_THRESHOLD) {
        clearStaleData();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      timeoutRef.current = setTimeout(async () => {
        await fetchFlights();
        checkStaleness();
        schedulePoll();
      }, POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        fetchFlights().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    setLoading();
    fetchFlights().then(schedulePoll);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);
}
