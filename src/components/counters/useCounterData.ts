import { useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { CONFLICT_TOGGLE_GROUPS } from '@/types/ui';
import type { FlightEntity, ConflictEventEntity } from '@/types/entities';

export interface CounterValues {
  iranianFlights: number;
  unidentifiedFlights: number;
  airstrikes: number;
  groundCombat: number;
  targeted: number;
  fatalities: number;
}

const AIRSTRIKE_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showAirstrikes;
const GROUND_COMBAT_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showGroundCombat;
const TARGETED_TYPES: readonly string[] = CONFLICT_TOGGLE_GROUPS.showTargeted;

function countByGroup(events: ConflictEventEntity[], types: readonly string[]): number {
  return events.filter((e) => types.includes(e.type)).length;
}

function sumFatalitiesByGroup(events: ConflictEventEntity[], types: readonly string[]): number {
  return events
    .filter((e) => types.includes(e.type))
    .reduce((sum, e) => sum + e.data.fatalities, 0);
}

export function useCounterData(): CounterValues {
  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);

  const { flights: filteredFlights, events: filteredEvents } = useFilteredEntities();

  return useMemo(() => {
    // Visible flights: smart filters + toggle gating (matches useEntityLayers logic)
    const visibleFlights = filteredFlights.filter((f: FlightEntity) => {
      if (f.data.unidentified) return pulseEnabled;
      if (f.data.onGround) return showGroundTraffic;
      return showFlights;
    });

    const iranianFlights = visibleFlights.filter((f: FlightEntity) => f.data.originCountry === 'Iran').length;
    const unidentifiedFlights = visibleFlights.filter((f: FlightEntity) => f.data.unidentified).length;

    // Visible event counts: smart filters + toggle gating
    const airstrikes = showEvents && showAirstrikes
      ? countByGroup(filteredEvents, AIRSTRIKE_TYPES)
      : 0;
    const groundCombat = showEvents && showGroundCombat
      ? countByGroup(filteredEvents, GROUND_COMBAT_TYPES)
      : 0;
    const targeted = showEvents && showTargeted
      ? countByGroup(filteredEvents, TARGETED_TYPES)
      : 0;

    // Fatalities from visible events only
    let fatalities = 0;
    if (showEvents && showAirstrikes) {
      fatalities += sumFatalitiesByGroup(filteredEvents, AIRSTRIKE_TYPES);
    }
    if (showEvents && showGroundCombat) {
      fatalities += sumFatalitiesByGroup(filteredEvents, GROUND_COMBAT_TYPES);
    }
    if (showEvents && showTargeted) {
      fatalities += sumFatalitiesByGroup(filteredEvents, TARGETED_TYPES);
    }

    return { iranianFlights, unidentifiedFlights, airstrikes, groundCombat, targeted, fatalities };
  }, [filteredFlights, filteredEvents, showFlights, showGroundTraffic, pulseEnabled, showEvents, showAirstrikes, showGroundCombat, showTargeted]);
}
