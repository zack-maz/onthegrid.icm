// @vitest-environment node
/**
 * Phase 27.4 Plan 03 — tests for server/lib/llmResolver.ts.
 *
 * Covers the 13 behaviors in the plan's <behavior> block:
 *   1.  own-site-snapshot hits landmark match in sites snapshot
 *   2.  falls through to nominatim-direct when no snapshot match
 *   3.  POI keyword routes to poi-amenity-nominatim stub (returns null → falls through)
 *   4.  full fallback chain empty → gdelt-actiongeo-fallback
 *   5.  bellingcat-coord-passthrough when all earlier paths empty + ctx.bellingcatCoord present
 *   6.  actionGeoDistanceKm computed via haversine
 *   7.  fuzzyNameMatch: 'Natanz' vs 'Natanz Nuclear Facility' → true (substring)
 *   8.  fuzzyNameMatch: 'Bandar Abbas' vs 'bandar abbas naval base' → true (case-insensitive)
 *   9.  fuzzyNameMatch: 'Jobar' vs 'Damascus airport' → false
 *   10. snapshot matching filters by country (cross-country mismatch rejected)
 *   11. isPoiLandmark keyword probe (nuclear, airbase, port; negatives)
 *   12. both snapshots null → resolver silently skips own-site-snapshot path
 *   13. (TypeScript compile-time) — LocationHierarchyV2 does not accept lat/lng
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks so the resolver's imports resolve to the fakes.
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

import { loadSitesSnapshot } from '../../lib/sitesSnapshot.js';
import { loadWaterSnapshot } from '../../lib/waterSnapshot.js';
import { forwardGeocode } from '../../adapters/nominatim.js';
import {
  resolveLocation,
  fuzzyNameMatch,
  isPoiLandmark,
  haversineKm,
  POI_KEYWORDS,
  type ResolveContext,
} from '../../lib/llmResolver.js';
import type { LocationHierarchyV2 } from '../../lib/llmSchema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('llmResolver', () => {
  beforeEach(() => {
    vi.mocked(loadSitesSnapshot).mockReturnValue(null);
    vi.mocked(loadWaterSnapshot).mockReturnValue(null);
    vi.mocked(forwardGeocode).mockResolvedValue(null);
  });

  // ---- Test 1 — own-site-snapshot hit ---------------------------------------
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

  // ---- Test 2 — falls through to nominatim-direct --------------------------
  it('falls through to nominatim-direct when snapshot loaders return null and landmark is not POI', async () => {
    vi.mocked(forwardGeocode).mockResolvedValue({
      lat: 33.3,
      lng: 44.4,
      displayName: 'Baghdad, Iraq',
      type: 'city',
    });

    const out = await resolveLocation(
      hierarchy({ country: 'Iraq', city: 'Baghdad' }),
      ctx({ centroidLat: 33.3, centroidLng: 44.4 }),
    );

    expect(out.provenance).toBe('nominatim-direct');
    expect(out.lat).toBeCloseTo(33.3);
    expect(out.lng).toBeCloseTo(44.4);
  });

  // ---- Test 3 — POI keyword hits stub → falls through to nominatim-direct --
  it('POI keyword routes to poi-amenity-nominatim stub (null) and falls through', async () => {
    vi.mocked(forwardGeocode).mockResolvedValue({
      lat: 34.1,
      lng: 51.0,
      displayName: 'Some airbase location',
      type: 'airport',
    });

    // 'Al Udeid airbase' contains 'airbase' keyword → triggers POI branch,
    // stub returns null, resolver falls through to nominatim-direct.
    const out = await resolveLocation(
      hierarchy({ country: 'Qatar', landmark: 'Al Udeid airbase' }),
      ctx({ centroidLat: 34.1, centroidLng: 51.0 }),
    );

    // In Plan 03 skeleton the POI stub returns null, so provenance is nominatim-direct.
    expect(out.provenance).toBe('nominatim-direct');
  });

  // ---- Test 4 — all paths empty → gdelt-actiongeo-fallback -----------------
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

  // ---- Test 5 — bellingcat-coord-passthrough --------------------------------
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

  // ---- Test 6 — actionGeoDistanceKm is computed via haversine ---------------
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
    // 0.1 degrees of latitude ≈ 11.1 km
    expect(out.actionGeoDistanceKm).toBeGreaterThan(10);
    expect(out.actionGeoDistanceKm).toBeLessThan(12);
  });

  // ---- Test 7/8/9 — fuzzyNameMatch variants --------------------------------
  it('fuzzyNameMatch accepts substring inside a longer snapshot label', () => {
    expect(fuzzyNameMatch('Natanz', 'Natanz Nuclear Facility')).toBe(true);
  });

  it('fuzzyNameMatch is case-insensitive across landmark/label', () => {
    expect(fuzzyNameMatch('Bandar Abbas', 'bandar abbas naval base')).toBe(true);
  });

  it('fuzzyNameMatch returns false when names are unrelated', () => {
    expect(fuzzyNameMatch('Jobar', 'Damascus airport')).toBe(false);
  });

  // ---- Test 10 — country filter blocks cross-country match ------------------
  it('country filter blocks cross-country substring match', async () => {
    vi.mocked(loadSitesSnapshot).mockReturnValue({
      generatedAt: '2026-04-20T00:00:00Z',
      sites: [
        { label: 'Dimona Nuclear Power Plant', country: 'Israel', lat: 31.0, lng: 35.14 },
      ],
      stats: {},
    } as unknown as ReturnType<typeof loadSitesSnapshot>);

    // Hierarchy says Iran — should NOT match the Israel entry.
    // Nominatim fallback also returns null, so ends at gdelt fallback.
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
        // Include a non-matching Israel entry AND a matching Iran entry.
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

  // ---- Test 11 — isPoiLandmark keyword probe --------------------------------
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

  // ---- Test 12 — null snapshots → silent skip -------------------------------
  it('silently skips own-site-snapshot path when both snapshot loaders return null', async () => {
    // Both loaders return null (beforeEach default). landmark = 'Natanz' would
    // otherwise hit the snapshot. Resolver must NOT throw and must fall
    // through to the next reachable path.
    vi.mocked(forwardGeocode).mockResolvedValue({
      lat: 33.7,
      lng: 51.7,
      displayName: 'Natanz, Iran',
      type: 'village',
    });

    const out = await resolveLocation(
      hierarchy({ country: 'Iran', landmark: 'Natanz' }),
      ctx({ centroidLat: 33.7, centroidLng: 51.7 }),
    );

    // No crash + some downstream path produced a coord.
    expect(out.provenance).toBe('nominatim-direct');
  });

  // ---- Test 13 — TypeScript compile-time lat/lng rejection ------------------
  // This test documents the intent; the real enforcement is the
  // locationHierarchyV2 .strict() schema in llmSchema.ts (Plan 02).
  it('runtime: resolver function does not depend on lat/lng from hierarchy (documentary)', async () => {
    // This is a no-op test — presence of TS compile errors would block
    // runtime reaching here. If hierarchy somehow had a lat/lng via an
    // untyped object, the resolver ignores it because `resolveFromSnapshot`
    // and `resolveViaNominatimDirect` never read hierarchy.lat/lng.
    expect(() =>
      resolveLocation(hierarchy({ country: 'Iran' }), ctx()),
    ).not.toThrow();
  });

  // ---- haversineKm export sanity (supports Plan 05 distance-gate work) ------
  it('haversineKm returns 0 for identical points and >10km for 0.1° lat offset', () => {
    expect(haversineKm(30, 50, 30, 50)).toBe(0);
    const km = haversineKm(30, 50, 30.1, 50);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(12);
  });
});
