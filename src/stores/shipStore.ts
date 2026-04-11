import { create } from 'zustand';
import type { ShipEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

// 120s threshold: ships at ~15 knots drift ~1km, making positions meaningfully outdated
export const SHIP_STALE_THRESHOLD = 120_000;

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface ShipState {
  ships: ShipEntity[];
  connectionStatus: ConnectionStatus;
  degraded: boolean;
  lastFetchAt: number | null;
  lastFresh: number | null;
  shipCount: number;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setShipData: (response: CacheResponse<ShipEntity[]>) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  clearStaleData: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useShipStore = create<ShipState>()((set, get) => ({
  ships: [],
  connectionStatus: 'loading',
  degraded: false,
  lastFetchAt: null,
  lastFresh: null,
  shipCount: 0,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setShipData: (response) =>
    set({
      ships: response.data,
      shipCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      degraded: response.degraded ?? false,
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
      lastError: null,
    }),

  setError: (message?: string) =>
    set({ connectionStatus: 'error', lastError: message ?? 'Unknown error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  clearStaleData: () => set({ ships: [], shipCount: 0, connectionStatus: 'error' }),

  recordFetch: (ok, durationMs) =>
    set((state) => ({
      recentFetches: [...state.recentFetches.slice(-9), { ok, durationMs, timestamp: Date.now() }],
    })),

  setNextPollAt: (ts) => set({ nextPollAt: ts }),
}));
