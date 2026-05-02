/**
 * Phase 28.1 W2 Task 3 — useHealthStatus 60s tab-visibility-aware poller.
 *
 * Tests cover:
 *   - Test 1: hook fires fetch on mount, sets loading then resolves
 *   - Test 2: polling cadence (recursive setTimeout, 60s default)
 *   - Test 3: on fetch failure → keep last-known-good health, expose error
 *   - Test 4: visibilitychange='hidden' clears the timer
 *   - Test 5: visibilitychange='visible' triggers immediate fetch
 *   - Test 6: cleanup on unmount removes the visibility listener
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import type { HealthResponse } from '@/lib/healthClient';

/**
 * Flush every queued microtask + advance any pending timers by 0ms so that
 * setState calls scheduled inside the recursive setTimeout chain are
 * applied synchronously before assertions run. `waitFor` from
 * @testing-library/react polls in real time and hangs under
 * `vi.useFakeTimers()`; this helper is the documented vitest workaround.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const mockHealthResponse: HealthResponse = {
  endpoints: {
    flights: {
      name: 'flights',
      status: 'healthy',
      tier: 'critical',
      lastSuccessTs: Date.now() - 1_000,
      lastErrorReason: null,
      freshnessMs: 1_000,
      freshnessThresholdMs: 120_000,
      latencyMs: 8,
    },
  },
  summary: {
    critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
    nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
    cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
  },
  generatedAt: Date.now(),
};

describe('useHealthStatus', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let visibilityAddSpy: ReturnType<typeof vi.spyOn>;
  let visibilityRemoveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHealthResponse),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    visibilityAddSpy = vi.spyOn(document, 'addEventListener');
    visibilityRemoveSpy = vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Test 1: fires initial fetch and resolves loading=false on response', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    const { result } = renderHook(() => useHealthStatus());

    expect(result.current.loading).toBe(true);
    expect(result.current.health).toBeNull();

    await flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/health');

    expect(result.current.loading).toBe(false);
    expect(result.current.health).toEqual(mockHealthResponse);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.lastSuccessAt).toBe('number');
  });

  it('Test 2: polls again after 60s (recursive setTimeout cadence)', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    renderHook(() => useHealthStatus());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance past the 60s poll boundary
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('Test 3: keeps last-known-good health on fetch error; surfaces error', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    const { result } = renderHook(() => useHealthStatus());

    // First poll succeeds
    await flush();
    expect(result.current.health).not.toBeNull();

    // Second poll fails
    mockFetch.mockRejectedValueOnce(new Error('Network down'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // Health is preserved (last-known-good); error is exposed.
    expect(result.current.health).toEqual(mockHealthResponse);
    expect(result.current.error?.message).toContain('Network down');
  });

  it('Test 4: visibilitychange=hidden clears the timer (no further fetches)', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    renderHook(() => useHealthStatus());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Find the visibilitychange handler the hook registered
    const handler = visibilityAddSpy.mock.calls.find(
      ([type]) => type === 'visibilitychange',
    )?.[1] as EventListener | undefined;
    expect(handler).toBeDefined();

    // Hide the tab and fire the event
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    handler?.(new Event('visibilitychange'));

    // Advance past 60s — no new fetch should happen
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Test 5: visibilitychange=visible triggers an immediate fetch', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    renderHook(() => useHealthStatus());

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const handler = visibilityAddSpy.mock.calls.find(
      ([type]) => type === 'visibilitychange',
    )?.[1] as EventListener | undefined;

    // Hide first
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    handler?.(new Event('visibilitychange'));

    // Then show again — immediate fetch
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    handler?.(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Test 6: cleanup on unmount removes the visibilitychange listener', async () => {
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    const { unmount } = renderHook(() => useHealthStatus());

    await vi.advanceTimersByTimeAsync(0);
    unmount();

    expect(visibilityRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('Test 7: non-200 response surfaces error without crashing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    const { useHealthStatus } = await import('@/hooks/useHealthStatus');
    const { result } = renderHook(() => useHealthStatus());

    await flush();

    expect(result.current.health).toBeNull();
    expect(result.current.error?.message).toContain('500');
  });
});
