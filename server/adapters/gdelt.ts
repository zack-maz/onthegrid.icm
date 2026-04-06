import AdmZip from 'adm-zip';
import type { ConflictEventEntity, ConflictEventType } from '../types.js';
import { log } from '../lib/logger.js';
import { isGeoValid, detectCentroid } from '../lib/geoValidation.js';
import { haversineKm } from '../../src/lib/geo.js';
import { computeEventConfidence, applyGoldsteinSanity, GOLDSTEIN_CEILINGS, checkBellingcatCorroboration, getCameoSpecificity } from '../lib/eventScoring.js';
import type { BellingcatArticle } from '../lib/eventScoring.js';
import { getConfig } from '../config.js';
import { buildAuditRecord } from '../lib/eventAudit.js';
import type { AuditRecord, PipelineTrace, PhaseAChecks, PhaseCChecks, ConfidenceSubScores } from '../lib/eventAudit.js';
import { validateEventGeo } from '../lib/nlpGeoValidator.js';
import { extractActorsAndPlaces, lookupCityCoords } from '../lib/nlpExtractor.js';
import { batchFetchTitles } from '../lib/titleFetcher.js';

/** Clean GDELT location strings: strip replacement chars, fix orphaned punctuation */
function sanitizeLocation(raw: string): string {
  return raw
    .replace(/\uFFFD/g, '')       // Unicode replacement character
    .replace(/\?(?=[a-z])/gi, '') // Literal ? before a letter (encoding artifact)
    .replace(/\s+/g, ' ')
    .trim();
}

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
  'WE', // West Bank
  'GZ', // Gaza Strip
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
  ActionGeo_Type: 51,
  ActionGeo_FullName: 52,
  ActionGeo_CountryCode: 53,
  ActionGeo_ADM1Code: 54,
  ActionGeo_ADM2Code: 55,
  ActionGeo_Lat: 56,
  ActionGeo_Long: 57,
  ActionGeo_FeatureID: 58,
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

// All valid CAMEO base codes in the 180-204 range are mapped below.
// Codes 187-189, 197-199, 205+ do not exist in the CAMEO spec and correctly fall to ROOT_FALLBACK.
// CAMEO base codes excluded from the conflict pipeline entirely.
// 180 "unconventional violence NOS" — GDELT's catch-all (cyber ops, protests, false positives)
// 182 "physical assault" — very broad, non-kinetic
// 190 "conventional military force NOS" — vague catch-all
// 192 — non-conflict
const EXCLUDED_BASE_CODES = new Set(['180', '182', '190', '192']);

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
  const actionGeoType = parseInt(cols[COL.ActionGeo_Type], 10) || undefined;

  return {
    id: `gdelt-${cols[COL.GLOBALEVENTID]}`,
    type: classifyByBaseCode(eventBaseCode, eventRootCode),
    lat,
    lng,
    timestamp: parseSqlDate(sqlDate),
    label: `${sanitizeLocation(cols[COL.ActionGeo_FullName])}: ${describeEvent(eventBaseCode)}`,
    data: {
      eventType: describeEvent(eventBaseCode),
      subEventType: `CAMEO ${eventCode}`,
      fatalities: 0, // GDELT does not track fatalities
      actor1: cols[COL.Actor1Name] || '',
      actor2: cols[COL.Actor2Name] || '',
      notes: '',
      source: cols[COL.SOURCEURL] ?? '',
      goldsteinScale: parseFloat(cols[COL.GoldsteinScale]) || 0,
      locationName: sanitizeLocation(cols[COL.ActionGeo_FullName] || ''),
      cameoCode: eventCode,
      numMentions: parseInt(cols[COL.NumMentions], 10) || undefined,
      numSources: parseInt(cols[COL.NumSources], 10) || undefined,
      actionGeoType,
    },
  };
}

