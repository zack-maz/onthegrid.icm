import { create } from 'zustand';
import type { UIState, PanelView } from '@/types/ui';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

export const useUIStore = create<UIState>()((set, get) => ({
  isDetailPanelOpen: false,
  isStatusCollapsed: false,
  isCountersCollapsed: false,
  isLayersCollapsed: false,
  isFiltersCollapsed: true,
  isFlightFiltersOpen: true,
  isShipFiltersOpen: true,
  isEventFiltersOpen: true,
  isSiteFiltersOpen: true,
  isWaterFiltersOpen: true,
  isSidebarOpen: false,
  activeSidebarSection: null,
  isMarketsCollapsed: readBool('markets-collapsed', false),
  selectedEntityId: null,
  selectedCluster: null,
  hoveredEntityId: null,
  expandedAlertSiteId: null,
  navigationStack: [],
  slideDirection: null,
  openDetailPanel: () => set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  toggleStatus: () => set((s) => ({ isStatusCollapsed: !s.isStatusCollapsed })),
  toggleCounters: () => set((s) => ({ isCountersCollapsed: !s.isCountersCollapsed })),
  toggleLayers: () => set((s) => ({ isLayersCollapsed: !s.isLayersCollapsed })),
  toggleFilters: () => set((s) => ({ isFiltersCollapsed: !s.isFiltersCollapsed })),
  toggleFlightFilters: () => set((s) => ({ isFlightFiltersOpen: !s.isFlightFiltersOpen })),
  toggleShipFilters: () => set((s) => ({ isShipFiltersOpen: !s.isShipFiltersOpen })),
  toggleEventFilters: () => set((s) => ({ isEventFiltersOpen: !s.isEventFiltersOpen })),
  toggleSiteFilters: () => set((s) => ({ isSiteFiltersOpen: !s.isSiteFiltersOpen })),
  toggleWaterFilters: () => set((s) => ({ isWaterFiltersOpen: !s.isWaterFiltersOpen })),
  toggleSidebar: () => {
    const { isSidebarOpen } = get();
    if (isSidebarOpen) {
      set({ isSidebarOpen: false, activeSidebarSection: null });
    } else {
      set({ isSidebarOpen: true });
    }
  },
  openSidebarSection: (section) => {
    const { isSidebarOpen, activeSidebarSection } = get();
    // Expand the clicked section, collapse the others
    const collapseState = {
      isCountersCollapsed: section !== 'counters',
      isLayersCollapsed: section !== 'layers',
      isFiltersCollapsed: section !== 'filters',
    };
    if (!isSidebarOpen) {
      set({ isSidebarOpen: true, activeSidebarSection: section, ...collapseState });
    } else if (activeSidebarSection === section) {
      set({ isSidebarOpen: false, activeSidebarSection: null });
    } else {
      set({ activeSidebarSection: section, ...collapseState });
    }
  },
  closeSidebar: () => set({ isSidebarOpen: false, activeSidebarSection: null }),
  toggleMarkets: () => {
    const next = !get().isMarketsCollapsed;
    set({ isMarketsCollapsed: next });
    try {
      localStorage.setItem('markets-collapsed', String(next));
    } catch {
      /* */
    }
  },
  collapseMarkets: () => {
    set({ isMarketsCollapsed: true });
    try {
      localStorage.setItem('markets-collapsed', 'true');
    } catch {
      /* */
    }
  },
  selectEntity: (id) => set({ selectedEntityId: id, selectedCluster: null }),
  setSelectedCluster: (cluster) => set({ selectedCluster: cluster, selectedEntityId: null }),
  hoverEntity: (id) => set({ hoveredEntityId: id }),
  setExpandedAlertSiteId: (id) => set({ expandedAlertSiteId: id }),
  pushView: (view: PanelView) =>
    set((s) => ({
      navigationStack: [...s.navigationStack, view],
      slideDirection: 'forward' as const,
    })),
  goBack: () =>
    set((s) => {
      const stack = [...s.navigationStack];
      const prev = stack.pop();
      if (!prev) return {};
      // Bypass mutual exclusion — set both directly in one atomic call
      return {
        navigationStack: stack,
        selectedEntityId: prev.entityId,
        selectedCluster: prev.cluster,
        slideDirection: 'back' as const,
      };
    }),
  clearStack: () =>
    set({
      navigationStack: [],
      slideDirection: null,
    }),
}));
