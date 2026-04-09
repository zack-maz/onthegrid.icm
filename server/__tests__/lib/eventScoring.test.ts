import { describe, it, expect } from 'vitest';
import type { ConflictEventEntity, ConflictEventType } from '../../types.js';
import {
  computeEventConfidence,
  applyGoldsteinSanity,
  GOLDSTEIN_CEILINGS,
  getCameoSpecificity,
  checkBellingcatCorroboration,
  extractBellingcatGeo,
} from '../../lib/eventScoring.js';
import type { BellingcatArticle } from '../../lib/eventScoring.js';

/** Helper to create a test ConflictEventEntity with configurable fields */
function makeTestEvent(
  overrides: {
    type?: ConflictEventType;
    actor1?: string;
    actor2?: string;
    goldsteinScale?: number;
    numMentions?: number;
    numSources?: number;
    cameoCode?: string;
  } = {},
): ConflictEventEntity {
  const cameoCode = overrides.cameoCode ?? '195';
  return {
    id: 'gdelt-test-1',
    type: overrides.type ?? 'airstrike',
    lat: 33.3152,
    lng: 44.3661,
    timestamp: Date.now(),
    label: 'Test event',
    data: {
      eventType: 'Aerial weapons',
      subEventType: `CAMEO ${cameoCode}`,
      fatalities: 0,
      actor1: overrides.actor1 ?? '',
      actor2: overrides.actor2 ?? '',
      notes: '',
      source: 'http://example.com/article',
      goldsteinScale: overrides.goldsteinScale ?? -5,
      locationName: 'Baghdad, Iraq',
      cameoCode,
      numMentions: overrides.numMentions,
      numSources: overrides.numSources,
    },
  };
}

