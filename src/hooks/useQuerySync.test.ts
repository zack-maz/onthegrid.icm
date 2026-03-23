import { describe, expect, it, vi } from 'vitest';

// Mock localStorage before importing stores
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

import { parse } from '@/lib/queryParser';
import {
  extractTags,
  deriveFiltersFromAST,
  buildASTFromFilters,
  rangeToMinMax,
  minMaxToRangeValue,
  type SyncableState,
} from '@/hooks/useQuerySync';
import { serialize } from '@/lib/querySerializer';

// Helper: default syncable state with everything null/empty
const DEFAULT_STATE: SyncableState = {
  altitudeMin: null,
  altitudeMax: null,
  flightSpeedMin: null,
  flightSpeedMax: null,
  flightCallsign: '',
  flightIcao: '',
  shipMmsi: '',
  shipNameFilter: '',
  cameoCode: '',
  mentionsMin: null,
  mentionsMax: null,
  headingAngle: null,
  showHighSeverity: true,
  showMediumSeverity: true,
  showLowSeverity: true,
  flightCountries: [],
  eventCountries: [],
  proximityPin: null,
};

// ─── extractTags ─────────────────────────────────────────────

describe('extractTags', () => {
  it('extracts tags from simple tag node', () => {
    const ast = parse('type:flight');
    const tags = extractTags(ast);
    expect(tags).toEqual([{ prefix: 'type', value: 'flight' }]);
  });

  it('extracts multiple tags from OR chain', () => {
    const ast = parse('type:flight country:iran');
    const tags = extractTags(ast);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ prefix: 'type', value: 'flight' });
    expect(tags[1]).toEqual({ prefix: 'country', value: 'iran' });
  });

  it('returns empty for text-only query', () => {
    const ast = parse('iran');
    const tags = extractTags(ast);
    expect(tags).toEqual([]);
  });

  it('returns empty for null AST', () => {
    expect(extractTags(null)).toEqual([]);
  });
});

// ─── deriveFiltersFromAST ────────────────────────────────────

describe('deriveFiltersFromAST', () => {
  const NOW = new Date('2026-03-22T12:00:00Z').getTime();

  it('since: tag syncs to dateStart', () => {
    const ast = parse('since:6h');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.dateStart).toBeDefined();
    // 6 hours before NOW
    expect(filters.dateStart).toBe(NOW - 6 * 3_600_000);
  });

  it('before: tag syncs to dateEnd', () => {
    const ast = parse('before:24h');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.dateEnd).toBeDefined();
    expect(filters.dateEnd).toBe(NOW - 24 * 3_600_000);
  });

  it('country: tags extracted', () => {
    const ast = parse('country:iran');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.flightCountries).toEqual(['iran']);
    expect(filters.eventCountries).toEqual(['iran']);
  });

  it('no temporal tags returns no dateStart/dateEnd', () => {
    const ast = parse('type:flight');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.dateStart).toBeUndefined();
    expect(filters.dateEnd).toBeUndefined();
  });

  // ── Range tag sync ──

  it('altitude:>=30000 syncs to altitudeMin', () => {
    const ast = parse('altitude:>=30000');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.altitudeMin).toBe(30000);
    expect(filters.altitudeMax).toBeNull();
  });

  it('altitude:<=10000 syncs to altitudeMax', () => {
    const ast = parse('altitude:<=10000');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.altitudeMin).toBeNull();
    expect(filters.altitudeMax).toBe(10000);
  });

  it('altitude:10000-40000 syncs to altitudeMin and altitudeMax', () => {
    const ast = parse('altitude:10000-40000');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.altitudeMin).toBe(10000);
    expect(filters.altitudeMax).toBe(40000);
  });

  it('speed:>=200 syncs to flightSpeedMin', () => {
    const ast = parse('speed:>=200');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.flightSpeedMin).toBe(200);
    expect(filters.flightSpeedMax).toBeNull();
  });

  it('speed:100-500 syncs to flightSpeedMin and flightSpeedMax', () => {
    const ast = parse('speed:100-500');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.flightSpeedMin).toBe(100);
    expect(filters.flightSpeedMax).toBe(500);
  });

  it('no range tags returns no altitude/speed', () => {
    const ast = parse('type:flight');
    const filters = deriveFiltersFromAST(ast, NOW);
    expect(filters.altitudeMin).toBeUndefined();
    expect(filters.altitudeMax).toBeUndefined();
    expect(filters.flightSpeedMin).toBeUndefined();
    expect(filters.flightSpeedMax).toBeUndefined();
  });
});

// ─── rangeToMinMax / minMaxToRangeValue ──────────────────────

