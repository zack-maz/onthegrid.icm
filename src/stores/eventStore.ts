import { create } from 'zustand';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface EventState {
  events: ConflictEventEntity[];
  connectionStatus: ConnectionStatus;
  degraded: boolean;
  lastFetchAt: number | null;
  eventCount: number;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setEventData: (response: CacheResponse<ConflictEventEntity[]>) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  connectionStatus: 'loading',
  degraded: false,
  lastFetchAt: null,
  eventCount: 0,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setEventData: (response) =>
    set({
      events: response.data,
      eventCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      degraded: response.degraded ?? false,
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
