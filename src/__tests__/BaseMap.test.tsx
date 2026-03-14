/**
 * BaseMap component tests
 * Covers MAP-01a (renders inside container) and MAP-01d (hides road labels on load)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BaseMap } from '@/components/map/BaseMap';
import { __capturedOnLoad } from '@vis.gl/react-maplibre';

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
