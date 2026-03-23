import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useFilterStore } from '@/stores/filterStore';
import { useCounterData } from '@/components/counters/useCounterData';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';
import type { ConflictEventType } from '@/types/ui';

function makeFlight(id: string, country: string, unidentified = false, onGround = false, lat = 32, lng = 51): FlightEntity {
  return {
    id, type: 'flight', lat, lng, timestamp: Date.now(), label: id,
    data: { icao24: id, callsign: unidentified ? '' : id, originCountry: country, velocity: 250, heading: 45, altitude: 10000, onGround, verticalRate: 0, unidentified },
  };
}

function makeShip(id: string, name: string, speed = 10, lat = 26, lng = 56): ShipEntity {
  return {
    id, type: 'ship', lat, lng, timestamp: Date.now(), label: name,
    data: { mmsi: parseInt(id.replace(/\D/g, '') || '0'), shipName: name, speedOverGround: speed, courseOverGround: 180, trueHeading: 180 },
  };
}

function makeEvent(id: string, type: ConflictEventType, fatalities = 0, lat = 32, lng = 51, goldsteinScale = -5): ConflictEventEntity {
  return {
    id, type, lat, lng, timestamp: Date.now(), label: id,
    data: { eventType: '', subEventType: '', fatalities, actor1: '', actor2: '', notes: '', source: '', goldsteinScale, locationName: '', cameoCode: '' },
  };
}

function makeSite(id: string, siteType: SiteEntity['siteType'], label: string, lat = 32, lng = 51): SiteEntity {
  return { id, type: 'site', siteType, lat, lng, label, operator: '', osmId: parseInt(id.replace(/\D/g, '') || '0') };
}

