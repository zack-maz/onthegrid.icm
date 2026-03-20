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
      if ('showDrones' in parsed || 'showMissiles' in parsed || 'showNews' in parsed || 'showOtherConflict' in parsed) {
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
    showGroundTraffic: state.showGroundTraffic,
    pulseEnabled: state.pulseEnabled,
    showSites: state.showSites,
    showNuclear: state.showNuclear,
    showNaval: state.showNaval,
    showOil: state.showOil,
    showAirbase: state.showAirbase,
    showDam: state.showDam,
    showPort: state.showPort,
  };
}

const initial = loadPersistedToggles();

export const useUIStore = create<UIState>()((set, get) => ({
  isDetailPanelOpen: false,
  isStatusCollapsed: false,
  isCountersCollapsed: false,
  isLayersCollapsed: false,
  isFiltersCollapsed: true,
  isFlightFiltersOpen: true,
  isShipFiltersOpen: true,
  isEventFiltersOpen: true,
  pulseEnabled: initial.pulseEnabled,
  showGroundTraffic: initial.showGroundTraffic,
  showFlights: initial.showFlights,
  showShips: initial.showShips,
  showEvents: initial.showEvents,
  showAirstrikes: initial.showAirstrikes,
  showGroundCombat: initial.showGroundCombat,
  showTargeted: initial.showTargeted,
  showSites: initial.showSites,
  showNuclear: initial.showNuclear,
  showNaval: initial.showNaval,
  showOil: initial.showOil,
  showAirbase: initial.showAirbase,
  showDam: initial.showDam,
  showPort: initial.showPort,
  selectedEntityId: null,
  hoveredEntityId: null,
  openDetailPanel: () => set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  toggleStatus: () => set((s) => ({ isStatusCollapsed: !s.isStatusCollapsed })),
  toggleCounters: () => set((s) => ({ isCountersCollapsed: !s.isCountersCollapsed })),
  toggleLayers: () => set((s) => ({ isLayersCollapsed: !s.isLayersCollapsed })),
  toggleFilters: () => set((s) => ({ isFiltersCollapsed: !s.isFiltersCollapsed })),
  toggleFlightFilters: () => set((s) => ({ isFlightFiltersOpen: !s.isFlightFiltersOpen })),
  toggleShipFilters: () => set((s) => ({ isShipFiltersOpen: !s.isShipFiltersOpen })),
  toggleEventFilters: () => set((s) => ({ isEventFiltersOpen: !s.isEventFiltersOpen })),
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
    const wasOff = !get().showEvents;
    if (wasOff) {
      set({ showEvents: true, showAirstrikes: true, showGroundCombat: true, showTargeted: true });
    } else {
      set({ showEvents: false });
    }
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
  toggleSites: () => {
    const wasOff = !get().showSites;
    if (wasOff) {
      set({ showSites: true, showNuclear: true, showNaval: true, showOil: true, showAirbase: true, showDam: true, showPort: true });
    } else {
      set({ showSites: false });
    }
    persistToggles(getToggles(get()));
  },
  toggleNuclear: () => {
    set((s) => ({ showNuclear: !s.showNuclear }));
    persistToggles(getToggles(get()));
  },
  toggleNaval: () => {
    set((s) => ({ showNaval: !s.showNaval }));
    persistToggles(getToggles(get()));
  },
  toggleOil: () => {
    set((s) => ({ showOil: !s.showOil }));
    persistToggles(getToggles(get()));
  },
  toggleAirbase: () => {
    set((s) => ({ showAirbase: !s.showAirbase }));
    persistToggles(getToggles(get()));
  },
  toggleDam: () => {
    set((s) => ({ showDam: !s.showDam }));
    persistToggles(getToggles(get()));
  },
  togglePort: () => {
    set((s) => ({ showPort: !s.showPort }));
    persistToggles(getToggles(get()));
  },
  selectEntity: (id) => set({ selectedEntityId: id }),
  hoverEntity: (id) => set({ hoveredEntityId: id }),
}));
