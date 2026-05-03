import riversData from '../../src/data/rivers.json' with { type: 'json' };
import { assignBasinStress } from '../lib/basinLookup.js';
import { logger } from '../lib/logger.js';
import {
  FACILITY_TYPE_LABELS,
  type WaterFacility,
  type WaterFacilityType,
  type WaterStressIndicators,
} from '../types.js';
// Phase 27.4.4 Plan 02 deploy fix — match basinLookup.ts: switch from
// runtime readFileSync to build-time JSON import. The bundle includes the
// rivers polygons inline; no fs reads at function cold-start.

const log = logger.child({ module: 'overpass-water' });

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.private.coffee/api/interpreter';
const TIMEOUT_MS = 90_000;

/**
 * Single bbox covering the Greater Middle East (matches IRAN_BBOX from constants).
 * Using bbox instead of area unions avoids expensive country-area resolution.
 */
const ME_BBOX = '15,30,42,70'; // south,west,north,east

// ---------- Priority Country & Notability Filters ----------

/** Full country centroids for priority-country classification (from basinLookup.ts, duplicated to avoid circular dep) */
const COUNTRY_CENTROIDS_FULL: [string, number, number][] = [
  ['Afghanistan', 33.9, 67.7],
  ['Armenia', 40.1, 45.0],
  ['Azerbaijan', 40.1, 47.6],
  ['Bahrain', 26.1, 50.6],
  ['Cyprus', 35.1, 33.4],
  ['Djibouti', 11.6, 43.2],
  ['Egypt', 26.8, 30.8],
  ['Eritrea', 15.2, 39.8],
  ['Georgia', 42.3, 43.4],
  ['Iran', 32.4, 53.7],
  ['Iraq', 33.2, 43.7],
  ['Israel', 31.0, 34.9],
  ['Jordan', 31.2, 36.5],
  ['Kuwait', 29.3, 47.5],
  ['Lebanon', 33.9, 35.9],
  ['Libya', 26.3, 17.2],
  ['Northern Cyprus', 35.3, 33.6],
  ['Oman', 21.5, 55.9],
  ['Pakistan', 30.4, 69.3],
  ['Qatar', 25.4, 51.2],
  ['Saudi Arabia', 23.9, 45.1],
  ['Somalia', 5.2, 46.2],
  ['Sudan', 12.9, 30.2],
  ['Syria', 35.0, 38.0],
  ['Turkey', 39.0, 35.2],
  ['Turkmenistan', 38.5, 58.4],
  ['United Arab Emirates', 23.4, 53.8],
  ['Uzbekistan', 41.4, 64.6],
  ['Yemen', 15.6, 48.5],
];

/**
 * Countries where all facility types are kept (conflict zones with strategic water infrastructure).
 *
 * Phase 27.3 Round 3 (reservoirs-missing-after-05) — expanded to the full Middle
 * East so that named dams/reservoirs from Egypt (Nile basin, Aswan Dam) and
 * the Gulf states (Saudi Arabia, UAE, Kuwait, Qatar, Yemen) admit via REV-2
 * without requiring a wikidata tag. User target is ~400 dams and ~400
 * reservoirs across the map.
 *
 * Phase 27.3.1 Plan 10 (G2 gap closure): Turkey REMOVED after UAT showed 165
 * of 602 admits (27%) concentrated in Turkey — more than the whole conflict
 * core (177 across Iran+Iraq+Syria+Lebanon+Israel+Yemen combined). The new
 * `excluded_turkey` reject branch in `computeAdmissionDecision` catches any
 * Turkey country-attribution that slipped past the existing geographic
 * `isExcludedLocation` guard (which only catches western/central Turkey via
 * the 600km-from-Diyarbakir rule).
 *
 * Note: this plan ONLY removes Turkey. No additions. DIAGNOSIS §G2 also
 * floated adding Pakistan as a parallel expansion — that is out of scope for
 * G1+G2 (UAT evidence was strictly about Turkey over-representation). Revisit
 * Pakistan in a future follow-up if post-regen coverage looks thin.
 */
const PRIORITY_COUNTRIES = new Set([
  'Israel',
  'Jordan',
  'Lebanon',
  'Syria',
  'Iraq',
  'Iran',
  'Afghanistan',
  // Added Round 3 (2026-04-18): major Middle East water infrastructure holders.
  'Egypt',
  'Saudi Arabia',
  'United Arab Emirates',
  'Kuwait',
  'Qatar',
  'Yemen',
]);

/**
 * Phase 27.3.1 R-08 D-28 — return the nearest centroid country name for a
 * given coordinate. Used as the lookup key for `WaterFilterStats.byCountry`
 * and as the shared backend for `isPriorityCountry` / `isExcludedLocation`.
 *
 * Note: nearest-centroid is approximate — a coordinate equidistant from two
 * country centroids may attribute to the neighbor. For per-country admission
 * tallies in DevApiStatus, this is acceptable (the goal is "which country
 * dominates", not legal sovereignty). The 29-entry centroid table caps the
 * worst-case mis-attribution to one neighbor over.
 */
export function nearestCountryName(lat: number, lng: number): string {
  let minDist = Infinity;
  let nearest = '';
  for (const [name, clat, clng] of COUNTRY_CENTROIDS_FULL) {
    const d = haversine(lat, lng, clat, clng);
    if (d < minDist) {
      minDist = d;
      nearest = name;
    }
  }
  return nearest;
}

/**
 * Returns true if coordinates fall within a priority country (conflict zone).
 * Priority countries keep all facility types; non-priority apply notability filters.
 */
export function isPriorityCountry(lat: number, lng: number): boolean {
  return PRIORITY_COUNTRIES.has(nearestCountryName(lat, lng));
}

/**
 * Strict notability: wikidata/wikipedia refs only. Used for reservoirs
 * (high volume — need strict filter to keep count manageable).
 */
export function isNotable(tags: Record<string, string>): boolean {
  if (tags.wikidata) return true;
  if (tags.wikipedia) return true;
  if (Object.keys(tags).some((k) => k.startsWith('wikipedia:'))) return true;
  return false;
}

