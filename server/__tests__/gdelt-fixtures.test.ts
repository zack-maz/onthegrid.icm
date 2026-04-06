// @vitest-environment node
//
// Fixture-based tests for GDELT event quality pipeline.
// Validates that known true positive events pass and known false positive events are rejected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock adm-zip (same pattern as gdelt.test.ts)
const mockGetEntries = vi.fn();
vi.mock('adm-zip', () => {
  return {
    default: class MockAdmZip {
      constructor(_buf: Buffer) {
        // no-op
      }
      getEntries() {
        return mockGetEntries();
      }
    },
  };
});

// Mock config with standard thresholds (updated to match 26.2-03 defaults)
const mockConfig = {
  eventConfidenceThreshold: 0.38,
  eventMinSources: 2,
  eventCentroidPenalty: 0.7,
  eventExcludedCameo: ['180', '182', '190', '192'],
  bellingcatCorroborationBoost: 0.2,
};
vi.mock('../config.js', () => ({
  getConfig: () => mockConfig,
}));

// Mock batchFetchTitles to return empty map -- fixture tests focus on Phase A/B logic
vi.mock('../lib/titleFetcher.js', () => ({
  batchFetchTitles: vi.fn().mockResolvedValue(new Map()),
}));

// Mock nlpGeoValidator -- return 'skipped' for all events so Phase C doesn't interfere
vi.mock('../lib/nlpGeoValidator.js', () => ({
  validateEventGeo: vi.fn().mockReturnValue({ status: 'skipped', reason: 'no_actor_data' }),
  ACTOR_COUNTRY_MAP: {},
}));

/**
 * Helper to build a 61-column tab-delimited GDELT row.
 * Defaults produce a valid Middle East conflict event.
 */
function makeGdeltRow(overrides: Partial<Record<number, string>> = {}): string {
  const cols = new Array(61).fill('');
  // Sensible defaults for a passing event
  cols[0] = '1000000000';     // GLOBALEVENTID
  cols[1] = '20260315';        // SQLDATE
  cols[6] = 'IRAN';            // Actor1Name
  cols[7] = 'IRN';             // Actor1CountryCode
  cols[16] = 'IRAQ';           // Actor2Name
  cols[17] = 'IRQ';            // Actor2CountryCode
  cols[26] = '195';            // EventCode
  cols[27] = '195';            // EventBaseCode
  cols[28] = '19';             // EventRootCode
  cols[30] = '-8';             // GoldsteinScale
  cols[31] = '15';             // NumMentions
  cols[32] = '5';              // NumSources
  cols[51] = '2';              // ActionGeo_Type (state level -- no centroid penalty)
  cols[52] = 'Baghdad, Baghdad, Iraq'; // ActionGeo_FullName
  cols[53] = 'IZ';             // ActionGeo_CountryCode (FIPS)
  cols[56] = '33.3152';        // ActionGeo_Lat
  cols[57] = '44.3661';        // ActionGeo_Long
  cols[60] = 'https://reuters.com/article/test'; // SOURCEURL

  for (const [idx, val] of Object.entries(overrides)) {
    cols[Number(idx)] = val;
  }

  return cols.join('\t');
}

// -------------------------------------------------------
// TRUE POSITIVE FIXTURES
// Events that SHOULD pass the pipeline
// -------------------------------------------------------

/** Iran airstrike on Iraq -- high confidence, multiple sources, both actors with country codes */
const TP_IRAN_AIRSTRIKE = makeGdeltRow({
  0: 'TP_AIRSTRIKE_01',
  6: 'IRAN',
  7: 'IRN',
  16: 'IRAQ MILITARY',
  17: 'IRQ',
  26: '195',
  27: '195',
  28: '19',
  30: '-8',
  31: '20',
  32: '5',
  51: '2',
  52: 'Baghdad, Baghdad, Iraq',
  53: 'IZ',
  56: '33.3152',
  57: '44.3661',
});

/** Yemen shelling -- root code 19, base code 194 (artillery), 3 sources */
const TP_YEMEN_SHELLING = makeGdeltRow({
  0: 'TP_SHELLING_01',
  1: '20260316',
  6: 'SAUDI ARABIA',
  7: 'SAU',
  16: 'YEMEN',
  17: 'YMN',
  26: '194',
  27: '194',
  28: '19',
  30: '-7',
  31: '12',
  32: '3',
  51: '2',
  52: "Sana'a, Yemen",
  53: 'YM',
  56: '15.3694',
  57: '44.1910',
});

