// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock adm-zip module with a constructable class
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

// Mock config to provide thresholds for parseAndFilter
const mockConfig = {
  eventConfidenceThreshold: 0.35,
  eventMinSources: 2,
  eventCentroidPenalty: 0.7,
  eventExcludedCameo: ['180', '192'],
  bellingcatCorroborationBoost: 0.2,
};
vi.mock('../config.js', () => ({
  getConfig: () => mockConfig,
}));

// Sample lastupdate.txt content (3 lines: export, mentions, gkg)
const sampleLastUpdate = [
  '150383 297a16b493de7cf6ca809a7cc31d0b93 http://data.gdeltproject.org/gdeltv2/20260317120000.export.CSV.zip',
  '86743 abc123def456 http://data.gdeltproject.org/gdeltv2/20260317120000.mentions.CSV.zip',
  '432876 def789abc012 http://data.gdeltproject.org/gdeltv2/20260317120000.gkg.CSV.zip',
].join('\n');

// Helper to build a 61-column tab-delimited GDELT row
// Only fill the columns we care about, rest are empty strings
function makeGdeltRow(overrides: Partial<Record<number, string>> = {}): string {
  const cols = new Array(61).fill('');
  // Defaults for a valid Iran conflict event (EventRootCode 19)
  cols[0] = '1234567890'; // GLOBALEVENTID
  cols[1] = '20260315';   // SQLDATE
  cols[6] = 'IRANIAN GOVERNMENT'; // Actor1Name
  cols[7] = 'IRN';          // Actor1CountryCode
  cols[16] = 'IRAQ';       // Actor2Name
  cols[17] = 'IRQ';         // Actor2CountryCode
  cols[26] = '190';        // EventCode
  cols[27] = '190';        // EventBaseCode
  cols[28] = '19';         // EventRootCode
  cols[30] = '-9.5';       // GoldsteinScale
  cols[31] = '10';          // NumMentions
  cols[32] = '5';           // NumSources (>= 2 required)
  cols[52] = 'Tehran, Tehran, Iran'; // ActionGeo_FullName
  cols[53] = 'IR';         // ActionGeo_CountryCode (FIPS)
  cols[56] = '35.6892';    // ActionGeo_Lat
  cols[57] = '51.3890';    // ActionGeo_Long
  cols[60] = 'https://reuters.com/article/123'; // SOURCEURL

  // Apply overrides
  for (const [idx, val] of Object.entries(overrides)) {
    cols[Number(idx)] = val;
  }

  return cols.join('\t');
}

// Sample rows for testing
const validIranMissileRow = makeGdeltRow(); // root code 19, IR
const validSyriaDroneRow = makeGdeltRow({
  0: '9876543210',
  28: '18', // root code 18 -> drone
  26: '183',
  27: '183',
  52: 'Damascus, Syria',
  53: 'SY',
  56: '33.5138',
  57: '36.2765',
  60: 'https://aljazeera.com/article/456',
});
const nonConflictRow = makeGdeltRow({
  0: '1111111111',
  28: '04', // root code 04 (Consult) -- NOT a conflict code
  26: '040',
  27: '040',
});
const outsideMiddleEastRow = makeGdeltRow({
  0: '2222222222',
  53: 'US', // United States -- not in MIDDLE_EAST_FIPS
});
const missingLatLngRow = makeGdeltRow({
  0: '3333333333',
  56: '', // empty lat
  57: '', // empty lng
});
const malformedShortRow = 'col0\tcol1\tcol2'; // < 61 columns

// Duplicate rows for dedup testing: same date/code/location, different actors & mention counts
const dupRowLowMentions = makeGdeltRow({
  0: '4444444444',
  16: '',         // no Actor2Name
  31: '5',        // fewer mentions
});
const dupRowHighMentions = makeGdeltRow({
  0: '5555555555',
  16: 'Government', // has Actor2Name
  31: '25',         // more mentions -> should win
});

const sampleCsv = [
  validIranMissileRow,
  validSyriaDroneRow,
  nonConflictRow,
  outsideMiddleEastRow,
  missingLatLngRow,
  malformedShortRow,
].join('\n');

