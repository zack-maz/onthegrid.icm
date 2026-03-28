// Geo cross-validation and centroid detection for GDELT events

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
  LE: ['Lebanon'],
  AF: ['Afghanistan'],
  PK: ['Pakistan'],
};

/**
 * Major city centroids in the Middle East region for centroid detection.
 * Events at these exact coordinates are likely geocoded to city center
 * rather than the actual event location.
 */
export const CITY_CENTROIDS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Tehran', lat: 35.6892, lng: 51.3890 },
  { name: 'Baghdad', lat: 33.3152, lng: 44.3661 },
  { name: 'Damascus', lat: 33.5138, lng: 36.2765 },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818 },
  { name: 'Jerusalem', lat: 31.7683, lng: 35.2137 },
  { name: 'Riyadh', lat: 24.7136, lng: 46.6753 },
  { name: 'Beirut', lat: 33.8938, lng: 35.5018 },
  { name: 'Amman', lat: 31.9454, lng: 35.9284 },
  { name: 'Kabul', lat: 34.5553, lng: 69.2075 },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { name: 'Ankara', lat: 39.9334, lng: 32.8597 },
  { name: "Sana'a", lat: 15.3694, lng: 44.1910 },
  { name: 'Doha', lat: 25.2854, lng: 51.5310 },
  { name: 'Kuwait City', lat: 29.3759, lng: 47.9774 },
  { name: 'Muscat', lat: 23.5880, lng: 58.3829 },
  { name: 'Manama', lat: 26.2285, lng: 50.5860 },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Aden', lat: 12.7855, lng: 45.0187 },
  { name: 'Basra', lat: 30.5085, lng: 47.7804 },
  { name: 'Mosul', lat: 36.3350, lng: 43.1189 },
  { name: 'Aleppo', lat: 36.2021, lng: 37.1343 },
  { name: 'Homs', lat: 34.7324, lng: 36.7137 },
  { name: 'Isfahan', lat: 32.6546, lng: 51.6680 },
  { name: 'Tabriz', lat: 38.0962, lng: 46.2738 },
  { name: 'Jeddah', lat: 21.4858, lng: 39.1925 },
  { name: 'Medina', lat: 24.4672, lng: 39.6024 },
  { name: 'Haifa', lat: 32.7940, lng: 34.9896 },
  { name: 'Gaza City', lat: 31.5017, lng: 34.4668 },
  { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  // Additional conflict hotspot cities
  { name: 'Tikrit', lat: 34.6115, lng: 43.6770 },
  { name: 'Fallujah', lat: 33.3484, lng: 43.7753 },
  { name: 'Ramadi', lat: 33.4271, lng: 43.3068 },
  { name: 'Kirkuk', lat: 35.4681, lng: 44.3953 },
  { name: 'Idlib', lat: 35.9306, lng: 36.6339 },
  { name: 'Deir ez-Zor', lat: 35.3359, lng: 40.1408 },
  { name: 'Palmyra', lat: 34.5571, lng: 38.2688 },
  { name: 'Hodeidah', lat: 14.7980, lng: 42.9540 },
  { name: 'Kandahar', lat: 31.6280, lng: 65.7372 },
  { name: 'Mazar-i-Sharif', lat: 36.7069, lng: 67.1100 },
  { name: 'Lahore', lat: 31.5497, lng: 74.3436 },
  { name: 'Peshawar', lat: 34.0151, lng: 71.5249 },
];

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
 * Detect if lat/lng falls within +/-0.01 degrees of a known city centroid.
 * Returns 'centroid' if near a known city center, 'precise' otherwise.
 */
export function detectCentroid(lat: number, lng: number): 'precise' | 'centroid' {
  const TOLERANCE = 0.01;
  for (const city of CITY_CENTROIDS) {
    if (Math.abs(lat - city.lat) <= TOLERANCE && Math.abs(lng - city.lng) <= TOLERANCE) {
      return 'centroid';
    }
  }
  return 'precise';
}
