/**
 * Phase 28.2 W6 Plan 06 Task 7 — Audit-result banner wiring tests.
 *
 * The merged DevApiStatus API Health tab fetches /api/audit-status on
 * mount and surfaces the result as a green / red / silent banner per
 * UI-SPEC §5.4 + §10:
 *   - status === 'pass'   → green banner, "All N of M endpoints connecting (last verified <date> via prod audit)."
 *   - status === 'fail'   → red banner, "<N> of <M> endpoints failing connectivity audit. See <names>."
 *   - status === 'absent' → no banner (silent)
 *
 * Plan 06 RED tests for the banner wiring; GREEN replaces the placeholder
 * `<div data-testid="audit-result-banner" />` with the fetch-driven
 * implementation.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardAuth')>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
    dashboardAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-key' })),
  };
});

function makeEndpoint(overrides: Partial<EndpointHealth>): EndpointHealth {
  return {
    name: 'Flights',
    status: 'healthy',
    tier: 'critical',
    lastSuccessTs: Date.now() - 1_000,
    lastErrorReason: null,
    freshnessMs: 1_000,
    freshnessThresholdMs: 120_000,
    latencyMs: 8,
    ...overrides,
  };
}

function makeResponse(): HealthResponse {
  return {
    endpoints: {
      F: makeEndpoint({ name: 'F' }),
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
}

function renderModal(): ReturnType<typeof render> {
  const value = {
    health: makeResponse(),
    loading: false,
    error: null,
    lastSuccessAt: Date.now(),
  };
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'apiHealth',
  });
  return render(
    <HealthStatusContext.Provider value={value}>
      <DevApiStatus />
    </HealthStatusContext.Provider>,
  );
}

/**
 * Build a fetch spy that returns different responses per URL pattern.
 * /api/audit-status → the per-test payload; everything else → empty success.
 */
function mockFetchWithAuditPayload(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/audit-status')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Default 200 empty response for any other fetch (operator-status,
      // etc.) so the merged-tab side panels don't blow up.
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

describe('DevApiStatus audit-result banner (Phase 28.2 W6 Plan 06 Task 7)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    useFilterStore.setState({ showSites: true });
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Test 1 (status=pass): renders green banner with verbatim "All N of M endpoints connecting" copy', async () => {
    mockFetchWithAuditPayload({
      status: 'pass',
      runId: '12345',
      timestamp: '2026-05-04T00:00:00.000Z',
      endpoints: {
        '/api/flights': 'pass',
        '/api/ships': 'pass',
        '/api/events': 'pass',
        '/api/news': 'pass',
        '/api/markets': 'pass',
        '/api/weather': 'pass',
        '/api/sites': 'pass',
        '/api/water': 'pass',
        '/api/water/precip': 'pass',
        '/api/sources': 'pass',
        '/api/events/llm-status': 'pass',
        '/api/dashboard/auth-check': 'pass',
        '/api/geocode': 'pass',
        '/api/cron/health': 'pass',
        '/api/cron/warm': 'pass',
        '/api/cron/refresh-events': 'pass',
      },
      durationMs: 4231,
    });
    renderModal();

    const banner = await waitFor(() => screen.getByTestId('audit-result-banner'));
    expect(banner.textContent).toContain('16 of 16');
    expect(banner.textContent).toContain('connecting');
    expect(banner.textContent).toContain('via prod audit');
    // Green color tokens
    expect(banner.className).toContain('green');
  });

  it('Test 2 (status=fail): renders red banner citing failing endpoint names', async () => {
    mockFetchWithAuditPayload({
      status: 'fail',
      runId: '67890',
      timestamp: '2026-05-04T00:00:00.000Z',
      endpoints: {
        '/api/flights': 'pass',
        '/api/events': 'fail',
        '/api/water': 'fail',
      },
      durationMs: 4231,
    });
    renderModal();

    const banner = await waitFor(() => screen.getByTestId('audit-result-banner'));
    expect(banner.textContent).toContain('failing connectivity audit');
    expect(banner.textContent).toContain('events');
    expect(banner.textContent).toContain('water');
    expect(banner.className).toContain('red');
  });

  it('Test 3 (status=absent): banner is empty (silent)', async () => {
    mockFetchWithAuditPayload({ status: 'absent' });
    renderModal();

    // Wait for any potential render cycle, then assert the banner is empty
    // (the placeholder div remains but has no content).
    await new Promise((resolve) => setTimeout(resolve, 50));
    const banner = screen.queryByTestId('audit-result-banner');
    // Silent — either no banner element OR an empty placeholder.
    if (banner) {
      // Empty placeholder is acceptable per UI-SPEC §5.4.
      expect(banner.textContent ?? '').not.toContain('connecting');
      expect(banner.textContent ?? '').not.toContain('failing');
    }
  });

  it('Test 4 (spacing audit): banner div has px-3 py-2 padding + rounded corner', async () => {
    mockFetchWithAuditPayload({
      status: 'pass',
      timestamp: '2026-05-04T00:00:00.000Z',
      endpoints: { '/api/health': 'pass' },
    });
    renderModal();

    const banner = await waitFor(() => screen.getByTestId('audit-result-banner'));
    // UI-SPEC §5.4 verbatim spacing — multiples of 4 enforced.
    expect(banner.className).toContain('px-3');
    expect(banner.className).toContain('py-2');
    expect(banner.className).toContain('rounded');
    // No py-1.5 / py-0.5 / gap-0.5 (W-1 spacing audit, Plan 05 Task 7 invariant).
    expect(banner.className).not.toContain('py-1.5');
    expect(banner.className).not.toContain('py-0.5');
    expect(banner.className).not.toContain('gap-0.5');
  });
});
