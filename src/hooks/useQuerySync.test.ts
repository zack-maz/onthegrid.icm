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
  TYPE_TOGGLE_MAP,
  TOGGLE_TYPE_MAP,
  SITE_TOGGLE_MAP,
  BOOL_TAG_MAP,
  extractTags,
  deriveTogglesFromAST,
  deriveFiltersFromAST,
  buildASTFromToggles,
  rangeToMinMax,
  minMaxToRangeValue,
  type SyncableState,
} from '@/hooks/useQuerySync';
import { serialize } from '@/lib/querySerializer';

// Helper: default syncable state with everything OFF/null
const DEFAULT_STATE: SyncableState = {
  showFlights: false,
  showShips: false,
  showAirstrikes: false,
  showGroundCombat: false,
  showTargeted: false,
  showNuclear: false,
  showNaval: false,
  showOil: false,
  showAirbase: false,
  showDesalination: false,
  showPort: false,
  showGroundTraffic: false,
  pulseEnabled: false,
  showHitOnly: false,
  altitudeMin: null,
  altitudeMax: null,
  flightSpeedMin: null,
  flightSpeedMax: null,
};

// ─── TYPE_TOGGLE_MAP coverage ────────────────────────────────

describe('TYPE_TOGGLE_MAP coverage', () => {
  it('maps all 11 ConflictEventType values from CONFLICT_TOGGLE_GROUPS', () => {
    const allConflictTypes = [
      'airstrike',
      'ground_combat',
      'shelling',
      'bombing',
      'assault',
      'blockade',
      'ceasefire_violation',
      'mass_violence',
      'wmd',
      'assassination',
      'abduction',
    ];
    for (const ct of allConflictTypes) {
      expect(TYPE_TOGGLE_MAP).toHaveProperty(ct);
    }
  });

  it('maps flight and ship types', () => {
    expect(TYPE_TOGGLE_MAP['flight']).toBe('showFlights');
    expect(TYPE_TOGGLE_MAP['ship']).toBe('showShips');
  });
});

// ─── extractTags ─────────────────────────────────────────────

