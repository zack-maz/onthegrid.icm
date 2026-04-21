/**
 * Phase 27.4 Layered Geocoding Resolver (D-22).
 *
 * Input: LocationHierarchyV2 from the LLM (structured country → landmark).
 * Output: ResolvedLocation with a deterministic lat/lng + provenance tag.
 *
 * Six paths in strict priority order (D-22):
 *   1. own-site-snapshot         — local sites.json + water-facilities.json
 *   2. poi-amenity-nominatim     — [stub; Plan 05 wires amenity query]
 *   3. nominatim-direct          — existing forwardGeocode (Plan 04 extends to constrained)
 *   4. nominatim-verified-2pass  — [stub; Plan 05 wires 2-pass LLM pick]
 *   5. bellingcat-coord-passthrough — coords parsed from Bellingcat titles
 *   6. gdelt-actiongeo-fallback  — group centroid as last resort
 *
 * Invariants:
 *   - NEVER invents coordinates (D-05 architectural enforcement — every coord
 *     comes from a deterministic source: snapshot, Nominatim, Bellingcat, or
 *     GDELT centroid).
 *   - EVERY returned ResolvedLocation carries a `provenance` tag (no unset
 *     default — exhaustive 6-branch dispatch).
 *   - Graceful degradation (D-29): any branch throwing is caught, the branch
 *     is skipped, and dispatch proceeds to the next. Worst case = gdelt
 *     fallback, which always succeeds because group centroid is non-nullable.
 *
 * Plan 03 ships branches 1, 3, 5, 6 as functional; branches 2 and 4 are stubs
 * returning null so dispatch falls through. Plans 04/05 swap the stubs for
 * real implementations without changing the resolver call surface. Plan 06's
 * v2 extractor is the sole caller of resolveLocation.
 */

import { forwardGeocode } from '../adapters/nominatim.js';
import { loadSitesSnapshot } from './sitesSnapshot.js';
import { loadWaterSnapshot } from './waterSnapshot.js';
import { logger } from './logger.js';
import type { GeocodeProvenance, LocationHierarchyV2 } from './llmSchema.js';

const log = logger.child({ module: 'llm-resolver' });

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export interface ResolveContext {
  /** GDELT ActionGeo centroid for the event group — used for sanity gate + fallback. */
  centroidLat: number;
  centroidLng: number;
  /** Optional Bellingcat-extracted coord (from extractBellingcatGeo on matched titles). */
  bellingcatCoord?: { lat: number; lng: number } | null;
  /** Source article titles for 2-pass verify context (Plan 05 uses this). */
  articleTitles?: string[];
  /** Event group summary for 2-pass verify reranker prompt (Plan 05 uses this). */
  summary?: string;
}

export interface ResolvedLocation {
  lat: number;
  lng: number;
  provenance: GeocodeProvenance;
  /** Haversine km from the group centroid; used for D-04 sanity gate in Plan 05. */
  actionGeoDistanceKm: number;
  /** Display string (from Nominatim or synthesized from hierarchy) for DevApiStatus. */
  displayName: string;
}

// ---------------------------------------------------------------------------
// Haversine — inlined per RESEARCH.md "Don't Hand-Roll" row 3 (zero-dep,
// same formula already inlined inside server/lib/eventGrouping.ts so keeping
// a local copy avoids a circular import chain with Plan 06).
// ---------------------------------------------------------------------------

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// POI keyword gate (D-03 / RESEARCH.md Open Question A3 — hand-tuned list).
//
// Matches ~20 facility-flavor terms. Exported so llmResolver.test.ts can
// assert the probe without a private-symbol dance and so Plan 05 can re-use
// the same list when constructing the amenity query.
// ---------------------------------------------------------------------------

export const POI_KEYWORDS: readonly string[] = [
  'nuclear',
  'airbase',
  'air base',
  'naval base',
  'naval',
  'airport',
  'airfield',
  'port',
  'port of',
  'military base',
  'military complex',
  'garrison',
  'barracks',
  'dam',
  'reservoir',
  'refinery',
  'power plant',
  'power station',
  'pipeline',
  'oil terminal',
  'substation',
] as const;

/**
 * POI keyword probe — matches on whole-word boundaries so "port" does not
 * false-positive on "passport"/"transport" while still matching "Bandar
 * Abbas port" (trailing-word) and "port of Beirut" (leading-word).
 * Whitespace inside multi-word keywords is preserved literally.
 */
export function isPoiLandmark(landmark: string | null): boolean {
  if (!landmark) return false;
  const lower = landmark.toLowerCase();
  return POI_KEYWORDS.some((kw) => {
    // Escape regex metachars (none in the current list, but future-proof).
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b on each side so single-word tokens match whole words and
    // multi-word tokens match as phrases; start/end of string also counts.
    return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(lower);
  });
}

