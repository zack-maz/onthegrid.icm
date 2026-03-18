import { useMemo, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import type { MapEntity } from '@/types/entities';

export interface SelectedEntityResult {
  entity: MapEntity | null;
  isLost: boolean;
  lastSeen: number;
}

interface LastKnown {
  entity: MapEntity;
  lastSeen: number;
}

export function useSelectedEntity(): SelectedEntityResult {
  const selectedId = useUIStore((s) => s.selectedEntityId);
  const flights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);

  const lastKnownRef = useRef<LastKnown | null>(null);

  return useMemo(() => {
    // When selection is cleared, reset everything
    if (selectedId === null) {
      lastKnownRef.current = null;
      return { entity: null, isLost: false, lastSeen: 0 };
    }

    // Search across all stores
    const found =
      flights.find((f) => f.id === selectedId) ??
      ships.find((s) => s.id === selectedId) ??
      events.find((e) => e.id === selectedId) ??
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
  }, [selectedId, flights, ships, events]);
}
