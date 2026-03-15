export interface UIState {
  isDetailPanelOpen: boolean;
  isCountersCollapsed: boolean;
  isFiltersExpanded: boolean;
  pulseEnabled: boolean;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  toggleCounters: () => void;
  toggleFilters: () => void;
  togglePulse: () => void;
}
