import { useMemo, useRef } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { searchEntities, type SearchResult } from '@/lib/searchUtils';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';

const MAX_PER_TYPE = 10;

export interface GroupedSearchResults {
  flights: SearchResult<FlightEntity>[];
  ships: SearchResult<ShipEntity>[];
  events: SearchResult<ConflictEventEntity>[];
  sites: SearchResult<SiteEntity>[];
  totalCount: number;
}

/**
 * Cross-store entity search hook.
 * Reads query from searchStore and entities from all 4 entity stores.
 * Uses useRef to hold latest entity data so results only recompute when query changes
 * (not on every poll cycle -- per research Pitfall 2).
 */
export function useSearchResults(): GroupedSearchResults {
  const query = useSearchStore((s) => s.query);

  // Read entity arrays from stores
  const flights = useFlightStore((s) => s.flights);
  const ships = useShipStore((s) => s.ships);
  const events = useEventStore((s) => s.events);
  const sites = useSiteStore((s) => s.sites);

  // Keep latest entity refs to avoid recomputing on every poll
  const flightsRef = useRef(flights);
  const shipsRef = useRef(ships);
  const eventsRef = useRef(events);
  const sitesRef = useRef(sites);
  flightsRef.current = flights;
  shipsRef.current = ships;
  eventsRef.current = events;
  sitesRef.current = sites;

  return useMemo(() => {
    const f = searchEntities(query, flightsRef.current).slice(0, MAX_PER_TYPE);
    const sh = searchEntities(query, shipsRef.current).slice(0, MAX_PER_TYPE);
    const ev = searchEntities(query, eventsRef.current).slice(0, MAX_PER_TYPE);
    const si = searchEntities(query, sitesRef.current).slice(0, MAX_PER_TYPE);

    return {
      flights: f,
      ships: sh,
      events: ev,
      sites: si,
      totalCount: f.length + sh.length + ev.length + si.length,
    };
  }, [query]);
}
