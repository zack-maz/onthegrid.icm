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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as ProviderModule from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

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
    activeDevApiStatusTab: 'apiHealth',
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
      activeDevApiStatusTab: 'apiHealth',
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
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

// ===========================================================================
// Phase 40 Plan 04 — Regression-Lock Contract (UI-SPEC §Regression-Lock).
// Render-contract assertions 1–4 (assertion 5 = drawer, lives in prune.test +
// operatorActions.test; assertion 6 = roving keyboard nav, tabMerge.test;
// assertion 7 = colorBridge byte-identity, Plan 01; assertion 8 = consolidated
// snapshot, DevApiStatusConsolidatedLayout.snapshot.test). These lock the
// consolidated hero + 4-group + honest-degraded-render shape (D-01/D-05/D-06).
//
// Reuses the prune.test.tsx operator-status mock builder pattern: route the
// stubbed fetch by URL so the per-test `opStatusPayload` mutation steers what
// the hero (budget %, dead-URL count) + Group 4 see. `health=null` +
// operator-status returning 404 drives the all-null honest-render cases.
// ===========================================================================

interface OperatorStatusPayload {
  audit24h: number;
  byBearer: Array<{ bearerFingerprint: string; actions: number; swaps: number; replays: number }>;
  advEval: { total: number; blocked: number; leaked: number } | null;
  prune: { deadUrlCount: number; last24hPrunes: number; deadUrlSample: never[] } | null;
  tokenBudget: {
    providers: Record<
      string,
      { used: number; cap: number; soft: number; hard: number; state: 'ok' | 'soft' | 'hard' }
    >;
    costShadow: { tokensIn: number; tokensOut: number; usd: number };
  } | null;
}

/** Fully-populated operator-status payload (live values for hero + Group 4). */
function makePopulatedOpStatus(): OperatorStatusPayload {
  return {
    audit24h: 7,
    byBearer: [],
    advEval: null,
    prune: { deadUrlCount: 4, last24hPrunes: 1, deadUrlSample: [] },
    tokenBudget: {
      providers: { nvidia_nim: { used: 600, cap: 1000, soft: 800, hard: 950, state: 'ok' } },
      costShadow: { tokensIn: 1000, tokensOut: 500, usd: 0.0123 },
    },
  };
}

/**
 * Route the stubbed fetch by URL. `opStatus === null` ⇒ /api/operator-status
 * returns a 404-style not-ok body so the component's defensive guard keeps
 * opStatus null (drives the all-null honest-render cases). A non-null payload
 * resolves 200 so the hero + Group 4 hydrate.
 */
function stubOperatorStatusFetch(opStatus: OperatorStatusPayload | null) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url === '/api/operator-status') {
      if (opStatus == null) {
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => opStatus } as Response;
    }
    // audit-status, llm-history, health endpoints — safe not-ok so the
    // component's shape guards short-circuit instead of crashing.
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

