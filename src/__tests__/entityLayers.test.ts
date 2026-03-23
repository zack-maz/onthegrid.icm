import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { altitudeToOpacity, ENTITY_COLORS, ICON_SIZE, PULSE_CONFIG } from '@/components/map/layers/constants';
import { ICON_MAPPING } from '@/components/map/layers/icons';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useEntityLayers } from '@/hooks/useEntityLayers';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';
import type { IconLayer } from '@deck.gl/layers';

describe('Entity Layer Constants', () => {
  describe('altitudeToOpacity', () => {
    it('returns 0.6 for null altitude', () => { expect(altitudeToOpacity(null)).toBe(0.6); });
    it('returns 0.6 for altitude 0', () => { expect(altitudeToOpacity(0)).toBe(0.6); });
    it('returns 1.0 for altitude at ceiling (13000m)', () => { expect(altitudeToOpacity(13000)).toBe(1.0); });
    it('returns ~0.8 for midpoint altitude (6500m)', () => { expect(altitudeToOpacity(6500)).toBeCloseTo(0.8, 1); });
    it('clamps to 1.0 for altitude above ceiling', () => { expect(altitudeToOpacity(20000)).toBe(1.0); });
  });
  describe('ENTITY_COLORS', () => {
    it('flight is yellow', () => { expect(ENTITY_COLORS.flight).toEqual([234, 179, 8]); });
    it('flightUnidentified is bright yellow', () => { expect(ENTITY_COLORS.flightUnidentified).toEqual([255, 255, 100]); });
    it('ship is purple', () => { expect(ENTITY_COLORS.ship).toEqual([167, 139, 250]); });
    it('airstrike is red', () => { expect(ENTITY_COLORS.airstrike).toEqual([255, 59, 48]); });
    it('groundCombat is red', () => { expect(ENTITY_COLORS.groundCombat).toEqual([239, 68, 68]); });
    it('targeted is dark red', () => { expect(ENTITY_COLORS.targeted).toEqual([139, 30, 30]); });
  });
  describe('ICON_SIZE', () => {
    const movingExpected = { meters: 1000, minPixels: 16, maxPixels: 100 };
    const eventExpected = { meters: 1500, minPixels: 16, maxPixels: 120 };
    it('flight', () => { expect(ICON_SIZE.flight).toEqual(movingExpected); });
    it('ship', () => { expect(ICON_SIZE.ship).toEqual(movingExpected); });
    it('airstrike', () => { expect(ICON_SIZE.airstrike).toEqual(eventExpected); });
    it('groundCombat', () => { expect(ICON_SIZE.groundCombat).toEqual(eventExpected); });
    it('targeted', () => { expect(ICON_SIZE.targeted).toEqual(eventExpected); });
  });
  describe('PULSE_CONFIG', () => {
    it('has correct config', () => {
      expect(PULSE_CONFIG.minOpacity).toBe(0.3);
      expect(PULSE_CONFIG.maxOpacity).toBe(1.0);
      expect(PULSE_CONFIG.periodMs).toBe(800);
    });
  });
});

describe('Icon Mapping', () => {
  const expectedKeys = ['chevron', 'chevronGround', 'crosshair', 'diamond', 'explosion', 'starburst', 'xmark', 'siteNuclear', 'siteNaval', 'siteOil', 'siteAirbase', 'siteDesalination', 'sitePort'] as const;
  it('has all 13 icon keys', () => { expect(Object.keys(ICON_MAPPING).sort()).toEqual([...expectedKeys].sort()); });
  for (const key of expectedKeys) {
    it(`${key} has mask: true`, () => { expect(ICON_MAPPING[key].mask).toBe(true); });
    it(`${key} has x, y, width, height`, () => {
      const e = ICON_MAPPING[key];
      expect(e).toHaveProperty('x'); expect(e).toHaveProperty('y');
      expect(e).toHaveProperty('width', 32); expect(e).toHaveProperty('height', 32);
    });
  }
});

describe('uiStore pulseEnabled', () => {
  beforeEach(() => { useUIStore.setState({ isDetailPanelOpen: false, isCountersCollapsed: false, pulseEnabled: true }); });
  it('defaults to true', () => { expect(useUIStore.getState().pulseEnabled).toBe(true); });
  it('togglePulse flips', () => {
    useUIStore.getState().togglePulse(); expect(useUIStore.getState().pulseEnabled).toBe(false);
    useUIStore.getState().togglePulse(); expect(useUIStore.getState().pulseEnabled).toBe(true);
  });
});

