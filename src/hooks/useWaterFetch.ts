import { useEffect } from 'react';

import { useWaterStore, type WaterFilterStats } from '@/stores/waterStore';

import type { WaterFacility, CacheResponse } from '../../server/types';

/**
 * Envelope returned by GET /api/water. The `filterStats` field is only
 * populated on non-cached responses — see server/routes/water.ts.
 */
type WaterApiResponse = CacheResponse<WaterFacility[]> & {
  filterStats?: WaterFilterStats;
};

/**
 * Fetches water facilities once on mount.
 * No polling -- facility locations are static; precipitation polling is separate.
 * REV-4: forwards server-provided `filterStats` (when present) into the store
 * so DevApiStatus can render the Water Filters diagnostics panel.
 */
export function useWaterFetch(): void {
  const setWaterData = useWaterStore((s) => s.setWaterData);
  const setFilterStats = useWaterStore((s) => s.setFilterStats);
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
        const data: WaterApiResponse = await res.json();
        setWaterData(data);
        // REV-4: forward filter stats when the server attaches them
        // (absent on cached responses, so guard with !== undefined).
        if (data.filterStats !== undefined) {
          setFilterStats(data.filterStats);
        }
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
  }, [setWaterData, setFilterStats, setError, setLoading, recordFetch]);
}
