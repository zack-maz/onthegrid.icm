/**
 * NLP-based actor-action-target triple extraction from news headlines and summaries.
 * Uses compromise for lightweight POS tagging and pattern matching.
 *
 * Extended with ME city place extraction via custom lexicon from GeoNames data,
 * and city coordinate lookup for geolocation cross-validation.
 *
 * @module nlpExtractor
 */
import nlp from 'compromise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------- ME City Data ----------

interface MeCityEntry {
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  countryCode: string;
  population: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const citiesPath = resolve(__dirname, '../../src/data/me-cities.json');
const ME_CITIES: MeCityEntry[] = JSON.parse(readFileSync(citiesPath, 'utf-8'));

// ---------- NLP Lexicon ----------

/**
 * Build custom lexicon so compromise.places() recognizes ME-specific city names
 * and .people() recognizes known conflict actors/groups.
 * Keys are lowercase names, values are POS tags.
 */
const ME_LEXICON: Record<string, string> = {};
for (const city of ME_CITIES) {
  ME_LEXICON[city.name.toLowerCase()] = 'Place';
  if (city.asciiName && city.asciiName.toLowerCase() !== city.name.toLowerCase()) {
    ME_LEXICON[city.asciiName.toLowerCase()] = 'Place';
  }
}

// Country names/acronyms that compromise doesn't tag as places
const ME_COUNTRY_ALIASES = [
  'uae', 'UAE', 'saudi arabia', 'Saudi Arabia', 'west bank', 'West Bank',
  'gaza strip', 'Gaza Strip', 'gaza', 'Gaza',
  'palestine', 'Palestine', 'palestinian territory',
];
for (const alias of ME_COUNTRY_ALIASES) {
  ME_LEXICON[alias] = 'Place';
}

// Known conflict actor names that compromise doesn't recognize as proper nouns
const CONFLICT_ACTORS = [
  'houthi', 'hezbollah', 'hamas', 'taliban', 'irgc', 'quds',
  'peshmerga', 'pkk', 'isis', 'isil', 'daesh', 'ansarallah',
  'fatah', 'mossad', 'shin bet', 'cia', 'pentagon',
];
for (const actor of CONFLICT_ACTORS) {
  ME_LEXICON[actor] = 'Person';
}

/**
 * Multi-word city names for fallback substring matching.
 * compromise tokenizes hyphenated/multi-word names into separate tokens,
 * so we need direct string matching as a fallback.
 */
const MULTIWORD_CITIES: string[] = ME_CITIES
  .filter(c => c.name.includes(' ') || c.name.includes('-'))
  .map(c => c.name);

// ---------- City Coordinate Lookup ----------

interface CityCoord {
  lat: number;
  lng: number;
  countryCode: string;
  population: number;
}

/**
 * Map of lowercase city name -> array of matching cities (for disambiguation).
 * Multiple cities can share the same name in different countries.
 */
const CITY_LOOKUP = new Map<string, CityCoord[]>();

for (const city of ME_CITIES) {
  const keys = new Set([city.name.toLowerCase()]);
  if (city.asciiName) {
    keys.add(city.asciiName.toLowerCase());
  }
  for (const key of keys) {
    const entry: CityCoord = {
      lat: city.lat,
      lng: city.lng,
      countryCode: city.countryCode,
      population: city.population,
    };
    const existing = CITY_LOOKUP.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      CITY_LOOKUP.set(key, [entry]);
    }
  }
}

/** Haversine distance in km between two lat/lng pairs */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Types ----------

export interface ArticleTriple {
  actor: string | null;
  action: string | null;
  target: string | null;
}

export interface NlpExtraction {
  actors: string[];
  places: string[];
  triple: ArticleTriple;
}

// ---------- Core Functions ----------

/** Normalize extracted text: trim, collapse whitespace, null for empty */
function normalize(text: string | undefined | null): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract an actor-action-target triple from a news headline and optional summary.
 *
 * Strategy: Try multiple compromise match patterns on combined text in priority order,
 * returning the first match with at least 2 non-null fields. Falls back to entity
 * extraction (.people(), .places(), .verbs()) for partial triples.
 */
export function extractTriple(title: string, summary?: string): ArticleTriple {
  const text = summary ? `${title}. ${summary}` : title;
  const doc = nlp(text);

  // Named capture group patterns, ordered from most specific to least
  const patterns: string[] = [
    // Pattern A: "Iran launches missile strike on Israel"
    '[<actor>#ProperNoun+] [<action>#Verb+ #Noun*] (on|at|in|against|into) [<target>#ProperNoun+]',
    // Pattern B: "Iran strikes Israel"
    '[<actor>#ProperNoun+] [<action>#Verb+] [<target>#ProperNoun+]',
    // Pattern C: "Airstrike in Damascus" (no actor)
    '[<action>#Noun+] (in|at|near|on) [<target>#ProperNoun+]',
  ];

  for (const pattern of patterns) {
    const match = doc.match(pattern);
    if (match.found) {
      const groups = match.groups();
      const actor = normalize(groups['actor']?.text());
      const action = normalize(groups['action']?.text());
      const target = normalize(groups['target']?.text());

      // Return only if we got at least 2 non-null fields
      const fieldCount = [actor, action, target].filter(Boolean).length;
      if (fieldCount >= 2) {
        return { actor, action, target };
      }
    }
  }

  // Fallback: extract any available components from the full text
  const people = doc.people().out('array') as string[];
  const places = doc.places().out('array') as string[];
  const verbs = doc.verbs().out('array') as string[];

  // Prefer people for actor, places for target
  const actor = normalize(people[0]) ?? normalize(places[0]) ?? null;
  const action = normalize(verbs[0]) ?? null;
  // Target: prefer a place/person different from the actor
  const targetCandidates = [
    ...places.filter(p => normalize(p) !== actor),
    ...people.filter(p => normalize(p) !== actor),
  ];
  const target = normalize(targetCandidates[0]) ?? null;

  return { actor, action, target };
}

