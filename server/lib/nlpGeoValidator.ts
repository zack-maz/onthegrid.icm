/**
 * NLP-based geo cross-validation for GDELT events.
 * Cross-validates event geocoding against article title NLP extraction.
 * Rejects actor-geo mismatches, relocates centroid events to NLP-extracted cities,
 * and handles cross-border events correctly.
 *
 * @module nlpGeoValidator
 */
import { extractActorsAndPlaces, lookupCityCoords } from './nlpExtractor.js';

// ─── CAMEO 3-letter actor country codes -> 2-letter FIPS geo codes ─────────

const CAMEO_TO_FIPS: Record<string, string> = {
  IRN: 'IR',
  IRQ: 'IZ',
  ISR: 'IS',
  SYR: 'SY',
  TUR: 'TU',
  SAU: 'SA',
  YMN: 'YM',
  YEM: 'YM',
  LBN: 'LE',
  JOR: 'JO',
  KWT: 'KU',
  QAT: 'QA',
  ARE: 'AE',
  BHR: 'BA',
  OMN: 'MU',
  AFG: 'AF',
  PAK: 'PK',
  EGY: 'EG',
};

// ─── NLP-extracted actor keywords -> expected FIPS codes ───────────────────

const ACTOR_COUNTRY_MAP: Record<string, string[]> = {
  iran: ['IR'],
  iranian: ['IR'],
  tehran: ['IR'],
  irgc: ['IR'],
  quds: ['IR'],
  israel: ['IS'],
  israeli: ['IS'],
  idf: ['IS'],
  mossad: ['IS'],
  iraq: ['IZ'],
  iraqi: ['IZ'],
  baghdad: ['IZ'],
  syria: ['SY'],
  syrian: ['SY'],
  damascus: ['SY'],
  assad: ['SY'],
  turkey: ['TU'],
  turkish: ['TU'],
  ankara: ['TU'],
  saudi: ['SA'],
  hamas: ['IS', 'GZ'],
  hezbollah: ['LE', 'SY'],
  houthi: ['YM'],
  houthis: ['YM'],
  taliban: ['AF', 'PK'],
  pkk: ['TU', 'IZ', 'SY'],
  yemen: ['YM'],
  yemeni: ['YM'],
  lebanon: ['LE'],
  lebanese: ['LE'],
  jordan: ['JO'],
  jordanian: ['JO'],
  egypt: ['EG'],
  egyptian: ['EG'],
  pakistan: ['PK'],
  pakistani: ['PK'],
  afghan: ['AF'],
  afghanistan: ['AF'],
  kuwait: ['KU'],
  kuwaiti: ['KU'],
  bahrain: ['BA'],
  bahraini: ['BA'],
  qatar: ['QA'],
  qatari: ['QA'],
  oman: ['MU'],
  omani: ['MU'],
  emirates: ['AE'],
  emirati: ['AE'],
};

// ─── ISO -> FIPS for NLP place lookups ─────────────────────────────────────
// lookupCityCoords returns ISO country codes; we need FIPS for comparison

const ISO_TO_FIPS: Record<string, string> = {
  IR: 'IR',
  IQ: 'IZ',
  IL: 'IS',
  SY: 'SY',
  TR: 'TU',
  SA: 'SA',
  YE: 'YM',
  LB: 'LE',
  JO: 'JO',
  KW: 'KU',
  QA: 'QA',
  AE: 'AE',
  BH: 'BA',
  OM: 'MU',
  AF: 'AF',
  PK: 'PK',
  EG: 'EG',
  PS: 'GZ', // Palestine -> Gaza (also matches WE for West Bank)
};

// ─── Types ─────────────────────────────────────────────────────────────────

export type NlpValidationResult =
  | { status: 'verified' }
  | { status: 'mismatch'; reason: string }
  | { status: 'relocated'; newLat: number; newLng: number; cityName: string }
  | { status: 'penalized'; confidenceMultiplier: number; reason: string }
  | { status: 'skipped'; reason: string };

// ─── Main Validation Function ──────────────────────────────────────────────

/**
 * Cross-validate GDELT event geocoding against article title NLP extraction.
 *
 * Logic:
 * 1. If title is null (fetch failed) -> skipped
 * 2. Extract actors and places from title via NLP
 * 3. Collect expected FIPS codes from GDELT actor fields + NLP actors + NLP places
 * 4. Cross-validate: geo country must appear in expected countries
 * 5. For centroid events (type 3/4), try relocation to NLP-extracted city
 *
 * CRITICAL: Cross-border events are handled correctly -- if an NLP-extracted
 * place's country matches the geocode, the event is valid regardless of actor country.
 */