// ---------------------------------------------------------------------------
// Fuzzy name matcher for snapshot entries.
//
// Snapshot labels are curated (e.g., "Natanz Nuclear Facility"); LLM landmarks
// are free-text (e.g., "Natanz"). Case-insensitive substring match is safer
// than token-level fuzzy — avoids "Al" matching "Al Udeid" against "Al Asad".
// The 3-char floor prevents trivial collisions like "al" matching every
// Arab-world label.
// ---------------------------------------------------------------------------

export function fuzzyNameMatch(landmark: string, snapshotLabel: string): boolean {
  const a = landmark.trim().toLowerCase();
  const b = snapshotLabel.trim().toLowerCase();
  if (a.length < 3) return false;
  return b.includes(a) || a.includes(b);
}

function countryMatches(
  snapshotCountry: string | null | undefined,
  hierarchyCountry: string | null,
): boolean {
  if (!hierarchyCountry) return true; // no country filter → accept
  if (!snapshotCountry) return false; // snapshot unlabeled → don't match
  return snapshotCountry.toLowerCase() === hierarchyCountry.toLowerCase();
}

// ---------------------------------------------------------------------------
// Branch 1: own-site-snapshot.
//
// Reads both sites + water snapshots, filters by country (when hierarchy has
// one), substring-matches the landmark against each entry's label. First hit
// wins. Returns null when neither loader yields a match so dispatch falls
// through to the POI / direct / bellingcat / gdelt paths.
// ---------------------------------------------------------------------------

interface SnapshotHit {
  lat: number;
  lng: number;
  displayName: string;
}

