// @vitest-environment node
/**
 * Phase 27.4 Plan 03 + Plan 05 — tests for server/lib/llmResolver.ts.
 *
 * Plan 03 baseline covered the 6-branch dispatcher with stubs at branches
 * 2 (POI amenity) and 4 (2-pass verify). Plan 05 replaces both stubs with
 * functional implementations and adds tests for the D-03 + D-04 behaviors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks.
vi.mock('../../lib/sitesSnapshot.js', () => ({
  loadSitesSnapshot: vi.fn(),
  __resetSitesSnapshotCacheForTests: vi.fn(),
}));
vi.mock('../../lib/waterSnapshot.js', () => ({
  loadWaterSnapshot: vi.fn(),
  __resetSnapshotCacheForTests: vi.fn(),
}));
vi.mock('../../adapters/nominatim.js', () => ({
  forwardGeocode: vi.fn(),
  forwardGeocodeConstrained: vi.fn(),
  reverseGeocode: vi.fn(),
}));
vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn().mockResolvedValue(null),
}));

import { loadSitesSnapshot } from '../../lib/sitesSnapshot.js';
import { loadWaterSnapshot } from '../../lib/waterSnapshot.js';
import { forwardGeocodeConstrained } from '../../adapters/nominatim.js';
import { cacheGetSafe, cacheSetSafe } from '../../cache/redis.js';
import { callLLM } from '../../adapters/llm-provider.js';
import {
  resolveLocation,
  fuzzyNameMatch,
  isPoiLandmark,
  haversineKm,
  POI_KEYWORDS,
  __resetThrottleForTests,
  type ResolveContext,
} from '../../lib/llmResolver.js';
import type { LocationHierarchyV2 } from '../../lib/llmSchema.js';

function hierarchy(partial: Partial<LocationHierarchyV2> = {}): LocationHierarchyV2 {
  return {
    country: null,
    admin1: null,
    city: null,
    neighborhood: null,
    landmark: null,
    confidence: 0.8,
    ...partial,
  };
}

function ctx(partial: Partial<ResolveContext> = {}): ResolveContext {
  return {
    centroidLat: 33.0,
    centroidLng: 44.0,
    ...partial,
  };
}

// -----------------------------------------------------------------------------
// Plan 03 baseline suite (updated for Plan 05 constrained-adapter behavior).
// -----------------------------------------------------------------------------

describe('llmResolver', () => {
  beforeEach(() => {
    __resetThrottleForTests();
    vi.mocked(loadSitesSnapshot).mockReturnValue(null);
    vi.mocked(loadWaterSnapshot).mockReturnValue(null);
    vi.mocked(forwardGeocodeConstrained).mockReset().mockResolvedValue([]);
    vi.mocked(cacheGetSafe).mockReset().mockResolvedValue(null);
    vi.mocked(cacheSetSafe).mockReset().mockResolvedValue(undefined);
    vi.mocked(callLLM).mockReset().mockResolvedValue(null);
  });

  it('resolves via sitesSnapshot when landmark substring-matches a site label with matching country', async () => {
    vi.mocked(loadSitesSnapshot).mockReturnValue({
      generatedAt: '2026-04-20T00:00:00Z',
      sites: [
        { label: 'Natanz Nuclear Facility', country: 'Iran', lat: 33.72, lng: 51.73 },
      ],
      stats: {},
    } as unknown as ReturnType<typeof loadSitesSnapshot>);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    expect(out.provenance).toBe('own-site-snapshot');
    expect(out.lat).toBeCloseTo(33.72);
    expect(out.lng).toBeCloseTo(51.73);
    expect(out.displayName).toBe('Natanz Nuclear Facility');
  });

  it('falls through to nominatim-direct when snapshot loaders return null and landmark is not POI', async () => {
    // With WR-04: precision=city triggers the 2-pass sanity gate; the
    // verify branch also returns a single candidate which is now accepted
    // directly (provenance `nominatim-verified-2pass`) instead of being
    // negative-cached as a miss.
    vi.mocked(forwardGeocodeConstrained).mockResolvedValue([
      {
        lat: 33.3,
        lng: 44.4,
        displayName: 'Baghdad, Iraq',
        type: 'city',
        address: { country_code: 'iq' },
      },
    ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Iraq', city: 'Baghdad' }),
      ctx({ centroidLat: 33.3, centroidLng: 44.4 }),
    );

    expect(out.provenance).toBe('nominatim-verified-2pass');
    expect(out.lat).toBeCloseTo(33.3);
    expect(out.lng).toBeCloseTo(44.4);
  });

  it('POI amenity miss falls through to nominatim-direct', async () => {
    // Plan 05: POI branch calls forwardGeocodeConstrained with amenity. When
    // no POI result, dispatch continues to nominatim-direct (second call).
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          lat: 34.1,
          lng: 51.0,
          displayName: 'Some airbase location',
          type: 'airport',
          address: { country_code: 'qa' },
        },
      ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Qatar', landmark: 'Al Udeid airbase' }),
      ctx({ centroidLat: 34.1, centroidLng: 51.0 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
  });

  it('falls back to gdelt-actiongeo-fallback when no path resolves', async () => {
    const out = await resolveLocation(
      hierarchy({ country: 'Iran' }),
      ctx({ centroidLat: 32.5, centroidLng: 53.0 }),
    );
    expect(out.provenance).toBe('gdelt-actiongeo-fallback');
    expect(out.lat).toBe(32.5);
    expect(out.lng).toBe(53.0);
    expect(out.actionGeoDistanceKm).toBe(0);
  });

  it('uses bellingcat-coord-passthrough when earlier paths empty and ctx.bellingcatCoord is set', async () => {
    const out = await resolveLocation(
      hierarchy({ country: 'Syria' }),
      ctx({
        centroidLat: 33.5,
        centroidLng: 36.3,
        bellingcatCoord: { lat: 33.51, lng: 36.31 },
      }),
    );
    expect(out.provenance).toBe('bellingcat-coord-passthrough');
    expect(out.lat).toBeCloseTo(33.51);
    expect(out.lng).toBeCloseTo(36.31);
  });

  it('computes actionGeoDistanceKm via haversine from resolved coord to centroid', async () => {
    vi.mocked(loadSitesSnapshot).mockReturnValue({
      generatedAt: '2026-04-20T00:00:00Z',
      sites: [{ label: 'Test Site', country: 'Iran', lat: 30, lng: 50 }],
      stats: {},
    } as unknown as ReturnType<typeof loadSitesSnapshot>);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Test Site' }),
      ctx({ centroidLat: 30.1, centroidLng: 50.0 }),
    );

    expect(out.provenance).toBe('own-site-snapshot');
    expect(out.actionGeoDistanceKm).toBeGreaterThan(10);
    expect(out.actionGeoDistanceKm).toBeLessThan(12);
  });

  it('fuzzyNameMatch accepts substring inside a longer snapshot label', () => {
    expect(fuzzyNameMatch('Natanz', 'Natanz Nuclear Facility')).toBe(true);
  });

  it('fuzzyNameMatch is case-insensitive across landmark/label', () => {
    expect(fuzzyNameMatch('Bandar Abbas', 'bandar abbas naval base')).toBe(true);
  });

  it('fuzzyNameMatch returns false when names are unrelated', () => {
    expect(fuzzyNameMatch('Jobar', 'Damascus airport')).toBe(false);
  });

  it('country filter blocks cross-country substring match', async () => {
    vi.mocked(loadSitesSnapshot).mockReturnValue({
      generatedAt: '2026-04-20T00:00:00Z',
      sites: [
        { label: 'Dimona Nuclear Power Plant', country: 'Israel', lat: 31.0, lng: 35.14 },
      ],
      stats: {},
    } as unknown as ReturnType<typeof loadSitesSnapshot>);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Nuclear Power Plant' }),
      ctx({ centroidLat: 32.0, centroidLng: 53.0 }),
    );
    expect(out.provenance).not.toBe('own-site-snapshot');
  });

  it('country filter allows match when the snapshot country equals hierarchy.country', async () => {
    vi.mocked(loadSitesSnapshot).mockReturnValue({
      generatedAt: '2026-04-20T00:00:00Z',
      sites: [
        { label: 'Dimona Nuclear Power Plant', country: 'Israel', lat: 31.0, lng: 35.14 },
        { label: 'Bushehr Nuclear Power Plant', country: 'Iran', lat: 28.83, lng: 50.89 },
      ],
      stats: {},
    } as unknown as ReturnType<typeof loadSitesSnapshot>);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Nuclear Power Plant' }),
      ctx({ centroidLat: 28.8, centroidLng: 50.9 }),
    );
    expect(out.provenance).toBe('own-site-snapshot');
    expect(out.lat).toBeCloseTo(28.83);
  });

  it('isPoiLandmark recognises POI flavor keywords and rejects generic landmarks', () => {
    expect(isPoiLandmark('Natanz nuclear facility')).toBe(true);
    expect(isPoiLandmark('Al Udeid airbase')).toBe(true);
    expect(isPoiLandmark('Bandar Abbas port')).toBe(true);
    expect(isPoiLandmark('downtown Baghdad')).toBe(false);
    expect(isPoiLandmark('the presidential palace')).toBe(false);
    expect(isPoiLandmark(null)).toBe(false);
  });

  it('exports POI_KEYWORDS as a non-empty readonly list', () => {
    expect(POI_KEYWORDS.length).toBeGreaterThan(5);
    expect(POI_KEYWORDS.includes('nuclear')).toBe(true);
  });

  it('silently skips own-site-snapshot path when both snapshot loaders return null', async () => {
    // landmark='Natanz' has no POI keyword, so only direct path fires.
    vi.mocked(forwardGeocodeConstrained).mockResolvedValue([
      {
        lat: 33.7,
        lng: 51.7,
        displayName: 'Natanz, Iran',
        type: 'village',
        address: { country_code: 'ir' },
      },
    ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
  });

  it('runtime: resolver function does not depend on lat/lng from hierarchy (documentary)', async () => {
    expect(() => resolveLocation(hierarchy({ country: 'Iran' }), ctx())).not.toThrow();
  });

  it('haversineKm returns 0 for identical points and >10km for 0.1 lat offset', () => {
    expect(haversineKm(30, 50, 30, 50)).toBe(0);
    const km = haversineKm(30, 50, 30.1, 50);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(12);
  });
});

// -----------------------------------------------------------------------------
// Phase 27.4 Plan 05 Task 1 - POI amenity path (D-03)
// -----------------------------------------------------------------------------

describe('Phase 27.4 Plan 05 - POI amenity path (D-03)', () => {
  beforeEach(() => {
    __resetThrottleForTests();
    vi.mocked(loadSitesSnapshot).mockReturnValue(null);
    vi.mocked(loadWaterSnapshot).mockReturnValue(null);
    vi.mocked(forwardGeocodeConstrained).mockReset().mockResolvedValue([]);
    vi.mocked(cacheGetSafe).mockReset().mockResolvedValue(null);
    vi.mocked(cacheSetSafe).mockReset().mockResolvedValue(undefined);
    vi.mocked(callLLM).mockReset().mockResolvedValue(null);
  });

  it('resolves Natanz via POI amenity path when landmark has nuclear keyword', async () => {
    vi.mocked(forwardGeocodeConstrained).mockResolvedValueOnce([
      {
        lat: 33.72,
        lng: 51.73,
        displayName: 'Natanz Nuclear Facility',
        type: 'nuclear',
        address: { country_code: 'ir', country: 'Iran' },
      },
    ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    expect(out.provenance).toBe('poi-amenity-nominatim');
    expect(out.lat).toBeCloseTo(33.72);
    expect(out.lng).toBeCloseTo(51.73);

    const calls = vi.mocked(forwardGeocodeConstrained).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const opts = calls[0]![1]!;
    expect(opts.amenity).toBe('nuclear power plant');
    expect(opts.countrycodes).toBe('ir');
  });

  it('rejects POI candidate whose address.country_code differs from hierarchy.country', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        {
          lat: 40.0,
          lng: 35.0,
          displayName: 'Some place in Turkey',
          type: 'nuclear',
          address: { country_code: 'tr', country: 'Turkey' },
        },
      ])
      .mockResolvedValueOnce([
        {
          lat: 33.3,
          lng: 44.4,
          displayName: 'Direct fallthrough',
          type: 'city',
          address: { country_code: 'ir' },
        },
      ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    expect(out.provenance).not.toBe('poi-amenity-nominatim');
  });

  it('falls through when POI amenity query returns no results', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          lat: 33.3,
          lng: 44.4,
          displayName: 'Direct fallthrough',
          type: 'city',
          address: { country_code: 'ir' },
        },
      ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
  });

  it('does not call POI amenity path when landmark has no POI keyword', async () => {
    vi.mocked(forwardGeocodeConstrained).mockResolvedValue([
      {
        lat: 33.3,
        lng: 44.4,
        displayName: 'downtown Baghdad',
        type: 'city',
        address: { country_code: 'iq' },
      },
    ]);

    await resolveLocation(
      hierarchy({ country: 'Iraq', landmark: 'downtown Baghdad' }),
      ctx({ centroidLat: 33.3, centroidLng: 44.4 }),
    );

    const calls = vi.mocked(forwardGeocodeConstrained).mock.calls;
    for (const [, opts] of calls) {
      expect(opts?.amenity).toBeUndefined();
    }
  });

  it('caches POI amenity result in Redis and reuses it on second resolution', async () => {
    const cachedHit = { lat: 33.72, lng: 51.73, displayName: 'Natanz (cached)' };
    vi.mocked(cacheGetSafe).mockResolvedValueOnce(null);
    vi.mocked(forwardGeocodeConstrained).mockResolvedValueOnce([
      {
        lat: 33.72,
        lng: 51.73,
        displayName: 'Natanz Nuclear Facility',
        type: 'nuclear',
        address: { country_code: 'ir' },
      },
    ]);

    const h = hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' });
    const c = ctx({ centroidLat: 33.7, centroidLng: 51.7 });

    const first = await resolveLocation(h, c);
    expect(first.provenance).toBe('poi-amenity-nominatim');
    const callsAfterFirst = vi.mocked(forwardGeocodeConstrained).mock.calls.length;
    expect(vi.mocked(cacheSetSafe)).toHaveBeenCalled();

    vi.mocked(cacheGetSafe).mockResolvedValueOnce({
      data: cachedHit,
      stale: false,
      lastFresh: Date.now(),
    });

    const second = await resolveLocation(h, c);
    expect(second.provenance).toBe('poi-amenity-nominatim');
    expect(second.displayName).toBe('Natanz (cached)');
    expect(vi.mocked(forwardGeocodeConstrained).mock.calls.length).toBe(callsAfterFirst);
  });

  it('throttles sequential Nominatim calls to >= 1 req/s', async () => {
    vi.mocked(forwardGeocodeConstrained).mockResolvedValue([
      {
        lat: 33.72,
        lng: 51.73,
        displayName: 'Site A',
        type: 'nuclear',
        address: { country_code: 'ir' },
      },
    ]);

    const h1 = hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' });
    const h2 = hierarchy({ country: 'Iran', landmark: 'Bushehr nuclear power plant' });
    const c = ctx({ centroidLat: 33.7, centroidLng: 51.7 });

    const t0 = Date.now();
    await resolveLocation(h1, c);
    await resolveLocation(h2, c);
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeGreaterThanOrEqual(900);
  }, 10_000);

  it('negative-caches misses so repeated misses do not re-hit Nominatim', async () => {
    vi.mocked(forwardGeocodeConstrained).mockResolvedValue([]);

    const h = hierarchy({ country: 'Iran', landmark: 'Natanz nuclear facility' });
    const c = ctx({ centroidLat: 33.7, centroidLng: 51.7 });

    const first = await resolveLocation(h, c);
    expect(first.provenance).toBe('gdelt-actiongeo-fallback');
    const setCalls = vi.mocked(cacheSetSafe).mock.calls;
    const hasMissCache = setCalls.some(([key, data]) => {
      return (
        typeof key === 'string' &&
        key.includes('geocode:fwd:constrained:poi') &&
        data !== null &&
        typeof data === 'object' &&
        (data as { miss?: boolean }).miss === true
      );
    });
    expect(hasMissCache).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Phase 27.4 Plan 05 Task 2 - two-pass verify (D-04)
// -----------------------------------------------------------------------------

describe('Phase 27.4 Plan 05 - two-pass verify (D-04)', () => {
  beforeEach(() => {
    __resetThrottleForTests();
    vi.mocked(loadSitesSnapshot).mockReturnValue(null);
    vi.mocked(loadWaterSnapshot).mockReturnValue(null);
    vi.mocked(forwardGeocodeConstrained).mockReset().mockResolvedValue([]);
    vi.mocked(cacheGetSafe).mockReset().mockResolvedValue(null);
    vi.mocked(cacheSetSafe).mockReset().mockResolvedValue(undefined);
    vi.mocked(callLLM).mockReset().mockResolvedValue(null);
  });

  it('sanity gate fires on precision=city and runs two-pass verify', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.50, lng: 36.30, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.50, lng: 36.30, displayName: 'Damascus center', type: 'city', address: { country_code: 'sy' } },
        { lat: 33.52, lng: 36.29, displayName: 'Jobar neighborhood', type: 'suburb', address: { country_code: 'sy' } },
        { lat: 33.48, lng: 36.31, displayName: 'Other suburb', type: 'suburb', address: { country_code: 'sy' } },
      ]);

    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({ pick: 2, reasoning: 'matches Jobar' }),
    );

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({
        centroidLat: 33.5,
        centroidLng: 36.3,
        summary: 'Jobar shelling',
        articleTitles: ['Shelling in Jobar'],
      }),
    );

    expect(out.provenance).toBe('nominatim-verified-2pass');
    expect(out.lat).toBeCloseTo(33.52);
    expect(out.lng).toBeCloseTo(36.29);
  });

  it('sanity gate fires when direct hit lies >250km from centroid', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 40.0, lng: 50.0, displayName: 'Far away', type: 'village', address: { country_code: 'iq' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.0, lng: 44.0, displayName: 'A', type: 'village', address: { country_code: 'iq' } },
        { lat: 33.1, lng: 44.1, displayName: 'B', type: 'village', address: { country_code: 'iq' } },
        { lat: 33.2, lng: 44.2, displayName: 'C', type: 'village', address: { country_code: 'iq' } },
      ]);
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({ pick: 1, reasoning: 'ok' }));

    const out = await resolveLocation(
      hierarchy({ country: 'Iraq', landmark: 'Some place' }),
      ctx({ centroidLat: 33.0, centroidLng: 44.0 }),
    );

    expect(out.provenance).toBe('nominatim-verified-2pass');
    expect(out.lat).toBeCloseTo(33.0);
  });

  it('sanity gate does not fire on precision=neighborhood and distance <=250km', async () => {
    vi.mocked(forwardGeocodeConstrained).mockResolvedValueOnce([
      {
        lat: 33.5,
        lng: 36.3,
        displayName: 'Jobar neighborhood',
        type: 'suburb',
        address: { country_code: 'sy' },
      },
    ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus', neighborhood: 'Jobar' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
    expect(vi.mocked(callLLM)).not.toHaveBeenCalled();
  });

  it('sends reranker schema with pick (1-5) + reasoning (<=100) to callLLM', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'A', type: 'city', address: { country_code: 'sy' } },
        { lat: 33.52, lng: 36.29, displayName: 'B', type: 'suburb', address: { country_code: 'sy' } },
      ]);
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({ pick: 1, reasoning: 'ok' }));

    await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(callLLM).mock.calls[0]!;
    const jsonSchema = call[1] as Record<string, unknown>;
    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        pick: expect.objectContaining({ type: 'integer', minimum: 1, maximum: 5 }),
        reasoning: expect.objectContaining({ type: 'string', maxLength: 100 }),
      }),
      required: expect.arrayContaining(['pick', 'reasoning']),
      additionalProperties: false,
    });
  });

  it('parses reranker response and returns pick-1-based candidate', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.50, lng: 36.30, displayName: 'A', type: 'city', address: { country_code: 'sy' } },
        { lat: 33.55, lng: 36.35, displayName: 'B', type: 'suburb', address: { country_code: 'sy' } },
        { lat: 33.60, lng: 36.40, displayName: 'C', type: 'suburb', address: { country_code: 'sy' } },
      ]);
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({ pick: 3, reasoning: 'best match' }),
    );

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(out.provenance).toBe('nominatim-verified-2pass');
    expect(out.lat).toBeCloseTo(33.60);
    expect(out.lng).toBeCloseTo(36.40);
  });

  it('falls back to direct hit when callLLM returns null', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'A', type: 'city', address: { country_code: 'sy' } },
        { lat: 33.55, lng: 36.35, displayName: 'B', type: 'suburb', address: { country_code: 'sy' } },
      ]);
    vi.mocked(callLLM).mockResolvedValueOnce(null);

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
    expect(out.lat).toBeCloseTo(33.5);
  });

  it('falls back when reranker response fails Zod validation (pick out of range)', async () => {
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'A', type: 'city', address: { country_code: 'sy' } },
        { lat: 33.55, lng: 36.35, displayName: 'B', type: 'suburb', address: { country_code: 'sy' } },
      ]);
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({ pick: 99, reasoning: 'bad' }));

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
  });

  it('does not call LLM reranker when fewer than 2 candidates returned', async () => {
    // WR-04: single-candidate verify result is now accepted as a
    // nominatim-verified-2pass hit (no LLM call). Prior behavior cached
    // a miss and fell through to GDELT fallback for 30d — that path no
    // longer exists for length===1.
    vi.mocked(forwardGeocodeConstrained)
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Damascus', type: 'city', address: { country_code: 'sy' } },
      ])
      .mockResolvedValueOnce([
        { lat: 33.5, lng: 36.3, displayName: 'Only one', type: 'city', address: { country_code: 'sy' } },
      ]);

    const out = await resolveLocation(
      hierarchy({ country: 'Syria', city: 'Damascus' }),
      ctx({ centroidLat: 33.5, centroidLng: 36.3 }),
    );

    expect(out.provenance).toBe('nominatim-verified-2pass');
    expect(out.lat).toBeCloseTo(33.5);
    expect(out.lng).toBeCloseTo(36.3);
    expect(vi.mocked(callLLM)).not.toHaveBeenCalled();
  });
});
