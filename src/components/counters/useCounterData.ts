import { useMemo } from 'react';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { useSiteStore } from '@/stores/siteStore';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useWaterStore } from '@/stores/waterStore';
import { useLayerStore } from '@/stores/layerStore';
import { computeAttackStatus } from '@/lib/attackStatus';
import { haversineKm } from '@/lib/geo';
import { classifySeverity } from '@/lib/severity';
import { healthToScore, scoreToLabel } from '@/lib/waterStress';
import { CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS } from '@/types/ui';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity, SiteType } from '@/types/entities';
import type { WaterFacility, WaterFacilityType } from '../../../server/types';

export interface SiteCounts {
  nuclear: number;
  naval: number;
  oil: number;
  airbase: number;
  port: number;
  total: number;
}

export interface WaterCounts {
  dam: number;
  reservoir: number;
  desalination: number;
  treatment_plant: number;
  total: number;
}

export interface CounterValues {
  totalFlights: number;
  iranianFlights: number;
  airstrikes: number;
  groundCombat: number;
  targeted: number;
  sites: SiteCounts;
  water: WaterCounts;
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
  water: Record<WaterFacilityType, CounterEntity[]>;
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

const WATER_TYPE_LABELS: Record<WaterFacilityType, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination',
  treatment_plant: 'Treatment Plant',
};

function toWaterEntity(w: WaterFacility): CounterEntity {
  const score = healthToScore(w.stress.compositeHealth);
  const metric = `${score}/10 ${scoreToLabel(score)}`;
  return { id: w.id, label: w.label || WATER_TYPE_LABELS[w.facilityType], metric, lat: w.lat, lng: w.lng, type: w.facilityType };
}

