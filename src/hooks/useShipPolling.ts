import { useEffect, useRef } from 'react';
import { useShipStore, SHIP_STALE_THRESHOLD } from '@/stores/shipStore';
import type { ShipEntity, CacheResponse } from '@/types/entities';

export const SHIP_POLL_INTERVAL = 30_000;

export function useShipPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setShipData = useShipStore((s) => s.setShipData);
  const setError = useShipStore((s) => s.setError);
  const setLoading = useShipStore((s) => s.setLoading);
  const clearStaleData = useShipStore((s) => s.clearStaleData);

  useEffect(() => {
    let cancelled = false;

    const fetchShips = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/ships');
        if (cancelled) return;
        if (!res.ok) throw new Error(`Ships API ${res.status}`);
        const data: CacheResponse<ShipEntity[]> = await res.json();
        setShipData(data);
      } catch {
        if (!cancelled) setError();
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setShipData, setError, setLoading, clearStaleData]);
}
