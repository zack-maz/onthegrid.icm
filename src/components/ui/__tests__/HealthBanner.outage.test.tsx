/**
 * Phase 28.2 W6 Plan 06 Task 7 — HealthBanner outage integration trace.
 *
 * Adds beyond-unit-test coverage for the HealthBanner toast:
 *   - Test 1: live state transition — banner mounts on outage, clears on
 *             recovery, re-fires on second outage. Confirms it's not a
 *             one-shot.
 *   - Test 2: HealthBanner renders even when shouldRenderDashboard()
 *             returns false (D-26 — the merged DevApiStatus tab is
 *             Bearer-gated, but HealthBanner is intentionally NOT gated;
 *             AppShell mounts it unconditionally per Phase 28.1 W2).
 */
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { HealthBanner } from '@/components/ui/HealthBanner';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardAuth')>('@/lib/dashboardAuth');
  return {
    ...actual,
    // D-26 — toggleable in per-test setup so the second test can flip it false.
    shouldRenderDashboard: vi.fn(() => true),
  };
});

function makeEndpoint(overrides: Partial<EndpointHealth>): EndpointHealth {
  return {
    name: '/api/flights',
    status: 'healthy',
    tier: 'critical',
    lastSuccessTs: Date.now(),
    lastErrorReason: null,
    freshnessMs: 1_000,
    freshnessThresholdMs: 120_000,
    latencyMs: 8,
    ...overrides,
  };
}

function makeResponse(endpoints: Record<string, EndpointHealth>): HealthResponse {
  const summary = {
    critical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
    cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
  };
  for (const ep of Object.values(endpoints)) {
    if (ep.tier === 'critical') summary.critical[ep.status] += 1;
  }
  return { endpoints, summary, generatedAt: Date.now() };
}

describe('HealthBanner outage integration trace (Phase 28.2 W6 Task 7)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Test 5 (live state transition): banner appears on outage, clears on recovery, re-fires on next outage', () => {
    // Initial: critical-tier endpoint unhealthy → banner renders.
    const unhealthy = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });
    const healthy = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'healthy' }),
    });

    const { rerender } = render(
      <HealthStatusContext.Provider
        value={{ health: unhealthy, loading: false, error: null, lastSuccessAt: Date.now() }}
      >
        <HealthBanner />
      </HealthStatusContext.Provider>,
    );
    expect(screen.queryByTestId('health-banner')).toBeTruthy();

    // Recovery: status flips to healthy → banner clears.
    act(() => {
      rerender(
        <HealthStatusContext.Provider
          value={{ health: healthy, loading: false, error: null, lastSuccessAt: Date.now() }}
        >
          <HealthBanner />
        </HealthStatusContext.Provider>,
      );
    });
    expect(screen.queryByTestId('health-banner')).toBeNull();

    // Second outage: banner re-fires (NOT a one-shot per Phase 28.1 W2 contract).
    act(() => {
      rerender(
        <HealthStatusContext.Provider
          value={{ health: unhealthy, loading: false, error: null, lastSuccessAt: Date.now() }}
        >
          <HealthBanner />
        </HealthStatusContext.Provider>,
      );
    });
    expect(screen.queryByTestId('health-banner')).toBeTruthy();
  });

  it('Test 6 (D-26 contract): HealthBanner renders even when shouldRenderDashboard() returns false', async () => {
    // Flip the mock so shouldRenderDashboard() returns false. Per D-26, the
    // merged DevApiStatus tab IS gated, but HealthBanner is intentionally
    // NOT — AppShell mounts it unconditionally so anonymous users see
    // critical outages (transparency pillar).
    const dashAuth = await import('@/lib/dashboardAuth');
    vi.mocked(dashAuth.shouldRenderDashboard).mockReturnValue(false);

    const unhealthy = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });

    render(
      <HealthStatusContext.Provider
        value={{ health: unhealthy, loading: false, error: null, lastSuccessAt: Date.now() }}
      >
        <HealthBanner />
      </HealthStatusContext.Provider>,
    );

    // Banner still renders — HealthBanner does NOT consult
    // shouldRenderDashboard(). Per Phase 28.1 W2 user decision (UI-SPEC
    // §Q1 default OVERRIDDEN): banner mounted UNCONDITIONALLY.
    expect(screen.queryByTestId('health-banner')).toBeTruthy();
  });
});
