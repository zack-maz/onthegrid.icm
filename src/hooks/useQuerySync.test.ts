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
  extractTags,
  deriveTogglesFromAST,
  deriveFiltersFromAST,
  buildASTFromToggles,
} from '@/hooks/useQuerySync';
import { serialize } from '@/lib/querySerializer';

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

  it('type:flight (non-conflict) does NOT set showEvents to true', () => {
    const ast = parse('type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showEvents']).toBe(false);
  });

  it('no conflict event type tags -> showEvents false', () => {
    const ast = parse('type:flight type:ship');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showEvents']).toBe(false);
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

  it('deactivates toggles for absent type: values', () => {
    const ast = parse('type:flight');
    const updates = deriveTogglesFromAST(ast);
    expect(updates['showShips']).toBe(false);
    expect(updates['showAirstrikes']).toBe(false);
    expect(updates['showGroundCombat']).toBe(false);
    expect(updates['showTargeted']).toBe(false);
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
});

// ─── buildASTFromToggles ─────────────────────────────────────

describe('buildASTFromToggles', () => {
  it('showFlights ON adds type:flight to AST', () => {
    const ast = buildASTFromToggles(
      {
        showFlights: true,
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
      },
      null,
    );
    expect(ast).not.toBeNull();
    const str = serialize(ast);
    expect(str).toContain('type:flight');
  });

  it('showFlights OFF does not add type:flight', () => {
    const ast = buildASTFromToggles(
      {
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
      },
      null,
    );
    expect(ast).toBeNull();
  });

  it('preserves non-synced tags (callsign:, actor:)', () => {
    const existingAST = parse('type:flight callsign:IRA123');
    const ast = buildASTFromToggles(
      {
        showFlights: true,
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
      },
      existingAST,
    );
    const str = serialize(ast);
    expect(str).toContain('type:flight');
    expect(str).toContain('callsign:IRA123');
  });

  it('preserves text nodes during toggle sync', () => {
    const existingAST = parse('type:flight iran');
    const ast = buildASTFromToggles(
      {
        showFlights: true,
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
      },
      existingAST,
    );
    const str = serialize(ast);
    expect(str).toContain('iran');
  });

  it('site toggle ON adds site: tag', () => {
    const ast = buildASTFromToggles(
      {
        showFlights: false,
        showShips: false,
        showAirstrikes: false,
        showGroundCombat: false,
        showTargeted: false,
        showNuclear: true,
        showNaval: false,
        showOil: false,
        showAirbase: false,
        showDesalination: false,
        showPort: false,
      },
      null,
    );
    const str = serialize(ast);
    expect(str).toContain('site:nuclear');
  });
});

// ─── Sync loop prevention ────────────────────────────────────

describe('sync loop prevention', () => {
  it('deriveTogglesFromAST and buildASTFromToggles are stable (no infinite expansion)', () => {
    // Start with a query, derive toggles, rebuild AST, re-derive toggles
    const ast1 = parse('type:flight type:airstrike');
    const toggles1 = deriveTogglesFromAST(ast1);

    // Rebuild AST from toggles
    const ast2 = buildASTFromToggles(toggles1, null);
    const toggles2 = deriveTogglesFromAST(ast2);

    // Should be stable: toggles1 === toggles2
    expect(toggles2['showFlights']).toBe(toggles1['showFlights']);
    expect(toggles2['showAirstrikes']).toBe(toggles1['showAirstrikes']);
    expect(toggles2['showEvents']).toBe(toggles1['showEvents']);

    // One more round
    const ast3 = buildASTFromToggles(toggles2, null);
    const toggles3 = deriveTogglesFromAST(ast3);
    expect(toggles3).toEqual(toggles2);
  });

  it('round-trip preserves non-synced tags without growth', () => {
    const originalAST = parse('type:flight callsign:IRA123');
    const toggles = deriveTogglesFromAST(originalAST);

    const rebuilt1 = buildASTFromToggles(toggles, originalAST);
    const str1 = serialize(rebuilt1);

    const rebuilt2 = buildASTFromToggles(toggles, rebuilt1);
    const str2 = serialize(rebuilt2);

    // String shouldn't grow between iterations
    expect(str2).toBe(str1);
  });
});