describe('extractTags', () => {
  it('extracts tags from simple tag node', () => {
    const ast = parse('type:flight');
    const tags = extractTags(ast);
    expect(tags).toEqual([{ prefix: 'type', value: 'flight', negated: false }]);
  });

  it('extracts multiple tags from AND chain', () => {
    const ast = parse('type:flight country:iran');
    const tags = extractTags(ast);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ prefix: 'type', value: 'flight', negated: false });
    expect(tags[1]).toEqual({ prefix: 'country', value: 'iran', negated: false });
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

// ─── deriveTogglesFromAST ────────────────────────────────────

describe('deriveTogglesFromAST', () => {
  it('type:flight activates showFlights', () => {
    const ast = parse('type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(true);
  });

  it('type:airstrike activates showAirstrikes AND showEvents', () => {
    const ast = parse('type:airstrike');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showAirstrikes']).toBe(true);
    expect(updates['showEvents']).toBe(true);
  });

  it('type:wmd activates showGroundCombat AND showEvents', () => {
    const ast = parse('type:wmd');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showGroundCombat']).toBe(true);
    expect(updates['showEvents']).toBe(true);
  });

  it('type:assassination activates showTargeted AND showEvents', () => {
    const ast = parse('type:assassination');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showTargeted']).toBe(true);
    expect(updates['showEvents']).toBe(true);
  });

  it('type:flight (non-conflict) does NOT set showEvents', () => {
    const ast = parse('type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showEvents']).toBeUndefined();
  });

  it('no conflict event type tags -> showEvents not set (preserves current state)', () => {
    const ast = parse('type:flight type:ship');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showEvents']).toBeUndefined();
  });

  it('site:nuclear activates showNuclear and showSites', () => {
    const ast = parse('site:nuclear');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showNuclear']).toBe(true);
    expect(updates['showSites']).toBe(true);
  });

  it('text-only query returns empty updates (no toggle changes)', () => {
    const ast = parse('iran');
    const updates = deriveTogglesFromAST(ast);
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it('only activates mentioned toggles, does not deactivate absent ones', () => {
    const ast = parse('type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(true);
    // Absent types should NOT be set at all (preserves existing toggle state)
    expect(updates['showShips']).toBeUndefined();
    expect(updates['showAirstrikes']).toBeUndefined();
    expect(updates['showGroundCombat']).toBeUndefined();
    expect(updates['showTargeted']).toBeUndefined();
  });

  // ── Boolean tag sync ──

  it('ground:true activates showGroundTraffic', () => {
    const ast = parse('ground:true');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showGroundTraffic']).toBe(true);
  });

  it('ground:false deactivates showGroundTraffic', () => {
    const ast = parse('ground:false');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showGroundTraffic']).toBe(false);
  });

  it('unidentified:true activates pulseEnabled', () => {
    const ast = parse('unidentified:true');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['pulseEnabled']).toBe(true);
  });

  it('status:attacked activates showHitOnly', () => {
    const ast = parse('status:attacked');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showHitOnly']).toBe(true);
  });

  it('status:healthy deactivates showHitOnly', () => {
    const ast = parse('status:healthy');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showHitOnly']).toBe(false);
  });

  it('boolean tags work alongside type tags', () => {
    const ast = parse('type:flight ground:true');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(true);
    expect(updates['showGroundTraffic']).toBe(true);
  });

  it('boolean tags alone return updates even without type/site tags', () => {
    const ast = parse('ground:true');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showGroundTraffic']).toBe(true);
    // No type/site keys should be set
    expect(updates['showFlights']).toBeUndefined();
  });

  // ── Negated tag sync ──

  it('!site: (wildcard) turns off all site toggles', () => {
    const ast = parse('!site:');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showNuclear']).toBe(false);
    expect(updates['showNaval']).toBe(false);
    expect(updates['showOil']).toBe(false);
    expect(updates['showAirbase']).toBe(false);
    expect(updates['showDesalination']).toBe(false);
    expect(updates['showPort']).toBe(false);
    expect(updates['showSites']).toBe(false);
  });

  it('!site:nuclear enables all sites except nuclear', () => {
    const ast = parse('!site:nuclear');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showSites']).toBe(true);
    expect(updates['showNuclear']).toBe(false);
    expect(updates['showNaval']).toBe(true);
    expect(updates['showOil']).toBe(true);
    expect(updates['showAirbase']).toBe(true);
    expect(updates['showDesalination']).toBe(true);
    expect(updates['showPort']).toBe(true);
  });

  it('!type: (wildcard) turns off all type toggles and showEvents', () => {
    const ast = parse('!type:');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(false);
    expect(updates['showShips']).toBe(false);
    expect(updates['showAirstrikes']).toBe(false);
    expect(updates['showGroundCombat']).toBe(false);
    expect(updates['showTargeted']).toBe(false);
    expect(updates['showEvents']).toBe(false);
  });

  it('!type:flight enables all types except flights', () => {
    const ast = parse('!type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(false);
    expect(updates['showShips']).toBe(true);
    expect(updates['showAirstrikes']).toBe(true);
    expect(updates['showGroundCombat']).toBe(true);
    expect(updates['showTargeted']).toBe(true);
    expect(updates['showEvents']).toBe(true);
  });

  it('positive and negated tags can coexist', () => {
    const ast = parse('type:flight !site:');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showFlights']).toBe(true);
    expect(updates['showSites']).toBe(false);
    expect(updates['showNuclear']).toBe(false);
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
    expect(filters.countries).toEqual(['iran']);
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

// ─── buildASTFromToggles ─────────────────────────────────────

describe('buildASTFromToggles', () => {
  it('showFlights ON adds type:flight to AST', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, null);
    expect(ast).not.toBeNull();
    const str = serialize(ast);
    expect(str).toContain('type:flight');
  });

  it('showFlights OFF does not add type:flight', () => {
    const ast = buildASTFromToggles(DEFAULT_STATE, null);
    expect(ast).toBeNull();
  });

  it('preserves non-synced tags (callsign:, actor:)', () => {
    const existingAST = parse('type:flight callsign:IRA123');
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, existingAST);
    const str = serialize(ast);
    expect(str).toContain('type:flight');
    expect(str).toContain('callsign:IRA123');
  });

  it('preserves text nodes during toggle sync', () => {
    const existingAST = parse('type:flight iran');
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, existingAST);
    const str = serialize(ast);
    expect(str).toContain('iran');
  });

  it('site toggle ON adds site: tag', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showNuclear: true }, null);
    const str = serialize(ast);
    expect(str).toContain('site:nuclear');
  });

  // ── Boolean tag (bidirectional) ──

  it('showHitOnly ON adds status:attacked to AST', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showHitOnly: true }, null);
    const str = serialize(ast);
    expect(str).toContain('status:attacked');
  });

  it('showHitOnly OFF does not add status: tag', () => {
    const ast = buildASTFromToggles(DEFAULT_STATE, null);
    expect(ast).toBeNull();
  });

  // ── Bidirectional boolean tags rebuilt from toggle state ──

  it('ground:true rebuilt when showGroundTraffic ON', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true, showGroundTraffic: true }, null);
    const str = serialize(ast);
    expect(str).toContain('ground:true');
  });

  it('ground:true absent when showGroundTraffic OFF', () => {
    const existingAST = parse('type:flight ground:true');
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, existingAST);
    const str = serialize(ast);
    expect(str).not.toContain('ground');
  });

  it('unidentified:true rebuilt when pulseEnabled ON', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true, pulseEnabled: true }, null);
    const str = serialize(ast);
    expect(str).toContain('unidentified:true');
  });

  // ── Range filter tags ──

  it('altitude range adds altitude tag to AST', () => {
    const ast = buildASTFromToggles(
      { ...DEFAULT_STATE, showFlights: true, altitudeMin: 30000, altitudeMax: null },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('altitude:>=30000');
  });

  it('altitude min+max adds range tag', () => {
    const ast = buildASTFromToggles(
      { ...DEFAULT_STATE, showFlights: true, altitudeMin: 10000, altitudeMax: 40000 },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('altitude:10000-40000');
  });

  it('speed range adds speed tag to AST', () => {
    const ast = buildASTFromToggles(
      { ...DEFAULT_STATE, showFlights: true, flightSpeedMin: 200, flightSpeedMax: 500 },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('speed:200-500');
  });

  it('null altitude/speed does not add range tags', () => {
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, null);
    const str = serialize(ast);
    expect(str).not.toContain('altitude');
    expect(str).not.toContain('speed');
  });

  it('status:attacked is rebuilt from showHitOnly (not preserved as non-synced)', () => {
    const existingAST = parse('type:flight status:attacked');
    // showHitOnly OFF → status:attacked should be removed
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, existingAST);
    const str = serialize(ast);
    expect(str).not.toContain('status');
  });

  it('altitude tag is rebuilt from filter state (not preserved as non-synced)', () => {
    const existingAST = parse('type:flight altitude:>=30000');
    // altitudeMin is null → altitude tag should be removed
    const ast = buildASTFromToggles({ ...DEFAULT_STATE, showFlights: true }, existingAST);
    const str = serialize(ast);
    expect(str).not.toContain('altitude');
  });
});

