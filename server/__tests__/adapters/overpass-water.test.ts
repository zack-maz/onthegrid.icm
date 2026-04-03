// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifyWaterType, normalizeWaterElement } from '../../adapters/overpass-water.js';
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

  it('returns "canal" for waterway=canal with name', () => {
    expect(classifyWaterType({ waterway: 'canal', name: 'Karaj Canal' })).toBe('canal');
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

  it('returns null for canal without name', () => {
    expect(classifyWaterType({ waterway: 'canal' })).toBeNull();
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
});