export function validateEventGeo(params: {
  title: string | null;
  actorCountryCodes: { actor1: string; actor2: string };
  geoCountryCode: string;
  actionGeoType: number | undefined;
  lat: number;
  lng: number;
}): NlpValidationResult {
  const { title, actorCountryCodes, geoCountryCode, actionGeoType, lat, lng } = params;

  // Step a: Title fetch failure
  if (title === null) {
    return { status: 'skipped', reason: 'title_fetch_failed' };
  }

  // Step b: NLP extraction
  const nlp = extractActorsAndPlaces(title);

  // Step c: Collect all actor signal FIPS codes
  const actorFips = new Set<string>();

  // From GDELT Actor1CountryCode / Actor2CountryCode
  if (actorCountryCodes.actor1) {
    const fips = CAMEO_TO_FIPS[actorCountryCodes.actor1];
    if (fips) actorFips.add(fips);
  }
  if (actorCountryCodes.actor2) {
    const fips = CAMEO_TO_FIPS[actorCountryCodes.actor2];
    if (fips) actorFips.add(fips);
  }

  // Non-ME Actor1 check: if Actor1 has a country code but it's NOT a ME country,
  // this is likely diplomatic reporting ABOUT the conflict (e.g., "US attacks Iran"),
  // not a kinetic event IN the region. Penalize rather than reject since some are real.
  if (actorCountryCodes.actor1 && !CAMEO_TO_FIPS[actorCountryCodes.actor1]) {
    return { status: 'penalized', confidenceMultiplier: 0.3, reason: 'non_me_actor1' };
  }

  // From NLP-extracted actors
  for (const actor of nlp.actors) {
    const codes = ACTOR_COUNTRY_MAP[actor.toLowerCase()];
    if (codes) {
      for (const code of codes) actorFips.add(code);
    }
  }

  // Step c (places): Look up NLP-extracted places for country codes
  const placeFips = new Set<string>();
  const placeCoords: Array<{ name: string; lat: number; lng: number; fips: string }> = [];

  for (const place of nlp.places) {
    const coords = lookupCityCoords(place, lat, lng);
    if (coords) {
      const fips = ISO_TO_FIPS[coords.countryCode] ?? coords.countryCode;
      placeFips.add(fips);
      // Palestine (PS) maps to both GZ and WE — add both so either geocode matches
      if (coords.countryCode === 'PS') { placeFips.add('GZ'); placeFips.add('WE'); }
      // Israel covers IS/WE/GZ in GDELT geocoding
      if (coords.countryCode === 'IL') { placeFips.add('IS'); placeFips.add('WE'); placeFips.add('GZ'); }
      placeCoords.push({ name: place, lat: coords.lat, lng: coords.lng, fips });
    }
    // Also check if the place name itself is an actor keyword (e.g., "Damascus" -> SY)
    const actorCodes = ACTOR_COUNTRY_MAP[place.toLowerCase()];
    if (actorCodes) {
      for (const code of actorCodes) placeFips.add(code);
    }
  }

  // Step e: If no signals at all -> skip
  if (actorFips.size === 0 && placeFips.size === 0) {
    return { status: 'skipped', reason: 'no_actor_data' };
  }

  // Step f-g: Cross-validate with place priority for cross-border events
  // If NLP extracted places and ANY place's country matches geoCountryCode -> verified
  if (placeFips.size > 0 && placeFips.has(geoCountryCode)) {
    // Before returning verified, check if this is a centroid that can be relocated
    if ((actionGeoType === 3 || actionGeoType === 4) && placeCoords.length > 0) {
      // Find a place that matches the geo country
      const matchingPlace = placeCoords.find(p => p.fips === geoCountryCode);
      if (matchingPlace) {
        return {
          status: 'relocated',
          newLat: matchingPlace.lat,
          newLng: matchingPlace.lng,
          cityName: matchingPlace.name,
        };
      }
    }
    return { status: 'verified' };
  }

  // Step h: NLP extracted places but NONE match geo — title-extracted places
  // are a stronger signal than GDELT's actor fields (which are often wrong).
  // Reject even if actorFips matches, because the article title explicitly names
  // a different country than where GDELT geocoded the event.
  if (placeFips.size > 0 && !placeFips.has(geoCountryCode)) {
    // Try relocation: if we have coordinates for an NLP place, move the event there
    if (placeCoords.length > 0) {
      const best = placeCoords[0];
      return {
        status: 'relocated',
        newLat: best.lat,
        newLng: best.lng,
        cityName: best.name,
      };
    }
    return {
      status: 'mismatch',
      reason: `NLP places suggest ${Array.from(placeFips).join(',')} but event geocoded to ${geoCountryCode}`,
    };
  }

  // Step i: Centroid relocation with actor-only data
  if ((actionGeoType === 3 || actionGeoType === 4) && placeCoords.length > 0) {
    // Any place with coordinates -> relocate to it
    const best = placeCoords[0];
    return {
      status: 'relocated',
      newLat: best.lat,
      newLng: best.lng,
      cityName: best.name,
    };
  }

  // Step j: Actor countries include geoCountryCode -> verified
  if (actorFips.has(geoCountryCode)) {
    return { status: 'verified' };
  }

  // Step k: Only actor countries found and NONE match geo
  if (actorFips.size > 0 && !actorFips.has(geoCountryCode)) {
    return {
      status: 'mismatch',
      reason: `Actor countries ${Array.from(actorFips).join(',')} do not include geocoded ${geoCountryCode}`,
    };
  }

  // Step l: Fallback
  return { status: 'skipped', reason: 'insufficient_signal' };
}
