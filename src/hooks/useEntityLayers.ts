import { useMemo, useEffect, useRef, useState } from 'react';
import { IconLayer } from '@deck.gl/layers';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import {
  ENTITY_COLORS,
  ICON_SIZE,
  PULSE_CONFIG,
  altitudeToOpacity,
} from '@/components/map/layers/constants';
import { getIconAtlas, ICON_MAPPING } from '@/components/map/layers/icons';
import { CONFLICT_TOGGLE_GROUPS, isConflictEventType } from '@/types/ui';
import type { MapEntity, FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

const DIM_ALPHA = 40;

function getIconForEntity(entity: MapEntity): string {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.onGround ? 'chevronGround' : 'chevron';
    case 'ship': return 'chevron';
    case 'airstrike': return 'starburst';
    case 'ground_combat':
    case 'shelling':
    case 'bombing': return 'explosion';
    case 'assassination':
    case 'abduction': return 'crosshair';
    default: return 'xmark'; // assault, blockade, ceasefire_violation, mass_violence, wmd
  }
}

function getColorForEntity(entity: MapEntity): [number, number, number] {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.unidentified
      ? [...ENTITY_COLORS.flightUnidentified] : [...ENTITY_COLORS.flight];
    case 'ship': return [...ENTITY_COLORS.ship];
    case 'airstrike': return [...ENTITY_COLORS.airstrike];
    case 'ground_combat':
    case 'shelling':
    case 'bombing': return [...ENTITY_COLORS.groundCombat];
    case 'assassination':
    case 'abduction': return [...ENTITY_COLORS.targeted];
    default: return [...ENTITY_COLORS.otherConflict];
  }
}

function getAngleForEntity(entity: MapEntity): number {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.heading === null ? 0 : -(entity as FlightEntity).data.heading!;
    case 'ship': return -((entity as ShipEntity).data.courseOverGround ?? 0);
    default: return 0;
  }
}

/**
 * Returns Deck.gl IconLayer array driven by Zustand store data.
 * All layers are pickable. Hovered/selected entity is highlighted; others dim.
 */
