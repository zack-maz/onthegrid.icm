import { create } from 'zustand';

import { compositeHealth } from '@/lib/waterStress';

import type { WaterFacility, CacheResponse } from '../../server/types';

export type WaterConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

/** Precipitation data returned by /api/water/precip */
export interface PrecipitationData {
  lat: number;
  lng: number;
  last30DaysMm: number;
  anomalyRatio: number;
  updatedAt: number;
}

/**
 * Phase 27.3.1 R-08 D-29 — per-Overpass-fetch telemetry record.
 * Mirrors `OverpassFetchRecord` in server/adapters/overpass-water.ts. Declared
 * locally for tier independence (per Phase 27.3 truth-12 rationale).
 */
export interface OverpassFetchRecord {
  facilityType: string;
  /** Label only ('primary' | 'fallback') — never the raw URL. */
  mirror: string;
  status: number;
  durationMs: number;
  attempts: number;
  ok: boolean;
}

/**
 * Water filter diagnostics from /api/water response envelope (Phase 27.3 D-04/REV-4,
 * extended in Phase 27.3.1 R-08 D-28..D-31). Populated on every response path
 * post-R-08 (cached responses now carry a minimal stub with source='redis').
 * Schema mirrors server/schemas/cacheResponse.ts `waterFilterStatsSchema` —
 * declared locally here for tier independence.
 */
export interface WaterFilterStats {
  rawCounts: Record<string, number>;
  filteredCounts: Record<string, number>;
  /** Summed across all facility types — preserved for back-compat. */
  rejections: {
    excluded_location: number;
    /** Phase 27.3.1 Plan 10 (G2) — Turkey country-exclusion bucket. Mirrors `WaterFilterStats.rejections.excluded_turkey` in server/adapters/overpass-water.ts. */
    excluded_turkey: number;
    not_notable: number;
    no_name: number;
    /** Phase 27.3.2 D-04 — rejected because the Latin-label admission check failed for a non-desalination facility (desal-exempt per D-03). Mirrors `WaterFilterStats.rejections.no_resolved_name` in server/adapters/overpass-water.ts. */
    no_resolved_name: number;
    duplicate: number;
    low_score: number;
    /** Rejected because no nearby city (150km) AND no wikidata/wikipedia ref. Phase 27.3 Plan 04. */
    no_city: number;
  };
  /** Phase 27.3.1 R-08 D-31 — per-facility-type rejection breakdown (Plan 10 G2 added excluded_turkey). */
  byTypeRejections: Record<
    string,
    {
      excluded_location: number;
      /** Phase 27.3.1 Plan 10 (G2) — per-type Turkey country-exclusion bucket. */
      excluded_turkey: number;
      not_notable: number;
      no_name: number;
      /** Phase 27.3.2 D-04 — per-type Latin-label admission rejection (always 0 for desalination per D-03 exemption). */
      no_resolved_name: number;
      duplicate: number;
      low_score: number;
      no_city: number;
    }
  >;
  /** Phase 27.3.1 R-08 D-28 — admitted facilities keyed by nearest-centroid country → facilityType → count. */
  byCountry: Record<string, Record<string, number>>;
  /** Phase 27.3.1 R-08 D-29 — Overpass fetch telemetry, one entry per URL attempt. */
  overpass: OverpassFetchRecord[];
  /** Phase 27.3.1 R-08 D-30 — provenance tag for the response payload. */
  source: 'snapshot' | 'redis' | 'overpass';
  /** Phase 27.3.1 R-08 D-30 — ISO-8601 timestamp of when the underlying data was produced. */
  generatedAt: string;
  enrichment: {
    withCapacity: number;
    withCity: number;
    withRiver: number;
  };
  scoreHistogram: { bucket: string; count: number }[];
}

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface WaterState {
  facilities: WaterFacility[];
  connectionStatus: WaterConnectionStatus;
  lastFetchAt: number | null;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  /** Server-reported filter diagnostics (null when response served from cache) */
  filterStats: WaterFilterStats | null;
  /** Precipitation-specific observability */
  precipStatus: WaterConnectionStatus;
  precipLastFetchAt: number | null;
  precipLastError: string | null;
  precipNextPollAt: number | null;
  precipRecentFetches: FetchRecord[];
  precipMatchedCount: number;
  /** Raw precipitation array for direct coordinate lookup (e.g. weather tooltip) */
  rawPrecipData: PrecipitationData[];
  setWaterData: (response: CacheResponse<WaterFacility[]>) => void;
  setFilterStats: (stats: WaterFilterStats | null) => void;
  updatePrecipitation: (data: PrecipitationData[]) => void;
  setError: (message?: string) => void;
  setLoading: () => void;
  recordFetch: (ok: boolean, durationMs: number) => void;
  setNextPollAt: (ts: number | null) => void;
  recordPrecipFetch: (ok: boolean, durationMs: number, matchedCount?: number) => void;
  setPrecipNextPollAt: (ts: number | null) => void;
  setPrecipError: (message?: string) => void;
}

/** Max lat/lng distance in degrees to match a precipitation entry to a facility */
const COORD_MATCH_THRESHOLD = 0.01;

export const useWaterStore = create<WaterState>()((set) => ({
  facilities: [],
  connectionStatus: 'idle',
  lastFetchAt: null,
  lastError: null,
  nextPollAt: null,
  recentFetches: [],
  filterStats: null,
  precipStatus: 'idle',
  precipLastFetchAt: null,
  precipLastError: null,
  precipNextPollAt: null,
  precipRecentFetches: [],
  precipMatchedCount: 0,
  rawPrecipData: [],

  setWaterData: (response) =>
    set({
      facilities: response.data,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastError: null,
    }),

  setFilterStats: (filterStats) => set({ filterStats }),

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
      return { facilities: updated, rawPrecipData: data };
    }),

  setError: (message?: string) =>
    set({ connectionStatus: 'error', lastError: message ?? 'Unknown error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  recordFetch: (ok, durationMs) =>
    set((state) => ({
      lastFetchAt: Date.now(),
      recentFetches: [...state.recentFetches.slice(-9), { ok, durationMs, timestamp: Date.now() }],
    })),

  setNextPollAt: (ts) => set({ nextPollAt: ts }),

  recordPrecipFetch: (ok, durationMs, matchedCount) =>
    set((state) => ({
      precipStatus: ok ? 'connected' : 'error',
      precipLastFetchAt: Date.now(),
      precipLastError: ok ? null : state.precipLastError,
      precipRecentFetches: [
        ...state.precipRecentFetches.slice(-9),
        { ok, durationMs, timestamp: Date.now() },
      ],
      ...(matchedCount !== undefined ? { precipMatchedCount: matchedCount } : {}),
    })),

  setPrecipNextPollAt: (ts) => set({ precipNextPollAt: ts }),

  setPrecipError: (message) =>
    set({ precipStatus: 'error', precipLastError: message ?? 'Unknown error' }),
}));
