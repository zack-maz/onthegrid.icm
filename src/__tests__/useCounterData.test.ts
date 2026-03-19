import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFlightStore } from '@/stores/flightStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useCounterData } from '@/components/counters/useCounterData';
import type { FlightEntity, ConflictEventEntity } from '@/types/entities';
import type { ConflictEventType } from '@/types/ui';

function makeFlight(id: string, country: string, unidentified = false, onGround = false): FlightEntity {
  return {
    id, type: 'flight', lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { icao24: id, callsign: id, originCountry: country, velocity: 250, heading: 45, altitude: 10000, onGround, verticalRate: 0, unidentified },
  };
}

function makeEvent(id: string, type: ConflictEventType, fatalities = 0): ConflictEventEntity {
  return {
    id, type, lat: 32, lng: 51, timestamp: Date.now(), label: id,
    data: { eventType: '', subEventType: '', fatalities, actor1: '', actor2: '', notes: '', source: '', goldsteinScale: 0, locationName: '', cameoCode: '' },
  };
}

describe('useCounterData', () => {
  beforeEach(() => {
    useFlightStore.setState({ flights: [], flightCount: 0, connectionStatus: 'connected' });
    useEventStore.setState({ events: [], eventCount: 0, connectionStatus: 'connected' });
    useUIStore.setState({
      showEvents: true,
      showAirstrikes: true,
      showGroundCombat: true,
      showTargeted: true,
      showFlights: true,
      showShips: true,
      showGroundTraffic: false,
      pulseEnabled: true,
    });
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
      dateStart: null,
      dateEnd: null,
      isSettingPin: false,
    });
  });

  it('returns zero counts with empty stores', () => {
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(0);
    expect(result.current.unidentifiedFlights).toBe(0);
    expect(result.current.airstrikes).toBe(0);
    expect(result.current.groundCombat).toBe(0);
    expect(result.current.targeted).toBe(0);
    expect(result.current.fatalities).toBe(0);
  });

  it('counts visible Iranian flights (airborne + showFlights on)', () => {
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

  it('counts visible unidentified flights (pulseEnabled on)', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Unknown', true),
        makeFlight('f2', 'Iran', false),
        makeFlight('f3', 'Unknown', true),
      ],
      flightCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.unidentifiedFlights).toBe(2);
  });

  it('unidentified flights hidden when pulseEnabled is false', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Unknown', true),
        makeFlight('f2', 'Iran', false),
      ],
      flightCount: 2,
    });
    useUIStore.setState({ pulseEnabled: false });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.unidentifiedFlights).toBe(0);
  });

  it('ground flights only counted when showGroundTraffic is on', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran', false, true), // on ground
        makeFlight('f2', 'Iran', false, false), // airborne
      ],
      flightCount: 2,
    });
    // showGroundTraffic defaults to false
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(1); // only airborne
  });

  it('Iranian flights hidden when showFlights is false (non-ground, non-unidentified)', () => {
    useFlightStore.setState({
      flights: [
        makeFlight('f1', 'Iran'),
        makeFlight('f2', 'Qatar'),
      ],
      flightCount: 2,
    });
    useUIStore.setState({ showFlights: false });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.iranianFlights).toBe(0);
  });

  it('computes visible event counts matching CONFLICT_TOGGLE_GROUPS', () => {
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

  it('event counts are 0 when their toggle is off', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike'),
        makeEvent('gc1', 'ground_combat'),
        makeEvent('t1', 'assassination'),
      ],
      eventCount: 3,
    });
    useUIStore.setState({ showAirstrikes: false });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.airstrikes).toBe(0);
    expect(result.current.groundCombat).toBe(1);
    expect(result.current.targeted).toBe(1);
  });

  it('all event counts are 0 when showEvents is false', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike'),
        makeEvent('gc1', 'ground_combat'),
        makeEvent('t1', 'assassination'),
      ],
      eventCount: 3,
    });
    useUIStore.setState({ showEvents: false });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.airstrikes).toBe(0);
    expect(result.current.groundCombat).toBe(0);
    expect(result.current.targeted).toBe(0);
    expect(result.current.fatalities).toBe(0);
  });

  it('fatalities sum from visible events only', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike', 5),
        makeEvent('gc1', 'ground_combat', 10),
        makeEvent('t1', 'assassination', 1),
      ],
      eventCount: 3,
    });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.fatalities).toBe(16);
  });

  it('fatalities respect toggle gating', () => {
    useEventStore.setState({
      events: [
        makeEvent('a1', 'airstrike', 5),
        makeEvent('gc1', 'ground_combat', 10),
        makeEvent('t1', 'assassination', 1),
      ],
      eventCount: 3,
    });
    useUIStore.setState({ showGroundCombat: false });
    const { result } = renderHook(() => useCounterData());
    expect(result.current.fatalities).toBe(6); // 5 (airstrike) + 1 (assassination)
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
});