describe('eventScoring', () => {
  describe('GOLDSTEIN_CEILINGS', () => {
    it('has entries for all 5 ConflictEventTypes', () => {
      const expectedTypes: ConflictEventType[] = [
        'airstrike',
        'on_ground',
        'explosion',
        'targeted',
        'other',
      ];
      for (const type of expectedTypes) {
        expect(GOLDSTEIN_CEILINGS).toHaveProperty(type);
      }
      expect(Object.keys(GOLDSTEIN_CEILINGS)).toHaveLength(5);
    });

    it('has correct ceiling values for each type', () => {
      expect(GOLDSTEIN_CEILINGS.airstrike.ceiling).toBe(-5);
      expect(GOLDSTEIN_CEILINGS.explosion.ceiling).toBe(-5);
      expect(GOLDSTEIN_CEILINGS.on_ground.ceiling).toBe(-3);
      expect(GOLDSTEIN_CEILINGS.targeted.ceiling).toBe(-3);
      expect(GOLDSTEIN_CEILINGS.other.ceiling).toBe(-1);
    });
  });

  describe('applyGoldsteinSanity', () => {
    it('skips reclassification when Goldstein=0', () => {
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: 0 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('airstrike');
    });

    it('skips reclassification when Goldstein is positive', () => {
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: 3 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('airstrike');
    });

    it('reclassifies airstrike with Goldstein=-1 (exceeds -5 ceiling by 4 > 3) to on_ground', () => {
      // ceiling=-5, goldstein=-1, diff = -1 - (-5) = 4 > 3 --> reclassify
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -1 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('on_ground');
    });

    it('does NOT reclassify airstrike with Goldstein=-3 (exceeds -5 ceiling by 2, within 3 tolerance)', () => {
      // ceiling=-5, goldstein=-3, diff = -3 - (-5) = 2 <= 3 --> no reclassify
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -3 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('airstrike');
    });

    it('does NOT reclassify other (no downgrade target)', () => {
      const event = makeTestEvent({ type: 'other', goldsteinScale: -0.5 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('other');
    });

    it('reclassifies on_ground with Goldstein=-0.5 (exceeds -3 ceiling by 2.5, within 3 tolerance) stays on_ground', () => {
      // ceiling=-3, goldstein=-0.5, diff = -0.5 - (-3) = 2.5 <= 3 --> no reclassify
      const event = makeTestEvent({ type: 'on_ground', goldsteinScale: -0.5 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('on_ground');
    });

    it('reclassifies targeted with Goldstein=0.5 (positive, skip) stays targeted', () => {
      const event = makeTestEvent({ type: 'targeted', goldsteinScale: 0.5 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('targeted');
    });

    it('boundary: exact ceiling+3 does NOT trigger reclassification (strictly > 3)', () => {
      // airstrike ceiling=-5, goldstein=-2, diff = -2 - (-5) = 3, not > 3 --> no reclassify
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -2 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('airstrike');
    });

    it('returns a new entity (does not mutate input) when reclassifying', () => {
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -1 });
      const result = applyGoldsteinSanity(event);
      expect(result).not.toBe(event);
      expect(event.type).toBe('airstrike'); // original unchanged
    });

    it('returns same entity reference when no reclassification needed', () => {
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -5 });
      const result = applyGoldsteinSanity(event);
      expect(result).toBe(event);
    });
  });

  describe('computeEventConfidence', () => {
    it('returns ~0.85+ for high-signal event', () => {
      const event = makeTestEvent({
        type: 'airstrike',
        actor1: 'ISRAEL',
        actor2: 'IRAN',
        goldsteinScale: -10,
        numMentions: 20,
        numSources: 10,
      });
      const score = computeEventConfidence(event, 'precise');
      expect(score).toBeGreaterThanOrEqual(0.85);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('returns low score for low-signal event with unknown CAMEO (default 0.5 specificity)', () => {
      // Note: 180/182/190 removed from CAMEO_SPECIFICITY (now hard-excluded in pipeline).
      // Using 180 here still works -- it falls through to default 0.5 (medium).
      // With all-low signals + default specificity, score is ~0.29.
      const event = makeTestEvent({
        type: 'on_ground',
        actor1: '',
        actor2: '',
        goldsteinScale: 0,
        numMentions: 1,
        numSources: 1,
        cameoCode: '180', // falls to default 0.5 specificity
      });
      const score = computeEventConfidence(event, 'centroid');
      expect(score).toBeGreaterThanOrEqual(0.15);
      expect(score).toBeLessThanOrEqual(0.35);
    });

    it('handles undefined numMentions/numSources (defaults to 1, non-NaN)', () => {
      const event = makeTestEvent({
        actor1: 'ACTOR1',
        actor2: '',
        goldsteinScale: -5,
      });
      // numMentions and numSources are undefined
      const score = computeEventConfidence(event, 'precise');
      expect(score).not.toBeNaN();
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('uses neutral 0.5 for Goldstein=0', () => {
      const eventZero = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: 0,
        numMentions: 10,
        numSources: 5,
      });
      const eventNeg = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: -5,
        numMentions: 10,
        numSources: 5,
      });
      const scoreZero = computeEventConfidence(eventZero, 'precise');
      const scoreNeg = computeEventConfidence(eventNeg, 'precise');
      // Goldstein=0 should give 0.5 for consistency signal, while -5 within range gives 1.0
      // So scoreNeg > scoreZero (Goldstein consistency weight = 0.15)
      expect(scoreNeg).toBeGreaterThan(scoreZero);
    });

    it('uses neutral 0.5 for positive Goldstein on conflict code', () => {
      const eventPos = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: 5,
        numMentions: 10,
        numSources: 5,
      });
      const scorePos = computeEventConfidence(eventPos, 'precise');
      // Should be same as Goldstein=0 (both use neutral 0.5)
      const eventZero = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: 0,
        numMentions: 10,
        numSources: 5,
      });
      const scoreZero = computeEventConfidence(eventZero, 'precise');
      expect(scorePos).toBeCloseTo(scoreZero, 5);
    });

    it('always returns value between 0 and 1', () => {
      const scenarios = [
        { numMentions: 0, numSources: 0, goldsteinScale: -10 },
        { numMentions: 1000, numSources: 100, goldsteinScale: 10 },
        { numMentions: 1, numSources: 1, goldsteinScale: 0 },
      ];
      for (const s of scenarios) {
        const event = makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          ...s,
        });
        const score = computeEventConfidence(event, 'precise');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('caps media coverage at 1.0 even with 1000 mentions', () => {
      const event = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: -5,
        numMentions: 1000,
        numSources: 1,
      });
      const score = computeEventConfidence(event, 'precise');
      // With capped media and low source diversity, score should be reasonable
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThan(0);
    });

    it('centroid precision reduces score compared to precise', () => {
      const event = makeTestEvent({
        actor1: 'A',
        actor2: 'B',
        goldsteinScale: -5,
        numMentions: 10,
        numSources: 5,
      });
      const scorePrecise = computeEventConfidence(event, 'precise');
      const scoreCentroid = computeEventConfidence(event, 'centroid');
      expect(scorePrecise).toBeGreaterThan(scoreCentroid);
      // Difference should be geo precision weight * (1.0 - 0.3) = 0.10 * 0.7 = 0.07
      expect(scorePrecise - scoreCentroid).toBeCloseTo(0.07, 2);
    });

    it('actor specificity: both actors > one actor > no actors', () => {
      const both = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
        }),
        'precise',
      );
      const one = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: '',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
        }),
        'precise',
      );
      const none = computeEventConfidence(
        makeTestEvent({
          actor1: '',
          actor2: '',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
        }),
        'precise',
      );
      expect(both).toBeGreaterThan(one);
      expect(one).toBeGreaterThan(none);
    });

    it('CAMEO specificity: high code (195) scores higher than medium code (184)', () => {
      // Note: 180/182/190 removed from CAMEO_SPECIFICITY (hard-excluded in pipeline).
      // Using 184 (medium, 0.5) and 195 (high, 1.0) instead.
      const specific = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
          cameoCode: '195',
        }),
        'precise',
      );
      const medium = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
          cameoCode: '184',
        }),
        'precise',
      );
      expect(specific).toBeGreaterThan(medium);
      // Difference: 0.25 * (1.0 - 0.5) = 0.125
      expect(specific - medium).toBeCloseTo(0.125, 2);
    });

    it('CAMEO specificity: high code (195) scores higher than medium code (193)', () => {
      // Note: 180/182/190 removed from CAMEO_SPECIFICITY -- no "low" tier remaining.
      // Only high (1.0) and medium (0.5) tiers exist now. Unknown codes default to 0.5.
      const base = { actor1: 'A', actor2: 'B', goldsteinScale: -5, numMentions: 5, numSources: 3 };
      const high = computeEventConfidence(makeTestEvent({ ...base, cameoCode: '195' }), 'precise');
      const medium = computeEventConfidence(
        makeTestEvent({ ...base, cameoCode: '193' }),
        'precise',
      );
      expect(high).toBeGreaterThan(medium);
    });

    it('low signals + no actors + centroid falls below 0.38 threshold', () => {
      // Simulates false positive: minimal evidence event
      // Note: 180 removed from CAMEO_SPECIFICITY (falls to default 0.5).
      // But with no actors (0.0), 1 mention, 1 source, centroid, Goldstein 0 (unknown),
      // the score is still low enough to be rejected.
      const event = makeTestEvent({
        type: 'on_ground',
        actor1: '',
        actor2: '',
        goldsteinScale: 0,
        numMentions: 1,
        numSources: 1,
        cameoCode: '180',
      });
      const score = computeEventConfidence(event, 'centroid');
      expect(score).toBeLessThan(0.38);
    });

    it('specific CAMEO + good signals stays well above threshold', () => {
      const event = makeTestEvent({
        type: 'airstrike',
        actor1: 'ISRAEL',
        actor2: 'IRAN',
        goldsteinScale: -7,
        numMentions: 15,
        numSources: 8,
        cameoCode: '195',
      });
      const score = computeEventConfidence(event, 'precise');
      expect(score).toBeGreaterThan(0.7);
    });

    it('handles 4-digit CAMEO codes by using first 3 as base', () => {
      const score3 = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
          cameoCode: '195',
        }),
        'precise',
      );
      const score4 = computeEventConfidence(
        makeTestEvent({
          actor1: 'A',
          actor2: 'B',
          goldsteinScale: -5,
          numMentions: 5,
          numSources: 3,
          cameoCode: '1951',
        }),
        'precise',
      );
      expect(score3).toBeCloseTo(score4, 5);
    });
  });

  describe('getCameoSpecificity', () => {
    it('returns 0.1 (low) for catch-all codes (180, 182, 190)', () => {
      // These codes are broad catch-alls prone to false positives
      expect(getCameoSpecificity('180')).toBe(0.1);
      expect(getCameoSpecificity('182')).toBe(0.1);
      expect(getCameoSpecificity('190')).toBe(0.1);
    });

    it('returns 1.0 for specific codes (195, 194, 204)', () => {
      expect(getCameoSpecificity('195')).toBe(1.0);
      expect(getCameoSpecificity('194')).toBe(1.0);
      expect(getCameoSpecificity('204')).toBe(1.0);
    });

    it('returns 0.5 for medium codes (193, 200)', () => {
      expect(getCameoSpecificity('193')).toBe(0.5);
      expect(getCameoSpecificity('200')).toBe(0.5);
    });

    it('returns 0.5 for unknown codes (default)', () => {
      expect(getCameoSpecificity('999')).toBe(0.5);
      expect(getCameoSpecificity('')).toBe(0.5);
    });

    it('uses first 3 chars of 4-digit codes', () => {
      expect(getCameoSpecificity('1951')).toBe(1.0); // 195 -> high
      expect(getCameoSpecificity('1801')).toBe(0.1); // 180 -> low (catch-all)
    });
  });

  describe('checkBellingcatCorroboration', () => {
    const baseEvent: ConflictEventEntity = {
      id: 'gdelt-corr-test',
      type: 'airstrike',
      lat: 33.3152, // Baghdad
      lng: 44.3661,
      timestamp: Date.UTC(2026, 2, 15), // March 15, 2026
      label: 'Baghdad, Iraq: Aerial weapons',
      data: {
        eventType: 'Aerial weapons',
        subEventType: 'CAMEO 195',
        fatalities: 0,
        actor1: 'ISRAEL',
        actor2: 'IRAN',
        notes: '',
        source: 'http://example.com',
        goldsteinScale: -7,
        locationName: 'Baghdad, Iraq',
        cameoCode: '195',
      },
    };

    function makeArticle(overrides: Partial<BellingcatArticle> = {}): BellingcatArticle {
      return {
        title: 'Airstrike hits Baghdad military base in Iraq',
        url: 'https://www.bellingcat.com/article/1',
        publishedAt: Date.UTC(2026, 2, 15, 12), // Same day, 12h offset
        lat: 33.3152,
        lng: 44.3661,
        ...overrides,
      };
    }

    it('returns matched: true when article passes all 3 gates', () => {
      const articles = [makeArticle()];
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(true);
      expect(result.article).toBe(articles[0]);
    });

    it('returns matched: false when article is outside 24h temporal window', () => {
      const articles = [makeArticle({ publishedAt: Date.UTC(2026, 2, 17) })]; // 2 days later
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(false);
    });

    it('returns matched: false when article is > 200km away (geographic gate)', () => {
      // Tehran is ~450km from Baghdad
      const articles = [makeArticle({ lat: 35.6892, lng: 51.389 })];
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(false);
    });

    it('returns matched: false when article has only 1 keyword match (need >=2)', () => {
      // Title only has "Baghdad" but not "Iraq"
      const articles = [makeArticle({ title: 'Baghdad crisis deepens amid tensions' })];
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(false);
    });

    it('returns matched: false when article has no lat/lng (geographic gate requires coords)', () => {
      const articles = [makeArticle({ lat: undefined, lng: undefined })];
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(false);
    });

    it('returns the second article when only it matches', () => {
      const articles = [
        makeArticle({ publishedAt: Date.UTC(2026, 2, 20) }), // Too old
        makeArticle({ title: 'Investigation reveals Baghdad Iraq military operations' }),
      ];
      const result = checkBellingcatCorroboration(baseEvent, articles);
      expect(result.matched).toBe(true);
      expect(result.article).toBe(articles[1]);
    });

    it('returns matched: false for empty articles array', () => {
      const result = checkBellingcatCorroboration(baseEvent, []);
      expect(result.matched).toBe(false);
    });
  });

  describe('extractBellingcatGeo', () => {
    it('returns Baghdad centroid coords for title containing "Baghdad"', () => {
      const geo = extractBellingcatGeo('Airstrike hits Baghdad military base');
      expect(geo).toBeDefined();
      // Hardcoded CITY_CENTROIDS coordinates for Baghdad
      expect(geo!.lat).toBeCloseTo(33.3152, 3);
      expect(geo!.lng).toBeCloseTo(44.3661, 3);
    });

    it('returns undefined for title with no city name', () => {
      const geo = extractBellingcatGeo('Global investigation into arms dealing');
      expect(geo).toBeUndefined();
    });

    it('matches city names case-insensitively', () => {
      const geo = extractBellingcatGeo('TEHRAN under fire as conflict escalates');
      expect(geo).toBeDefined();
      // Hardcoded CITY_CENTROIDS coordinates for Tehran
      expect(geo!.lat).toBeCloseTo(35.6892, 3);
      expect(geo!.lng).toBeCloseTo(51.389, 3);
    });
  });
});
