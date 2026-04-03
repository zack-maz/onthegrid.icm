import { describe, it, expect, beforeEach } from 'vitest';
import { useWaterStore } from '@/stores/waterStore';
import type { WaterFacility, CacheResponse } from '../../server/types';

const mockFacility: WaterFacility = {
  id: 'water-12345',
  type: 'water',
  facilityType: 'dam',
  lat: 33.44,
  lng: 48.35,
  label: 'Karkheh Dam',
  operator: 'Iran Water',
  osmId: 12345,
  stress: {
    bws_raw: 2.5,
    bws_score: 3.0,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.4,
  },
};

const mockFacility2: WaterFacility = {
  id: 'water-67890',
  type: 'water',
  facilityType: 'reservoir',
  lat: 35.72,
  lng: 51.33,
  label: 'Latyan Reservoir',
  osmId: 67890,
  stress: {
    bws_raw: 1.8,
    bws_score: 2.0,
    bws_label: 'Medium-High',
    drr_score: 1.0,
    gtd_score: 0.5,
    sev_score: 1.5,
    iav_score: 2.0,
    compositeHealth: 0.6,
  },
};

describe('waterStore', () => {
  beforeEach(() => {
    useWaterStore.setState({
      facilities: [],
      connectionStatus: 'idle',
    });
  });

  it('has correct initial state', () => {
    const state = useWaterStore.getState();
    expect(state.facilities).toEqual([]);
    expect(state.connectionStatus).toBe('idle');
  });

  it('setWaterData updates facilities and sets connected status', () => {
    const response: CacheResponse<WaterFacility[]> = {
      data: [mockFacility, mockFacility2],
      stale: false,
      lastFresh: Date.now(),
    };

    useWaterStore.getState().setWaterData(response);

    const state = useWaterStore.getState();
    expect(state.facilities).toHaveLength(2);
    expect(state.facilities[0].label).toBe('Karkheh Dam');
    expect(state.connectionStatus).toBe('connected');
  });

  it('setWaterData sets stale status when response is stale', () => {
    const response: CacheResponse<WaterFacility[]> = {
      data: [mockFacility],
      stale: true,
      lastFresh: Date.now(),
    };

    useWaterStore.getState().setWaterData(response);

    const state = useWaterStore.getState();
    expect(state.connectionStatus).toBe('stale');
  });

  it('setError sets connectionStatus to error', () => {
    useWaterStore.getState().setError();
    expect(useWaterStore.getState().connectionStatus).toBe('error');
  });

  it('setLoading sets connectionStatus to loading', () => {
    useWaterStore.getState().setLoading();
    expect(useWaterStore.getState().connectionStatus).toBe('loading');
  });

  it('updatePrecipitation merges precipitation into matching facilities', () => {
    // First populate with facilities
    const response: CacheResponse<WaterFacility[]> = {
      data: [mockFacility, mockFacility2],
      stale: false,
      lastFresh: Date.now(),
    };
    useWaterStore.getState().setWaterData(response);

    // Update precipitation for facility 1 (matching lat/lng within 0.01 deg)
    useWaterStore.getState().updatePrecipitation([
      {
        lat: 33.44,
        lng: 48.35,
        last30DaysMm: 45,
        anomalyRatio: 0.8,
        updatedAt: Date.now(),
      },
    ]);

    const state = useWaterStore.getState();
    const updated = state.facilities.find((f) => f.id === 'water-12345');
    expect(updated?.precipitation).toBeDefined();
    expect(updated?.precipitation?.last30DaysMm).toBe(45);
    expect(updated?.precipitation?.anomalyRatio).toBe(0.8);
  });

  it('updatePrecipitation recomputes compositeHealth with new anomaly ratio', () => {
    const response: CacheResponse<WaterFacility[]> = {
      data: [mockFacility],
      stale: false,
      lastFresh: Date.now(),
    };
    useWaterStore.getState().setWaterData(response);

    // Facility has bws_score=3.0, so baselineHealth = 1 - 3.0/5 = 0.4
    // With anomalyRatio=0.5 (very dry): precipModifier = (0.5-1.0)*0.5 = -0.25
    // compositeHealth = max(0, min(1, 0.4 + (-0.25))) = 0.15
    useWaterStore.getState().updatePrecipitation([
      {
        lat: 33.44,
        lng: 48.35,
        last30DaysMm: 20,
        anomalyRatio: 0.5,
        updatedAt: Date.now(),
      },
    ]);

    const state = useWaterStore.getState();
    const updated = state.facilities.find((f) => f.id === 'water-12345');
    expect(updated?.stress.compositeHealth).toBeCloseTo(0.15, 2);
  });

  it('updatePrecipitation does not affect unmatched facilities', () => {
    const response: CacheResponse<WaterFacility[]> = {
      data: [mockFacility, mockFacility2],
      stale: false,
      lastFresh: Date.now(),
    };
    useWaterStore.getState().setWaterData(response);

    // Only update a location that matches facility 1
    useWaterStore.getState().updatePrecipitation([
      {
        lat: 33.44,
        lng: 48.35,
        last30DaysMm: 45,
        anomalyRatio: 0.8,
        updatedAt: Date.now(),
      },
    ]);

    const state = useWaterStore.getState();
    const unmatched = state.facilities.find((f) => f.id === 'water-67890');
    expect(unmatched?.precipitation).toBeUndefined();
    expect(unmatched?.stress.compositeHealth).toBe(0.6); // unchanged
  });
});
