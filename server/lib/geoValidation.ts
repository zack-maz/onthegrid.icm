// Geo cross-validation and centroid detection for GDELT events

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load ME cities data for expanded centroid detection
interface MeCityEntry {
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  countryCode: string;
  population: number;
}

const __dirname_geo = dirname(fileURLToPath(import.meta.url));
const citiesPath = resolve(__dirname_geo, '../../src/data/me-cities.json');
const ME_CITIES: MeCityEntry[] = JSON.parse(readFileSync(citiesPath, 'utf-8'));

/**
 * Non-Middle-East country names that commonly appear in GDELT ActionGeo_FullName.
 * Used to discard events misplaced outside the monitoring region.
 */
export const NON_ME_FULLNAME_COUNTRIES = new Set([
  'United States',
  'United Kingdom',
  'Russia',
  'China',
  'France',
  'Germany',
  'India',
  'Japan',
  'South Korea',
  'North Korea',
  'Australia',
  'Canada',
  'Brazil',
  'Italy',
  'Spain',
  'Ukraine',
  'Poland',
  'Netherlands',
  'Belgium',
  'Sweden',
  'Norway',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Ethiopia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Mexico',
]);

/**
 * FIPS 10-4 code to expected country name suffixes in ActionGeo_FullName.
 * Covers all 16 MIDDLE_EAST_FIPS codes.
 */
export const FIPS_TO_EXPECTED_COUNTRY: Record<string, string[]> = {
  IR: ['Iran'],
  IZ: ['Iraq'],
  SY: ['Syria'],
  TU: ['Turkey', 'Turkiye'],
  SA: ['Saudi Arabia'],
  YM: ['Yemen'],
  MU: ['Oman'],
  AE: ['United Arab Emirates', 'UAE'],
  QA: ['Qatar'],
  BA: ['Bahrain'],
  KU: ['Kuwait'],
  JO: ['Jordan'],
  IS: ['Israel', 'West Bank', 'Gaza Strip', 'Palestinian Territory'],
  WE: ['West Bank', 'Palestinian Territory', 'Israel'],
  GZ: ['Gaza Strip', 'Gaza', 'Palestinian Territory', 'Israel'],
  LE: ['Lebanon'],
  AF: ['Afghanistan'],
  PK: ['Pakistan'],
};

/**
 * Major city centroids in the Middle East region for centroid detection.
 * Events at these exact coordinates are likely geocoded to city center
 * rather than the actual event location.
 *
 * Dynamically built from GeoNames data (me-cities.json) -- expanded from
 * original 42 hardcoded entries to ~300 cities with pop >= 200k.
 */
export const CITY_CENTROIDS: Array<{ name: string; lat: number; lng: number }> =
  ME_CITIES.map(c => ({ name: c.name, lat: c.lat, lng: c.lng }));

/**
 * Extract the last comma-delimited segment from ActionGeo_FullName.
 * Returns null if no comma is present (single-segment name).
 */
export function extractLastSegment(fullName: string): string | null {
  const idx = fullName.lastIndexOf(',');
  if (idx === -1) return null;
  const segment = fullName.slice(idx + 1).trim();
  return segment || null;
}

/**
 * Cross-validate ActionGeo_FullName against ActionGeo_CountryCode (FIPS).
 *
 * Returns false (discard event) if:
 * 1. Last segment of FullName is a known non-ME country name, OR
 * 2. Last segment names a country that contradicts the FIPS code reverse lookup
 *
 * Returns true (keep event) if:
 * - FullName is empty or has no commas (single-segment)
 * - Last segment matches expected country for the FIPS code
 * - Last segment is not a recognized country name (could be a city/region)
 */
export function isGeoValid(fullName: string, fipsCode: string): boolean {
  if (!fullName) return true;

  const lastSegment = extractLastSegment(fullName);
  if (!lastSegment) return true; // Single-segment name -- skip validation

  // Check 1: Is the last segment a known non-ME country?
  if (NON_ME_FULLNAME_COUNTRIES.has(lastSegment)) {
    return false;
  }

  // Check 2: Does the last segment contradict the FIPS reverse lookup?
  // Only apply if the last segment looks like a country name (starts uppercase, no digits)
  if (/^[A-Z]/.test(lastSegment) && !/\d/.test(lastSegment)) {
    const expectedCountries = FIPS_TO_EXPECTED_COUNTRY[fipsCode];
    if (expectedCountries) {
      // Check if this segment is a known country name (from any FIPS mapping)
      const allKnownCountries = new Set<string>();
      for (const countries of Object.values(FIPS_TO_EXPECTED_COUNTRY)) {
        for (const c of countries) {
          allKnownCountries.add(c);
        }
      }

      // If the last segment is a recognized ME country but doesn't match this FIPS code
      if (allKnownCountries.has(lastSegment) && !expectedCountries.includes(lastSegment)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Shared tolerance for centroid detection: +/-0.01 degrees (~1.1 km).
 * Used by both detectCentroid (geoValidation) and findCentroidKey (dispersion)
 * to ensure consistent centroid matching across the pipeline.
 */
export const CENTROID_TOLERANCE = 0.01;

/**
 * Detect if lat/lng falls within +/-CENTROID_TOLERANCE degrees of a known city centroid.
 * Returns 'centroid' if near a known city center, 'precise' otherwise.
 */
export function detectCentroid(lat: number, lng: number): 'precise' | 'centroid' {
  for (const city of CITY_CENTROIDS) {
    if (Math.abs(lat - city.lat) <= CENTROID_TOLERANCE && Math.abs(lng - city.lng) <= CENTROID_TOLERANCE) {
      return 'centroid';
    }
  }
  return 'precise';
}
