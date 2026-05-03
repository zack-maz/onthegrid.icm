import { create } from 'zustand';

import type { SiteEntity, CacheResponse } from '@/types/entities';

export type SiteConnectionStatus = 'connected' | 'stale' | 'error' | 'loading' | 'idle';

export interface FetchRecord {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

/**
 * Phase 27.3.1 R-05 D-29 parity — per-Overpass-fetch telemetry record.
 * Mirrors `OverpassFetchRecord` in server/adapters/overpass-water.ts.
 * Declared locally for tier independence (same pattern as waterStore
 * per Phase 27.3 truth-12 rationale).
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
 * Phase 27.3.1 R-05 D-19 — server-reported site filter stats. Mirrors the
 * `SiteFilterStats` shape in server/adapters/overpass.ts. Populated by
 * useSiteFetch on the response envelope's `filterStats` field (post-R-05
 * every response path attaches provenance — snapshot / redis / overpass).
 * Plan 08 consumes this in the DevApiStatus Sites panel.
 */
export interface SiteFilterStats {
  rawCount: number;
  filteredCount: number;
  rejections: {
    excluded_turkey: number;
    no_coords: number;
    no_type: number;
    duplicate: number;
  };
  /** R-05 D-28 parity — admitted sites keyed by nearest-centroid country → SiteType → count. */
  byCountry: Record<string, Record<string, number>>;
  /** R-05 parity — admitted sites tallied by SiteType (nuclear/naval/oil/airbase/port). */
  byType: Record<string, number>;
  /** R-05 D-29 parity — Overpass fetch telemetry, one entry per URL attempt. */
  overpass: OverpassFetchRecord[];
  /** R-05 D-30 parity — provenance tag. */
  source: 'snapshot' | 'redis' | 'overpass';
  /** R-05 D-30 parity — ISO-8601 timestamp of when the underlying data was produced. */
  generatedAt: string;
}

interface SiteState {
  sites: SiteEntity[];
  connectionStatus: SiteConnectionStatus;
  siteCount: number;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchRecord[];
  /** Server-reported filter diagnostics (null until first response arrives). */
  filterStats: SiteFilterStats | null;
  setSiteData: (response: CacheResponse<SiteEntity[]>) => void;
  setFilterStats: (stats: SiteFilterStats | null) => void;
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
  filterStats: null,

  setSiteData: (response) =>
    set({
      sites: response.data,
      siteCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastError: null,
    }),

  setFilterStats: (filterStats) => set({ filterStats }),

  setError: (message?: string) =>
    set({ connectionStatus: 'error', lastError: message ?? 'Unknown error' }),

  setLoading: () => set({ connectionStatus: 'loading' }),

  recordFetch: (ok, durationMs) =>
    set((state) => ({
      recentFetches: [...state.recentFetches.slice(-9), { ok, durationMs, timestamp: Date.now() }],
    })),

  setNextPollAt: (ts) => set({ nextPollAt: ts }),
}));