/**
 * Parse tab-delimited CSV text, filter to Middle East conflict events,
 * and normalize survivors to ConflictEventEntity[].
 *
 * Phase A: Raw row filtering (operates on string[] columns)
 * Phase B: Normalize, score, and centroid detection (operates on entities)
 * Phase C: NLP geo cross-validation (async -- fetches article titles)
 */
export async function parseAndFilter(csv: string, bellingcatArticles?: BellingcatArticle[], options?: { skipTitleFetch?: boolean }): Promise<ConflictEventEntity[]> {
  const lines = csv.trim().split('\n');
  const rawCount = lines.length;
  const config = getConfig();
  const excludedCameo = new Set(config.eventExcludedCameo);

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
    if (excludedCameo.has(eventBaseCode)) continue;
    if (!MIDDLE_EAST_FIPS.has(countryCode)) continue;

    // Geo cross-validation: discard events where FullName contradicts FIPS code
    const fullName = cols[COL.ActionGeo_FullName];
    if (!isGeoValid(fullName, countryCode)) {
      geoDiscardCount++;
      log({ level: 'warn', message: `[gdelt] discarded gdelt-${cols[COL.GLOBALEVENTID]}: FullName='${fullName}' contradicts FIPS=${countryCode}` });
      continue;
    }

    // Require at least N independent sources — single-source events are overwhelmingly
    // false positives (op-eds, niche sites). Real kinetic events get multi-source coverage fast.
    const numSources = parseInt(cols[COL.NumSources], 10) || 0;
    if (numSources < config.eventMinSources) continue;

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

  // --- Phase B: Normalize, score (pre-threshold) ---

  const { eventConfidenceThreshold, eventCentroidPenalty } = config;
  let reclassifyCount = 0;
  let thresholdDiscardCount = 0;
  let nlpRejectCount = 0;

  // Build intermediate entities with their raw cols for Phase C
  const intermediates: Array<{
    entity: ConflictEventEntity;
    cols: string[];
    geoPrecision: 'precise' | 'centroid';
    confidence: number;
  }> = [];

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
    let confidence = computeEventConfidence(entity, geoPrecision);

    // Apply centroid penalty for city-center (type 3) and landmark (type 4) geocodes
    const actionGeoType = entity.data.actionGeoType;
    if (actionGeoType === 3 || actionGeoType === 4) {
      confidence *= eventCentroidPenalty;
    }

    intermediates.push({ entity, cols: entry.cols, geoPrecision, confidence });
  }

  // --- Phase C: NLP geo cross-validation ---
  // Batch fetch titles for all candidate events, then validate

  const urlsToFetch: string[] = [];
  for (const item of intermediates) {
    const url = item.cols[COL.SOURCEURL];
    if (url) urlsToFetch.push(url);
  }

  const titleMap = options?.skipTitleFetch
    ? new Map<string, string | null>()
    : await batchFetchTitles(urlsToFetch);
  if (!options?.skipTitleFetch) {
    log({ level: 'info', message: `[gdelt] Phase C: fetched ${titleMap.size} titles for ${urlsToFetch.length} URLs (${[...titleMap.values()].filter(t => t !== null).length} non-null)` });
  }

  const results: ConflictEventEntity[] = [];

  for (const item of intermediates) {
    let { entity, confidence, cols } = item;
    const url = cols[COL.SOURCEURL] || '';
    const title = titleMap.get(url) ?? null;

    // NLP cross-validation
    const nlpResult = validateEventGeo({
      title,
      actorCountryCodes: {
        actor1: cols[COL.Actor1CountryCode]?.trim() || '',
        actor2: cols[COL.Actor2CountryCode]?.trim() || '',
      },
      geoCountryCode: cols[COL.ActionGeo_CountryCode],
      actionGeoType: entity.data.actionGeoType,
      lat: entity.lat,
      lng: entity.lng,
    });

    switch (nlpResult.status) {
      case 'verified':
        // Full confidence retained
        break;

      case 'mismatch':
        nlpRejectCount++;
        log({ level: 'warn', message: `[gdelt] NLP rejected ${entity.id}: ${nlpResult.reason}` });
        continue; // Skip this event entirely

      case 'relocated': {
        // Update coordinates and remove centroid penalty
        entity = {
          ...entity,
          lat: nlpResult.newLat,
          lng: nlpResult.newLng,
          data: {
            ...entity.data,
            geoPrecision: 'precise' as const,
          },
        };
        // Restore confidence by undoing centroid penalty if it was applied
        const actionGeoType = entity.data.actionGeoType;
        if ((actionGeoType === 3 || actionGeoType === 4) && eventCentroidPenalty > 0) {
          confidence = confidence / eventCentroidPenalty;
        }
        log({ level: 'info', message: `[gdelt] NLP relocated ${entity.id} to ${nlpResult.cityName} (${nlpResult.newLat.toFixed(4)}, ${nlpResult.newLng.toFixed(4)})` });
        break;
      }

      case 'penalized':
        confidence *= nlpResult.confidenceMultiplier;
        break;

      case 'skipped':
        // Title fetch failure -> 0.7x penalty
        if (nlpResult.reason === 'title_fetch_failed') {
          confidence *= 0.7;
        }
        // Other skip reasons: no penalty
        break;
    }

    // Coordinate-label sanity check: if GDELT's locationName contains a known city
    // but coords are >200km away, relocate to the named city. This catches GDELT bugs
    // like "Baghdad" at Tehran's coordinates, even when title fetch fails.
    if (nlpResult.status === 'skipped' || nlpResult.status === 'verified') {
      const locName = entity.data.locationName || '';
      const firstPart = locName.split(',')[0].trim();
      if (firstPart) {
        const cityCoords = lookupCityCoords(firstPart, entity.lat, entity.lng);
        if (cityCoords) {
          const dist = haversineKm(entity.lat, entity.lng, cityCoords.lat, cityCoords.lng);
          if (dist > 200) {
            log({ level: 'info', message: `[gdelt] label-coord fix: ${entity.id} "${firstPart}" coords ${dist.toFixed(0)}km away, relocating to ${cityCoords.lat.toFixed(4)},${cityCoords.lng.toFixed(4)}` });
            entity = { ...entity, lat: cityCoords.lat, lng: cityCoords.lng };
          }
        }
      }
    }

    // Update entity with final confidence
    entity = { ...entity, data: { ...entity.data, confidence } };

    // Step 12: Threshold filter (AFTER Phase C adjustments)
    if (confidence < eventConfidenceThreshold) {
      thresholdDiscardCount++;
      log({ level: 'warn', message: `[gdelt] discarded ${entity.id}: confidence ${confidence.toFixed(3)} below threshold ${eventConfidenceThreshold}` });
      continue;
    }

    // Step 13: Bellingcat corroboration boost (opportunistic)
    if (bellingcatArticles && bellingcatArticles.length > 0) {
      const corroboration = checkBellingcatCorroboration(entity, bellingcatArticles);
      if (corroboration.matched) {
        confidence = Math.min(1.0, confidence + config.bellingcatCorroborationBoost);
        entity = { ...entity, data: { ...entity.data, confidence } };
        log({ level: 'info', message: `[gdelt] Bellingcat corroboration boost for ${entity.id}: +${config.bellingcatCorroborationBoost} -> ${confidence.toFixed(3)} (article: ${corroboration.article.url})` });
      }
    }

    results.push(entity);
  }

  // Pipeline summary
  log({ level: 'info', message: `[gdelt] pipeline: ${rawCount} raw -> ${geoValidCount} geo-valid -> ${reclassifyCount} reclassified -> ${nlpRejectCount} NLP rejected -> ${geoValidCount - thresholdDiscardCount - nlpRejectCount} above threshold -> ${results.length} final` });

  // Dispersion is applied downstream in the events route (after all merging)
  // so that the full merged event set gets single-pass slot assignment.
  return results;
}