// ─── Sync loop prevention ────────────────────────────────────

describe('sync loop prevention', () => {
  it('deriveTogglesFromAST and buildASTFromToggles are stable (no infinite expansion)', () => {
    const ast1 = parse('type:flight type:airstrike');
    const toggles1 = deriveTogglesFromAST(ast1);

    const ast2 = buildASTFromToggles({ ...DEFAULT_STATE, ...toggles1 }, null);
    const toggles2 = deriveTogglesFromAST(ast2);

    expect(toggles2['showFlights']).toBe(toggles1['showFlights']);
    expect(toggles2['showAirstrikes']).toBe(toggles1['showAirstrikes']);
    expect(toggles2['showEvents']).toBe(toggles1['showEvents']);

    const ast3 = buildASTFromToggles({ ...DEFAULT_STATE, ...toggles2 }, null);
    const toggles3 = deriveTogglesFromAST(ast3);
    expect(toggles3).toEqual(toggles2);
  });

  it('round-trip preserves non-synced tags without growth', () => {
    const originalAST = parse('type:flight callsign:IRA123');
    const toggles = deriveTogglesFromAST(originalAST);

    const rebuilt1 = buildASTFromToggles({ ...DEFAULT_STATE, ...toggles }, originalAST);
    const str1 = serialize(rebuilt1);

    const rebuilt2 = buildASTFromToggles({ ...DEFAULT_STATE, ...toggles }, rebuilt1);
    const str2 = serialize(rebuilt2);

    expect(str2).toBe(str1);
  });

  it('round-trip with boolean and range tags is stable', () => {
    const originalAST = parse('type:flight ground:true altitude:>=30000 status:attacked');
    const toggles = deriveTogglesFromAST(originalAST);
    const filters = deriveFiltersFromAST(originalAST, Date.now());

    const state: SyncableState = {
      ...DEFAULT_STATE,
      ...toggles,
      altitudeMin: filters.altitudeMin ?? null,
      altitudeMax: filters.altitudeMax ?? null,
      flightSpeedMin: filters.flightSpeedMin ?? null,
      flightSpeedMax: filters.flightSpeedMax ?? null,
    };

    const rebuilt1 = buildASTFromToggles(state, originalAST);
    const str1 = serialize(rebuilt1);

    const rebuilt2 = buildASTFromToggles(state, rebuilt1);
    const str2 = serialize(rebuilt2);

    expect(str2).toBe(str1);
    // ground:true should be preserved (non-synced, one-way)
    expect(str1).toContain('ground:true');
    // status:attacked should be present (bidirectional, rebuilt from showHitOnly)
    expect(str1).toContain('status:attacked');
    // altitude should be present (bidirectional, rebuilt from filter state)
    expect(str1).toContain('altitude:>=30000');
  });
});
