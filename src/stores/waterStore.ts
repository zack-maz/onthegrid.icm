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

interface WaterState {
  facilities: WaterFacility[];
  connectionStatus: WaterConnectionStatus;
  setWaterData: (response: CacheResponse<WaterFacility[]>) => void;
  updatePrecipitation: (data: PrecipitationData[]) => void;
  setError: () => void;
  setLoading: () => void;
}

/** Max lat/lng distance in degrees to match a precipitation entry to a facility */
const COORD_MATCH_THRESHOLD = 0.01;

export const useWaterStore = create<WaterState>()((set) => ({
  facilities: [],
  connectionStatus: 'idle',

  setWaterData: (response) =>
    set({
      facilities: response.data,
      connectionStatus: response.stale ? 'stale' : 'connected',
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

  setError: () => set({ connectionStatus: 'error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),
}));
