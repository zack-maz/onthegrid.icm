import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from '@/stores/eventStore';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

const mockDroneEvent: ConflictEventEntity = {
  id: 'event-IRN001',
  type: 'drone',
  lat: 32.6546,
  lng: 51.668,
  timestamp: Date.now(),
  label: 'Air/drone strike',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Air/drone strike',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Unknown',
    notes: '',
    source: 'ISNA',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '183',
  },
};

const mockMissileEvent: ConflictEventEntity = {
  id: 'event-IRN002',
  type: 'missile',
  lat: 35.6892,
  lng: 51.389,
  timestamp: Date.now(),
  label: 'Shelling/artillery/missile attack',
  data: {
    eventType: 'Explosions/Remote violence',
    subEventType: 'Shelling/artillery/missile attack',
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
      data: [mockDroneEvent, mockMissileEvent],
      stale: false,
      lastFresh: Date.now(),
    };

    useEventStore.getState().setEventData(response);

    const state = useEventStore.getState();
    expect(state.events).toEqual([mockDroneEvent, mockMissileEvent]);
    expect(state.eventCount).toBe(2);
    expect(state.connectionStatus).toBe('connected');
    expect(state.lastFetchAt).not.toBeNull();
  });

  it('setEventData with stale response sets status to stale', () => {
    const staleResponse: CacheResponse<ConflictEventEntity[]> = {
      data: [mockDroneEvent],
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
});
