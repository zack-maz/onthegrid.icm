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

  useEffect(() => {
    let cancelled = false;

    const fetchWater = async (): Promise<void> => {
      setLoading();
      try {
        const res = await fetch('/api/water');
        if (cancelled) return;
        if (!res.ok) throw new Error(`Water API ${res.status}`);
        const data: CacheResponse<WaterFacility[]> = await res.json();
        setWaterData(data);
      } catch (err) {
        if (!cancelled) {
          console.warn('[water] fetch error:', err);
          setError();
        }
      }
    };

    fetchWater();

    return () => {
      cancelled = true;
    };
  }, [setWaterData, setError, setLoading]);
}
