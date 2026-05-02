/**
 * Phase 28.1 W2 Task 3 — HealthStatusProvider single-poll regression guard.
 *
 * Tests cover:
 *   - Test 7: TWO consumers inside ONE provider → exactly ONE /api/health
 *     poll per cycle (the headline single-poll invariant).
 *   - Test 8: useHealthStatusContext() outside provider throws.
 *   - Test 9: provider passes { health, loading, error, lastSuccessAt }
 *     through to consumers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  HealthStatusProvider,
  useHealthStatusContext,
} from '@/components/providers/HealthStatusProvider';
import type { HealthResponse } from '@/lib/healthClient';

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

function HealthConsumerStub({ testId }: { testId: string }) {
  const { health } = useHealthStatusContext();
  return (
    <div data-testid={testId}>
      {health ? `crit-healthy=${health.summary.critical.healthy}` : 'no-health-yet'}
    </div>
  );
}

describe('HealthStatusProvider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHealthResponse),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Test 7 (single-poll regression guard): TWO consumers in ONE provider → exactly ONE fetch per cycle', async () => {
    render(
      <HealthStatusProvider>
        <HealthConsumerStub testId="consumer-a" />
        <HealthConsumerStub testId="consumer-b" />
      </HealthStatusProvider>,
    );

    await flush();

    const healthCalls = mockFetch.mock.calls.filter(([url]) => url === '/api/health');
    expect(healthCalls.length).toBe(1);

    // Advance past one poll cycle — still exactly ONE more (not two)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const healthCallsAfterCycle = mockFetch.mock.calls.filter(([url]) => url === '/api/health');
    expect(healthCallsAfterCycle.length).toBe(2);
  });

  it('Test 8: useHealthStatusContext() outside provider throws', () => {
    function ConsumerOutside() {
      useHealthStatusContext();
      return null;
    }
    // Suppress React's error logging in the test output
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ConsumerOutside />)).toThrow(/must be used within HealthStatusProvider/i);
    errSpy.mockRestore();
  });

  it('Test 9: provider passes value through to consumers', async () => {
    render(
      <HealthStatusProvider>
        <HealthConsumerStub testId="consumer" />
      </HealthStatusProvider>,
    );

    await flush();

    expect(screen.getByTestId('consumer').textContent).toContain('crit-healthy=1');
  });
});
