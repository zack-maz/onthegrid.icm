export type FlightSource = 'opensky' | 'adsb' | 'adsblol';

export interface LayerToggles {
  showFlights: boolean;
  showShips: boolean;
  showDrones: boolean;
  showMissiles: boolean;
  showGroundTraffic: boolean;
  pulseEnabled: boolean;
  showNews: boolean;
}

export const LAYER_TOGGLE_DEFAULTS: LayerToggles = {
  showFlights: true,
  showShips: true,
  showDrones: true,
  showMissiles: true,
  showGroundTraffic: false,
  pulseEnabled: true,
  showNews: true,
};

export interface UIState {
  isDetailPanelOpen: boolean;
  isCountersCollapsed: boolean;
  pulseEnabled: boolean;
  showGroundTraffic: boolean;
  showFlights: boolean;
  showShips: boolean;
  showDrones: boolean;
  showMissiles: boolean;
  showNews: boolean;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  openDetailPanel: () => void;
  closeDetailPanel: () => void;
  toggleCounters: () => void;
  togglePulse: () => void;
  toggleGroundTraffic: () => void;
  toggleFlights: () => void;
  toggleShips: () => void;
  toggleDrones: () => void;
  toggleMissiles: () => void;
  toggleNews: () => void;
  selectEntity: (id: string | null) => void;
  hoverEntity: (id: string | null) => void;
}