describe('GDELT Adapter', () => {
  let getExportUrl: typeof import('../adapters/gdelt.js').getExportUrl;
  let parseAndFilter: typeof import('../adapters/gdelt.js').parseAndFilter;
  let classifyByBaseCode: typeof import('../adapters/gdelt.js').classifyByBaseCode;
  let normalizeGdeltEvent: typeof import('../adapters/gdelt.js').normalizeGdeltEvent;
  let fetchEvents: typeof import('../adapters/gdelt.js').fetchEvents;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    vi.resetModules();
    const mod = await import('../adapters/gdelt.js');
    getExportUrl = mod.getExportUrl;
    parseAndFilter = mod.parseAndFilter;
    classifyByBaseCode = mod.classifyByBaseCode;
    normalizeGdeltEvent = mod.normalizeGdeltEvent;
    fetchEvents = mod.fetchEvents;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getExportUrl', () => {
    it('parses lastupdate.txt and returns the .export.CSV.zip URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => sampleLastUpdate,
      });

      const url = await getExportUrl();

      expect(url).toBe(
        'http://data.gdeltproject.org/gdeltv2/20260317120000.export.CSV.zip',
      );
    });

    it('throws if lastupdate.txt fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      await expect(getExportUrl()).rejects.toThrow('lastupdate.txt');
    });

    it('throws if no export URL found in lastupdate.txt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'some random text without export url',
      });

      await expect(getExportUrl()).rejects.toThrow('No export URL');
    });
  });

  describe('parseAndFilter', () => {
    it('extracts conflict events from tab-delimited CSV with correct column indices', () => {
      const events = parseAndFilter(sampleCsv);

      // Only the 2 valid Middle East conflict events should pass
      expect(events).toHaveLength(2);
    });

    it('excludes rows with EventRootCode NOT in (18, 19, 20)', () => {
      const events = parseAndFilter(nonConflictRow);
      expect(events).toHaveLength(0);
    });

    it('excludes catch-all CAMEO base code 180 (unconventional violence NOS)', () => {
      const row180 = makeGdeltRow({
        0: '6666666666',
        26: '180',
        27: '180',
        28: '18',
      });
      const events = parseAndFilter(row180);
      expect(events).toHaveLength(0);
    });

    it('excludes single-source events (NumSources < 2)', () => {
      const singleSourceRow = makeGdeltRow({
        0: '7777777777',
        32: '1', // only 1 source
      });
      const events = parseAndFilter(singleSourceRow);
      expect(events).toHaveLength(0);
    });

    it('excludes rows with ActionGeo_CountryCode NOT in MIDDLE_EAST_FIPS', () => {
      const events = parseAndFilter(outsideMiddleEastRow);
      expect(events).toHaveLength(0);
    });

    it('excludes rows with empty/missing lat or lng (no NaN)', () => {
      const events = parseAndFilter(missingLatLngRow);
      expect(events).toHaveLength(0);
    });

    it('excludes rows with fewer than 61 columns', () => {
      const events = parseAndFilter(malformedShortRow);
      expect(events).toHaveLength(0);
    });

    it('handles trailing newlines gracefully', () => {
      const csvWithTrailing = validIranMissileRow + '\n\n';
      const events = parseAndFilter(csvWithTrailing);
      expect(events).toHaveLength(1);
    });

    it('deduplicates rows with same date/code/location, keeping highest NumMentions', () => {
      const csv = [dupRowLowMentions, dupRowHighMentions].join('\n');
      const events = parseAndFilter(csv);
      expect(events).toHaveLength(1);
      expect(events[0].data.actor2).toBe('Government');
    });

    it('dedup keeps first row when mention counts are equal', () => {
      const rowA = makeGdeltRow({ 0: '6666666666', 6: 'ACTOR_A', 31: '10' });
      const rowB = makeGdeltRow({ 0: '7777777777', 6: 'ACTOR_B', 31: '10' });
      const events = parseAndFilter([rowA, rowB].join('\n'));
      expect(events).toHaveLength(1);
    });

    it('does not dedup rows at the same location with different CAMEO codes', () => {
      const row19 = makeGdeltRow({ 0: '8888888888', 26: '190', 31: '10' });
      const row18 = makeGdeltRow({ 0: '9999999999', 26: '183', 28: '18', 27: '183', 31: '10' });
      const events = parseAndFilter([row19, row18].join('\n'));
      expect(events).toHaveLength(2);
    });

    it('discards row where FullName="New York, United States" with FIPS="IS" (geo cross-validation)', () => {
      const row = makeGdeltRow({
        0: '1010101010',
        52: 'New York, United States',
        53: 'IS',
      });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(0);
    });

    it('preserves row where FullName="US forces in Baghdad, Iraq" with FIPS="IZ" (actor reference in non-last segment)', () => {
      const row = makeGdeltRow({
        0: '2020202020',
        52: 'US forces in Baghdad, Iraq',
        53: 'IZ',
        56: '33.3152',
        57: '44.3661',
      });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
    });

    it('sets geoPrecision="centroid" when lat/lng matches Tehran (35.6892, 51.3890)', () => {
      const row = makeGdeltRow({
        0: '3030303030',
        56: '35.6892',
        57: '51.3890',
      });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
      expect(events[0].data.geoPrecision).toBe('centroid');
    });

    it('sets geoPrecision="precise" for non-centroid coordinates', () => {
      const row = makeGdeltRow({
        0: '4040404040',
        56: '34.1234',
        57: '50.5678',
      });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
      expect(events[0].data.geoPrecision).toBe('precise');
    });

    it('reclassifies airstrike with Goldstein=-1 to shelling', () => {
      // Airstrike (base code 195) with Goldstein=-1: ceiling is -5, diff = -1 - (-5) = 4 > 3 -> reclassify to shelling
      const row = makeGdeltRow({
        0: '5050505050',
        26: '195',
        27: '195',
        28: '19',
        30: '-1',
        56: '34.1234',
        57: '50.5678',
      });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('shelling');
    });

    it('attaches confidence score (0 < confidence <= 1) to all returned events', () => {
      const row = makeGdeltRow({ 0: '6060606060' });
      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
      expect(events[0].data.confidence).toBeDefined();
      expect(events[0].data.confidence).toBeGreaterThan(0);
      expect(events[0].data.confidence).toBeLessThanOrEqual(1);
    });

    it('discards events below confidence threshold (low-signal row)', () => {
      // Low signal: empty actors, 1 mention, 0 sources, centroid location (Tehran), Goldstein 0
      const row = makeGdeltRow({
        0: '7070707070',
        6: '',          // no Actor1Name
        7: 'IRN',       // still need actor country for Phase A
        16: '',         // no Actor2Name
        17: '',         // no Actor2CountryCode
        31: '1',        // minimal mentions
        32: '0',        // no sources
        30: '0',        // Goldstein 0 (unknown)
        56: '35.6892',  // Tehran centroid
        57: '51.3890',
      });
      const events = parseAndFilter(row);
      // With empty actors (score 0.0 for actor specificity), 1 mention, 0 sources,
      // centroid (0.3), and Goldstein 0 (0.5 neutral), the score should be well below 0.35
      expect(events).toHaveLength(0);
    });
  });

  describe('classifyByBaseCode', () => {
    it('returns airstrike for base code 195', () => {
      expect(classifyByBaseCode('195', '19')).toBe('airstrike');
    });

    it('returns ground_combat for base code 190', () => {
      expect(classifyByBaseCode('190', '19')).toBe('ground_combat');
    });

    it('returns ground_combat for base code 193', () => {
      expect(classifyByBaseCode('193', '19')).toBe('ground_combat');
    });

    it('returns shelling for base code 194', () => {
      expect(classifyByBaseCode('194', '19')).toBe('shelling');
    });

    it('returns bombing for base code 183', () => {
      expect(classifyByBaseCode('183', '18')).toBe('bombing');
    });

    it('returns assassination for base code 185', () => {
      expect(classifyByBaseCode('185', '18')).toBe('assassination');
    });

    it('returns abduction for base code 181', () => {
      expect(classifyByBaseCode('181', '18')).toBe('abduction');
    });

    it('returns assault for base code 180', () => {
      expect(classifyByBaseCode('180', '18')).toBe('assault');
    });

    it('returns blockade for base code 191', () => {
      expect(classifyByBaseCode('191', '19')).toBe('blockade');
    });

    it('returns ceasefire_violation for base code 196', () => {
      expect(classifyByBaseCode('196', '19')).toBe('ceasefire_violation');
    });

    it('returns mass_violence for base code 200', () => {
      expect(classifyByBaseCode('200', '20')).toBe('mass_violence');
    });

    it('returns wmd for base code 204', () => {
      expect(classifyByBaseCode('204', '20')).toBe('wmd');
    });

    it('falls back to assault for unmapped root 18 codes', () => {
      expect(classifyByBaseCode('187', '18')).toBe('assault');
    });

    it('falls back to ground_combat for unmapped root 19 codes', () => {
      expect(classifyByBaseCode('199', '19')).toBe('ground_combat');
    });

    it('falls back to mass_violence for unmapped root 20 codes', () => {
      expect(classifyByBaseCode('209', '20')).toBe('mass_violence');
    });

    it('falls back to assault for completely unknown codes', () => {
      expect(classifyByBaseCode('990', '99')).toBe('assault');
    });
  });

  describe('normalizeGdeltEvent', () => {
    it('produces correct ConflictEventEntity shape with gdelt- prefixed ID', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);

      expect(entity.id).toBe('gdelt-1234567890');
      expect(entity.type).toBe('ground_combat');
      expect(entity.lat).toBe(35.6892);
      expect(entity.lng).toBe(51.389);
      expect(entity.label).toBe('Tehran, Tehran, Iran: Conventional military force');
      expect(entity.data.eventType).toBe('Conventional military force');
      expect(entity.data.subEventType).toBe('CAMEO 190');
      expect(entity.data.fatalities).toBe(0);
      expect(entity.data.source).toBe('https://reuters.com/article/123');
      expect(entity.data.actor1).toBe('IRANIAN GOVERNMENT');
      expect(entity.data.actor2).toBe('IRAQ');
      expect(entity.data.notes).toBe('');
    });

    it('produces timestamp from YYYYMMDD SQLDATE', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);

      // 20260315 -> March 15, 2026 midnight UTC
      const date = new Date(entity.timestamp);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(2); // 0-indexed, March = 2
      expect(date.getUTCDate()).toBe(15);
    });

    it('handles empty SOURCEURL gracefully', () => {
      const cols = validIranMissileRow.split('\t');
      cols[60] = '';
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.source).toBe('');
    });

    it('passes through Actor1Name from column 6', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actor1).toBe('IRANIAN GOVERNMENT');
    });

    it('passes through Actor2Name from column 16', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actor2).toBe('IRAQ');
    });

    it('passes through GoldsteinScale as a number', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.goldsteinScale).toBe(-9.5);
      expect(typeof entity.data.goldsteinScale).toBe('number');
    });

    it('passes through ActionGeo_FullName as locationName', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.locationName).toBe('Tehran, Tehran, Iran');
    });

    it('passes through EventCode as cameoCode', () => {
      const cols = validIranMissileRow.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.cameoCode).toBe('190');
    });

    it('missing actor names default to empty string', () => {
      const row = makeGdeltRow({ 6: '', 16: '' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actor1).toBe('');
      expect(entity.data.actor2).toBe('');
    });

    it('invalid GoldsteinScale defaults to 0', () => {
      const row = makeGdeltRow({ 30: 'not-a-number' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.goldsteinScale).toBe(0);
    });

    it('includes numMentions and numSources when columns contain valid numbers', () => {
      const row = makeGdeltRow({ 31: '42', 32: '7' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.numMentions).toBe(42);
      expect(entity.data.numSources).toBe(7);
    });

    it('numMentions and numSources are undefined when columns are empty', () => {
      const row = makeGdeltRow({ 31: '', 32: '' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.numMentions).toBeUndefined();
      expect(entity.data.numSources).toBeUndefined();
    });

    it('numMentions and numSources are undefined when columns are non-numeric', () => {
      const row = makeGdeltRow({ 31: 'abc', 32: 'xyz' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.numMentions).toBeUndefined();
      expect(entity.data.numSources).toBeUndefined();
    });
  });

  describe('fetchEvents (integration)', () => {
    it('orchestrates fetch->unzip->parse->filter->normalize end-to-end', async () => {
      // Configure mock AdmZip to return our sample CSV
      mockGetEntries.mockReturnValue([
        {
          getData: () => Buffer.from(sampleCsv, 'utf8'),
        },
      ]);

      // 1. lastupdate.txt fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => sampleLastUpdate,
      });

      // 2. ZIP download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });

      const events = await fetchEvents();

      // Should get only the 2 valid Middle East conflict events
      expect(events).toHaveLength(2);

      // First event: Iran ground_combat (base code 190)
      expect(events[0].id).toBe('gdelt-1234567890');
      expect(events[0].type).toBe('ground_combat');
      expect(events[0].lat).toBe(35.6892);

      // Second event: Syria bombing (base code 183)
      expect(events[1].id).toBe('gdelt-9876543210');
      expect(events[1].type).toBe('bombing');
      expect(events[1].lat).toBe(33.5138);

      // Verify fetch was called twice (lastupdate + ZIP download)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws if ZIP download fails', async () => {
      // lastupdate.txt OK
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => sampleLastUpdate,
      });

      // ZIP download fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(fetchEvents()).rejects.toThrow('download failed');
    });
  });

  describe('ActionGeo_Type parsing', () => {
    it('parses ActionGeo_Type=4 and stores in entity.data.actionGeoType', () => {
      const row = makeGdeltRow({ 51: '4' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actionGeoType).toBe(4);
    });

    it('parses ActionGeo_Type=1 (country level)', () => {
      const row = makeGdeltRow({ 51: '1' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actionGeoType).toBe(1);
    });

    it('parses ActionGeo_Type=3 (city level)', () => {
      const row = makeGdeltRow({ 51: '3' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actionGeoType).toBe(3);
    });

    it('actionGeoType is undefined when column is empty', () => {
      const row = makeGdeltRow({ 51: '' });
      const cols = row.split('\t');
      const entity = normalizeGdeltEvent(cols, 35.6892, 51.389);
      expect(entity.data.actionGeoType).toBeUndefined();
    });
  });

  describe('config-driven thresholds', () => {
    it('uses config-driven CAMEO exclusions (respects eventExcludedCameo)', () => {
      // Default excludes 180 and 192. Override to only exclude 180.
      const origExcluded = mockConfig.eventExcludedCameo;
      mockConfig.eventExcludedCameo = ['180'];
      try {
        // Base code 192 should now be allowed
        const row = makeGdeltRow({
          0: '8080808080',
          26: '192',
          27: '192',
          28: '19',
        });
        const events = parseAndFilter(row);
        // 192 maps to blockade. With enough mentions/sources, it should pass.
        expect(events.length).toBeGreaterThanOrEqual(1);
      } finally {
        mockConfig.eventExcludedCameo = origExcluded;
      }
    });

    it('uses config-driven minSources threshold', () => {
      const origMin = mockConfig.eventMinSources;
      mockConfig.eventMinSources = 3;
      try {
        // Default row has NumSources=5, so it should still pass with minSources=3
        const row = makeGdeltRow({ 0: '9090909090', 32: '5' });
        const events = parseAndFilter(row);
        expect(events).toHaveLength(1);

        // But NumSources=2 should now be rejected (< 3)
        const row2 = makeGdeltRow({ 0: '9191919191', 32: '2' });
        const events2 = parseAndFilter(row2);
        expect(events2).toHaveLength(0);
      } finally {
        mockConfig.eventMinSources = origMin;
      }
    });

    it('applies centroid penalty for ActionGeo_Type 3 (reduces confidence)', () => {
      // Create a row at Tehran centroid with ActionGeo_Type=3
      const rowCentroid = makeGdeltRow({
        0: 'C1C1C1C1C1',
        51: '3', // ActionGeo_Type = city
        56: '35.6892',
        57: '51.3890',
      });
      // Same row without ActionGeo_Type (no penalty)
      const rowNoPenalty = makeGdeltRow({
        0: 'C2C2C2C2C2',
        51: '', // No ActionGeo_Type
        56: '35.6892',
        57: '51.3890',
      });

      const eventsCentroid = parseAndFilter(rowCentroid);
      const eventsNoPenalty = parseAndFilter(rowNoPenalty);

      // Both should pass (confidence still above threshold after penalty)
      expect(eventsCentroid).toHaveLength(1);
      expect(eventsNoPenalty).toHaveLength(1);

      // Centroid event should have lower confidence due to penalty
      expect(eventsCentroid[0].data.confidence!).toBeLessThan(
        eventsNoPenalty[0].data.confidence!,
      );
    });

    it('applies centroid penalty for ActionGeo_Type 4 (landmark)', () => {
      const row = makeGdeltRow({
        0: 'C3C3C3C3C3',
        51: '4', // ActionGeo_Type = landmark/feature
        56: '34.1234', // non-centroid coordinates
        57: '50.5678',
      });
      const rowNoPenalty = makeGdeltRow({
        0: 'C4C4C4C4C4',
        51: '',
        56: '34.1234',
        57: '50.5678',
      });

      const eventsType4 = parseAndFilter(row);
      const eventsNoPenalty = parseAndFilter(rowNoPenalty);

      if (eventsType4.length > 0 && eventsNoPenalty.length > 0) {
        expect(eventsType4[0].data.confidence!).toBeLessThan(
          eventsNoPenalty[0].data.confidence!,
        );
      }
    });

    it('does not apply centroid penalty for ActionGeo_Type 1 (country level)', () => {
      const row1 = makeGdeltRow({
        0: 'C5C5C5C5C5',
        51: '1', // country level - no penalty
        56: '34.1234',
        57: '50.5678',
      });
      const row2 = makeGdeltRow({
        0: 'C6C6C6C6C6',
        51: '', // no type
        56: '34.1234',
        57: '50.5678',
      });

      const events1 = parseAndFilter(row1);
      const events2 = parseAndFilter(row2);

      if (events1.length > 0 && events2.length > 0) {
        // Same confidence (no penalty applied for type 1)
        expect(events1[0].data.confidence!).toBeCloseTo(
          events2[0].data.confidence!,
          10,
        );
      }
    });
  });

  describe('dispersion integration', () => {
    it('centroid events with ActionGeo_Type=3 get dispersion applied', () => {
      // Two events at Tehran with ActionGeo_Type=3
      const row1 = makeGdeltRow({
        0: 'D1D1D1D1D1',
        51: '3',
        56: '35.6892',
        57: '51.3890',
      });
      const row2 = makeGdeltRow({
        0: 'D2D2D2D2D2',
        1: '20260316', // Different date to avoid dedup
        51: '3',
        56: '35.6892',
        57: '51.3890',
      });

      const events = parseAndFilter([row1, row2].join('\n'));

      // Both should pass filtering
      expect(events).toHaveLength(2);

      // Both should have originalLat/originalLng set (dispersed)
      const dispersedEvents = events.filter(
        (e) => e.data.originalLat !== undefined,
      );
      expect(dispersedEvents).toHaveLength(2);

      // Original coordinates should be Tehran
      for (const e of dispersedEvents) {
        expect(e.data.originalLat).toBeCloseTo(35.6892, 3);
        expect(e.data.originalLng).toBeCloseTo(51.389, 3);
      }

      // Events should have different lat/lng (dispersed to different slots)
      expect(events[0].lat).not.toBe(events[1].lat);
    });

    it('non-centroid events are not dispersed (no originalLat/originalLng)', () => {
      const row = makeGdeltRow({
        0: 'D3D3D3D3D3',
        51: '2', // state level - not dispersed
        56: '34.1234',
        57: '50.5678',
      });

      const events = parseAndFilter(row);
      expect(events).toHaveLength(1);
      expect(events[0].data.originalLat).toBeUndefined();
      expect(events[0].lat).toBe(34.1234);
    });
  });

  describe('Bellingcat corroboration pipeline', () => {
    it('parseAndFilter with no bellingcatArticles arg works identically to before (backward compat)', () => {
      const events = parseAndFilter(validIranMissileRow);
      expect(events).toHaveLength(1);
      // Confidence should be set but not boosted
      expect(events[0].data.confidence).toBeDefined();
      expect(events[0].data.confidence!).toBeLessThanOrEqual(1.0);
    });

    it('parseAndFilter with matching Bellingcat article boosts event confidence by 0.2', () => {
      // Event is at Tehran (35.6892, 51.3890), locationName "Tehran, Tehran, Iran"
      const articles = [{
        title: 'Investigation reveals Tehran Iran military site activity',
        url: 'https://www.bellingcat.com/article/1',
        publishedAt: Date.UTC(2026, 2, 15, 12), // Same day as SQLDATE (20260315)
        lat: 35.6892,
        lng: 51.3890,
      }];

      const eventsWithout = parseAndFilter(validIranMissileRow);
      const eventsWith = parseAndFilter(validIranMissileRow, articles);

      expect(eventsWithout).toHaveLength(1);
      expect(eventsWith).toHaveLength(1);

      const confidenceWithout = eventsWithout[0].data.confidence!;
      const confidenceWith = eventsWith[0].data.confidence!;

      // Boosted confidence should be higher by the configured boost amount (0.2)
      expect(confidenceWith).toBeCloseTo(
        Math.min(1.0, confidenceWithout + mockConfig.bellingcatCorroborationBoost),
        5,
      );
    });

    it('parseAndFilter with non-matching Bellingcat articles does not boost confidence', () => {
      // Article is nowhere near the event
      const articles = [{
        title: 'Unrelated investigation in London',
        url: 'https://www.bellingcat.com/article/2',
        publishedAt: Date.UTC(2026, 2, 15),
        lat: 51.5074,
        lng: -0.1278,
      }];

      const eventsWithout = parseAndFilter(validIranMissileRow);
      const eventsWith = parseAndFilter(validIranMissileRow, articles);

      expect(eventsWithout).toHaveLength(1);
      expect(eventsWith).toHaveLength(1);

      // Confidence should be identical (no boost applied)
      expect(eventsWith[0].data.confidence).toBeCloseTo(
        eventsWithout[0].data.confidence!,
        5,
      );
    });

    it('confidence is clamped to 1.0 max after boost', () => {
      // Create a high-confidence event row with very high signals
      const highSignalRow = makeGdeltRow({
        0: 'BC_CLAMP_TEST',
        6: 'ISRAEL',
        7: 'ISR',
        16: 'IRAN',
        17: 'IRN',
        26: '195',
        27: '195',
        28: '19',
        30: '-10',
        31: '100',
        32: '50',
        52: 'Tehran, Tehran, Iran',
        53: 'IR',
        56: '35.6892',
        57: '51.3890',
      });

      // Matching article
      const articles = [{
        title: 'Tehran Iran conflict investigation',
        url: 'https://www.bellingcat.com/article/3',
        publishedAt: Date.UTC(2026, 2, 15, 12),
        lat: 35.6892,
        lng: 51.3890,
      }];

      const events = parseAndFilter(highSignalRow, articles);
      expect(events).toHaveLength(1);
      expect(events[0].data.confidence!).toBeLessThanOrEqual(1.0);
    });

    it('parseAndFilter with empty bellingcatArticles array applies no boost', () => {
      const eventsWithout = parseAndFilter(validIranMissileRow);
      const eventsWith = parseAndFilter(validIranMissileRow, []);

      expect(eventsWithout).toHaveLength(1);
      expect(eventsWith).toHaveLength(1);

      expect(eventsWith[0].data.confidence).toBeCloseTo(
        eventsWithout[0].data.confidence!,
        5,
      );
    });
  });
});
