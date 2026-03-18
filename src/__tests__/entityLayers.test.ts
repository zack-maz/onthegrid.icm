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

    it('flightUnidentified is darker red [185, 28, 28]', () => {
      expect(ENTITY_COLORS.flightUnidentified).toEqual([185, 28, 28]);
    });

    it('ship is gray [156, 163, 175]', () => {
      expect(ENTITY_COLORS.ship).toEqual([156, 163, 175]);
    });

    it('airstrike is red [255, 59, 48]', () => {
      expect(ENTITY_COLORS.airstrike).toEqual([255, 59, 48]);
    });

    it('groundCombat is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.groundCombat).toEqual([239, 68, 68]);
    });

    it('targeted is dark red [139, 30, 30]', () => {
      expect(ENTITY_COLORS.targeted).toEqual([139, 30, 30]);
    });

    it('otherConflict is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.otherConflict).toEqual([239, 68, 68]);
    });
  });

  describe('ICON_SIZE', () => {
    it('flight has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.flight).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('ship has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.ship).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('airstrike has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.airstrike).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('groundCombat has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.groundCombat).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('targeted has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.targeted).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
    });

    it('otherConflict has meters, minPixels, and maxPixels properties', () => {
      expect(ICON_SIZE.otherConflict).toEqual({ meters: 8000, minPixels: 24, maxPixels: 160 });
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
  const expectedKeys = ['chevron', 'chevronGround', 'crosshair', 'diamond', 'explosion', 'starburst', 'xmark'] as const;

  it('has all 7 icon keys', () => {
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

const mockAirstrikeEvent: ConflictEventEntity = {
  id: 'event-IRN001',
  type: 'airstrike',
  lat: 32.6546,
  lng: 51.668,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'ISNA',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
  },
};

const mockGroundCombatEvent: ConflictEventEntity = {
  id: 'event-IRN002',
  type: 'ground_combat',
  lat: 35.6892,
  lng: 51.389,
  timestamp: Date.now(),
  label: 'Conventional military force',
  data: {
    eventType: 'Conventional military force',
    subEventType: 'CAMEO 190',
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

const mockTargetedEvent: ConflictEventEntity = {
  id: 'event-IRN003',
  type: 'assassination',
  lat: 33.0,
  lng: 52.0,
  timestamp: Date.now(),
  label: 'Assassination',
  data: {
    eventType: 'Assassination',
    subEventType: 'CAMEO 186',
    fatalities: 1,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'Reuters',
    goldsteinScale: -8.0,
    locationName: 'Shiraz, Iran',
    cameoCode: '186',
  },
};

const mockOtherEvent: ConflictEventEntity = {
  id: 'event-IRN004',
  type: 'blockade',
  lat: 34.0,
  lng: 53.0,
  timestamp: Date.now(),
  label: 'Blockade',
  data: {
    eventType: 'Blockade / movement restriction',
    subEventType: 'CAMEO 191',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'AP',
    goldsteinScale: -4.0,
    locationName: 'Bandar Abbas, Iran',
    cameoCode: '191',
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
    useEventStore.setState({ events: [mockAirstrikeEvent, mockGroundCombatEvent, mockTargetedEvent, mockOtherEvent], eventCount: 4 });
    useUIStore.setState({
      pulseEnabled: true,
      showFlights: true,
      showShips: true,
      showEvents: true,
      showAirstrikes: true,
      showGroundCombat: true,
      showTargeted: true,
      showOtherConflict: true,
      showGroundTraffic: false,
    });
  });

  it('returns an array of 8 layers', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current).toHaveLength(8);
  });

  it('returns layers in order: ships, flights, airstrikes, groundCombat, targeted, otherConflict, entity-glow, entity-highlight', () => {
    const { result } = renderHook(() => useEntityLayers());
    const ids = result.current.map((l: { id: string }) => l.id);
    expect(ids).toEqual(['ships', 'flights', 'airstrikes', 'groundCombat', 'targeted', 'otherConflict', 'entity-glow', 'entity-highlight']);
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
    expect(color[0]).toBe(185); // R
    expect(color[1]).toBe(28);  // G
    expect(color[2]).toBe(28);  // B
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

  it('airstrike layer contains filtered airstrike events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const airstrikeLayer = result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer;
    expect(airstrikeLayer.props.data).toHaveLength(1);
  });

  it('groundCombat layer contains filtered ground combat events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const gcLayer = result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer;
    expect(gcLayer.props.data).toHaveLength(1);
  });

  it('targeted layer contains filtered targeted events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const tLayer = result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer;
    expect(tLayer.props.data).toHaveLength(1);
  });

  it('otherConflict layer contains filtered other conflict events', () => {
    const { result } = renderHook(() => useEntityLayers());
    const ocLayer = result.current.find((l: IconLayer) => l.id === 'otherConflict') as IconLayer;
    expect(ocLayer.props.data).toHaveLength(1);
  });

  it('ship/event layers are empty when stores are empty', () => {
    useShipStore.setState({ ships: [], shipCount: 0 });
    useEventStore.setState({ events: [], eventCount: 0 });
    const { result } = renderHook(() => useEntityLayers());
    const ships = result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer;
    const airstrikes = result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer;
    const groundCombat = result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer;
    const targeted = result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer;
    const otherConflict = result.current.find((l: IconLayer) => l.id === 'otherConflict') as IconLayer;
    expect(ships.props.data).toEqual([]);
    expect(airstrikes.props.data).toEqual([]);
    expect(groundCombat.props.data).toEqual([]);
    expect(targeted.props.data).toEqual([]);
    expect(otherConflict.props.data).toEqual([]);
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
    useEventStore.setState({ events: [mockAirstrikeEvent, mockGroundCombatEvent, mockTargetedEvent, mockOtherEvent], eventCount: 4 });
    useUIStore.setState({
      pulseEnabled: true,
      showFlights: true,
      showShips: true,
      showEvents: true,
      showAirstrikes: true,
      showGroundCombat: true,
      showTargeted: true,
      showOtherConflict: true,
      showGroundTraffic: false,
    });
  });

  it('hides all conflict layers when showEvents is false', () => {
    useUIStore.setState({ showEvents: false });
    const { result } = renderHook(() => useEntityLayers());
    const airstrikeLayer = result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer;
    const gcLayer = result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer;
    const tLayer = result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer;
    const ocLayer = result.current.find((l: IconLayer) => l.id === 'otherConflict') as IconLayer;
    expect(airstrikeLayer.props.visible).toBe(false);
    expect(gcLayer.props.visible).toBe(false);
    expect(tLayer.props.visible).toBe(false);
    expect(ocLayer.props.visible).toBe(false);
  });

  it('all flight toggles off hides flight layer via visible prop', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: false, pulseEnabled: false });
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

  it('showAirstrikes=false hides airstrike layer via visible prop', () => {
    useUIStore.setState({ showAirstrikes: false });
    const { result } = renderHook(() => useEntityLayers());
    const airstrikeLayer = result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer;
    expect(airstrikeLayer.props.visible).toBe(false);
  });

  it('showGroundCombat=false hides groundCombat layer via visible prop', () => {
    useUIStore.setState({ showGroundCombat: false });
    const { result } = renderHook(() => useEntityLayers());
    const gcLayer = result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer;
    expect(gcLayer.props.visible).toBe(false);
  });

  it('showTargeted=false hides targeted layer via visible prop', () => {
    useUIStore.setState({ showTargeted: false });
    const { result } = renderHook(() => useEntityLayers());
    const tLayer = result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer;
    expect(tLayer.props.visible).toBe(false);
  });

  it('showOtherConflict=false hides otherConflict layer via visible prop', () => {
    useUIStore.setState({ showOtherConflict: false });
    const { result } = renderHook(() => useEntityLayers());
    const ocLayer = result.current.find((l: IconLayer) => l.id === 'otherConflict') as IconLayer;
    expect(ocLayer.props.visible).toBe(false);
  });

  it('showFlights=false + showGroundTraffic=true includes ground + unidentified flights (mutually exclusive)', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: true, pulseEnabled: true });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    expect(flightLayer).toBeDefined();
    // Ground flight + unidentified flight (unidentified is independent of showFlights)
    const data = flightLayer.props.data as FlightEntity[];
    expect(data).toHaveLength(2);
    expect(data.some((f) => f.data.onGround)).toBe(true);
    expect(data.some((f) => f.data.unidentified)).toBe(true);
  });

  it('pulseEnabled=false hides unidentified flights even when showFlights is on', () => {
    useUIStore.setState({ showFlights: true, showGroundTraffic: false, pulseEnabled: false });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    const data = flightLayer.props.data as FlightEntity[];
    // Only regular airborne flight, no unidentified or ground
    expect(data).toHaveLength(1);
    expect(data[0].data.unidentified).toBe(false);
    expect(data[0].data.onGround).toBe(false);
  });

  it('unidentified flights are independent of showFlights toggle', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: false, pulseEnabled: true });
    const { result } = renderHook(() => useEntityLayers());
    const flightLayer = result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer;
    const data = flightLayer.props.data as FlightEntity[];
    // Only unidentified flight should remain
    expect(data).toHaveLength(1);
    expect(data[0].data.unidentified).toBe(true);
  });

  it('all toggles ON returns 8 layers including glow and highlight', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current).toHaveLength(8);
    const ids = result.current.map((l: { id: string }) => l.id);
    expect(ids).toEqual(['ships', 'flights', 'airstrikes', 'groundCombat', 'targeted', 'otherConflict', 'entity-glow', 'entity-highlight']);
  });

  it('airstrike layer has pickable=true', () => {
    const { result } = renderHook(() => useEntityLayers());
    const airstrikeLayer = result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer;
    expect(airstrikeLayer.props.pickable).toBe(true);
  });

  it('groundCombat layer has pickable=true', () => {
    const { result } = renderHook(() => useEntityLayers());
    const gcLayer = result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer;
    expect(gcLayer.props.pickable).toBe(true);
  });
});
