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
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

/**
 * Returns Deck.gl IconLayer array driven by Zustand store data.
 * Includes pulse animation for unidentified flights, throttled to ~15fps.
 */
export function useEntityLayers() {
  const allFlights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);

  const flights = useMemo(
    () => showGroundTraffic ? allFlights : allFlights.filter((f) => !f.data.onGround),
    [allFlights, showGroundTraffic],
  );

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
      // Throttle to ~15fps (every ~67ms)
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

  // Ship layer (updates with ship store data)
  const shipLayer = useMemo(() => new IconLayer<ShipEntity>({
    id: 'ships',
    data: ships,
    iconAtlas: getIconAtlas(),
    iconMapping: ICON_MAPPING,
    getIcon: () => 'diamond',
    getPosition: (d: ShipEntity) => [d.lng, d.lat],
    getSize: ICON_SIZE.ship.meters,
    sizeUnits: 'meters' as const,
    sizeMinPixels: ICON_SIZE.ship.minPixels,
    sizeMaxPixels: ICON_SIZE.ship.maxPixels,
    getAngle: (d: ShipEntity) => -(d.data.courseOverGround ?? 0),
    getColor: () => [...ENTITY_COLORS.ship, 255],
    billboard: false,
  }), [ships]);

  // Drone layer (filtered from event store)
  const droneLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'drones',
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
    getColor: () => [...ENTITY_COLORS.drone, 255],
    billboard: false,
  }), [drones]);

  // Missile layer (filtered from event store)
  const missileLayer = useMemo(() => new IconLayer<ConflictEventEntity>({
    id: 'missiles',
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
    getColor: () => [...ENTITY_COLORS.missile, 255],
    billboard: false,
  }), [missiles]);

  // Flight layer (updates with flight data and pulse opacity)
  const flightLayer = useMemo(() => {
    return new IconLayer<FlightEntity>({
      id: 'flights',
      data: flights,
      iconAtlas: getIconAtlas(),
      iconMapping: ICON_MAPPING,
      getIcon: () => 'chevron',
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
        const alpha = d.data.unidentified
          ? Math.round(pulseOpacity * 255)
          : Math.round(altitudeToOpacity(d.data.altitude) * 255);
        return [r, g, b, alpha];
      },
      billboard: false,
      updateTriggers: {
        getColor: [pulseOpacity],
      },
    });
  }, [flights, pulseOpacity]);

  // Return layers bottom to top: ships, flights, drones, missiles
  return [shipLayer, flightLayer, droneLayer, missileLayer];
}
