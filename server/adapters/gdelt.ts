import AdmZip from 'adm-zip';
import type { ConflictEventEntity, ConflictEventType } from '../types.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'gdelt' });
import { isGeoValid, detectCentroid } from '../lib/geoValidation.js';
import {
  computeEventConfidence,
  applyGoldsteinSanity,
  GOLDSTEIN_CEILINGS,
  checkBellingcatCorroboration,
  getCameoSpecificity,
} from '../lib/eventScoring.js';
import type { BellingcatArticle } from '../lib/eventScoring.js';
import { getConfig } from '../config.js';
import { buildAuditRecord } from '../lib/eventAudit.js';
import type { AuditRecord, PhaseAChecks, ConfidenceSubScores } from '../lib/eventAudit.js';

// GDELT v2 lastupdate.txt endpoint (HTTP, NOT HTTPS -- TLS cert issues)
const GDELT_LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

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
  const parts = exportLine.trim().split(' ');
  const url = parts[2];
  if (!url) {
    throw new Error('Malformed lastupdate.txt: missing URL column');
  }
  return url;
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
  const firstEntry = entries[0];
  if (!firstEntry) {
    throw new Error('GDELT ZIP archive contained no entries');
  }
  return firstEntry.getData().toString('utf8');
}

/**
 * Safely read a CSV column, returning empty string for out-of-bounds access.
 * GDELT rows have at least 61 columns once filtered earlier in the pipeline,
 * but this guard makes column reads explicit under noUncheckedIndexedAccess.
 */
function getCol(cols: string[], idx: number): string {
  return cols[idx] ?? '';
}

// All valid CAMEO base codes in the 180-204 range are mapped below.
// Codes 187-189, 197-199, 205+ do not exist in the CAMEO spec and correctly fall to ROOT_FALLBACK.
// Note: CAMEO base code exclusion is handled via config.eventExcludedCameo (not hardcoded here).

const BASE_CODE_MAP: Record<string, ConflictEventType> = {
  '181': 'targeted', // Abduction / hostage-taking
  '182': 'on_ground', // Physical assault
  '183': 'explosion', // Bombing
  '184': 'on_ground', // Use as human shield
  '185': 'targeted', // Assassination attempt
  '186': 'targeted', // Assassination
  '190': 'on_ground', // Conventional military force
  '191': 'other', // Blockade
  '193': 'on_ground', // Small arms / light weapons
  '194': 'explosion', // Artillery / tank support (shelling)
  '195': 'airstrike', // Aerial weapons
  '196': 'other', // Ceasefire violation
  '200': 'other', // Unconventional mass violence
  '201': 'other', // Mass expulsion
  '202': 'other', // Mass killings
  '203': 'other', // Ethnic cleansing
  '204': 'other', // WMD
};

const ROOT_FALLBACK: Record<string, ConflictEventType> = {
  '18': 'on_ground',
  '19': 'on_ground',
  '20': 'other',
};

/**
 * Classify CAMEO base code to ConflictEventType.
 * Falls back by root code for unmapped base codes.
 */
