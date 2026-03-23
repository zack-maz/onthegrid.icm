import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useNewsStore } from '@/stores/newsStore';
import { useFilterStore } from '@/stores/filterStore';
import { entityPassesFilters } from '@/lib/filters';
import type { FlightEntity, ShipEntity, ConflictEventEntity, NewsCluster } from '@/types/entities';

/**
 * Returns flight, ship, event, and news cluster arrays filtered through the active filter predicates.
 * Date range filtering is always explicit via dateStart/dateEnd (no implicit 24h window).
 * Uses useShallow for the filter selector to avoid reference inequality re-renders.
 */
export function useFilteredEntities(): {
  flights: FlightEntity[];
  ships: ShipEntity[];
  events: ConflictEventEntity[];
  clusters: NewsCluster[];
} {
  const rawFlights = useFlightStore((s) => s.flights);
  const rawShips = useShipStore((s) => s.ships);
  const rawEvents = useEventStore((s) => s.events);
  const rawClusters = useNewsStore((s) => s.clusters);

  const filters = useFilterStore(
    useShallow((s) => ({
      flightCountries: s.flightCountries,
      eventCountries: s.eventCountries,
      flightSpeedMin: s.flightSpeedMin,
      flightSpeedMax: s.flightSpeedMax,
      altitudeMin: s.altitudeMin,
      altitudeMax: s.altitudeMax,
      proximityPin: s.proximityPin,
      proximityRadiusKm: s.proximityRadiusKm,
      dateStart: s.dateStart,
      dateEnd: s.dateEnd,
      flightCallsign: s.flightCallsign,
      flightIcao: s.flightIcao,
      shipMmsi: s.shipMmsi,
      shipNameFilter: s.shipNameFilter,
      cameoCode: s.cameoCode,
      mentionsMin: s.mentionsMin,
      mentionsMax: s.mentionsMax,
      headingAngle: s.headingAngle,
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

  const clusters = useMemo(
    () => rawClusters.filter((c) => c.lastUpdated >= filters.dateStart && c.lastUpdated <= filters.dateEnd),
    [rawClusters, filters.dateStart, filters.dateEnd],
  );

  return { flights, ships, events, clusters };
}
