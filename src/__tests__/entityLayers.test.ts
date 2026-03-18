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
    it('flight is yellow [234, 179, 8]', () => {
      expect(ENTITY_COLORS.flight).toEqual([234, 179, 8]);
    });

    it('flightUnidentified is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.flightUnidentified).toEqual([239, 68, 68]);
    });

    it('ship is gray [156, 163, 175]', () => {
      expect(ENTITY_COLORS.ship).toEqual([156, 163, 175]);
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
      expect(ICON_SIZE.flight).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('ship has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.ship).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('drone has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.drone).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('missile has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.missile).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
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
  const expectedKeys = ['chevron', 'chevronGround', 'diamond', 'starburst', 'xmark'] as const;

  it('has all 5 icon keys', () => {
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
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '183',
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
    goldsteinScale: -9.5,
    locationName: 'Tehran, Iran',
    cameoCode: '190',
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

const mockGroundFlight: FlightEntity = {
  id: 'flight-gnd789',
  type: 'flight',
  lat: 35.0,
  lng: 51.0,
  timestamp: Date.now(),
  label: 'GND789',
  data: {
    icao24: 'gnd789',
    callsign: 'GND789',
    originCountry: 'Iran',
    velocity: 5,
    heading: 0,
    altitude: 0,
    onGround: true,
    verticalRate: 0,
    unidentified: false,
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
    useUIStore.setState({
      pulseEnabled: true,
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showGroundTraffic: false,
    });
  });

  it('returns an array of 6 layers', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current).toHaveLength(6);
  });

  it('returns layers in order: ships, flights, drones, missiles, entity-glow, entity-highlight', () => {
    const { result } = renderHook(() => useEntityLayers());
    const ids = result.current.map((l: { id: string }) => l.id);
    expect(ids).toEqual(['ships', 'flights', 'drones', 'missiles', 'entity-glow', 'entity-highlight']);
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

  it('flight layer getColor returns yellow for regular flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getColor = flightLayer.props.getColor as (d: FlightEntity) => number[];
    const color = getColor(mockRegularFlight);
    expect(color[0]).toBe(234); // R
    expect(color[1]).toBe(179); // G
    expect(color[2]).toBe(8);   // B
    // Alpha varies by altitude -- should be >0
    expect(color[3]).toBeGreaterThan(0);
  });

  it('flight layer getColor returns red for unidentified flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current[1] as IconLayer;
    const getColor = flightLayer.props.getColor as (d: FlightEntity) => number[];
    const color = getColor(mockUnidentifiedFlight);
    expect(color[0]).toBe(239); // R
    expect(color[1]).toBe(68);  // G
    expect(color[2]).toBe(68);  // B
  });

  it('all entity layers have sizeUnits meters', () => {
    const { result } = renderHook(() => useEntityLayers());
    const entityLayers = result.current.filter((l: { id: string }) => !l.id.startsWith('entity-'));
    for (const layer of entityLayers) {
      expect((layer as IconLayer).props.sizeUnits).toBe('meters');
    }
  });

  it('all entity layers have sizeMinPixels and sizeMaxPixels set', () => {
    const { result } = renderHook(() => useEntityLayers());
    const entityLayers = result.current.filter((l: { id: string }) => !l.id.startsWith('entity-'));
    for (const layer of entityLayers) {
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
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    expect(flightLayer.props.data).toEqual([]);
  });
});

describe('useEntityLayers layer visibility toggles', () => {
  beforeEach(() => {
    useFlightStore.setState({
      flights: [mockRegularFlight, mockUnidentifiedFlight, mockGroundFlight],
      connectionStatus: 'connected',
      lastFetchAt: Date.now(),
      lastFresh: Date.now(),
      flightCount: 3,
    });
    useShipStore.setState({ ships: [mockShip], shipCount: 1 });
    useEventStore.setState({ events: [mockDroneEvent, mockMissileEvent], eventCount: 2 });
    useUIStore.setState({
      pulseEnabled: true,
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showGroundTraffic: false,
    });
  });

  it('showFlights=false hides flight layer via visible prop', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: false });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    expect(flightLayer.props.visible).toBe(false);
  });

  it('showShips=false hides ship layer via visible prop', () => {
    useUIStore.setState({ showShips: false });
    const { result } = renderHook(() => useEntityLayers());
    const shipLayer = result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer;
    expect(shipLayer.props.visible).toBe(false);
  });

  it('showDrones=false hides drone layer via visible prop', () => {
    useUIStore.setState({ showDrones: false });
    const { result } = renderHook(() => useEntityLayers());
    const droneLayer = result.current.find((l: IconLayer) => l.id === 'drones') as IconLayer;
    expect(droneLayer.props.visible).toBe(false);
  });

  it('showMissiles=false hides missile layer via visible prop', () => {
    useUIStore.setState({ showMissiles: false });
    const { result } = renderHook(() => useEntityLayers());
    const missileLayer = result.current.find((l: IconLayer) => l.id === 'missiles') as IconLayer;
    expect(missileLayer.props.visible).toBe(false);
  });

  it('showFlights=false + showGroundTraffic=true still includes flight layer with only ground flights', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: true });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    expect(flightLayer).toBeDefined();
    // Should only contain the ground flight
    const data = flightLayer.props.data as FlightEntity[];
    expect(data).toHaveLength(1);
    expect(data[0].data.onGround).toBe(true);
  });

  it('all toggles ON returns 6 layers including glow and highlight', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current).toHaveLength(6);
    const ids = result.current.map((l: { id: string }) => l.id);
    expect(ids).toEqual(['ships', 'flights', 'drones', 'missiles', 'entity-glow', 'entity-highlight']);
  });

  it('drone layer has pickable=true', () => {
    const { result } = renderHook(() => useEntityLayers());
    const droneLayer = result.current.find((l: IconLayer) => l.id === 'drones') as IconLayer;
    expect(droneLayer.props.pickable).toBe(true);
  });

  it('missile layer has pickable=true', () => {
    const { result } = renderHook(() => useEntityLayers());
    const missileLayer = result.current.find((l: IconLayer) => l.id === 'missiles') as IconLayer;
    expect(missileLayer.props.pickable).toBe(true);
  });
});
