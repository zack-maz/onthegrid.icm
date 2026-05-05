import { describe, it, expect, beforeEach } from 'vitest';

import { useLayerStore } from '@/stores/layerStore';

describe('layerStore', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('starts with no active layers', () => {
    const { activeLayers } = useLayerStore.getState();
    expect(activeLayers.size).toBe(0);
  });

  it('toggleLayer adds a layer', () => {
    useLayerStore.getState().toggleLayer('geographic');
    expect(useLayerStore.getState().activeLayers.has('geographic')).toBe(true);
  });

  it('toggleLayer removes an active layer', () => {
    useLayerStore.getState().toggleLayer('geographic');
    expect(useLayerStore.getState().activeLayers.has('geographic')).toBe(true);
    useLayerStore.getState().toggleLayer('geographic');
    expect(useLayerStore.getState().activeLayers.has('geographic')).toBe(false);
  });

  it('supports multiple active layers', () => {
    useLayerStore.getState().toggleLayer('geographic');
    useLayerStore.getState().toggleLayer('weather');
    const { activeLayers } = useLayerStore.getState();
    expect(activeLayers.has('geographic')).toBe(true);
    expect(activeLayers.has('weather')).toBe(true);
    expect(activeLayers.size).toBe(2);
  });

  it('toggling one layer does not affect others', () => {
    useLayerStore.getState().toggleLayer('geographic');
    useLayerStore.getState().toggleLayer('weather');
    useLayerStore.getState().toggleLayer('geographic'); // toggle off
    const { activeLayers } = useLayerStore.getState();
    expect(activeLayers.has('geographic')).toBe(false);
    expect(activeLayers.has('weather')).toBe(true);
    expect(activeLayers.size).toBe(1);
  });

  it('state resets to empty on fresh store', () => {
    useLayerStore.getState().toggleLayer('threat');
    useLayerStore.getState().toggleLayer('water');
    // Reset
    useLayerStore.setState({ activeLayers: new Set() });
    expect(useLayerStore.getState().activeLayers.size).toBe(0);
  });
});