/**
 * Extract named raw GDELT columns from a CSV row for audit records.
 */
function extractRawColumns(cols: string[]): Record<string, string> {
  return {
    GLOBALEVENTID: cols[COL.GLOBALEVENTID] ?? '',
    SQLDATE: cols[COL.SQLDATE] ?? '',
    Actor1Name: cols[COL.Actor1Name] ?? '',
    Actor1CountryCode: cols[COL.Actor1CountryCode] ?? '',
    Actor2Name: cols[COL.Actor2Name] ?? '',
    Actor2CountryCode: cols[COL.Actor2CountryCode] ?? '',
    EventCode: cols[COL.EventCode] ?? '',
    EventBaseCode: cols[COL.EventBaseCode] ?? '',
    EventRootCode: cols[COL.EventRootCode] ?? '',
    GoldsteinScale: cols[COL.GoldsteinScale] ?? '',
    NumMentions: cols[COL.NumMentions] ?? '',
    NumSources: cols[COL.NumSources] ?? '',
    ActionGeo_Type: cols[COL.ActionGeo_Type] ?? '',
    ActionGeo_FullName: cols[COL.ActionGeo_FullName] ?? '',
    ActionGeo_CountryCode: cols[COL.ActionGeo_CountryCode] ?? '',
    ActionGeo_ADM1Code: cols[COL.ActionGeo_ADM1Code] ?? '',
    ActionGeo_ADM2Code: cols[COL.ActionGeo_ADM2Code] ?? '',
    ActionGeo_Lat: cols[COL.ActionGeo_Lat] ?? '',
    ActionGeo_Long: cols[COL.ActionGeo_Long] ?? '',
    ActionGeo_FeatureID: cols[COL.ActionGeo_FeatureID] ?? '',
    SOURCEURL: cols[COL.SOURCEURL] ?? '',
  };
}

