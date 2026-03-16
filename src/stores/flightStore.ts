import { create } from 'zustand';
import type { FlightEntity, CacheResponse } from '@/types/entities';
import type { FlightSource } from '@/types/ui';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'rate_limited';

const STORAGE_KEY = 'flight-source';

function loadPersistedSource(): FlightSource {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'opensky' || stored === 'adsb' || stored === 'adsblol') return stored;
  } catch { /* localStorage unavailable */ }
  return 'adsblol';
}

function persistSource(source: FlightSource): void {
  try { localStorage.setItem(STORAGE_KEY, source); } catch { /* silently fail */ }
}

interface FlightState {
  flights: FlightEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  lastFresh: number | null;
  flightCount: number;
  activeSource: FlightSource;
  setFlightData: (response: CacheResponse<FlightEntity[]> & { rateLimited?: boolean }) => void;
  setError: () => void;
  setLoading: () => void;
  clearStaleData: () => void;
  setActiveSource: (source: FlightSource) => void;
}

export const useFlightStore = create<FlightState>()((set, get) => ({
  flights: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  lastFresh: null,
  flightCount: 0,
  activeSource: loadPersistedSource(),

  setFlightData: (response) =>
    set({
      flights: response.data,
      flightCount: response.data.length,
      connectionStatus: response.rateLimited
        ? 'rate_limited'
        : response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
    }),

  setError: () => set({ connectionStatus: 'error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  clearStaleData: () =>
    set({ flights: [], flightCount: 0, connectionStatus: 'error' }),

  setActiveSource: (source) => {
    persistSource(source);
    set({
      activeSource: source,
      flights: [],
      flightCount: 0,
      connectionStatus: 'loading',
      lastFetchAt: null,
      lastFresh: null,
    });
  },
}));
