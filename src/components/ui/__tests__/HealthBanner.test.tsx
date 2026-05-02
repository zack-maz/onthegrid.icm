/**
 * Phase 28.1 W2 Task 4 — HealthBanner toast component coverage.
 *
 * Tests cover:
 *   1. Returns null when health is null (initial load)
 *   2. Returns null when all critical-tier endpoints are healthy
 *   3. Renders banner with single critical-unhealthy endpoint name
 *   4. Renders comma-separated names for 2-3 critical-unhealthy
 *   5. Truncates 4+ to first 3 + "(+N more)"
 *   6. Click Dismiss → banner unmounts (acknowledged set)
 *   7. role='alert' + aria-live='assertive'
 *   8. Imports useHealthStatusContext (NOT useHealthStatus directly) —
 *      regression guard against the double-poll bug.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HealthBanner } from '@/components/ui/HealthBanner';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';

// Reach into the provider module to grab the raw context for test mocking.
// This pattern is acceptable for a test wrapper — the production code path
// always uses HealthStatusProvider.
import * as ProviderModule from '@/components/providers/HealthStatusProvider';

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
  return {
    endpoints,
    summary,
    generatedAt: Date.now(),
  };
}

function renderWithMockedHealth(opts: {
  health: HealthResponse | null;
  loading?: boolean;
  error?: Error | null;
}) {
  const { health, loading = false, error = null } = opts;
  const value = { health, loading, error, lastSuccessAt: Date.now() };
  return render(
    <ProviderModule.HealthStatusContext.Provider value={value}>
      <HealthBanner />
    </ProviderModule.HealthStatusContext.Provider>,
  );
}

describe('HealthBanner', () => {
  it('Test 1: returns null when health is null', () => {
    renderWithMockedHealth({ health: null });
    expect(screen.queryByTestId('health-banner')).toBeNull();
  });

  it('Test 2: returns null when all critical-tier endpoints are healthy', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'healthy' }),
      ships: makeEndpoint({ name: '/api/ships', status: 'healthy' }),
      events: makeEndpoint({ name: '/api/events', status: 'healthy' }),
    });
    renderWithMockedHealth({ health });
    expect(screen.queryByTestId('health-banner')).toBeNull();
  });

  it('Test 3: renders with single critical-unhealthy endpoint name', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });
    renderWithMockedHealth({ health });
    const banner = screen.getByTestId('health-banner');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('API outage');
    expect(banner.textContent).toContain('/api/flights');
  });

  it('Test 4: renders comma-separated names for 2-3 critical-unhealthy', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
      events: makeEndpoint({ name: '/api/events', status: 'unhealthy' }),
    });
    renderWithMockedHealth({ health });
    const banner = screen.getByTestId('health-banner');
    expect(banner.textContent).toContain('/api/flights');
    expect(banner.textContent).toContain('/api/events');
    expect(banner.textContent).toContain(',');
  });

  it('Test 5: truncates 4+ unhealthy endpoints to first 3 + "(+N more)"', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
      events: makeEndpoint({ name: '/api/events', status: 'unhealthy' }),
      ships: makeEndpoint({ name: '/api/ships', status: 'unhealthy' }),
      // 4th critical endpoint to push overflow. Tier classification on extra
      // endpoint is critical too so all four count.
      extra: makeEndpoint({ name: '/api/extra', status: 'unhealthy' }),
    });
    renderWithMockedHealth({ health });
    const banner = screen.getByTestId('health-banner');
    expect(banner.textContent).toContain('+1 more');
  });

  it('Test 6: Dismiss button hides the banner', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });
    renderWithMockedHealth({ health });
    const dismiss = screen.getByLabelText('Dismiss API outage banner');
    fireEvent.click(dismiss);
    expect(screen.queryByTestId('health-banner')).toBeNull();
  });

  it('Test 7: role=alert + aria-live=assertive', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });
    renderWithMockedHealth({ health });
    const banner = screen.getByTestId('health-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
  });

  it('Test 8: source file imports useHealthStatusContext (NOT useHealthStatus directly)', () => {
    // Static-source guard against the double-poll regression. If a future
    // refactor swaps useHealthStatusContext() for useHealthStatus() inside
    // HealthBanner.tsx, two consumers in the AppShell tree (banner + the
    // DevApiStatus All APIs tab) would each spawn their own poller.
    const sourcePath = resolve(__dirname, '../HealthBanner.tsx');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('useHealthStatusContext');
    // Allow the import line for symmetry (e.g., 'useHealthStatusContext') but
    // forbid a bare useHealthStatus( call (note the parens).
    expect(source).not.toMatch(/useHealthStatus\(/);
  });

  it('Test 9: non-critical-tier unhealthy endpoints do NOT trigger banner', () => {
    const health = makeResponse({
      news: makeEndpoint({
        name: '/api/news',
        status: 'unhealthy',
        tier: 'non-critical',
      }),
    });
    renderWithMockedHealth({ health });
    expect(screen.queryByTestId('health-banner')).toBeNull();
  });
});
