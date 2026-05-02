/**
 * Phase 28.1 W2 Task 5 — DevApiStatus "All APIs" tab body coverage.
 *
 * The tab body is exercised against a stubbed HealthStatusContext rather
 * than the live useHealthStatus hook (no fake-timer plumbing needed for
 * a pure presentation component test).
 *
 * Tests:
 *   1. Loading state renders 5 skeleton rows
 *   2. Error state with no prior data renders the operator-tone message
 *   3. Healthy state renders rows grouped by tier with correct labels
 *   4. Row click toggles expanded JSON detail
 *   5. Source file imports useHealthStatusContext (NOT useHealthStatus
 *      directly) — STATIC-SOURCE regression guard against the double-poll
 *      bug.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import * as ProviderModule from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';

function makeEndpoint(overrides: Partial<EndpointHealth>): EndpointHealth {
  return {
    name: '/api/flights',
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

function renderModalWithHealth(opts: {
  health: HealthResponse | null;
  loading?: boolean;
  error?: Error | null;
}) {
  const { health, loading = false, error = null } = opts;
  const value = { health, loading, error, lastSuccessAt: Date.now() };

  // Open the modal + activate All APIs tab synchronously via the store.
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'allApis',
  });

  return render(
    <ProviderModule.HealthStatusContext.Provider value={value}>
      <DevApiStatus />
    </ProviderModule.HealthStatusContext.Provider>,
  );
}

describe("DevApiStatus 'All APIs' tab", () => {
  beforeEach(() => {
    // Force the dashboard gate open + reset the modal state.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    useFilterStore.setState({ showSites: true });
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'overview',
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'overview',
    });
  });

  it('Test 1: loading state renders 5 skeleton rows', () => {
    renderModalWithHealth({ health: null, loading: true });
    const skel = screen.getByTestId('all-apis-loading');
    expect(skel.querySelectorAll('div').length).toBeGreaterThanOrEqual(5);
  });

  it('Test 2: error state with no prior data renders operator-tone copy', () => {
    renderModalWithHealth({
      health: null,
      loading: false,
      error: new Error('boom'),
    });
    const errBlock = screen.getByTestId('all-apis-error-no-data');
    expect(errBlock.textContent).toContain('/api/health unreachable since page load');
  });

  it('Test 3: healthy state renders tier-grouped rows', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'healthy', tier: 'critical' }),
      news: makeEndpoint({ name: '/api/news', status: 'healthy', tier: 'non-critical' }),
      sites: makeEndpoint({
        name: '/api/sites',
        status: 'unknown',
        tier: 'static',
        lastSuccessTs: null,
        freshnessMs: null,
      }),
    });
    renderModalWithHealth({ health });
    expect(screen.getByTestId('all-apis-tab')).toBeDefined();
    // tier group separators visible
    expect(screen.getByText('Critical')).toBeDefined();
    expect(screen.getByText('Non-critical')).toBeDefined();
    expect(screen.getByText('Static')).toBeDefined();
    // status pills
    expect(screen.getAllByText('HEALTHY').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('UNKNOWN')).toBeDefined();
  });

  it('Test 4: clicking a row expands the JSON detail', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
    });
    renderModalWithHealth({ health });
    const row = screen.getByTestId('all-apis-row-/api/flights');
    fireEvent.click(row);
    const expanded = screen.getByTestId('all-apis-row-expanded-/api/flights');
    expect(expanded.textContent).toContain('"status": "unhealthy"');
    fireEvent.click(row);
    expect(screen.queryByTestId('all-apis-row-expanded-/api/flights')).toBeNull();
  });

  it('Test 5: DevApiStatus.tsx imports useHealthStatusContext (NOT useHealthStatus directly)', () => {
    const sourcePath = resolve(__dirname, '../DevApiStatus.tsx');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('useHealthStatusContext');
    // Forbid a bare useHealthStatus( call (note the parens). Use a negative
    // lookahead so useHealthStatusContext( is NOT flagged.
    expect(source).not.toMatch(/useHealthStatus(?!Context)\(/);
  });
});
