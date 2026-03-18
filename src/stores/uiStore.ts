import { create } from 'zustand';
import type { UIState, LayerToggles } from '@/types/ui';
import { LAYER_TOGGLE_DEFAULTS } from '@/types/ui';

const STORAGE_KEY = 'layerToggles';

export function loadPersistedToggles(): LayerToggles {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migration: discard old schema if it has showDrones/showMissiles/showNews
      if ('showDrones' in parsed || 'showMissiles' in parsed || 'showNews' in parsed) {
        return { ...LAYER_TOGGLE_DEFAULTS };
      }
      return { ...LAYER_TOGGLE_DEFAULTS, ...parsed };
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
    showEvents: state.showEvents,
    showAirstrikes: state.showAirstrikes,
    showGroundCombat: state.showGroundCombat,
    showTargeted: state.showTargeted,
    showOtherConflict: state.showOtherConflict,
    showGroundTraffic: state.showGroundTraffic,
    pulseEnabled: state.pulseEnabled,
  };
}

const initial = loadPersistedToggles();

export const useUIStore = create<UIState>()((set, get) => ({
  isDetailPanelOpen: false,
  isStatusCollapsed: false,
  isCountersCollapsed: false,
  isLayersCollapsed: false,
  pulseEnabled: initial.pulseEnabled,
  showGroundTraffic: initial.showGroundTraffic,
  showFlights: initial.showFlights,
  showShips: initial.showShips,
  showEvents: initial.showEvents,
  showAirstrikes: initial.showAirstrikes,
  showGroundCombat: initial.showGroundCombat,
  showTargeted: initial.showTargeted,
  showOtherConflict: initial.showOtherConflict,
  selectedEntityId: null,
  hoveredEntityId: null,
  openDetailPanel: () => set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  toggleStatus: () => set((s) => ({ isStatusCollapsed: !s.isStatusCollapsed })),
  toggleCounters: () => set((s) => ({ isCountersCollapsed: !s.isCountersCollapsed })),
  toggleLayers: () => set((s) => ({ isLayersCollapsed: !s.isLayersCollapsed })),
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
  toggleEvents: () => {
    set((s) => ({ showEvents: !s.showEvents }));
    persistToggles(getToggles(get()));
  },
  toggleAirstrikes: () => {
    set((s) => ({ showAirstrikes: !s.showAirstrikes }));
    persistToggles(getToggles(get()));
  },
  toggleGroundCombat: () => {
    set((s) => ({ showGroundCombat: !s.showGroundCombat }));
    persistToggles(getToggles(get()));
  },
  toggleTargeted: () => {
    set((s) => ({ showTargeted: !s.showTargeted }));
    persistToggles(getToggles(get()));
  },
  toggleOtherConflict: () => {
    set((s) => ({ showOtherConflict: !s.showOtherConflict }));
    persistToggles(getToggles(get()));
  },
  selectEntity: (id) => set({ selectedEntityId: id }),
  hoverEntity: (id) => set({ hoveredEntityId: id }),
}));
