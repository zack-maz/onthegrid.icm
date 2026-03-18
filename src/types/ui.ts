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

export interface LayerToggles {
  showFlights: boolean;
  showShips: boolean;
  showEvents: boolean;
  showAirstrikes: boolean;
  showGroundCombat: boolean;
  showTargeted: boolean;
  showGroundTraffic: boolean;
  pulseEnabled: boolean;
}

export const LAYER_TOGGLE_DEFAULTS: LayerToggles = {
  showFlights: true,
  showShips: true,
  showEvents: true,
  showAirstrikes: true,
  showGroundCombat: true,
  showTargeted: true,
  showGroundTraffic: false,
  pulseEnabled: true,
};

export interface UIState {
  isDetailPanelOpen: boolean;
  isStatusCollapsed: boolean;
  isCountersCollapsed: boolean;
  isLayersCollapsed: boolean;
  isFiltersCollapsed: boolean;
  pulseEnabled: boolean;
  showGroundTraffic: boolean;
  showFlights: boolean;
  showShips: boolean;
  showEvents: boolean;
  showAirstrikes: boolean;
  showGroundCombat: boolean;
  showTargeted: boolean;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  toggleStatus: () => void;
  toggleCounters: () => void;
  toggleLayers: () => void;
  toggleFilters: () => void;
  togglePulse: () => void;
  toggleGroundTraffic: () => void;
  toggleFlights: () => void;
  toggleShips: () => void;
  toggleEvents: () => void;
  toggleAirstrikes: () => void;
  toggleGroundCombat: () => void;
  toggleTargeted: () => void;
  selectEntity: (id: string | null) => void;
  hoverEntity: (id: string | null) => void;
}
