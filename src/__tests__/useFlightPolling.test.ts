import { renderHook, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useFlightStore } from '@/stores/flightStore';

const mockResponse = {
  data: [],
  stale: false,
  lastFresh: Date.now(),
};

describe('useFlightPolling', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset flight store
    useFlightStore.setState({
      flights: [],
      connectionStatus: 'loading',
      lastFetchAt: null,
      lastFresh: null,
      flightCount: 0,
      activeSource: 'opensky',
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

  it('calls fetch with source=opensky on mount', async () => {
    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    renderHook(() => useFlightPolling());

    // Flush the microtask queue so the initial fetch completes
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/flights?source=opensky');
  });

  it('polls again after 5000ms', async () => {
    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    renderHook(() => useFlightPolling());

    // Initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance past poll interval
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rate limited response propagates rateLimited flag to store', async () => {
    const rateLimitedResponse = {
      data: [
        {
          id: 'flight-1',
          type: 'flight',
          lat: 32,
          lng: 53,
          timestamp: Date.now(),
          label: 'TEST',
          data: {},
        },
      ],
      stale: true,
      lastFresh: Date.now(),
      rateLimited: true,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rateLimitedResponse),
    });

    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    renderHook(() => useFlightPolling());

    await vi.advanceTimersByTimeAsync(0);

    const state = useFlightStore.getState();
    expect(state.connectionStatus).toBe('rate_limited');
  });

  it('pauses polling when tab becomes hidden', async () => {
    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    renderHook(() => useFlightPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tab goes hidden
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Advance well past poll interval -- should not trigger another fetch
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resumes with immediate fetch when tab becomes visible', async () => {
    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    renderHook(() => useFlightPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Tab goes hidden
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // Tab comes back visible
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(2); // Immediate fetch on visibility
  });

  it('clears timeout on unmount', async () => {
    const { useFlightPolling } = await import('@/hooks/useFlightPolling');
    const { unmount } = renderHook(() => useFlightPolling());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    unmount();

    // Advance time -- should not trigger another fetch
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
