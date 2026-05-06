/**
 * Phase 28.2 W5 Plan 05 Task 7.5 — Operator Actions block + adversarial
 * eval row tests (B-2 + B-5).
 *
 * Covers AI-SPEC §7 Operator Actions block (24h count + per-Bearer
 * breakdown + TTL countdown) and AI-SPEC §5 prompt-injection robustness
 * row in the eval-score block. Sourced from /api/operator-status (the
 * route landed in step 1 of this task).
 */
import { render, screen, cleanup, act } from '@testing-library/react';
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

function makeHealthValue() {
  return {
    health: {
      endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      summary: {
        critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
        nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
        cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      },
      generatedAt: Date.now(),
    } as HealthResponse,
    loading: false,
    error: null,
    lastSuccessAt: Date.now(),
  };
}

function mockOperatorStatus(payload: {
  audit24h: number;
  byBearer: Array<{
    bearerFingerprint: string;
    actions: number;
    swaps: number;
    replays: number;
  }>;
  pinTtl: { version: string; ttlSeconds: number; human: string } | null;
  advEval: { total: number; blocked: number; leaked: number } | null;
}) {
  const fetchSpy = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/operator-status') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

async function renderModal() {
  const value = makeHealthValue();
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'apiHealth',
  });
  const result = render(
    <HealthStatusContext.Provider value={value}>
      <DevApiStatus />
    </HealthStatusContext.Provider>,
  );
  // Allow operator-status useEffect to fetch + state-update.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return result;
}

describe('DevApiStatus Operator Actions + adversarial eval row (Phase 28.2 W5 Task 7.5)', () => {
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

  it('Test 5 (24h rolling action count): renders `24h actions: 30`', async () => {
    mockOperatorStatus({
      audit24h: 30,
      byBearer: [],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    const el = screen.getByTestId('operator-actions-24h-count');
    expect(el.textContent).toContain('24h actions: 30');
  });

  it('Test 6 (per-Bearer breakdown): one row per fingerprint with actions/swaps/replays', async () => {
    mockOperatorStatus({
      audit24h: 5,
      byBearer: [
        { bearerFingerprint: 'abc12345abcdef', actions: 3, swaps: 1, replays: 2 },
        { bearerFingerprint: 'def67890fedcba', actions: 2, swaps: 0, replays: 2 },
      ],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    const r1 = screen.getByTestId('operator-actions-bearer-row-abc12345abcdef');
    expect(r1.textContent).toContain('abc12345');
    expect(r1.textContent).toContain('3 actions');
    expect(r1.textContent).toContain('1 swaps');
    expect(r1.textContent).toContain('2 replays');
    const r2 = screen.getByTestId('operator-actions-bearer-row-def67890fedcba');
    expect(r2.textContent).toContain('def67890');
    expect(r2.textContent).toContain('2 actions');
    expect(r2.textContent).toContain('0 swaps');
    expect(r2.textContent).toContain('2 replays');
  });

  it('Test 7 (TTL countdown): renders `Pinned to v2 — expires in 4h 0m`', async () => {
    mockOperatorStatus({
      audit24h: 1,
      byBearer: [],
      pinTtl: { version: 'v2', ttlSeconds: 14_400, human: 'expires in 4h 0m' },
      advEval: null,
    });
    await renderModal();
    const ttl = screen.getByTestId('operator-actions-pin-ttl');
    expect(ttl.textContent).toContain('Pinned to v2');
    expect(ttl.textContent).toContain('expires in 4h 0m');
  });

  it('Test 7b (TTL absent): renders `no pin active`', async () => {
    mockOperatorStatus({
      audit24h: 0,
      byBearer: [],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    const ttl = screen.getByTestId('operator-actions-pin-ttl');
    expect(ttl.textContent).toContain('no pin active');
  });

  it('Test 8 (adversarial eval row — B-2): `Prompt-injection robustness: 9/10`', async () => {
    mockOperatorStatus({
      audit24h: 0,
      byBearer: [],
      pinTtl: null,
      advEval: { total: 10, blocked: 9, leaked: 1 },
    });
    await renderModal();
    const row = screen.getByTestId('adversarial-eval-row');
    expect(row.textContent).toContain('Prompt-injection robustness: 9/10');
  });

  it('Test 9 (adversarial absent): no row when advEval is null', async () => {
    mockOperatorStatus({
      audit24h: 0,
      byBearer: [],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    expect(screen.queryByTestId('adversarial-eval-row')).toBeNull();
  });

  it('Test 10 (Bearer attached): /api/operator-status fetch carries Bearer', async () => {
    const fetchSpy = mockOperatorStatus({
      audit24h: 0,
      byBearer: [],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    const found = fetchSpy.mock.calls.some((call) => {
      if (String(call[0] ?? '') !== '/api/operator-status') return false;
      const init = call[1] as RequestInit | undefined;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return (headers['Authorization'] ?? '').startsWith('Bearer ');
    });
    expect(found).toBe(true);
  });

  it('Test 12 (W-1 spacing pinning sweep): operator-actions block has no py-0.5 / py-1.5 / gap-0.5', async () => {
    mockOperatorStatus({
      audit24h: 0,
      byBearer: [],
      pinTtl: null,
      advEval: null,
    });
    await renderModal();
    const block = screen.getByTestId('operator-actions');
    const html = block.outerHTML;
    expect(html).not.toContain('py-1.5');
    expect(html).not.toContain('py-0.5');
    expect(html).not.toContain('gap-0.5');
  });
});
