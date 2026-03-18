import { renderHook, act } from '@testing-library/react';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSelectedEntity } from '@/hooks/useSelectedEntity';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

const mockFlight: FlightEntity = {
  id: 'flight-abc',
  type: 'flight',
  lat: 32.0,
  lng: 51.0,
  timestamp: Date.now(),
  label: 'QTR123',
  data: {
    icao24: 'abc123',
    callsign: 'QTR123',
    originCountry: 'Qatar',
    velocity: 250,
    heading: 90,
    altitude: 10000,
    onGround: false,
    verticalRate: 0,
    unidentified: false,
  },
};

const mockShip: ShipEntity = {
  id: 'ship-123',
  type: 'ship',
  lat: 26.0,
  lng: 56.0,
  timestamp: Date.now(),
  label: 'EVER GIVEN',
  data: {
    mmsi: 353136000,
    shipName: 'EVER GIVEN',
    speedOverGround: 12.5,
    courseOverGround: 180,
    trueHeading: 179,
  },
};

const mockEvent: ConflictEventEntity = {
  id: 'event-drone-1',
  type: 'drone',
  lat: 32.65,
  lng: 51.67,
  timestamp: Date.now(),
  label: 'Air/drone strike',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Air/drone strike',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'https://example.com',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '183',
  },
};

describe('useSelectedEntity', () => {
  beforeEach(() => {
    useUIStore.setState({ selectedEntityId: null });
    useFlightStore.setState({ flights: [] });
    useShipStore.setState({ ships: [] });
    useEventStore.setState({ events: [] });
  });

  it('returns null entity when no entity is selected', () => {
    const { result } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toBeNull();
    expect(result.current.isLost).toBe(false);
    expect(result.current.lastSeen).toBe(0);
  });

  it('finds a flight entity by ID across flightStore', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc' });

    const { result } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toEqual(mockFlight);
    expect(result.current.isLost).toBe(false);
    expect(result.current.lastSeen).toBeGreaterThan(0);
  });

  it('finds a ship entity by ID across shipStore', () => {
    useShipStore.setState({ ships: [mockShip] });
    useUIStore.setState({ selectedEntityId: 'ship-123' });

    const { result } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toEqual(mockShip);
    expect(result.current.isLost).toBe(false);
  });

  it('finds an event entity by ID across eventStore', () => {
    useEventStore.setState({ events: [mockEvent] });
    useUIStore.setState({ selectedEntityId: 'event-drone-1' });

    const { result } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toEqual(mockEvent);
    expect(result.current.isLost).toBe(false);
  });

  it('returns isLost=true with last-known entity data when entity disappears', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc' });

    const { result, rerender } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toEqual(mockFlight);
    expect(result.current.isLost).toBe(false);
    const seenTime = result.current.lastSeen;

    // Entity disappears from store
    act(() => {
      useFlightStore.setState({ flights: [] });
    });
    rerender();

    expect(result.current.entity).toEqual(mockFlight);
    expect(result.current.isLost).toBe(true);
    expect(result.current.lastSeen).toBe(seenTime);
  });

  it('resets lastKnown when selectedEntityId changes to null', () => {
    useFlightStore.setState({ flights: [mockFlight] });
    useUIStore.setState({ selectedEntityId: 'flight-abc' });

    const { result, rerender } = renderHook(() => useSelectedEntity());
    expect(result.current.entity).toEqual(mockFlight);

    act(() => {
      useUIStore.setState({ selectedEntityId: null });
    });
    rerender();

    expect(result.current.entity).toBeNull();
    expect(result.current.isLost).toBe(false);
    expect(result.current.lastSeen).toBe(0);
  });
});