/**
 * Phase 27.3.1 R-03 / D-05 (Plan 10 gap closure G1): real-name requirement.
 * An OSM element is admitted only when it carries `name`, `name:en`, or
 * `operator` with a non-empty trimmed string.
 *
 * The old `isNotable(tags)` shortcut (wikidata / wikipedia / `wikipedia:*`
 * keys) is REMOVED — UAT G1 confirmed wikidata-only elements cleared this
 * gate but then lacked a Latin-script name downstream, producing "Dam near
 * X" generic labels from the reverse-geocode labeler. Those facilities now
 * land in the `no_name` rejection bucket instead (DIAGNOSIS §G1: ~139
 * admits pre-Plan-10 came in via this wikidata-only path).
 *
 * isNotable remains a separate signal used inside the D-06 compound gate
 * (isNotable OR isPriorityCountry OR hasCapacityData, 2-of-3) — it just
 * no longer grants hasName the way it used to.
 */
export function hasName(tags: Record<string, string>): boolean {
  if (tags['name']?.trim()) return true;
  if (tags['name:en']?.trim()) return true;
  if (tags['operator']?.trim()) return true;
  return false;
}

/**
 * Phase 27.3.1 R-03 / D-06: capacity data signals a documented, notable
 * facility even when OSM has no wikidata/wikipedia ref. Any of the four
 * tags counts (non-empty trimmed string value); the normalize helper later
 * parses numbers via extractCapacityTags, so we only check presence here.
 *
 * Used inside the D-06 compound admission gate:
 *   admit = hasName(tags) AND (isNotable(tags) || isPriorityCountry(lat,lng) || hasCapacityData(tags))
 *
 * Exported for Plan 06's planned consolidation into computeAdmissionDecision.
 */
export function hasCapacityData(tags: Record<string, string>): boolean {
  return !!(
    tags['height']?.trim() ||
    tags['volume']?.trim() ||
    tags['capacity']?.trim() ||
    tags['area']?.trim()
  );
}

/**
 * Phase 27.3.2 D-01 / D-05: Latin-label admission check. True iff at least
 * one of `name:en` / `name` / `operator` is a non-empty trimmed string AND
 * passes the isLatin script guard. Mirrors the script-check branches already
 * present in extractLabel — consolidated so computeAdmissionDecision can
 * reject non-Latin-only elements with the `no_resolved_name` bucket.
 *
 * Desalination callers bypass this check (see D-03 exemption in
 * computeAdmissionDecision).
 */
/**
 * Phase 27.3.2 post-ship micro-patch — Latin script alone is insufficient when
 * the name tag is literally the bare facility type ("Dam", "Reservoir"). Such
 * names pass isLatin trivially but carry no real identity. Bare generics are
 * treated as missing so `computeAdmissionDecision` rejects into the
 * `no_resolved_name` bucket for non-desal facilities.
 *
 * Desalination admission bypasses hasLatinLabel (D-03 exemption), so the 3
 * bare "Desalination Plant" entries in the current snapshot are unaffected.
 */
const GENERIC_OSM_NAME_RE = /^(dam|reservoir|desalination(?:\s+plant)?)$/i;

export function hasLatinLabel(tags: Record<string, string>): boolean {
  const isRealLatin = (s: string | undefined): s is string =>
    !!s && isLatin(s) && !GENERIC_OSM_NAME_RE.test(s);
  const en = tags['name:en']?.trim();
  if (isRealLatin(en)) return true;
  const name = tags['name']?.trim();
  if (isRealLatin(name)) return true;
  const op = tags['operator']?.trim();
  if (isRealLatin(op)) return true;
  return false;
}

/** Countries to fully exclude */
const EXCLUDED_COUNTRIES = new Set(['Uzbekistan', 'Tajikistan', 'Kyrgyzstan', 'Kazakhstan']);

/** Haversine distance in km (lightweight, no import needed) */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if a facility should be excluded based on location.
 * Excludes: western Turkey (west of 35°E), Uzbekistan, Tajikistan, Kyrgyzstan, Kazakhstan.
 * Keeps: Iran, Iraq, Syria, Lebanon, Israel, Jordan, Gulf states, Egypt, Pakistan, Afghanistan, Turkmenistan.
 */
function isExcludedLocation(lat: number, lng: number): boolean {
  // Western Turkey: exclude facilities too far from the SE Turkey conflict zone.
  // Uses distance from Diyarbakir (37.9°N, 40.2°E) — the strategic center.
  // >600km away captures western/central Turkey while keeping the Kurdish southeast.
  if (lat > 36 && lng < 42) {
    const distFromSE = haversine(lat, lng, 37.9, 40.2);
    if (distFromSE > 600) return true;
  }

  // Phase 27.3.1 R-08: use shared nearestCountryName helper.
  if (EXCLUDED_COUNTRIES.has(nearestCountryName(lat, lng))) return true;

  return false;
}

// ---------- City Data for Enrichment (REV-1 expanded coverage) ----------

interface CityEntry {
  name: string;
  lat: number;
  lng: number;
  population: number;
}