export function useEntityLayers() {
  const allFlights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const showFlights = useUIStore((s) => s.showFlights);
  const showShips = useUIStore((s) => s.showShips);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const showOtherConflict = useUIStore((s) => s.showOtherConflict);
  const selectedEntityId = useUIStore((s) => s.selectedEntityId);
  const hoveredEntityId = useUIStore((s) => s.hoveredEntityId);

  // Active entity = hovered (preview) or selected (pinned)
  const activeId = hoveredEntityId ?? selectedEntityId;

  const flights = useMemo(() => {
    return allFlights.filter((f) => {
      // Mutually exclusive: unidentified first, then ground, then regular
      if (f.data.unidentified) return pulseEnabled;
      if (f.data.onGround) return showGroundTraffic;
      return showFlights;
    });
  }, [allFlights, showFlights, showGroundTraffic, pulseEnabled]);

  const airstrikeEvents = useMemo(() =>
    events.filter((e) => (CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(e.type)),
    [events]);
  const groundCombatEvents = useMemo(() =>
    events.filter((e) => (CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(e.type)),
    [events]);
  const targetedEvents = useMemo(() =>
    events.filter((e) => (CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(e.type)),
    [events]);
  const otherConflictEvents = useMemo(() =>
    events.filter((e) => (CONFLICT_TOGGLE_GROUPS.showOtherConflict as readonly string[]).includes(e.type)),
    [events]);

  // Pulse animation state
  const [pulseOpacity, setPulseOpacity] = useState(1.0);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!pulseEnabled) {
      setPulseOpacity(1.0);
      return;
    }
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
  }, [pulseEnabled]);

  // Ship layer
  const shipLayer = useMemo(() => new IconLayer<ShipEntity>({
    id: 'ships',
    visible: showShips,
    data: ships,
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
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [ships, showShips, activeId]);

  // Airstrike layer
  const airstrikeLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'airstrikes',
    visible: showEvents && showAirstrikes,
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
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [airstrikeEvents, showEvents, showAirstrikes, activeId]);

  // Ground combat layer
  const groundCombatLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'groundCombat',
    visible: showEvents && showGroundCombat,
    data: groundCombatEvents,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'explosion',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.groundCombat.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.groundCombat.minPixels,
    sizeMaxPixels: ICON_SIZE.groundCombat.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.groundCombat;
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [groundCombatEvents, showEvents, showGroundCombat, activeId]);

  // Targeted layer
  const targetedLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'targeted',
    visible: showEvents && showTargeted,
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
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [targetedEvents, showEvents, showTargeted, activeId]);

  // Other conflict layer
  const otherConflictLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'otherConflict',
    visible: showEvents && showOtherConflict,
    data: otherConflictEvents,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'xmark',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.otherConflict.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.otherConflict.minPixels,
    sizeMaxPixels: ICON_SIZE.otherConflict.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.otherConflict;
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [otherConflictEvents, showEvents, showOtherConflict, activeId]);

  // Flight layer
  const showAnyFlights = showFlights || showGroundTraffic || pulseEnabled;
  const flightLayer = useMemo(() => new IconLayer<FlightEntity>({
    id: 'flights',
    visible: showAnyFlights,
    data: flights,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: FlightEntity) => d.data.onGround ? 'chevronGround' : 'chevron',
    getPosition: (d: FlightEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels,
    getAngle: (d: FlightEntity) => d.data.heading === null ? 0 : -d.data.heading,
    getColor: (d: FlightEntity) => {
      const [r, g, b] = d.data.unidentified
        ? ENTITY_COLORS.flightUnidentified
        : ENTITY_COLORS.flight;
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      const alpha = d.data.unidentified
        ? Math.round(pulseOpacity * 255)
        : Math.round(altitudeToOpacity(d.data.altitude) * 255);
      return [r, g, b, alpha];
    },
    billboard: false,
    pickable: true,
    updateTriggers: {
      getColor: [pulseOpacity, activeId],
    },
  }), [flights, pulseOpacity, showAnyFlights, activeId]);

  // Find active entity across all data sources
  const activeEntity = useMemo<MapEntity | null>(() => {
    if (!activeId) return null;
    return flights.find((f) => f.id === activeId)
      ?? ships.find((s) => s.id === activeId)
      ?? events.find((e) => e.id === activeId)
      ?? null;
  }, [activeId, flights, ships, events]);

  // Glow layer for active entity
  const glowLayer = useMemo(() => new IconLayer<MapEntity>({
    id: 'entity-glow',
    visible: !!activeEntity,
    data: activeEntity ? [activeEntity] : [],
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: MapEntity) => getIconForEntity(d),
    getPosition: (d: MapEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight.meters * 2.0,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels * 2.0,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels * 2.0,
    getAngle: (d: MapEntity) => getAngleForEntity(d),
    getColor: (d: MapEntity) => [...getColorForEntity(d), 60],
    billboard: false,
    pickable: false,
  }), [activeEntity]);

  // Highlight layer for active entity
  const highlightLayer = useMemo(() => new IconLayer<MapEntity>({
    id: 'entity-highlight',
    visible: !!activeEntity,
    data: activeEntity ? [activeEntity] : [],
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: (d: MapEntity) => getIconForEntity(d),
    getPosition: (d: MapEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.flight.meters * 1.2,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.flight.minPixels * 1.2,
    sizeMaxPixels: ICON_SIZE.flight.maxPixels * 1.2,
    getAngle: (d: MapEntity) => getAngleForEntity(d),
    getColor: (d: MapEntity) => [...getColorForEntity(d), 255],
    billboard: false,
    pickable: false,
  }), [activeEntity]);

  return [shipLayer, flightLayer, airstrikeLayer, groundCombatLayer, targetedLayer, otherConflictLayer, glowLayer, highlightLayer];
}
