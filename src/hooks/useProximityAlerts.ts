import { useMemo } from 'react';
import type { FlightEntity, SiteEntity } from '@/types/entities';
import { useFlightStore } from '@/stores/flightStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { haversineKm } from '@/lib/geo';

const PROXIMITY_THRESHOLD_KM = 25;
const COARSE_DEG = 0.25; // ~25km coarse bbox pre-filter

export interface ProximityAlert {
  siteId: string;
  siteLat: number;
  siteLng: number;
  siteLabel: string;
  siteType: string;
  flightId: string;
  flightLabel: string;
  distanceKm: number;
  heading: number | null;
}

/** Pure computation function for testing without React hooks */
export function computeProximityAlerts(
  flights: FlightEntity[],
  sites: SiteEntity[],
): ProximityAlert[] {
  // Filter to unidentified airborne flights only
  const unidentified = flights.filter(
    (f) => f.data.unidentified === true && !f.data.onGround,
  );
  if (unidentified.length === 0 || sites.length === 0) return [];

  // For each site, find the closest unidentified flight within threshold
  const alertsBySite = new Map<string, ProximityAlert>();

  for (const site of sites) {
    for (const flight of unidentified) {
      // Coarse bbox pre-filter to avoid expensive haversine for distant pairs
      if (
        Math.abs(flight.lat - site.lat) > COARSE_DEG ||
        Math.abs(flight.lng - site.lng) > COARSE_DEG
      ) {
        continue;
      }

      const distance = haversineKm(site.lat, site.lng, flight.lat, flight.lng);
      if (distance > PROXIMITY_THRESHOLD_KM) continue;

      const existing = alertsBySite.get(site.id);
      if (!existing || distance < existing.distanceKm) {
        alertsBySite.set(site.id, {
          siteId: site.id,
          siteLat: site.lat,
          siteLng: site.lng,
          siteLabel: site.label,
          siteType: site.siteType,
          flightId: flight.id,
          flightLabel: flight.label,
          distanceKm: distance,
          heading: flight.data.heading,
        });
      }
    }
  }

  // Sort by distance ascending (most urgent first)
  return Array.from(alertsBySite.values()).sort(
    (a, b) => a.distanceKm - b.distanceKm,
  );
}

/** React hook that computes proximity alerts from visible sites only */
export function useProximityAlerts(): ProximityAlert[] {
  const flights = useFlightStore((s) => s.flights);
  const sites = useSiteStore((s) => s.sites);
  const showSites = useUIStore((s) => s.showSites);
  const showNuclear = useUIStore((s) => s.showNuclear);
  const showNaval = useUIStore((s) => s.showNaval);
  const showOil = useUIStore((s) => s.showOil);
  const showAirbase = useUIStore((s) => s.showAirbase);
  const showDesalination = useUIStore((s) => s.showDesalination);
  const showPort = useUIStore((s) => s.showPort);

  const visibleSites = useMemo(() => {
    if (!showSites) return [];
    return sites.filter((s) => {
      switch (s.siteType) {
        case 'nuclear': return showNuclear;
        case 'naval': return showNaval;
        case 'oil': return showOil;
        case 'airbase': return showAirbase;
        case 'desalination': return showDesalination;
        case 'port': return showPort;
        default: return false;
      }
    });
  }, [sites, showSites, showNuclear, showNaval, showOil, showAirbase, showDesalination, showPort]);

  return useMemo(() => computeProximityAlerts(flights, visibleSites), [flights, visibleSites]);
}
