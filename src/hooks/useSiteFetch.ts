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

  useEffect(() => {
    let cancelled = false;

    const fetchSites = async (): Promise<void> => {
      setLoading();
      try {
        const res = await fetch('/api/sites');
        if (cancelled) return;
        if (!res.ok) throw new Error(`Sites API ${res.status}`);
        const data: CacheResponse<SiteEntity[]> = await res.json();
        setSiteData(data);
      } catch {
        if (!cancelled) {
          // Silently mark error — connection status surfaces in StatusPanel.
          setError();
        }
      }
    };

    fetchSites();

    return () => {
      cancelled = true;
    };
  }, [setSiteData, setError, setLoading]);
}
