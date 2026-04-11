import { create } from 'zustand';
import type { MarketQuote, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

export type MarketRange = '1d' | '5d' | '1mo' | 'ytd';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface MarketState {
  quotes: MarketQuote[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  range: MarketRange;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setMarketData: (response: CacheResponse<MarketQuote[]>) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  setRange: (range: MarketRange) => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

function readRange(): MarketRange {
  try {
    const v = localStorage.getItem('markets-range');
    if (v === '1d' || v === '5d' || v === '1mo' || v === 'ytd') return v;
  } catch {
    /* noop */
  }
  return '1d';
}

export const useMarketStore = create<MarketState>()((set) => ({
  quotes: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  range: readRange(),
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setMarketData: (response) =>
    set({
      quotes: response.data,
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

  setRange: (range) => {
    try {
      localStorage.setItem('markets-range', range);
    } catch {
      /* noop */
    }
    set({ range, connectionStatus: 'loading', quotes: [] });
  },
}));
