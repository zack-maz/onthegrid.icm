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

  it('exports LegendConfig interface and LEGEND_REGISTRY array', () => {
    expect(LEGEND_REGISTRY).toBeDefined();
    expect(Array.isArray(LEGEND_REGISTRY)).toBe(true);
    expect(LEGEND_REGISTRY.length).toBeGreaterThanOrEqual(1);
  });

  it('renders faction legend with discrete swatches when political layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['political']) });
    const { getByText } = render(<MapLegend />);
    expect(getByText('Factions')).toBeTruthy();
    expect(getByText('Iran Axis')).toBeTruthy();
    expect(getByText('US-Aligned')).toBeTruthy();
    expect(getByText('Turkic Bloc')).toBeTruthy();
    expect(getByText('Contested')).toBeTruthy();
    expect(getByText('Neutral')).toBeTruthy();
  });

  it('discrete legend shows colored dots not gradient bar', () => {
    useLayerStore.setState({ activeLayers: new Set(['political']) });
    const { container } = render(<MapLegend />);
    // Discrete mode renders colored dots (rounded-full class)
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThanOrEqual(5);
    // No gradient bar should be rendered for the political legend
    const allDivs = container.querySelectorAll('div');
    let hasGradient = false;
    allDivs.forEach((div) => {
      if (div.style.background?.includes('linear-gradient')) {
        hasGradient = true;
      }
    });
    expect(hasGradient).toBe(false);
  });
});
