import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { altitudeToOpacity, ENTITY_COLORS, ICON_SIZE, PULSE_CONFIG } from '@/components/map/layers/constants';
import { ICON_MAPPING } from '@/components/map/layers/icons';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useEntityLayers } from '@/hooks/useEntityLayers';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';
import type { IconLayer } from '@deck.gl/layers';

describe('Entity Layer Constants', () => {
  describe('altitudeToOpacity', () => {
    it('returns 0.6 for null altitude', () => {
      expect(altitudeToOpacity(null)).toBe(0.6);
    });

    it('returns 0.6 for altitude 0', () => {
      expect(altitudeToOpacity(0)).toBe(0.6);
    });

    it('returns 1.0 for altitude at ceiling (13000m)', () => {
      expect(altitudeToOpacity(13000)).toBe(1.0);
    });

    it('returns ~0.8 for midpoint altitude (6500m)', () => {
      const result = altitudeToOpacity(6500);
      expect(result).toBeCloseTo(0.8, 1);
    });

    it('clamps to 1.0 for altitude above ceiling', () => {
      expect(altitudeToOpacity(20000)).toBe(1.0);
    });
  });

  describe('ENTITY_COLORS', () => {
    it('flight is green [34, 197, 94]', () => {
      expect(ENTITY_COLORS.flight).toEqual([34, 197, 94]);
    });

    it('flightUnidentified is yellow [234, 179, 8]', () => {
      expect(ENTITY_COLORS.flightUnidentified).toEqual([234, 179, 8]);
    });

    it('ship is blue [59, 130, 246]', () => {
      expect(ENTITY_COLORS.ship).toEqual([59, 130, 246]);
    });

    it('drone is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.drone).toEqual([239, 68, 68]);
    });

    it('missile is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.missile).toEqual([239, 68, 68]);
    });
  });

  describe('ICON_SIZE', () => {
    it('flight has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.flight).toEqual({ meters: 2400, minPixels: 15, maxPixels: 96 });
    });

    it('ship has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.ship).toEqual({ meters: 1800, minPixels: 12, maxPixels: 84 });
    });

    it('drone has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.drone).toEqual({ meters: 2400, minPixels: 15, maxPixels: 96 });
    });

    it('missile has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.missile).toEqual({ meters: 2400, minPixels: 15, maxPixels: 96 });
    });
  });

  describe('PULSE_CONFIG', () => {
    it('has correct pulse configuration', () => {
      expect(PULSE_CONFIG.minOpacity).toBe(0.7);
      expect(PULSE_CONFIG.maxOpacity).toBe(1.0);
      expect(PULSE_CONFIG.periodMs).toBe(2000);
    });
  });
});

describe('Icon Mapping', () => {
  const expectedKeys = ['chevron', 'diamond', 'starburst', 'xmark'] as const;

  it('has all 4 icon keys', () => {
    expect(Object.keys(ICON_MAPPING).sort()).toEqual([...expectedKeys].sort());
  });

  for (const key of expectedKeys) {
    it(`${key} has mask: true`, () => {
      expect(ICON_MAPPING[key].mask).toBe(true);
    });

    it(`${key} has x, y, width, height properties`, () => {
      const entry = ICON_MAPPING[key];
      expect(entry).toHaveProperty('x');
      expect(entry).toHaveProperty('y');
      expect(entry).toHaveProperty('width', 32);
      expect(entry).toHaveProperty('height', 32);
    });
  }
});

describe('uiStore pulseEnabled', () => {
  beforeEach(() => {
    useUIStore.setState({
      isDetailPanelOpen: false,
      isCountersCollapsed: false,
      isFiltersExpanded: false,
      pulseEnabled: true,
    });
  });

  it('defaults pulseEnabled to true', () => {
    expect(useUIStore.getState().pulseEnabled).toBe(true);
  });

  it('togglePulse flips pulseEnabled', () => {
    expect(useUIStore.getState().pulseEnabled).toBe(true);
    useUIStore.getState().togglePulse();
    expect(useUIStore.getState().pulseEnabled).toBe(false);
    useUIStore.getState().togglePulse();
    expect(useUIStore.getState().pulseEnabled).toBe(true);
  });
});

// --- Task 2: useEntityLayers hook tests ---

const mockShip: ShipEntity = {
  id: 'ship-123456789',
  type: 'ship',
  lat: 26.0,
  lng: 56.0,
  timestamp: Date.now(),
  label: 'VESSEL ONE',
  data: {
    mmsi: 123456789,
    shipName: 'VESSEL ONE',
    speedOverGround: 12.5,
    courseOverGround: 180,
    trueHeading: 178,
  },
};

const mockDroneEvent: ConflictEventEntity = {
  id: 'event-IRN001',
  type: 'drone',
  lat: 32.6546,
  lng: 51.668,
  timestamp: Date.now(),
  label: 'Air/drone strike',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Air/drone strike',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'ISNA',
  },
};

