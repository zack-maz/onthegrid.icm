import { describe, it, expect } from 'vitest';
import { normalizeEventTypes } from '../../lib/normalizeEventTypes.js';
import type { ConflictEventEntity } from '../../types.js';

/** Helper to create a minimal ConflictEventEntity for testing */
function makeEvent(
  type: string,
  overrides?: Partial<ConflictEventEntity['data']>,
): ConflictEventEntity {
  return {
    id: `test-${type}-${Date.now()}`,
    type: type as ConflictEventEntity['type'],
    lat: 33.3,
    lng: 44.4,
    timestamp: Date.now(),
    label: `Test ${type}`,
    data: {
      eventType: type,
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'Actor A',
      actor2: 'Actor B',
      notes: '',
      source: 'GDELT',
      goldsteinScale: -5,
      locationName: 'Baghdad',
      cameoCode: '190',
      ...overrides,
    },
  };
}

describe('normalizeEventTypes', () => {
  describe('old type remapping', () => {
    it('maps ground_combat to on_ground', () => {
      const result = normalizeEventTypes([makeEvent('ground_combat')]);
      expect(result[0].type).toBe('on_ground');
    });

    it('maps assault to on_ground', () => {
      const result = normalizeEventTypes([makeEvent('assault')]);
      expect(result[0].type).toBe('on_ground');
    });

    it('maps shelling to explosion', () => {
      const result = normalizeEventTypes([makeEvent('shelling')]);
      expect(result[0].type).toBe('explosion');
    });

    it('maps bombing to explosion', () => {
      const result = normalizeEventTypes([makeEvent('bombing')]);
      expect(result[0].type).toBe('explosion');
    });

    it('maps assassination to targeted', () => {
      const result = normalizeEventTypes([makeEvent('assassination')]);
      expect(result[0].type).toBe('targeted');
    });

    it('maps abduction to targeted', () => {
      const result = normalizeEventTypes([makeEvent('abduction')]);
      expect(result[0].type).toBe('targeted');
    });

    it('maps blockade to other', () => {
      const result = normalizeEventTypes([makeEvent('blockade')]);
      expect(result[0].type).toBe('other');
    });

    it('maps ceasefire_violation to other', () => {
      const result = normalizeEventTypes([makeEvent('ceasefire_violation')]);
      expect(result[0].type).toBe('other');
    });

    it('maps mass_violence to other', () => {
      const result = normalizeEventTypes([makeEvent('mass_violence')]);
      expect(result[0].type).toBe('other');
    });

    it('maps wmd to other', () => {
      const result = normalizeEventTypes([makeEvent('wmd')]);
      expect(result[0].type).toBe('other');
    });
  });

  describe('new type passthrough', () => {
    it('passes airstrike through unchanged', () => {
      const result = normalizeEventTypes([makeEvent('airstrike')]);
      expect(result[0].type).toBe('airstrike');
    });

    it('passes on_ground through unchanged', () => {
      const result = normalizeEventTypes([makeEvent('on_ground')]);
      expect(result[0].type).toBe('on_ground');
    });

    it('passes explosion through unchanged', () => {
      const result = normalizeEventTypes([makeEvent('explosion')]);
      expect(result[0].type).toBe('explosion');
    });

    it('passes targeted through unchanged', () => {
      const result = normalizeEventTypes([makeEvent('targeted')]);
      expect(result[0].type).toBe('targeted');
    });

    it('passes other through unchanged', () => {
      const result = normalizeEventTypes([makeEvent('other')]);
      expect(result[0].type).toBe('other');
    });
  });

  describe('data.eventType normalization', () => {
    it('normalizes data.eventType when it matches an old type', () => {
      const result = normalizeEventTypes([makeEvent('ground_combat')]);
      expect(result[0].data.eventType).toBe('on_ground');
    });

    it('preserves data.eventType when it does not match an old type', () => {
      const event = makeEvent('airstrike', { eventType: 'Air Strike' });
      const result = normalizeEventTypes([event]);
      expect(result[0].data.eventType).toBe('Air Strike');
    });

    it('normalizes data.eventType independently of event.type', () => {
      // Event type is already new, but data.eventType is old
      const event = makeEvent('on_ground', { eventType: 'ground_combat' });
      const result = normalizeEventTypes([event]);
      expect(result[0].type).toBe('on_ground');
      expect(result[0].data.eventType).toBe('on_ground');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = normalizeEventTypes([]);
      expect(result).toEqual([]);
    });

    it('handles mixed old and new types', () => {
      const events = [
        makeEvent('airstrike'),
        makeEvent('ground_combat'),
        makeEvent('on_ground'),
        makeEvent('bombing'),
      ];
      const result = normalizeEventTypes(events);
      expect(result.map((e) => e.type)).toEqual([
        'airstrike',
        'on_ground',
        'on_ground',
        'explosion',
      ]);
    });

    it('does not mutate the input array', () => {
      const events = [makeEvent('ground_combat')];
      const originalType = events[0].type;
      normalizeEventTypes(events);
      expect(events[0].type).toBe(originalType);
    });

    it('does not mutate individual event objects', () => {
      const event = makeEvent('shelling');
      const originalData = event.data;
      normalizeEventTypes([event]);
      expect(event.data).toBe(originalData);
      expect(event.type).toBe('shelling');
    });

    it('returns a new array instance', () => {
      const events = [makeEvent('airstrike')];
      const result = normalizeEventTypes(events);
      expect(result).not.toBe(events);
    });
  });
});
