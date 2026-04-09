import { describe, it, expect } from 'vitest';
import type { ConflictEventEntity } from '../../types.js';

// Helper to create a test entity
function makeEntity(overrides: Partial<ConflictEventEntity> & { lat: number; lng: number; data?: Partial<ConflictEventEntity['data']> }): ConflictEventEntity {
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
      source: 'https://example.com',
      goldsteinScale: -10,
      locationName: 'Baghdad, Iraq',
      cameoCode: '195',
      numMentions: 10,
      numSources: 5,
      ...overrides.data,
    },
  };
}

describe('eventGrouping', () => {
  it('merges rows with same date + same CAMEO root + within 50km', async () => {
    const { groupGdeltRows } = await import('../../lib/eventGrouping.js');

    const now = Date.now();
    const sameDay = now;
    // Baghdad coordinates ~33.3, 44.4. Two points 10km apart.
    const entities = [
      makeEntity({ lat: 33.3, lng: 44.4, timestamp: sameDay, data: { cameoCode: '195', numMentions: 10, numSources: 5 } }),
      makeEntity({ lat: 33.35, lng: 44.45, timestamp: sameDay, data: { cameoCode: '193', numMentions: 8, numSources: 3 } }),
    ];

    const groups = groupGdeltRows(entities);
    // Both have CAMEO root '19', same day, <50km apart => 1 group
    expect(groups).toHaveLength(1);
    expect(groups[0].entities).toHaveLength(2);
  });

  it('keeps rows with different dates as separate groups', async () => {
    const { groupGdeltRows } = await import('../../lib/eventGrouping.js');

    const day1 = new Date('2026-03-01T12:00:00Z').getTime();
    const day2 = new Date('2026-03-02T12:00:00Z').getTime();

    const entities = [
      makeEntity({ lat: 33.3, lng: 44.4, timestamp: day1, data: { cameoCode: '195' } }),
      makeEntity({ lat: 33.3, lng: 44.4, timestamp: day2, data: { cameoCode: '195' } }),
    ];

    const groups = groupGdeltRows(entities);
    expect(groups).toHaveLength(2);
  });

  it('keeps rows more than 50km apart as separate groups', async () => {
    const { groupGdeltRows } = await import('../../lib/eventGrouping.js');

    const now = Date.now();
    // Baghdad 33.3, 44.4 vs. Basra 30.5, 47.8 => ~400km apart
    const entities = [
      makeEntity({ lat: 33.3, lng: 44.4, timestamp: now, data: { cameoCode: '195' } }),
      makeEntity({ lat: 30.5, lng: 47.8, timestamp: now, data: { cameoCode: '195' } }),
    ];

    const groups = groupGdeltRows(entities);
    expect(groups).toHaveLength(2);
  });

  it('computes centroid as mean lat/lng of group members', async () => {
    const { groupGdeltRows } = await import('../../lib/eventGrouping.js');

    const now = Date.now();
    const entities = [
      makeEntity({ lat: 33.0, lng: 44.0, timestamp: now, data: { cameoCode: '195' } }),
      makeEntity({ lat: 33.2, lng: 44.2, timestamp: now, data: { cameoCode: '195' } }),
    ];

    const groups = groupGdeltRows(entities);
    expect(groups).toHaveLength(1);
    expect(groups[0].centroidLat).toBeCloseTo(33.1, 1);
    expect(groups[0].centroidLng).toBeCloseTo(44.1, 1);
  });

  it('sums totalMentions and totalSources across group members', async () => {
    const { groupGdeltRows } = await import('../../lib/eventGrouping.js');

    const now = Date.now();
    const entities = [
      makeEntity({ lat: 33.0, lng: 44.0, timestamp: now, data: { cameoCode: '195', numMentions: 10, numSources: 5 } }),
      makeEntity({ lat: 33.1, lng: 44.1, timestamp: now, data: { cameoCode: '193', numMentions: 8, numSources: 3 } }),
    ];

    const groups = groupGdeltRows(entities);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalMentions).toBe(18);
    expect(groups[0].totalSources).toBe(8);
  });
});
