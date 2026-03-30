import AdmZip from 'adm-zip';
import type { ConflictEventEntity } from '../types.js';
import { log } from '../lib/logger.js';
import { isGeoValid, detectCentroid } from '../lib/geoValidation.js';
import { computeEventConfidence, applyGoldsteinSanity, GOLDSTEIN_CEILINGS } from '../lib/eventScoring.js';
import { getConfig } from '../config.js';

// GDELT v2 lastupdate.txt endpoint (HTTP, NOT HTTPS -- TLS cert issues)
const GDELT_LASTUPDATE_URL =
  'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

// FIPS 10-4 codes for Greater Middle East (16 countries, same coverage as ACLED)
export const MIDDLE_EAST_FIPS = new Set([
  'IR', // Iran
  'IZ', // Iraq (FIPS, not ISO "IQ")
  'SY', // Syria
  'TU', // Turkey (FIPS, not ISO "TR")
  'SA', // Saudi Arabia
  'YM', // Yemen
  'MU', // Oman
  'AE', // United Arab Emirates
  'QA', // Qatar
  'BA', // Bahrain
  'KU', // Kuwait
  'JO', // Jordan
  'IS', // Israel (FIPS, not ISO "IL")
  'LE', // Lebanon
  'AF', // Afghanistan
  'PK', // Pakistan
]);

// CAMEO root codes for conflict events
export const CONFLICT_ROOT_CODES = new Set(['18', '19', '20']);

// GDELT v2 Events CSV columns (0-indexed for array access)
export const COL = {
  GLOBALEVENTID: 0,
  SQLDATE: 1,
  Actor1Name: 6,
  Actor1CountryCode: 7,
  Actor2Name: 16,
  Actor2CountryCode: 17,
  EventCode: 26,
  EventBaseCode: 27,
  EventRootCode: 28,
  GoldsteinScale: 30,
  NumMentions: 31,
  NumSources: 32,
  ActionGeo_FullName: 52,
  ActionGeo_CountryCode: 53,
  ActionGeo_Lat: 56,
  ActionGeo_Long: 57,
  SOURCEURL: 60,
} as const;

/**
 * Fetch lastupdate.txt and extract the export CSV ZIP URL.
 * Format: 3 lines, space-delimited: "size md5hash url"
 */
export async function getExportUrl(): Promise<string> {
  const res = await fetch(GDELT_LASTUPDATE_URL);
  if (!res.ok) {
    throw new Error(`GDELT lastupdate.txt failed: ${res.status}`);
  }
  const text = await res.text();
  const lines = text.trim().split('\n');
  const exportLine = lines.find((l) => l.includes('.export.CSV.zip'));
  if (!exportLine) {
    throw new Error('No export URL found in lastupdate.txt');
  }
  return exportLine.trim().split(' ')[2];
}

/**
 * Download a ZIP file and decompress the first entry to text.
 */
async function downloadAndUnzip(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GDELT export download failed: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  return entries[0].getData().toString('utf8');
}

import type { ConflictEventType } from '../types.js';

// All valid CAMEO base codes in the 180-204 range are mapped below.
// Codes 187-189, 197-199, 205+ do not exist in the CAMEO spec and correctly fall to ROOT_FALLBACK.
// CAMEO base codes excluded from the conflict pipeline entirely.
// 180 "unconventional violence NOS" is GDELT's catch-all for events it can't classify —
// cyber ops, political demands, campus protests. Overwhelmingly false positives on a kinetic map.
const EXCLUDED_BASE_CODES = new Set(['180', '192']);

const BASE_CODE_MAP: Record<string, ConflictEventType> = {
  '181': 'abduction',
  '182': 'assault',
  '183': 'bombing',
  '184': 'assault',
  '185': 'assassination',
  '186': 'assassination',
  '190': 'ground_combat',
  '191': 'blockade',
  '193': 'ground_combat',
  '194': 'shelling',
  '195': 'airstrike',
  '196': 'ceasefire_violation',
  '200': 'mass_violence',
  '201': 'mass_violence',
  '202': 'mass_violence',
  '203': 'mass_violence',
  '204': 'wmd',
};

const ROOT_FALLBACK: Record<string, ConflictEventType> = {
  '18': 'assault',
  '19': 'ground_combat',
  '20': 'mass_violence',
};

/**
 * Classify CAMEO base code to ConflictEventType.
 * Falls back by root code for unmapped base codes.
 */
export function classifyByBaseCode(
  eventBaseCode: string,
  eventRootCode: string,
): ConflictEventType {
  return BASE_CODE_MAP[eventBaseCode] ?? ROOT_FALLBACK[eventRootCode] ?? 'assault';
}

/**
 * Parse YYYYMMDD string to Unix ms timestamp.
 */