const CITY_DATA: CityEntry[] = [
  { name: 'Tehran', lat: 35.6892, lng: 51.389, population: 9_000_000 },
  { name: 'Baghdad', lat: 33.3152, lng: 44.3661, population: 7_500_000 },
  { name: 'Damascus', lat: 33.5138, lng: 36.2765, population: 2_500_000 },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818, population: 4_000_000 },
  { name: 'Jerusalem', lat: 31.7683, lng: 35.2137, population: 950_000 },
  { name: 'Riyadh', lat: 24.7136, lng: 46.6753, population: 7_600_000 },
  { name: 'Beirut', lat: 33.8938, lng: 35.5018, population: 2_400_000 },
  { name: 'Amman', lat: 31.9454, lng: 35.9284, population: 4_000_000 },
  { name: 'Kabul', lat: 34.5553, lng: 69.2075, population: 4_400_000 },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479, population: 1_100_000 },
  { name: 'Ankara', lat: 39.9334, lng: 32.8597, population: 5_700_000 },
  { name: "Sana'a", lat: 15.3694, lng: 44.191, population: 3_900_000 },
  { name: 'Doha', lat: 25.2854, lng: 51.531, population: 2_400_000 },
  { name: 'Kuwait City', lat: 29.3759, lng: 47.9774, population: 3_100_000 },
  { name: 'Muscat', lat: 23.588, lng: 58.3829, population: 1_500_000 },
  { name: 'Manama', lat: 26.2285, lng: 50.586, population: 600_000 },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773, population: 1_500_000 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, population: 3_400_000 },
  { name: 'Aden', lat: 12.7855, lng: 45.0187, population: 1_000_000 },
  { name: 'Basra', lat: 30.5085, lng: 47.7804, population: 2_800_000 },
  { name: 'Mosul', lat: 36.335, lng: 43.1189, population: 1_800_000 },
  { name: 'Aleppo', lat: 36.2021, lng: 37.1343, population: 2_100_000 },
  { name: 'Homs', lat: 34.7324, lng: 36.7137, population: 800_000 },
  { name: 'Isfahan', lat: 32.6546, lng: 51.668, population: 2_200_000 },
  { name: 'Tabriz', lat: 38.0962, lng: 46.2738, population: 1_800_000 },
  { name: 'Jeddah', lat: 21.4858, lng: 39.1925, population: 4_700_000 },
  { name: 'Medina', lat: 24.4672, lng: 39.6024, population: 1_500_000 },
  { name: 'Haifa', lat: 32.794, lng: 34.9896, population: 300_000 },
  { name: 'Gaza City', lat: 31.5017, lng: 34.4668, population: 600_000 },
  { name: 'Karachi', lat: 24.8607, lng: 67.0011, population: 16_000_000 },
  { name: 'Tikrit', lat: 34.6115, lng: 43.677, population: 160_000 },
  { name: 'Fallujah', lat: 33.3484, lng: 43.7753, population: 350_000 },
  { name: 'Ramadi', lat: 33.4271, lng: 43.3068, population: 300_000 },
  { name: 'Kirkuk', lat: 35.4681, lng: 44.3953, population: 1_000_000 },
  { name: 'Idlib', lat: 35.9306, lng: 36.6339, population: 165_000 },
  { name: 'Deir ez-Zor', lat: 35.3359, lng: 40.1408, population: 250_000 },
  { name: 'Hodeidah', lat: 14.798, lng: 42.954, population: 600_000 },
  { name: 'Kandahar', lat: 31.628, lng: 65.7372, population: 600_000 },
  { name: 'Mazar-i-Sharif', lat: 36.7069, lng: 67.11, population: 500_000 },
  { name: 'Lahore', lat: 31.5497, lng: 74.3436, population: 13_000_000 },
  { name: 'Peshawar', lat: 34.0151, lng: 71.5249, population: 2_000_000 },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357, population: 21_000_000 },
  // Dam-complex cities added per REV-1 to improve enrichment coverage:
  { name: 'Tabqa', lat: 35.8367, lng: 38.5478, population: 100_000 },
  { name: 'Dukan', lat: 35.95, lng: 44.95, population: 50_000 },
  { name: 'Tarbela', lat: 34.085, lng: 72.6985, population: 30_000 },
  { name: 'Mangla', lat: 33.1456, lng: 73.6444, population: 40_000 },
  { name: 'Kajaki', lat: 32.3175, lng: 65.1228, population: 15_000 },
  { name: 'Aswan', lat: 24.0889, lng: 32.8998, population: 290_000 },
  { name: 'Diyarbakir', lat: 37.9144, lng: 40.2306, population: 1_100_000 },
  { name: 'Khartoum', lat: 15.5007, lng: 32.5599, population: 5_000_000 },
  { name: 'Shiraz', lat: 29.5918, lng: 52.5836, population: 1_900_000 },
];

// ---------- Pre-computed River Bounding Boxes (REV-3) ----------

interface RiverFeature {
  type: 'Feature';
  properties: { name: string; scalerank?: number; compositeHealth?: number };
  geometry: { type: 'MultiLineString' | 'LineString'; coordinates: number[][] | number[][][] };
}

interface RiverBbox {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  vertices: [number, number][];
}

// Phase 27.4.4 Plan 02 deploy fix — riversData imported at build time
// (see import statement at top of file). Cast to expected shape since the
// JSON module assertion gives us a generic object.
const riversTyped: { features: RiverFeature[] } = riversData as { features: RiverFeature[] };

export const RIVER_BBOXES: RiverBbox[] = riversTyped.features.map((f) => {
  const coords: number[][] =
    f.geometry.type === 'LineString'
      ? (f.geometry.coordinates as number[][])
      : (f.geometry.coordinates as number[][][]).flat();
  const vertices: [number, number][] = coords
    .filter((c) => c[0] !== undefined && c[1] !== undefined)
    .map((c) => [c[0]!, c[1]!] as [number, number]);
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [lng, lat] of vertices) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { name: f.properties.name, minLat, maxLat, minLng, maxLng, vertices };
});

// ---------- Facility Queries (D-01 union, D-03 drop treatment) ----------

/**
 * Split into separate queries per facility type to keep each request light.
 * Dams: union of waterway=dam + man_made=dam (D-01).
 * Reservoirs: natural=water+reservoir + landuse=reservoir.
 * Desalination: man_made=desalination_plant + water_works=desalination.
 * treatment_plant removed (D-03).
 */
const FACILITY_QUERIES: { label: string; nwr: string }[] = [
  { label: 'dams', nwr: '(nwr["waterway"="dam"];nwr["man_made"="dam"];)' },
  {
    label: 'reservoirs',
    nwr: '(way["natural"="water"]["water"="reservoir"];relation["natural"="water"]["water"="reservoir"];way["landuse"="reservoir"];relation["landuse"="reservoir"];)',
  },
  {
    label: 'desalination',
    nwr: '(nwr["man_made"="desalination_plant"];nwr["water_works"="desalination"];)',
  },
];

function buildQuery(nwr: string): string {
  return `[out:json][timeout:90][bbox:${ME_BBOX}];${nwr};out center tags;`;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** True if string contains only Latin script characters (plus digits, punctuation, spaces) */
function isLatin(str: string): boolean {
  return /^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u.test(str);
}

/** Title-case a string */
function toTitleCase(str: string): string {
  return str
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(\w)(\w*)/g, (_m, first, rest) => first + rest);
}

/**
 * Reclassify reservoir-tagged OSM elements named "X Dam" as dams (tag-wrong
 * but name ground-truth). Terminal-anchored to avoid over-matching "X Dam
 * Lake" / "X Dam Reservoir". One-directional: reservoir → dam only.
 * Detail: .planning/debug/reservoirs-missing-after-05.md (2026-04-18 Round 1 fix).
 */
const DAM_IN_NAME_RE = /\bdam\s*$/i;

/**
 * Classify OSM tags into a WaterFacilityType.
 * Returns null if tags don't match any water infrastructure.
 */
