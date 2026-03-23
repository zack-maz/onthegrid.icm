import { useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { useSiteStore } from '@/stores/siteStore';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { computeAttackStatus } from '@/lib/attackStatus';
import { haversineKm } from '@/lib/geo';
import { classifySeverity } from '@/lib/severity';
import { CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS } from '@/types/ui';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity, SiteType } from '@/types/entities';

export interface SiteCounts {
  nuclear: number;
  naval: number;
  oil: number;
  airbase: number;
  desalination: number;
  port: number;
  total: number;
}

export interface CounterValues {
  totalFlights: number;
  iranianFlights: number;
  airstrikes: number;
  groundCombat: number;
  targeted: number;
  sites: SiteCounts;
}

export interface CounterEntity {
  id: string;
  label: string;
  metric: string;
  lat: number;
  lng: number;
  type: string;
}

export interface CounterEntities {
  flights: CounterEntity[];
  ships: CounterEntity[];
  airstrikeEvents: CounterEntity[];
  groundCombatEvents: CounterEntity[];
  targetedEvents: CounterEntity[];
  sites: Record<SiteType, CounterEntity[]>;
}

const AIRSTRIKE_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showAirstrikes;
const GROUND_COMBAT_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showGroundCombat;
const TARGETED_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showTargeted;

// Proximity sort reference points
const TEHRAN = { lat: 35.69, lng: 51.39 };
const TEL_AVIV = { lat: 32.07, lng: 34.78 };
const STRAIT_HORMUZ = { lat: 26.56, lng: 56.25 };

function countByGroup(events: ConflictEventEntity[], types: readonly string[]): number {
  return events.filter((e) => types.includes(e.type)).length;
}

function filterByGroup(events: ConflictEventEntity[], types: readonly string[]): ConflictEventEntity[] {
  return events.filter((e) => types.includes(e.type));
}

function sortByProximity(
  entities: CounterEntity[],
  primary: { lat: number; lng: number },
  secondary?: { lat: number; lng: number },
): CounterEntity[] {
  return [...entities].sort((a, b) => {
    const dA = haversineKm(a.lat, a.lng, primary.lat, primary.lng);
    const dB = haversineKm(b.lat, b.lng, primary.lat, primary.lng);
    if (Math.abs(dA - dB) > 0.01) return dA - dB;
    if (secondary) {
      return (
        haversineKm(a.lat, a.lng, secondary.lat, secondary.lng) -
        haversineKm(b.lat, b.lng, secondary.lat, secondary.lng)
      );
    }
    return 0;
  });
}

function toFlightEntity(f: FlightEntity): CounterEntity {
  const label = f.data.unidentified ? f.data.icao24 : f.data.callsign;
  const metric =
    f.data.onGround
      ? 'GND'
      : f.data.altitude != null
        ? `${Math.round(f.data.altitude * 3.28084).toLocaleString()} ft`
        : '---';
  return { id: f.id, label, metric, lat: f.lat, lng: f.lng, type: f.type };
}

function toShipEntity(s: ShipEntity): CounterEntity {
  const label = s.data.shipName || String(s.data.mmsi);
  const metric = `${s.data.speedOverGround.toFixed(1)} kn`;
  return { id: s.id, label, metric, lat: s.lat, lng: s.lng, type: s.type };
}

function toEventEntity(e: ConflictEventEntity): CounterEntity {
  const label = EVENT_TYPE_LABELS[e.type] || e.type;
  const metric = `GS ${e.data.goldsteinScale}`;
  return { id: e.id, label, metric, lat: e.lat, lng: e.lng, type: e.type };
}

function toSiteEntity(s: SiteEntity, attackCount: number): CounterEntity {
  const metric = attackCount > 0
    ? `${attackCount} attack${attackCount !== 1 ? 's' : ''}`
    : 'No attacks';
  return { id: s.id, label: s.label, metric, lat: s.lat, lng: s.lng, type: s.siteType };
}