/**
 * Extract actors and places from a news headline in a single NLP pass.
 * Uses ME custom lexicon so compromise recognizes Middle Eastern city names.
 *
 * @param title - Article headline text
 * @returns NlpExtraction with actors, places, and backward-compatible triple
 */
export function extractActorsAndPlaces(title: string): NlpExtraction {
  const doc = nlp(title, ME_LEXICON);

  // Extract places (compromise will now recognize ME cities via lexicon)
  const rawPlaces = doc.places().out('array') as string[];

  // Extract people/organizations as actors
  const rawPeople = doc.people().out('array') as string[];

  // Also check for proper nouns that might be actor names (organizations, countries)
  // compromise may tag groups like "Houthi" as proper nouns but not always as "people"
  const properNouns = doc.match('#ProperNoun+').out('array') as string[];

  // Filter actors: proper nouns that are NOT places
  const placeSet = new Set(rawPlaces.map(p => p.toLowerCase()));
  const actorCandidates = [
    ...rawPeople,
    ...properNouns.filter(pn => !placeSet.has(pn.toLowerCase())),
  ];

  // Deduplicate actors (case-insensitive)
  const seenActors = new Set<string>();
  const actors: string[] = [];
  for (const a of actorCandidates) {
    const key = a.toLowerCase();
    if (!seenActors.has(key)) {
      seenActors.add(key);
      actors.push(a);
    }
  }

  // Deduplicate places (case-insensitive), strip trailing punctuation
  const seenPlaces = new Set<string>();
  const places: string[] = [];
  for (const p of rawPlaces) {
    const clean = p.replace(/'s$/i, '').replace(/[^a-zA-Z\s'-]+$/g, '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seenPlaces.has(key)) {
      seenPlaces.add(key);
      places.push(clean);
    }
  }

  // Fallback: check for multi-word city names via direct substring matching.
  // compromise tokenizes "Deir ez-Zor" into separate tokens and misses it.
  const titleLower = title.toLowerCase();
  for (const cityName of MULTIWORD_CITIES) {
    if (titleLower.includes(cityName.toLowerCase()) && !seenPlaces.has(cityName.toLowerCase())) {
      seenPlaces.add(cityName.toLowerCase());
      places.push(cityName);
    }
  }

  // Fallback: check for country aliases that compromise misses (acronyms like UAE)
  for (const alias of ME_COUNTRY_ALIASES) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower.length < 4 && title.includes(alias.toUpperCase()) && !seenPlaces.has(aliasLower)) {
      // Short acronyms: match exact uppercase (UAE, not "uae" in a word)
      seenPlaces.add(aliasLower);
      places.push(alias);
    } else if (aliasLower.length >= 4 && titleLower.includes(aliasLower) && !seenPlaces.has(aliasLower)) {
      seenPlaces.add(aliasLower);
      places.push(alias);
    }
  }

  // Reuse existing extractTriple for backward compat
  const triple = extractTriple(title);

  return { actors, places, triple };
}

/**
 * Look up city coordinates by name from the ME cities dataset.
 *
 * @param placeName - City name to look up (case-insensitive)
 * @param originalLat - Optional original latitude for disambiguation
 * @param originalLng - Optional original longitude for disambiguation
 * @returns City coordinates and country code, or null if not found
 */
export function lookupCityCoords(
  placeName: string,
  originalLat?: number,
  originalLng?: number,
): { lat: number; lng: number; countryCode: string } | null {
  const candidates = CITY_LOOKUP.get(placeName.toLowerCase());
  if (!candidates || candidates.length === 0) return null;

  if (candidates.length === 1) {
    const c = candidates[0];
    return { lat: c.lat, lng: c.lng, countryCode: c.countryCode };
  }

  // Multiple matches -- disambiguate
  if (originalLat !== undefined && originalLng !== undefined) {
    // Return nearest to original coordinates
    let nearest = candidates[0];
    let minDist = haversineKm(originalLat, originalLng, nearest.lat, nearest.lng);
    for (let i = 1; i < candidates.length; i++) {
      const dist = haversineKm(originalLat, originalLng, candidates[i].lat, candidates[i].lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = candidates[i];
      }
    }
    return { lat: nearest.lat, lng: nearest.lng, countryCode: nearest.countryCode };
  }

  // No original coords -- return most populous
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].population > best.population) {
      best = candidates[i];
    }
  }
  return { lat: best.lat, lng: best.lng, countryCode: best.countryCode };
}
