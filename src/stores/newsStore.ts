import { create } from 'zustand';
import type { NewsCluster, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface NewsState {
  clusters: NewsCluster[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  clusterCount: number;
  articleCount: number;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setNewsData: (response: CacheResponse<NewsCluster[]>) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useNewsStore = create<NewsState>()((set) => ({
  clusters: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  clusterCount: 0,
  articleCount: 0,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setNewsData: (response) =>
    set({
      clusters: response.data,
      clusterCount: response.data.length,
      articleCount: response.data.reduce((sum, c) => sum + c.articles.length, 0),
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
