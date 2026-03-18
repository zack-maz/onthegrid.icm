import { create } from 'zustand';
import type { UIState, LayerToggles } from '@/types/ui';
import { LAYER_TOGGLE_DEFAULTS } from '@/types/ui';

const STORAGE_KEY = 'layerToggles';

export function loadPersistedToggles(): LayerToggles {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...LAYER_TOGGLE_DEFAULTS, ...JSON.parse(stored) };
    }
  } catch { /* localStorage unavailable or corrupted JSON */ }
  return { ...LAYER_TOGGLE_DEFAULTS };
}

function persistToggles(toggles: LayerToggles): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles)); } catch { /* silently fail */ }
}

function getToggles(state: UIState): LayerToggles {
  return {
    showFlights: state.showFlights,
    showShips: state.showShips,
    showDrones: state.showDrones,
    showMissiles: state.showMissiles,
    showGroundTraffic: state.showGroundTraffic,
    pulseEnabled: state.pulseEnabled,
    showNews: state.showNews,
  };
}

const initial = loadPersistedToggles();

export const useUIStore = create<UIState>()((set, get) => ({
  isDetailPanelOpen: false,
  isCountersCollapsed: false,
  pulseEnabled: initial.pulseEnabled,
  showGroundTraffic: initial.showGroundTraffic,
  showFlights: initial.showFlights,
  showShips: initial.showShips,
  showDrones: initial.showDrones,
  showMissiles: initial.showMissiles,
  showNews: initial.showNews,
  selectedEntityId: null,
  hoveredEntityId: null,
  openDetailPanel: () => set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  toggleCounters: () => set((s) => ({ isCountersCollapsed: !s.isCountersCollapsed })),
  togglePulse: () => {
    set((s) => ({ pulseEnabled: !s.pulseEnabled }));
    persistToggles(getToggles(get()));
  },
  toggleGroundTraffic: () => {
    set((s) => ({ showGroundTraffic: !s.showGroundTraffic }));
    persistToggles(getToggles(get()));
  },
  toggleFlights: () => {
    set((s) => ({ showFlights: !s.showFlights }));
    persistToggles(getToggles(get()));
  },
  toggleShips: () => {
    set((s) => ({ showShips: !s.showShips }));
    persistToggles(getToggles(get()));
  },
  toggleDrones: () => {
    set((s) => ({ showDrones: !s.showDrones }));
    persistToggles(getToggles(get()));
  },
  toggleMissiles: () => {
    set((s) => ({ showMissiles: !s.showMissiles }));
    persistToggles(getToggles(get()));
  },
  toggleNews: () => {
    set((s) => ({ showNews: !s.showNews }));
    persistToggles(getToggles(get()));
  },
  selectEntity: (id) => set({ selectedEntityId: id }),
  hoverEntity: (id) => set({ hoveredEntityId: id }),
}));
