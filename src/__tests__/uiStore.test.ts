import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage for test isolation
const storageMock: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storageMock[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storageMock[key]; }),
};

vi.stubGlobal('localStorage', localStorageMock);

// Import after stubbing localStorage
import { useUIStore } from '@/stores/uiStore';

function clearStorage() {
  for (const key of Object.keys(storageMock)) {
    delete storageMock[key];
  }
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
}

describe('uiStore', () => {
  beforeEach(() => {
    clearStorage();
    // Reset store to initial state before each test
    useUIStore.setState({
      isDetailPanelOpen: false,
      isCountersCollapsed: false,
    });
  });

  it('has all panels closed/collapsed in initial state', () => {
    const state = useUIStore.getState();
    expect(state.isDetailPanelOpen).toBe(false);
    expect(state.isCountersCollapsed).toBe(false);
  });

  it('openDetailPanel sets isDetailPanelOpen to true', () => {
    useUIStore.getState().openDetailPanel();
    expect(useUIStore.getState().isDetailPanelOpen).toBe(true);
  });

  it('closeDetailPanel sets isDetailPanelOpen to false', () => {
    useUIStore.setState({ isDetailPanelOpen: true });
    useUIStore.getState().closeDetailPanel();
    expect(useUIStore.getState().isDetailPanelOpen).toBe(false);
  });

  it('toggleCounters flips isCountersCollapsed', () => {
    expect(useUIStore.getState().isCountersCollapsed).toBe(false);
    useUIStore.getState().toggleCounters();
    expect(useUIStore.getState().isCountersCollapsed).toBe(true);
    useUIStore.getState().toggleCounters();
    expect(useUIStore.getState().isCountersCollapsed).toBe(false);
  });

  it('does not have entity toggle fields', () => {
    const state = useUIStore.getState();
    expect(state).not.toHaveProperty('showFlights');
    expect(state).not.toHaveProperty('showShips');
    expect(state).not.toHaveProperty('showEvents');
    expect(state).not.toHaveProperty('showAirstrikes');
    expect(state).not.toHaveProperty('showGroundCombat');
    expect(state).not.toHaveProperty('showTargeted');
    expect(state).not.toHaveProperty('showGroundTraffic');
    expect(state).not.toHaveProperty('pulseEnabled');
    expect(state).not.toHaveProperty('showSites');
    expect(state).not.toHaveProperty('showNuclear');
    expect(state).not.toHaveProperty('showNaval');
    expect(state).not.toHaveProperty('showOil');
    expect(state).not.toHaveProperty('showAirbase');
    expect(state).not.toHaveProperty('showDesalination');
    expect(state).not.toHaveProperty('showPort');
    expect(state).not.toHaveProperty('showHealthySites');
    expect(state).not.toHaveProperty('showAttackedSites');
  });

  it('selectEntity sets selectedEntityId', () => {
    useUIStore.getState().selectEntity('flight-abc');
    expect(useUIStore.getState().selectedEntityId).toBe('flight-abc');
  });

  it('hoverEntity sets hoveredEntityId', () => {
    useUIStore.getState().hoverEntity('ship-123');
    expect(useUIStore.getState().hoveredEntityId).toBe('ship-123');
  });

  it('setExpandedAlertSiteId sets expandedAlertSiteId', () => {
    useUIStore.getState().setExpandedAlertSiteId('site-1');
    expect(useUIStore.getState().expandedAlertSiteId).toBe('site-1');
  });

  it('sidebar opens and closes', () => {
    expect(useUIStore.getState().isSidebarOpen).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(false);
  });

  it('openSidebarSection opens sidebar with correct section', () => {
    useUIStore.getState().openSidebarSection('counters');
    expect(useUIStore.getState().isSidebarOpen).toBe(true);
    expect(useUIStore.getState().activeSidebarSection).toBe('counters');
  });

  it('closeSidebar closes sidebar and clears section', () => {
    useUIStore.setState({ isSidebarOpen: true, activeSidebarSection: 'layers' });
    useUIStore.getState().closeSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(false);
    expect(useUIStore.getState().activeSidebarSection).toBeNull();
  });

  it('markets collapse persists to localStorage', () => {
    useUIStore.getState().toggleMarkets();
    expect(useUIStore.getState().isMarketsCollapsed).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('markets-collapsed', 'true');
  });
});
