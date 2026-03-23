export type FlightSource = 'opensky' | 'adsb' | 'adsblol';

// Re-export for frontend convenience
export type { ConflictEventType } from '../../server/types.js';

import type { ConflictEventType } from '../../server/types.js';

export const CONFLICT_TOGGLE_GROUPS = {
  showAirstrikes: ['airstrike'] as const,
  showGroundCombat: ['ground_combat', 'shelling', 'bombing', 'assault', 'blockade', 'ceasefire_violation', 'mass_violence', 'wmd'] as const,
  showTargeted: ['assassination', 'abduction'] as const,
} as const;

export type ConflictToggleKey = keyof typeof CONFLICT_TOGGLE_GROUPS;

// Derived from toggle groups — single source of truth
const CONFLICT_EVENT_TYPES = new Set<string>(
  Object.values(CONFLICT_TOGGLE_GROUPS).flat(),
);

export function isConflictEventType(type: string): type is ConflictEventType {
  return CONFLICT_EVENT_TYPES.has(type);
}

/** Human-readable labels for each ConflictEventType. Shared across tooltip, detail panel, etc. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  airstrike: 'Airstrike',
  ground_combat: 'Ground Combat',
  shelling: 'Shelling',
  bombing: 'Bombing',
  assassination: 'Assassination',
  abduction: 'Abduction',
  assault: 'Assault',
  blockade: 'Blockade',
  ceasefire_violation: 'Ceasefire Violation',
  mass_violence: 'Mass Violence',
  wmd: 'WMD',
};

export type SidebarSection = 'counters' | 'layers' | 'filters';

export interface UIState {
  isDetailPanelOpen: boolean;
  isStatusCollapsed: boolean;
  isCountersCollapsed: boolean;
  isLayersCollapsed: boolean;
  isFiltersCollapsed: boolean;
  isFlightFiltersOpen: boolean;
  isShipFiltersOpen: boolean;
  isEventFiltersOpen: boolean;
  isSidebarOpen: boolean;
  activeSidebarSection: SidebarSection | null;
  isMarketsCollapsed: boolean;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  expandedAlertSiteId: string | null;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  toggleStatus: () => void;
  toggleCounters: () => void;
  toggleLayers: () => void;
  toggleFilters: () => void;
  toggleFlightFilters: () => void;
  toggleShipFilters: () => void;
  toggleEventFilters: () => void;
  selectEntity: (id: string | null) => void;
  hoverEntity: (id: string | null) => void;
  setExpandedAlertSiteId: (id: string | null) => void;
  toggleSidebar: () => void;
  openSidebarSection: (section: SidebarSection) => void;
  closeSidebar: () => void;
  toggleMarkets: () => void;
  collapseMarkets: () => void;
}

/** Human-readable labels for each SiteType */
export const SITE_TYPE_LABELS: Record<string, string> = {
  nuclear: 'Nuclear',
  naval: 'Naval',
  oil: 'Oil Refinery',
  airbase: 'Airbase',
  desalination: 'Desalination',
  port: 'Port',
};
