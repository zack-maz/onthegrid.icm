import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from '@/stores/eventStore';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

const mockAirstrikeEvent: ConflictEventEntity = {
  id: 'event-IRN001',
  type: 'airstrike',
  lat: 32.6546,
  lng: 51.668,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'ISNA',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
  },
};

const mockGroundCombatEvent: ConflictEventEntity = {
  id: 'event-IRN002',
  type: 'on_ground',
  lat: 35.6892,
  lng: 51.389,
  timestamp: Date.now(),
  label: 'Conventional military force',
  data: {
    eventType: 'Conventional military force',
    subEventType: 'CAMEO 190',
    fatalities: 3,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'Reuters',
    goldsteinScale: -9.5,
    locationName: 'Tehran, Iran',
    cameoCode: '190',
  },
};

describe('eventStore', () => {
  beforeEach(() => {
    useEventStore.setState({
      events: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      eventCount: 0,
    });
  });

  it('has correct initial state (no lastFresh field)', () => {
    const state = useEventStore.getState();
    expect(state.events).toEqual([]);
    expect(state.connectionStatus).toBe('loading');
    expect(state.lastFetchAt).toBeNull();
    expect(state.eventCount).toBe(0);
    expect('lastFresh' in state).toBe(false);
  });

  it('setEventData with non-stale response sets connected status', () => {
    const response: CacheResponse<ConflictEventEntity[]> = {
      data: [mockAirstrikeEvent, mockGroundCombatEvent],
      stale: false,
      lastFresh: Date.now(),
    };

    useEventStore.getState().setEventData(response);

    const state = useEventStore.getState();
    expect(state.events).toEqual([mockAirstrikeEvent, mockGroundCombatEvent]);
    expect(state.eventCount).toBe(2);
    expect(state.connectionStatus).toBe('connected');
    expect(state.lastFetchAt).not.toBeNull();
  });

  it('setEventData with stale response sets status to stale', () => {
    const staleResponse: CacheResponse<ConflictEventEntity[]> = {
      data: [mockAirstrikeEvent],
      stale: true,
      lastFresh: Date.now(),
    };

    useEventStore.getState().setEventData(staleResponse);

    const state = useEventStore.getState();
    expect(state.connectionStatus).toBe('stale');
  });

  it('setError sets connectionStatus to error', () => {
    useEventStore.getState().setError();
    expect(useEventStore.getState().connectionStatus).toBe('error');
  });

  it('setLoading sets connectionStatus to loading', () => {
    useEventStore.getState().setLoading();
    expect(useEventStore.getState().connectionStatus).toBe('loading');
  });

  it('does not have a clearStaleData action', () => {
    const state = useEventStore.getState();
    expect('clearStaleData' in state).toBe(false);
  });

  describe('observability fields', () => {
    it('setError() with no args sets lastError to "Unknown error"', () => {
      useEventStore.getState().setError();

      const state = useEventStore.getState();
      expect(state.connectionStatus).toBe('error');
      expect(state.lastError).toBe('Unknown error');
    });

    it('setError("Events API 503") sets lastError to "Events API 503"', () => {
      useEventStore.getState().setError('Events API 503');

      expect(useEventStore.getState().lastError).toBe('Events API 503');
    });

    it('setEventData clears lastError to null', () => {
      useEventStore.getState().setError('Some error');
      expect(useEventStore.getState().lastError).toBe('Some error');

      const response: CacheResponse<ConflictEventEntity[]> = {
        data: [mockAirstrikeEvent],
        stale: false,
        lastFresh: Date.now(),
      };
      useEventStore.getState().setEventData(response);

      expect(useEventStore.getState().lastError).toBeNull();
    });

    it('recordFetch appends to recentFetches', () => {
      useEventStore.getState().recordFetch(true, 200);

      const state = useEventStore.getState();
      expect(state.recentFetches).toHaveLength(1);
      expect(state.recentFetches[0]).toMatchObject({
        ok: true,
        durationMs: 200,
      });
    });

    it('recordFetch caps at 10 entries', () => {
      const { recordFetch } = useEventStore.getState();
      for (let i = 0; i < 12; i++) {
        recordFetch(true, i * 10);
      }

      const state = useEventStore.getState();
      expect(state.recentFetches).toHaveLength(10);
      expect(state.recentFetches[0].durationMs).toBe(20);
    });

    it('setNextPollAt sets nextPollAt', () => {
      const ts = Date.now() + 900_000;
      useEventStore.getState().setNextPollAt(ts);

      expect(useEventStore.getState().nextPollAt).toBe(ts);
    });

    it('initial observability fields are correct', () => {
      const state = useEventStore.getState();
      expect(state.lastError).toBeNull();
      expect(state.nextPollAt).toBeNull();
      expect(state.recentFetches).toEqual([]);
    });
  });
});