const mockShip: ShipEntity = { id: 'ship-123456789', type: 'ship', lat: 26.0, lng: 56.0, timestamp: Date.now(), label: 'VESSEL ONE', data: { mmsi: 123456789, shipName: 'VESSEL ONE', speedOverGround: 12.5, courseOverGround: 180, trueHeading: 178 } };
const mockAirstrikeEvent: ConflictEventEntity = { id: 'event-IRN001', type: 'airstrike', lat: 32.6546, lng: 51.668, timestamp: Date.now(), label: 'Aerial weapons', data: { eventType: 'Aerial weapons', subEventType: 'CAMEO 195', fatalities: 0, actor1: 'Unknown', actor2: 'Unknown', notes: '', source: 'ISNA', goldsteinScale: -5.0, locationName: 'Isfahan, Iran', cameoCode: '195' } };
const mockGroundCombatEvent: ConflictEventEntity = { id: 'event-IRN002', type: 'ground_combat', lat: 35.6892, lng: 51.389, timestamp: Date.now(), label: 'Conventional military force', data: { eventType: 'Conventional military force', subEventType: 'CAMEO 190', fatalities: 3, actor1: 'Unknown', actor2: 'Unknown', notes: '', source: 'Reuters', goldsteinScale: -9.5, locationName: 'Tehran, Iran', cameoCode: '190' } };
const mockTargetedEvent: ConflictEventEntity = { id: 'event-IRN003', type: 'assassination', lat: 33.0, lng: 52.0, timestamp: Date.now(), label: 'Assassination', data: { eventType: 'Assassination', subEventType: 'CAMEO 186', fatalities: 1, actor1: 'Unknown', actor2: 'Unknown', notes: '', source: 'Reuters', goldsteinScale: -8.0, locationName: 'Shiraz, Iran', cameoCode: '186' } };
const mockOtherEvent: ConflictEventEntity = { id: 'event-IRN004', type: 'blockade', lat: 34.0, lng: 53.0, timestamp: Date.now(), label: 'Blockade', data: { eventType: 'Blockade / movement restriction', subEventType: 'CAMEO 191', fatalities: 0, actor1: 'Unknown', actor2: 'Unknown', notes: '', source: 'AP', goldsteinScale: -4.0, locationName: 'Bandar Abbas, Iran', cameoCode: '191' } };
const mockRegularFlight: FlightEntity = { id: 'flight-abc123', type: 'flight', lat: 32.0, lng: 51.0, timestamp: Date.now(), label: 'QTR123', data: { icao24: 'abc123', callsign: 'QTR123', originCountry: 'Qatar', velocity: 250, heading: 90, altitude: 10000, onGround: false, verticalRate: 0, unidentified: false } };
const mockUnidentifiedFlight: FlightEntity = { id: 'flight-def456', type: 'flight', lat: 33.0, lng: 52.0, timestamp: Date.now(), label: 'DEF456', data: { icao24: 'def456', callsign: '', originCountry: 'Unknown', velocity: 300, heading: null, altitude: null, onGround: false, verticalRate: null, unidentified: true } };
const mockGroundFlight: FlightEntity = { id: 'flight-gnd789', type: 'flight', lat: 35.0, lng: 51.0, timestamp: Date.now(), label: 'GND789', data: { icao24: 'gnd789', callsign: 'GND789', originCountry: 'Iran', velocity: 5, heading: 0, altitude: 0, onGround: true, verticalRate: 0, unidentified: false } };

function resetStores() {
  useFlightStore.setState({ flights: [mockRegularFlight, mockUnidentifiedFlight], connectionStatus: 'connected', lastFetchAt: Date.now(), lastFresh: Date.now(), flightCount: 2 });
  useShipStore.setState({ ships: [mockShip], shipCount: 1 });
  useEventStore.setState({ events: [mockAirstrikeEvent, mockGroundCombatEvent, mockTargetedEvent, mockOtherEvent], eventCount: 4 });
  useUIStore.setState({ pulseEnabled: true, showFlights: true, showShips: true, showEvents: true, showAirstrikes: true, showGroundCombat: true, showTargeted: true, showGroundTraffic: false });
  useFilterStore.setState({ flightCountries: [], eventCountries: [], flightSpeedMin: null, flightSpeedMax: null, altitudeMin: null, altitudeMax: null, proximityPin: null, proximityRadiusKm: 100, dateStart: null, dateEnd: null, isSettingPin: false });
}

