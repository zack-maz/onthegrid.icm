import { useEffect } from 'react';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteEntity, CacheResponse } from '@/types/entities';

/**
 * Fetches infrastructure sites once on mount.
 * No polling -- sites are static reference data with 24h server cache.
 */
export function useSiteFetch(): void {
  const setSiteData = useSiteStore((s) => s.setSiteData);
  const setError = useSiteStore((s) => s.setError);
  const setLoading = useSiteStore((s) => s.setLoading);
  const recordFetch = useSiteStore((s) => s.recordFetch);

  useEffect(() => {
    let cancelled = false;

    const fetchSites = async (): Promise<void> => {
      setLoading();
      const start = Date.now();
      try {
        const res = await fetch('/api/sites');
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Sites API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<SiteEntity[]> = await res.json();
        setSiteData(data);
        recordFetch(true, Date.now() - start);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
          recordFetch(false, Date.now() - start);
        }
      }
    };

    fetchSites();

    return () => {
      cancelled = true;
    };
  }, [setSiteData, setError, setLoading, recordFetch]);
}
