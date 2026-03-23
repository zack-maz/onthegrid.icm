import { create } from 'zustand';

export type VisualizationLayerId =
  | 'geographic'
  | 'weather'
  | 'threat'
  | 'political'
  | 'satellite'
  | 'infrastructure';

interface LayerState {
  activeLayers: Set<VisualizationLayerId>;
  toggleLayer: (id: VisualizationLayerId) => void;
}

export const useLayerStore = create<LayerState>()((set) => ({
  activeLayers: new Set<VisualizationLayerId>(),
  toggleLayer: (id) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { activeLayers: next };
    }),
}));
