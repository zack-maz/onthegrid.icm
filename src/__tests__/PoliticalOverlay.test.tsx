import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useLayerStore } from '@/stores/layerStore';

// Import the overlay component (uses mocked react-maplibre from vite.config alias)
import { PoliticalOverlay } from '@/components/map/layers/PoliticalOverlay';

// Import static data for integrity checks
import countriesData from '@/data/countries.json';
import disputedData from '@/data/disputed.json';

describe('PoliticalOverlay', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('renders null when political layer is not active', () => {
    const { container } = render(<PoliticalOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('does not throw when political layer is active', () => {
    useLayerStore.setState({ activeLayers: new Set(['political']) });
    // Source/Layer mocks render null, so we verify the component mounts without error
    expect(() => render(<PoliticalOverlay />)).not.toThrow();
  });
});

describe('PoliticalOverlay data integrity', () => {
  it('countries.json is a valid FeatureCollection with ISO_A3 properties', () => {
    expect(countriesData.type).toBe('FeatureCollection');
    expect(countriesData.features.length).toBeGreaterThan(0);

    for (const feature of countriesData.features) {
      const props = feature.properties as Record<string, string>;
      expect(props.ISO_A3).toBeDefined();
      expect(props.ISO_A3).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('disputed.json has exactly 3 features', () => {
    expect(disputedData.type).toBe('FeatureCollection');
    expect(disputedData.features).toHaveLength(3);
  });

  it('disputed features include Gaza, West Bank, and Golan Heights', () => {
    const names = disputedData.features.map(
      (f) => (f.properties as Record<string, string>).NAME
    );
    expect(names).toContain('Gaza');
    expect(names).toContain('West Bank');
    expect(names).toContain('Golan Heights');
  });
});
