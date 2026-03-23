/**
 * BaseMap component tests
 * Covers MAP-01a (renders inside container), MAP-01d (hides road labels on load),
 * and tooltip handling (search filter suppression, no entity toggle gating).
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

const mockAirstrikeEntity: ConflictEventEntity = {
  id: 'event-airstrike-1',
  type: 'airstrike',
  lat: 32.65,
  lng: 51.67,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'https://example.com',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
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
      selectedEntityId: null,
      hoveredEntityId: null,
      isDetailPanelOpen: false,
    });
  });

  it('clears selection and closes detail panel on empty map click', () => {
    useUIStore.setState({ selectedEntityId: 'flight-abc', isDetailPanelOpen: true });
    render(<BaseMap />);
    simulateEmptyClick();
    expect(useUIStore.getState().selectedEntityId).toBeNull();
    expect(useUIStore.getState().isDetailPanelOpen).toBe(false);
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

describe('BaseMap tooltip behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({
      selectedEntityId: null,
      hoveredEntityId: null,
    });
  });

  it('shows tooltip for airstrike entity', () => {
    render(<BaseMap />);
    simulateHover(mockAirstrikeEntity);
    expect(screen.getByText('Aerial weapons')).toBeTruthy();
    expect(screen.getByText('Isfahan, Iran', { exact: false })).toBeTruthy();
  });

  it('shows tooltip for flight entity', () => {
    render(<BaseMap />);
    simulateHover(mockFlight);
    expect(screen.getByText('QTR123')).toBeTruthy();
  });

  it('clears tooltip when hover moves off entity', () => {
    render(<BaseMap />);
    simulateHover(mockAirstrikeEntity);
    expect(screen.getByText('Aerial weapons')).toBeTruthy();
    simulateHoverClear();
    expect(screen.queryByText('Aerial weapons')).toBeNull();
  });
});
