import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MapLegend, LEGEND_REGISTRY } from '@/components/map/MapLegend';
import { useLayerStore } from '@/stores/layerStore';

describe('MapLegend', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('renders nothing when no layers are active', () => {
    const { container } = render(<MapLegend />);
    expect(container.firstChild).toBeNull();
  });

  it('renders elevation legend when geographic layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['geographic']) });
    const { getByText } = render(<MapLegend />);
    expect(getByText('Elevation')).toBeTruthy();
    expect(getByText('0m')).toBeTruthy();
    expect(getByText('4000m')).toBeTruthy();
  });

  it('renders temperature legend when weather layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['weather']) });
    const { getByText } = render(<MapLegend />);
    expect(getByText('Temperature')).toBeTruthy();
    expect(getByText('-5C / 23F')).toBeTruthy();
    expect(getByText('45C / 113F')).toBeTruthy();
  });

  it('exports LEGEND_REGISTRY with registered legends', () => {
    expect(LEGEND_REGISTRY).toBeDefined();
    expect(LEGEND_REGISTRY.length).toBeGreaterThanOrEqual(1);
  });

  it('renders discrete faction legend when political layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['political']) });
    const { getByText } = render(<MapLegend />);
    expect(getByText('Factions')).toBeTruthy();
    expect(getByText('US-aligned')).toBeTruthy();
    expect(getByText('Iran-aligned')).toBeTruthy();
    expect(getByText('Neutral')).toBeTruthy();
    expect(getByText('Disputed')).toBeTruthy();
  });

  it('renders water health legend when water layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    const { getByText } = render(<MapLegend />);
    expect(getByText('Water Health')).toBeTruthy();
    expect(getByText('Extreme Stress')).toBeTruthy();
    expect(getByText('Healthy')).toBeTruthy();
  });
});
