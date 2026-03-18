import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { entityPassesFilters } from '@/lib/filters';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

/**
 * Returns flight, ship, and event arrays filtered through the active filter predicates.
 * Consumes raw store data and applies entityPassesFilters using current filter state.
 * Uses useShallow for the filter selector to avoid reference inequality re-renders.
 */
export function useFilteredEntities(): {
  flights: FlightEntity[];
  ships: ShipEntity[];
  events: ConflictEventEntity[];
} {
  const rawFlights = useFlightStore((s) => s.flights);
  const rawShips = useShipStore((s) => s.ships);
  const rawEvents = useEventStore((s) => s.events);

  const filters = useFilterStore(
    useShallow((s) => ({
      selectedCountries: s.selectedCountries,
      speedMin: s.speedMin,
      speedMax: s.speedMax,
      altitudeMin: s.altitudeMin,
      altitudeMax: s.altitudeMax,
      proximityPin: s.proximityPin,
      proximityRadiusKm: s.proximityRadiusKm,
      dateStart: s.dateStart,
      dateEnd: s.dateEnd,
    })),
  );

  const flights = useMemo(
    () => rawFlights.filter((e) => entityPassesFilters(e, filters as Parameters<typeof entityPassesFilters>[1])),
    [rawFlights, filters],
  );

  const ships = useMemo(
    () => rawShips.filter((e) => entityPassesFilters(e, filters as Parameters<typeof entityPassesFilters>[1])),
    [rawShips, filters],
  );

  const events = useMemo(
    () => rawEvents.filter((e) => entityPassesFilters(e, filters as Parameters<typeof entityPassesFilters>[1])),
    [rawEvents, filters],
  );

  return { flights, ships, events };
}
