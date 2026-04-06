import type { WaterFacility, WaterFacilityType, WaterStressIndicators } from '../types.js';
import { assignBasinStress } from '../lib/basinLookup.js';
import { log } from '../lib/logger.js';

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

/** Countries where all facility types are kept (conflict zones with strategic water infrastructure) */
const PRIORITY_COUNTRIES = new Set([
  'Israel', 'Jordan', 'Lebanon', 'Syria', 'Iraq', 'Iran', 'Afghanistan',
]);

/**
 * Returns true if coordinates fall within a priority country (conflict zone).
 * Priority countries keep all facility types; non-priority apply notability filters.
 */
export function isPriorityCountry(lat: number, lng: number): boolean {
  let minDist = Infinity;
  let nearest = '';
  for (const [name, clat, clng] of COUNTRY_CENTROIDS_FULL) {
    const d = haversine(lat, lng, clat, clng);
    if (d < minDist) { minDist = d; nearest = name; }
  }
  return PRIORITY_COUNTRIES.has(nearest);
}

/**
 * Returns true if OSM tags indicate a notable facility (has wikidata or wikipedia reference).
 * Used to filter non-priority country dams/reservoirs to only significant facilities.
 */
export function isNotable(tags: Record<string, string>): boolean {
  if (tags.wikidata) return true;
  if (tags.wikipedia) return true;
  if (Object.keys(tags).some(k => k.startsWith('wikipedia:'))) return true;
  return false;
}

/** Countries to fully exclude */
const EXCLUDED_COUNTRIES = new Set(['Uzbekistan', 'Tajikistan', 'Kyrgyzstan', 'Kazakhstan']);

/** Haversine distance in km (lightweight, no import needed) */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
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

  // Check if nearest centroid is an excluded country (using full centroid set for accuracy)
  let minDist = Infinity;
  let nearest = '';
  for (const [name, clat, clng] of COUNTRY_CENTROIDS_FULL) {
    const d = haversine(lat, lng, clat, clng);
    if (d < minDist) { minDist = d; nearest = name; }
  }
  if (EXCLUDED_COUNTRIES.has(nearest)) return true;

  return false;
}

/**
 * Split into separate queries per facility type to keep each request light.
 * Dams, reservoirs, desalination, and treatment plants (man_made=water_works).
 * Treatment plants only kept in priority countries; non-priority dams/reservoirs require notability.
 */
const FACILITY_QUERIES: { label: string; nwr: string }[] = [
  { label: 'dams', nwr: 'nwr["waterway"="dam"]["name"]' },
  { label: 'reservoirs', nwr: '(way["natural"="water"]["water"="reservoir"]["name"];relation["natural"="water"]["water"="reservoir"]["name"];)' },
  { label: 'desalination', nwr: '(nwr["man_made"="desalination_plant"];nwr["water_works"="desalination"];)' },
  { label: 'treatment_plants', nwr: 'nwr["man_made"="water_works"]["name"]' },
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
 * Classify OSM tags into a WaterFacilityType.
 * Returns null if tags don't match any water infrastructure.
 */
export function classifyWaterType(tags: Record<string, string>): WaterFacilityType | null {
  if (tags['waterway'] === 'dam') return 'dam';
  if (tags['natural'] === 'water' && tags['water'] === 'reservoir') return 'reservoir';
  if (tags['man_made'] === 'desalination_plant') return 'desalination';
  if (tags['water_works'] === 'desalination') return 'desalination';
  if (tags['man_made'] === 'water_works') return 'treatment_plant';
  return null;
}

const FACILITY_TYPE_LABELS: Record<WaterFacilityType, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination Plant',
  treatment_plant: 'Treatment Plant',
};

/** Extract an English label from OSM tags */
function extractLabel(tags: Record<string, string>, facilityType: WaterFacilityType): string {
  const en = tags['name:en'];
  if (en && en.trim() && isLatin(en)) return toTitleCase(en);
  const raw = tags['name'] || '';
  if (raw && isLatin(raw)) return toTitleCase(raw);
  if (tags.operator && isLatin(tags.operator)) return toTitleCase(tags.operator);
  return FACILITY_TYPE_LABELS[facilityType];
}

/**
 * Normalize an Overpass element into a WaterFacility.
 * Requires a stress lookup function to assign basin stress indicators.
 */
export function normalizeWaterElement(
  el: OverpassElement,
  stressLookup: (lat: number, lng: number) => WaterStressIndicators,
): WaterFacility | null {
  if (!el.tags) return null;
  const facilityType = classifyWaterType(el.tags);
  if (!facilityType) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  // Geographic exclusion: western Turkey, Uzbekistan, Tajikistan, etc.
  if (isExcludedLocation(lat, lon)) return null;

  // Tiered country filtering: priority countries keep all, non-priority apply notability checks
  if (!isPriorityCountry(lat, lon)) {
    if (facilityType === 'treatment_plant') return null; // Always excluded in non-priority
    if ((facilityType === 'dam' || facilityType === 'reservoir') && !isNotable(el.tags)) return null;
    // desalination always passes through
  }

  return {
    id: `water-${el.id}`,
    type: 'water',
    facilityType,
    lat,
    lng: lon,
    label: extractLabel(el.tags, facilityType),
    operator: el.tags.operator && isLatin(el.tags.operator) ? toTitleCase(el.tags.operator) : undefined,
    osmId: el.id,
    stress: stressLookup(lat, lon),
  };
}

/**
 * Fetch one facility type from Overpass, trying primary then fallback.
 */
async function fetchFacilityType(
  entry: { label: string; nwr: string },
): Promise<WaterFacility[]> {
  const query = buildQuery(entry.nwr);
  for (const url of [OVERPASS_URL, OVERPASS_FALLBACK]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        log({ level: 'warn', message: `[overpass-water] ${entry.label} ${url} returned ${res.status}` });
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };

      const facilities: WaterFacility[] = [];
      for (const el of json.elements) {
        const facility = normalizeWaterElement(el, assignBasinStress);
        if (facility) facilities.push(facility);
      }

      log({ level: 'info', message: `[overpass-water] ${entry.label}: ${facilities.length} facilities` });
      return facilities;
    } catch (err) {
      log({ level: 'warn', message: `[overpass-water] ${entry.label} ${url} failed: ${(err as Error).message}` });
    }
  }
  log({ level: 'warn', message: `[overpass-water] ${entry.label}: all URLs failed, skipping` });
  return [];
}

/**
 * Fetch water infrastructure facilities from Overpass API.
 * Uses bbox queries (one per facility type, sequential) instead of country-area unions.
 * Each facility is enriched with WRI basin stress indicators via assignBasinStress.
 */
export async function fetchWaterFacilities(): Promise<WaterFacility[]> {
  // Run all facility type queries in parallel for faster cold starts
  const results = await Promise.allSettled(
    FACILITY_QUERIES.map((entry) => fetchFacilityType(entry)),
  );

  const all: WaterFacility[] = [];
  let succeeded = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      succeeded++;
      all.push(...result.value);
    } else if (result.status === 'rejected') {
      log({ level: 'warn', message: `[overpass-water] ${FACILITY_QUERIES[i].label} rejected: ${result.reason}` });
    }
  }

  if (succeeded === 0) {
    throw new Error('All Overpass API instances failed for water facilities');
  }

  // Deduplicate by OSM ID
  const unique = new Map<string, WaterFacility>();
  for (const f of all) unique.set(f.id, f);

  log({ level: 'info', message: `[overpass-water] Total: ${unique.size} facilities from ${succeeded}/${FACILITY_QUERIES.length} queries` });
  return Array.from(unique.values());
}
