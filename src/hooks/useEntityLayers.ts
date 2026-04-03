import { useMemo, useEffect, useRef, useState } from 'react';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useSearchStore } from '@/stores/searchStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { useSiteStore } from '@/stores/siteStore';
import { useEventStore } from '@/stores/eventStore';
import { computeAttackStatus } from '@/lib/attackStatus';
import { haversineKm } from '@/lib/geo';
import { classifySeverity } from '@/lib/severity';
import {
  ENTITY_COLORS,
  ICON_SIZE,
  PULSE_CONFIG,
  altitudeToOpacity,
} from '@/components/map/layers/constants';
import { getIconAtlas, ICON_MAPPING } from '@/components/map/layers/icons';
import { CONFLICT_TOGGLE_GROUPS } from '@/types/ui';
import type { MapEntity, FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';

const DIM_ALPHA = 40;
const SEARCH_DIM_ALPHA = 15;

// Smooth elliptical region boundary (replaces hard rectangular cutoffs)
const REGION_CENTER_LAT = 27;
const REGION_CENTER_LNG = 50;
const REGION_SEMI_LAT = 25; // north-south half-extent in degrees
const REGION_SEMI_LNG = 30; // east-west half-extent in degrees

function isInRegion(lat: number, lng: number): boolean {
  const dLat = (lat - REGION_CENTER_LAT) / REGION_SEMI_LAT;
  const dLng = (lng - REGION_CENTER_LNG) / REGION_SEMI_LNG;
  return dLat * dLat + dLng * dLng <= 1;
}

/** Maps siteType to icon atlas key */
const SITE_ICON_MAP: Record<string, string> = {
  nuclear: 'siteNuclear',
  naval: 'siteNaval',
  oil: 'siteOil',
  airbase: 'siteAirbase',
  port: 'sitePort',
};

function getIconForEntity(entity: MapEntity | SiteEntity): string {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.onGround ? 'chevronGround' : 'chevron';
    case 'ship': return 'chevron';
    case 'site': return SITE_ICON_MAP[(entity as SiteEntity).siteType] ?? 'diamond';
    case 'airstrike': return 'starburst';
    case 'ground_combat':
    case 'shelling':
    case 'bombing': return 'explosion';
    case 'assassination':
    case 'abduction': return 'crosshair';
    default: return 'xmark'; // assault, blockade, ceasefire_violation, mass_violence, wmd
  }
}

function getColorForEntity(entity: MapEntity | SiteEntity, attackMap?: Map<string, boolean>): [number, number, number] {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.unidentified
      ? [...ENTITY_COLORS.flightUnidentified] : [...ENTITY_COLORS.flight];
    case 'ship': return [...ENTITY_COLORS.ship];
    case 'site': return (attackMap?.get(entity.id) ? [...ENTITY_COLORS.siteAttacked] : [...ENTITY_COLORS.siteHealthy]);
    case 'airstrike': return [...ENTITY_COLORS.airstrike];
    case 'ground_combat':
    case 'shelling':
    case 'bombing': return [...ENTITY_COLORS.groundCombat];
    case 'assassination':
    case 'abduction': return [...ENTITY_COLORS.targeted];
    default: return [...ENTITY_COLORS.groundCombat];
  }
}

function getAngleForEntity(entity: MapEntity | SiteEntity): number {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.heading === null ? 0 : -(entity as FlightEntity).data.heading!;
    case 'ship': return -((entity as ShipEntity).data.courseOverGround ?? 0);
    default: return 0;
  }
}

function passesSeverityFilter(event: MapEntity, high: boolean, med: boolean, low: boolean): boolean {
  const level = classifySeverity(event as ConflictEventEntity);
  if (level === 'high') return high;
  if (level === 'medium') return med;
  return low;
}

/**
 * Returns Deck.gl layer array driven by filtered entity data.
 * All entities are always visible (no toggle gating).
 * Includes proximity circle layer when a pin is set.
 * All entity layers are pickable. Hovered/selected entity is highlighted; others dim.
 */