/**
 * Compute confidence sub-scores for audit trace.
 * Mirrors computeEventConfidence logic but returns individual signal values.
 */
function computeConfidenceSubScores(
  entity: ConflictEventEntity,
  geoPrecision: 'precise' | 'centroid',
): ConfidenceSubScores {
  const { numMentions, numSources, actor1, actor2, goldsteinScale, cameoCode } = entity.data;

  const mentions = numMentions ?? 1;
  const mediaCoverage = Math.min(1, Math.log2(mentions + 1) / Math.log2(50));

  const sources = numSources ?? 1;
  const sourceDiversity = Math.min(1, Math.log2(sources + 1) / Math.log2(15));

  const hasActor1 = actor1.trim().length > 0;
  const hasActor2 = actor2.trim().length > 0;
  const actorSpecificity = hasActor1 && hasActor2 ? 1.0 : hasActor1 || hasActor2 ? 0.5 : 0.0;

  const geoPrecisionSignal = geoPrecision === 'precise' ? 1.0 : 0.3;

  let goldsteinConsistency: number;
  if (goldsteinScale === 0 || goldsteinScale > 0) {
    goldsteinConsistency = 0.5;
  } else {
    const entry = GOLDSTEIN_CEILINGS[entity.type];
    if (!entry) {
      goldsteinConsistency = 0.5;
    } else {
      const diff = goldsteinScale - entry.ceiling;
      if (diff <= 0) {
        goldsteinConsistency = 1.0;
      } else {
        goldsteinConsistency = Math.max(0, 1.0 - diff / 6);
      }
    }
  }

  const cameoSpecificity = getCameoSpecificity(cameoCode);

  return {
    mediaCoverage,
    sourceDiversity,
    actorSpecificity,
    geoPrecisionSignal,
    goldsteinConsistency,
    cameoSpecificity,
  };
}

/**
 * Parse tab-delimited CSV text and produce AuditRecord[] with full pipeline trace.
 * Captures BOTH accepted AND rejected events for audit-first filter tuning.
 *
 * This is the audit-mode variant of parseAndFilter. It is intentionally separate
 * to keep the production-hot parseAndFilter lean. This function is slower but
 * provides complete pipeline transparency.
 */
