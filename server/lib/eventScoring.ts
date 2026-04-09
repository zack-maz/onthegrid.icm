// Event confidence scoring, Goldstein sanity checks, CAMEO specificity, and Bellingcat corroboration for GDELT events

import type { ConflictEventEntity, ConflictEventType } from '../types.js';
import { haversineKm } from '../../src/lib/geo.js';
import { CITY_CENTROIDS } from './geoValidation.js';

// --- Bellingcat Corroboration Constants ---
const BELLINGCAT_TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const BELLINGCAT_GEO_RADIUS_KM = 200;
const BELLINGCAT_MIN_KEYWORD_MATCHES = 2;

/** Minimal article shape for Bellingcat corroboration checks */
export interface BellingcatArticle {
  title: string;
  url: string;
  publishedAt: number;
  lat?: number;
  lng?: number;
}

/**
 * CAMEO base code specificity tiers.
 *
 * High (1.0): Unambiguous military/violent events — aerial weapons, artillery, WMD, assassination, etc.
 * Medium (0.5): Conflict-related but broader — occupation, small arms, mass expulsion, assassination attempt.
 * Low (0.1): Catch-all / vague codes that GDELT frequently misapplies to non-conflict articles —
 *            "unconventional violence NOS", "physical assault", "conventional military force NOS".
 */
export const CAMEO_SPECIFICITY: Record<string, number> = {
  // Low — catch-all codes prone to false positives
  '180': 0.1, // Unconventional violence, not specified below
  '182': 0.1, // Physical assault (very broad)
  '190': 0.1, // Conventional military force, not specified below

  // Medium — conflict-related but broader
  '184': 0.5, // Use as human shield
  '185': 0.5, // Assassination attempt
  '193': 0.5, // Small arms / light weapons
  '200': 0.5, // Unconventional mass violence
  '201': 0.5, // Mass expulsion

  // High — unambiguous military/violent events
  '181': 1.0, // Abduction / hostage-taking
  '183': 1.0, // Bombing
  '186': 1.0, // Assassination
  '191': 1.0, // Blockade
  '194': 1.0, // Artillery / tank support
  '195': 1.0, // Aerial weapons
  '196': 1.0, // Ceasefire violation
  '202': 1.0, // Mass killings
  '203': 1.0, // Ethnic cleansing
  '204': 1.0, // Weapons of mass destruction
};

/**
 * Look up CAMEO specificity score for a CAMEO event code.
 * Uses first 3 characters as base code. Defaults to 0.5 (medium) for unknown codes.
 */
export function getCameoSpecificity(cameoCode: string): number {
  const baseCode = cameoCode.slice(0, 3);
  return CAMEO_SPECIFICITY[baseCode] ?? 0.5;
}

/**
 * Expected Goldstein scale ceilings per ConflictEventType.
 * Events with Goldstein scores exceeding ceiling+3 get reclassified
 * to the downgrade target (or left unchanged if no downgrade).
 */
export const GOLDSTEIN_CEILINGS: Record<
  ConflictEventType,
  { ceiling: number; downgrade: ConflictEventType | null }
> = {
  airstrike: { ceiling: -5, downgrade: 'on_ground' },
  explosion: { ceiling: -5, downgrade: 'on_ground' },
  on_ground: { ceiling: -3, downgrade: 'other' },
  targeted: { ceiling: -3, downgrade: 'other' },
  other: { ceiling: -1, downgrade: null },
};

/**
 * Cross-check assigned ConflictEventType against Goldstein scale.
 *
 * - Goldstein = 0 or positive: skip (unknown/data error)
 * - If Goldstein exceeds type ceiling by more than 3 points (less negative
 *   than expected), reclassify to downgrade target.
 * - Returns a new entity if reclassified, same reference if unchanged.
 */
export function applyGoldsteinSanity(entity: ConflictEventEntity): ConflictEventEntity {
  const { goldsteinScale } = entity.data;

  // Skip if Goldstein is 0 (missing/invalid) or positive (data error on conflict codes)
  if (goldsteinScale === 0 || goldsteinScale > 0) {
    return entity;
  }

  const entry = GOLDSTEIN_CEILINGS[entity.type];
  if (!entry || entry.downgrade === null) {
    return entity;
  }

  // diff = goldsteinScale - ceiling
  // e.g., goldstein=-1, ceiling=-5 --> diff = -1 - (-5) = 4
  // If diff > 3, the score is much less negative than expected --> reclassify
  const diff = goldsteinScale - entry.ceiling;
  if (diff > 3) {
    return {
      ...entity,
      type: entry.downgrade,
    };
  }

  return entity;
}

