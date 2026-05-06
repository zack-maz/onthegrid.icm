import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage for test isolation
const storageMock: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storageMock[key];
  }),
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

  describe('Phase 27.3.1 Plan 12 — DevApiStatus modal state (G6)', () => {
    beforeEach(() => {
      // Reset modal state between tests
      useUIStore.setState({
        isDevApiStatusOpen: false,
        activeDevApiStatusTab: 'apiHealth',
      });
    });

    it('isDevApiStatusOpen defaults to false', () => {
      expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
    });

    it('activeDevApiStatusTab defaults to apiHealth (Phase 28.2 W5 D-22)', () => {
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('apiHealth');
    });

    it('openDevApiStatus sets isDevApiStatusOpen to true', () => {
      useUIStore.getState().openDevApiStatus();
      expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
    });

    it('closeDevApiStatus sets isDevApiStatusOpen to false', () => {
      useUIStore.setState({ isDevApiStatusOpen: true });
      useUIStore.getState().closeDevApiStatus();
      expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
    });

    it('setDevApiStatusTab("water") sets active tab to water', () => {
      useUIStore.getState().setDevApiStatusTab('water');
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');
    });

    it('setDevApiStatusTab("sites") sets active tab to sites', () => {
      useUIStore.getState().setDevApiStatusTab('sites');
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('sites');
    });

    it('setDevApiStatusTab("events") sets active tab to events (Phase 27.4 Plan 09)', () => {
      useUIStore.getState().setDevApiStatusTab('events');
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('events');
    });

    it('tab choice persists across open/close cycle (session persistence)', () => {
      useUIStore.getState().openDevApiStatus();
      useUIStore.getState().setDevApiStatusTab('water');
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');

      // Close the modal — tab selection should survive
      useUIStore.getState().closeDevApiStatus();
      expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');

      // Re-open the modal — still on water tab
      useUIStore.getState().openDevApiStatus();
      expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');
    });
  });

  describe('navigation stack', () => {
    beforeEach(() => {
      useUIStore.setState({
        navigationStack: [],
        slideDirection: null,
        selectedEntityId: null,
        selectedCluster: null,
      });
    });

    it('navigationStack starts as empty array', () => {
      expect(useUIStore.getState().navigationStack).toEqual([]);
    });

    it('slideDirection starts as null', () => {
      expect(useUIStore.getState().slideDirection).toBeNull();
    });

    it('pushView adds entry to navigationStack and sets slideDirection to forward', () => {
      const view = { entityId: 'flight-1', cluster: null, breadcrumbLabel: 'FLIGHT ABC123' };
      useUIStore.getState().pushView(view);
      const state = useUIStore.getState();
      expect(state.navigationStack).toEqual([view]);
      expect(state.slideDirection).toBe('forward');
    });

    it('pushView appends (does not replace) existing stack entries', () => {
      const view1 = { entityId: 'flight-1', cluster: null, breadcrumbLabel: 'FLIGHT ABC123' };
      const view2 = { entityId: 'ship-1', cluster: null, breadcrumbLabel: 'SHIP VESSEL' };
      useUIStore.getState().pushView(view1);
      useUIStore.getState().pushView(view2);
      const state = useUIStore.getState();
      expect(state.navigationStack).toEqual([view1, view2]);
    });

    it('goBack pops last entry and restores selectedEntityId from it', () => {
      const view = { entityId: 'flight-1', cluster: null, breadcrumbLabel: 'FLIGHT ABC123' };
      useUIStore.setState({
        navigationStack: [view],
        selectedEntityId: 'ship-2',
        selectedCluster: null,
      });
      useUIStore.getState().goBack();
      const state = useUIStore.getState();
      expect(state.navigationStack).toEqual([]);
      expect(state.selectedEntityId).toBe('flight-1');
    });

    it('goBack restores selectedCluster from popped entry (bypasses mutual exclusion)', () => {
      const cluster = {
        id: 'cluster-1',
        centroidLat: 33.0,
        centroidLng: 44.0,
        cells: [],
        eventCount: 5,
        totalWeight: 10,
        dominantType: 'airstrike',
        totalFatalities: 0,
        latestTime: Date.now(),
        boundingBox: { minLat: 32, maxLat: 34, minLng: 43, maxLng: 45 },
        eventIds: ['e1', 'e2'],
      };
      const view = { entityId: null, cluster, breadcrumbLabel: 'Cluster(5)' };
      useUIStore.setState({
        navigationStack: [view],
        selectedEntityId: 'flight-1',
        selectedCluster: null,
      });
      useUIStore.getState().goBack();
      const state = useUIStore.getState();
      expect(state.selectedCluster).toEqual(cluster);
      // Mutual exclusion bypass: cluster is set directly, entityId from the view is null
      expect(state.selectedEntityId).toBeNull();
    });

    it('goBack sets slideDirection to back', () => {
      const view = { entityId: 'flight-1', cluster: null, breadcrumbLabel: 'FLIGHT ABC123' };
      useUIStore.setState({ navigationStack: [view] });
      useUIStore.getState().goBack();
      expect(useUIStore.getState().slideDirection).toBe('back');
    });

    it('goBack on empty stack returns empty object (no state change)', () => {
      useUIStore.setState({
        navigationStack: [],
        slideDirection: 'forward',
        selectedEntityId: 'flight-1',
        selectedCluster: null,
      });
      useUIStore.getState().goBack();
      const state = useUIStore.getState();
      // No state change
      expect(state.navigationStack).toEqual([]);
      expect(state.slideDirection).toBe('forward');
      expect(state.selectedEntityId).toBe('flight-1');
    });

    it('clearStack empties navigationStack and sets slideDirection to null', () => {
      const view = { entityId: 'flight-1', cluster: null, breadcrumbLabel: 'FLIGHT ABC123' };
      useUIStore.setState({
        navigationStack: [view],
        slideDirection: 'forward',
      });
      useUIStore.getState().clearStack();
      const state = useUIStore.getState();
      expect(state.navigationStack).toEqual([]);
      expect(state.slideDirection).toBeNull();
    });

    it('goBack with cluster entry restores cluster AND sets entityId to null', () => {
      const cluster = {
        id: 'cluster-2',
        centroidLat: 35.0,
        centroidLng: 51.0,
        cells: [],
        eventCount: 3,
        totalWeight: 7,
        dominantType: 'on_ground',
        totalFatalities: 2,
        latestTime: Date.now(),
        boundingBox: { minLat: 34, maxLat: 36, minLng: 50, maxLng: 52 },
        eventIds: ['e3'],
      };
      const view = { entityId: null, cluster, breadcrumbLabel: 'Cluster(3)' };
      useUIStore.setState({
        navigationStack: [view],
        selectedEntityId: 'some-entity',
        selectedCluster: null,
      });
      useUIStore.getState().goBack();
      const state = useUIStore.getState();
      expect(state.selectedCluster).toEqual(cluster);
      expect(state.selectedEntityId).toBeNull();
    });

    it('goBack with entity entry restores entityId AND sets cluster to null', () => {
      const view = { entityId: 'flight-99', cluster: null, breadcrumbLabel: 'FLIGHT XYZ' };
      const activeCluster = {
        id: 'cluster-active',
        centroidLat: 30.0,
        centroidLng: 50.0,
        cells: [],
        eventCount: 1,
        totalWeight: 1,
        dominantType: 'airstrike',
        totalFatalities: 0,
        latestTime: Date.now(),
        boundingBox: { minLat: 29, maxLat: 31, minLng: 49, maxLng: 51 },
        eventIds: ['e4'],
      };
      useUIStore.setState({
        navigationStack: [view],
        selectedEntityId: null,
        selectedCluster: activeCluster,
      });
      useUIStore.getState().goBack();
      const state = useUIStore.getState();
      expect(state.selectedEntityId).toBe('flight-99');
      expect(state.selectedCluster).toBeNull();
    });
  });
});
