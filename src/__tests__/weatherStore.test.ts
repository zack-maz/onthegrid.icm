import { describe, it, expect, beforeEach } from 'vitest';

import { useWeatherStore } from '@/stores/weatherStore';

describe('weatherStore', () => {
  beforeEach(() => {
    useWeatherStore.setState({
      grid: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
    });
  });

  it('initial state has empty grid and loading connection status', () => {
    const state = useWeatherStore.getState();
    expect(state.grid).toEqual([]);
    expect(state.connectionStatus).toBe('loading');
    expect(state.lastFetchAt).toBeNull();
  });

  it('setWeatherData sets grid and connectionStatus to connected', () => {
    const grid = [{ lat: 30, lng: 50, temperature: 25, windSpeed: 10, windDirection: 180 }];
    useWeatherStore.getState().setWeatherData({ data: grid, stale: false, lastFresh: Date.now() });
    const state = useWeatherStore.getState();
    expect(state.grid).toEqual(grid);
    expect(state.connectionStatus).toBe('connected');
    expect(state.lastFetchAt).toBeGreaterThan(0);
  });

  it('setWeatherData with stale=true sets connectionStatus to stale', () => {
    const grid = [{ lat: 30, lng: 50, temperature: 25, windSpeed: 10, windDirection: 180 }];
    useWeatherStore.getState().setWeatherData({ data: grid, stale: true, lastFresh: Date.now() });
    expect(useWeatherStore.getState().connectionStatus).toBe('stale');
  });

  it('setError sets connectionStatus to error', () => {
    useWeatherStore.getState().setError();
    expect(useWeatherStore.getState().connectionStatus).toBe('error');
  });
});
