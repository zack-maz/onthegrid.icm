import { describe, it, expect } from 'vitest';
import {
  isGeoValid,
  detectCentroid,
  NON_ME_FULLNAME_COUNTRIES,
  FIPS_TO_EXPECTED_COUNTRY,
  CITY_CENTROIDS,
} from '../../lib/geoValidation.js';
import { MIDDLE_EAST_FIPS } from '../../adapters/gdelt.js';

describe('geoValidation', () => {
  describe('data constants', () => {
    it('NON_ME_FULLNAME_COUNTRIES has ~30 entries', () => {
      expect(NON_ME_FULLNAME_COUNTRIES.size).toBeGreaterThanOrEqual(28);
      expect(NON_ME_FULLNAME_COUNTRIES.size).toBeLessThanOrEqual(35);
    });

    it('FIPS_TO_EXPECTED_COUNTRY covers all 16 MIDDLE_EAST_FIPS codes', () => {
      for (const fips of MIDDLE_EAST_FIPS) {
        expect(FIPS_TO_EXPECTED_COUNTRY).toHaveProperty(fips);
        expect(FIPS_TO_EXPECTED_COUNTRY[fips].length).toBeGreaterThan(0);
      }
    });

    it('CITY_CENTROIDS has >= 30 entries', () => {
      expect(CITY_CENTROIDS.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('isGeoValid', () => {
    it('returns false for non-ME country in FullName (New York, United States / IS)', () => {
      expect(isGeoValid('New York, United States', 'IS')).toBe(false);
    });

    it('returns true for ME country matching FIPS (Baghdad, Iraq / IZ)', () => {
      expect(isGeoValid('Baghdad, Iraq', 'IZ')).toBe(true);
    });

    it('returns true when non-ME text is in actor portion, not last segment', () => {
      expect(isGeoValid('US forces in Baghdad, Iraq', 'IZ')).toBe(true);
    });

    it('returns true for single segment (no comma) -- skip validation', () => {
      expect(isGeoValid('Baghdad', 'IZ')).toBe(true);
    });

    it('returns true for multi-segment with correct ME country (Tehran, Tehran, Iran / IR)', () => {
      expect(isGeoValid('Tehran, Tehran, Iran', 'IR')).toBe(true);
    });

    it('returns false when FullName says Turkey but FIPS = IS (contradiction)', () => {
      expect(isGeoValid('Istanbul, Turkey', 'IS')).toBe(false);
    });

    it('returns true for empty FullName', () => {
      expect(isGeoValid('', 'IZ')).toBe(true);
    });

    it('handles trailing whitespace after comma', () => {
      expect(isGeoValid('Baghdad,  Iraq  ', 'IZ')).toBe(true);
    });

    it('returns true for FullName with only whitespace segments', () => {
      expect(isGeoValid(',  ', 'IZ')).toBe(true);
    });

    it('returns false for Russia in FullName regardless of FIPS', () => {
      expect(isGeoValid('Moscow, Russia', 'IR')).toBe(false);
    });

    it('returns true for Israel with FIPS IS', () => {
      expect(isGeoValid('Jerusalem, Israel', 'IS')).toBe(true);
    });

    it('returns true for Turkey with FIPS TU', () => {
      expect(isGeoValid('Istanbul, Turkey', 'TU')).toBe(true);
    });

    it('returns true for Turkiye variant with FIPS TU', () => {
      expect(isGeoValid('Istanbul, Turkiye', 'TU')).toBe(true);
    });
  });

  describe('detectCentroid', () => {
    it('returns centroid for Tehran exact match', () => {
      expect(detectCentroid(35.6892, 51.3890)).toBe('centroid');
    });

    it('returns centroid for Tehran within 0.01 tolerance', () => {
      expect(detectCentroid(35.69, 51.39)).toBe('centroid');
    });

    it('returns precise for location not near any centroid', () => {
      expect(detectCentroid(35.50, 51.20)).toBe('precise');
    });

    it('returns centroid for Baghdad exact', () => {
      expect(detectCentroid(33.3152, 44.3661)).toBe('centroid');
    });

    it('returns centroid for Damascus exact', () => {
      expect(detectCentroid(33.5138, 36.2765)).toBe('centroid');
    });

    it('returns precise for point far from any city', () => {
      expect(detectCentroid(20.0, 55.0)).toBe('precise');
    });

    it('returns centroid for boundary tolerance (exactly 0.01 away)', () => {
      // Tehran is 35.6892, 51.3890 -- test at +0.01 on lat
      expect(detectCentroid(35.6992, 51.3890)).toBe('centroid');
    });

    it('returns precise for point just outside tolerance (0.011 away)', () => {
      // Tehran is 35.6892, 51.3890 -- test at +0.011 on lat
      expect(detectCentroid(35.7003, 51.3890)).toBe('precise');
    });
  });
});
