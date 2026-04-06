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

  it('renders 6 active toggle rows and no coming-soon rows', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(6);
    // No layers are coming-soon in current config (Satellite was removed)
    expect(screen.queryAllByText('soon')).toHaveLength(0);
  });

  it('renders toggle rows with correct labels', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Geographic')).toBeTruthy();
    expect(screen.getByText('Climate')).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
    expect(screen.getByText('Threat Density')).toBeTruthy();
    expect(screen.getByText('Political')).toBeTruthy();
    expect(screen.getByText('Ethnic')).toBeTruthy();
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

  it('political layer is a clickable toggle (not coming-soon)', () => {
    render(<LayerTogglesSlot />);
    const politicalToggle = screen.getByLabelText('Toggle Political layer');
    expect(politicalToggle).toBeTruthy();
    fireEvent.click(politicalToggle);
    expect(useLayerStore.getState().activeLayers.has('political')).toBe(true);
  });
});
