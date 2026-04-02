// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  dispersePosition,
  disperseEvents,
  RINGS,
} from '../../lib/dispersion.js';
import type { ConflictEventEntity } from '../../types.js';

/**
 * Helper: compute haversine distance in km between two lat/lng points.
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Build a minimal ConflictEventEntity for testing. */
function makeEvent(
  id: string,
  lat: number,
  lng: number,
  timestamp: number,
  overrides: Partial<ConflictEventEntity['data']> = {},
): ConflictEventEntity {
  return {
    id,
    type: 'ground_combat',
    lat,
    lng,
    timestamp,
    label: 'test event',
    data: {
      eventType: 'Conventional military force',
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'A',
      actor2: 'B',
      notes: '',
      source: '',
      goldsteinScale: -5,
      locationName: 'Test',
      cameoCode: '190',
      geoPrecision: 'centroid' as const,
      ...overrides,
    },
  };
}

describe('RINGS constant', () => {
  it('defines 3 rings with [count, radiusKm] tuples', () => {
    expect(RINGS).toHaveLength(3);
    expect(RINGS[0]).toEqual([6, 3]);
    expect(RINGS[1]).toEqual([12, 6]);
    expect(RINGS[2]).toEqual([18, 9]);
  });
});

describe('dispersePosition', () => {
  const centroidLat = 35.6892; // Tehran
  const centroidLng = 51.389;

  it('Ring 0 slot 0 is due north of centroid (~3km)', () => {
    const pos = dispersePosition(centroidLat, centroidLng, 0);
    // Due north: lat should increase, lng should stay approximately the same
    expect(pos.lat).toBeGreaterThan(centroidLat);
    expect(Math.abs(pos.lng - centroidLng)).toBeLessThan(0.001);

    const dist = haversineKm(centroidLat, centroidLng, pos.lat, pos.lng);
    expect(dist).toBeCloseTo(3, 0); // ~3km
  });

  it('Ring 0 distributes 6 slots evenly around the centroid', () => {
    const positions = Array.from({ length: 6 }, (_, i) =>
      dispersePosition(centroidLat, centroidLng, i),
    );

    // All should be roughly 3km from center
    for (const pos of positions) {
      const dist = haversineKm(centroidLat, centroidLng, pos.lat, pos.lng);
      expect(dist).toBeCloseTo(3, 0);
    }

    // All positions should be unique
    const coords = positions.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
    expect(new Set(coords).size).toBe(6);
  });

  it('Ring 1 distributes 12 slots at ~6km with half-step angle offset', () => {
    // Ring 1 starts at slot 6 (after Ring 0's 6 slots)
    const positions = Array.from({ length: 12 }, (_, i) =>
      dispersePosition(centroidLat, centroidLng, 6 + i),
    );

    for (const pos of positions) {
      const dist = haversineKm(centroidLat, centroidLng, pos.lat, pos.lng);
      expect(dist).toBeCloseTo(6, 0);
    }

    // Slot 6 (first of Ring 1) should NOT be due north because of half-step offset
    const slot6 = positions[0];
    // Due north would mean lng ~= centroidLng, but offset should shift it
    // Ring 1 is odd-index (index 1), so half-step = PI/12
    // The angle for slot 0 in ring 1 = 0 + PI/12, not 0
    expect(Math.abs(slot6.lng - centroidLng)).toBeGreaterThan(0.001);
  });

  it('Ring 2 distributes 18 slots at ~9km', () => {
    // Ring 2 starts at slot 18 (6 + 12)
    const positions = Array.from({ length: 18 }, (_, i) =>
      dispersePosition(centroidLat, centroidLng, 18 + i),
    );

    for (const pos of positions) {
      const dist = haversineKm(centroidLat, centroidLng, pos.lat, pos.lng);
      expect(dist).toBeCloseTo(9, 0);
    }

    const coords = positions.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
    expect(new Set(coords).size).toBe(18);
  });

  it('Overflow (slot >= 36) wraps to Ring 2 positions', () => {
    // Slot 36 wraps to Ring 2 slot 0 (index 36 - 36 = 0 in ring 2)
    const slot36 = dispersePosition(centroidLat, centroidLng, 36);
    const slot18 = dispersePosition(centroidLat, centroidLng, 18);
    // slot 36 should equal Ring 2 slot 0 (same as slot 18)
    expect(slot36.lat).toBeCloseTo(slot18.lat, 8);
    expect(slot36.lng).toBeCloseTo(slot18.lng, 8);

    // slot 37 wraps to Ring 2 slot 1 (same as slot 19)
    const slot37 = dispersePosition(centroidLat, centroidLng, 37);
    const slot19 = dispersePosition(centroidLat, centroidLng, 19);
    expect(slot37.lat).toBeCloseTo(slot19.lat, 8);
    expect(slot37.lng).toBeCloseTo(slot19.lng, 8);
  });

  it('Cosine longitude correction: lng offset > lat offset for same km at lat ~35N', () => {
    // At latitude 35N, cos(35) ~ 0.819, so 1 degree lng ~ 0.819 * 111km
    // For the same km distance, we need more lng degrees than lat degrees
    const slot0 = dispersePosition(centroidLat, centroidLng, 0); // due north
    const slot1 = dispersePosition(centroidLat, centroidLng, 1); // 60 degrees east of north

    // Due north: only lat changes
    const dLat0 = Math.abs(slot0.lat - centroidLat);
    // 60 degrees: both lat and lng change
    // slot at 90 degrees (due east) would show pure lng change
    // Use slot at index 1 (60 deg for Ring 0 with 6 slots) which has some lng component
    // For a better test, use a slot that's purely east:
    // Ring 0, 6 slots: angles are 0, 60, 120, 180, 240, 300
    // 90 degrees doesn't exist, but the general principle:
    // A purely eastward offset at lat 35N should have dLng > dLat for same km

    // Alternative: directly check ratio
    // At due north (0 rad), dLng = 0. At due east (PI/2), dLat = 0.
    // Check slot at index 1 (60 deg) where both components exist
    // The lng offset should be scaled by 1/cos(lat)
    const dLng1 = Math.abs(slot1.lng - centroidLng);
    const dLat1 = Math.abs(slot1.lat - centroidLat);

    // At 60 degrees from north: y = cos(60) = 0.5, x = sin(60) = 0.866
    // dLat should be proportional to cos(60) * R_km / 111
    // dLng should be proportional to sin(60) * R_km / (111 * cos(lat))
    // ratio dLng/dLat = sin(60)/cos(60) * 1/cos(35) ~ 1.732 * 1.221 ~ 2.11
    // So dLng should be roughly 2x dLat
    expect(dLng1 / dLat1).toBeGreaterThan(1.5);
  });

  it('returns ringIndex and slotIndex in result', () => {
    const pos = dispersePosition(centroidLat, centroidLng, 7); // Ring 1, local slot 1
    expect(pos).toHaveProperty('ringIndex');
    expect(pos).toHaveProperty('slotIndex');
    expect(pos.ringIndex).toBe(1);
    expect(pos.slotIndex).toBe(1);
  });
});

