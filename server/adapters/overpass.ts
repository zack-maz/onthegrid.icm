import type { SiteEntity, SiteType } from '../types.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.private.coffee/api/interpreter';
const TIMEOUT_MS = 60_000;

// Allowed countries (ISO 3166-1 alpha-2) — Middle East + Gulf + Caucasus + neighbors
// Excludes Europe, Russia, Kazakhstan, Kyrgyzstan, Tajikistan, Uzbekistan
// Africa limited to Egypt + Djibouti only
const ALLOWED_COUNTRIES = [
  'IR', 'IQ', 'SY', 'LB', 'IL', 'PS', 'JO', // Core conflict zone
  'SA', 'AE', 'OM', 'KW', 'BH', 'QA', 'YE', // Gulf states
  'TR', 'EG',                                  // Broader region (Africa: Egypt only)
  'AF', 'PK',                                  // South/Central Asia neighbors
  'AM', 'AZ', 'GE', 'TM',                     // Caucasus + Turkmenistan
  'DJ',                                         // Horn of Africa (Djibouti only)
];

// Turkey spatial filter — exclude north coast (Black Sea) and west coast (Aegean/Marmara)
// Only keep southeastern Turkey (conflict-relevant border region)
const TURKEY_BOUNDS = { minLat: 36, maxLat: 40, minLng: 35 };

// Build Overpass area union for country filtering
const areaUnion = ALLOWED_COUNTRIES.map(c => `area["ISO3166-1"="${c}"]`).join(';');

const QUERY = `
[out:json][timeout:60];
(${areaUnion};)->.searchArea;
(
  nwr["plant:source"="nuclear"](area.searchArea);
  nwr["generator:source"="nuclear"](area.searchArea);
  nwr["military"="naval_base"](area.searchArea);
  nwr["military"="base"]["military_service"="navy"](area.searchArea);
  nwr["industrial"="refinery"](area.searchArea);
  nwr["industrial"="oil_refinery"](area.searchArea);
  nwr["military"="airfield"](area.searchArea);
  nwr["aeroway"="aerodrome"]["aerodrome:type"="military"](area.searchArea);
  nwr["man_made"="desalination_plant"](area.searchArea);
  nwr["man_made"="water_works"]["name"~"[Dd]esal|تحلية"](area.searchArea);
  nwr["industrial"="port"](area.searchArea);
  nwr["harbour"="yes"](area.searchArea);
  nwr["landuse"="port"](area.searchArea);
);
out center tags;
`;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Title-case a string: capitalize first letter of each word, lowercase the rest */
function toTitleCase(str: string): string {
  return str
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(\w)(\w*)/g, (_m, first, rest) => first + rest);
}

/** Extract an English, title-cased label from OSM tags */
function extractLabel(tags: Record<string, string>, siteType: SiteType): string {
  // Prefer English name, then generic name
  const raw = tags['name:en'] || tags['name'] || '';
  if (raw) return toTitleCase(raw);
  // Fallback: use operator name if available
  if (tags.operator) return toTitleCase(tags.operator);
  // Last resort: generic label from type
  const typeLabels: Record<SiteType, string> = {
    nuclear: 'Nuclear Facility',
    naval: 'Naval Base',
    oil: 'Oil Refinery',
    airbase: 'Air Base',
    desalination: 'Desalination Plant',
    port: 'Port',
  };
  return typeLabels[siteType];
}

export function classifySiteType(tags: Record<string, string>): SiteType | null {
  if (tags['plant:source'] === 'nuclear' || tags['generator:source'] === 'nuclear') return 'nuclear';
  if (tags['military'] === 'naval_base' || tags['military_service'] === 'navy') return 'naval';
  if (tags['industrial'] === 'refinery' || tags['industrial'] === 'oil_refinery') return 'oil';
  if (tags['military'] === 'airfield' || tags['aerodrome:type'] === 'military') return 'airbase';
  if (tags['man_made'] === 'desalination_plant') return 'desalination';
  if (tags['man_made'] === 'water_works') {
    const name = (tags['name'] || tags['name:en'] || '').toLowerCase();
    if (name.includes('desal') || name.includes('تحلية')) return 'desalination';
  }
  if (tags['industrial'] === 'port' || tags['harbour'] === 'yes' || tags['landuse'] === 'port') return 'port';
  return null;
}

export function normalizeElement(el: OverpassElement): SiteEntity | null {
  if (!el.tags) return null;
  const siteType = classifySiteType(el.tags);
  if (!siteType) return null;

  // Nodes have lat/lon directly; ways/relations have center
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  return {
    id: `site-${el.id}`,
    type: 'site',
    siteType,
    lat,
    lng: lon,
    label: extractLabel(el.tags, siteType),
    operator: el.tags.operator ? toTitleCase(el.tags.operator) : undefined,
    wikidata: el.tags.wikidata || undefined,
    osmId: el.id,
  };
}

export async function fetchSites(): Promise<SiteEntity[]> {
  // Try primary, fallback to secondary
  for (const url of [OVERPASS_URL, OVERPASS_FALLBACK]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[overpass] ${url} returned ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };

      // Normalize and deduplicate by OSM ID
      const siteMap = new Map<number, SiteEntity>();
      for (const el of json.elements) {
        const site = normalizeElement(el);
        if (site) siteMap.set(el.id, site);
      }
      // Filter out Turkey sites on north/west coasts (keep only southeast)
      // Turkey bbox ~(36-42°N, 26-45°E) — keep only south of 40°N AND east of 35°E
      // Use lng < 44 guard to avoid filtering Armenia/Georgia/Azerbaijan
      return Array.from(siteMap.values()).filter(site => {
        const inTurkeyRegion =
          site.lat >= TURKEY_BOUNDS.minLat &&
          site.lat <= 43 &&
          site.lng >= 26 &&
          site.lng <= 44;
        if (inTurkeyRegion) {
          if (site.lat > TURKEY_BOUNDS.maxLat || site.lng < TURKEY_BOUNDS.minLng) {
            return false;
          }
        }
        return true;
      });
    } catch (err) {
      console.warn(`[overpass] ${url} failed:`, (err as Error).message);
    }
  }
  throw new Error('All Overpass API instances failed');
}
