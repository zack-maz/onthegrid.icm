import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLayerStore } from '@/stores/layerStore';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
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

  it('renders 6 visualization layer toggles', () => {
    render(<LayerTogglesSlot />);
    // Visualization layer toggles (Geographic, Climate, Water, Threat Density, Political, Ethnic)
    expect(screen.getByLabelText('Toggle Geographic layer')).toBeTruthy();
    expect(screen.getByLabelText('Toggle Climate layer')).toBeTruthy();
    expect(screen.getByLabelText('Toggle Water layer')).toBeTruthy();
    expect(screen.getByLabelText('Toggle Threat Density layer')).toBeTruthy();
    expect(screen.getByLabelText('Toggle Political layer')).toBeTruthy();
    expect(screen.getByLabelText('Toggle Ethnic layer')).toBeTruthy();
  });

  it('renders only 6 switch roles (visualization layers only, no event toggles)', () => {
    render(<LayerTogglesSlot />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(6);
  });

  it('does not render any event toggles', () => {
    render(<LayerTogglesSlot />);
    expect(screen.queryByLabelText('Toggle Events')).toBeNull();
    expect(screen.queryByLabelText('Toggle Airstrikes')).toBeNull();
    expect(screen.queryByLabelText('Toggle Ground Combat')).toBeNull();
    expect(screen.queryByLabelText('Toggle Explosions')).toBeNull();
    expect(screen.queryByLabelText('Toggle Targeted')).toBeNull();
    expect(screen.queryByLabelText('Toggle Other')).toBeNull();
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

  it('clicking a visualization layer toggle calls toggleLayer', () => {
    render(<LayerTogglesSlot />);
    const geoToggle = screen.getByLabelText('Toggle Geographic layer');
    fireEvent.click(geoToggle);
    expect(useLayerStore.getState().activeLayers.has('geographic')).toBe(true);
  });

  it('renders "Clear cache & reload" button', () => {
    render(<LayerTogglesSlot />);
    expect(screen.getByText('Clear cache & reload')).toBeTruthy();
  });

  it('inactive visualization toggle has opacity-40 class', () => {
    render(<LayerTogglesSlot />);
    const geoToggle = screen.getByLabelText('Toggle Geographic layer');
    expect(geoToggle.className).toContain('opacity-40');
  });

  it('active visualization toggle has opacity-100 class', () => {
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

  it('no coming-soon rows', () => {
    render(<LayerTogglesSlot />);
    expect(screen.queryAllByText('soon')).toHaveLength(0);
  });
});
