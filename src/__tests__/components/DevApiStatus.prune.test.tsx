// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { LLMStatus } from '@/hooks/useLLMStatusPolling';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFlightStore } from '@/stores/flightStore';
import { useLayerStore } from '@/stores/layerStore';
import { useMarketStore } from '@/stores/marketStore';
import { useNewsStore } from '@/stores/newsStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import { useWeatherStore } from '@/stores/weatherStore';

/**
 * Phase 32 Plan 05 — DevApiStatus dead-URL count + Prune button jsdom tests.
 *
 * Mirrors the DevApiStatusV3.test.tsx pattern: mock useLLMStatusPolling,
 * reset all polling-store slices in beforeEach, open the modal & select the
 * apiHealth tab via uiStore.setState before render().
 *
 * Phase 32 additions (vs V3 test):
 *   - Explicit fetch mock via vi.stubGlobal('fetch', mockFetch). The
 *     component fires /api/operator-status on mount; the prune button
 *     additionally fires POST /api/events/prune-dead-urls on click. Both
 *     must be observable so this file routes by URL inside mockFetch.
 *   - localStorage seed for dashboardAuthHeaders() — the Bearer header
 *     spread is asserted in test 4.
 *
 * Test coverage maps to PLAN.md Task 2 behavior § (9 cases):
 *   1. dead-url-count renders the integer
 *   2. button renders when count > 0
 *   3. button + drill-down absent when count === 0
 *   4. click POSTs to /api/events/prune-dead-urls with body + Bearer
 *   5. 429 → prune-quota-alert renders with resetsAt
 *   6. 200 → fetchOpStatus refresh fires (≥2 /api/operator-status calls)
 *   7. drill-down list renders each entry with status + eventId + url
 *   8. truncation row when count > sample.length
 *   9. drill-down NOT rendered when sample empty
 */

let mockLLMStatus: LLMStatus = { stage: 'idle', lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

const now = Date.now();

function resetAllStores() {
  useFlightStore.setState({
    connectionStatus: 'connected',
    flightCount: 10,
    lastFetchAt: now - 5000,
    lastError: null,
    nextPollAt: now + 3000,
    recentFetches: [{ ok: true, durationMs: 150, timestamp: now }],
    flights: [],
  });
  useShipStore.setState({
    connectionStatus: 'connected',
    shipCount: 5,
    lastFetchAt: now - 10000,
    lastError: null,
    nextPollAt: now + 25000,
    recentFetches: [{ ok: true, durationMs: 300, timestamp: now }],
    ships: [],
  });
  useEventStore.setState({
    connectionStatus: 'connected',
    eventCount: 8,
    lastFetchAt: now - 60000,
    lastError: null,
    nextPollAt: now + 840000,
    recentFetches: [{ ok: true, durationMs: 500, timestamp: now }],
    events: [],
  });
  useSiteStore.setState({
    connectionStatus: 'connected',
    siteCount: 20,
    lastError: null,
    nextPollAt: null,
    recentFetches: [{ ok: true, durationMs: 1200, timestamp: now }],
    sites: [],
    filterStats: null,
  });
  useNewsStore.setState({
    connectionStatus: 'connected',
    clusterCount: 12,
    articleCount: 45,
    lastFetchAt: now - 30000,
    lastError: null,
    nextPollAt: now + 870000,
    recentFetches: [{ ok: true, durationMs: 800, timestamp: now }],
    clusters: [],
  });
  useMarketStore.setState({
    connectionStatus: 'connected',
    lastFetchAt: now - 20000,
    lastError: null,
    nextPollAt: now + 280000,
    recentFetches: [{ ok: true, durationMs: 400, timestamp: now }],
    quotes: [],
  });
  useWeatherStore.setState({
    connectionStatus: 'connected',
    lastFetchAt: now - 120000,
    lastError: null,
    nextPollAt: now + 1680000,
    recentFetches: [{ ok: true, durationMs: 600, timestamp: now }],
    grid: [],
  });
  useWaterStore.setState({
    connectionStatus: 'connected',
    lastError: null,
    nextPollAt: null,
    recentFetches: [{ ok: true, durationMs: 2000, timestamp: now }],
    facilities: [{ id: 'w1', name: 'Test Dam', lat: 33, lng: 51 }] as never[],
  });
}

function openAndSelectApiHealthTab() {
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'apiHealth',
  });
}

interface PruneSample {
  eventId: string;
  url: string;
  status: 'dead-host' | '403' | '404';
}

interface OperatorStatusPayload {
  audit24h: number;
  byBearer: Array<{
    bearerFingerprint: string;
    actions: number;
    swaps: number;
    replays: number;
    prunes?: number;
  }>;
  advEval: { total: number; blocked: number; leaked: number } | null;
  prune: {
    deadUrlCount: number;
    last24hPrunes: number;
    deadUrlSample: PruneSample[];
  } | null;
}

