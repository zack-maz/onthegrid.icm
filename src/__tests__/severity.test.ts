import { describe, it, expect, vi } from 'vitest';

import { computeSeverityScore, classifySeverity, SOURCE_TIER_MULTIPLIER } from '../lib/severity';

import type { ConflictEventEntity } from '../../server/types';

/** Helper to create a ConflictEventEntity with sensible defaults */
function makeEvent(
  overrides: Partial<ConflictEventEntity> & { data?: Partial<ConflictEventEntity['data']> } = {},
): ConflictEventEntity {
  const now = Date.now();
  const { data: dataOverrides, ...rest } = overrides;
  return {
    id: 'gdelt-test-1',
    type: 'on_ground',
    lat: 35.6892,
    lng: 51.389,
    timestamp: now, // current time -> max recency
    label: 'Test Event',
    data: {
      eventType: 'Conventional military force',
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'IRAN',
      actor2: 'IRAQ',
      notes: '',
      source: 'https://example.com',
      goldsteinScale: -9.5,
      locationName: 'Tehran, Iran',
      cameoCode: '190',
      numMentions: 10,
      numSources: 5,
      ...dataOverrides,
    },
    ...rest,
  };
}

describe('computeSeverityScore', () => {
  it('returns higher score for airstrike than other (type weight)', () => {
    const airstrike = makeEvent({ type: 'airstrike' });
    const other = makeEvent({ type: 'other' });

    const airstrikeScore = computeSeverityScore(airstrike);
    const otherScore = computeSeverityScore(other);

    expect(airstrikeScore).toBeGreaterThan(otherScore);
  });

  it('returns higher score for events with more mentions', () => {
    const manyMentions = makeEvent({ data: { numMentions: 100, numSources: 5 } });
    const fewMentions = makeEvent({ data: { numMentions: 2, numSources: 5 } });

    const manyScore = computeSeverityScore(manyMentions);
    const fewScore = computeSeverityScore(fewMentions);

    expect(manyScore).toBeGreaterThan(fewScore);
  });

  it('returns higher score for events with more sources', () => {
    const manySources = makeEvent({ data: { numMentions: 10, numSources: 50 } });
    const fewSources = makeEvent({ data: { numMentions: 10, numSources: 2 } });

    const manyScore = computeSeverityScore(manySources);
    const fewScore = computeSeverityScore(fewSources);

    expect(manyScore).toBeGreaterThan(fewScore);
  });

  it('returns lower score for older events (recency decay)', () => {
    const now = Date.now();
    const recent = makeEvent({ timestamp: now });
    const old = makeEvent({ timestamp: now - 48 * 60 * 60 * 1000 }); // 48h ago

    const recentScore = computeSeverityScore(recent);
    const oldScore = computeSeverityScore(old);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('defaults numMentions and numSources to 1 when undefined', () => {
    const withoutMentions = makeEvent({ data: { numMentions: undefined, numSources: undefined } });

    const score = computeSeverityScore(withoutMentions);

    // Should not be 0 or NaN -- should use fallback of 1
    expect(score).toBeGreaterThan(0);
    expect(Number.isNaN(score)).toBe(false);
  });

  it('returns a positive number for any valid event', () => {
    const event = makeEvent();
    const score = computeSeverityScore(event);

    expect(score).toBeGreaterThan(0);
    expect(typeof score).toBe('number');
  });

  it('ranks explosion and targeted equally (both weight 8)', () => {
    // Pin Date.now() with fake timers so recency decay is identical for both
    // computeSeverityScore() calls. Without this, ~microsecond drift between
    // the two Date.now() reads inside computeSeverityScore breaks exact equality.
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const explosion = makeEvent({ type: 'explosion', timestamp: fixedNow });
      const targeted = makeEvent({ type: 'targeted', timestamp: fixedNow });

      expect(computeSeverityScore(explosion)).toBe(computeSeverityScore(targeted));
    } finally {
      vi.useRealTimers();
    }
  });

  it('sourceTier=1 produces higher score than sourceTier=2', () => {
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const tier1 = makeEvent({ timestamp: fixedNow, data: { sourceTier: 1 } });
      const tier2 = makeEvent({ timestamp: fixedNow, data: { sourceTier: 2 } });

      expect(computeSeverityScore(tier1)).toBeGreaterThan(computeSeverityScore(tier2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('sourceTier=3 produces lower score than sourceTier=2', () => {
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const tier3 = makeEvent({ timestamp: fixedNow, data: { sourceTier: 3 } });
      const tier2 = makeEvent({ timestamp: fixedNow, data: { sourceTier: 2 } });

      expect(computeSeverityScore(tier3)).toBeLessThan(computeSeverityScore(tier2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('undefined sourceTier defaults to tier 2 (neutral multiplier)', () => {
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const noTier = makeEvent({ timestamp: fixedNow, data: { sourceTier: undefined } });
      const tier2 = makeEvent({ timestamp: fixedNow, data: { sourceTier: 2 } });

      expect(computeSeverityScore(noTier)).toBe(computeSeverityScore(tier2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('SOURCE_TIER_MULTIPLIER has correct values', () => {
    expect(SOURCE_TIER_MULTIPLIER[1]).toBe(1.5);
    expect(SOURCE_TIER_MULTIPLIER[2]).toBe(1.0);
    expect(SOURCE_TIER_MULTIPLIER[3]).toBe(0.7);
  });
});

describe('classifySeverity', () => {
  it('applies tier multiplier to classification', () => {
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      // Create events near the threshold boundary
      // Tier 1 (1.5x) should boost an event above a threshold that tier 3 (0.7x) wouldn't
      const tier1 = makeEvent({
        type: 'airstrike',
        timestamp: fixedNow,
        data: { numMentions: 20, numSources: 8, sourceTier: 1 },
      });
      const tier3 = makeEvent({
        type: 'airstrike',
        timestamp: fixedNow,
        data: { numMentions: 20, numSources: 8, sourceTier: 3 },
      });

      // Both should classify -- tier1 should be at least as severe as tier3
      const tier1Level = classifySeverity(tier1);
      const tier3Level = classifySeverity(tier3);

      const levelOrder = { high: 3, medium: 2, low: 1 };
      expect(levelOrder[tier1Level]).toBeGreaterThanOrEqual(levelOrder[tier3Level]);
    } finally {
      vi.useRealTimers();
    }
  });
});
