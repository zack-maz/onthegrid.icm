import { create } from 'zustand';

export interface WeatherGridPoint {
  lat: number;
  lng: number;
  temperature: number; // Celsius
  windSpeed: number; // knots
  windDirection: number; // degrees (0-360)
}

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface WeatherState {
  grid: WeatherGridPoint[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setWeatherData: (response: {
    data: WeatherGridPoint[];
    stale: boolean;
    lastFresh: number;
  }) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useWeatherStore = create<WeatherState>()((set) => ({
  grid: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setWeatherData: (response) =>
    set({
      grid: response.data,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
      lastError: null,
    }),

  setError: (message?: string) =>
    set({ connectionStatus: 'error', lastError: message ?? 'Unknown error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  recordFetch: (ok, durationMs) =>
    set((state) => ({
      recentFetches: [...state.recentFetches.slice(-9), { ok, durationMs, timestamp: Date.now() }],
    })),

  setNextPollAt: (ts) => set({ nextPollAt: ts }),
}));