export function classifyByBaseCode(
  eventBaseCode: string,
  eventRootCode: string,
): ConflictEventType {
  return BASE_CODE_MAP[eventBaseCode] ?? ROOT_FALLBACK[eventRootCode] ?? 'on_ground';
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
export function normalizeGdeltEvent(cols: string[], lat: number, lng: number): ConflictEventEntity {
  const eventBaseCode = getCol(cols, COL.EventBaseCode);
  const eventRootCode = getCol(cols, COL.EventRootCode);
  const eventCode = getCol(cols, COL.EventCode);
  const sqlDate = getCol(cols, COL.SQLDATE);
  const actionGeoType = parseInt(getCol(cols, COL.ActionGeo_Type), 10) || undefined;

  return {
    id: `gdelt-${getCol(cols, COL.GLOBALEVENTID)}`,
    type: classifyByBaseCode(eventBaseCode, eventRootCode),
    lat,
    lng,
    timestamp: parseSqlDate(sqlDate),
    label: `${getCol(cols, COL.ActionGeo_FullName)}: ${describeEvent(eventBaseCode)}`,
    data: {
      eventType: describeEvent(eventBaseCode),
      subEventType: `CAMEO ${eventCode}`,
      fatalities: 0, // GDELT does not track fatalities
      actor1: getCol(cols, COL.Actor1Name),
      actor2: getCol(cols, COL.Actor2Name),
      notes: '',
      source: getCol(cols, COL.SOURCEURL),
      goldsteinScale: parseFloat(getCol(cols, COL.GoldsteinScale)) || 0,
      locationName: getCol(cols, COL.ActionGeo_FullName),
      cameoCode: eventCode,
      numMentions: parseInt(getCol(cols, COL.NumMentions), 10) || undefined,
      numSources: parseInt(getCol(cols, COL.NumSources), 10) || undefined,
      actionGeoType,
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
export function parseAndFilter(
  csv: string,
  bellingcatArticles?: BellingcatArticle[],
): ConflictEventEntity[] {
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

    const eventRootCode = getCol(cols, COL.EventRootCode);
    const countryCode = getCol(cols, COL.ActionGeo_CountryCode);

    if (!CONFLICT_ROOT_CODES.has(eventRootCode)) continue;
    const eventBaseCode = getCol(cols, COL.EventBaseCode);
    if (excludedCameo.has(eventBaseCode)) continue;
    if (!MIDDLE_EAST_FIPS.has(countryCode)) continue;

    // Geo cross-validation: discard events where FullName contradicts FIPS code
    const fullName = getCol(cols, COL.ActionGeo_FullName);
    if (!isGeoValid(fullName, countryCode)) {
      geoDiscardCount++;
      log.warn(
        { eventId: getCol(cols, COL.GLOBALEVENTID), fullName, countryCode },
        'discarded: FullName contradicts FIPS',
      );
      continue;
    }

    // Require at least N independent sources — single-source events are overwhelmingly
    // false positives (op-eds, niche sites). Real kinetic events get multi-source coverage fast.
    const numSources = parseInt(getCol(cols, COL.NumSources), 10) || 0;
    if (numSources < config.eventMinSources) continue;

    // Require at least one actor with a country code (filters non-state actors)
    const actor1Country = getCol(cols, COL.Actor1CountryCode).trim();
    const actor2Country = getCol(cols, COL.Actor2CountryCode).trim();
    if (!actor1Country && !actor2Country) continue;

    const lat = parseFloat(getCol(cols, COL.ActionGeo_Lat));
    const lng = parseFloat(getCol(cols, COL.ActionGeo_Long));
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${getCol(cols, COL.SQLDATE)}|${getCol(cols, COL.EventCode)}|${lat}|${lng}`;
    const mentions = parseInt(getCol(cols, COL.NumMentions), 10) || 0;
    const existing = best.get(key);

    if (!existing || mentions > existing.mentions) {
      best.set(key, { cols, lat, lng, mentions });
    }
  }

  const geoValidCount = best.size;

  // --- Phase B: Normalize, score, and threshold-filter ---

  const { eventConfidenceThreshold, eventCentroidPenalty } = config;
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
      log.info(
        {
          id: entity.id,
          from: origType,
          to: entity.type,
          goldstein: entity.data.goldsteinScale,
          ceiling,
        },
        'reclassified event',
      );
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

    entity = { ...entity, data: { ...entity.data, confidence } };

    // Step 12: Threshold filter
    if (confidence < eventConfidenceThreshold) {
      thresholdDiscardCount++;
      log.warn(
        { id: entity.id, confidence: +confidence.toFixed(3), threshold: eventConfidenceThreshold },
        'discarded: below confidence threshold',
      );
      continue;
    }

    // Step 13: Bellingcat corroboration boost (opportunistic)
    if (bellingcatArticles && bellingcatArticles.length > 0) {
      const corroboration = checkBellingcatCorroboration(entity, bellingcatArticles);
      if (corroboration.matched) {
        confidence = Math.min(1.0, confidence + config.bellingcatCorroborationBoost);
        entity = { ...entity, data: { ...entity.data, confidence } };
        log.info(
          {
            id: entity.id,
            boost: config.bellingcatCorroborationBoost,
            confidence: +confidence.toFixed(3),
            article: corroboration.article.url,
          },
          'Bellingcat corroboration boost',
        );
      }
    }

    results.push(entity);
  }

  // Pipeline summary
  log.info(
    {
      rawCount,
      geoValidCount,
      geoDiscardCount,
      reclassifyCount,
      aboveThreshold: geoValidCount - thresholdDiscardCount,
      finalCount: results.length,
    },
    'pipeline summary',
  );

  // Dispersion is applied downstream in the events route (after all merging)
  // so that the full merged event set gets single-pass slot assignment.
  return results;
}

/**
 * Extract named raw GDELT columns from a CSV row for audit records.
 */
function extractRawColumns(cols: string[]): Record<string, string> {
  return {
    GLOBALEVENTID: getCol(cols, COL.GLOBALEVENTID),
    SQLDATE: getCol(cols, COL.SQLDATE),
    Actor1Name: getCol(cols, COL.Actor1Name),
    Actor1CountryCode: getCol(cols, COL.Actor1CountryCode),
    Actor2Name: getCol(cols, COL.Actor2Name),
    Actor2CountryCode: getCol(cols, COL.Actor2CountryCode),
    EventCode: getCol(cols, COL.EventCode),
    EventBaseCode: getCol(cols, COL.EventBaseCode),
    EventRootCode: getCol(cols, COL.EventRootCode),
    GoldsteinScale: getCol(cols, COL.GoldsteinScale),
    NumMentions: getCol(cols, COL.NumMentions),
    NumSources: getCol(cols, COL.NumSources),
    ActionGeo_Type: getCol(cols, COL.ActionGeo_Type),
    ActionGeo_FullName: getCol(cols, COL.ActionGeo_FullName),
    ActionGeo_CountryCode: getCol(cols, COL.ActionGeo_CountryCode),
    ActionGeo_ADM1Code: getCol(cols, COL.ActionGeo_ADM1Code),
    ActionGeo_ADM2Code: getCol(cols, COL.ActionGeo_ADM2Code),
    ActionGeo_Lat: getCol(cols, COL.ActionGeo_Lat),
    ActionGeo_Long: getCol(cols, COL.ActionGeo_Long),
    ActionGeo_FeatureID: getCol(cols, COL.ActionGeo_FeatureID),
    SOURCEURL: getCol(cols, COL.SOURCEURL),
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
export function parseAndFilterWithTrace(
  csv: string,
  bellingcatArticles?: BellingcatArticle[],
): AuditRecord[] {
  const lines = csv.trim().split('\n');
  const config = getConfig();
  const excludedCameo = new Set(config.eventExcludedCameo);
  const records: AuditRecord[] = [];

  // Phase A: Build dedup map for rows that pass all Phase A checks
  // We need two passes: first collect all Phase A survivors for dedup, then process
  const phaseAPassedRows: Array<{
    cols: string[];
    lat: number;
    lng: number;
    mentions: number;
    phaseA: PhaseAChecks;
  }> = [];
  const phaseARejections: Array<{ cols: string[]; reason: string; phaseA: PhaseAChecks }> = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 61) continue;

    const eventRootCode = getCol(cols, COL.EventRootCode);
    const eventBaseCode = getCol(cols, COL.EventBaseCode);
    const countryCode = getCol(cols, COL.ActionGeo_CountryCode);
    const fullName = getCol(cols, COL.ActionGeo_FullName);
    const numSources = parseInt(getCol(cols, COL.NumSources), 10) || 0;
    const actor1Country = getCol(cols, COL.Actor1CountryCode).trim();
    const actor2Country = getCol(cols, COL.Actor2CountryCode).trim();

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

    const lat = parseFloat(getCol(cols, COL.ActionGeo_Lat));
    const lng = parseFloat(getCol(cols, COL.ActionGeo_Long));
    if (isNaN(lat) || isNaN(lng)) {
      phaseARejections.push({ cols, reason: 'invalid_coordinates', phaseA });
      continue;
    }

    const mentions = parseInt(getCol(cols, COL.NumMentions), 10) || 0;
    phaseAPassedRows.push({ cols, lat, lng, mentions, phaseA });
  }

  // Build Phase A rejection records
  for (const rej of phaseARejections) {
    const id = `gdelt-${getCol(rej.cols, COL.GLOBALEVENTID)}`;
    const defaultPhaseB = {
      originalType: 'on_ground' as const,
      reclassified: false,
      geoPrecision: 'precise' as const,
      confidenceSubScores: {
        mediaCoverage: 0,
        sourceDiversity: 0,
        actorSpecificity: 0,
        geoPrecisionSignal: 0,
        goldsteinConsistency: 0,
        cameoSpecificity: 0,
      },
      finalConfidence: 0,
      passedThreshold: false,
    };
    records.push(
      buildAuditRecord({
        id,
        status: 'rejected',
        event: null,
        pipelineTrace: {
          phaseA: rej.phaseA,
          phaseB: defaultPhaseB,
          rejectionReason: rej.reason,
          actionGeoType: parseInt(getCol(rej.cols, COL.ActionGeo_Type), 10) || undefined,
        },
        rawGdeltColumns: extractRawColumns(rej.cols),
      }),
    );
  }

  // Dedup: same date+code+lat+lng, keep highest mentions
  const best = new Map<string, (typeof phaseAPassedRows)[0]>();
  const superseded: Array<(typeof phaseAPassedRows)[0]> = [];

  for (const row of phaseAPassedRows) {
    const key = `${getCol(row.cols, COL.SQLDATE)}|${getCol(row.cols, COL.EventCode)}|${row.lat}|${row.lng}`;
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
    const id = `gdelt-${getCol(sup.cols, COL.GLOBALEVENTID)}`;
    const defaultPhaseB = {
      originalType: 'on_ground' as const,
      reclassified: false,
      geoPrecision: 'precise' as const,
      confidenceSubScores: {
        mediaCoverage: 0,
        sourceDiversity: 0,
        actorSpecificity: 0,
        geoPrecisionSignal: 0,
        goldsteinConsistency: 0,
        cameoSpecificity: 0,
      },
      finalConfidence: 0,
      passedThreshold: false,
    };
    records.push(
      buildAuditRecord({
        id,
        status: 'rejected',
        event: null,
        pipelineTrace: {
          phaseA: sup.phaseA,
          phaseB: defaultPhaseB,
          rejectionReason: 'dedup_superseded',
          actionGeoType: parseInt(getCol(sup.cols, COL.ActionGeo_Type), 10) || undefined,
        },
        rawGdeltColumns: extractRawColumns(sup.cols),
      }),
    );
  }

  // Phase B: normalize, score, threshold-filter for dedup winners
  const { eventConfidenceThreshold, eventCentroidPenalty } = config;
  const acceptedEntities: ConflictEventEntity[] = [];

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
    entity = { ...entity, data: { ...entity.data, confidence } };

    const subScores = computeConfidenceSubScores(entity, geoPrecision);
    const passedThreshold = confidence >= eventConfidenceThreshold;

    if (!passedThreshold) {
      // Rejected at threshold
      records.push(
        buildAuditRecord({
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
            rejectionReason: 'below_confidence_threshold',
            actionGeoType,
          },
          rawGdeltColumns: extractRawColumns(entry.cols),
        }),
      );
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
    records.push(
      buildAuditRecord({
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
          bellingcatMatch,
          actionGeoType,
        },
        rawGdeltColumns: extractRawColumns(entry.cols),
      }),
    );
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
export async function fetchEvents(
  bellingcatArticles?: BellingcatArticle[],
): Promise<ConflictEventEntity[]> {
  const start = Date.now();

  const exportUrl = await getExportUrl();
  const csv = await downloadAndUnzip(exportUrl);
  const events = parseAndFilter(csv, bellingcatArticles);

  log.info({ count: events.length, durationMs: Date.now() - start }, 'fetched events');
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
    urls.push(`http://data.gdeltproject.org/gdeltv2/${yyyy}${mm}${dd}${hh}0000.export.CSV.zip`);
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
  log.info({ fileCount: urls.length, days, sampling: '4/day' }, 'backfill started');

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
  log.info(
    { count: events.length, fileCount: urls.length, durationMs: Date.now() - start },
    'backfill complete',
  );
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
  log.info({ fileCount: urls.length, days, samplesPerDay }, 'audit backfill started');

  const allRecords: AuditRecord[] = [];
  const seenIds = new Set<string>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const csv = await downloadAndUnzip(url);
        return parseAndFilterWithTrace(csv);
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

  log.info(
    {
      totalRecords: allRecords.length,
      accepted: allRecords.filter((r) => r.status === 'accepted').length,
      rejected: allRecords.filter((r) => r.status === 'rejected').length,
      fileCount: urls.length,
      durationMs: Date.now() - start,
    },
    'audit backfill complete',
  );
  return allRecords;
}