export function useCounterData(): CounterValues & { entities: CounterEntities } {
  const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
  const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
  const showLowSeverity = useFilterStore((s) => s.showLowSeverity);

  // Visibility toggles
  const showFlights = useFilterStore((s) => s.showFlights);
  const showShips = useFilterStore((s) => s.showShips);
  const showAirstrikes = useFilterStore((s) => s.showAirstrikes);
  const showGroundCombatToggle = useFilterStore((s) => s.showGroundCombat);
  const showTargetedToggle = useFilterStore((s) => s.showTargeted);
  const showUnidentified = useFilterStore((s) => s.showUnidentified);
  const showGroundTraffic = useFilterStore((s) => s.showGroundTraffic);
  const showHealthySites = useFilterStore((s) => s.showHealthySites);
  const showAttackedSites = useFilterStore((s) => s.showAttackedSites);

  const { flights: filteredFlights, ships: filteredShips, events: filteredEvents } = useFilteredEntities();

  const sites = useSiteStore((s) => s.sites);
  const allEvents = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd);

  const proximityPin = useFilterStore((s) => s.proximityPin);
  const proximityRadiusKm = useFilterStore((s) => s.proximityRadiusKm);
  const enabledSiteTypes = useFilterStore((s) => s.enabledSiteTypes);

  const waterFacilities = useWaterStore((s) => s.facilities);
  const isWaterLayerActive = useLayerStore((s) => s.activeLayers.has('water'));

  return useMemo(() => {
    // Apply independent flight visibility toggles (matching useEntityLayers)
    const visibleFlights = filteredFlights.filter((f: FlightEntity) => {
      const isUnid = f.data.unidentified;
      const isGround = f.data.onGround;
      if (isUnid && showUnidentified) return true;
      if (isGround && !isUnid && showGroundTraffic) return true;
      if (!isGround && !isUnid && showFlights) return true;
      if (isUnid && isGround && showGroundTraffic) return true;
      return false;
    });

    const iranianFlights = visibleFlights.filter((f: FlightEntity) => f.data.originCountry === 'Iran').length;

    // Apply severity filter to events
    const severityFilteredEvents = filteredEvents.filter((e: ConflictEventEntity) => {
      const level = classifySeverity(e);
      if (level === 'high') return showHighSeverity;
      if (level === 'medium') return showMediumSeverity;
      return showLowSeverity;
    });

    // Apply conflict visibility toggles
    const airstrikes = showAirstrikes ? countByGroup(severityFilteredEvents, AIRSTRIKE_TYPES) : 0;
    const groundCombatCount = showGroundCombatToggle ? countByGroup(severityFilteredEvents, GROUND_COMBAT_TYPES) : 0;
    const targeted = showTargetedToggle ? countByGroup(severityFilteredEvents, TARGETED_TYPES) : 0;

    // Sites: per-type counts + entity collection with proximity filtering
    const siteCounts: SiteCounts = { nuclear: 0, naval: 0, oil: 0, airbase: 0, port: 0, total: 0 };
    const siteEntities: Record<SiteType, CounterEntity[]> = {
      nuclear: [], naval: [], oil: [], airbase: [], port: [],
    };

    // Sites filtered by enabled types and proximity
    let visibleSites = sites.filter((s: SiteEntity) => enabledSiteTypes.includes(s.siteType));
    if (proximityPin) {
      visibleSites = visibleSites.filter((s: SiteEntity) =>
        haversineKm(proximityPin.lat, proximityPin.lng, s.lat, s.lng) <= proximityRadiusKm);
    }

    for (const site of visibleSites) {
      const status = computeAttackStatus(site, allEvents, dateEnd);
      // Apply healthy/attacked visibility toggles
      if (status.isAttacked && !showAttackedSites) continue;
      if (!status.isAttacked && !showHealthySites) continue;
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

    // --- Water facilities (gated by layer active) ---
    const waterCounts: WaterCounts = { dam: 0, reservoir: 0, desalination: 0, treatment_plant: 0, total: 0 };
    const waterEntities: Record<WaterFacilityType, CounterEntity[]> = {
      dam: [], reservoir: [], desalination: [], treatment_plant: [],
    };

    if (isWaterLayerActive) {
      for (const wf of waterFacilities) {
        waterCounts[wf.facilityType]++;
        waterCounts.total++;
        waterEntities[wf.facilityType].push(toWaterEntity(wf));
      }
      // Sort each type by health ascending (most stressed first)
      for (const key of Object.keys(waterEntities) as WaterFacilityType[]) {
        waterEntities[key].sort((a, b) => {
          const aHealth = parseInt(a.metric) || 0;
          const bHealth = parseInt(b.metric) || 0;
          return aHealth - bHealth;
        });
      }
    }

    // --- Entity arrays ---

    // Flights (already visibility-filtered)
    const flightEntities = sortByProximity(
      visibleFlights.map(toFlightEntity),
      TEHRAN,
      TEL_AVIV,
    );

    // Ships (apply visibility toggle)
    const visibleShips = showShips ? filteredShips : [];
    const shipEntities = sortByProximity(visibleShips.map(toShipEntity), STRAIT_HORMUZ);

    // Event entities (apply conflict visibility toggles)
    const airstrikeEventEntities = showAirstrikes
      ? sortByProximity(filterByGroup(severityFilteredEvents, AIRSTRIKE_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const groundCombatEventEntities = showGroundCombatToggle
      ? sortByProximity(filterByGroup(severityFilteredEvents, GROUND_COMBAT_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const targetedEventEntities = showTargetedToggle
      ? sortByProximity(filterByGroup(severityFilteredEvents, TARGETED_TYPES).map(toEventEntity), TEHRAN, TEL_AVIV)
      : [];

    const entities: CounterEntities = {
      flights: flightEntities,
      ships: shipEntities,
      airstrikeEvents: airstrikeEventEntities,
      groundCombatEvents: groundCombatEventEntities,
      targetedEvents: targetedEventEntities,
      sites: siteEntities,
      water: waterEntities,
    };

    return {
      totalFlights: visibleFlights.length,
      iranianFlights,
      airstrikes,
      groundCombat: groundCombatCount,
      targeted,
      sites: siteCounts,
      water: waterCounts,
      entities,
    };
  }, [filteredFlights, filteredShips, filteredEvents, sites, allEvents, dateEnd, showHighSeverity, showMediumSeverity, showLowSeverity, proximityPin, proximityRadiusKm, enabledSiteTypes, showFlights, showShips, showAirstrikes, showGroundCombatToggle, showTargetedToggle, showUnidentified, showGroundTraffic, showHealthySites, showAttackedSites, waterFacilities, isWaterLayerActive]);
}