const mockMissileEvent: ConflictEventEntity = {
  id: 'event-IRN002',
  type: 'missile',
  lat: 35.6892,
  lng: 51.389,
  timestamp: Date.now(),
  label: 'Shelling/artillery/missile attack',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Shelling/artillery/missile attack',
    fatalities: 3,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'Reuters',
  },
};

const mockRegularFlight: FlightEntity = {
  id: 'flight-abc123',
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

const mockUnidentifiedFlight: FlightEntity = {
  id: 'flight-def456',
  type: 'flight',
  lat: 33.0,
  lng: 52.0,
  timestamp: Date.now(),
  label: 'DEF456',
  data: {
    icao24: 'def456',
    callsign: '',
    originCountry: 'Unknown',
    velocity: 300,
    heading: null,
    altitude: null,
    onGround: false,
    verticalRate: null,
    unidentified: true,
  },
};

describe('useEntityLayers', () => {
  beforeEach(() => {
    useFlightStore.setState({
      flights: [mockRegularFlight, mockUnidentifiedFlight],
      connectionStatus: 'connected',
      lastFetchAt: Date.now(),
      lastFresh: Date.now(),
      flightCount: 2,
    });
    useShipStore.setState({ ships: [mockShip], shipCount: 1 });
    useEventStore.setState({ events: [mockDroneEvent, mockMissileEvent], eventCount: 2 });
    useUIStore.setState({ pulseEnabled: true });
  });

  it('returns an array of 4 layers', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current).toHaveLength(4);
  });

  it('returns layers in order: ships, flights, drones, missiles', () => {
    const { result } = renderHook(() => useEntityLayers());
    const ids = result.current.map((l: IconLayer) => l.id);
    expect(ids).toEqual(['ships', 'flights', 'drones', 'missiles']);
  });

  it('flight layer uses sizeUnits meters', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    expect(flightLayer.props.sizeUnits).toBe('meters');
  });

  it('flight layer getAngle negates heading', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getAngle = flightLayer.props.getAngle as (d: FlightEntity) => number;
    expect(getAngle(mockRegularFlight)).toBe(-90);
  });

  it('flight layer getAngle returns 0 for null heading', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getAngle = flightLayer.props.getAngle as (d: FlightEntity) => number;
    expect(getAngle(mockUnidentifiedFlight)).toBe(0);
  });

  it('flight layer getColor returns green for regular flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getColor = flightLayer.props.getColor as (d: FlightEntity) => number[];
    const color = getColor(mockRegularFlight);
    expect(color[0]).toBe(34);  // R
    expect(color[1]).toBe(197); // G
    expect(color[2]).toBe(94);  // B
    // Alpha varies by altitude -- should be >0
    expect(color[3]).toBeGreaterThan(0);
  });

  it('flight layer getColor returns yellow for unidentified flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getColor = flightLayer.props.getColor as (d: FlightEntity) => number[];
    const color = getColor(mockUnidentifiedFlight);
    expect(color[0]).toBe(234); // R
    expect(color[1]).toBe(179); // G
    expect(color[2]).toBe(8);   // B
  });

  it('all layers have sizeUnits meters', () => {
    const { result } = renderHook(() => useEntityLayers());
    for (const layer of result.current) {
      expect((layer as IconLayer).props.sizeUnits).toBe('meters');
    }
  });

  it('all layers have sizeMinPixels and sizeMaxPixels set', () => {
    const { result } = renderHook(() => useEntityLayers());
    for (const layer of result.current) {
      const props = (layer as IconLayer).props;
      expect(props.sizeMinPixels).toBeGreaterThan(0);
      expect(props.sizeMaxPixels).toBeGreaterThan(0);
    }
  });

  it('flight layer getSize returns ICON_SIZE.flight.meters', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    expect(flightLayer.props.getSize).toBe(ICON_SIZE.flight.meters);
  });

  it('ship layer contains ship data from store', () => {
    const { result } = renderHook(() => useEntityLayers());
    const shipLayer = result.current[0] as IconLayer;
    expect(shipLayer.props.data).toHaveLength(1);
  });

  it('drone layer contains filtered drone events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const droneLayer = result.current[2] as IconLayer;
    expect(droneLayer.props.data).toHaveLength(1);
  });

  it('missile layer contains filtered missile events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const missileLayer = result.current[3] as IconLayer;
    expect(missileLayer.props.data).toHaveLength(1);
  });

  it('ship/drone/missile layers are empty when stores are empty', () => {
    useShipStore.setState({ ships: [], shipCount: 0 });
    useEventStore.setState({ events: [], eventCount: 0 });
    const { result } = renderHook(() => useEntityLayers());
    const [ships, _flights, drones, missiles] = result.current as IconLayer[];
    expect(ships.props.data).toEqual([]);
    expect(drones.props.data).toEqual([]);
    expect(missiles.props.data).toEqual([]);
  });

  it('all layer IDs are unique', () => {
    const { result } = renderHook(() => useEntityLayers());
    const ids = result.current.map((l: IconLayer) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('null/empty flights produce layer with empty data', () => {
    useFlightStore.setState({ flights: [], flightCount: 0 });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    expect(flightLayer.props.data).toEqual([]);
  });
});
