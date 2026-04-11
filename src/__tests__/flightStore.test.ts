import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useFlightStore } from '@/stores/flightStore';
import type { FlightEntity, CacheResponse } from '@/types/entities';

function mockFlight(overrides: Partial<FlightEntity> = {}): FlightEntity {
  return {
    id: 'flight-abc123',
    type: 'flight',
    lat: 32.5,
    lng: 53.0,
    timestamp: Date.now(),
    label: 'QTR123',
    data: {
      icao24: 'abc123',
      callsign: 'QTR123',
      originCountry: 'Qatar',
      velocity: 250,
      heading: 45,
      altitude: 10000,
      onGround: false,
      verticalRate: 0,
      unidentified: false,
    },
    ...overrides,
  };
}

describe('flightStore', () => {
  beforeEach(() => {
    useFlightStore.setState({
      flights: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      lastFresh: null,
      flightCount: 0,
      activeSource: 'opensky',
      lastError: null,
      nextPollAt: null,
      recentFetches: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct initial state', () => {
    const state = useFlightStore.getState();
    expect(state.flights).toEqual([]);
    expect(state.connectionStatus).toBe('loading');
    expect(state.lastFetchAt).toBeNull();
    expect(state.lastFresh).toBeNull();
    expect(state.flightCount).toBe(0);
    expect(state.activeSource).toBe('opensky');
  });

  it('setFlightData with stale=false sets connected status and updates flights', () => {
    const flight = mockFlight();
    const response: CacheResponse<FlightEntity[]> = {
      data: [flight],
      stale: false,
      lastFresh: Date.now(),
    };

    useFlightStore.getState().setFlightData(response);

    const state = useFlightStore.getState();
    expect(state.flights).toEqual([flight]);
    expect(state.connectionStatus).toBe('connected');
    expect(state.flightCount).toBe(1);
    expect(state.lastFetchAt).toBeTypeOf('number');
    expect(state.lastFresh).toBeTypeOf('number');
  });

  it('setFlightData with stale=true sets stale status and preserves existing lastFresh', () => {
    // First set a fresh response to establish lastFresh
    const freshTime = 1000000;
    useFlightStore.setState({ lastFresh: freshTime });

    const flight = mockFlight();
    const response: CacheResponse<FlightEntity[]> = {
      data: [flight],
      stale: true,
      lastFresh: 0, // Server's lastFresh -- should not overwrite store's
    };

    useFlightStore.getState().setFlightData(response);

    const state = useFlightStore.getState();
    expect(state.connectionStatus).toBe('stale');
    expect(state.lastFresh).toBe(freshTime); // Preserved, not overwritten
    expect(state.flightCount).toBe(1);
  });

  it('setError sets error status', () => {
    useFlightStore.getState().setError();

    expect(useFlightStore.getState().connectionStatus).toBe('error');
  });

  it('setLoading sets loading status', () => {
    useFlightStore.setState({ connectionStatus: 'connected' });

    useFlightStore.getState().setLoading();

    expect(useFlightStore.getState().connectionStatus).toBe('loading');
  });

  it('clearStaleData empties flights and sets error status', () => {
    useFlightStore.setState({
      flights: [mockFlight()],
      flightCount: 1,
      connectionStatus: 'stale',
    });

    useFlightStore.getState().clearStaleData();

    const state = useFlightStore.getState();
    expect(state.flights).toEqual([]);
    expect(state.flightCount).toBe(0);
    expect(state.connectionStatus).toBe('error');
  });

  describe('observability fields', () => {
    it('setError() with no args sets lastError to "Unknown error" (backward compat)', () => {
      useFlightStore.getState().setError();

      const state = useFlightStore.getState();
      expect(state.connectionStatus).toBe('error');
      expect(state.lastError).toBe('Unknown error');
    });

    it('setError("Flights API 503") sets lastError to "Flights API 503"', () => {
      useFlightStore.getState().setError('Flights API 503');

      expect(useFlightStore.getState().lastError).toBe('Flights API 503');
    });

    it('setFlightData clears lastError to null', () => {
      // First put the store in error state
      useFlightStore.getState().setError('Some error');
      expect(useFlightStore.getState().lastError).toBe('Some error');

      // Then successful data clears it
      const response: CacheResponse<FlightEntity[]> = {
        data: [mockFlight()],
        stale: false,
        lastFresh: Date.now(),
      };
      useFlightStore.getState().setFlightData(response);

      expect(useFlightStore.getState().lastError).toBeNull();
    });

    it('recordFetch appends to recentFetches', () => {
      useFlightStore.getState().recordFetch(true, 150);

      const state = useFlightStore.getState();
      expect(state.recentFetches).toHaveLength(1);
      expect(state.recentFetches[0]).toMatchObject({
        ok: true,
        durationMs: 150,
      });
      expect(state.recentFetches[0].timestamp).toBeTypeOf('number');
    });

    it('recordFetch caps at 10 entries (call 12 times, assert length === 10)', () => {
      const { recordFetch } = useFlightStore.getState();
      for (let i = 0; i < 12; i++) {
        recordFetch(i % 2 === 0, i * 10);
      }

      const state = useFlightStore.getState();
      expect(state.recentFetches).toHaveLength(10);
      // First two dropped, so oldest remaining should have durationMs = 20
      expect(state.recentFetches[0].durationMs).toBe(20);
    });

    it('setNextPollAt sets nextPollAt', () => {
      const ts = Date.now() + 5000;
      useFlightStore.getState().setNextPollAt(ts);

      expect(useFlightStore.getState().nextPollAt).toBe(ts);
    });

    it('setNextPollAt(null) clears nextPollAt', () => {
      useFlightStore.getState().setNextPollAt(Date.now() + 5000);
      useFlightStore.getState().setNextPollAt(null);

      expect(useFlightStore.getState().nextPollAt).toBeNull();
    });

    it('initial observability fields are correct', () => {
      const state = useFlightStore.getState();
      expect(state.lastError).toBeNull();
      expect(state.nextPollAt).toBeNull();
      expect(state.recentFetches).toEqual([]);
    });
  });

  describe('rate limited status', () => {
    it('ConnectionStatus includes rate_limited as valid value', () => {
      useFlightStore.setState({ connectionStatus: 'rate_limited' });
      expect(useFlightStore.getState().connectionStatus).toBe('rate_limited');
    });

    it('setFlightData with rateLimited response sets connectionStatus to rate_limited', () => {
      const flight = mockFlight();
      const response = {
        data: [flight],
        stale: true,
        lastFresh: Date.now(),
        rateLimited: true,
      };

      useFlightStore.getState().setFlightData(response);

      const state = useFlightStore.getState();
      expect(state.connectionStatus).toBe('rate_limited');
    });

    it('setFlightData with rateLimited=true still populates flights from stale cache data', () => {
      const flight = mockFlight();
      const response = {
        data: [flight],
        stale: true,
        lastFresh: Date.now(),
        rateLimited: true,
      };

      useFlightStore.getState().setFlightData(response);

      const state = useFlightStore.getState();
      expect(state.flights).toEqual([flight]);
      expect(state.flightCount).toBe(1);
    });

    it('setFlightData without rateLimited uses normal stale/connected logic', () => {
      const flight = mockFlight();
      const response: CacheResponse<FlightEntity[]> = {
        data: [flight],
        stale: false,
        lastFresh: Date.now(),
      };

      useFlightStore.getState().setFlightData(response);

      expect(useFlightStore.getState().connectionStatus).toBe('connected');
    });
  });
});
