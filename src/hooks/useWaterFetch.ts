import { useEffect } from 'react';
import { useWaterStore } from '@/stores/waterStore';
import type { WaterFacility, CacheResponse } from '../../server/types';

/**
 * Fetches water facilities once on mount.
 * No polling -- facility locations are static; precipitation polling is separate.
 */
export function useWaterFetch(): void {
  const setWaterData = useWaterStore((s) => s.setWaterData);
  const setError = useWaterStore((s) => s.setError);
  const setLoading = useWaterStore((s) => s.setLoading);
  const recordFetch = useWaterStore((s) => s.recordFetch);

  useEffect(() => {
    let cancelled = false;

    const fetchWater = async (): Promise<void> => {
      setLoading();
      const start = Date.now();
      try {
        const res = await fetch('/api/water');
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Water API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<WaterFacility[]> = await res.json();
        setWaterData(data);
        recordFetch(true, Date.now() - start);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
          recordFetch(false, Date.now() - start);
        }
      }
    };

    fetchWater();

    return () => {
      cancelled = true;
    };
  }, [setWaterData, setError, setLoading, recordFetch]);
}
