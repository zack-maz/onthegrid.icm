import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useLayerStore } from '@/stores/layerStore';
import { ETHNIC_GROUPS, ETHNIC_GROUP_IDS } from '@/lib/ethnicGroups';
import ethnicZonesData from '@/data/ethnic-zones.json';

describe('EthnicOverlay', () => {
  it('ETHNIC_GROUPS has exactly 10 entries', () => {
    expect(ETHNIC_GROUP_IDS).toHaveLength(10);
    expect(Object.keys(ETHNIC_GROUPS)).toHaveLength(10);
  });

  it('ethnic-zones.json is valid FeatureCollection with group/groups property on each feature', () => {
    expect(ethnicZonesData.type).toBe('FeatureCollection');
    expect(ethnicZonesData.features.length).toBeGreaterThan(0);

    for (const feature of ethnicZonesData.features) {
      const props = feature.properties as Record<string, unknown>;
      const hasGroup = typeof props.group === 'string';
      const hasGroups = Array.isArray(props.groups);
      expect(hasGroup || hasGroups).toBe(true);
      // Must have a label
      expect(typeof props.label).toBe('string');
    }
  });

  it('ETHNIC_GROUPS config covers all groups found in ethnic-zones.json', () => {
    const allGroups = new Set<string>();

    for (const feature of ethnicZonesData.features) {
      const props = feature.properties as Record<string, unknown>;
      if (typeof props.group === 'string') {
        allGroups.add(props.group);
      }
      if (Array.isArray(props.groups)) {
        for (const g of props.groups) {
          allGroups.add(g as string);
        }
      }
    }

    for (const group of allGroups) {
      expect(ETHNIC_GROUPS).toHaveProperty(group);
    }
  });

  it('overlap features have groups array with 2+ entries', () => {
    const overlapFeatures = ethnicZonesData.features.filter(
      (f) => Array.isArray((f.properties as Record<string, unknown>).groups)
    );
    expect(overlapFeatures.length).toBeGreaterThan(0);

    for (const feature of overlapFeatures) {
      const groups = (feature.properties as Record<string, unknown>).groups as string[];
      expect(groups.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('EthnicOverlay component', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('useEthnicLayers returns empty array when ethnic layer is inactive', async () => {
    const { useEthnicLayers } = await import('@/components/map/layers/EthnicOverlay');
    // Render a test component that calls the hook
    let result: unknown[] = [];
    function TestComponent() {
      result = useEthnicLayers();
      return null;
    }
    render(<TestComponent />);
    expect(result).toEqual([]);
  });

  it('EthnicOverlay component mounts without error when active', async () => {
    useLayerStore.setState({ activeLayers: new Set(['ethnic']) });
    const { EthnicOverlay } = await import('@/components/map/layers/EthnicOverlay');
    expect(() => render(<EthnicOverlay />)).not.toThrow();
  });

  it('LEGEND_REGISTRY contains ethnic entry after EthnicOverlay module is imported', async () => {
    const { LEGEND_REGISTRY } = await import('@/components/map/MapLegend');
    // Force import of EthnicOverlay to trigger registration
    await import('@/components/map/layers/EthnicOverlay');
    const ethnicLegend = LEGEND_REGISTRY.find((c) => c.layerId === 'ethnic');
    expect(ethnicLegend).toBeDefined();
    expect(ethnicLegend!.title).toBe('ETHNIC GROUPS');
    expect(ethnicLegend!.mode).toBe('discrete');
    expect(ethnicLegend!.colorStops).toHaveLength(10);
  });
});