describe('useCounterData', () => {
  beforeEach(() => {
    useFlightStore.setState({ flights: [], flightCount: 0, connectionStatus: 'connected' });
    useEventStore.setState({ events: [], eventCount: 0, connectionStatus: 'connected' });
    useShipStore.setState({ ships: [], shipCount: 0, connectionStatus: 'connected' });
    useFilterStore.setState({
      flightCountries: [],
      eventCountries: [],
      flightSpeedMin: null,
      flightSpeedMax: null,
      shipSpeedMin: null,
      shipSpeedMax: null,
      altitudeMin: null,
      altitudeMax: null,
      proximityPin: null,
      proximityRadiusKm: 100,
      dateStart: 0,
      dateEnd: Date.now() + 86400000,
      isSettingPin: false,
    });
  });

  it('returns zero counts with empty stores', () => {
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(0);
    expect(result.current.airstrikes).toBe(0);
    expect(result.current.groundCombat).toBe(0);
    expect(result.current.targeted).toBe(0);
  });

  it('counts all Iranian flights', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran'),
        makeFlight('f2', 'Iran'),
        makeFlight('f3', 'Qatar'),
      ],
      flightCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(2);
  });

  it('counts all flights including unidentified and ground', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Unknown', true),
        makeFlight('f2', 'Iran', false),
        makeFlight('f3', 'Unknown', true),
        makeFlight('f4', 'Iran', false, true), // on ground
      ],
      flightCount: 4,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.totalFlights).toBe(4);
  });

  it('computes event counts matching CONFLICT_TOGGLE_GROUPS', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike'),
        makeEvent('a2', 'airstrike'),
        makeEvent('gc1', 'ground_combat'),
        makeEvent('sh1', 'shelling'),
        makeEvent('t1', 'assassination'),
        makeEvent('bl1', 'blockade'),
      ],
      eventCount: 6,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.airstrikes).toBe(2);
    expect(result.current.groundCombat).toBe(3); // ground_combat + shelling + blockade
    expect(result.current.targeted).toBe(1);
  });

  it('flight counters respect smart filters', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran'),
        makeFlight('f2', 'Qatar'),
      ],
      flightCount: 2,
    });
    // Country filter narrows visible flights
    useFilterStore.setState({ flightCountries: ['Qatar'] });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(0); // Iran filtered out
  });

  // --- Entity array tests ---

  it('returns entities object alongside counts', () => {
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities).toBeDefined();
    expect(result.current.entities.flights).toEqual([]);
    expect(result.current.entities.ships).toEqual([]);
    expect(result.current.entities.airstrikeEvents).toEqual([]);
    expect(result.current.entities.groundCombatEvents).toEqual([]);
    expect(result.current.entities.targetedEvents).toEqual([]);
    expect(result.current.entities.sites).toBeDefined();
  });

  it('totalFlights counts all flights including unidentified', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran', false),
        makeFlight('f2', 'Qatar', false),
        makeFlight('f3', 'Unknown', true),
      ],
      flightCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.totalFlights).toBe(3);
    expect(result.current.entities.flights).toHaveLength(3);
  });

  it('entities.ships contains ShipEntity[] from useFilteredEntities', () => {
    useShipStore.setState({
      ships: [makeShip('s1', 'Vessel One'), makeShip('s2', 'Vessel Two')],
      shipCount: 2,
      connectionStatus: 'connected',
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.ships).toHaveLength(2);
    expect(result.current.entities.ships[0].label).toBe('Vessel One');
  });

  it('entities.airstrikeEvents contains events filtered by AIRSTRIKE_TYPES', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike'),
        makeEvent('gc1', 'ground_combat'),
        makeEvent('a2', 'airstrike'),
      ],
      eventCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.airstrikeEvents).toHaveLength(2);
  });

  it('entities.groundCombatEvents contains events filtered by GROUND_COMBAT_TYPES', () => {
    useEventStore.setState({
      events: [
        makeEvent('gc1', 'ground_combat'),
        makeEvent('sh1', 'shelling'),
        makeEvent('bm1', 'bombing'),
        makeEvent('a1', 'airstrike'),
      ],
      eventCount: 4,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.groundCombatEvents).toHaveLength(3);
  });

  it('entities.targetedEvents contains events filtered by TARGETED_TYPES', () => {
    useEventStore.setState({
      events: [
        makeEvent('t1', 'assassination'),
        makeEvent('t2', 'abduction'),
        makeEvent('a1', 'airstrike'),
      ],
      eventCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.targetedEvents).toHaveLength(2);
  });

  it('flight entities sorted by distance from Tehran (closest first)', () => {
    // Tehran: 35.69, 51.39
    // f1 is closer to Tehran (~0 km), f2 farther (~800 km)
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran', false, false, 28, 60), // farther from Tehran
        makeFlight('f2', 'Iran', false, false, 35.5, 51.5), // closer to Tehran
      ],
      flightCount: 2,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.flights[0].id).toBe('f2'); // closer
    expect(result.current.entities.flights[1].id).toBe('f1'); // farther
  });

  it('event entities sorted by distance from Tehran (closest first)', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike', 0, 28, 60), // farther from Tehran
        makeEvent('a2', 'airstrike', 0, 35.5, 51.5), // closer to Tehran
      ],
      eventCount: 2,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.airstrikeEvents[0].id).toBe('a2'); // closer
    expect(result.current.entities.airstrikeEvents[1].id).toBe('a1'); // farther
  });

  it('ship entities sorted by distance from Strait of Hormuz (closest first)', () => {
    // Strait of Hormuz: 26.56, 56.25
    useShipStore.setState({
      ships: [
        makeShip('s1', 'Far Ship', 10, 20, 40), // farther
        makeShip('s2', 'Close Ship', 10, 26.5, 56.2), // closer
      ],
      shipCount: 2,
      connectionStatus: 'connected',
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.entities.ships[0].id).toBe('s2'); // closer
    expect(result.current.entities.ships[1].id).toBe('s1'); // farther
  });

  it('hit sites sorted by attackCount descending', () => {
    // Sites must be far apart (>10km) so events only match one site each
    const sites: SiteEntity[] = [
      makeSite('site-1', 'nuclear', 'Nuclear Plant A', 32, 51),
      makeSite('site-2', 'nuclear', 'Nuclear Plant B', 33, 52),
    ];
    useSiteStore.setState({ sites, connectionStatus: 'connected' });
    // Create multiple attacks near site-2 (33, 52) and one near site-1 (32, 51)
    useEventStore.setState({
      events: [
        makeEvent('e1', 'airstrike', 0, 33.001, 52.001),      // near site-2 only
        makeEvent('e2', 'ground_combat', 0, 33.002, 52.002),   // near site-2 only
        makeEvent('e3', 'airstrike', 0, 32.001, 51.001),       // near site-1 only
      ],
      eventCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    const nuclearSites = result.current.entities.sites.nuclear;
    expect(nuclearSites).toHaveLength(2);
    // Site-2 has 2 attacks, site-1 has 1 attack -- sorted descending
    expect(nuclearSites[0].label).toBe('Nuclear Plant B'); // 2 attacks
    expect(nuclearSites[1].label).toBe('Nuclear Plant A'); // 1 attack
  });
});
