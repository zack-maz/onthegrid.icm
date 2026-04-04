// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifyWaterType, normalizeWaterElement, isPriorityCountry, isNotable } from '../../adapters/overpass-water.js';
import type { WaterStressIndicators } from '../../types.js';

describe('classifyWaterType', () => {
  it('returns "dam" for waterway=dam', () => {
    expect(classifyWaterType({ waterway: 'dam' })).toBe('dam');
  });

  it('returns "reservoir" for natural=water + water=reservoir', () => {
    expect(classifyWaterType({ natural: 'water', water: 'reservoir' })).toBe('reservoir');
  });

  it('returns "treatment_plant" for man_made=water_works', () => {
    expect(classifyWaterType({ man_made: 'water_works' })).toBe('treatment_plant');
  });

  it('returns "desalination" for man_made=desalination_plant', () => {
    expect(classifyWaterType({ man_made: 'desalination_plant' })).toBe('desalination');
  });

  it('returns "desalination" for water_works=desalination', () => {
    expect(classifyWaterType({ water_works: 'desalination' })).toBe('desalination');
  });

  it('returns null for unrelated tags', () => {
    expect(classifyWaterType({ highway: 'primary' })).toBeNull();
  });

  it('returns null for canal tags (not a facility type)', () => {
    expect(classifyWaterType({ waterway: 'canal' })).toBeNull();
  });
});

describe('isPriorityCountry', () => {
  it('returns true for coords near Israel (31.0, 34.9)', () => {
    expect(isPriorityCountry(31.0, 34.9)).toBe(true);
  });

  it('returns true for coords near Iraq (33.2, 43.7)', () => {
    expect(isPriorityCountry(33.2, 43.7)).toBe(true);
  });

  it('returns true for coords near Iran (32.4, 53.7)', () => {
    expect(isPriorityCountry(32.4, 53.7)).toBe(true);
  });

  it('returns true for coords near Afghanistan (33.9, 67.7)', () => {
    expect(isPriorityCountry(33.9, 67.7)).toBe(true);
  });

  it('returns true for coords near Jordan (31.2, 36.5)', () => {
    expect(isPriorityCountry(31.2, 36.5)).toBe(true);
  });

  it('returns true for coords near Lebanon (33.9, 35.9)', () => {
    expect(isPriorityCountry(33.9, 35.9)).toBe(true);
  });

  it('returns true for coords near Syria (35.0, 38.0)', () => {
    expect(isPriorityCountry(35.0, 38.0)).toBe(true);
  });

  it('returns false for coords near Saudi Arabia (23.9, 45.1)', () => {
    expect(isPriorityCountry(23.9, 45.1)).toBe(false);
  });

  it('returns false for coords near UAE (23.4, 53.8)', () => {
    expect(isPriorityCountry(23.4, 53.8)).toBe(false);
  });

  it('returns false for coords near Kuwait (29.3, 47.5)', () => {
    expect(isPriorityCountry(29.3, 47.5)).toBe(false);
  });

  it('returns false for coords near Egypt (26.8, 30.8)', () => {
    expect(isPriorityCountry(26.8, 30.8)).toBe(false);
  });
});

describe('isNotable', () => {
  it('returns true for tags with wikidata', () => {
    expect(isNotable({ name: 'Test Dam', wikidata: 'Q12345' })).toBe(true);
  });

  it('returns true for tags with wikipedia', () => {
    expect(isNotable({ name: 'Test Dam', wikipedia: 'en:Test Dam' })).toBe(true);
  });

  it('returns true for tags with wikipedia:en', () => {
    expect(isNotable({ name: 'Test Dam', 'wikipedia:en': 'Test Dam' })).toBe(true);
  });

  it('returns false for tags with only name (no wikidata/wikipedia)', () => {
    expect(isNotable({ name: 'Test Dam' })).toBe(false);
  });

  it('returns false for empty tags', () => {
    expect(isNotable({})).toBe(false);
  });
});

