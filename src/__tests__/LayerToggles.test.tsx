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

  it('renders 6 visualization layer toggle rows', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(6);
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

  it('renders "coming soon" subtitle text', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
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
});
