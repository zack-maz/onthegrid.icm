import { create } from 'zustand';
import type { NewsCluster, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface NewsState {
  clusters: NewsCluster[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  clusterCount: number;
  articleCount: number;
  setNewsData: (response: CacheResponse<NewsCluster[]>) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useNewsStore = create<NewsState>()((set) => ({
  clusters: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  clusterCount: 0,
  articleCount: 0,

  setNewsData: (response) =>
    set({
      clusters: response.data,
      clusterCount: response.data.length,
      articleCount: response.data.reduce((sum, c) => sum + c.articles.length, 0),
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
    }),

  setError: () => set({ connectionStatus: 'error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),
}));
