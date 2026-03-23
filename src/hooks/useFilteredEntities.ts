import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useNewsStore } from '@/stores/newsStore';
import { useFilterStore } from '@/stores/filterStore';
import { entityPassesFilters } from '@/lib/filters';
import type { FlightEntity, ShipEntity, ConflictEventEntity, NewsCluster } from '@/types/entities';

/** 24 hours in milliseconds */
export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Returns flight, ship, event, and news cluster arrays filtered through the active filter predicates.
 * When no custom date range is active (isDefaultWindowActive), events and news clusters
 * are filtered to the last 24 hours. Flights and ships are never affected by this default window.
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
  const isDefaultWindowActive = useFilterStore((s) => s.isDefaultWindowActive)();

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

  const events = useMemo(() => {
    let filtered = rawEvents.filter((e) => entityPassesFilters(e, filters as Parameters<typeof entityPassesFilters>[1]));
    if (isDefaultWindowActive) {
      const cutoff = Date.now() - DEFAULT_WINDOW_MS;
      filtered = filtered.filter((e) => e.timestamp >= cutoff);
    }
    return filtered;
  }, [rawEvents, filters, isDefaultWindowActive]);

  const clusters = useMemo(() => {
    if (isDefaultWindowActive) {
      const cutoff = Date.now() - DEFAULT_WINDOW_MS;
      return rawClusters.filter((c) => c.lastUpdated >= cutoff);
    }
    return rawClusters;
  }, [rawClusters, isDefaultWindowActive]);

  return { flights, ships, events, clusters };
}
