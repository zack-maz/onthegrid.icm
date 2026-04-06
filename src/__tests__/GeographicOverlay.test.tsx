import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GeographicOverlay } from '@/components/map/layers/GeographicOverlay';
import { GEO_FEATURES } from '@/components/map/layers/geoFeatures';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import { useLayerStore } from '@/stores/layerStore';

describe('GeographicOverlay', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('renders nothing when geographic layer is inactive', () => {
    const { container } = render(<GeographicOverlay />);
    expect(container.innerHTML).toBe('');
  });

  // Note: when active, GeographicOverlay returns a Fragment of MapLibre Source/Layer
  // components. Those are mocked to null in jsdom (no WebGL), so the rendered
  // container is also empty -- there is no DOM-level distinction to assert here.
  // The hook/layer wiring is covered by integration tests in BaseMap.test.tsx.
});

describe('GEO_FEATURES', () => {
  it('has the expected number of features (~15)', () => {
    expect(GEO_FEATURES.features.length).toBe(15);
  });

  it('all features have required properties (name, minzoom)', () => {
    for (const feature of GEO_FEATURES.features) {
      expect(feature.properties.name).toBeDefined();
      expect(typeof feature.properties.name).toBe('string');
      expect(feature.properties.name.length).toBeGreaterThan(0);
      expect(feature.properties.minzoom).toBeDefined();
      expect(typeof feature.properties.minzoom).toBe('number');
    }
  });

  it('features span 3 zoom tiers', () => {
    const minzooms = new Set(GEO_FEATURES.features.map((f) => f.properties.minzoom));
    expect(minzooms.size).toBe(3);
    expect(minzooms.has(4)).toBe(true);
    expect(minzooms.has(6)).toBe(true);
    expect(minzooms.has(8)).toBe(true);
  });

  it('all features have valid GeoJSON Point geometry', () => {
    for (const feature of GEO_FEATURES.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');
      expect(feature.geometry.coordinates).toHaveLength(2);
      const [lng, lat] = feature.geometry.coordinates;
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });
});

describe('LEGEND_REGISTRY geographic entry', () => {
  it('includes a geographic legend entry', () => {
    const geoLegend = LEGEND_REGISTRY.find((l) => l.layerId === 'geographic');
    expect(geoLegend).toBeDefined();
    expect(geoLegend!.title).toBe('Elevation');
    expect(geoLegend!.colorStops).toHaveLength(3);
  });
});
