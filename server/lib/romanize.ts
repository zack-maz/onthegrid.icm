/**
 * WATER-LATIN-02 / D-08 — non-Latin water-facility name romanization.
 *
 * Wraps the `transliteration` package (`transliterate`) and adds a small
 * artifact-cleanup override pass. The acceptance bar is deliberately RESET
 * (per Phase 38 RESEARCH §WATER-LATIN-02 + Pitfall 4) to:
 *
 *   "a machine-searchable Latin token that admits the facility past the
 *    overpass-water Latin-label gate"
 *
 * — NOT a pretty, human-vowelized romanization. Arabic/Persian/Hebrew are
 * abjads: short vowels are not encoded as code points, so EVERY code-point
 * romanizer (including ICU `Any-Latin`) emits a vowel-less consonant
 * skeleton. RESEARCH empirically confirmed `transliteration` and ICU share
 * that ceiling, and ICU adds native-binary serverless cost for no quality
 * win — D-08 evaluation outcome: KEEP `transliteration`, SKIP ICU.
 *
 * Raw `transliterate` output for the RESEARCH sample table:
 *   بغداد       → "bGdd"        (uppercase G = غ artifact)
 *   سد الموصل   → "sd lmwSl"    (uppercase S = ص artifact)
 *   محطة تحلية  → "mHT@ tHly@"  (@ = ة artifact, uppercase H/T)
 *   تهران       → "thrn"
 *   מאגר כנרת   → "mgr knrt"
 *
 * The cleanup pass below normalizes those ASCII artifacts so the output
 * passes `isLatin` (overpass-water.ts:397), contains no `@`, carries no
 * stray UPPERCASE emphatic consonants, and is >= 2 chars (so the gate
 * admits). If cleanup collapses to < 2 chars (pure-diacritic input) we
 * return a short deterministic fallback token so the facility still admits.
 */

import { transliterate } from 'transliteration';

/**
 * Title-case a cleaned token for display. Mirrors the existing
 * `toTitleCase` convention in overpass-water.ts (collapse separators,
 * capitalize the first letter of each word). Kept local so romanize.ts has
 * no cross-import into the adapter.
 */
function toTitleCase(str: string): string {
  return str
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(\w)(\w*)/g, (_m, first: string, rest: string) => first.toUpperCase() + rest);
}

/**
 * Artifact-cleanup override pass applied to raw `transliterate` output.
 *   1. ة (raw `@`) → `a` (the Arabic taa marbuta; greppable vowel).
 *   2. UPPERCASE emphatic/heavy-letter artifacts (ص→S, ط→T, ح→H, ض→D,
 *      ظ→Z, غ→G, ق→Q, ث→Th, ...) → lowercase. The raw transliterator
 *      uppercases the "emphatic" Arabic consonants; lowercasing the whole
 *      token interior is safe because we re-apply title-case for display.
 *   3. Collapse repeated separators (spaces / hyphens) into a single space.
 */
function cleanupArtifacts(raw: string): string {
  return (
    raw
      // 1. ة taa-marbuta artifact → "a"
      .replace(/@/g, 'a')
      // 2. lowercase ALL letters first (kills uppercase emphatic artifacts);
      //    display title-case is re-applied afterwards by the caller.
      .toLowerCase()
      // 3. collapse hyphen/underscore runs and whitespace runs
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Romanize a (possibly non-Latin) facility name into a searchable Latin
 * token. Latin input passes through essentially unchanged (re-title-cased);
 * Arabic/Persian/Hebrew input becomes a cleaned vowel-less consonant token.
 *
 * Guarantees on the return value:
 *   - passes isLatin (Latin script + digits/punct/space only)
 *   - contains no `@` artifact
 *   - is >= 2 characters (fallback token if cleanup empties the string)
 *
 * @param name the raw OSM `name` / `name:en` string (any script)
 * @param qualifier optional country/type qualifier appended to the fallback
 *   token when cleanup yields < 2 chars (e.g. "Dam, Iran"); keeps the
 *   fallback greppable and admitting.
 */
export function romanize(name: string, qualifier?: string): string {
  const input = (name ?? '').trim();
  if (!input) {
    return fallbackToken(qualifier);
  }

  const raw = transliterate(input);
  const cleaned = cleanupArtifacts(raw);

  // Pure-diacritic or otherwise-empty cleanup → deterministic fallback so
  // the Latin-label gate still admits the facility.
  if (cleaned.replace(/[^a-z0-9]/gi, '').length < 2) {
    return fallbackToken(qualifier);
  }

  return toTitleCase(cleaned);
}

/**
 * Deterministic >= 2-char fallback used when romanization collapses to an
 * unsearchable stub. Prefers a supplied qualifier (country/type), else a
 * stable generic token. Always passes isLatin and is >= 2 chars.
 */
function fallbackToken(qualifier?: string): string {
  const q = (qualifier ?? '').trim();
  if (q.length >= 2) return toTitleCase(q);
  return 'Facility';
}