/** Syria bombing -- root code 18, base code 183, 4 sources */
const TP_SYRIA_BOMBING = makeGdeltRow({
  0: 'TP_BOMBING_01',
  1: '20260317',
  6: 'TURKEY',
  7: 'TUR',
  16: 'SYRIA',
  17: 'SYR',
  26: '183',
  27: '183',
  28: '18',
  30: '-9',
  31: '25',
  32: '4',
  51: '2',
  52: 'Aleppo, Aleppo, Syria',
  53: 'SY',
  56: '36.2021',
  57: '37.1343',
});

const TRUE_POSITIVE_ROWS = [TP_IRAN_AIRSTRIKE, TP_YEMEN_SHELLING, TP_SYRIA_BOMBING];

// -------------------------------------------------------
// FALSE POSITIVE FIXTURES
// Events that SHOULD be rejected by the pipeline
// -------------------------------------------------------

/** Cyber op mislabeled as violence -- EventBaseCode 180 (excluded CAMEO) */
const FP_CYBER_OP = makeGdeltRow({
  0: 'FP_CYBER_01',
  26: '180',
  27: '180',
  28: '18',
  30: '-5',
  31: '8',
  32: '3',
  53: 'IR',
  52: 'Tehran, Tehran, Iran',
  56: '35.6892',
  57: '51.3890',
});

/** Single-source rumor -- NumSources=1 (below minSources threshold of 2) */
const FP_SINGLE_SOURCE = makeGdeltRow({
  0: 'FP_SINGLE_01',
  1: '20260318',
  32: '1',  // only 1 source
  53: 'IZ',
  52: 'Mosul, Ninawa, Iraq',
  56: '36.3350',
  57: '43.1189',
});

/** Non-Middle-East event -- ActionGeo_CountryCode US */
const FP_NON_MIDDLE_EAST = makeGdeltRow({
  0: 'FP_NON_ME_01',
  1: '20260319',
  52: 'Washington, District of Columbia, United States',
  53: 'US',
  56: '38.9072',
  57: '-77.0369',
});

/** Geo-invalid event -- FullName says "Washington, United States" but CountryCode is IR */
const FP_GEO_INVALID = makeGdeltRow({
  0: 'FP_GEO_01',
  1: '20260320',
  52: 'Washington, United States',
  53: 'IR',
  56: '35.6892',
  57: '51.3890',
});

/**
 * Low-confidence centroid event:
 * - ActionGeo_Type=4 (landmark centroid -> penalty 0.7x)
 * - Low mentions (2)
 * - Single actor (only actor1)
 * - CAMEO 193 (medium-specificity code, 0.5) -- note: 190 is now excluded
 * - Goldstein 0 (unknown)
 *
 * Expected confidence calculation:
 *   mediaCoverage:  0.25 * min(1, log2(3)/log2(50)) = 0.25 * 0.281 = 0.070
 *   sourceDiversity: 0.15 * min(1, log2(3)/log2(15)) = 0.15 * 0.406 = 0.061
 *   actorSpecificity: 0.15 * 0.5 = 0.075  (only one actor)
 *   geoPrecision: 0.10 * 0.3 = 0.030  (centroid detected for Tehran)
 *   goldsteinConsistency: 0.10 * 0.5 = 0.050  (Goldstein 0 = unknown)
 *   cameoSpecificity: 0.25 * 0.5 = 0.125
 *   Raw total: ~0.411
 *   After centroid penalty (0.7x): ~0.288 < 0.38 threshold -> REJECTED
 */
const FP_LOW_CONFIDENCE = makeGdeltRow({
  0: 'FP_LOW_CONF_01',
  1: '20260321',
  6: 'IRAN',
  7: 'IRN',
  16: '',        // no Actor2Name
  17: '',        // no Actor2CountryCode
  26: '193',
  27: '193',
  28: '19',
  30: '0',       // Goldstein 0 (unknown)
  31: '2',       // low mentions
  32: '2',       // barely above minSources
  51: '4',       // ActionGeo_Type landmark (centroid penalty)
  52: 'Tehran, Tehran, Iran',
  53: 'IR',
  56: '35.6892', // Tehran centroid
  57: '51.3890',
});

/** Physical assault event -- CAMEO 182 (now excluded) */
const FP_CAMEO_182 = makeGdeltRow({
  0: 'FP_CAMEO_182_01',
  1: '20260322',
  26: '182',
  27: '182',
  28: '18',
  30: '-3',
  31: '10',
  32: '3',
  53: 'IZ',
  52: 'Baghdad, Baghdad, Iraq',
  56: '33.3152',
  57: '44.3661',
});

