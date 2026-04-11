import { create } from 'zustand';
import type { FlightEntity, CacheResponse } from '@/types/entities';
import type { FlightSource } from '@/types/ui';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'rate_limited';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface FlightState {
  flights: FlightEntity[];
  connectionStatus: ConnectionStatus;
  degraded: boolean;
  lastFetchAt: number | null;
  lastFresh: number | null;
  flightCount: number;
  activeSource: FlightSource;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setFlightData: (response: CacheResponse<FlightEntity[]> & { rateLimited?: boolean }) => void;
  setActiveSource: (source: FlightSource) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  clearStaleData: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useFlightStore = create<FlightState>()((set, get) => ({
  flights: [],
  connectionStatus: 'loading',
  degraded: false,
  lastFetchAt: null,
  lastFresh: null,
  flightCount: 0,
  activeSource: 'adsblol' as const,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setFlightData: (response) =>
    set({
      flights: response.data,
      flightCount: response.data.length,
      connectionStatus: response.rateLimited
        ? 'rate_limited'
        : response.stale
          ? 'stale'
          : 'connected',
      degraded: response.degraded ?? false,
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
      lastError: null,
    }),

  setActiveSource: (source) =>
    set({ activeSource: source, flights: [], flightCount: 0, connectionStatus: 'loading' }),

  setError: (message?: string) =>
    set({ connectionStatus: 'error', lastError: message ?? 'Unknown error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  clearStaleData: () => set({ flights: [], flightCount: 0, connectionStatus: 'error' }),

  recordFetch: (ok, durationMs) =>
    set((state) => ({
      recentFetches: [...state.recentFetches.slice(-9), { ok, durationMs, timestamp: Date.now() }],
    })),

  setNextPollAt: (ts) => set({ nextPollAt: ts }),
}));
