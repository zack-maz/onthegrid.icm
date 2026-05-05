import { logger } from '../lib/logger.js';

import { nearestCountryName } from './overpass-water.js';

import type { SiteEntity, SiteType } from '../types.js';
import type { OverpassFetchRecord, WaterDataSource } from './overpass-water.js';

const log = logger.child({ module: 'overpass' });

/**
 * Phase 27.3.1 R-05 — site-side mirror of `WaterFilterStats`. Same observability
 * contract as water (D-28 per-country, D-29 Overpass telemetry, D-30 provenance)
 * so the Plan 08 DevApiStatus Sites panel can reuse the water-panel treatment.
 *
 * Rejection buckets are the four that can fire inside `fetchSites`:
 *   - excluded_turkey : TURKEY_BOUNDS spatial filter (non-SE Turkey rejected)
 *   - no_coords       : element missing lat/lng AND center
 *   - no_type         : classifySiteType returned null (tag set doesn't match any SiteType)
 *   - duplicate       : OSM id already seen in this pass (dedup)
 *
 * OverpassFetchRecord / WaterDataSource reused from overpass-water — same
 * Overpass API contract, no need to re-declare.
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
  source: WaterDataSource;
  generatedAt: string;
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_FALLBACK = 'https://overpass.private.coffee/api/interpreter';
const TIMEOUT_MS = 60_000;

// Allowed countries (ISO 3166-1 alpha-2) — Middle East + Gulf + Caucasus + neighbors
// Excludes Europe, Russia, Kazakhstan, Kyrgyzstan, Tajikistan, Uzbekistan
// Africa limited to Egypt + Djibouti only
const ALLOWED_COUNTRIES = [
  'IR',
  'IQ',
  'SY',
  'LB',
  'IL',
  'PS',
  'JO', // Core conflict zone
  'SA',
  'AE',
  'OM',
  'KW',
  'BH',
  'QA',
  'YE', // Gulf states
  'TR',
  'EG', // Broader region (Africa: Egypt only)
  'AF',
  'PK', // South/Central Asia neighbors
  'AM',
  'AZ',
  'GE',
  'TM', // Caucasus + Turkmenistan
  'DJ', // Horn of Africa (Djibouti only)
];

// Turkey spatial filter — exclude north coast (Black Sea) and west coast (Aegean/Marmara)
// Only keep southeastern Turkey (conflict-relevant border region)
const TURKEY_BOUNDS = { minLat: 36, maxLat: 40, minLng: 35 };

// Build Overpass area union for country filtering
const areaUnion = ALLOWED_COUNTRIES.map((c) => `area["ISO3166-1"="${c}"]`).join(';');

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

/** True if string contains only Latin script characters (plus digits, punctuation, spaces) */
function isLatin(str: string): boolean {
  return /^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u.test(str);
}

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  nuclear: 'Nuclear Facility',
  naval: 'Naval Base',
  oil: 'Oil Refinery',
  airbase: 'Air Base',
  port: 'Port',
};

/** Extract an English, title-cased label from OSM tags */
function extractLabel(tags: Record<string, string>, siteType: SiteType): string {
  // Prefer English name (verify it's actually Latin script)
  const en = tags['name:en'];
  if (en && en.trim() && isLatin(en)) return toTitleCase(en);
  // Accept generic name only if it's Latin script
  const raw = tags['name'] || '';
  if (raw && isLatin(raw)) return toTitleCase(raw);
  // Fallback: use operator name if Latin
  if (tags.operator && isLatin(tags.operator)) return toTitleCase(tags.operator);
  // Last resort: generic label from type
  return SITE_TYPE_LABELS[siteType];
}

export function classifySiteType(tags: Record<string, string>): SiteType | null {
  if (tags['plant:source'] === 'nuclear' || tags['generator:source'] === 'nuclear')
    return 'nuclear';
  if (tags['military'] === 'naval_base' || tags['military_service'] === 'navy') return 'naval';
  if (tags['industrial'] === 'refinery' || tags['industrial'] === 'oil_refinery') return 'oil';
  if (tags['military'] === 'airfield' || tags['aerodrome:type'] === 'military') return 'airbase';
  if (tags['industrial'] === 'port' || tags['harbour'] === 'yes' || tags['landuse'] === 'port')
    return 'port';
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
    operator:
      el.tags.operator && isLatin(el.tags.operator) ? toTitleCase(el.tags.operator) : undefined,
    wikidata: el.tags.wikidata || undefined,
    osmId: el.id,
  };
}

