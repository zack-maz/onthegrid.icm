import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLayerStore } from '@/stores/layerStore';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    isLayersCollapsed: false,
    toggleLayers: vi.fn(),
  }),
}));

import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';

describe('LayerTogglesSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('renders "Layers" header text', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Layers')).toBeTruthy();
  });

  it('renders 4 active toggle rows and 2 coming-soon rows', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(4);
    // Coming-soon layers render as plain divs, not switches
    expect(screen.getAllByText('soon')).toHaveLength(2);
  });

  it('renders toggle rows with correct labels', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Geographic')).toBeTruthy();
    expect(screen.getByText('Weather')).toBeTruthy();
    expect(screen.getByText('Threat Heatmap')).toBeTruthy();
    expect(screen.getByText('Political')).toBeTruthy();
    expect(screen.getByText('Satellite')).toBeTruthy();
    expect(screen.getByText('Infrastructure')).toBeTruthy();
  });

  it('clicking a toggle calls toggleLayer', () => {
    render(<LayerTogglesSlot />);
    const geoToggle = screen.getByLabelText('Toggle Geographic layer');
    fireEvent.click(geoToggle);
    expect(useLayerStore.getState().activeLayers.has('geographic')).toBe(true);
  });

  it('renders "Clear cache & reload" button', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Clear cache & reload')).toBeTruthy();
  });

  it('inactive toggle has opacity-40 class', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    // All are inactive initially (no active layers)
    for (const btn of switches) {
      expect(btn.className).toContain('opacity-40');
    }
  });

  it('active toggle has opacity-100 class', () => {
    useLayerStore.setState({ activeLayers: new Set(['geographic']) });
    render(<LayerTogglesSlot />);
    const geoToggle = screen.getByLabelText('Toggle Geographic layer');
    expect(geoToggle.className).toContain('opacity-100');
  });

  it('clicking political toggle calls toggleLayer', () => {
    render(<LayerTogglesSlot />);
    const politicalToggle = screen.getByLabelText('Toggle Political layer');
    fireEvent.click(politicalToggle);
    expect(useLayerStore.getState().activeLayers.has('political')).toBe(true);
  });
});
