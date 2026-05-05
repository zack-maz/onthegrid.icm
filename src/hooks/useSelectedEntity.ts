import { useMemo, useRef } from 'react';

import { useEventStore } from '@/stores/eventStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import type { MapEntity, SiteEntity } from '@/types/entities';

import type { WaterFacility } from '../../server/types';

export interface SelectedEntityResult {
  entity: MapEntity | SiteEntity | WaterFacility | null;
  isLost: boolean;
  lastSeen: number;
}

interface LastKnown {
  entity: MapEntity | SiteEntity | WaterFacility;
  lastSeen: number;
}

export function useSelectedEntity(): SelectedEntityResult {
  const selectedId = useUIStore((s) => s.selectedEntityId);
  const flights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);
  const sites = useSiteStore((s) => s.sites);
  const waterFacilities = useWaterStore((s) => s.facilities);

  const lastKnownRef = useRef<LastKnown | null>(null);

  return useMemo(() => {
    // When selection is cleared, reset everything
    if (selectedId === null) {
      lastKnownRef.current = null;
      return { entity: null, isLost: false, lastSeen: 0 };
    }

    // Search across all stores (including water facilities)
    const found =
      flights.find((f) => f.id === selectedId) ??
      ships.find((s) => s.id === selectedId) ??
      events.find((e) => e.id === selectedId) ??
      sites.find((s) => s.id === selectedId) ??
      waterFacilities.find((w) => w.id === selectedId) ??
      null;

    if (found) {
      const now = Date.now();
      lastKnownRef.current = { entity: found, lastSeen: now };
      return { entity: found, isLost: false, lastSeen: now };
    }

    // Entity not found but we have last-known data
    if (lastKnownRef.current) {
      return {
        entity: lastKnownRef.current.entity,
        isLost: true,
        lastSeen: lastKnownRef.current.lastSeen,
      };
    }

    // No entity found and no last-known (shouldn't normally happen)
    return { entity: null, isLost: false, lastSeen: 0 };
  }, [selectedId, flights, ships, events, sites, waterFacilities]);
}
