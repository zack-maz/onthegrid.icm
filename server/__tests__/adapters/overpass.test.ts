// @vitest-environment node
/**
 * Phase 27.3.1 R-05 — fetchSites stats population tests.
 *
 * Mirrors the pattern from overpass-water.test.ts Phase 27.3.1 R-08 block.
 * Asserts fetchSites returns { sites, stats } with:
 *  - stats.source === 'overpass' after a fresh fetch
 *  - stats.byCountry keyed by nearest-centroid (reuses overpass-water.nearestCountryName)
 *  - stats.byType tallies by SiteType
 *  - stats.overpass[] records telemetry per URL attempt
 *  - stats.overpass records fallback attempt on primary-fail
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { classifySiteType, normalizeElement, fetchSites } from '../../adapters/overpass.js';

function overpassSuccess(elements: unknown[]): Response {
  return new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function overpassError(status: number): Response {
  return new Response('upstream error', { status });
}

describe('classifySiteType', () => {
  it('returns "nuclear" for plant:source=nuclear', () => {
    expect(classifySiteType({ 'plant:source': 'nuclear' })).toBe('nuclear');
  });
  it('returns "naval" for military=naval_base', () => {
    expect(classifySiteType({ military: 'naval_base' })).toBe('naval');
  });
  it('returns "oil" for industrial=refinery', () => {
    expect(classifySiteType({ industrial: 'refinery' })).toBe('oil');
  });
  it('returns "airbase" for military=airfield', () => {
    expect(classifySiteType({ military: 'airfield' })).toBe('airbase');
  });
  it('returns "port" for harbour=yes', () => {
    expect(classifySiteType({ harbour: 'yes' })).toBe('port');
  });
  it('returns null for unrelated tags', () => {
    expect(classifySiteType({ highway: 'primary' })).toBeNull();
  });
});

describe('normalizeElement', () => {
  it('returns a SiteEntity for a nuclear plant node', () => {
    const el = {
      type: 'node' as const,
      id: 1,
      lat: 32.0,
      lon: 50.0,
      tags: { 'plant:source': 'nuclear', name: 'Bushehr', operator: 'AEOI' },
    };
    const site = normalizeElement(el);
    expect(site).not.toBeNull();
    expect(site?.siteType).toBe('nuclear');
    expect(site?.label).toBe('Bushehr');
    expect(site?.osmId).toBe(1);
  });

  it('returns null when lat/lng are missing', () => {
    const el = {
      type: 'way' as const,
      id: 2,
      tags: { military: 'naval_base' },
    };
    expect(normalizeElement(el)).toBeNull();
  });
});

describe('Phase 27.3.1 R-05 — fetchSites stats population', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Iran nuclear plant (Tehran area, named) — admits through classifier + Turkey filter
  const iranNuclear = {
    type: 'node',
    id: 2001,
    lat: 35.7,
    lon: 51.4,
    tags: { 'plant:source': 'nuclear', name: 'Tehran Reactor' },
  };
  // Iraq naval base (Basra area, named)
  const iraqNaval = {
    type: 'node',
    id: 2002,
    lat: 30.5,
    lon: 47.8,
    tags: { military: 'naval_base', name: 'Umm Qasr' },
  };
  // Saudi oil refinery (Riyadh area, named)
  const saudiOil = {
    type: 'node',
    id: 2003,
    lat: 24.7,
    lon: 46.7,
    tags: { industrial: 'refinery', name: 'Riyadh Refinery' },
  };
  // Element with no classifiable tags → no_type rejection
  const unclassifiable = {
    type: 'node',
    id: 2004,
    lat: 32.0,
    lon: 50.0,
    tags: { amenity: 'cafe', name: 'Not a site' },
  };
  // Element without coordinates → no_coords rejection (way without center)
  const noCoords = {
    type: 'way',
    id: 2005,
    tags: { 'plant:source': 'nuclear', name: 'No-Center Nuclear' },
  };
  // Western Turkey airbase (coordinates outside allowed Turkey bounds) → excluded_turkey
  // Istanbul area: lat 41.0, lng 28.9 (west of minLng=35 and north of maxLat=40)
  const westTurkeyAirbase = {
    type: 'node',
    id: 2006,
    lat: 41.0,
    lon: 28.9,
    tags: { military: 'airfield', name: 'Istanbul Airfield' },
  };
  // Duplicate OSM id → duplicate rejection
  const iranNuclearDup = { ...iranNuclear };

  it('returns { sites, stats } shape', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear]));
    const result = await fetchSites();
    expect(result).toHaveProperty('sites');
    expect(result).toHaveProperty('stats');
    expect(Array.isArray(result.sites)).toBe(true);
  });

  it('source is "overpass" and generatedAt is ISO 8601 after a successful fetch', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear]));
    const { stats } = await fetchSites();
    expect(stats.source).toBe('overpass');
    expect(() => new Date(stats.generatedAt).toISOString()).not.toThrow();
    expect(stats.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('populates byCountry via nearest centroid', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, saudiOil]));
    const { stats } = await fetchSites();
    expect(stats.byCountry.Iran).toBeDefined();
    expect(stats.byCountry.Iran.nuclear).toBe(1);
    expect(stats.byCountry['Saudi Arabia']).toBeDefined();
    expect(stats.byCountry['Saudi Arabia'].oil).toBe(1);
  });

  it('populates byType tally across site types', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, iraqNaval, saudiOil]));
    const { stats } = await fetchSites();
    expect(stats.byType.nuclear).toBe(1);
    expect(stats.byType.naval).toBe(1);
    expect(stats.byType.oil).toBe(1);
  });

  it('overpass[] records one entry on primary success', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear]));
    const { stats } = await fetchSites();
    expect(stats.overpass.length).toBe(1);
    expect(stats.overpass[0]).toMatchObject({
      mirror: 'primary',
      ok: true,
      attempts: 1,
      status: 200,
    });
    expect(typeof stats.overpass[0].durationMs).toBe('number');
  });

  it('overpass[] records fallback attempt when primary fails', async () => {
    // Primary 503, fallback 200
    fetchMock
      .mockResolvedValueOnce(overpassError(503))
      .mockResolvedValueOnce(overpassSuccess([iranNuclear]));
    const { stats } = await fetchSites();
    expect(stats.overpass.length).toBe(2);
    expect(stats.overpass[0]).toMatchObject({
      mirror: 'primary',
      ok: false,
      attempts: 1,
    });
    expect(stats.overpass[1]).toMatchObject({
      mirror: 'fallback',
      ok: true,
      attempts: 2,
    });
  });

  it('increments rejections.no_type for unclassifiable elements', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, unclassifiable]));
    const { stats } = await fetchSites();
    expect(stats.rejections.no_type).toBe(1);
  });

  it('increments rejections.no_coords for elements without lat/lng/center', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, noCoords]));
    const { stats } = await fetchSites();
    expect(stats.rejections.no_coords).toBe(1);
  });

  it('increments rejections.excluded_turkey for western Turkey sites', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, westTurkeyAirbase]));
    const { stats } = await fetchSites();
    expect(stats.rejections.excluded_turkey).toBeGreaterThan(0);
  });

  it('increments rejections.duplicate for repeated OSM ids', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, iranNuclearDup]));
    const { stats } = await fetchSites();
    expect(stats.rejections.duplicate).toBe(1);
  });

  it('rawCount equals element count and filteredCount equals kept sites', async () => {
    fetchMock.mockResolvedValueOnce(overpassSuccess([iranNuclear, unclassifiable, noCoords]));
    const { sites, stats } = await fetchSites();
    expect(stats.rawCount).toBe(3);
    expect(stats.filteredCount).toBe(sites.length);
    expect(sites.length).toBe(1);
  });
});