describe('normalizeWaterElement', () => {
  const mockStress: WaterStressIndicators = {
    bws_raw: 3.5,
    bws_score: 3.5,
    bws_label: 'High',
    drr_score: 2.0,
    gtd_score: 1.5,
    sev_score: 2.5,
    iav_score: 3.0,
    compositeHealth: 0.3,
  };
  const stressLookup = () => mockStress;

  it('creates WaterFacility with correct id format "water-{osmId}"', () => {
    const el = {
      type: 'node' as const,
      id: 12345,
      lat: 33.3,
      lon: 44.4,
      tags: { waterway: 'dam', name: 'Mosul Dam' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('water-12345');
    expect(result!.type).toBe('water');
    expect(result!.facilityType).toBe('dam');
    expect(result!.lat).toBe(33.3);
    expect(result!.lng).toBe(44.4);
    expect(result!.label).toBe('Mosul Dam');
    expect(result!.osmId).toBe(12345);
    expect(result!.stress).toEqual(mockStress);
  });

  it('uses center coordinates for way/relation elements', () => {
    const el = {
      type: 'way' as const,
      id: 67890,
      center: { lat: 35.0, lon: 45.0 },
      tags: { natural: 'water', water: 'reservoir', 'name:en': 'Lake Tharthar' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(35.0);
    expect(result!.lng).toBe(45.0);
    expect(result!.facilityType).toBe('reservoir');
  });

  it('returns null for elements without tags', () => {
    const el = { type: 'node' as const, id: 1, lat: 33, lon: 44 };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('returns null for unrecognized tags', () => {
    const el = {
      type: 'node' as const,
      id: 1,
      lat: 33,
      lon: 44,
      tags: { highway: 'primary' },
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('returns null for elements without coordinates', () => {
    const el = {
      type: 'way' as const,
      id: 1,
      tags: { waterway: 'dam', name: 'Test Dam' },
    };
    expect(normalizeWaterElement(el, stressLookup)).toBeNull();
  });

  it('extracts operator from tags', () => {
    const el = {
      type: 'node' as const,
      id: 100,
      lat: 33.0,
      lon: 44.0,
      tags: { waterway: 'dam', name: 'Darbandikhan Dam', operator: 'Iraqi Ministry of Water Resources' },
    };
    const result = normalizeWaterElement(el, stressLookup);
    expect(result).not.toBeNull();
    expect(result!.operator).toBe('Iraqi Ministry Of Water Resources');
  });

  // ---------- Tiered country filtering tests ----------

  describe('tiered country filtering', () => {
    // Priority country: Iraq (33.2, 43.7) — keeps all facility types
    it('keeps dam in priority country (Iraq)', () => {
      const el = {
        type: 'node' as const,
        id: 200,
        lat: 33.2,
        lon: 43.7,
        tags: { waterway: 'dam', name: 'Iraqi Dam' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('keeps treatment_plant in priority country (Iran)', () => {
      const el = {
        type: 'node' as const,
        id: 201,
        lat: 32.4,
        lon: 53.7,
        tags: { man_made: 'water_works', name: 'Tehran Water Works' },
      };
      const result = normalizeWaterElement(el, stressLookup);
      expect(result).not.toBeNull();
      expect(result!.facilityType).toBe('treatment_plant');
    });

    // Non-priority country: Saudi Arabia (23.9, 45.1)
    it('filters dam without wikidata/wikipedia in non-priority country', () => {
      const el = {
        type: 'node' as const,
        id: 300,
        lat: 23.9,
        lon: 45.1,
        tags: { waterway: 'dam', name: 'Saudi Dam' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('keeps dam with wikidata in non-priority country', () => {
      const el = {
        type: 'node' as const,
        id: 301,
        lat: 23.9,
        lon: 45.1,
        tags: { waterway: 'dam', name: 'Notable Saudi Dam', wikidata: 'Q12345' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('filters reservoir without wikidata/wikipedia in non-priority country', () => {
      const el = {
        type: 'node' as const,
        id: 302,
        lat: 23.9,
        lon: 45.1,
        tags: { natural: 'water', water: 'reservoir', name: 'Saudi Reservoir' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('keeps reservoir with wikipedia in non-priority country', () => {
      const el = {
        type: 'node' as const,
        id: 303,
        lat: 23.9,
        lon: 45.1,
        tags: { natural: 'water', water: 'reservoir', name: 'Notable Reservoir', wikipedia: 'en:Reservoir' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('filters treatment_plant in non-priority country (always excluded)', () => {
      const el = {
        type: 'node' as const,
        id: 304,
        lat: 23.9,
        lon: 45.1,
        tags: { man_made: 'water_works', name: 'Saudi Water Works', wikidata: 'Q99999' },
      };
      expect(normalizeWaterElement(el, stressLookup)).toBeNull();
    });

    it('keeps desalination in non-priority country (always included)', () => {
      const el = {
        type: 'node' as const,
        id: 305,
        lat: 23.9,
        lon: 45.1,
        tags: { man_made: 'desalination_plant', name: 'Saudi Desalination' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });

    it('keeps reservoir with wikipedia:en in non-priority country', () => {
      const el = {
        type: 'node' as const,
        id: 306,
        lat: 26.8,
        lon: 30.8,  // Egypt (non-priority)
        tags: { natural: 'water', water: 'reservoir', name: 'Aswan Reservoir', 'wikipedia:en': 'Lake Nasser' },
      };
      expect(normalizeWaterElement(el, stressLookup)).not.toBeNull();
    });
  });
});
