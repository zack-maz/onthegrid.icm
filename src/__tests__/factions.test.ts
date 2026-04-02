import { describe, it, expect } from 'vitest';
import {
  type Faction,
  FACTION_ASSIGNMENTS,
  FACTION_COLORS,
  getFaction,
} from '@/lib/factions';

// Import static GeoJSON data for integrity checks
import countriesData from '@/data/countries.json';
import disputedData from '@/data/disputed.json';

describe('factions', () => {
  describe('FACTION_ASSIGNMENTS', () => {
    it('maps all 7 US-aligned countries to "us"', () => {
      const usAligned = ['ISR', 'SAU', 'ARE', 'BHR', 'JOR', 'KWT', 'EGY'];
      for (const code of usAligned) {
        expect(FACTION_ASSIGNMENTS[code]).toBe('us');
      }
    });

    it('maps all 3 Iran-aligned countries to "iran"', () => {
      const iranAligned = ['IRN', 'SYR', 'YEM'];
      for (const code of iranAligned) {
        expect(FACTION_ASSIGNMENTS[code]).toBe('iran');
      }
    });

    it('has exactly 10 entries (7 US + 3 Iran, no neutrals)', () => {
      expect(Object.keys(FACTION_ASSIGNMENTS)).toHaveLength(10);
    });
  });

  describe('getFaction', () => {
    it('returns "neutral" for unlisted codes', () => {
      expect(getFaction('TUR')).toBe('neutral');
      expect(getFaction('QAT')).toBe('neutral');
      expect(getFaction('OMN')).toBe('neutral');
      expect(getFaction('XXX')).toBe('neutral');
    });

    it('returns correct faction for listed codes', () => {
      expect(getFaction('ISR')).toBe('us');
      expect(getFaction('IRN')).toBe('iran');
    });
  });

  describe('FACTION_COLORS', () => {
    it('has entries for all 3 factions', () => {
      expect(FACTION_COLORS.us).toBe('#3b82f6');
      expect(FACTION_COLORS.iran).toBe('#dc2626');
      expect(FACTION_COLORS.neutral).toBe('#64748b');
    });
  });
});

describe('countries.json integrity', () => {
  it('is a valid GeoJSON FeatureCollection', () => {
    expect(countriesData.type).toBe('FeatureCollection');
    expect(Array.isArray(countriesData.features)).toBe(true);
    expect(countriesData.features.length).toBeGreaterThan(0);
  });

  it('has approximately 25-35 features for the Middle East region', () => {
    expect(countriesData.features.length).toBeGreaterThanOrEqual(20);
    expect(countriesData.features.length).toBeLessThanOrEqual(45);
  });

  it('every feature has ISO_A3 property as a valid 3-letter string (not "-99")', () => {
    for (const feature of countriesData.features) {
      const iso = (feature.properties as Record<string, string>).ISO_A3;
      expect(iso).toBeDefined();
      expect(iso).not.toBe('-99');
      expect(iso).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('disputed.json integrity', () => {
  it('is a valid GeoJSON FeatureCollection', () => {
    expect(disputedData.type).toBe('FeatureCollection');
    expect(Array.isArray(disputedData.features)).toBe(true);
  });

  it('has exactly 3 features', () => {
    expect(disputedData.features).toHaveLength(3);
  });

  it('includes Gaza, West Bank, and Golan Heights by NAME', () => {
    const names = disputedData.features.map(
      (f) => (f.properties as Record<string, string>).NAME
    );
    expect(names.some((n) => n.includes('Gaza'))).toBe(true);
    expect(names.some((n) => n.includes('West Bank'))).toBe(true);
    expect(names.some((n) => n.includes('Golan'))).toBe(true);
  });
});
