import { describe, it, expect, vi } from 'vitest';
import { computeSeverityScore } from '../lib/severity';
import type { ConflictEventEntity } from '../../server/types';

/** Helper to create a ConflictEventEntity with sensible defaults */
function makeEvent(overrides: Partial<ConflictEventEntity> & { data?: Partial<ConflictEventEntity['data']> } = {}): ConflictEventEntity {
  const now = Date.now();
  const { data: dataOverrides, ...rest } = overrides;
  return {
    id: 'gdelt-test-1',
    type: 'ground_combat',
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
  it('returns higher score for airstrike than blockade (type weight)', () => {
    const airstrike = makeEvent({ type: 'airstrike' });
    const blockade = makeEvent({ type: 'blockade' });

    const airstrikeScore = computeSeverityScore(airstrike);
    const blockadeScore = computeSeverityScore(blockade);

    expect(airstrikeScore).toBeGreaterThan(blockadeScore);
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

  it('ranks wmd and airstrike equally (both weight 10)', () => {
    // Pin Date.now() with fake timers so recency decay is identical for both
    // computeSeverityScore() calls. Without this, ~microsecond drift between
    // the two Date.now() reads inside computeSeverityScore breaks exact equality.
    const fixedNow = Date.UTC(2026, 5, 1);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const wmd = makeEvent({ type: 'wmd', timestamp: fixedNow });
      const airstrike = makeEvent({ type: 'airstrike', timestamp: fixedNow });

      expect(computeSeverityScore(wmd)).toBe(computeSeverityScore(airstrike));
    } finally {
      vi.useRealTimers();
    }
  });
});
