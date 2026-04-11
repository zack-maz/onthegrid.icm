import { create } from 'zustand';
import type { WaterFacility, CacheResponse } from '../../server/types';
import { compositeHealth } from '@/lib/waterStress';

export type WaterConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

/** Precipitation data returned by /api/water/precip */
export interface PrecipitationData {
  lat: number;
  lng: number;
  last30DaysMm: number;
  anomalyRatio: number;
  updatedAt: number;
}

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface WaterState {
  facilities: WaterFacility[];
  connectionStatus: WaterConnectionStatus;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  setWaterData: (response: CacheResponse<WaterFacility[]>) => void;
  updatePrecipitation: (data: PrecipitationData[]) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
}

/** Max lat/lng distance in degrees to match a precipitation entry to a facility */
const COORD_MATCH_THRESHOLD = 0.01;

export const useWaterStore = create<WaterState>()((set) => ({
  facilities: [],
  connectionStatus: 'idle',
  lastError: null,
  nextPollAt: null,
  recentFetches: [],

  setWaterData: (response) =>
    set({
      facilities: response.data,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastError: null,
    }),

  updatePrecipitation: (data) =>
    set((state) => {
      const updated = state.facilities.map((facility) => {
        const match = data.find(
          (p) =>
            Math.abs(p.lat - facility.lat) < COORD_MATCH_THRESHOLD &&
            Math.abs(p.lng - facility.lng) < COORD_MATCH_THRESHOLD,
        );
        if (!match) return facility;

        const newHealth = compositeHealth(facility.stress.bws_score, match.anomalyRatio);
        return {
          ...facility,
          precipitation: {
            last30DaysMm: match.last30DaysMm,
            anomalyRatio: match.anomalyRatio,
            updatedAt: match.updatedAt,
          },
          stress: {
            ...facility.stress,
            compositeHealth: newHealth,
          },
        };
      });
      return { facilities: updated };
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