/** Conventional military force NOS -- CAMEO 190 (now excluded) */
const FP_CAMEO_190 = makeGdeltRow({
  0: 'FP_CAMEO_190_01',
  1: '20260323',
  26: '190',
  27: '190',
  28: '19',
  30: '-5',
  31: '15',
  32: '4',
  53: 'IR',
  52: 'Tehran, Tehran, Iran',
  56: '35.6892',
  57: '51.3890',
});

const FALSE_POSITIVE_ROWS = [FP_CYBER_OP, FP_SINGLE_SOURCE, FP_NON_MIDDLE_EAST, FP_GEO_INVALID, FP_LOW_CONFIDENCE, FP_CAMEO_182, FP_CAMEO_190];

describe('GDELT Pipeline Fixtures', () => {
  let parseAndFilter: typeof import('../adapters/gdelt.js').parseAndFilter;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
    const mod = await import('../adapters/gdelt.js');
    parseAndFilter = mod.parseAndFilter;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('true positive fixtures (events that SHOULD pass)', () => {
    it('Iran airstrike on Iraq passes the pipeline', async () => {
      const events = await parseAndFilter(TP_IRAN_AIRSTRIKE);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('airstrike');
      expect(events[0].id).toBe('gdelt-TP_AIRSTRIKE_01');
    });

    it('Yemen shelling passes the pipeline', async () => {
      const events = await parseAndFilter(TP_YEMEN_SHELLING);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('shelling');
      expect(events[0].id).toBe('gdelt-TP_SHELLING_01');
    });

    it('Syria bombing passes the pipeline', async () => {
      const events = await parseAndFilter(TP_SYRIA_BOMBING);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bombing');
      expect(events[0].id).toBe('gdelt-TP_BOMBING_01');
    });

    it('all true positive rows pass when submitted together', async () => {
      const csv = TRUE_POSITIVE_ROWS.join('\n');
      const events = await parseAndFilter(csv);
      expect(events).toHaveLength(3);
      const ids = events.map(e => e.id).sort();
      expect(ids).toContain('gdelt-TP_AIRSTRIKE_01');
      expect(ids).toContain('gdelt-TP_SHELLING_01');
      expect(ids).toContain('gdelt-TP_BOMBING_01');
    });
  });

  describe('false positive fixtures (events that SHOULD be rejected)', () => {
    it('cyber op (CAMEO 180) is rejected as excluded CAMEO', async () => {
      const events = await parseAndFilter(FP_CYBER_OP);
      expect(events).toHaveLength(0);
    });

    it('physical assault (CAMEO 182) is rejected as excluded CAMEO', async () => {
      const events = await parseAndFilter(FP_CAMEO_182);
      expect(events).toHaveLength(0);
    });

    it('conventional military force NOS (CAMEO 190) is rejected as excluded CAMEO', async () => {
      const events = await parseAndFilter(FP_CAMEO_190);
      expect(events).toHaveLength(0);
    });

    it('single-source rumor is rejected for insufficient sources', async () => {
      const events = await parseAndFilter(FP_SINGLE_SOURCE);
      expect(events).toHaveLength(0);
    });

    it('non-Middle-East event (US) is rejected for country code', async () => {
      const events = await parseAndFilter(FP_NON_MIDDLE_EAST);
      expect(events).toHaveLength(0);
    });

    it('geo-invalid event (FullName contradicts FIPS) is rejected', async () => {
      const events = await parseAndFilter(FP_GEO_INVALID);
      expect(events).toHaveLength(0);
    });

    it('low-confidence centroid event is rejected below threshold', async () => {
      const events = await parseAndFilter(FP_LOW_CONFIDENCE);
      expect(events).toHaveLength(0);
    });

    it('all false positive rows are rejected when submitted together', async () => {
      const csv = FALSE_POSITIVE_ROWS.join('\n');
      const events = await parseAndFilter(csv);
      expect(events).toHaveLength(0);
    });
  });

  describe('mixed fixtures (pipeline separates true from false)', () => {
    it('returns only true positives from mixed CSV', async () => {
      const csv = [...TRUE_POSITIVE_ROWS, ...FALSE_POSITIVE_ROWS].join('\n');
      const events = await parseAndFilter(csv);

      // Should return exactly the 3 true positives
      expect(events).toHaveLength(3);

      const ids = new Set(events.map(e => e.id));
      // True positives present
      expect(ids.has('gdelt-TP_AIRSTRIKE_01')).toBe(true);
      expect(ids.has('gdelt-TP_SHELLING_01')).toBe(true);
      expect(ids.has('gdelt-TP_BOMBING_01')).toBe(true);

      // False positives absent
      expect(ids.has('gdelt-FP_CYBER_01')).toBe(false);
      expect(ids.has('gdelt-FP_SINGLE_01')).toBe(false);
      expect(ids.has('gdelt-FP_NON_ME_01')).toBe(false);
      expect(ids.has('gdelt-FP_GEO_01')).toBe(false);
      expect(ids.has('gdelt-FP_LOW_CONF_01')).toBe(false);
      expect(ids.has('gdelt-FP_CAMEO_182_01')).toBe(false);
      expect(ids.has('gdelt-FP_CAMEO_190_01')).toBe(false);
    });

    it('all returned events have confidence above threshold', async () => {
      const csv = [...TRUE_POSITIVE_ROWS, ...FALSE_POSITIVE_ROWS].join('\n');
      const events = await parseAndFilter(csv);

      for (const event of events) {
        expect(event.data.confidence).toBeGreaterThanOrEqual(mockConfig.eventConfidenceThreshold);
      }
    });
  });

  describe('parseAndFilterWithTrace (audit mode)', () => {
    let parseAndFilterWithTrace: typeof import('../adapters/gdelt.js').parseAndFilterWithTrace;

    beforeEach(async () => {
      const mod = await import('../adapters/gdelt.js');
      parseAndFilterWithTrace = mod.parseAndFilterWithTrace;
    });

    it('returns audit records for both accepted and rejected events', async () => {
      const csv = [...TRUE_POSITIVE_ROWS, ...FALSE_POSITIVE_ROWS].join('\n');
      const records = await parseAndFilterWithTrace(csv);

      const accepted = records.filter(r => r.status === 'accepted');
      const rejected = records.filter(r => r.status === 'rejected');

      expect(accepted.length).toBe(3);
      expect(rejected.length).toBe(7);
    });

    it('rejected records have specific rejection reasons', async () => {
      const csv = FALSE_POSITIVE_ROWS.join('\n');
      const records = await parseAndFilterWithTrace(csv);

      const reasons = records.map(r => r.pipelineTrace.rejectionReason).sort();
      expect(reasons).toContain('excluded_cameo');
      expect(reasons).toContain('single_source');
      expect(reasons).toContain('non_middle_east');
      expect(reasons).toContain('geo_invalid');
      expect(reasons).toContain('below_confidence_threshold');
    });

    it('accepted records have full phaseA checks (all true)', async () => {
      const records = await parseAndFilterWithTrace(TP_IRAN_AIRSTRIKE);
      const accepted = records.filter(r => r.status === 'accepted');
      expect(accepted).toHaveLength(1);

      const phaseA = accepted[0].pipelineTrace.phaseA;
      expect(phaseA.rootCode).toBe(true);
      expect(phaseA.cameoExclusion).toBe(true);
      expect(phaseA.middleEast).toBe(true);
      expect(phaseA.geoValid).toBe(true);
      expect(phaseA.minSources).toBe(true);
      expect(phaseA.actorCountry).toBe(true);
    });

    it('accepted records have phaseB confidence sub-scores', async () => {
      const records = await parseAndFilterWithTrace(TP_IRAN_AIRSTRIKE);
      const accepted = records.filter(r => r.status === 'accepted');
      const phaseB = accepted[0].pipelineTrace.phaseB;

      expect(phaseB.finalConfidence).toBeGreaterThan(0);
      expect(phaseB.passedThreshold).toBe(true);
      expect(phaseB.confidenceSubScores.mediaCoverage).toBeGreaterThan(0);
      expect(phaseB.confidenceSubScores.sourceDiversity).toBeGreaterThan(0);
      expect(phaseB.confidenceSubScores.cameoSpecificity).toBeGreaterThan(0);
    });

    it('accepted records have phaseC trace fields', async () => {
      const records = await parseAndFilterWithTrace(TP_IRAN_AIRSTRIKE);
      const accepted = records.filter(r => r.status === 'accepted');
      const phaseC = accepted[0].pipelineTrace.phaseC;

      expect(phaseC).toBeDefined();
      expect(phaseC!.titleFetched).toBe(false); // batchFetchTitles mocked to empty map
      expect(phaseC!.validationStatus).toBe('skipped');
    });

    it('accepted records have rawGdeltColumns', async () => {
      const records = await parseAndFilterWithTrace(TP_IRAN_AIRSTRIKE);
      const accepted = records.filter(r => r.status === 'accepted');
      const raw = accepted[0].rawGdeltColumns;

      expect(raw.GLOBALEVENTID).toBe('TP_AIRSTRIKE_01');
      expect(raw.EventBaseCode).toBe('195');
      expect(raw.ActionGeo_CountryCode).toBe('IZ');
    });
  });
});
