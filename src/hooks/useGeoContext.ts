import { useState, useEffect, useMemo } from 'react';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteEntity } from '@/types/entities';
import type { ThreatCluster } from '@/types/ui';

export interface GeoContext {
  label: string;
  type: 'site' | 'geocode';
  sites?: SiteEntity[];
}

/** Padding in degrees (~11km) added to cluster bounding box for site proximity check */
const BBOX_PADDING = 0.1;

/**
 * Derive geographic context for a threat cluster.
 *
 * Step 1 (synchronous): Check if any known sites fall within the cluster
 * bounding box (padded). No API call needed.
 *
 * Step 2 (async fallback): If no sites match, fetch a reverse-geocoded
 * location from /api/geocode (Nominatim, cached on server).
 *
 * Returns null while loading (step 2 in-flight).
 */
export function useGeoContext(cluster: ThreatCluster): GeoContext | null {
  const sites = useSiteStore((s) => s.sites);

  // Step 1: Synchronous site proximity check
  const siteMatch = useMemo(() => {
    const { minLat, maxLat, minLng, maxLng } = cluster.boundingBox;
    const padMinLat = minLat - BBOX_PADDING;
    const padMaxLat = maxLat + BBOX_PADDING;
    const padMinLng = minLng - BBOX_PADDING;
    const padMaxLng = maxLng + BBOX_PADDING;

    const matched = sites.filter(
      (s) =>
        s.lat >= padMinLat &&
        s.lat <= padMaxLat &&
        s.lng >= padMinLng &&
        s.lng <= padMaxLng,
    );

    if (matched.length === 0) return null;

    const suffix = matched.length > 1 ? ` (+${matched.length - 1} more)` : '';
    return {
      label: `Near ${matched[0].label}${suffix}`,
      type: 'site' as const,
      sites: matched,
    };
  }, [sites, cluster.boundingBox]);

  // Step 2: Async geocode fallback
  const [geocodeResult, setGeocodeResult] = useState<GeoContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If sites matched, no need to geocode
    if (siteMatch) {
      setGeocodeResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/geocode?lat=${cluster.centroidLat}&lon=${cluster.centroidLng}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        const data = body.data;
        const label = data?.city
          ? `${data.city}, ${data.country ?? ''}`
          : data?.country ?? data?.display ?? 'Unknown location';
        setGeocodeResult({ label, type: 'geocode' });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGeocodeResult({ label: 'Unknown location', type: 'geocode' });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cluster.id, siteMatch, cluster.centroidLat, cluster.centroidLng]);

  // Site match takes priority
  if (siteMatch) return siteMatch;

  // Loading state
  if (loading) return null;

  return geocodeResult;
}