/**
 * Compute a 0-1 composite confidence score for a GDELT event.
 *
 * Six weighted signals:
 * - Media coverage (0.25): log2 of mentions normalized to 50
 * - Source diversity (0.15): log2 of sources normalized to 15
 * - Actor specificity (0.15): both actors = 1.0, one = 0.5, none = 0.0
 * - Geo precision (0.10): precise = 1.0, centroid = 0.3
 * - Goldstein consistency (0.10): 1.0 if within expected range, linear decay outside, 0.5 if unknown
 * - CAMEO specificity (0.25): 1.0 for unambiguous codes (195, 194, 204), 0.1 for catch-alls (180, 182, 190)
 */
export function computeEventConfidence(
  entity: ConflictEventEntity,
  geoPrecision: 'precise' | 'centroid',
): number {
  const { numMentions, numSources, actor1, actor2, goldsteinScale, cameoCode } = entity.data;

  // Signal 1: Media coverage (weight 0.25)
  const mentions = numMentions ?? 1;
  const mediaCoverage = Math.min(1, Math.log2(mentions + 1) / Math.log2(50));

  // Signal 2: Source diversity (weight 0.15)
  const sources = numSources ?? 1;
  const sourceDiversity = Math.min(1, Math.log2(sources + 1) / Math.log2(15));

  // Signal 3: Actor specificity (weight 0.15)
  const hasActor1 = actor1.trim().length > 0;
  const hasActor2 = actor2.trim().length > 0;
  const actorSpecificity = hasActor1 && hasActor2 ? 1.0 : hasActor1 || hasActor2 ? 0.5 : 0.0;

  // Signal 4: Geo precision (weight 0.10)
  const geoPrecisionSignal = geoPrecision === 'precise' ? 1.0 : 0.3;

  // Signal 5: Goldstein consistency (weight 0.10)
  let goldsteinConsistency: number;
  if (goldsteinScale === 0 || goldsteinScale > 0) {
    // Unknown or data error -- neutral
    goldsteinConsistency = 0.5;
  } else {
    const entry = GOLDSTEIN_CEILINGS[entity.type];
    if (!entry) {
      goldsteinConsistency = 0.5;
    } else {
      const diff = goldsteinScale - entry.ceiling;
      if (diff <= 0) {
        // Within expected range (more negative than ceiling)
        goldsteinConsistency = 1.0;
      } else {
        // Linear decay: 1.0 at diff=0, 0.0 at diff=6
        goldsteinConsistency = Math.max(0, 1.0 - diff / 6);
      }
    }
  }

  // Signal 6: CAMEO specificity (weight 0.25)
  const cameoSpecificity = getCameoSpecificity(cameoCode);

  // Weighted sum
  return (
    0.25 * mediaCoverage +
    0.15 * sourceDiversity +
    0.15 * actorSpecificity +
    0.1 * geoPrecisionSignal +
    0.1 * goldsteinConsistency +
    0.25 * cameoSpecificity
  );
}

/**
 * Extract geographic coordinates from a Bellingcat article title by matching
 * against known CITY_CENTROIDS names (case-insensitive).
 * Returns the first matching city's lat/lng, or undefined if no match.
 */
export function extractBellingcatGeo(title: string): { lat: number; lng: number } | undefined {
  const titleLower = title.toLowerCase();
  for (const city of CITY_CENTROIDS) {
    if (titleLower.includes(city.name.toLowerCase())) {
      return { lat: city.lat, lng: city.lng };
    }
  }
  return undefined;
}

/**
 * Check if a GDELT event is corroborated by any Bellingcat article.
 *
 * Three gates must ALL pass:
 * 1. Temporal: article publishedAt within +-24h of event timestamp
 * 2. Geographic: article lat/lng within 200km of event (haversine distance)
 * 3. Keyword: at least 2 words (>=3 chars) from event.data.locationName appear in article title
 *
 * Returns { matched: true, article } on first match, { matched: false } if none.
 */
export function checkBellingcatCorroboration(
  event: ConflictEventEntity,
  articles: BellingcatArticle[],
): { matched: true; article: BellingcatArticle } | { matched: false } {
  const locationWords = (event.data.locationName || '')
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.toLowerCase());

  for (const article of articles) {
    // Gate 1: Temporal proximity (+-24h)
    const timeDiff = Math.abs(article.publishedAt - event.timestamp);
    if (timeDiff > BELLINGCAT_TEMPORAL_WINDOW_MS) continue;

    // Gate 2: Geographic proximity (<=200km, requires coordinates)
    if (article.lat == null || article.lng == null) continue;
    const distKm = haversineKm(event.lat, event.lng, article.lat, article.lng);
    if (distKm > BELLINGCAT_GEO_RADIUS_KM) continue;

    // Gate 3: Keyword overlap (>=2 words from locationName in article title)
    const titleLower = article.title.toLowerCase();
    let keywordMatches = 0;
    for (const word of locationWords) {
      if (titleLower.includes(word)) {
        keywordMatches++;
      }
    }
    if (keywordMatches < BELLINGCAT_MIN_KEYWORD_MATCHES) continue;

    return { matched: true, article };
  }

  return { matched: false };
}
