import { create } from 'zustand';
import type { SiteEntity, CacheResponse } from '@/types/entities';

export type SiteConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface SiteState {
  sites: SiteEntity[];
  connectionStatus: SiteConnectionStatus;
  siteCount: number;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setSiteData: (response: CacheResponse<SiteEntity[]>) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useSiteStore = create<SiteState>()((set) => ({
  sites: [],
  connectionStatus: 'idle',
  siteCount: 0,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setSiteData: (response) =>
    set({
      sites: response.data,
      siteCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
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
