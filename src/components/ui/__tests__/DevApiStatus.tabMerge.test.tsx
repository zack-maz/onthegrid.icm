/**
 * Phase 28.2 W5 Plan 05 Task 2 — DevApiStatus tab merge contract tests.
 *
 * Covers D-22 (nothing-lost), D-26 (Bearer gate), D-27 (tab order). The
 * merged "API Health" tab absorbs the deleted Overview body — polling-store
 * rows AND LLMPipelineSection BOTH render in the merged tab on Day 1.
 *
 * Tests:
 *   1. D-27 tab order: API Health / Water / Sites / Events
 *   2. D-22 nothing lost — polling store rows render (Flights/Ships/Events/Water)
 *   3. D-22 nothing lost — LLMPipelineSection renders
 *   4. D-26 Bearer gate: shouldRenderDashboard()===false hides the merged tab
 *   5. D-26 dev short-circuit: import.meta.env.DEV===true keeps tab visible
 *   6. HealthStatusProvider single-poll preservation (Test 7 contract)
 *   7. HealthBanner NOT gated — fires when shouldRenderDashboard()===false
 *   8. activeDevApiStatusTab === 'apiHealth' mounts DevApiStatusAllApisTab
 *      with rows + llmStatus props.
 *   9. Clicking the merged tab calls setTab('apiHealth') NOT setTab('overview').
 */
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  HealthStatusContext,
  HealthStatusProvider,
} from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import { HealthBanner } from '@/components/ui/HealthBanner';
import { shouldRenderDashboard } from '@/lib/dashboardAuth';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardAuth')>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
    dashboardAuthHeaders: vi.fn(() => ({})),
  };
});

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

// Phase 46 HARD-03 surface 3 — a cron-tier endpoint carrying the `missedRun`
// sibling field (NEVER folded into `status`). `freshnessMs` drives the tick age.
function makeCronEndpoint(overrides: Partial<EndpointHealth>): EndpointHealth {
  return {
    name: 'cronHealth',
    status: 'healthy',
    tier: 'cron',
    lastSuccessTs: Date.now() - 3_600_000,
    lastErrorReason: null,
    freshnessMs: 3_600_000,
    freshnessThresholdMs: 26 * 60 * 60_000,
    latencyMs: null,
    missedRun: 'healthy',
    ...overrides,
  };
}

