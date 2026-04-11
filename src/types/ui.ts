export type FlightSource = 'opensky' | 'adsblol';

// Re-export for frontend convenience
export type { ConflictEventType } from '../../server/types.js';

import type { ConflictEventType } from '../../server/types.js';

export const CONFLICT_TOGGLE_GROUPS = {
  showAirstrikes: ['airstrike'] as const,
  showOnGround: ['on_ground'] as const,
  showExplosions: ['explosion'] as const,
  showTargeted: ['targeted'] as const,
  showOther: ['other'] as const,
} as const;

// Derived from toggle groups — single source of truth
const CONFLICT_EVENT_TYPES = new Set<string>(Object.values(CONFLICT_TOGGLE_GROUPS).flat());

export function isConflictEventType(type: string): type is ConflictEventType {
  return CONFLICT_EVENT_TYPES.has(type);
}

/** Human-readable labels for each ConflictEventType. Shared across tooltip, detail panel, etc. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  airstrike: 'Airstrike',
  on_ground: 'Ground',
  explosion: 'Explosion',
  targeted: 'Targeted',
  other: 'Other',
};

/** Represents a connected-component cluster of threat grid cells */
export interface ThreatCluster {
  id: string;
  centroidLat: number;
  centroidLng: number;
  cells: Array<{
    lat: number;
    lng: number;
    eventCount: number;
    dominantType: string;
    latestTime: number;
    totalFatalities: number;
    totalMentions: number;
    totalSources: number;
    avgGoldstein: number;
    clusterWeight: number;
    eventIds: string[];
  }>;
  eventCount: number;
  totalWeight: number;
  dominantType: string;
  totalFatalities: number;
  latestTime: number;
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  eventIds: string[];
}

/** A single entry in the detail panel navigation stack */
export interface PanelView {
  entityId: string | null;
  cluster: ThreatCluster | null;
  breadcrumbLabel: string;
}

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
  isSiteFiltersOpen: boolean;
  isWaterFiltersOpen: boolean;
  isSidebarOpen: boolean;
  activeSidebarSection: SidebarSection | null;
  isMarketsCollapsed: boolean;
  selectedEntityId: string | null;
  selectedCluster: ThreatCluster | null;
  hoveredEntityId: string | null;
  expandedAlertSiteId: string | null;
  navigationStack: PanelView[];
  slideDirection: 'forward' | 'back' | null;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  toggleStatus: () => void;
  toggleCounters: () => void;
  toggleLayers: () => void;
  toggleFilters: () => void;
  toggleFlightFilters: () => void;
  toggleShipFilters: () => void;
  toggleEventFilters: () => void;
  toggleSiteFilters: () => void;
  toggleWaterFilters: () => void;
  selectEntity: (id: string | null) => void;
  setSelectedCluster: (cluster: ThreatCluster | null) => void;
  hoverEntity: (id: string | null) => void;
  setExpandedAlertSiteId: (id: string | null) => void;
  toggleSidebar: () => void;
  openSidebarSection: (section: SidebarSection) => void;
  closeSidebar: () => void;
  toggleMarkets: () => void;
  collapseMarkets: () => void;
  pushView: (view: PanelView) => void;
  goBack: () => void;
  clearStack: () => void;
}

/** Human-readable labels for each SiteType */
export const SITE_TYPE_LABELS: Record<string, string> = {
  nuclear: 'Nuclear',
  naval: 'Naval',
  oil: 'Oil Refinery',
  airbase: 'Airbase',
  port: 'Port',
};

export const WATER_TYPE_LABELS: Record<string, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination',
  treatment_plant: 'Treatment',
};