export function useCounterData(): CounterValues & { entities: CounterEntities } {
  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const showSites = useUIStore((s) => s.showSites);
  const showNuclear = useUIStore((s) => s.showNuclear);
  const showNaval = useUIStore((s) => s.showNaval);
  const showOil = useUIStore((s) => s.showOil);
  const showAirbase = useUIStore((s) => s.showAirbase);
  const showDesalination = useUIStore((s) => s.showDesalination);
  const showPort = useUIStore((s) => s.showPort);
  const showShips = useUIStore((s) => s.showShips);
  const showHealthySites = useUIStore((s) => s.showHealthySites);
  const showAttackedSites = useUIStore((s) => s.showAttackedSites);
  const showHitOnly = useUIStore((s) => s.showHitOnly);

  const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
  const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
  const showLowSeverity = useFilterStore((s) => s.showLowSeverity);

  const { flights: filteredFlights, ships: filteredShips, events: filteredEvents } = useFilteredEntities();

  const sites = useSiteStore((s) => s.sites);
  const allEvents = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd);

  const proximityPin = useFilterStore((s) => s.proximityPin);
  const proximityRadiusKm = useFilterStore((s) => s.proximityRadiusKm);

  return useMemo(() => {
    // Visible flights: smart filters + toggle gating (matches useEntityLayers logic)
    const visibleFlights = filteredFlights.filter((f: FlightEntity) => {
      if (f.data.unidentified) return pulseEnabled;
      if (f.data.onGround) return showGroundTraffic;
      return showFlights;
    });

    const iranianFlights = visibleFlights.filter((f: FlightEntity) => f.data.originCountry === 'Iran').length;

    // Apply severity filter to events
    const severityFilteredEvents = filteredEvents.filter((e: ConflictEventEntity) => {
      const level = classifySeverity(e);
      if (level === 'high') return showHighSeverity;
      if (level === 'medium') return showMediumSeverity;
      return showLowSeverity;
    });

    // Visible event counts: smart filters + toggle gating + severity gating
    const airstrikes = showEvents && showAirstrikes
      ? countByGroup(severityFilteredEvents, AIRSTRIKE_TYPES)
      : 0;
    const groundCombatCount = showEvents && showGroundCombat
      ? countByGroup(severityFilteredEvents, GROUND_COMBAT_TYPES)
      : 0;
    const targeted = showEvents && showTargeted
      ? countByGroup(severityFilteredEvents, TARGETED_TYPES)
      : 0;

    // Sites: per-type counts + entity collection with proximity + attacked/healthy filtering
    const siteCounts: SiteCounts = { nuclear: 0, naval: 0, oil: 0, airbase: 0, desalination: 0, port: 0, total: 0 };
    const siteEntities: Record<SiteType, CounterEntity[]> = {
      nuclear: [], naval: [], oil: [], airbase: [], desalination: [], port: [],
    };

    if (showSites) {
      const visibleSites = sites.filter((s: SiteEntity) => {
        // Proximity filter
        if (proximityPin && haversineKm(proximityPin.lat, proximityPin.lng, s.lat, s.lng) > proximityRadiusKm) return false;
        switch (s.siteType) {
          case 'nuclear': return showNuclear;
          case 'naval': return showNaval;
          case 'oil': return showOil;
          case 'airbase': return showAirbase;
          case 'desalination': return showDesalination;
          case 'port': return showPort;
        }
      });
      for (const site of visibleSites) {
        const status = computeAttackStatus(site, allEvents, dateEnd);
        const isAttacked = status.attackCount > 0;
        // Hit-only filter
        if (showHitOnly && !isAttacked) continue;
        // Attacked/healthy status filter
        if (isAttacked && !showAttackedSites) continue;
        if (!isAttacked && !showHealthySites) continue;
        siteCounts[site.siteType]++;
        siteCounts.total++;
        siteEntities[site.siteType].push(toSiteEntity(site, status.attackCount));
      }
      // Sort each site type: attacked first (by attack count desc), then non-attacked
      for (const key of Object.keys(siteEntities) as SiteType[]) {
        siteEntities[key].sort((a, b) => {
          const aCount = parseInt(a.metric) || 0;
          const bCount = parseInt(b.metric) || 0;
          return bCount - aCount;
        });
      }
    }

    // --- Entity arrays ---

    // All visible flights (including unidentified when toggle is on)
    const flightEntities = sortByProximity(
      visibleFlights.map(toFlightEntity),
      TEHRAN,
      TEL_AVIV,
    );

    // Ships
    const shipEntities = showShips
      ? sortByProximity(filteredShips.map(toShipEntity), STRAIT_HORMUZ)
      : [];

    // Event entities
    const airstrikeEventEntities = showEvents && showAirstrikes
      ? sortByProximity(filterByGroup(severityFilteredEvents, AIRSTRIKE_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const groundCombatEventEntities = showEvents && showGroundCombat
      ? sortByProximity(filterByGroup(severityFilteredEvents, GROUND_COMBAT_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const targetedEventEntities = showEvents && showTargeted
      ? sortByProximity(filterByGroup(severityFilteredEvents, TARGETED_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const entities: CounterEntities = {
      flights: flightEntities,
      ships: shipEntities,
      airstrikeEvents: airstrikeEventEntities,
      groundCombatEvents: groundCombatEventEntities,
      targetedEvents: targetedEventEntities,
      sites: siteEntities,
    };

    return {
      totalFlights: visibleFlights.length,
      iranianFlights,
      airstrikes,
      groundCombat: groundCombatCount,
      targeted,
      sites: siteCounts,
      entities,
    };
  }, [filteredFlights, filteredShips, filteredEvents, showFlights, showGroundTraffic, pulseEnabled, showEvents, showAirstrikes, showGroundCombat, showTargeted, showShips, sites, allEvents, dateEnd, showSites, showNuclear, showNaval, showOil, showAirbase, showDesalination, showPort, showHighSeverity, showMediumSeverity, showLowSeverity, showHealthySites, showAttackedSites, showHitOnly, proximityPin, proximityRadiusKm]);
}