function makeOpStatus(
  overrides: Partial<OperatorStatusPayload['prune']> = {},
): OperatorStatusPayload {
  return {
    audit24h: 1,
    byBearer: [],
    advEval: null,
    prune: {
      deadUrlCount: 3,
      last24hPrunes: 1,
      deadUrlSample: [],
      ...overrides,
    },
  };
}

// Module-level mocks so individual tests can override per case.
let opStatusPayload: OperatorStatusPayload = makeOpStatus();
let pruneResponse: { status: number; body: unknown } = {
  status: 200,
  body: { prunedCount: 3, prunedIds: ['a', 'b', 'c'] },
};

const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
  if (url === '/api/operator-status') {
    return {
      ok: true,
      status: 200,
      json: async () => opStatusPayload,
    } as Response;
  }
  if (url === '/api/events/prune-dead-urls') {
    return {
      ok: pruneResponse.status >= 200 && pruneResponse.status < 300,
      status: pruneResponse.status,
      json: async () => pruneResponse.body,
    } as Response;
  }
  // Everything else (audit-status, health endpoints, etc.) — return a safe
  // not-ok response so the component's defensive guards short-circuit and
  // we don't crash on missing fields.
  return {
    ok: false,
    status: 404,
    json: async () => ({}),
  } as Response;
});