function parseSqlDate(sqlDate: string): number {
  const year = parseInt(sqlDate.slice(0, 4), 10);
  const month = parseInt(sqlDate.slice(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(sqlDate.slice(6, 8), 10);
  return Date.UTC(year, month, day);
}

const BASE_CODE_DESCRIPTIONS: Record<string, string> = {
  '180': 'Unconventional violence',
  '181': 'Abduction / hostage-taking',
  '182': 'Physical assault',
  '183': 'Bombing',
  '184': 'Use as human shield',
  '185': 'Assassination attempt',
  '186': 'Assassination',
  '190': 'Conventional military force',
  '191': 'Blockade / movement restriction',
  '193': 'Small arms / light weapons',
  '194': 'Artillery / tank support',
  '195': 'Aerial weapons',
  '196': 'Ceasefire violation',
  '200': 'Unconventional mass violence',
  '201': 'Mass expulsion',
  '202': 'Mass killings',
  '203': 'Ethnic cleansing',
  '204': 'Weapons of mass destruction',
};

/**
 * Return human-readable label for a CAMEO base code.
 */
function describeEvent(eventBaseCode: string): string {
  return BASE_CODE_DESCRIPTIONS[eventBaseCode] ?? 'Unknown conflict';
}

/**
 * Normalize a GDELT CSV row (as columns array) to ConflictEventEntity.
 */
export function normalizeGdeltEvent(
  cols: string[],
  lat: number,
  lng: number,
): ConflictEventEntity {
  const eventBaseCode = cols[COL.EventBaseCode];
  const eventRootCode = cols[COL.EventRootCode];
  const eventCode = cols[COL.EventCode];
  const sqlDate = cols[COL.SQLDATE];

  return {
    id: `gdelt-${cols[COL.GLOBALEVENTID]}`,
    type: classifyByBaseCode(eventBaseCode, eventRootCode),
    lat,
    lng,
    timestamp: parseSqlDate(sqlDate),
    label: `${cols[COL.ActionGeo_FullName]}: ${describeEvent(eventBaseCode)}`,
    data: {
      eventType: describeEvent(eventBaseCode),
      subEventType: `CAMEO ${eventCode}`,
      fatalities: 0, // GDELT does not track fatalities
      actor1: cols[COL.Actor1Name] || '',
      actor2: cols[COL.Actor2Name] || '',
      notes: '',
      source: cols[COL.SOURCEURL] ?? '',
      goldsteinScale: parseFloat(cols[COL.GoldsteinScale]) || 0,
      locationName: cols[COL.ActionGeo_FullName] || '',
      cameoCode: eventCode,
      numMentions: parseInt(cols[COL.NumMentions], 10) || undefined,
      numSources: parseInt(cols[COL.NumSources], 10) || undefined,
    },
  };
}

/**
 * Parse tab-delimited CSV text, filter to Middle East conflict events,
 * and normalize survivors to ConflictEventEntity[].
 *
 * Phase A: Raw row filtering (operates on string[] columns)
 * Phase B: Normalize, score, and threshold-filter (operates on entities)
 */
export function parseAndFilter(csv: string): ConflictEventEntity[] {
  const lines = csv.trim().split('\n');
  const rawCount = lines.length;

  // --- Phase A: Raw row filtering ---

  // Deduplicate by location + date + CAMEO code, keeping the row with the most mentions
  const best = new Map<string, { cols: string[]; lat: number; lng: number; mentions: number }>();
  let geoDiscardCount = 0;

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 61) continue;

    const eventRootCode = cols[COL.EventRootCode];
    const countryCode = cols[COL.ActionGeo_CountryCode];

    if (!CONFLICT_ROOT_CODES.has(eventRootCode)) continue;
    const eventBaseCode = cols[COL.EventBaseCode];
    if (EXCLUDED_BASE_CODES.has(eventBaseCode)) continue;
    if (!MIDDLE_EAST_FIPS.has(countryCode)) continue;

    // Geo cross-validation: discard events where FullName contradicts FIPS code
    const fullName = cols[COL.ActionGeo_FullName];
    if (!isGeoValid(fullName, countryCode)) {
      geoDiscardCount++;
      log({ level: 'warn', message: `[gdelt] discarded gdelt-${cols[COL.GLOBALEVENTID]}: FullName='${fullName}' contradicts FIPS=${countryCode}` });
      continue;
    }

    // Require at least 2 independent sources — single-source events are overwhelmingly
    // false positives (op-eds, niche sites). Real kinetic events get multi-source coverage fast.
    const numSources = parseInt(cols[COL.NumSources], 10) || 0;
    if (numSources < 2) continue;

    // Require at least one actor with a country code (filters non-state actors)
    const actor1Country = cols[COL.Actor1CountryCode]?.trim();
    const actor2Country = cols[COL.Actor2CountryCode]?.trim();
    if (!actor1Country && !actor2Country) continue;

    const lat = parseFloat(cols[COL.ActionGeo_Lat]);
    const lng = parseFloat(cols[COL.ActionGeo_Long]);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${cols[COL.SQLDATE]}|${cols[COL.EventCode]}|${lat}|${lng}`;
    const mentions = parseInt(cols[COL.NumMentions], 10) || 0;
    const existing = best.get(key);

    if (!existing || mentions > existing.mentions) {
      best.set(key, { cols, lat, lng, mentions });
    }
  }

  const geoValidCount = best.size;

  // --- Phase B: Normalize, score, and threshold-filter ---

  const { eventConfidenceThreshold } = getConfig();
  let reclassifyCount = 0;
  let thresholdDiscardCount = 0;
  const results: ConflictEventEntity[] = [];

  for (const entry of best.values()) {
    // Step 8: Normalize
    let entity = normalizeGdeltEvent(entry.cols, entry.lat, entry.lng);

    // Step 9: Goldstein sanity check
    const origType = entity.type;
    entity = applyGoldsteinSanity(entity);
    if (entity.type !== origType) {
      reclassifyCount++;
      const ceiling = GOLDSTEIN_CEILINGS[origType]?.ceiling;
      log({ level: 'info', message: `[gdelt] reclassified ${entity.id}: ${origType} -> ${entity.type} (Goldstein ${entity.data.goldsteinScale}, ceiling ${ceiling})` });
    }

    // Step 10: Centroid detection
    const geoPrecision = detectCentroid(entity.lat, entity.lng);
    entity = { ...entity, data: { ...entity.data, geoPrecision } };

    // Step 11: Confidence scoring
    const confidence = computeEventConfidence(entity, geoPrecision);
    entity = { ...entity, data: { ...entity.data, confidence } };

    // Step 12: Threshold filter
    if (confidence < eventConfidenceThreshold) {
      thresholdDiscardCount++;
      log({ level: 'warn', message: `[gdelt] discarded ${entity.id}: confidence ${confidence.toFixed(3)} below threshold ${eventConfidenceThreshold}` });
      continue;
    }

    results.push(entity);
  }

  // Pipeline summary
  log({ level: 'info', message: `[gdelt] pipeline: ${rawCount} raw -> ${geoValidCount} geo-valid -> ${reclassifyCount} reclassified -> ${geoValidCount - thresholdDiscardCount} above threshold -> ${results.length} final` });

  return results;
}

/**
 * Fetch the latest GDELT v2 events export, decompress, parse, filter,
 * and return normalized ConflictEventEntity[].
 */
export async function fetchEvents(): Promise<ConflictEventEntity[]> {
  const start = Date.now();

  const exportUrl = await getExportUrl();
  const csv = await downloadAndUnzip(exportUrl);
  const events = parseAndFilter(csv);

  log({ level: 'info', message: `[gdelt] fetched ${events.length} events in ${Date.now() - start}ms` });
  return events;
}

/**
 * Generate GDELT v2 export URLs for a date range, sampling 4 times per day
 * (00:00, 06:00, 12:00, 18:00 UTC). Constructs URLs directly from the
 * predictable filename pattern — no master file list download needed.
 */
function generateBackfillUrls(fromTs: number, toTs: number): string[] {
  const urls: string[] = [];
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const start = new Date(fromTs);
  start.setUTCHours(0, 0, 0, 0);
  let cursor = start.getTime();

  while (cursor <= toTs) {
    const d = new Date(cursor);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    urls.push(
      `http://data.gdeltproject.org/gdeltv2/${yyyy}${mm}${dd}${hh}0000.export.CSV.zip`,
    );
    cursor += SIX_HOURS;
  }

  return urls;
}

/**
 * Fetch GDELT v2 events for the past `days` days by downloading export files
 * sampled every 6 hours. Uses direct URL construction (no master file list)
 * and batched concurrent downloads for speed.
 */
export async function backfillEvents(days: number): Promise<ConflictEventEntity[]> {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  const start = Date.now();

  const urls = generateBackfillUrls(fromTs, toTs);
  log({ level: 'info', message: `[gdelt] backfill: ${urls.length} files for ${days} days (4/day sampling)` });

  const merged = new Map<string, ConflictEventEntity>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const csv = await downloadAndUnzip(url);
        return parseAndFilter(csv);
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const e of result.value) {
          if (!merged.has(e.id)) {
            merged.set(e.id, e);
          }
        }
      }
      // Silently skip failed downloads (404s, timeouts)
    }
  }

  const events = Array.from(merged.values());
  log({ level: 'info', message: `[gdelt] backfill: loaded ${events.length} events from ${urls.length} files in ${Date.now() - start}ms` });
  return events;
}