describe('DevApiStatus consolidated layout — Phase 40 §Regression-Lock (assertions 1–4)', () => {
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
      // Session-scoped view-state reset so a prior test's collapse/drawer does
      // not leak into the default-expanded / default-closed assertions.
      isOperatorDrawerOpen: false,
      devApiGroupCollapsed: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
      isOperatorDrawerOpen: false,
      devApiGroupCollapsed: {},
    });
  });

  // ---- Assertion 1: all 4 groups render under all-null data (honest render) --
  it('Assertion 1: all 4 group-* sections render even when health AND opStatus are null', async () => {
    stubOperatorStatusFetch(null);
    renderModalWithHealth({ health: null, loading: false });
    // The operator-status fetch resolves not-ok ⇒ the group-level placeholder
    // hydrates. Wait for it so we know the effect ran before asserting.
    await screen.findByTestId('group-operator-actions-placeholder');
    expect(screen.getByTestId('group-endpoint-health')).toBeInTheDocument();
    expect(screen.getByTestId('group-llm-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('group-budget-cost')).toBeInTheDocument();
    expect(screen.getByTestId('group-operator-actions')).toBeInTheDocument();
  });

  // ---- Assertion 2: each null group's body shows the muted placeholder -------
  it('Assertion 2: null group bodies show the muted placeholder (text-white/30 italic + "— no data (...)")', async () => {
    stubOperatorStatusFetch(null);
    renderModalWithHealth({ health: null, loading: false });
    await screen.findByTestId('group-operator-actions-placeholder');
    // Budget (Group 3), FlightRecorder (Group 2), operator-actions group-level
    // (Group 4) placeholders all use the canonical muted markup + copy form.
    for (const testid of [
      'budget-block-placeholder',
      'flight-recorder-placeholder',
      'group-operator-actions-placeholder',
    ]) {
      const el = screen.getByTestId(testid);
      expect(el.className).toContain('text-white/30');
      expect(el.className).toContain('italic');
      expect(el.textContent ?? '').toMatch(/^—\s*no data \(.+\)$/);
    }
  });

  // ---- Assertion 3: hero renders 4 fields; muted fallback when null; live ----
  it('Assertion 3a: hero renders all 4 fields with independent muted fallbacks under all-null', async () => {
    stubOperatorStatusFetch(null);
    renderModalWithHealth({ health: null, loading: false });
    await screen.findByTestId('group-operator-actions-placeholder');
    expect(screen.getByTestId('api-health-hero')).toBeInTheDocument();
    // Each hero field's null state renders the MutedPlaceholder under its own
    // testid; assert the per-field independent fallback copy.
    expect(screen.getByTestId('api-health-hero-endpoints').textContent ?? '').toMatch(
      /no health data/,
    );
    expect(screen.getByTestId('api-health-hero-llm').textContent ?? '').toMatch(/no recorder data/);
    expect(screen.getByTestId('api-health-hero-budget').textContent ?? '').toMatch(
      /no budget data/,
    );
    expect(screen.getByTestId('api-health-hero-deadurls').textContent ?? '').toMatch(
      /no prune data/,
    );
  });

  it('Assertion 3b: hero renders live values (N/M healthy, pct%, dead-URL count) with tabular-nums when populated', async () => {
    stubOperatorStatusFetch(makePopulatedOpStatus());
    const health = makeResponse({
      flights: makeEndpoint({ name: '/api/flights', status: 'healthy' }),
      ships: makeEndpoint({ name: '/api/ships', status: 'unhealthy', tier: 'critical' }),
    });
    renderModalWithHealth({ health });
    // Budget + dead-URL fields depend on the operator-status fetch; wait for it.
    await screen.findByTestId('api-health-hero-budget');

    // Field 1 — endpoints healthy (1 of 2). health is provided synchronously.
    const endpoints = screen.getByTestId('api-health-hero-endpoints');
    expect(endpoints.textContent).toMatch(/1\/2/);
    expect(endpoints.querySelector('.tabular-nums')).not.toBeNull();

    // Field 3 — budget 60% of cap (used 600 / cap 1000), tabular-nums.
    const budget = screen.getByTestId('api-health-hero-budget');
    expect(budget.textContent).toMatch(/60%/);
    expect(budget.querySelector('.tabular-nums')).not.toBeNull();

    // Field 4 — dead URLs = 4 (tabular-nums value span), label "dead URLs".
    const deadurls = screen.getByTestId('api-health-hero-deadurls');
    const deadCountSpan = deadurls.querySelector('.tabular-nums');
    expect(deadCountSpan).not.toBeNull();
    expect(deadCountSpan!.textContent).toBe('4');
    expect(deadurls.textContent).toMatch(/dead URLs/);
  });

  // ---- Assertion 4: default all-expanded; clicking a header toggles hidden ---
  it('Assertion 4: default render is all-expanded; clicking a group header collapses its body', async () => {
    stubOperatorStatusFetch(null);
    const { container } = renderModalWithHealth({ health: null, loading: false });
    await screen.findByTestId('group-operator-actions-placeholder');

    // Default — every group body is present and NOT hidden.
    for (const slug of ['endpoint-health', 'llm-pipeline', 'budget-cost', 'operator-actions']) {
      const body = container.querySelector(`#group-${slug}-body`) as HTMLElement | null;
      expect(body).not.toBeNull();
      expect(body!.hidden).toBe(false);
    }

    // The header buttons report aria-expanded=true while expanded.
    const header = document.getElementById('group-endpoint-health-header') as HTMLButtonElement;
    expect(header.getAttribute('aria-expanded')).toBe('true');

    // Click the Endpoint Health header ⇒ its body becomes hidden + aria flips.
    fireEvent.click(header);
    const collapsedBody = container.querySelector('#group-endpoint-health-body') as HTMLElement;
    expect(collapsedBody.hidden).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    // The other groups stay expanded (independent collapse state).
    const llmBody = container.querySelector('#group-llm-pipeline-body') as HTMLElement;
    expect(llmBody.hidden).toBe(false);
  });
});