export async function parseAndFilterWithTrace(csv: string, bellingcatArticles?: BellingcatArticle[]): Promise<AuditRecord[]> {
  const lines = csv.trim().split('\n');
  const config = getConfig();
  const excludedCameo = new Set(config.eventExcludedCameo);
  const records: AuditRecord[] = [];

  // Phase A: Build dedup map for rows that pass all Phase A checks
  // We need two passes: first collect all Phase A survivors for dedup, then process
  const phaseAPassedRows: Array<{ cols: string[]; lat: number; lng: number; mentions: number; phaseA: PhaseAChecks }> = [];
  const phaseARejections: Array<{ cols: string[]; reason: string; phaseA: PhaseAChecks }> = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 61) continue;

    const eventRootCode = cols[COL.EventRootCode];
    const eventBaseCode = cols[COL.EventBaseCode];
    const countryCode = cols[COL.ActionGeo_CountryCode];
    const fullName = cols[COL.ActionGeo_FullName];
    const numSources = parseInt(cols[COL.NumSources], 10) || 0;
    const actor1Country = cols[COL.Actor1CountryCode]?.trim();
    const actor2Country = cols[COL.Actor2CountryCode]?.trim();

    const passedRootCode = CONFLICT_ROOT_CODES.has(eventRootCode);
    const passedCameoExclusion = !excludedCameo.has(eventBaseCode);
    const passedMiddleEast = MIDDLE_EAST_FIPS.has(countryCode);
    const passedGeoValid = isGeoValid(fullName, countryCode);
    const passedMinSources = numSources >= config.eventMinSources;
    const passedActorCountry = !!(actor1Country || actor2Country);

    const phaseA: PhaseAChecks = {
      rootCode: passedRootCode,
      cameoExclusion: passedCameoExclusion,
      middleEast: passedMiddleEast,
      geoValid: passedGeoValid,
      minSources: passedMinSources,
      actorCountry: passedActorCountry,
    };

    // Determine rejection reason (first failed check)
    if (!passedRootCode) {
      phaseARejections.push({ cols, reason: 'non_conflict_root_code', phaseA });
      continue;
    }
    if (!passedCameoExclusion) {
      phaseARejections.push({ cols, reason: 'excluded_cameo', phaseA });
      continue;
    }
    if (!passedMiddleEast) {
      phaseARejections.push({ cols, reason: 'non_middle_east', phaseA });
      continue;
    }
    if (!passedGeoValid) {
      phaseARejections.push({ cols, reason: 'geo_invalid', phaseA });
      continue;
    }
    if (!passedMinSources) {
      phaseARejections.push({ cols, reason: 'single_source', phaseA });
      continue;
    }
    if (!passedActorCountry) {
      phaseARejections.push({ cols, reason: 'no_actor_country', phaseA });
      continue;
    }

    const lat = parseFloat(cols[COL.ActionGeo_Lat]);
    const lng = parseFloat(cols[COL.ActionGeo_Long]);
    if (isNaN(lat) || isNaN(lng)) {
      phaseARejections.push({ cols, reason: 'invalid_coordinates', phaseA });
      continue;
    }

    const mentions = parseInt(cols[COL.NumMentions], 10) || 0;
    phaseAPassedRows.push({ cols, lat, lng, mentions, phaseA });
  }

  // Build Phase A rejection records
  for (const rej of phaseARejections) {
    const id = `gdelt-${rej.cols[COL.GLOBALEVENTID]}`;
    const defaultPhaseB = {
      originalType: 'assault' as const,
      reclassified: false,
      geoPrecision: 'precise' as const,
      confidenceSubScores: { mediaCoverage: 0, sourceDiversity: 0, actorSpecificity: 0, geoPrecisionSignal: 0, goldsteinConsistency: 0, cameoSpecificity: 0 },
      finalConfidence: 0,
      passedThreshold: false,
    };
    records.push(buildAuditRecord({
      id,
      status: 'rejected',
      event: null,
      pipelineTrace: {
        phaseA: rej.phaseA,
        phaseB: defaultPhaseB,
        rejectionReason: rej.reason,
        actionGeoType: parseInt(rej.cols[COL.ActionGeo_Type], 10) || undefined,
      },
      rawGdeltColumns: extractRawColumns(rej.cols),
    }));
  }

  // Dedup: same date+code+lat+lng, keep highest mentions
  const best = new Map<string, typeof phaseAPassedRows[0]>();
  const superseded: Array<typeof phaseAPassedRows[0]> = [];

  for (const row of phaseAPassedRows) {
    const key = `${row.cols[COL.SQLDATE]}|${row.cols[COL.EventCode]}|${row.lat}|${row.lng}`;
    const existing = best.get(key);
    if (!existing || row.mentions > existing.mentions) {
      if (existing) superseded.push(existing);
      best.set(key, row);
    } else {
      superseded.push(row);
    }
  }

  // Build dedup rejection records
  for (const sup of superseded) {
    const id = `gdelt-${sup.cols[COL.GLOBALEVENTID]}`;
    const defaultPhaseB = {
      originalType: 'assault' as const,
      reclassified: false,
      geoPrecision: 'precise' as const,
      confidenceSubScores: { mediaCoverage: 0, sourceDiversity: 0, actorSpecificity: 0, geoPrecisionSignal: 0, goldsteinConsistency: 0, cameoSpecificity: 0 },
      finalConfidence: 0,
      passedThreshold: false,
    };
    records.push(buildAuditRecord({
      id,
      status: 'rejected',
      event: null,
      pipelineTrace: {
        phaseA: sup.phaseA,
        phaseB: defaultPhaseB,
        rejectionReason: 'dedup_superseded',
        actionGeoType: parseInt(sup.cols[COL.ActionGeo_Type], 10) || undefined,
      },
      rawGdeltColumns: extractRawColumns(sup.cols),
    }));
  }

  // Phase B: normalize, score for dedup winners
  const { eventConfidenceThreshold, eventCentroidPenalty } = config;

  // Pre-compute Phase B for all dedup winners, collect URLs for Phase C batch fetch
  const phaseBEntries: Array<{
    entity: ConflictEventEntity;
    origType: ConflictEventType;
    reclassified: boolean;
    geoPrecision: 'precise' | 'centroid';
    confidence: number;
    subScores: ConfidenceSubScores;
    actionGeoType: number | undefined;
    entry: typeof phaseAPassedRows[0];
  }> = [];

  const traceUrls: string[] = [];

  for (const entry of best.values()) {
    let entity = normalizeGdeltEvent(entry.cols, entry.lat, entry.lng);
    const origType = entity.type;
    entity = applyGoldsteinSanity(entity);
    const reclassified = entity.type !== origType;

    const geoPrecision = detectCentroid(entity.lat, entity.lng);
    entity = { ...entity, data: { ...entity.data, geoPrecision } };

    let confidence = computeEventConfidence(entity, geoPrecision);
    const actionGeoType = entity.data.actionGeoType;
    if (actionGeoType === 3 || actionGeoType === 4) {
      confidence *= eventCentroidPenalty;
    }

    const subScores = computeConfidenceSubScores(entity, geoPrecision);

    const url = entry.cols[COL.SOURCEURL];
    if (url) traceUrls.push(url);

    phaseBEntries.push({ entity, origType, reclassified, geoPrecision, confidence, subScores, actionGeoType, entry });
  }

  // Phase C: Batch fetch titles and NLP validate
  const traceTitleMap = await batchFetchTitles(traceUrls);

  const acceptedEntities: ConflictEventEntity[] = [];

  for (const item of phaseBEntries) {
    let { entity, origType, reclassified, geoPrecision, confidence, subScores, actionGeoType, entry } = item;

    // Phase C: NLP geo cross-validation
    const url = entry.cols[COL.SOURCEURL] || '';
    const title = traceTitleMap.get(url) ?? null;

    const nlpResult = validateEventGeo({
      title,
      actorCountryCodes: {
        actor1: entry.cols[COL.Actor1CountryCode]?.trim() || '',
        actor2: entry.cols[COL.Actor2CountryCode]?.trim() || '',
      },
      geoCountryCode: entry.cols[COL.ActionGeo_CountryCode],
      actionGeoType,
      lat: entity.lat,
      lng: entity.lng,
    });

    // Build Phase C trace
    let nlpActors: string[] = [];
    let nlpPlaces: string[] = [];
    if (title !== null) {
      const nlpExtraction = extractActorsAndPlaces(title);
      nlpActors = nlpExtraction.actors;
      nlpPlaces = nlpExtraction.places;
    }

    const phaseC: PhaseCChecks = {
      titleFetched: title !== null,
      nlpActors,
      nlpPlaces,
      validationStatus: nlpResult.status,
      relocatedTo: nlpResult.status === 'relocated' ? { lat: nlpResult.newLat, lng: nlpResult.newLng, cityName: nlpResult.cityName } : undefined,
      mismatchReason: nlpResult.status === 'mismatch' ? nlpResult.reason : undefined,
      penaltyReason: nlpResult.status === 'penalized' ? nlpResult.reason : undefined,
      penaltyMultiplier: nlpResult.status === 'penalized' ? nlpResult.confidenceMultiplier : undefined,
      skipReason: nlpResult.status === 'skipped' ? nlpResult.reason : undefined,
    };

    // Apply Phase C effects
    switch (nlpResult.status) {
      case 'verified':
        break;

      case 'mismatch':
        records.push(buildAuditRecord({
          id: entity.id,
          status: 'rejected',
          event: null,
          pipelineTrace: {
            phaseA: entry.phaseA,
            phaseB: {
              originalType: origType,
              reclassified,
              geoPrecision,
              confidenceSubScores: subScores,
              finalConfidence: confidence,
              passedThreshold: false,
            },
            phaseC,
            rejectionReason: 'actor_geo_mismatch',
            actionGeoType,
          },
          rawGdeltColumns: extractRawColumns(entry.cols),
        }));
        continue;

      case 'relocated':
        entity = {
          ...entity,
          lat: nlpResult.newLat,
          lng: nlpResult.newLng,
          data: { ...entity.data, geoPrecision: 'precise' as const },
        };
        if ((actionGeoType === 3 || actionGeoType === 4) && eventCentroidPenalty > 0) {
          confidence = confidence / eventCentroidPenalty;
        }
        geoPrecision = 'precise';
        break;

      case 'penalized':
        confidence *= nlpResult.confidenceMultiplier;
        break;

      case 'skipped':
        if (nlpResult.reason === 'title_fetch_failed') {
          confidence *= 0.7;
        }
        break;
    }

    entity = { ...entity, data: { ...entity.data, confidence } };
    const passedThreshold = confidence >= eventConfidenceThreshold;

    if (!passedThreshold) {
      records.push(buildAuditRecord({
        id: entity.id,
        status: 'rejected',
        event: null,
        pipelineTrace: {
          phaseA: entry.phaseA,
          phaseB: {
            originalType: origType,
            reclassified,
            geoPrecision,
            confidenceSubScores: subScores,
            finalConfidence: confidence,
            passedThreshold: false,
          },
          phaseC,
          rejectionReason: 'below_confidence_threshold',
          actionGeoType,
        },
        rawGdeltColumns: extractRawColumns(entry.cols),
      }));
      continue;
    }

    // Bellingcat corroboration
    let bellingcatMatch: boolean | undefined;
    if (bellingcatArticles && bellingcatArticles.length > 0) {
      const corroboration = checkBellingcatCorroboration(entity, bellingcatArticles);
      if (corroboration.matched) {
        confidence = Math.min(1.0, confidence + config.bellingcatCorroborationBoost);
        entity = { ...entity, data: { ...entity.data, confidence } };
        bellingcatMatch = true;
      } else {
        bellingcatMatch = false;
      }
    }

    acceptedEntities.push(entity);

    // Build accepted audit record (raw undispersed coordinates for audit)
    records.push(buildAuditRecord({
      id: entity.id,
      status: 'accepted',
      event: entity,
      pipelineTrace: {
        phaseA: entry.phaseA,
        phaseB: {
          originalType: origType,
          reclassified,
          geoPrecision,
          confidenceSubScores: subScores,
          finalConfidence: confidence,
          passedThreshold: true,
        },
        phaseC,
        bellingcatMatch,
        actionGeoType,
      },
      rawGdeltColumns: extractRawColumns(entry.cols),
    }));
  }

  // Dispersion is applied downstream (in the events route after merging).
  // Audit records intentionally contain raw undispersed coordinates
  // so the audit script can inspect original GDELT geocoding.
  return records;
}

