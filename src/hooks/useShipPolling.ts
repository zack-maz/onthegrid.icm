import { useEffect, useRef } from 'react';

import { dashboardAuthHeaders } from '@/lib/dashboardAuth';
import { useShipStore, SHIP_STALE_THRESHOLD } from '@/stores/shipStore';
import type { ShipEntity, CacheResponse } from '@/types/entities';

// Phase 28.1 W5 D-12 — env-tunable ship polling cadence. Default preserves
// pre-W5 behavior (30s poll).
export const SHIP_POLL_INTERVAL = Number(import.meta.env.VITE_POLL_SHIPS_MS ?? 30_000);

export function useShipPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setShipData = useShipStore((s) => s.setShipData);
  const setError = useShipStore((s) => s.setError);
  const setLoading = useShipStore((s) => s.setLoading);
  const clearStaleData = useShipStore((s) => s.clearStaleData);
  const recordFetch = useShipStore((s) => s.recordFetch);
  const setNextPollAt = useShipStore((s) => s.setNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchShips = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();
      try {
        const res = await fetch('/api/ships', { headers: dashboardAuthHeaders() });
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Ships API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<ShipEntity[]> = await res.json();
        setShipData(data);
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
      const { lastFresh } = useShipStore.getState();
      if (lastFresh !== null && Date.now() - lastFresh > SHIP_STALE_THRESHOLD) {
        clearStaleData();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      const nextTs = Date.now() + SHIP_POLL_INTERVAL;
      setNextPollAt(nextTs);
      timeoutRef.current = setTimeout(async () => {
        await fetchShips();
        checkStaleness();
        schedulePoll();
      }, SHIP_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setNextPollAt(null);
      } else {
        fetchShips().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    setLoading();
    fetchShips().then(schedulePoll);

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
  }, [setShipData, setError, setLoading, clearStaleData, recordFetch, setNextPollAt]);
}
