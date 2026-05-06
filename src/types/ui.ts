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

/**
 * Phase 28.2 W5 D-22/D-27 — DevApiStatus modal tab identity (post-merge).
 *
 * Four mutually-exclusive tabs in the centered DevApiStatus modal. Order
 * matches D-27 (API Health first):
 *   - apiHealth: Phase 28.2 W5 — merged API Health tab. Absorbs the deleted
 *                Overview tab body (polling-store metrics + LLMPipelineSection)
 *                into the prior All APIs tab. Tier-grouped /api/* table from
 *                useHealthStatusContext() + per-store rows + LLM pipeline
 *                progress + new diagnostic blocks (tier summary banner,
 *                per-endpoint quality, retry button, recent-fetch sparkline).
 *                Bearer-gated via shouldRenderDashboard() (D-26).
 *   - water:     WaterFiltersSection (byCountry, byType, Overpass health, etc)
 *   - sites:     SitesFiltersSection (byType, byCountry, rejections, health)
 *   - events:    EventsFiltersSection — Phase 27.4 Plan 09.
 */
export type DevApiStatusTab = 'apiHealth' | 'water' | 'sites' | 'events';

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
  // Phase 27.3.1 Plan 12 G6 — DevApiStatus top-bar modal
  isDevApiStatusOpen: boolean;
  activeDevApiStatusTab: DevApiStatusTab;
  openDevApiStatus: () => void;
  closeDevApiStatus: () => void;
  setDevApiStatusTab: (tab: DevApiStatusTab) => void;
  // Phase 27.4.4 Plan 02 — Dashboard auth modal. Opens when a not-yet-
  // authenticated user clicks the DevApiStatusTrigger in production. On
  // successful probe of /api/dashboard/auth-check the key is persisted to
  // localStorage and the trigger immediately opens DevApiStatus.
  isDashboardAuthOpen: boolean;
  openDashboardAuth: () => void;
  closeDashboardAuth: () => void;
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
};