describe('useEntityLayers', () => {
  beforeEach(resetStores);
  it('returns 9 layers', () => { const { result } = renderHook(() => useEntityLayers()); expect(result.current).toHaveLength(9); });
  it('returns layers in correct order', () => {
    const { result } = renderHook(() => useEntityLayers());
    expect(result.current.map((l: { id: string }) => l.id)).toEqual(['proximity-circle', 'ships', 'flights', 'airstrikes', 'groundCombat', 'targeted', 'site-icons', 'entity-glow', 'entity-highlight']);
  });
  it('flight layer uses sizeUnits meters', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.sizeUnits).toBe('meters'); });
  it('flight layer getAngle negates heading', () => { const { result } = renderHook(() => useEntityLayers()); expect(((result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.getAngle as (d: FlightEntity) => number)(mockRegularFlight)).toBe(-90); });
  it('flight layer getAngle returns 0 for null heading', () => { const { result } = renderHook(() => useEntityLayers()); expect(((result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.getAngle as (d: FlightEntity) => number)(mockUnidentifiedFlight)).toBe(0); });
  it('flight layer getColor returns yellow for regular flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const color = ((result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.getColor as (d: FlightEntity) => number[])(mockRegularFlight);
    expect(color[0]).toBe(234); expect(color[1]).toBe(179); expect(color[2]).toBe(8); expect(color[3]).toBeGreaterThan(0);
  });
  it('flight layer getColor returns bright yellow for unidentified flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const color = ((result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.getColor as (d: FlightEntity) => number[])(mockUnidentifiedFlight);
    expect(color[0]).toBe(255); expect(color[1]).toBe(255); expect(color[2]).toBe(100);
  });
  it('all icon entity layers have sizeUnits meters', () => {
    const { result } = renderHook(() => useEntityLayers());
    for (const layer of result.current.filter((l: { id: string }) => !l.id.startsWith('entity-') && l.id !== 'proximity-circle')) {
      expect((layer as IconLayer).props.sizeUnits).toBe('meters');
    }
  });
  it('all icon entity layers have sizeMinPixels and sizeMaxPixels', () => {
    const { result } = renderHook(() => useEntityLayers());
    for (const layer of result.current.filter((l: { id: string }) => !l.id.startsWith('entity-') && l.id !== 'proximity-circle')) {
      expect((layer as IconLayer).props.sizeMinPixels).toBeGreaterThan(0);
      expect((layer as IconLayer).props.sizeMaxPixels).toBeGreaterThan(0);
    }
  });
  it('flight layer getSize returns ICON_SIZE.flight.meters for regular flights', () => {
    const { result } = renderHook(() => useEntityLayers());
    const getSize = (result.current.find((l: { id: string }) => l.id === 'flights') as IconLayer).props.getSize as (d: FlightEntity) => number;
    expect(getSize(mockRegularFlight)).toBe(ICON_SIZE.flight.meters);
  });
  it('ship layer contains ship data', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer).props.data).toHaveLength(1); });
  it('airstrike layer contains airstrike events', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer).props.data).toHaveLength(1); });
  it('groundCombat layer contains ground combat + other events', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer).props.data).toHaveLength(2); });
  it('targeted layer contains targeted events', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer).props.data).toHaveLength(1); });
  it('ship/event layers empty when stores empty', () => {
    useShipStore.setState({ ships: [], shipCount: 0 }); useEventStore.setState({ events: [], eventCount: 0 });
    const { result } = renderHook(() => useEntityLayers());
    expect((result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer).props.data).toEqual([]);
    expect((result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer).props.data).toEqual([]);
    expect((result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer).props.data).toEqual([]);
    expect((result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer).props.data).toEqual([]);
  });
  it('all layer IDs are unique', () => { const { result } = renderHook(() => useEntityLayers()); const ids = result.current.map((l: IconLayer) => l.id); expect(new Set(ids).size).toBe(ids.length); });
  it('empty flights produce empty data', () => { useFlightStore.setState({ flights: [], flightCount: 0 }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.data).toEqual([]); });
});

