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
import type { MapEntity, FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

const DIM_ALPHA = 80;

function getIconForEntity(entity: MapEntity): string {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.onGround ? 'chevronGround' : 'chevron';
    case 'ship': return 'chevron';
    case 'drone': return 'starburst';
    case 'missile': return 'xmark';
  }
}

function getColorForEntity(entity: MapEntity): [number, number, number] {
  switch (entity.type) {
    case 'flight': return (entity as FlightEntity).data.unidentified
      ? [...ENTITY_COLORS.flightUnidentified] : [...ENTITY_COLORS.flight];
    case 'ship': return [...ENTITY_COLORS.ship];
    case 'drone': return [...ENTITY_COLORS.drone];
    case 'missile': return [...ENTITY_COLORS.missile];
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
  const showDrones = useUIStore((s) => s.showDrones);
  const showMissiles = useUIStore((s) => s.showMissiles);
  const selectedEntityId = useUIStore((s) => s.selectedEntityId);
  const hoveredEntityId = useUIStore((s) => s.hoveredEntityId);

  // Active entity = hovered (preview) or selected (pinned)
  const activeId = hoveredEntityId ?? selectedEntityId;

  const flights = useMemo(() => {
    if (showFlights && showGroundTraffic) return allFlights;
    if (showFlights && !showGroundTraffic) return allFlights.filter((f) => !f.data.onGround);
    if (!showFlights && showGroundTraffic) return allFlights.filter((f) => f.data.onGround);
    return [];
  }, [allFlights, showFlights, showGroundTraffic]);

  const drones = useMemo(() => events.filter((e) => e.type === 'drone'), [events]);
  const missiles = useMemo(() => events.filter((e) => e.type === 'missile'), [events]);

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

  // Drone layer
  const droneLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'drones',
    visible: showDrones,
    data: drones,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'starburst',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.drone.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.drone.minPixels,
    sizeMaxPixels: ICON_SIZE.drone.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.drone;
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [drones, showDrones, activeId]);

  // Missile layer
  const missileLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'missiles',
    visible: showMissiles,
    data: missiles,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'xmark',
    getPosition: (d: ConflictEventEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.missile.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.missile.minPixels,
    sizeMaxPixels: ICON_SIZE.missile.maxPixels,
    getAngle: () => 0,
    getColor: (d: ConflictEventEntity) => {
      const [r, g, b] = ENTITY_COLORS.missile;
      if (activeId && d.id !== activeId) return [r, g, b, DIM_ALPHA];
      return [r, g, b, 255];
    },
    billboard: false,
    pickable: true,
    updateTriggers: { getColor: [activeId] },
  }), [missiles, showMissiles, activeId]);

  // Flight layer
  const showAnyFlights = showFlights || showGroundTraffic;
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

  return [shipLayer, flightLayer, droneLayer, missileLayer, glowLayer, highlightLayer];
}