export function classifyWaterType(tags: Record<string, string>): WaterFacilityType | null {
  let result: WaterFacilityType | null = null;
  if (tags['waterway'] === 'dam') result = 'dam';
  else if (tags['man_made'] === 'dam') result = 'dam';
  else if (tags['natural'] === 'water' && tags['water'] === 'reservoir') result = 'reservoir';
  else if (tags['landuse'] === 'reservoir') result = 'reservoir';
  else if (tags['man_made'] === 'desalination_plant') result = 'desalination';
  else if (tags['water_works'] === 'desalination') result = 'desalination';

  // Phase 27.3 Plan 05 / UAT Test 8b: name-based override for reservoir → dam.
  // An OSM element tagged reservoir but named "<Something> Dam" is almost always
  // a dam whose mapper only tagged the impounded water surface. One-directional.
  if (result === 'reservoir') {
    const name = tags['name:en'] ?? tags['name'] ?? '';
    if (DAM_IN_NAME_RE.test(name)) {
      return 'dam';
    }
  }

  return result;
}

// FACILITY_TYPE_LABELS moved to server/types.ts (Phase 27.3.2 post-ship fix) so
// client code can import it without pulling this module's Node-only fs/path/url
// top-level imports into the browser bundle. Re-exported below for existing
// consumers (test fixtures, route helpers) that import from this module.
export { FACILITY_TYPE_LABELS };

/**
 * Extract an English label from OSM tags.
 *
 * Phase 27.3.2 D-06: extended with a desalination-only synthesis branch for
 * the 5 exempt non-Latin desal facilities. Non-desal facilities never hit
 * the synthesis branches because `computeAdmissionDecision` rejects them
 * via `no_resolved_name` at admission time (D-05, Plan 04). Label
 * synthesis lives server-side so the client can be a one-line read (D-08,
 * Plan 07).
 *
 * Resolution order:
 *   1. name:en Latin → title-cased name:en
 *   2. name Latin → title-cased name
 *   3. operator Latin → title-cased operator
 *   4. [NEW — desal only] "Desalination Plant near {city}" (nearestCity within 150km)
 *   5. [NEW — desal only] "Desalination Plant at {lat}°, {lng}°" (no city)
 *   6. Bare FACILITY_TYPE_LABELS[facilityType] — never reached for non-desal
 *      post-admission (defense-in-depth only).
 *
 * The coord synthesis in branch 5 is byte-identical to the old client
 * fallback in src/lib/waterLabel.ts (pre-Plan-07), so any stale cached
 * labels remain renderable identically when the client collapses to a
 * one-liner.
 */