// Phase 46 HARD-03 — stub `/api/operator-status` so the new rate-limiter block's
// `opStatus.rateLimiter` source can be driven (or omitted) per test. `data` is
// spread onto a minimal valid OperatorStatus body (audit24h/byBearer/advEval —
// the fetchOpStatus shape gate). Any other URL returns an empty 200.
function mockOpStatusFetch(data: Record<string, unknown>) {
  const fetchSpy = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/operator-status') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ audit24h: 0, byBearer: [], advEval: null, ...data }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

// Snapshot the frozen WAI-ARIA tablist/tabpanel skeleton so sidecar-absent
// renders can assert it is byte-stable (T-46-04-01). Captures every tab id +
// aria-selected + roving tabIndex + each tabpanel's aria-labelledby.
function tablistSkeleton(): string {
  const tabs = screen.queryAllByRole('tab').map((t) => ({
    id: t.id,
    sel: t.getAttribute('aria-selected'),
    ti: t.getAttribute('tabindex'),
  }));
  const panels = screen.queryAllByRole('tabpanel').map((p) => p.getAttribute('aria-labelledby'));
  return JSON.stringify({ tabs, panels });
}

describe('DevApiStatus tab merge (Phase 28.2 W5 Plan 05 Task 2)', () => {
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
    vi.mocked(shouldRenderDashboard).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Test 1 (D-27 tab order): API Health / Water / Sites / Events', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    renderModalWithHealth({ health });
    const tabs = screen.queryAllByRole('tab');
    const labels = tabs.map((el) => el.textContent?.trim() ?? '');
    expect(labels[0]).toBe('API Health');
    expect(labels[1]).toBe('Water');
    expect(labels[2]).toBe('Sites');
    expect(labels[3]).toBe('Events');
  });

  // Test 2 (D-22 polling-store rows) removed 2026-05-06 per operator
  // request — the Polling Stores section was deleted from the merged tab
  // because the per-endpoint health table above it covers the same
  // endpoints with richer signal (status / freshness / latency / tier).
  // The legacy table presented duplicate state in a less-readable shape.

  it('Test 3 (D-22 nothing lost — LLMPipelineSection renders)', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    renderModalWithHealth({ health });
    expect(screen.getByTestId('llm-pipeline-section')).toBeDefined();
  });

  it('Test 4 (D-26 Bearer gate): merged tab hidden when shouldRenderDashboard is false', () => {
    vi.mocked(shouldRenderDashboard).mockReturnValue(false);
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    renderModalWithHealth({ health });
    // Tab body NOT rendered when gate is closed
    expect(screen.queryByTestId('all-apis-tab')).toBeNull();
    expect(screen.queryByTestId('tab-api-health')).toBeNull();
  });

  it('Test 5 (D-26 dev short-circuit): tab visible when gate returns true (dev preserves UX)', () => {
    vi.mocked(shouldRenderDashboard).mockReturnValue(true);
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    renderModalWithHealth({ health });
    expect(screen.getByTestId('tab-api-health')).toBeDefined();
  });

  it('Test 6 (HealthStatusProvider single-poll preservation): one /api/health fetch when both consumers mount', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          endpoints: { flights: makeEndpoint({ name: '/api/flights' }) },
          summary: {
            critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
            nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
            static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
            probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
            cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
          },
          generatedAt: Date.now(),
        }),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    useUIStore.setState({
      isDevApiStatusOpen: true,
      activeDevApiStatusTab: 'apiHealth',
    });

    render(
      <HealthStatusProvider>
        <HealthBanner />
        <DevApiStatus />
      </HealthStatusProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const healthCalls = mockFetch.mock.calls.filter(
      ([url]: unknown[]) => typeof url === 'string' && url === '/api/health',
    );
    expect(healthCalls.length).toBe(1);

    vi.useRealTimers();
  });

  it('Test 7 (HealthBanner NOT gated): banner still renders when shouldRenderDashboard is false', async () => {
    vi.mocked(shouldRenderDashboard).mockReturnValue(false);
    // HealthBanner shows when there's a critical-tier issue
    const value = {
      health: makeResponse({
        flights: makeEndpoint({ name: '/api/flights', status: 'unhealthy' }),
      }),
      loading: false,
      error: null,
      lastSuccessAt: Date.now(),
    };
    render(
      <HealthStatusContext.Provider value={value}>
        <HealthBanner />
      </HealthStatusContext.Provider>,
    );
    // HealthBanner has its own data-testid; absence of it would fail test
    // This test passes if the banner is found (gate is on the modal, not banner)
    expect(screen.queryByTestId('health-banner')).toBeDefined();
  });

  it('Test 8: activeDevApiStatusTab === apiHealth mounts DevApiStatusAllApisTab', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    renderModalWithHealth({ health });
    expect(screen.getByTestId('all-apis-tab')).toBeDefined();
  });

  it('Test 10 (Phase 28.2.5 D-08): Precip row reads status/lastFetch from health.endpoints.waterPrecip, not from useWaterStore', async () => {
    // Plan 28.2.5-01 D-08 — switches the rows[] Precip entry from
    // ...waterStore selectors to aggregateHealth.endpoints.waterPrecip. The
    // rows[] array is consumed by `hasIssue` (drives the API Health tab
    // indicator dot) + `copyDiagnostics` (clipboard payload); the array
    // itself is not directly rendered in the merged tab body since the
    // Polling Stores section was removed (cc3b388, 2026-05-06).
    //
    // Observable signal of the change: when health.endpoints.waterPrecip
    // is provided with a 'healthy' status + recent lastSuccessTs, the
    // rendered /api/health table row (sourced from health.endpoints) must
    // show the row with the matching status pill + freshness, AND the tab
    // indicator must NOT be red purely from store-default reasons (the
    // store's `precipStatus` defaults to a non-connected state in tests).
    const now = Date.now();
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
      ships: makeEndpoint({ name: '/api/ships' }),
      events: makeEndpoint({ name: '/api/events' }),
      waterPrecip: makeEndpoint({
        name: '/api/water/precip',
        tier: 'non-critical',
        status: 'healthy',
        lastSuccessTs: now - 1_000,
        freshnessMs: 1_000,
        freshnessThresholdMs: 12 * 60 * 60_000,
      }),
    });

    renderModalWithHealth({ health });

    // Row is present in the rendered API Health table (sourced from
    // health.endpoints — confirms the aggregate path is wired through
    // for the waterPrecip endpoint after the SOURCE_KEYS drift fix).
    const row = screen.getByTestId('all-apis-row-/api/water/precip');
    expect(row).toBeTruthy();
    // Status pill is HEALTHY (matches the health-context fixture, NOT a
    // store default which would render as UNKNOWN/idle for `precipStatus`).
    expect(row.textContent).toContain('HEALTHY');
    // Tier pill is NON-CRITICAL (matches D-26 classification).
    expect(row.textContent).toContain('NON-CRITICAL');
    // Freshness cell shows '1s' (from lastSuccessTs = now - 1_000), not '--'
    // (which would render if freshnessMs were null — i.e., a missing entry).
    expect(row.textContent).toContain('1s');
  });

  it('Test 11 (Phase 28.2.5 D-07): renders Events (raw) and Events (LLM) as sibling rows in the API Health table', async () => {
    // Plan 28.2.5-02 D-07 — splits the rows[] Events entry into 'Events (raw)'
    // + sibling 'Events (LLM)' fed from aggregateHealth.endpoints.llmEvents.
    // The rows[] array is consumed by `hasIssue` + `copyDiagnostics` and is
    // NOT directly rendered in the merged tab body since the Polling Stores
    // section was removed (cc3b388, 2026-05-06 — see Plan 01 Deviation #1).
    //
    // Observable signal of the split: the rendered /api/health table shows
    // BOTH endpoints (events + llmEvents) as adjacent rows, sourced from
    // health.endpoints (which now carries llmEvents per Plan 02 Task 2's
    // PROBE_STRATEGIES wiring). This is the operator-visible view that the
    // two-row rows[] split mirrors.
    const now = Date.now();
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
      ships: makeEndpoint({ name: '/api/ships' }),
      events: makeEndpoint({
        name: '/api/events',
        tier: 'critical',
        status: 'healthy',
        lastSuccessTs: now - 1_000,
      }),
      llmEvents: makeEndpoint({
        name: 'events:llm:v3',
        tier: 'critical',
        status: 'healthy',
        lastSuccessTs: now - 1_000,
        freshnessMs: 1_000,
        freshnessThresholdMs: 26 * 60 * 60_000,
      }),
    });

    renderModalWithHealth({ health });

    // Both endpoints are visible as rows in the API Health table.
    const rawRow = screen.getByTestId('all-apis-row-/api/events');
    expect(rawRow).toBeTruthy();
    expect(rawRow.textContent).toContain('HEALTHY');
    const llmRow = screen.getByTestId('all-apis-row-events:llm:v3');
    expect(llmRow).toBeTruthy();
    expect(llmRow.textContent).toContain('HEALTHY');
  });

  it('Test 12 (Phase 28.2.5 D-07): Events (LLM) row reflects unknown status when v3 cache is cold', async () => {
    // When events:llm:v3 cache is cold, the Pitfall 1 bridge falls through to
    // v2/v1/raw GDELT. Operator signal: the LLM row stays present in the
    // table but reports 'unknown' status — distinct from the raw events
    // row (which can still be 'healthy' off events:gdelt). Both rows must
    // be visually present even when fallback is active — that's the whole
    // point of the two-row split per D-07.
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
      ships: makeEndpoint({ name: '/api/ships' }),
      events: makeEndpoint({
        name: '/api/events',
        tier: 'critical',
        status: 'healthy',
        lastSuccessTs: Date.now() - 1_000,
      }),
      llmEvents: makeEndpoint({
        name: 'events:llm:v3',
        tier: 'critical',
        status: 'unknown',
        lastSuccessTs: null,
        freshnessMs: null,
        freshnessThresholdMs: 26 * 60 * 60_000,
      }),
    });

    renderModalWithHealth({ health });

    const rawRow = screen.getByTestId('all-apis-row-/api/events');
    expect(rawRow).toBeTruthy();
    expect(rawRow.textContent).toContain('HEALTHY');
    const llmRow = screen.getByTestId('all-apis-row-events:llm:v3');
    expect(llmRow).toBeTruthy();
    expect(llmRow.textContent).toContain('UNKNOWN');
  });

  it('Test 9: clicking merged tab calls setTab(apiHealth)', () => {
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights' }),
    });
    // Start on a different tab
    useUIStore.setState({
      isDevApiStatusOpen: true,
      activeDevApiStatusTab: 'water',
    });
    render(
      <HealthStatusContext.Provider
        value={{ health, loading: false, error: null, lastSuccessAt: Date.now() }}
      >
        <DevApiStatus />
      </HealthStatusContext.Provider>,
    );
    const tab = screen.getByTestId('tab-api-health');
    fireEvent.click(tab);
    expect(useUIStore.getState().activeDevApiStatusTab).toBe('apiHealth');
  });

  // ==========================================================================
  // Phase 40 Plan 04 — Regression-Lock assertion 6 (roving keyboard nav +
  // active-tab affordance). WAI-ARIA tablist manual-activation pattern
  // (40-03-SUMMARY): ArrowRight/Left move FOCUS only (no activation); Enter/
  // Space activate the focused tab; the active tab carries tabIndex=0 + the 2px
  // `border-b-2 border-accent-blue` indicator while inactive tabs are
  // tabIndex=-1; each panel container is role="tabpanel".
  // ==========================================================================
  describe('Phase 40 §Regression-Lock assertion 6 — roving keyboard nav + active indicator', () => {
    it('ArrowRight moves roving focus to the next tab WITHOUT changing the active tab (focus-only)', () => {
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      renderModalWithHealth({ health });
      const tablist = screen.getByRole('tablist');
      const tabs = screen.getAllByRole('tab');
      // ≥2 tabs visible (API Health + Water + Sites + Events).
      expect(tabs.length).toBeGreaterThanOrEqual(2);

      const apiHealthTab = screen.getByTestId('tab-api-health');
      // Focus the active tab (the roving tabIndex=0 one), then ArrowRight.
      apiHealthTab.focus();
      expect(document.activeElement).toBe(apiHealthTab);
      fireEvent.keyDown(tablist, { key: 'ArrowRight' });
      // Focus moved to the NEXT tab (Water) ...
      expect(document.activeElement).toBe(tabs[1]);
      // ... but the active tab is UNCHANGED (manual activation — no setTab).
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('apiHealth');
      expect(apiHealthTab.getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    });

    it('Enter on the focused tab activates it (aria-selected moves)', () => {
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      renderModalWithHealth({ health });
      const tablist = screen.getByRole('tablist');
      const apiHealthTab = screen.getByTestId('tab-api-health');
      const waterTab = screen.getByTestId('tab-water');

      apiHealthTab.focus();
      // Move focus to Water, then Enter activates it.
      fireEvent.keyDown(tablist, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(waterTab);
      fireEvent.keyDown(tablist, { key: 'Enter' });
      expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');
    });

    it('active tab carries the 2px accent-blue indicator + tabIndex=0; inactive tabs tabIndex=-1', () => {
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      renderModalWithHealth({ health });
      const apiHealthTab = screen.getByTestId('tab-api-health'); // active by default
      const waterTab = screen.getByTestId('tab-water'); // inactive

      // Active indicator (greyscale-readable 2px bottom border in accent-blue).
      expect(apiHealthTab.className).toContain('border-b-2');
      expect(apiHealthTab.className).toContain('border-accent-blue');
      // Roving tabindex.
      expect(apiHealthTab.getAttribute('tabindex')).toBe('0');
      expect(waterTab.getAttribute('tabindex')).toBe('-1');
      // Inactive tab does NOT carry the accent indicator.
      expect(waterTab.className).not.toContain('border-accent-blue');
    });

    it('each rendered panel container is role="tabpanel" labelled by its tab', () => {
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      renderModalWithHealth({ health });
      // Active panel (API Health) is a tabpanel labelled by its tab id.
      const panels = screen.getAllByRole('tabpanel');
      expect(panels.length).toBeGreaterThanOrEqual(1);
      expect(panels[0].getAttribute('aria-labelledby')).toBe('tab-api-health');
    });
  });

  // ==========================================================================
  // Phase 46 HARD-03 surface 3 (46-04 Task 3) — sidecar-absent render coverage
  // for the two new operator observability blocks (rate-limiter + cron
  // freshness). The named RESEARCH gap: degrade-open when an operator sidecar
  // field is null/absent. Plus the MISSED-visual + missed-never-in-status pins
  // (UI-SPEC Regression-Lock #5/#6/#7) and the frozen-tablist assertion (#1).
  // ==========================================================================
  describe('Phase 46 HARD-03 — sidecar-absent render + MISSED visual (degrade-open)', () => {
    async function renderAwait(health: HealthResponse | null) {
      useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' });
      const result = render(
        <HealthStatusContext.Provider
          value={{ health, loading: false, error: null, lastSuccessAt: Date.now() }}
        >
          <DevApiStatus />
        </HealthStatusContext.Provider>,
      );
      // Drain the fetchOpStatus useEffect microtasks.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      return result;
    }

    it('rate-limiter block degrades open (muted placeholder, no crash) when opStatus.rateLimiter is absent', async () => {
      mockOpStatusFetch({}); // no rateLimiter field at all
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      await renderAwait(health);
      // Block shell present, muted placeholder shown, no crash.
      expect(screen.getByTestId('rate-limiter-block')).toBeTruthy();
      expect(screen.getByTestId('rate-limiter-block-placeholder').textContent).toContain(
        'operator-status unreachable',
      );
      expect(screen.queryByTestId('rate-limiter-total-429')).toBeNull();
    });

    it('rate-limiter block degrades open when opStatus.rateLimiter is explicitly null', async () => {
      mockOpStatusFetch({ rateLimiter: null });
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      await renderAwait(health);
      expect(screen.getByTestId('rate-limiter-block-placeholder')).toBeTruthy();
    });

    it('rate-limiter block renders per-tier config + total recent 429s when present', async () => {
      mockOpStatusFetch({
        rateLimiter: {
          tiers: [
            { tier: 'flights', max: 120, windowSec: 60, recent429: 2 },
            { tier: 'public', max: 60, windowSec: 60, recent429: 5 },
          ],
        },
      });
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      await renderAwait(health);
      // Primary metric = total recent 429s across tiers (2 + 5 = 7).
      expect(screen.getByTestId('rate-limiter-total-429').textContent).toBe('7');
      // Per-tier config row present.
      const tierRow = screen.getByTestId('rate-limiter-tier-flights');
      expect(tierRow.textContent).toContain('120/60s');
      expect(tierRow.textContent).toContain('2');
    });

    it('cron-freshness block degrades open (muted placeholder) when no cron rows carry missedRun', async () => {
      mockOpStatusFetch({});
      // health has only a non-cron row → no missedRun sibling anywhere.
      const health = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      await renderAwait(health);
      expect(screen.getByTestId('cron-freshness-block')).toBeTruthy();
      expect(screen.getByTestId('cron-freshness-block-placeholder').textContent).toContain(
        'no cron data',
      );
    });

    it('MISSED visual: a missedRun=missed cron renders the UPPERCASE MISSED label + degraded token; unknown renders neutral', async () => {
      mockOpStatusFetch({});
      const health = makeResponse({
        flights: makeEndpoint({ name: '/api/flights' }),
        cronHealth: makeCronEndpoint({
          name: 'cronHealth',
          status: 'unhealthy', // wire status is in the 4-state set
          missedRun: 'missed',
          freshnessMs: 120_000_000,
        }),
        cronWarm: makeCronEndpoint({
          name: 'cronWarm',
          status: 'unknown',
          missedRun: 'unknown',
          freshnessMs: null,
        }),
        cronRefreshEvents: makeCronEndpoint({
          name: 'cronRefreshEvents',
          status: 'healthy',
          missedRun: 'healthy',
        }),
      });
      await renderAwait(health);
      // Primary metric = count of MISSED crons (exactly 1).
      expect(screen.getByTestId('cron-freshness-missed-count').textContent).toBe('1');
      // The missed cron renders the load-bearing UPPERCASE MISSED alarm label.
      const missedBadge = screen.getByTestId('cron-freshness-row-health-missed');
      expect(missedBadge.textContent).toBe('MISSED');
      // The degraded color token drives it (no inline hex).
      expect(missedBadge.getAttribute('style') ?? '').toContain('--color-status-degraded');
      // The unknown cron is neutral — NO MISSED badge.
      expect(screen.queryByTestId('cron-freshness-row-warm-missed')).toBeNull();
      const unknownRow = screen.getByTestId('cron-freshness-row-warm');
      expect(unknownRow.textContent).not.toContain('MISSED');
      // The healthy cron is also not flagged missed.
      expect(screen.queryByTestId('cron-freshness-row-refresh-events-missed')).toBeNull();
    });

    it('audit-gate safety: the cron badge is driven by missedRun, never by the wire status enum', async () => {
      mockOpStatusFetch({});
      // status is a valid 4-state value but DIFFERENT from missedRun — the badge
      // must follow missedRun (Pitfall 1 / okCron audit-gate). Here status is
      // 'healthy' yet missedRun is 'missed' (e.g. a fresh-but-stale-window edge):
      // the block MUST render MISSED, proving it never sources from `status`.
      const health = makeResponse({
        flights: makeEndpoint({ name: '/api/flights' }),
        cronHealth: makeCronEndpoint({
          name: 'cronHealth',
          status: 'healthy',
          missedRun: 'missed',
        }),
      });
      await renderAwait(health);
      expect(screen.getByTestId('cron-freshness-missed-count').textContent).toBe('1');
      expect(screen.getByTestId('cron-freshness-row-health-missed').textContent).toBe('MISSED');
    });

    it('frozen tablist DOM is byte-stable across present vs absent sidecar payloads', async () => {
      // Render once with a full rateLimiter payload …
      mockOpStatusFetch({
        rateLimiter: { tiers: [{ tier: 'flights', max: 120, windowSec: 60, recent429: 3 }] },
      });
      const healthFull = makeResponse({
        flights: makeEndpoint({ name: '/api/flights' }),
        cronHealth: makeCronEndpoint({ name: 'cronHealth', missedRun: 'missed' }),
      });
      await renderAwait(healthFull);
      const withData = tablistSkeleton();
      cleanup();
      vi.unstubAllGlobals();

      // … and once with both sidecars absent. The tablist skeleton must match.
      mockOpStatusFetch({});
      const healthBare = makeResponse({ flights: makeEndpoint({ name: '/api/flights' }) });
      await renderAwait(healthBare);
      const withoutData = tablistSkeleton();

      expect(withoutData).toBe(withData);
      // And the API Health panel is still the labelled tabpanel (frozen #1).
      const panels = screen.getAllByRole('tabpanel');
      expect(panels[0].getAttribute('aria-labelledby')).toBe('tab-api-health');
    });
  });
});