describe('range helpers', () => {
  it('rangeToMinMax: >=30000', () => {
    expect(rangeToMinMax('>=30000')).toEqual({ min: 30000, max: null });
  });

  it('rangeToMinMax: <=10000', () => {
    expect(rangeToMinMax('<=10000')).toEqual({ min: null, max: 10000 });
  });

  it('rangeToMinMax: 5000-40000', () => {
    expect(rangeToMinMax('5000-40000')).toEqual({ min: 5000, max: 40000 });
  });

  it('rangeToMinMax: invalid returns null/null', () => {
    expect(rangeToMinMax('abc')).toEqual({ min: null, max: null });
  });

  it('minMaxToRangeValue: both set', () => {
    expect(minMaxToRangeValue(5000, 40000)).toBe('5000-40000');
  });

  it('minMaxToRangeValue: min only', () => {
    expect(minMaxToRangeValue(30000, null)).toBe('>=30000');
  });

  it('minMaxToRangeValue: max only', () => {
    expect(minMaxToRangeValue(null, 10000)).toBe('<=10000');
  });

  it('minMaxToRangeValue: both null', () => {
    expect(minMaxToRangeValue(null, null)).toBeNull();
  });
});

// ─── buildASTFromFilters ─────────────────────────────────────

describe('buildASTFromFilters', () => {
  it('preserves text nodes during filter sync', () => {
    const existingAST = parse('type:flight iran');
    const ast = buildASTFromFilters(DEFAULT_STATE, existingAST);
    const str = serialize(ast);
    expect(str).toContain('iran');
    // type: is not a synced prefix, so it's preserved as non-synced
    expect(str).toContain('type:flight');
  });

  it('altitude range adds altitude tag to AST', () => {
    const ast = buildASTFromFilters(
      { ...DEFAULT_STATE, altitudeMin: 30000, altitudeMax: null },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('altitude:>=30000');
  });

  it('altitude min+max adds range tag', () => {
    const ast = buildASTFromFilters(
      { ...DEFAULT_STATE, altitudeMin: 10000, altitudeMax: 40000 },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('altitude:10000-40000');
  });

  it('speed range adds speed tag to AST', () => {
    const ast = buildASTFromFilters(
      { ...DEFAULT_STATE, flightSpeedMin: 200, flightSpeedMax: 500 },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('speed:200-500');
  });

  it('null altitude/speed does not add range tags', () => {
    const ast = buildASTFromFilters(DEFAULT_STATE, null);
    // With no filters set, no tags should be generated
    expect(ast).toBeNull();
  });

  it('status: prefix is preserved as non-synced text', () => {
    const existingAST = parse('type:flight status:attacked');
    const ast = buildASTFromFilters(DEFAULT_STATE, existingAST);
    const str = serialize(ast);
    // status: is not in SYNCED_PREFIXES, so it's preserved as non-synced
    expect(str).toContain('status:attacked');
  });

  it('altitude tag is rebuilt from filter state (not preserved as non-synced)', () => {
    const existingAST = parse('type:flight altitude:>=30000');
    // altitudeMin is null -> altitude tag should be removed
    const ast = buildASTFromFilters(DEFAULT_STATE, existingAST);
    const str = serialize(ast);
    expect(str).not.toContain('altitude');
  });
});

// ─── Sync loop prevention ────────────────────────────────────

describe('sync loop prevention', () => {
  it('round-trip preserves non-synced tags without growth', () => {
    const originalAST = parse('type:flight iran');
    const filters = deriveFiltersFromAST(originalAST, Date.now());

    const state: SyncableState = {
      ...DEFAULT_STATE,
      altitudeMin: filters.altitudeMin ?? null,
      altitudeMax: filters.altitudeMax ?? null,
      flightSpeedMin: filters.flightSpeedMin ?? null,
      flightSpeedMax: filters.flightSpeedMax ?? null,
    };

    const rebuilt1 = buildASTFromFilters(state, originalAST);
    const str1 = serialize(rebuilt1);

    const rebuilt2 = buildASTFromFilters(state, rebuilt1);
    const str2 = serialize(rebuilt2);

    expect(str2).toBe(str1);
  });

  it('round-trip with range tags is stable', () => {
    const originalAST = parse('type:flight altitude:>=30000');
    const filters = deriveFiltersFromAST(originalAST, Date.now());

    const state: SyncableState = {
      ...DEFAULT_STATE,
      altitudeMin: filters.altitudeMin ?? null,
      altitudeMax: filters.altitudeMax ?? null,
      flightSpeedMin: filters.flightSpeedMin ?? null,
      flightSpeedMax: filters.flightSpeedMax ?? null,
    };

    const rebuilt1 = buildASTFromFilters(state, originalAST);
    const str1 = serialize(rebuilt1);

    const rebuilt2 = buildASTFromFilters(state, rebuilt1);
    const str2 = serialize(rebuilt2);

    expect(str2).toBe(str1);
    // type:flight should be preserved as non-synced tag
    expect(str1).toContain('type:flight');
    // altitude should be present (bidirectional, rebuilt from filter state)
    expect(str1).toContain('altitude:>=30000');
  });
});
