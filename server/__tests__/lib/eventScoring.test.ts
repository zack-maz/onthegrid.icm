import { describe, it, expect } from 'vitest';
import type { ConflictEventEntity, ConflictEventType } from '../../types.js';
import {
  computeEventConfidence,
  applyGoldsteinSanity,
  GOLDSTEIN_CEILINGS,
} from '../../lib/eventScoring.js';

/** Helper to create a test ConflictEventEntity with configurable fields */
function makeTestEvent(overrides: {
  type?: ConflictEventType;
  actor1?: string;
  actor2?: string;
  goldsteinScale?: number;
  numMentions?: number;
  numSources?: number;
} = {}): ConflictEventEntity {
  return {
    id: 'gdelt-test-1',
    type: overrides.type ?? 'airstrike',
    lat: 33.3152,
    lng: 44.3661,
    timestamp: Date.now(),
    label: 'Test event',
    data: {
      eventType: 'Aerial weapons',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: overrides.actor1 ?? '',
      actor2: overrides.actor2 ?? '',
      notes: '',
      source: 'http://example.com/article',
      goldsteinScale: overrides.goldsteinScale ?? -5,
      locationName: 'Baghdad, Iraq',
      cameoCode: '195',
      numMentions: overrides.numMentions,
      numSources: overrides.numSources,
    },
  };
}

describe('eventScoring', () => {
  describe('GOLDSTEIN_CEILINGS', () => {
    it('has entries for all 11 ConflictEventTypes', () => {
      const expectedTypes: ConflictEventType[] = [
        'airstrike', 'ground_combat', 'shelling', 'bombing',
        'assassination', 'abduction', 'assault', 'blockade',
        'ceasefire_violation', 'mass_violence', 'wmd',
      ];
      for (const type of expectedTypes) {
        expect(GOLDSTEIN_CEILINGS).toHaveProperty(type);
      }
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

    it('reclassifies airstrike with Goldstein=-1 (exceeds -5 ceiling by 4 > 3) to shelling', () => {
      // ceiling=-5, goldstein=-1, diff = -1 - (-5) = 4 > 3 --> reclassify
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -1 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('shelling');
    });

    it('does NOT reclassify airstrike with Goldstein=-3 (exceeds -5 ceiling by 2, within 3 tolerance)', () => {
      // ceiling=-5, goldstein=-3, diff = -3 - (-5) = 2 <= 3 --> no reclassify
      const event = makeTestEvent({ type: 'airstrike', goldsteinScale: -3 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('airstrike');
    });

    it('does NOT reclassify assault (no downgrade target)', () => {
      const event = makeTestEvent({ type: 'assault', goldsteinScale: -0.5 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('assault');
    });

    it('reclassifies mass_violence with Goldstein=-2 to assault', () => {
      // ceiling=-7, goldstein=-2, diff = -2 - (-7) = 5 > 3 --> reclassify to assault
      const event = makeTestEvent({ type: 'mass_violence', goldsteinScale: -2 });
      const result = applyGoldsteinSanity(event);
      expect(result.type).toBe('assault');
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

    it('returns ~0.15-0.25 for low-signal event', () => {
      const event = makeTestEvent({
        type: 'airstrike',
        actor1: '',
        actor2: '',
        goldsteinScale: 0,
        numMentions: 1,
        numSources: 1,
      });
      const score = computeEventConfidence(event, 'centroid');
      expect(score).toBeGreaterThanOrEqual(0.10);
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
      // Difference should be geo precision weight * (1.0 - 0.3) = 0.15 * 0.7 = 0.105
      expect(scorePrecise - scoreCentroid).toBeCloseTo(0.105, 2);
    });

    it('actor specificity: both actors > one actor > no actors', () => {
      const both = computeEventConfidence(
        makeTestEvent({ actor1: 'A', actor2: 'B', goldsteinScale: -5, numMentions: 5, numSources: 3 }),
        'precise',
      );
      const one = computeEventConfidence(
        makeTestEvent({ actor1: 'A', actor2: '', goldsteinScale: -5, numMentions: 5, numSources: 3 }),
        'precise',
      );
      const none = computeEventConfidence(
        makeTestEvent({ actor1: '', actor2: '', goldsteinScale: -5, numMentions: 5, numSources: 3 }),
        'precise',
      );
      expect(both).toBeGreaterThan(one);
      expect(one).toBeGreaterThan(none);
    });
  });
});