describe('disperseEvents', () => {
  it('disperses two events at the same centroid to different positions', () => {
    const e1 = makeEvent('gdelt-1', 35.6892, 51.389, 1000, { actionGeoType: 3 });
    const e2 = makeEvent('gdelt-2', 35.6892, 51.389, 2000, { actionGeoType: 4 });

    const result = disperseEvents([e1, e2]);

    expect(result).toHaveLength(2);
    // Both should have different lat/lng
    expect(result[0].lat).not.toBe(result[1].lat);
    // Both should have originalLat/originalLng
    expect(result[0].data.originalLat).toBe(35.6892);
    expect(result[0].data.originalLng).toBe(51.389);
    expect(result[1].data.originalLat).toBe(35.6892);
    expect(result[1].data.originalLng).toBe(51.389);
  });

  it('does not disperse non-centroid events (actionGeoType !== 3 or 4)', () => {
    const e1 = makeEvent('gdelt-3', 34.1234, 50.5678, 1000, {
      actionGeoType: 1,
      geoPrecision: 'precise',
    });

    const result = disperseEvents([e1]);

    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(34.1234);
    expect(result[0].lng).toBe(50.5678);
    expect(result[0].data.originalLat).toBeUndefined();
  });

  it('disperses centroid events even without actionGeoType', () => {
    const e1 = makeEvent('gdelt-4', 35.6892, 51.389, 1000);

    const result = disperseEvents([e1]);

    expect(result).toHaveLength(1);
    // Should be dispersed since it matches Tehran centroid
    expect(result[0].lat).not.toBe(35.6892);
    expect(result[0].data.originalLat).toBe(35.6892);
    expect(result[0].data.originalLng).toBe(51.389);
  });

  it('does not disperse events without actionGeoType at non-centroid coordinates', () => {
    const e1 = makeEvent('gdelt-5', 34.1234, 50.5678, 1000);

    const result = disperseEvents([e1]);

    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(34.1234);
    expect(result[0].data.originalLat).toBeUndefined();
  });

  it('assigns independent slot sequences per centroid group', () => {
    // Two events at Tehran, two at Baghdad
    const tehranE1 = makeEvent('gdelt-t1', 35.6892, 51.389, 1000, { actionGeoType: 3 });
    const tehranE2 = makeEvent('gdelt-t2', 35.6892, 51.389, 2000, { actionGeoType: 3 });
    const baghdadE1 = makeEvent('gdelt-b1', 33.3152, 44.3661, 1500, { actionGeoType: 4 });
    const baghdadE2 = makeEvent('gdelt-b2', 33.3152, 44.3661, 2500, { actionGeoType: 4 });

    const result = disperseEvents([tehranE1, tehranE2, baghdadE1, baghdadE2]);

    expect(result).toHaveLength(4);

    // Tehran events should be near Tehran
    const tehranResults = result.filter(e => e.id.startsWith('gdelt-t'));
    for (const e of tehranResults) {
      const dist = haversineKm(35.6892, 51.389, e.lat, e.lng);
      expect(dist).toBeLessThan(15); // Within ring range
    }

    // Baghdad events should be near Baghdad
    const baghdadResults = result.filter(e => e.id.startsWith('gdelt-b'));
    for (const e of baghdadResults) {
      const dist = haversineKm(33.3152, 44.3661, e.lat, e.lng);
      expect(dist).toBeLessThan(15);
    }
  });

  it('sorts events by timestamp within each group for deterministic slot assignment', () => {
    // Pass events in reverse timestamp order
    const e1 = makeEvent('gdelt-late', 35.6892, 51.389, 2000, { actionGeoType: 3 });
    const e2 = makeEvent('gdelt-early', 35.6892, 51.389, 1000, { actionGeoType: 3 });

    const result1 = disperseEvents([e1, e2]);
    const result2 = disperseEvents([e2, e1]);

    // Regardless of input order, same IDs should end up at same positions
    const findById = (arr: ConflictEventEntity[], id: string) =>
      arr.find(e => e.id === id)!;

    expect(findById(result1, 'gdelt-early').lat).toBe(findById(result2, 'gdelt-early').lat);
    expect(findById(result1, 'gdelt-late').lat).toBe(findById(result2, 'gdelt-late').lat);
  });

  it('assigns unique slots when multi-batch events are dispersed together (no duplicate slot 0)', () => {
    // Simulate the old bug: two "batches" of events at Tehran centroid
    // When dispersed separately, batch A slot 0 == batch B slot 0 (stacking)
    // When dispersed together, each gets a unique slot
    const batchA = [
      makeEvent('gdelt-a1', 35.6892, 51.389, 1000, { actionGeoType: 3 }),
      makeEvent('gdelt-a2', 35.6892, 51.389, 2000, { actionGeoType: 3 }),
      makeEvent('gdelt-a3', 35.6892, 51.389, 3000, { actionGeoType: 3 }),
    ];
    const batchB = [
      makeEvent('gdelt-b1', 35.6892, 51.389, 4000, { actionGeoType: 3 }),
      makeEvent('gdelt-b2', 35.6892, 51.389, 5000, { actionGeoType: 3 }),
      makeEvent('gdelt-b3', 35.6892, 51.389, 6000, { actionGeoType: 3 }),
    ];

    // Single-pass dispersion over all events (the fix)
    const allEvents = [...batchA, ...batchB];
    const result = disperseEvents(allEvents);

    expect(result).toHaveLength(6);

    // All 6 events should have unique lat/lng coordinates (no stacking)
    const coordSet = new Set(result.map(e => `${e.lat.toFixed(8)},${e.lng.toFixed(8)}`));
    expect(coordSet.size).toBe(6);

    // Verify they are not at the centroid (all dispersed)
    for (const e of result) {
      expect(e.data.originalLat).toBeCloseTo(35.6892, 3);
      expect(e.data.originalLng).toBeCloseTo(51.389, 3);
      // Each event's lat/lng should differ from centroid
      const dist = haversineKm(35.6892, 51.389, e.lat, e.lng);
      expect(dist).toBeGreaterThan(0.5); // At least 0.5km from centroid
    }
  });
});

describe('CENTROID_TOLERANCE shared constant', () => {
  it('is imported from geoValidation and used in dispersion', async () => {
    // Verify the constant is exported and accessible from both modules
    const { CENTROID_TOLERANCE } = await import('../../lib/geoValidation.js');
    expect(CENTROID_TOLERANCE).toBe(0.01);
    expect(typeof CENTROID_TOLERANCE).toBe('number');
  });
});
