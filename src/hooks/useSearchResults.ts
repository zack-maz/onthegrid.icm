import { useMemo, useRef, useEffect } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { evaluateQuery, type EvaluationContext } from '@/lib/queryEvaluator';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';

const MAX_PER_TYPE = 10;

export interface SearchResult<T> {
  entity: T;
  matchField: string;
  matchValue: string;
}

export interface GroupedSearchResults {
  flights: SearchResult<FlightEntity>[];
  ships: SearchResult<ShipEntity>[];
  events: SearchResult<ConflictEventEntity>[];
  sites: SearchResult<SiteEntity>[];
  totalCount: number;
}

/**
 * Cross-store entity search hook.
 * Reads parsedQuery AST from searchStore and entities from all 4 entity stores.
 * Uses evaluateQuery for tag-based and freetext matching.
 * Uses useRef to hold latest entity data so results only recompute when query changes
 * (not on every poll cycle -- per research Pitfall 2).
 */
export function useSearchResults(): GroupedSearchResults {
  const query = useSearchStore((s) => s.query);
  const parsedQuery = useSearchStore((s) => s.parsedQuery);

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

  // When filter mode is active and entity data changes, re-compute matchedIds
  // so newly arrived/departed entities are correctly dimmed (Pitfall 4 fix)
  const isFilterMode = useSearchStore((s) => s.isFilterMode);

  useEffect(() => {
    if (!isFilterMode || !parsedQuery) return;

    const ctx: EvaluationContext = {
      sites,
      events,
      now: Date.now(),
    };

    const ids = new Set<string>();
    for (const f of flights) {
      if (evaluateQuery(parsedQuery, f, ctx)) ids.add(f.id);
    }
    for (const s of ships) {
      if (evaluateQuery(parsedQuery, s, ctx)) ids.add(s.id);
    }
    for (const e of events) {
      if (evaluateQuery(parsedQuery, e, ctx)) ids.add(e.id);
    }
    for (const si of sites) {
      if (evaluateQuery(parsedQuery, si, ctx)) ids.add(si.id);
    }

    // Only update if changed to avoid needless Set creation
    const current = useSearchStore.getState().matchedIds;
    if (ids.size !== current.size || [...ids].some((id) => !current.has(id))) {
      useSearchStore.getState().setMatchedIds(ids);
    }
  }, [isFilterMode, parsedQuery, flights, ships, events, sites]);

  return useMemo(() => {
    if (!query.trim() || !parsedQuery) {
      return { flights: [], ships: [], events: [], sites: [], totalCount: 0 };
    }

    const ctx: EvaluationContext = {
      sites: sitesRef.current,
      events: eventsRef.current,
      now: Date.now(),
    };

    const matchEntity = <T extends { type: string; label: string }>(entity: T): SearchResult<T> | null => {
      if (evaluateQuery(parsedQuery, entity as any, ctx)) {
        return {
          entity,
          matchField: 'match',
          matchValue: entity.label ?? entity.type,
        };
      }
      return null;
    };

    const f: SearchResult<FlightEntity>[] = [];
    for (const fl of flightsRef.current) {
      if (f.length >= MAX_PER_TYPE) break;
      const r = matchEntity(fl);
      if (r) f.push(r);
    }

    const sh: SearchResult<ShipEntity>[] = [];
    for (const s of shipsRef.current) {
      if (sh.length >= MAX_PER_TYPE) break;
      const r = matchEntity(s);
      if (r) sh.push(r);
    }

    const ev: SearchResult<ConflictEventEntity>[] = [];
    for (const e of eventsRef.current) {
      if (ev.length >= MAX_PER_TYPE) break;
      const r = matchEntity(e);
      if (r) ev.push(r);
    }

    const si: SearchResult<SiteEntity>[] = [];
    for (const s of sitesRef.current) {
      if (si.length >= MAX_PER_TYPE) break;
      const r = matchEntity(s);
      if (r) si.push(r);
    }

    return {
      flights: f,
      ships: sh,
      events: ev,
      sites: si,
      totalCount: f.length + sh.length + ev.length + si.length,
    };
  }, [query, parsedQuery]);
}