function resolveFromSnapshot(hierarchy: LocationHierarchyV2): SnapshotHit | null {
  if (!hierarchy.landmark) return null;

  const sites = loadSitesSnapshot();
  if (sites?.sites) {
    for (const site of sites.sites) {
      const s = site as { country?: string; label?: string; lat?: number; lng?: number };
      if (!countryMatches(s.country ?? null, hierarchy.country)) continue;
      const label = s.label ?? '';
      if (fuzzyNameMatch(hierarchy.landmark, label)) {
        return {
          lat: s.lat as number,
          lng: s.lng as number,
          displayName: label,
        };
      }
    }
  }

  const water = loadWaterSnapshot();
  if (water?.facilities) {
    for (const f of water.facilities) {
      const w = f as { country?: string; label?: string; lat?: number; lng?: number };
      if (!countryMatches(w.country ?? null, hierarchy.country)) continue;
      const label = w.label ?? '';
      if (fuzzyNameMatch(hierarchy.landmark, label)) {
        return {
          lat: w.lat as number,
          lng: w.lng as number,
          displayName: label,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Branch 2: poi-amenity-nominatim — STUB (Plan 05 wires the real query).
//
// Plan 05 will call forwardGeocodeConstrained({ amenity: ... }) from
// server/adapters/nominatim.ts (extended in Plan 04). For Plan 03 skeleton:
// return null so the resolver falls through. The branch is still reachable
// (isPoiLandmark gates it) — wiring the stub keeps dispatch-order guarantees
// in place before Plans 04/05 extend the adapter.
// ---------------------------------------------------------------------------

async function resolveViaPoiAmenity(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hierarchy: LocationHierarchyV2,
): Promise<SnapshotHit | null> {
  return null;
}

// ---------------------------------------------------------------------------
// Branch 3: nominatim-direct.
//
// Uses the existing forwardGeocode (country-code-only constraint, no viewbox
// yet). Plan 04 extends the adapter to a constrained forwardGeocodeConstrained
// with viewbox + 22 countrycodes. This plan keeps the call narrow so swap-in
// is mechanical.
// ---------------------------------------------------------------------------

function buildDisplayNameForQuery(hierarchy: LocationHierarchyV2): string | null {
  const parts: string[] = [];
  if (hierarchy.landmark) parts.push(hierarchy.landmark);
  if (hierarchy.neighborhood) parts.push(hierarchy.neighborhood);
  if (hierarchy.city) parts.push(hierarchy.city);
  if (hierarchy.admin1) parts.push(hierarchy.admin1);
  if (hierarchy.country) parts.push(hierarchy.country);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

function countryCodeFromName(country: string | null): string | undefined {
  if (!country) return undefined;
  // Small lookup — expanded in Plan 04 via ME_COUNTRY_CODES list in meBounds.ts.
  const map: Record<string, string> = {
    iran: 'ir',
    iraq: 'iq',
    syria: 'sy',
    lebanon: 'lb',
    israel: 'il',
    palestine: 'ps',
    jordan: 'jo',
    egypt: 'eg',
    'saudi arabia': 'sa',
    uae: 'ae',
    'united arab emirates': 'ae',
    bahrain: 'bh',
    kuwait: 'kw',
    oman: 'om',
    qatar: 'qa',
    yemen: 'ye',
    turkey: 'tr',
    afghanistan: 'af',
    pakistan: 'pk',
    turkmenistan: 'tm',
    azerbaijan: 'az',
    armenia: 'am',
    georgia: 'ge',
  };
  return map[country.toLowerCase()];
}

async function resolveViaNominatimDirect(
  hierarchy: LocationHierarchyV2,
): Promise<SnapshotHit | null> {
  const query = buildDisplayNameForQuery(hierarchy);
  if (!query) return null;
  const cc = countryCodeFromName(hierarchy.country);
  try {
    const hit = await forwardGeocode(query, cc);
    if (!hit) return null;
    return { lat: hit.lat, lng: hit.lng, displayName: hit.displayName };
  } catch (err) {
    log.warn({ err, query }, 'nominatim-direct failed');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Branch 4: nominatim-verified-2pass — STUB (Plan 05 wires LLM pick).
//
// Plan 05 will: fetch top-5 via forwardGeocodeConstrained({ limit: 5 }), call
// the LLM reranker with (candidates, ctx.summary, ctx.articleTitles), return
// the picked candidate. Plan 05 also adds the D-04 sanity gate (precision ≤
// 'city' OR distance > 250km) that decides WHEN to enter this branch.
// ---------------------------------------------------------------------------

async function resolveViaVerifiedTwoPass(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hierarchy: LocationHierarchyV2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: ResolveContext,
): Promise<SnapshotHit | null> {
  return null;
}

// ---------------------------------------------------------------------------
// Branch 5 + 6: Bellingcat passthrough + GDELT fallback.
//
// Branch 5 reads ctx.bellingcatCoord when any upstream extractBellingcatGeo
// call matched an article title for the group. Branch 6 is the last resort
// — GDELT ActionGeo centroid is always present (group is never constructed
// without a centroid), so this branch never returns null.
// ---------------------------------------------------------------------------

function resolveViaBellingcat(ctx: ResolveContext): SnapshotHit | null {
  if (!ctx.bellingcatCoord) return null;
  return {
    lat: ctx.bellingcatCoord.lat,
    lng: ctx.bellingcatCoord.lng,
    displayName: 'Bellingcat-reported coordinate',
  };
}

function resolveViaActionGeoFallback(ctx: ResolveContext): SnapshotHit {
  return {
    lat: ctx.centroidLat,
    lng: ctx.centroidLng,
    displayName: 'GDELT ActionGeo centroid',
  };
}

// ---------------------------------------------------------------------------
// Main dispatcher.
//
// Six branches in strict D-22 order. Each branch either returns a
// ResolvedLocation with provenance set (dispatch terminates) or returns null
// (dispatch falls through). Every branch is wrapped in try/catch to preserve
// the D-29 graceful-degradation invariant — a throw in any upstream branch
// must not block the GDELT fallback from producing a coord.
// ---------------------------------------------------------------------------

export async function resolveLocation(
  hierarchy: LocationHierarchyV2,
  ctx: ResolveContext,
): Promise<ResolvedLocation> {
  // Branch 1: own-site-snapshot
  try {
    const hit = resolveFromSnapshot(hierarchy);
    if (hit) {
      return {
        ...hit,
        provenance: 'own-site-snapshot',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'own-site-snapshot path threw');
  }

  // Branch 2: poi-amenity-nominatim (stub in Plan 03; Plan 05 wires)
  if (isPoiLandmark(hierarchy.landmark)) {
    try {
      const hit = await resolveViaPoiAmenity(hierarchy);
      if (hit) {
        return {
          ...hit,
          provenance: 'poi-amenity-nominatim',
          actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
        };
      }
    } catch (err) {
      log.warn({ err }, 'poi-amenity-nominatim path threw');
    }
  }

  // Branch 3: nominatim-direct
  try {
    const hit = await resolveViaNominatimDirect(hierarchy);
    if (hit) {
      return {
        ...hit,
        provenance: 'nominatim-direct',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'nominatim-direct path threw');
  }

  // Branch 4: nominatim-verified-2pass (stub in Plan 03; Plan 05 wires)
  // Plan 05 will gate this on precision <= 'city' OR distance > 250km from
  // ActionGeo centroid (D-04 sanity gate).
  try {
    const hit = await resolveViaVerifiedTwoPass(hierarchy, ctx);
    if (hit) {
      return {
        ...hit,
        provenance: 'nominatim-verified-2pass',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'nominatim-verified-2pass path threw');
  }

  // Branch 5: bellingcat-coord-passthrough
  try {
    const hit = resolveViaBellingcat(ctx);
    if (hit) {
      return {
        ...hit,
        provenance: 'bellingcat-coord-passthrough',
        actionGeoDistanceKm: haversineKm(hit.lat, hit.lng, ctx.centroidLat, ctx.centroidLng),
      };
    }
  } catch (err) {
    log.warn({ err }, 'bellingcat path threw');
  }

  // Branch 6: gdelt-actiongeo-fallback (always succeeds — centroid is non-null).
  const hit = resolveViaActionGeoFallback(ctx);
  return { ...hit, provenance: 'gdelt-actiongeo-fallback', actionGeoDistanceKm: 0 };
}
