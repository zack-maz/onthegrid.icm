import type { WaterFacility, WaterFacilityType, WaterStressIndicators } from '../types.js';
import { assignBasinStress } from '../lib/basinLookup.js';
import { log } from '../lib/logger.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.private.coffee/api/interpreter';
const TIMEOUT_MS = 120_000;

// Allowed countries (ISO 3166-1 alpha-2) -- same as overpass.ts
const ALLOWED_COUNTRIES = [
  'IR', 'IQ', 'SY', 'LB', 'IL', 'PS', 'JO',
  'SA', 'AE', 'OM', 'KW', 'BH', 'QA', 'YE',
  'TR', 'EG',
  'AF', 'PK',
  'AM', 'AZ', 'GE', 'TM',
  'DJ',
];

const areaUnion = ALLOWED_COUNTRIES.map(c => `area["ISO3166-1"="${c}"]`).join(';');

const QUERY = `
[out:json][timeout:120];
(${areaUnion};)->.searchArea;
(
  nwr["waterway"="dam"]["name"](area.searchArea);
  nwr["natural"="water"]["water"="reservoir"]["name"](area.searchArea);
  nwr["man_made"="water_works"]["name"](area.searchArea);
  nwr["waterway"="canal"]["name"]["canal"!~"irrigation_ditch"](area.searchArea);
  nwr["man_made"="desalination_plant"](area.searchArea);
  nwr["water_works"="desalination"](area.searchArea);
);
out center tags;
`;

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
  if (tags['man_made'] === 'water_works') return 'treatment_plant';
  // Canal requires a name to filter out unnamed irrigation channels
  if (tags['waterway'] === 'canal' && tags['name']) return 'canal';
  if (tags['man_made'] === 'desalination_plant') return 'desalination';
  if (tags['water_works'] === 'desalination') return 'desalination';
  return null;
}

const FACILITY_TYPE_LABELS: Record<WaterFacilityType, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  treatment_plant: 'Treatment Plant',
  canal: 'Canal',
  desalination: 'Desalination Plant',
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
 * Fetch water infrastructure facilities from Overpass API.
 * Each facility is enriched with WRI basin stress indicators via assignBasinStress.
 */
export async function fetchWaterFacilities(): Promise<WaterFacility[]> {
  for (const url of [OVERPASS_URL, OVERPASS_FALLBACK]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        log({ level: 'warn', message: `[overpass-water] ${url} returned ${res.status}` });
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };

      // Normalize and deduplicate by OSM ID
      const facilityMap = new Map<number, WaterFacility>();
      for (const el of json.elements) {
        const facility = normalizeWaterElement(el, assignBasinStress);
        if (facility) facilityMap.set(el.id, facility);
      }

      log({ level: 'info', message: `[overpass-water] Fetched ${facilityMap.size} water facilities` });
      return Array.from(facilityMap.values());
    } catch (err) {
      log({ level: 'warn', message: `[overpass-water] ${url} failed: ${(err as Error).message}` });
    }
  }
  throw new Error('All Overpass API instances failed for water facilities');
}