describe('DevApiStatus dead-URL count + Prune button — Phase 32 Plan 05', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.stubGlobal('fetch', mockFetch);
    // Seed dashboardAuthHeaders() so the Bearer spread is non-empty in
    // test 4. NOTE: Node 22's built-in localStorage shadows jsdom's, but
    // it's no-op unless `--localstorage-file` is provided. Stub a working
    // localStorage with an in-memory Map backing store so dashboardAuth's
    // `localStorage.getItem` returns the seeded key.
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage;
    vi.stubGlobal('localStorage', ls);
    Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
    ls.setItem('dashboard:auth-key', 'test-bearer-key');
    resetAllStores();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
      // Phase 40 — reset the session-scoped drawer/collapse view-state so a
      // prior test's drawer-open / group-collapse does not leak into the next.
      isOperatorDrawerOpen: false,
      devApiGroupCollapsed: {},
    });
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    mockLLMStatus = { stage: 'idle', lastRun: null };
    // Reset per-test mock payloads to defaults
    opStatusPayload = makeOpStatus();
    pruneResponse = { status: 200, body: { prunedCount: 3, prunedIds: ['a', 'b', 'c'] } };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders `Dead URL events: 3` when prune.deadUrlCount === 3', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dead-url-count').textContent).toMatch(/Dead URL events: 3/);
  });

  it('renders `Prune 3 dead events` button when deadUrlCount > 0', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Phase 40 (D-02a) — the Prune button relocated into the default-closed
    // operator-controls drawer. Open it before asserting the button renders.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('operator-drawer-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('prune-dead-urls-trigger')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prune-dead-urls-trigger').textContent).toMatch(
      /Prune 3 dead events/,
    );
  });

  it('does NOT render the button or drill-down list when deadUrlCount === 0', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 0, deadUrlSample: [] });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Wait for the count row to render (count=0 still renders) — that's our
    // signal that the initial fetch resolved.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dead-url-count').textContent).toMatch(/Dead URL events: 0/);
    expect(screen.queryByTestId('prune-dead-urls-trigger')).toBeNull();
    expect(screen.queryByTestId('dead-url-list')).toBeNull();
  });

  it('clicking the button POSTs to /api/events/prune-dead-urls with {trigger:"manual"} + Bearer headers', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Phase 40 (D-02a) — open the operator-controls drawer to reach the button.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('operator-drawer-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('prune-dead-urls-trigger')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prune-dead-urls-trigger'));
    });
    await waitFor(() => {
      const pruneCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/events/prune-dead-urls',
      );
      expect(pruneCalls.length).toBeGreaterThanOrEqual(1);
    });
    const pruneCall = mockFetch.mock.calls.find(
      (call) => call[0] === '/api/events/prune-dead-urls',
    );
    expect(pruneCall).toBeDefined();
    const init = pruneCall![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ trigger: 'manual' }));
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer test-bearer-key');
  });

  it('429 response renders the prune-quota-alert with resetsAt', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    pruneResponse = {
      status: 429,
      body: { error: 'prune_quota_exceeded', resetsAt: '2026-05-20T00:00:00Z' },
    };
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Phase 40 (D-02a) — open the operator-controls drawer to reach the button.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('operator-drawer-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('prune-dead-urls-trigger')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('prune-dead-urls-trigger'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('prune-quota-alert')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prune-quota-alert').textContent).toMatch(
      /Resets at 2026-05-20T00:00:00Z/,
    );
  });

  it('200 response triggers an immediate fetchOpStatus refresh (≥2 operator-status calls)', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    pruneResponse = { status: 200, body: { prunedCount: 3, prunedIds: ['a', 'b', 'c'] } };
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Phase 40 (D-02a) — open the operator-controls drawer to reach the button.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('operator-drawer-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('prune-dead-urls-trigger')).toBeInTheDocument();
    });
    // Track operator-status fetches BEFORE the click.
    const beforeClickOpStatusCount = mockFetch.mock.calls.filter(
      (call) => call[0] === '/api/operator-status',
    ).length;
    expect(beforeClickOpStatusCount).toBeGreaterThanOrEqual(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('prune-dead-urls-trigger'));
    });
    await waitFor(() => {
      const afterClickOpStatusCount = mockFetch.mock.calls.filter(
        (call) => call[0] === '/api/operator-status',
      ).length;
      expect(afterClickOpStatusCount).toBeGreaterThan(beforeClickOpStatusCount);
    });
  });

  it('drill-down list renders each deadUrlSample entry with status + eventId + url', async () => {
    opStatusPayload = makeOpStatus({
      deadUrlCount: 2,
      deadUrlSample: [
        { eventId: 'llm-v3-grp1', url: 'https://example.com/a', status: '404' },
        { eventId: 'llm-v3-grp2', url: 'https://example.com/b', status: 'dead-host' },
      ],
    });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-list')).toBeInTheDocument();
    });
    const list = screen.getByTestId('dead-url-list');
    expect(list.textContent).toContain('404');
    expect(list.textContent).toContain('llm-v3-grp1');
    expect(list.textContent).toContain('https://example.com/a');
    expect(list.textContent).toContain('dead-host');
    expect(list.textContent).toContain('llm-v3-grp2');
    expect(list.textContent).toContain('https://example.com/b');
    // Truncation row hidden when count === sample.length
    expect(screen.queryByTestId('dead-url-list-truncated')).toBeNull();
  });

  it('drill-down list shows truncation row when deadUrlCount exceeds sample length', async () => {
    const sample: PruneSample[] = Array.from({ length: 20 }, (_, i) => ({
      eventId: `llm-v3-grp${i}`,
      url: `https://example.com/article-${i}`,
      status: '404' as const,
    }));
    opStatusPayload = makeOpStatus({
      deadUrlCount: 25,
      deadUrlSample: sample,
    });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-list-truncated')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dead-url-list-truncated').textContent).toMatch(/and 5 more/);
  });

  it('drill-down list NOT rendered when deadUrlSample is empty', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 0, deadUrlSample: [] });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dead-url-list')).toBeNull();
  });

  // ==========================================================================
  // Phase 40 Plan 04 — Regression-Lock assertion 5 (drawer default-closed).
  // The destructive Replay + Prune buttons live in a default-closed operator-
  // controls drawer (D-02a). Until the operator opens the drawer, neither the
  // drawer container NOR its buttons are in the document — while the read-only
  // dead-URL count STAYS visible in Group 4. Opening the drawer reveals both
  // buttons. This regression-locks the security-adjacent "destructive controls
  // are not screenshot-default-visible" contract.
  // ==========================================================================
  it('Assertion 5: drawer + Replay/Prune buttons absent by default; read-only dead-URL count present; open reveals both buttons', async () => {
    opStatusPayload = makeOpStatus({ deadUrlCount: 3 });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Read-only count is in Group 4 from first paint after the fetch resolves.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });

    // Default-closed: the drawer container and BOTH destructive triggers are
    // NOT in the document (conditional render, not merely hidden).
    expect(screen.queryByTestId('operator-drawer')).toBeNull();
    expect(screen.queryByTestId('replay-test-trigger')).toBeNull();
    expect(screen.queryByTestId('prune-dead-urls-trigger')).toBeNull();
    // The trigger affordance + the read-only count ARE present.
    expect(screen.getByTestId('operator-drawer-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('operator-drawer-trigger').getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.getByTestId('dead-url-count').textContent).toMatch(/Dead URL events: 3/);

    // Open the drawer ⇒ container + both destructive buttons appear inside it.
    fireEvent.click(screen.getByTestId('operator-drawer-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('operator-drawer')).toBeInTheDocument();
    });
    const drawer = screen.getByTestId('operator-drawer');
    expect(drawer.querySelector('[data-testid="replay-test-trigger"]')).not.toBeNull();
    expect(drawer.querySelector('[data-testid="prune-dead-urls-trigger"]')).not.toBeNull();
    expect(screen.getByTestId('operator-drawer-trigger').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});