function extractLabel(
  tags: Record<string, string>,
  facilityType: WaterFacilityType,
  lat: number,
  lng: number,
  nearestCity: ReturnType<typeof findNearestCity>,
): string {
  const en = tags['name:en'];
  if (en && en.trim() && isLatin(en)) return toTitleCase(en);
  const raw = tags['name'] || '';
  if (raw && isLatin(raw)) return toTitleCase(raw);
  if (tags.operator && isLatin(tags.operator)) return toTitleCase(tags.operator);

  // D-06 desal-only synthesis branches (non-desal rejected at admission).
  if (facilityType === 'desalination') {
    if (nearestCity) {
      return `Desalination Plant near ${nearestCity.name}`;
    }
    const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
    const lngStr = `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
    return `Desalination Plant at ${latStr}, ${lngStr}`;
  }

  return FACILITY_TYPE_LABELS[facilityType];
}

// ---------- Enrichment Functions ----------

/**
 * Extract capacity-related OSM tags into structured numbers.
 * Strips unit suffixes (e.g. "85 m" → 85).
 */
export function extractCapacityTags(
  tags: Record<string, string>,
): { height?: number; volume?: number; area?: number } | null {
  // parseFloat naturally stops at first non-numeric char, handling "85 m", "1000000 m3", etc.
  const stripUnits = (v: string) => parseFloat(v);
  const heightRaw = tags['height'];
  const height = heightRaw ? stripUnits(heightRaw) : undefined;
  const volRaw = tags['volume'] ?? tags['capacity'];
  const volume = volRaw ? stripUnits(volRaw) : undefined;
  const areaRaw = tags['area'];
  const area = areaRaw ? stripUnits(areaRaw) : undefined;
  const result: { height?: number; volume?: number; area?: number } = {};
  if (height !== undefined && !isNaN(height)) result.height = height;
  if (volume !== undefined && !isNaN(volume)) result.volume = volume;
  if (area !== undefined && !isNaN(area)) result.area = area;
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Find the nearest city within 150km of the given coordinates.
 * Returns null if no city is within range.
 */
export function findNearestCity(
  lat: number,
  lng: number,
): { name: string; distanceKm: number; population: number } | null {
  let nearest: { name: string; distanceKm: number; population: number } | null = null;
  for (const city of CITY_DATA) {
    const d = haversine(lat, lng, city.lat, city.lng);
    if (!nearest || d < nearest.distanceKm) {
      nearest = { name: city.name, distanceKm: Math.round(d), population: city.population };
    }
  }
  return nearest && nearest.distanceKm <= 150 ? nearest : null;
}

/**
 * Find the nearest river within 20km of the given coordinates.
 * Uses pre-computed bounding boxes (REV-3) to skip ~80% of vertex iterations.
 * Returns null if no river is within range.
 */
export function linkRiver(lat: number, lng: number): { name: string; distanceKm: number } | null {
  const BBOX_MARGIN_DEG = 0.2;
  let nearest: { name: string; distanceKm: number } | null = null;
  for (const river of RIVER_BBOXES) {
    if (
      lat < river.minLat - BBOX_MARGIN_DEG ||
      lat > river.maxLat + BBOX_MARGIN_DEG ||
      lng < river.minLng - BBOX_MARGIN_DEG ||
      lng > river.maxLng + BBOX_MARGIN_DEG
    )
      continue;
    for (const [vlng, vlat] of river.vertices) {
      const d = haversine(lat, lng, vlat, vlng);
      if (!nearest || d < nearest.distanceKm) {
        nearest = { name: river.name, distanceKm: Math.round(d) };
      }
    }
  }
  return nearest && nearest.distanceKm <= 20 ? nearest : null;
}

// ---------- Holistic Notability Score (REV-1) ----------

/**
 * Compute a holistic notability score (0-100) for a water facility.
 * Facilities below MIN_NOTABILITY_SCORE are bypassed regardless of country.
 */
export function computeNotabilityScore(
  tags: Record<string, string>,
  facilityType: WaterFacilityType,
  inPriorityCountry: boolean,
): number {
  let score = 0;
  // isNotable covers wikidata, wikipedia, and any wikipedia:lang key
  if (isNotable(tags)) score += 40;
  if (tags['name:en']?.trim()) score += 20;
  else if (tags.name?.trim()) score += 15;
  if (inPriorityCountry) score += 15;
  if (tags.operator) score += 10;
  if (tags.height || tags.volume || tags.capacity) score += 10;
  if (facilityType === 'desalination') score += 5;
  return score;
}

// ---------- Filter Stats ----------

/**
 * WaterFilterStats — field usage audit (Phase 27.3.1 R-06 D-22).
 * Last audited: 2026-04-18.
 *
 * Field              UI consumer (src/components/ui/DevApiStatus.tsx)
 * ─────────────────  ───────────────────────────────────────────────
 * rawCounts          WaterFiltersSection per-type table (line ~786) + totalRaw summary (line ~743)
 * filteredCounts     WaterFiltersSection per-type table (line ~786) + totalKept summary (line ~744)
 * rejections         "Total rejections" summary row (line ~834)
 * byTypeRejections   "Rejections by Type" block (line ~817-828) — R-08 D-31
 * byCountry          "By Country" table (line ~754, byCountrySorted) — R-08 D-28
 * overpass           "Overpass Health" block (line ~848-860) — R-08 D-29
 * source             Provenance header "Source:" (line ~769) — R-08 D-30
 * generatedAt        Provenance header relative-time (line ~771) — R-08 D-30
 * enrichment         "Enriched:" row (line ~841-844) — Phase 27.3-02 D-04
 * scoreHistogram     "Scores:" row (line ~863-865) — Phase 27.3-01 D-04
 *
 * All fields are live. No pruning needed in R-06 D-22.
 *
 * Rationale for keeping enrichment + scoreHistogram (legacy pre-R-08 fields):
 * - enrichment: shows D-06/D-07/D-08 enrichment coverage — useful to spot
 *   Nominatim/city-data regressions (e.g. a sudden drop in `withCity` would
 *   hint at CITY_DATA coverage gap).
 * - scoreHistogram: future calibration (e.g. adjusting MIN_NOTABILITY_SCORE)
 *   needs the score distribution to reason about cutoffs. R-02 (Plan 04)
 *   used byTypeRejections.not_notable over scoreHistogram for the 2-of-3
 *   decision, but the histogram remains the authoritative score-cutoff view.
 */

/**
 * Phase 27.3.1 R-08 D-29 — per-Overpass-fetch telemetry. One entry per
 * facility-type query attempt (three queries total; each may hit primary +
 * fallback URL so entry count can be up to 6 in the worst case).
 *
 * `mirror` is a label ('primary' | 'fallback'), NOT the raw URL — keeps
 * internal mirror hosts out of client-observable telemetry per the threat
 * model in 27.3.1-03-PLAN.md.
 */
export interface OverpassFetchRecord {
  facilityType: string; // e.g. 'dams', 'reservoirs', 'desalination'
  mirror: string; // 'primary' | 'fallback'
  status: number; // HTTP status; 0 when network error before response
  durationMs: number;
  attempts: number; // 1 on first-try success, 2 when fallback was hit
  ok: boolean; // final outcome — true if this attempt produced usable JSON
}

/**
 * Phase 27.3.1 R-08 D-30 — provenance tag for the response payload. Plan 05
 * (R-04) adds 'snapshot' as a real value when the static `src/data/water-
 * facilities.json` cold-start tier lands. Pre-Plan-05 only 'redis' (cached
 * response) and 'overpass' (fresh fetch) are produced by the route layer.
 */
export type WaterDataSource = 'snapshot' | 'redis' | 'overpass';

export interface WaterFilterStats {
  rawCounts: Record<string, number>;
  filteredCounts: Record<string, number>;
  /** Summed across all facility types — preserved for back-compat with pre-R-08 UI. */
  rejections: {
    excluded_location: number;
    /**
     * Phase 27.3.1 Plan 10 (G2) — Turkey country-exclusion bucket. Mirrors
     * the sites adapter `excluded_turkey` bucket (overpass.ts). Counts
     * facilities that slipped past the geographic `excluded_location` rule
     * but nearest-centroid to Turkey. Kept semantically distinct from
     * `excluded_location`: the former is "geographic 600km-from-Diyarbakir",
     * this is "country attribution".
     */
    excluded_turkey: number;
    not_notable: number;
    no_name: number;
    /**
     * Phase 27.3.2 D-04 — non-desalination facility whose OSM tags fail the
     * Latin-script label check (`hasLatinLabel`). Admitted via `hasName` but
     * none of `name:en` / `name` / `operator` passes `isLatin`. Desal is
     * exempt (sparse OSM coverage — server synthesizes a label in
     * `extractLabel`). Placed between `no_name` and `duplicate` so the
     * rejection buckets read as progressive strictness.
     */
    no_resolved_name: number;
    duplicate: number;
    low_score: number;
    /** Rejected for failing the "notability via city proximity" check: no wikidata, no wikipedia, and no nearestCity within 150km. See Phase 27.3 Plan 04 / UAT Test 3. */
    no_city: number;
  };
  /**
   * Phase 27.3.1 R-08 D-31 — per-facility-type rejection breakdown. Surfaces
   * which gate each type hits hardest instead of the summed view. Keys are
   * the FACILITY_QUERIES labels ('dams' | 'reservoirs' | 'desalination')
   * matching `rawCounts` / `filteredCounts`. Each sub-object carries the same
   * seven buckets as `rejections` (Plan 10 added excluded_turkey). The summed
   * `rejections` field is the sum of these per-type buckets — both stay in
   * lock-step.
   */
  byTypeRejections: Record<
    string,
    {
      excluded_location: number;
      /** Phase 27.3.1 Plan 10 (G2) — per-type Turkey country-exclusion bucket. */
      excluded_turkey: number;
      not_notable: number;
      no_name: number;
      /** Phase 27.3.2 D-04 — per-type Latin-label rejection. Always 0 for desalination (D-03 exemption). */
      no_resolved_name: number;
      duplicate: number;
      low_score: number;
      no_city: number;
    }
  >;
  /**
   * Phase 27.3.1 R-08 D-28 — per-country admission counts keyed by nearest-
   * centroid country name. Two-level map: country → facilityType → count.
   * Only ADMITTED (post-dedup) facilities are tallied.
   */
  byCountry: Record<string, Record<string, number>>;
  /**
   * Phase 27.3.1 R-08 D-29 — Overpass fetch telemetry, one entry per URL
   * attempt. Empty array when data came from snapshot/redis.
   */
  overpass: OverpassFetchRecord[];
  /**
   * Phase 27.3.1 R-08 D-30 — provenance. Plan 05 populates 'snapshot';
   * 'overpass' populated by `fetchWaterFacilities`; 'redis' populated by
   * the route layer when serving a cached response.
   */
  source: WaterDataSource;
  /**
   * Phase 27.3.1 R-08 D-30 — ISO-8601 timestamp of when the underlying data
   * was produced. For 'overpass' source: time of fetch completion. For
   * 'snapshot' source: read from the snapshot's own `generatedAt`. For
   * 'redis' source: derived from the cache entry's `lastFresh`.
   */
  generatedAt: string;
  enrichment: { withCapacity: number; withCity: number; withRiver: number };
  scoreHistogram: { bucket: string; count: number }[];
}

// ---------- Normalization ----------

/**
 * Minimum holistic notability score required to admit a facility (0–100 scale,
 * see computeNotabilityScore).
 *
 * Phase 27.3.1 R-03 / D-08: DEMOTED TO SECONDARY GATE. The primary admission
 * logic is the D-06 compound gate in normalizeWaterElement:
 *   hasName(tags) AND (isNotable(tags) || isPriorityCountry(lat,lng) || hasCapacityData(tags))
 *
 * MIN_NOTABILITY_SCORE now runs AFTER the compound gate as a coarse floor.
 * Redundant on paper — any facility clearing the D-06 gate will also score
 * ≥15 (name alone contributes 15) — but retained so any future regression
 * surfaces as a `low_score` rejection rather than a silent admission.
 *
 * Phase 27.3 Round 3 history (superseded): dropped from 25 to 15 when
 * PRIORITY_COUNTRIES expanded to cover the full ME so priority bonus (+15)
 * alone would admit. Plan 02 now enforces the compound gate directly, so the
 * score floor is no longer the authoritative check.
 */
const MIN_NOTABILITY_SCORE = 15;

/**
 * Structured admission verdict. Callers inspect `verdict` and, on reject,
 * increment the rejection bucket named by `bucket`. On admit, callers use
 * the same tuple of inputs (score, facilityType, coords, tags) to build
 * the WaterFacility — no second classification pass.
 */
export type AdmissionVerdict =
  | { verdict: 'admit' }
  | { verdict: 'reject'; bucket: keyof WaterFilterStats['rejections'] };

/**
 * Per-facility admission decision — Phase 27.3.1 R-06 D-20 consolidation.
 *
 * Subsumes the previously-scattered rejection branches in normalizeWaterElement
 * into one ordered, short-circuiting decision function. The reject branches
 * below reproduce the exact semantics present after Plan 02 (R-03 admission
 * gate) + Plan 04 (R-02 2-of-3 compound + desalination exemption) + Plan 10
 * (G1 hasName tightening + G2 Turkey country-exclusion) landed.
 *
 * Decision order (first-match-wins, same as pre-refactor scattered branches):
 *   1. excluded_location — isExcludedLocation(coords)             [geographic]
 *   2. excluded_turkey   — nearestCountryName === 'Turkey'        [Plan 10 G2]
 *                          (only reachable if excluded_location missed — eastern
 *                          Turkey that escapes the 600km-from-Diyarbakir rule)
 *   3. no_name           — !hasName(tags)                         [R-03 D-05 / D-07]
 *                          (Plan 10 G1: hasName no longer shortcuts on
 *                          wikidata — must be a real name/name:en/operator)
 *   4. not_notable       — 2-of-3 compound gate fails             [R-02 Plan 04]
 *                          (exempted for desalination, Plan 04 Branch 2c)
 *   5. low_score         — score < MIN_NOTABILITY_SCORE           [R-03 D-08]
 *   6. no_city           — reservoir + no city + no wiki + not priority-named
 *                          [Plan 27.3-04 / Plan 27.3-05 scoping]
 *   7. admit
 *
 * `duplicate` bucket is NOT decided here — it is produced post-normalization
 * in fetchWaterFacilities during spatial dedup, so this helper never returns
 * { bucket: 'duplicate' }.
 *
 * Exported for Plan 03 / future observability tests to call directly without
 * going through the full normalizeWaterElement path.
 */
export function computeAdmissionDecision(
  tags: Record<string, string>,
  lat: number,
  lng: number,
  facilityType: WaterFacilityType,
  inPriority: boolean,
  score: number,
  nearestCity: ReturnType<typeof findNearestCity>,
): AdmissionVerdict {
  // 1. Geographic exclusion (western Turkey 600km-from-Diyarbakir rule,
  //    Central Asian non-ME states).
  if (isExcludedLocation(lat, lng)) {
    return { verdict: 'reject', bucket: 'excluded_location' };
  }

  // 2. Phase 27.3.1 Plan 10 G2 — Turkey country-exclusion bucket. Mirrors
  //    the sites adapter `excluded_turkey` bucket (overpass.ts). Only
  //    reachable for coordinates that slipped past the geographic rule
  //    above (i.e. eastern Turkey inside the 600km radius of Diyarbakir
  //    that the SE-Turkey conflict-zone carve-out was designed to keep).
  //    UAT showed 165 Turkey admits pre-Plan-10 — DevApiStatus now surfaces
  //    the rejection count explicitly rather than scattering across
  //    not_notable / no_name.
  if (nearestCountryName(lat, lng) === 'Turkey') {
    return { verdict: 'reject', bucket: 'excluded_turkey' };
  }

  // 3. R-03 D-05 / D-07: hasName is mandatory for ALL facility types,
  //    ALL countries (no priority-country bypass). Plan 10 G1 removed the
  //    wikidata shortcut — hasName requires real name/name:en/operator.
  if (!hasName(tags)) {
    return { verdict: 'reject', bucket: 'no_name' };
  }

  // 3b. Phase 27.3.2 D-01 / D-05: Latin-label admission check. Non-desal
  //     facilities must carry a Latin-script name in `name:en` / `name` /
  //     `operator`. Desalination exempt per D-03 (sparse OSM coverage —
  //     server synthesizes "Desalination Plant near {city}" or coord-based
  //     fallback label in extractLabel D-06, handled in Plan 05).
  //     D-02: linkedRiver is no longer an admission signal; remains as
  //     post-admission enrichment for the detail panel only.
  if (facilityType !== 'desalination' && !hasLatinLabel(tags)) {
    return { verdict: 'reject', bucket: 'no_resolved_name' };
  }

  // 4. R-02 Plan 04: compound 2-of-3 gate, EXEMPTED for desalination.
  //    (Desal OSM coverage in ME is sparse — name+type carries enough signal.)
  if (facilityType !== 'desalination') {
    const signalCount = [isNotable(tags), inPriority, hasCapacityData(tags)].filter(Boolean).length;
    if (signalCount < 2) {
      return { verdict: 'reject', bucket: 'not_notable' };
    }
  }

  // 5. R-03 D-08: MIN_NOTABILITY_SCORE secondary floor. Redundant in practice
  //    (low_score=0 in both R-02 refresh runs) but kept as defense-in-depth.
  if (score < MIN_NOTABILITY_SCORE) {
    return { verdict: 'reject', bucket: 'low_score' };
  }

  // 6. Plan 27.3-04 / Plan 27.3-05: reservoir no_city rule. Scoped to
  //    reservoirs only; exempts named-in-priority and wiki-backed entries.
  const hasWikiRef =
    !!tags.wikidata ||
    !!tags.wikipedia ||
    Object.keys(tags).some((k) => k.startsWith('wikipedia:'));
  const isNamedInPriorityCountry = inPriority && hasName(tags);
  if (facilityType === 'reservoir' && !nearestCity && !hasWikiRef && !isNamedInPriorityCountry) {
    return { verdict: 'reject', bucket: 'no_city' };
  }

  return { verdict: 'admit' };
}

/**
 * Normalize an Overpass element into a WaterFacility.
 * Applies holistic filtering (REV-1), reservoir wikidata fallback (REV-2),
 * and enrichment pipeline (D-06/D-07/D-08).
 *
 * Phase 27.3.1 R-06 D-20: admission logic consolidated into
 * `computeAdmissionDecision`. Control flow reads top-to-bottom:
 *   classify → coords → score → admission decision → (reject | build).
 *
 * Phase 27.3.1 R-08 D-31: takes an optional `byTypeBucket` that mirrors the
 * summed `rejections` counters per facility-type query. Both objects are
 * incremented in lock-step at every rejection site. The bucket is keyed by
 * the FACILITY_QUERIES label of the CALLING query (not the classified type
 * of the element) — so a reservoir-tagged "Hub Dam" reclassified to dam by
 * `classifyWaterType` still counts toward the reservoirs query bucket if it
 * came in via the reservoirs Overpass query.
 */
export function normalizeWaterElement(
  el: OverpassElement,
  stressLookup: (lat: number, lng: number) => WaterStressIndicators,
  rejections?: WaterFilterStats['rejections'],
  byTypeBucket?: WaterFilterStats['byTypeRejections'][string],
): WaterFacility | null {
  if (!el.tags) return null;
  const facilityType = classifyWaterType(el.tags);
  if (!facilityType) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const inPriority = isPriorityCountry(lat, lon);
  const score = computeNotabilityScore(el.tags, facilityType, inPriority);
  const nearestCity = findNearestCity(lat, lon);

  const decision = computeAdmissionDecision(
    el.tags,
    lat,
    lon,
    facilityType,
    inPriority,
    score,
    nearestCity,
  );
  if (decision.verdict === 'reject') {
    if (rejections) rejections[decision.bucket]++;
    if (byTypeBucket) byTypeBucket[decision.bucket]++;
    return null;
  }

  const capacity = extractCapacityTags(el.tags);
  const linkedRiver = linkRiver(lat, lon);

  return {
    id: `water-${el.id}`,
    type: 'water',
    facilityType,
    lat,
    lng: lon,
    label: extractLabel(el.tags, facilityType, lat, lon, nearestCity),
    operator:
      el.tags.operator && isLatin(el.tags.operator) ? toTitleCase(el.tags.operator) : undefined,
    osmId: el.id,
    stress: stressLookup(lat, lon),
    notabilityScore: score,
    ...(capacity && { capacity }),
    ...(nearestCity && { nearestCity }),
    ...(linkedRiver && { linkedRiver }),
  };
}

// ---------- Fetch Helpers ----------

/**
 * Fetch one facility type from Overpass, trying primary then fallback.
 *
 * Phase 27.3.1 R-08 D-29: records per-attempt telemetry into stats.overpass[]
 * (mirror label, HTTP status, duration, attempts so far, ok outcome) so
 * DevApiStatus can render Overpass health without a log dive.
 *
 * Phase 27.3.1 R-08 D-31: initializes a per-facility-type rejection bucket
 * in stats.byTypeRejections[entry.label] before the first network call so
 * the bucket exists in the response even when zero rejections fire. The
 * bucket is then passed to normalizeWaterElement for dual-write.
 *
 * Contract: fail-loud, serve-snapshot. No exponential backoff or circuit
 * breaker — Plan 05 (R-04) takes Overpass off the request path entirely
 * via a committed JSON snapshot, so retry sophistication here is overkill.
 */
async function fetchFacilityType(
  entry: { label: string; nwr: string },
  stats: WaterFilterStats,
): Promise<WaterFacility[]> {
  const query = buildQuery(entry.nwr);

  // Phase 27.3.1 R-08 D-31 / Plan 10 G2: per-type rejection bucket, seven
  // counters mirroring the summed `rejections` shape (Plan 10 added
  // excluded_turkey). Initialized to zeros so the bucket key exists in the
  // response even when every facility admits.
  const typeBucket = {
    excluded_location: 0,
    excluded_turkey: 0,
    not_notable: 0,
    no_name: 0,
    // Phase 27.3.2 D-04 — lock-step with WaterFilterStats.byTypeRejections inner shape.
    no_resolved_name: 0,
    duplicate: 0,
    low_score: 0,
    no_city: 0,
  };
  stats.byTypeRejections[entry.label] = typeBucket;

  let attempts = 0;
  const mirrors: [string, string][] = [
    ['primary', OVERPASS_URL],
    ['fallback', OVERPASS_FALLBACK],
  ];
  for (const [mirrorLabel, url] of mirrors) {
    attempts++;
    const start = Date.now();
    let statusCode = 0;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'iran-conflict-monitor/1.0 (contact: zackmaz.zam@gmail.com)',
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      statusCode = res.status;
      if (!res.ok) {
        log.warn(
          { facilityType: entry.label, url, status: res.status },
          'Overpass returned error status',
        );
        stats.overpass.push({
          facilityType: entry.label,
          mirror: mirrorLabel,
          status: statusCode,
          durationMs: Date.now() - start,
          attempts,
          ok: false,
        });
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };
      stats.rawCounts[entry.label] = (stats.rawCounts[entry.label] ?? 0) + json.elements.length;

      const facilities: WaterFacility[] = [];
      for (const el of json.elements) {
        const facility = normalizeWaterElement(el, assignBasinStress, stats.rejections, typeBucket);
        if (facility) facilities.push(facility);
      }
      stats.filteredCounts[entry.label] =
        (stats.filteredCounts[entry.label] ?? 0) + facilities.length;

      stats.overpass.push({
        facilityType: entry.label,
        mirror: mirrorLabel,
        status: statusCode,
        durationMs: Date.now() - start,
        attempts,
        ok: true,
      });

      log.info(
        { facilityType: entry.label, raw: json.elements.length, kept: facilities.length },
        'fetched facilities',
      );
      return facilities;
    } catch (err) {
      log.warn({ err, facilityType: entry.label, url }, 'Overpass request failed');
      stats.overpass.push({
        facilityType: entry.label,
        mirror: mirrorLabel,
        status: statusCode,
        durationMs: Date.now() - start,
        attempts,
        ok: false,
      });
    }
  }
  log.warn({ facilityType: entry.label }, 'all URLs failed, skipping');
  return [];
}

/**
 * Fetch water infrastructure facilities from Overpass API.
 * Returns facilities with enrichment fields and filter stats.
 * Uses bbox queries (one per facility type, sequential) instead of country-area unions.
 *
 * Failure contract (Phase 27.3.1 R-06 D-23) — fail loud, serve snapshot:
 *   Each facility-type query tries primary then fallback Overpass mirror
 *   (see fetchFacilityType). If a specific type fails on BOTH mirrors, that
 *   type contributes zero facilities but the function continues. If ALL three
 *   queries fail against both mirrors (succeeded=0), this throws.
 *
 *   No circuit breaker, no exponential backoff, no request-level retry
 *   beyond the two-mirror fallback. This is intentional: Phase 27.3.1 R-04
 *   (committed src/data/water-facilities.json snapshot) means a cold
 *   user request never reaches this function synchronously — the water
 *   route serves Redis → devFileCache → snapshot before trying Overpass,
 *   and only explicit refresh paths (`npm run refresh:water` or `?refresh=true`
 *   with the dev/cron gate) invoke this.
 *
 *   Both surviving call sites benefit from failing loud: the refresh
 *   script surfaces the error to the developer (who re-runs it); the
 *   ?refresh=true route leaves the pre-existing Redis entry intact when
 *   the caller catches and falls through to the stale read. Silent
 *   partial-success with exotic retry would mask upstream outages that
 *   R-04's snapshot architecture was designed to paper over.
 */
export async function fetchWaterFacilities(): Promise<{
  facilities: WaterFacility[];
  stats: WaterFilterStats;
}> {
  const stats: WaterFilterStats = {
    rawCounts: {},
    filteredCounts: {},
    rejections: {
      excluded_location: 0,
      // Phase 27.3.1 Plan 10 (G2) — new Turkey country-exclusion bucket.
      excluded_turkey: 0,
      not_notable: 0,
      no_name: 0,
      // Phase 27.3.2 D-04 — lock-step with WaterFilterStats.rejections shape.
      no_resolved_name: 0,
      duplicate: 0,
      low_score: 0,
      no_city: 0,
    },
    // Phase 27.3.1 R-08 D-31 — populated per-query inside fetchFacilityType.
    byTypeRejections: {},
    // Phase 27.3.1 R-08 D-28 — populated after dedup (see byCountry tally below).
    byCountry: {},
    // Phase 27.3.1 R-08 D-29 — populated per-attempt inside fetchFacilityType.
    overpass: [],
    // Phase 27.3.1 R-08 D-30 — provenance. The route layer overwrites this to
    // 'redis' when serving from cache; Plan 05 will set 'snapshot' from the
    // committed JSON tier.
    source: 'overpass',
    // Phase 27.3.1 R-08 D-30 — initial stamp; refreshed at fetch completion below.
    generatedAt: new Date().toISOString(),
    enrichment: { withCapacity: 0, withCity: 0, withRiver: 0 },
    scoreHistogram: [],
  };

  const all: WaterFacility[] = [];
  let succeeded = 0;

  // Run queries sequentially to avoid Overpass rate limiting.
  for (const entry of FACILITY_QUERIES) {
    try {
      const facilities = await fetchFacilityType(entry, stats);
      if (facilities.length > 0) {
        succeeded++;
        all.push(...facilities);
      }
    } catch (err) {
      log.warn({ facilityType: entry.label, err }, 'query failed, continuing');
    }
  }

  if (succeeded === 0) {
    throw new Error('All Overpass API instances failed for water facilities');
  }

  // Deduplicate by OSM ID
  const unique = new Map<string, WaterFacility>();
  for (const f of all) unique.set(f.id, f);

  // D-05: Spatial dedup (50m, same facilityType)
  const deduped: WaterFacility[] = [];
  for (const f of Array.from(unique.values())) {
    const isDupe = deduped.some(
      (existing) =>
        existing.facilityType === f.facilityType &&
        haversine(existing.lat, existing.lng, f.lat, f.lng) < 0.05,
    );
    if (!isDupe) deduped.push(f);
    else stats.rejections.duplicate++;
  }

  // Phase 27.3.1 R-08 D-28 — per-country admission counts keyed by nearest
  // centroid name. Tallied AFTER dedup so duplicates do not double-count.
  // Run in the same loop as enrichment to avoid a second pass over deduped.
  for (const f of deduped) {
    if (f.capacity) stats.enrichment.withCapacity++;
    if (f.nearestCity) stats.enrichment.withCity++;
    if (f.linkedRiver) stats.enrichment.withRiver++;

    const country = nearestCountryName(f.lat, f.lng);
    const entry = stats.byCountry[country] ?? {};
    entry[f.facilityType] = (entry[f.facilityType] ?? 0) + 1;
    stats.byCountry[country] = entry;
  }

  // Score histogram
  const buckets: [number, number][] = [
    [25, 40],
    [40, 55],
    [55, 70],
    [70, 85],
    [85, 101],
  ];
  stats.scoreHistogram = buckets.map(([lo, hi]) => ({
    bucket: `${lo}-${hi - 1}`,
    count: deduped.filter((f) => (f.notabilityScore ?? 0) >= lo && (f.notabilityScore ?? 0) < hi)
      .length,
  }));

  // Phase 27.3.1 R-08 D-30 — refresh generatedAt to reflect completion time
  // (not the start of the fetch). Aligns with "when the underlying data was
  // produced" in the docstring.
  stats.generatedAt = new Date().toISOString();

  log.info(
    { total: deduped.length, succeeded, totalQueries: FACILITY_QUERIES.length, stats },
    'water facilities fetch complete',
  );

  return { facilities: deduped, stats };
}
