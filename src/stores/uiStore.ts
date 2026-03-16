import { create } from 'zustand';
import type { UIState } from '@/types/ui';

export const useUIStore = create<UIState>()((set) => ({
  isDetailPanelOpen: false,
  isCountersCollapsed: false,
  isFiltersExpanded: false,
  pulseEnabled: true,
  openDetailPanel: () => set({ isDetailPanelOpen: true }),
  closeDetailPanel: () => set({ isDetailPanelOpen: false }),
  toggleCounters: () => set((s) => ({ isCountersCollapsed: !s.isCountersCollapsed })),
  toggleFilters: () => set((s) => ({ isFiltersExpanded: !s.isFiltersExpanded })),
  togglePulse: () => set((s) => ({ pulseEnabled: !s.pulseEnabled })),
}));
