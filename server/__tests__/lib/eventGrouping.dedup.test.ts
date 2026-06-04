import { describe, it, expect } from 'vitest';

import type { ConflictEventEntity } from '../../types.js';

/**
 * GDELT-MATCH-02 — high-confidence pre-enrichment dedup pass.
 *
 * Thresholds sized by the GDELT-MATCH-01 audit (38-03-SUMMARY.md):
 *   - The size-2 cohort (81 of 134 clusters) is the conservative high-confidence
 *     target. Collapse ONLY when a tight AND-gate passes (same actor pair AND
 *     CAMEO root AND day-bucket AND ≤ tight radius AND high title Jaccard ≥0.85).
 *   - The long tail (size 6–9) is more likely genuine multi-strike activity —
 *     the dedup MUST NOT over-collapse, so distinct events are preserved.
 *
 * D-07: the pass NEVER mutates the raw events:gdelt cache; it is a pure
 *       read-and-filter that drops only collapse-targets.
 */

// Helper mirrors eventGrouping.test.ts makeEntity for shape parity.
function makeEntity(
  overrides: Partial<ConflictEventEntity> & {
    lat: number;
    lng: number;
    data?: Partial<ConflictEventEntity['data']>;
  },
): ConflictEventEntity {
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'airstrike',
    lat: overrides.lat,
    lng: overrides.lng,
    timestamp: overrides.timestamp ?? Date.now(),
    label: overrides.label ?? 'Test event',
    data: {
      eventType: 'Airstrike',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'UNITED STATES',
      actor2: 'IRAN',
      notes: '',
      source: 'https://example.com/a',
      goldsteinScale: -10,
      locationName: 'Baghdad, Iraq',
      cameoCode: '195',
      numMentions: 10,
      numSources: 5,
      ...overrides.data,
    },
  };
}

describe('dedupHighConfidence (GDELT-MATCH-02)', () => {
  const day1 = Date.UTC(2026, 4, 1, 6, 0, 0);

  it('collapses two true duplicates (same actors/CAMEO/day/≤5km/high title Jaccard) to one', async () => {
    const { dedupHighConfidence } = await import('../../lib/eventGrouping.js');

    // Two GDELT mentions of the SAME real-world strike. Baghdad ~33.30,44.40.
    // ~2km apart, same actor pair, same CAMEO root, same day, near-identical title.
    const entities = [
      makeEntity({
        id: 'dup-a',
        lat: 33.3,
        lng: 44.4,
        timestamp: day1,
        label: 'US airstrike hits IRGC compound in Baghdad',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound in Baghdad',
          source: 'https://outlet-a.com/strike',
        },
      }),
      makeEntity({
        id: 'dup-b',
        lat: 33.315,
        lng: 44.41,
        timestamp: day1 + 3_600_000,
        label: 'US airstrike hits IRGC compound in Baghdad today',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound in Baghdad today',
          source: 'https://outlet-b.com/strike',
        },
      }),
    ];

    const result = dedupHighConfidence(entities);
    expect(result).toHaveLength(1);
  });

  it('preserves two distinct events in same city same day but different actor pair', async () => {
    const { dedupHighConfidence } = await import('../../lib/eventGrouping.js');

    const entities = [
      makeEntity({
        id: 'distinct-actor-a',
        lat: 33.3,
        lng: 44.4,
        timestamp: day1,
        label: 'US airstrike hits IRGC compound in Baghdad',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound in Baghdad',
        },
      }),
      makeEntity({
        id: 'distinct-actor-b',
        lat: 33.31,
        lng: 44.41,
        timestamp: day1 + 3_600_000,
        label: 'US airstrike hits IRGC compound in Baghdad',
        data: {
          cameoCode: '195',
          actor1: 'ISRAEL',
          actor2: 'HEZBOLLAH',
          notes: 'US airstrike hits IRGC compound in Baghdad',
        },
      }),
    ];

    const result = dedupHighConfidence(entities);
    expect(result).toHaveLength(2);
  });

  it('preserves two distinct events with same actor/day/city but low title Jaccard', async () => {
    const { dedupHighConfidence } = await import('../../lib/eventGrouping.js');

    const entities = [
      makeEntity({
        id: 'distinct-title-a',
        lat: 33.3,
        lng: 44.4,
        timestamp: day1,
        label: 'US airstrike hits IRGC compound in Baghdad',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound in Baghdad',
        },
      }),
      makeEntity({
        id: 'distinct-title-b',
        lat: 33.31,
        lng: 44.41,
        timestamp: day1 + 3_600_000,
        label: 'Drone shot down over presidential palace district overnight',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'Drone shot down over presidential palace district overnight',
        },
      }),
    ];

    const result = dedupHighConfidence(entities);
    expect(result).toHaveLength(2);
  });

  it('preserves distinct events when geo distance exceeds the tight radius', async () => {
    const { dedupHighConfidence } = await import('../../lib/eventGrouping.js');

    // Same actors/CAMEO/day/title but ~40km apart (inside coarse 50km grouping,
    // OUTSIDE the tight dedup radius). The long-tail multi-strike preservation.
    const entities = [
      makeEntity({
        id: 'far-a',
        lat: 33.3,
        lng: 44.4,
        timestamp: day1,
        label: 'US airstrike hits IRGC compound',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound',
        },
      }),
      makeEntity({
        id: 'far-b',
        lat: 33.66,
        lng: 44.4,
        timestamp: day1 + 3_600_000,
        label: 'US airstrike hits IRGC compound',
        data: {
          cameoCode: '195',
          actor1: 'UNITED STATES',
          actor2: 'IRAN',
          notes: 'US airstrike hits IRGC compound',
        },
      }),
    ];

    const result = dedupHighConfidence(entities);
    expect(result).toHaveLength(2);
  });

  it('keeps the canonical row with the most mentions/sources when collapsing', async () => {
    const { dedupHighConfidence } = await import('../../lib/eventGrouping.js');

    const entities = [
      makeEntity({
        id: 'weak',
        lat: 33.3,
        lng: 44.4,
        timestamp: day1,
        label: 'US airstrike hits IRGC compound in Baghdad',
        data: {
          cameoCode: '195',
          notes: 'US airstrike hits IRGC compound in Baghdad',
          numMentions: 2,
          numSources: 1,
        },
      }),
      makeEntity({
        id: 'strong',
        lat: 33.31,
        lng: 44.41,
        timestamp: day1 + 3_600_000,
        label: 'US airstrike hits IRGC compound in Baghdad today',
        data: {
          cameoCode: '195',
          notes: 'US airstrike hits IRGC compound in Baghdad today',
          numMentions: 40,
          numSources: 9,
        },
      }),
    ];

    const result = dedupHighConfidence(entities);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('strong');
  });
});
