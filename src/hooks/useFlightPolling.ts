import { useEffect, useRef } from 'react';

import { dashboardAuthHeaders } from '@/lib/dashboardAuth';
import { useFlightStore } from '@/stores/flightStore';
import type { FlightEntity, CacheResponse } from '@/types/entities';

// Phase 28.1 W5 D-12 — env-tunable polling cadence + staleness threshold.
// Defaults preserve pre-W5 behavior (5s poll, 60s stale).
export const POLL_INTERVAL = Number(import.meta.env.VITE_POLL_FLIGHTS_MS ?? 5_000);
// 60s threshold: flights at 250m/s drift ~15km, making positions meaningfully outdated
export const STALE_THRESHOLD = Number(import.meta.env.VITE_STALE_FLIGHT_MS ?? 60_000);

export function useFlightPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSource = useFlightStore((s) => s.activeSource);

  const setFlightData = useFlightStore((s) => s.setFlightData);
  const setError = useFlightStore((s) => s.setError);
  const setLoading = useFlightStore((s) => s.setLoading);
  const clearStaleData = useFlightStore((s) => s.clearStaleData);
  const recordFetch = useFlightStore((s) => s.recordFetch);
  const setNextPollAt = useFlightStore((s) => s.setNextPollAt);

  useEffect(() => {
    const url = `/api/flights?source=${activeSource}`;
    let cancelled = false;

    const fetchFlights = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();
      try {
        const res = await fetch(url, { headers: dashboardAuthHeaders() });
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Flights API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<FlightEntity[]> & { rateLimited?: boolean } = await res.json();
        setFlightData(data);
        recordFetch(true, Date.now() - start);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
          recordFetch(false, Date.now() - start);
        }
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
      const nextTs = Date.now() + POLL_INTERVAL;
      setNextPollAt(nextTs);
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
        setNextPollAt(null);
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
      setNextPollAt(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]);
}
