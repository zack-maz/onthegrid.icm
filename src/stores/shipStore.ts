import { create } from 'zustand';
import type { ShipEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

// 120s threshold: ships at ~15 knots drift ~1km, making positions meaningfully outdated
export const SHIP_STALE_THRESHOLD = 120_000;

interface ShipState {
  ships: ShipEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  lastFresh: number | null;
  shipCount: number;
  setShipData: (response: CacheResponse<ShipEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
  clearStaleData: () => void;
}

export const useShipStore = create<ShipState>()((set, get) => ({
  ships: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  lastFresh: null,
  shipCount: 0,

  setShipData: (response) =>
    set({
      ships: response.data,
      shipCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
    }),

  setError: () => set({ connectionStatus: 'error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  clearStaleData: () =>
    set({ ships: [], shipCount: 0, connectionStatus: 'error' }),
}));
