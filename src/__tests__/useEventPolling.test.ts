import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useEventStore } from '@/stores/eventStore';

const mockResponse = {
  data: [],
  stale: false,
  lastFresh: Date.now(),
};

describe('useEventPolling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset event store
    useEventStore.setState({
      events: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      eventCount: 0,
    });

    // Mock fetch
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Default: tab is visible
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls fetch with /api/events on mount', async () => {
    const { useEventPolling } = await import('@/hooks/useEventPolling');
    renderHook(() => useEventPolling());

    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/events');
  });

  it('schedules next fetch after 900s', async () => {
    const { useEventPolling } = await import('@/hooks/useEventPolling');
    renderHook(() => useEventPolling());

    // Initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should NOT poll at 100s
    await vi.advanceTimersByTimeAsync(100_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should poll at 900s
    await vi.advanceTimersByTimeAsync(800_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('pauses on tab hidden', async () => {
    const { useEventPolling } = await import('@/hooks/useEventPolling');
    renderHook(() => useEventPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tab goes hidden
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Advance well past poll interval (15min + margin)
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resumes on tab visible with immediate fetch', async () => {
    const { useEventPolling } = await import('@/hooks/useEventPolling');
    renderHook(() => useEventPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tab goes hidden
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Tab comes back visible
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT have stale threshold check (events persist)', async () => {
    // Supply fresh data initially
    const freshResponse = {
      data: [{ id: 'event-1', type: 'drone', lat: 32, lng: 51, timestamp: Date.now(), label: 'Test', data: { eventType: 'Test', subEventType: 'Test', fatalities: 0, actor1: '', actor2: '', notes: '', source: '', goldsteinScale: 0, locationName: '', cameoCode: '' } }],
      stale: false,
      lastFresh: Date.now(),
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(freshResponse),
    });

    const { useEventPolling } = await import('@/hooks/useEventPolling');
    renderHook(() => useEventPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(useEventStore.getState().events).toHaveLength(1);

    // Now return stale data for many cycles
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [freshResponse.data[0]], stale: true, lastFresh: Date.now() }),
    });

    // Advance through multiple poll cycles (well past any stale threshold)
    await vi.advanceTimersByTimeAsync(900_000);
    await vi.advanceTimersByTimeAsync(900_000);
    await vi.advanceTimersByTimeAsync(900_000);

    // Events should still be present (never cleared for staleness)
    expect(useEventStore.getState().events).toHaveLength(1);
    expect(useEventStore.getState().connectionStatus).toBe('stale');
  });

  it('cleans up on unmount', async () => {
    const { useEventPolling } = await import('@/hooks/useEventPolling');
    const { unmount } = renderHook(() => useEventPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();

    // Advance time -- should not trigger another fetch
    await vi.advanceTimersByTimeAsync(600_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