export function useEntityLayers() {
  // Consume filtered arrays (not raw store data)
  const { flights: allFlights, ships, events } = useFilteredEntities();

  // Site data (static, not filtered)
  const sites = useSiteStore((s) => s.sites);
  const allEvents = useEventStore((s) => s.events);

  const selectedEntityId = useUIStore((s) => s.selectedEntityId);
  const hoveredEntityId = useUIStore((s) => s.hoveredEntityId);
  const selectedCluster = useUIStore((s) => s.selectedCluster);

  // Cluster event IDs for dimming non-cluster events when a cluster is selected
  const clusterEventIds = useMemo(
    () => selectedCluster ? new Set(selectedCluster.eventIds) : null,
    [selectedCluster],
  );

  // Search filter state
  const isFilterActive = useSearchStore((s) => s.isFilterMode && s.matchedIds.size > 0);
  const matchedIds = useSearchStore((s) => s.matchedIds);

  // Proximity circle state
  const proximityPin = useFilterStore((s) => s.proximityPin);
  const proximityRadiusKm = useFilterStore((s) => s.proximityRadiusKm);

  // Severity filter toggles
  const showHighSeverity = useFilterStore((s) => s.showHighSeverity);
  const showMediumSeverity = useFilterStore((s) => s.showMediumSeverity);
  const showLowSeverity = useFilterStore((s) => s.showLowSeverity);

  // Visibility toggles (independent)
  const showFlights = useFilterStore((s) => s.showFlights);
  const showShips = useFilterStore((s) => s.showShips);
  const showAirstrikes = useFilterStore((s) => s.showAirstrikes);
  const showGroundCombatToggle = useFilterStore((s) => s.showGroundCombat);
  const showTargetedToggle = useFilterStore((s) => s.showTargeted);
  const showUnidentified = useFilterStore((s) => s.showUnidentified);
  const showGroundTraffic = useFilterStore((s) => s.showGroundTraffic);
  const showHealthySites = useFilterStore((s) => s.showHealthySites);
  const showAttackedSites = useFilterStore((s) => s.showAttackedSites);

  // Date range end for attack status computation (start is irrelevant -- once hit, stays hit)
  const dateEnd = useFilterStore((s) => s.dateEnd);

  // Site type filter
  const enabledSiteTypes = useFilterStore((s) => s.enabledSiteTypes);

  // Active entity = hovered (preview) or selected (pinned)
  const activeId = hoveredEntityId ?? selectedEntityId;

  // Filter flights by region + independent visibility toggles
  const flights = useMemo(() => {
    return allFlights.filter((f) => {
      if (f.data.originCountry === 'Greece') return false;
      if (!isInRegion(f.lat, f.lng)) return false;
      // Independent toggle logic: visible if ANY matching toggle is ON
      const isUnid = f.data.unidentified;
      const isGround = f.data.onGround;
      if (isUnid && showUnidentified) return true;
      if (isGround && !isUnid && showGroundTraffic) return true;
      if (!isGround && !isUnid && showFlights) return true;
      // Unidentified ground flight: either toggle
      if (isUnid && isGround && showGroundTraffic) return true;
      return false;
    });
  }, [allFlights, showFlights, showUnidentified, showGroundTraffic]);

  const airstrikeEvents = useMemo(() =>
    showAirstrikes
      ? events
          .filter((e) => (CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(e.type))
          .filter((e) => passesSeverityFilter(e, showHighSeverity, showMediumSeverity, showLowSeverity))
      : [],
    [events, showAirstrikes, showHighSeverity, showMediumSeverity, showLowSeverity]);
  const groundCombatEvents = useMemo(() =>
    showGroundCombatToggle
      ? events
          .filter((e) => (CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(e.type))
          .filter((e) => passesSeverityFilter(e, showHighSeverity, showMediumSeverity, showLowSeverity))
      : [],
    [events, showGroundCombatToggle, showHighSeverity, showMediumSeverity, showLowSeverity]);
  const targetedEvents = useMemo(() =>
    showTargetedToggle
      ? events
          .filter((e) => (CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(e.type))
          .filter((e) => passesSeverityFilter(e, showHighSeverity, showMediumSeverity, showLowSeverity))
      : [],
    [events, showTargetedToggle, showHighSeverity, showMediumSeverity, showLowSeverity]);

  // Sites filtered by enabled types, proximity pin, and healthy/attacked toggles
  const visibleSites = useMemo(() => {
    let filtered = sites.filter(s => enabledSiteTypes.includes(s.siteType));
    if (proximityPin) {
      filtered = filtered.filter(s =>
        haversineKm(proximityPin.lat, proximityPin.lng, s.lat, s.lng) <= proximityRadiusKm
      );
    }
    return filtered;
  }, [sites, enabledSiteTypes, proximityPin, proximityRadiusKm]);

  // Compute attack status for visible sites
  const siteAttackMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const site of visibleSites) {
      const status = computeAttackStatus(site, allEvents, dateEnd);
      map.set(site.id, status.isAttacked);
    }
    return map;
  }, [visibleSites, allEvents, dateEnd]);

  // Filter sites by healthy/attacked toggles
  const displaySites = useMemo(() => {
    return visibleSites.filter((s) => {
      const attacked = siteAttackMap.get(s.id) ?? false;
      if (attacked) return showAttackedSites;
      return showHealthySites;
    });
  }, [visibleSites, siteAttackMap, showAttackedSites, showHealthySites]);

  // Pulse animation state (always active for unidentified flights)
  const [pulseOpacity, setPulseOpacity] = useState(1.0);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      if (now - lastUpdateRef.current >= 67) {
        const opacity =
          PULSE_CONFIG.minOpacity +
          (PULSE_CONFIG.maxOpacity - PULSE_CONFIG.minOpacity) *
            (0.5 + 0.5 * Math.sin((now / PULSE_CONFIG.periodMs) * Math.PI * 2));
        setPulseOpacity(opacity);
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Proximity circle layer
  const proximityCircleLayer = useMemo(() => new ScatterplotLayer({
    id: 'proximity-circle',
    data: proximityPin ? [proximityPin] : [],
    getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat],
    getRadius: proximityRadiusKm * 1000,
    radiusUnits: 'meters' as const,
    getFillColor: [59, 130, 246, 30],
    getLineColor: [59, 130, 246, 120],
    stroked: true,
    filled: true,
    lineWidthMinPixels: 2,
    pickable: false,
  }), [proximityPin, proximityRadiusKm]);

  // Filter ships to Middle East region (smooth elliptical boundary) + visibility toggle
  const filteredShips = useMemo(() => {
    if (!showShips) return [];
    return ships.filter((s) => isInRegion(s.lat, s.lng));
  }, [ships, showShips]);

  // Ship layer (always visible)
  const shipLayer = useMemo(() => new IconLayer<ShipEntity>({
    id: 'ships',
    data: filteredShips,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'chevron',
    getPosition: (d: ShipEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.ship.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.ship.minPixels,
    sizeMaxPixels: ICON_SIZE.ship.maxPixels,
    getAngle: (d: ShipEntity) => -(d.data.courseOverGround ?? 0),
    getColor: (d: ShipEntity) => {
      const [r, g, b] = ENTITY_COLORS.ship;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId, isFilterActive, matchedIds.size, clusterEventIds] },
  }), [filteredShips, activeId, isFilterActive, matchedIds, clusterEventIds]);

  // Airstrike layer (always visible)
  const airstrikeLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'airstrikes',
    data: airstrikeEvents,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'starburst',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.airstrike.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.airstrike.minPixels,
    sizeMaxPixels: ICON_SIZE.airstrike.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.airstrike;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds && !clusterEventIds.has(d.id)) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId, isFilterActive, matchedIds.size, clusterEventIds] },
  }), [airstrikeEvents, activeId, isFilterActive, matchedIds, clusterEventIds]);

  // Ground combat layer (always visible)
  const groundCombatLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'groundCombat',
    data: groundCombatEvents,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: ConflictEventEntity) => getIconForEntity(d),
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.groundCombat.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.groundCombat.minPixels,
    sizeMaxPixels: ICON_SIZE.groundCombat.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.groundCombat;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds && !clusterEventIds.has(d.id)) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId, isFilterActive, matchedIds.size, clusterEventIds] },
  }), [groundCombatEvents, activeId, isFilterActive, matchedIds]);

  // Targeted layer (always visible)
  const targetedLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'targeted',
    data: targetedEvents,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'crosshair',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.targeted.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.targeted.minPixels,
    sizeMaxPixels: ICON_SIZE.targeted.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.targeted;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds && !clusterEventIds.has(d.id)) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId, isFilterActive, matchedIds.size, clusterEventIds] },
  }), [targetedEvents, activeId, isFilterActive, matchedIds, clusterEventIds]);

  // Flight layer (always visible)
  const flightLayer = useMemo(() => new IconLayer<FlightEntity>({
    id: 'flights',
    data: flights,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: FlightEntity) => d.data.onGround ? 'chevronGround' : 'chevron',
    getPosition: (d: FlightEntity) => [d.lng, d.lat],
    getSize: (d: FlightEntity) => {
      if (d.data.unidentified) {
        // Size pulses between 1.0x and 1.5x
        return ICON_SIZE.flight.meters * (1.0 + 0.5 * pulseOpacity);
      }
      return ICON_SIZE.flight.meters;
    },
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels,
    getAngle: (d: FlightEntity) => d.data.heading === null ? 0 : -d.data.heading,
    getColor: (d: FlightEntity) => {
      const [r, g, b] = d.data.unidentified
        ? ENTITY_COLORS.flightUnidentified
        : ENTITY_COLORS.flight;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      const alpha = d.data.unidentified
        ? Math.round(pulseOpacity * 255)
        : Math.round(altitudeToOpacity(d.data.altitude) * 255);
      return [r, g, b, alpha];
    },
    billboard: false,
    pickable: true,
    updateTriggers: {
      getColor: [pulseOpacity, activeId, isFilterActive, matchedIds.size, clusterEventIds],
      getSize: [pulseOpacity],
    },
  }), [flights, pulseOpacity, activeId, isFilterActive, matchedIds, clusterEventIds]);

  // Site layer (filtered by type + healthy/attacked toggles)
  const siteLayer = useMemo(() => new IconLayer<SiteEntity>({
    id: 'site-icons',
    data: displaySites,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: SiteEntity) => SITE_ICON_MAP[d.siteType] ?? 'diamond',
    getPosition: (d: SiteEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.site.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.site.minPixels,
    sizeMaxPixels: ICON_SIZE.site.maxPixels,
    getAngle: () => 0,
    getColor: (d: SiteEntity) => {
      const attacked = siteAttackMap.get(d.id) ?? false;
      const [r, g, b] = attacked ? ENTITY_COLORS.siteAttacked : ENTITY_COLORS.siteHealthy;
      if (isFilterActive && !matchedIds.has(d.id)) return [r, g, b, SEARCH_DIM_ALPHA];
      if (clusterEventIds) return [r, g, b, DIM_ALPHA];
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId, siteAttackMap, isFilterActive, matchedIds.size, clusterEventIds] },
  }), [displaySites, activeId, siteAttackMap, isFilterActive, matchedIds, clusterEventIds]);

  // Find active entity across all data sources
  const activeEntity = useMemo<MapEntity | SiteEntity | null>(() => {
    if (!activeId) return null;
    return flights.find((f) => f.id === activeId)
      ?? filteredShips.find((s) => s.id === activeId)
      ?? events.find((e) => e.id === activeId)
      ?? displaySites.find((s) => s.id === activeId)
      ?? null;
  }, [activeId, flights, filteredShips, events, displaySites]);

  // Glow layer for active entity (hidden when filter active and entity not matched)
  type AnyEntity = MapEntity | SiteEntity;
  const glowVisible = !!activeEntity && (!isFilterActive || matchedIds.has(activeEntity.id));
  const glowLayer = useMemo(() => new IconLayer<AnyEntity>({
    id: 'entity-glow',
    visible: glowVisible,
    data: activeEntity ? [activeEntity] : [],
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: AnyEntity) => getIconForEntity(d),
    getPosition: (d: AnyEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight.meters * 2.0,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels * 2.0,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels * 2.0,
    getAngle: (d: AnyEntity) => getAngleForEntity(d),
    getColor: (d: AnyEntity) => [...getColorForEntity(d, siteAttackMap), 60],
    billboard: false,
    pickable: false,
  }), [activeEntity, siteAttackMap, glowVisible]);

  // Highlight layer for active entity (hidden when filter active and entity not matched)
  const highlightVisible = !!activeEntity && (!isFilterActive || matchedIds.has(activeEntity.id));
  const highlightLayer = useMemo(() => new IconLayer<AnyEntity>({
    id: 'entity-highlight',
    visible: highlightVisible,
    data: activeEntity ? [activeEntity] : [],
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: AnyEntity) => getIconForEntity(d),
    getPosition: (d: AnyEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight.meters * 1.2,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels * 1.2,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels * 1.2,
    getAngle: (d: AnyEntity) => getAngleForEntity(d),
    getColor: (d: AnyEntity) => [...getColorForEntity(d, siteAttackMap), 255],
    billboard: false,
    pickable: false,
  }), [activeEntity, siteAttackMap, highlightVisible]);

  return [proximityCircleLayer, shipLayer, flightLayer, airstrikeLayer, groundCombatLayer, targetedLayer, siteLayer, glowLayer, highlightLayer];
}
