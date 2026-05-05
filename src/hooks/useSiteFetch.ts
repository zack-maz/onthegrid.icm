import { useEffect } from 'react';

import { useSiteStore, type SiteFilterStats } from '@/stores/siteStore';
import type { SiteEntity, CacheResponse } from '@/types/entities';

/**
 * Envelope returned by GET /api/sites. The `filterStats` field is populated
 * by the server on every response path post-R-05 (snapshot / redis / overpass).
 */
type SitesApiResponse = CacheResponse<SiteEntity[]> & {
  filterStats?: SiteFilterStats;
};

/**
 * Fetches infrastructure sites once on mount.
 * No polling -- sites are static reference data with 24h server cache.
 *
 * Phase 27.3.1 R-05 D-19 — forwards server-provided `filterStats` (when
 * present) into siteStore so the DevApiStatus Sites panel (Plan 08) can
 * render the diagnostics block.
 */
export function useSiteFetch(): void {
  const setSiteData = useSiteStore((s) => s.setSiteData);
  const setFilterStats = useSiteStore((s) => s.setFilterStats);
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
        const data: SitesApiResponse = await res.json();
        setSiteData(data);
        // R-05 D-19: forward filter stats when the server attaches them.
        // Guard with `!== undefined` so an older cached response missing the
        // field doesn't overwrite a previous stats value.
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

    fetchSites();

    return () => {
      cancelled = true;
    };
  }, [setSiteData, setFilterStats, setError, setLoading, recordFetch]);
}