/**
 * Phase 27.3.1 R-05 — fetch infrastructure sites from Overpass with full filter-stats
 * telemetry (mirrors `fetchWaterFacilities` post-R-08).
 *
 * Returns `{ sites, stats }` so the route layer can attach observability fields to
 * the response envelope. The rejection tally + byCountry / byType / overpass arrays
 * are the data layer Plan 08's DevApiStatus Sites panel reads from `siteStore.filterStats`.
 *
 * Fail-loud / serve-snapshot contract (R-07 parity with water):
 *   This throws `Error('All Overpass API instances failed')` when both mirrors fail.
 *   The route layer converts that into a 502 only if there's NO snapshot + NO Redis
 *   fallback — in the snapshot-tier world the snapshot serves cold starts and this
 *   path is only reachable on `?refresh=true`.
 */
export async function fetchSites(): Promise<{ sites: SiteEntity[]; stats: SiteFilterStats }> {
  const stats: SiteFilterStats = {
    rawCount: 0,
    filteredCount: 0,
    rejections: { excluded_turkey: 0, no_coords: 0, no_type: 0, duplicate: 0 },
    byCountry: {},
    byType: {},
    overpass: [],
    source: 'overpass',
    generatedAt: new Date().toISOString(),
  };

  const mirrors: Array<['primary' | 'fallback', string]> = [
    ['primary', OVERPASS_URL],
    ['fallback', OVERPASS_FALLBACK],
  ];

  let attempts = 0;
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
        body: `data=${encodeURIComponent(QUERY)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      statusCode = res.status;
      if (!res.ok) {
        log.warn({ url, status: res.status }, 'Overpass returned error status');
        stats.overpass.push({
          facilityType: 'sites',
          mirror: mirrorLabel,
          status: statusCode,
          durationMs: Date.now() - start,
          attempts,
          ok: false,
        });
        continue;
      }

      const json = (await res.json()) as { elements: OverpassElement[] };
      stats.rawCount = json.elements.length;

      // --- First pass: classify, dedupe, record structural rejections ---
      const siteMap = new Map<number, SiteEntity>();
      for (const el of json.elements) {
        if (!el.tags) {
          // Overpass rarely returns tag-less elements, but defensively bucket as no_type
          stats.rejections.no_type++;
          continue;
        }
        const siteType = classifySiteType(el.tags);
        if (!siteType) {
          stats.rejections.no_type++;
          continue;
        }
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) {
          stats.rejections.no_coords++;
          continue;
        }
        if (siteMap.has(el.id)) {
          stats.rejections.duplicate++;
          continue;
        }
        const site = normalizeElement(el);
        if (!site) {
          // Should not happen given the guards above; defensive no_type bucket.
          stats.rejections.no_type++;
          continue;
        }
        siteMap.set(el.id, site);
      }

      // --- Second pass: Turkey spatial filter + byCountry / byType tally ---
      const kept: SiteEntity[] = [];
      for (const site of siteMap.values()) {
        // Turkey bbox ~(36-42°N, 26-45°E) — keep only south of 40°N AND east of 35°E
        const inTurkeyRegion =
          site.lat >= TURKEY_BOUNDS.minLat && site.lat <= 43 && site.lng >= 26 && site.lng <= 44;
        if (inTurkeyRegion) {
          if (site.lat > TURKEY_BOUNDS.maxLat || site.lng < TURKEY_BOUNDS.minLng) {
            stats.rejections.excluded_turkey++;
            continue;
          }
        }
        kept.push(site);
        const country = nearestCountryName(site.lat, site.lng);
        const countryEntry = stats.byCountry[country] ?? {};
        countryEntry[site.siteType] = (countryEntry[site.siteType] ?? 0) + 1;
        stats.byCountry[country] = countryEntry;
        stats.byType[site.siteType] = (stats.byType[site.siteType] ?? 0) + 1;
      }

      stats.filteredCount = kept.length;
      stats.overpass.push({
        facilityType: 'sites',
        mirror: mirrorLabel,
        status: statusCode,
        durationMs: Date.now() - start,
        attempts,
        ok: true,
      });
      stats.generatedAt = new Date().toISOString();
      return { sites: kept, stats };
    } catch (err) {
      log.warn({ err, url }, 'Overpass request failed');
      stats.overpass.push({
        facilityType: 'sites',
        mirror: mirrorLabel,
        status: statusCode,
        durationMs: Date.now() - start,
        attempts,
        ok: false,
      });
    }
  }

  throw new Error('All Overpass API instances failed');
}