describe('useEntityLayers visibility toggles', () => {
  beforeEach(() => { resetStores(); useFlightStore.setState({ flights: [mockRegularFlight, mockUnidentifiedFlight, mockGroundFlight], connectionStatus: 'connected', lastFetchAt: Date.now(), lastFresh: Date.now(), flightCount: 3 }); });
  it('hides all conflict layers when showEvents is false', () => {
    useUIStore.setState({ showEvents: false }); const { result } = renderHook(() => useEntityLayers());
    expect((result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer).props.visible).toBe(false);
    expect((result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer).props.visible).toBe(false);
    expect((result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer).props.visible).toBe(false);
  });
  it('all flight toggles off hides flight layer', () => { useUIStore.setState({ showFlights: false, showGroundTraffic: false, pulseEnabled: false }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.visible).toBe(false); });
  it('showShips=false hides ship layer', () => { useUIStore.setState({ showShips: false }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer).props.visible).toBe(false); });
  it('showAirstrikes=false hides airstrike layer', () => { useUIStore.setState({ showAirstrikes: false }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer).props.visible).toBe(false); });
  it('showGroundCombat=false hides groundCombat layer', () => { useUIStore.setState({ showGroundCombat: false }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer).props.visible).toBe(false); });
  it('showTargeted=false hides targeted layer', () => { useUIStore.setState({ showTargeted: false }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'targeted') as IconLayer).props.visible).toBe(false); });
  it('showFlights=false + showGroundTraffic=true includes ground + unidentified', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: true, pulseEnabled: true }); const { result } = renderHook(() => useEntityLayers());
    const data = (result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.data as FlightEntity[];
    expect(data).toHaveLength(2); expect(data.some((f) => f.data.onGround)).toBe(true); expect(data.some((f) => f.data.unidentified)).toBe(true);
  });
  it('pulseEnabled=false hides unidentified flights', () => {
    useUIStore.setState({ showFlights: true, showGroundTraffic: false, pulseEnabled: false }); const { result } = renderHook(() => useEntityLayers());
    const data = (result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.data as FlightEntity[];
    expect(data).toHaveLength(1); expect(data[0].data.unidentified).toBe(false); expect(data[0].data.onGround).toBe(false);
  });
  it('unidentified flights independent of showFlights', () => {
    useUIStore.setState({ showFlights: false, showGroundTraffic: false, pulseEnabled: true }); const { result } = renderHook(() => useEntityLayers());
    const data = (result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.data as FlightEntity[];
    expect(data).toHaveLength(1); expect(data[0].data.unidentified).toBe(true);
  });
  it('all toggles ON returns 9 layers', () => {
    const { result } = renderHook(() => useEntityLayers()); expect(result.current).toHaveLength(9);
    expect(result.current.map((l: { id: string }) => l.id)).toEqual(['proximity-circle', 'ships', 'flights', 'airstrikes', 'groundCombat', 'targeted', 'site-icons', 'entity-glow', 'entity-highlight']);
  });
  it('airstrike layer has pickable=true', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'airstrikes') as IconLayer).props.pickable).toBe(true); });
  it('groundCombat layer has pickable=true', () => { const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'groundCombat') as IconLayer).props.pickable).toBe(true); });
});

describe('useEntityLayers proximity circle', () => {
  beforeEach(resetStores);
  it('empty data when no pin', () => { const { result } = renderHook(() => useEntityLayers()); const l = result.current.find((x: { id: string }) => x.id === 'proximity-circle') as IconLayer; expect(l).toBeDefined(); expect(l.props.data).toEqual([]); });
  it('has data when pin set', () => { useFilterStore.setState({ proximityPin: { lat: 32.0, lng: 51.0 } }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((x: { id: string }) => x.id === 'proximity-circle') as IconLayer).props.data).toHaveLength(1); });
  it('radius is km * 1000', () => { useFilterStore.setState({ proximityPin: { lat: 32.0, lng: 51.0 }, proximityRadiusKm: 50 }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((x: { id: string }) => x.id === 'proximity-circle') as IconLayer).props.getRadius).toBe(50_000); });
  it('not pickable', () => { useFilterStore.setState({ proximityPin: { lat: 32.0, lng: 51.0 } }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((x: { id: string }) => x.id === 'proximity-circle') as IconLayer).props.pickable).toBe(false); });
  it('renders before entity layers', () => { const { result } = renderHook(() => useEntityLayers()); expect(result.current[0].id).toBe('proximity-circle'); });
});

describe('useEntityLayers with filters', () => {
  beforeEach(resetStores);
  it('country filter reduces visible flights', () => { useFilterStore.setState({ flightCountries: ['Iran'] }); const { result } = renderHook(() => useEntityLayers()); expect(((result.current.find((l: IconLayer) => l.id === 'flights') as IconLayer).props.data as FlightEntity[]).length).toBe(0); });
  it('ships visible with altitude filter', () => { useFilterStore.setState({ altitudeMin: 5000 }); const { result } = renderHook(() => useEntityLayers()); expect((result.current.find((l: IconLayer) => l.id === 'ships') as IconLayer).props.data).toHaveLength(1); });
});
