import { create } from 'zustand';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface EventState {
  events: ConflictEventEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  eventCount: number;
  setEventData: (response: CacheResponse<ConflictEventEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  eventCount: 0,

  setEventData: (response) =>
    set({
      events: response.data,
      eventCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
    }),

  setError: () => set({ connectionStatus: 'error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),
}));
