import { describe, it, expect, beforeEach } from 'vitest';
import { useShipStore, SHIP_STALE_THRESHOLD } from '@/stores/shipStore';
import type { ShipEntity, CacheResponse } from '@/types/entities';

const mockShip: ShipEntity = {
  id: 'ship-123456789',
  type: 'ship',
  lat: 26.0,
  lng: 56.0,
  timestamp: Date.now(),
  label: 'VESSEL ONE',
  data: {
    mmsi: 123456789,
    shipName: 'VESSEL ONE',
    speedOverGround: 12.5,
    courseOverGround: 180,
    trueHeading: 178,
  },
};

describe('shipStore', () => {
  beforeEach(() => {
    useShipStore.setState({
      ships: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      lastFresh: null,
      shipCount: 0,
    });
  });

  it('has correct initial state', () => {
    const state = useShipStore.getState();
    expect(state.ships).toEqual([]);
    expect(state.connectionStatus).toBe('loading');
    expect(state.lastFetchAt).toBeNull();
    expect(state.lastFresh).toBeNull();
    expect(state.shipCount).toBe(0);
  });

  it('setShipData with non-stale response updates all fields', () => {
    const response: CacheResponse<ShipEntity[]> = {
      data: [mockShip],
      stale: false,
      lastFresh: Date.now(),
    };

    useShipStore.getState().setShipData(response);

    const state = useShipStore.getState();
    expect(state.ships).toEqual([mockShip]);
    expect(state.shipCount).toBe(1);
    expect(state.connectionStatus).toBe('connected');
    expect(state.lastFresh).not.toBeNull();
    expect(state.lastFetchAt).not.toBeNull();
  });

  it('setShipData with stale response keeps old lastFresh', () => {
    // Set initial fresh data
    const freshResponse: CacheResponse<ShipEntity[]> = {
      data: [mockShip],
      stale: false,
      lastFresh: Date.now(),
    };
    useShipStore.getState().setShipData(freshResponse);
    const originalLastFresh = useShipStore.getState().lastFresh;

    // Set stale data
    const staleResponse: CacheResponse<ShipEntity[]> = {
      data: [mockShip],
      stale: true,
      lastFresh: Date.now(),
    };
    useShipStore.getState().setShipData(staleResponse);

    const state = useShipStore.getState();
    expect(state.connectionStatus).toBe('stale');
    expect(state.lastFresh).toBe(originalLastFresh);
  });

  it('setError sets connectionStatus to error', () => {
    useShipStore.getState().setError();
    expect(useShipStore.getState().connectionStatus).toBe('error');
  });

  it('setLoading sets connectionStatus to loading', () => {
    useShipStore.getState().setLoading();
    expect(useShipStore.getState().connectionStatus).toBe('loading');
  });

  it('clearStaleData clears ships and sets error status', () => {
    // Populate some data first
    const response: CacheResponse<ShipEntity[]> = {
      data: [mockShip],
      stale: false,
      lastFresh: Date.now(),
    };
    useShipStore.getState().setShipData(response);
    expect(useShipStore.getState().ships).toHaveLength(1);

    useShipStore.getState().clearStaleData();

    const state = useShipStore.getState();
    expect(state.ships).toEqual([]);
    expect(state.shipCount).toBe(0);
    expect(state.connectionStatus).toBe('error');
  });

  it('exports SHIP_STALE_THRESHOLD as 120000', () => {
    expect(SHIP_STALE_THRESHOLD).toBe(120_000);
  });
});
