import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useShipStore } from '@/stores/shipStore';

const mockResponse = {
  data: [],
  stale: false,
  lastFresh: Date.now(),
};

describe('useShipPolling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset ship store
    useShipStore.setState({
      ships: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      lastFresh: null,
      shipCount: 0,
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

  it('calls setLoading before first fetch', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

    // Before fetch completes, status should be loading
    expect(useShipStore.getState().connectionStatus).toBe('loading');
    await vi.advanceTimersByTimeAsync(0);
  });

  it('calls fetch with /api/ships on mount', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/ships');
  });

  it('schedules next fetch after 30s', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

    // Initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance past 30s poll interval
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('pauses on tab hidden', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tab goes hidden
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Advance well past poll interval
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resumes on tab visible with immediate fetch', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

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

  it('clears stale data when lastFresh exceeds 120s threshold', async () => {
    // Respond with non-stale data so lastFresh gets set
    const freshResponse = { data: [{ id: 'ship-1', type: 'ship', lat: 26, lng: 56, timestamp: Date.now(), label: 'TEST', data: { mmsi: 1, shipName: 'TEST', speedOverGround: 0, courseOverGround: 0, trueHeading: 0 } }], stale: false, lastFresh: Date.now() };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(freshResponse),
    });

    const { useShipPolling } = await import('@/hooks/useShipPolling');
    renderHook(() => useShipPolling());

    // Initial fetch populates data
    await vi.advanceTimersByTimeAsync(0);
    expect(useShipStore.getState().ships).toHaveLength(1);

    // Now make fetch return stale data (lastFresh won't update)
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], stale: true, lastFresh: Date.now() }),
    });

    // Advance past 120s stale threshold (5 poll cycles of 30s = 150s, past the >120s check)
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);

    // After >120s of stale data, ships should be cleared
    const state = useShipStore.getState();
    expect(state.ships).toEqual([]);
    expect(state.connectionStatus).toBe('error');
  });

  it('cleans up on unmount (clears timeout, removes listener)', async () => {
    const { useShipPolling } = await import('@/hooks/useShipPolling');
    const { unmount } = renderHook(() => useShipPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();

    // Advance time -- should not trigger another fetch
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
