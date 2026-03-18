import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYER_TOGGLE_DEFAULTS } from '@/types/ui';

const STORAGE_KEY = 'layerToggles';

// Mock localStorage for test isolation
const storageMock: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storageMock[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storageMock[key]; }),
};

vi.stubGlobal('localStorage', localStorageMock);

// Import after stubbing localStorage
import { useUIStore, loadPersistedToggles } from '@/stores/uiStore';

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
      pulseEnabled: true,
      showGroundTraffic: false,
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showNews: true,
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

});

describe('uiStore layer toggles', () => {
  beforeEach(() => {
    clearStorage();
    // Reset to defaults
    useUIStore.setState({
      showFlights: true,
      showShips: true,
      showDrones: true,
      showMissiles: true,
      showNews: true,
      pulseEnabled: true,
      showGroundTraffic: false,
    });
  });

  describe('defaults', () => {
    it('showFlights defaults to true', () => {
      expect(useUIStore.getState().showFlights).toBe(true);
    });

    it('showShips defaults to true', () => {
      expect(useUIStore.getState().showShips).toBe(true);
    });

    it('showDrones defaults to true', () => {
      expect(useUIStore.getState().showDrones).toBe(true);
    });

    it('showMissiles defaults to true', () => {
      expect(useUIStore.getState().showMissiles).toBe(true);
    });

    it('showNews defaults to true', () => {
      expect(useUIStore.getState().showNews).toBe(true);
    });
  });

  describe('toggle actions', () => {
    it('toggleFlights flips showFlights', () => {
      expect(useUIStore.getState().showFlights).toBe(true);
      useUIStore.getState().toggleFlights();
      expect(useUIStore.getState().showFlights).toBe(false);
      useUIStore.getState().toggleFlights();
      expect(useUIStore.getState().showFlights).toBe(true);
    });

    it('toggleShips flips showShips', () => {
      expect(useUIStore.getState().showShips).toBe(true);
      useUIStore.getState().toggleShips();
      expect(useUIStore.getState().showShips).toBe(false);
      useUIStore.getState().toggleShips();
      expect(useUIStore.getState().showShips).toBe(true);
    });

    it('toggleDrones flips showDrones', () => {
      expect(useUIStore.getState().showDrones).toBe(true);
      useUIStore.getState().toggleDrones();
      expect(useUIStore.getState().showDrones).toBe(false);
      useUIStore.getState().toggleDrones();
      expect(useUIStore.getState().showDrones).toBe(true);
    });

    it('toggleMissiles flips showMissiles', () => {
      expect(useUIStore.getState().showMissiles).toBe(true);
      useUIStore.getState().toggleMissiles();
      expect(useUIStore.getState().showMissiles).toBe(false);
      useUIStore.getState().toggleMissiles();
      expect(useUIStore.getState().showMissiles).toBe(true);
    });

    it('toggleNews flips showNews', () => {
      expect(useUIStore.getState().showNews).toBe(true);
      useUIStore.getState().toggleNews();
      expect(useUIStore.getState().showNews).toBe(false);
      useUIStore.getState().toggleNews();
      expect(useUIStore.getState().showNews).toBe(true);
    });
  });

  describe('localStorage persistence', () => {
    it('all toggle changes persist to localStorage under layerToggles key', () => {
      useUIStore.getState().toggleFlights();
      const stored = JSON.parse(storageMock[STORAGE_KEY]);
      expect(stored.showFlights).toBe(false);
    });

    it('pulseEnabled is persisted as part of layerToggles', () => {
      useUIStore.getState().togglePulse();
      const stored = JSON.parse(storageMock[STORAGE_KEY]);
      expect(stored.pulseEnabled).toBe(false);
    });

    it('showGroundTraffic is persisted as part of layerToggles', () => {
      useUIStore.getState().toggleGroundTraffic();
      const stored = JSON.parse(storageMock[STORAGE_KEY]);
      expect(stored.showGroundTraffic).toBe(true);
    });

    it('stored toggles survive load/store roundtrip', () => {
      // Write some non-default values
      const customToggles = {
        ...LAYER_TOGGLE_DEFAULTS,
        showFlights: false,
        showNews: false,
      };
      storageMock[STORAGE_KEY] = JSON.stringify(customToggles);

      const loaded = loadPersistedToggles();
      expect(loaded.showFlights).toBe(false);
      expect(loaded.showNews).toBe(false);
      // Defaults for unmodified keys
      expect(loaded.showShips).toBe(true);
      expect(loaded.showDrones).toBe(true);
    });

    it('corrupted localStorage does not crash, falls back to defaults', () => {
      storageMock[STORAGE_KEY] = '{invalid json!!!';
      const loaded = loadPersistedToggles();
      expect(loaded).toEqual(LAYER_TOGGLE_DEFAULTS);
    });

    it('missing keys in stored object get defaults merged in', () => {
      // Only store partial object
      storageMock[STORAGE_KEY] = JSON.stringify({ showFlights: false });
      const loaded = loadPersistedToggles();
      expect(loaded.showFlights).toBe(false);
      expect(loaded.showShips).toBe(true); // default
      expect(loaded.showNews).toBe(true); // default
      expect(loaded.pulseEnabled).toBe(true); // default
    });
  });
});
