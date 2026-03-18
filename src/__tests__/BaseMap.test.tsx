/**
 * BaseMap component tests
 * Covers MAP-01a (renders inside container), MAP-01d (hides road labels on load),
 * and tooltip gating via showNews toggle.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BaseMap } from '@/components/map/BaseMap';
import { __capturedOnLoad } from '@vis.gl/react-maplibre';
import { __lastOverlayProps } from '@deck.gl/mapbox';
import { useUIStore } from '@/stores/uiStore';
import type { PickingInfo } from '@deck.gl/core';
import type { ConflictEventEntity, FlightEntity } from '@/types/entities';

function createMockMap() {
  return {
    _layers: {
      roadname_minor: { id: 'roadname_minor' },
      roadname_sec: { id: 'roadname_sec' },
      roadname_pri: { id: 'roadname_pri' },
      roadname_major: { id: 'roadname_major' },
      place_suburbs: { id: 'place_suburbs' },
      place_hamlet: { id: 'place_hamlet' },
      poi: { id: 'poi' },
      boundary_country_outline: { id: 'boundary_country_outline' },
      boundary_country_inner: { id: 'boundary_country_inner' },
      water: { id: 'water' },
      water_shadow: { id: 'water_shadow' },
      waterway: { id: 'waterway' },
    } as Record<string, unknown>,
    getLayer: vi.fn(function (this: { _layers: Record<string, unknown> }, id: string) {
      return this._layers[id];
    }),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    getContainer: vi.fn(() => document.createElement('div')),
  };
}

describe('BaseMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders map container (MAP-01a)', () => {
    const { container } = render(<BaseMap />);
    // BaseMap renders a relative container div
    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.classList.contains('relative')).toBe(true);
    // Mock map should be rendered inside
    expect(container.querySelector('[data-testid="mock-map"]')).toBeTruthy();
  });

  it('hides road labels on load (MAP-01d)', () => {
    render(<BaseMap />);

    const mockMap = createMockMap();

    // Simulate onLoad callback via the captured handler
    expect(__capturedOnLoad).toBeDefined();
    __capturedOnLoad!({ target: mockMap });

    // Verify road labels hidden
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('roadname_minor', 'visibility', 'none');
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('roadname_sec', 'visibility', 'none');
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('roadname_pri', 'visibility', 'none');
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('roadname_major', 'visibility', 'none');

    // Verify minor features hidden
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('place_suburbs', 'visibility', 'none');
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('place_hamlet', 'visibility', 'none');
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('poi', 'visibility', 'none');

    // Verify borders brightened
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith('boundary_country_outline', 'line-color', '#888888');
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith('boundary_country_outline', 'line-width', 1.5);

    // Verify water tinted
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#0a1628');
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith('waterway', 'line-color', '#0a1628');
  });
});

const mockDroneEntity: ConflictEventEntity = {
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

function simulateHover(entity: unknown) {
  const onHover = __lastOverlayProps.onHover as (info: PickingInfo) => void;
  act(() => {
    onHover({ object: entity, x: 100, y: 100 } as PickingInfo);
  });
}

function simulateHoverClear() {
  const onHover = __lastOverlayProps.onHover as (info: PickingInfo) => void;
  act(() => {
    onHover({ object: null, x: 0, y: 0 } as unknown as PickingInfo);
  });
}

function simulateClick(entity: unknown) {
  const onClick = __lastOverlayProps.onClick as (info: PickingInfo) => void;
  act(() => {
    onClick({ object: entity, x: 100, y: 100 } as PickingInfo);
  });
}

function simulateEmptyClick() {
  const onClick = __lastOverlayProps.onClick as (info: PickingInfo) => void;
  act(() => {
    onClick({ object: null, x: 50, y: 50 } as unknown as PickingInfo);
  });
}

describe('BaseMap click handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({
      showNews: true,
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showGroundTraffic: false,
      selectedEntityId: null,
      hoveredEntityId: null,
      isDetailPanelOpen: false,
    });
  });

  it('does not clear selectedEntityId on empty map click', () => {
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });
    render(<BaseMap />);
    simulateEmptyClick();
    expect(useUIStore.getState().selectedEntityId).toBe('flight-abc');
    expect(useUIStore.getState().isDetailPanelOpen).toBe(true);
  });

  it('clicking entity opens detail panel', () => {
    render(<BaseMap />);
    simulateClick(mockFlight);
    expect(useUIStore.getState().selectedEntityId).toBe('flight-abc');
    expect(useUIStore.getState().isDetailPanelOpen).toBe(true);
  });

  it('clicking same entity again closes detail panel', () => {
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });
    render(<BaseMap />);
    simulateClick(mockFlight);
    expect(useUIStore.getState().selectedEntityId).toBeNull();
    expect(useUIStore.getState().isDetailPanelOpen).toBe(false);
  });
});

describe('BaseMap tooltip gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({
      showNews: true,
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showGroundTraffic: false,
      selectedEntityId: null,
      hoveredEntityId: null,
    });
  });

  it('shows tooltip for drone entity when showNews is ON', () => {
    render(<BaseMap />);
    simulateHover(mockDroneEntity);
    expect(screen.getByText('Explosions/Remote violence')).toBeTruthy();
    expect(screen.getByText('Isfahan, Iran', { exact: false })).toBeTruthy();
  });

  it('hides tooltip for drone entity when showNews is OFF', () => {
    useUIStore.setState({ showNews: false });
    render(<BaseMap />);
    simulateHover(mockDroneEntity);
    expect(screen.queryByText('Explosions/Remote violence')).toBeNull();
  });

  it('still shows tooltip for flight entity when showNews is OFF', () => {
    useUIStore.setState({ showNews: false });
    render(<BaseMap />);
    simulateHover(mockFlight);
    expect(screen.getByText('QTR123')).toBeTruthy();
  });

  it('clears tooltip when hover moves off entity', () => {
    render(<BaseMap />);
    simulateHover(mockDroneEntity);
    expect(screen.getByText('Explosions/Remote violence')).toBeTruthy();
    simulateHoverClear();
    expect(screen.queryByText('Explosions/Remote violence')).toBeNull();
  });
});