/**
 * Fetch the latest GDELT v2 events export, decompress, parse, filter,
 * and return normalized ConflictEventEntity[].
 * Optionally accepts Bellingcat articles for confidence corroboration.
 */
export async function fetchEvents(bellingcatArticles?: BellingcatArticle[]): Promise<ConflictEventEntity[]> {
  const start = Date.now();

  const exportUrl = await getExportUrl();
  const csv = await downloadAndUnzip(exportUrl);
  const events = await parseAndFilter(csv, bellingcatArticles);

  log({ level: 'info', message: `[gdelt] fetched ${events.length} events in ${Date.now() - start}ms` });
  return events;
}

/**
 * Generate GDELT v2 export URLs for a date range.
 * Default interval: 6 hours (4/day sampling for production).
 * Audit mode uses 3 hours (8/day) for more complete coverage.
 */
function generateBackfillUrls(fromTs: number, toTs: number, intervalMs?: number): string[] {
  const urls: string[] = [];
  const interval = intervalMs ?? 6 * 60 * 60 * 1000; // Default 6h
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
    cursor += interval;
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
        return await parseAndFilter(csv, undefined, { skipTitleFetch: true });
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

/**
 * Backfill GDELT v2 events with full audit trace.
 * Audit-mode variant of backfillEvents that returns AuditRecord[] with
 * both accepted and rejected events and full pipeline trace.
 *
 * @param days Number of days to backfill
 * @param samplesPerDay Samples per day (default 8 = every 3h for audit completeness)
 */
export async function backfillEventsWithTrace(
  days: number,
  samplesPerDay: number = 8,
): Promise<AuditRecord[]> {
  const toTs = Date.now();
  const fromTs = toTs - days * 24 * 60 * 60 * 1000;
  const start = Date.now();

  const intervalMs = Math.floor((24 * 60 * 60 * 1000) / samplesPerDay);
  const urls = generateBackfillUrls(fromTs, toTs, intervalMs);
  log({ level: 'info', message: `[gdelt] audit backfill: ${urls.length} files for ${days} days (${samplesPerDay}/day sampling)` });

  const allRecords: AuditRecord[] = [];
  const seenIds = new Set<string>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const csv = await downloadAndUnzip(url);
        return await parseAndFilterWithTrace(csv);
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const record of result.value) {
          if (!seenIds.has(record.id)) {
            seenIds.add(record.id);
            allRecords.push(record);
          }
        }
      }
      // Silently skip failed downloads (404s, timeouts)
    }
  }

  log({ level: 'info', message: `[gdelt] audit backfill: ${allRecords.length} records (${allRecords.filter(r => r.status === 'accepted').length} accepted, ${allRecords.filter(r => r.status === 'rejected').length} rejected) from ${urls.length} files in ${Date.now() - start}ms` });
  return allRecords;
}
