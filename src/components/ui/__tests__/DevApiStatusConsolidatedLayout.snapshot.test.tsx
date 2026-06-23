// @vitest-environment jsdom
/**
 * Phase 40 Plan 04 — Regression-Lock assertion 8 (consolidated-layout snapshot).
 *
 * The single layout-shape regression lock for the post-polish API Health tab.
 * Renders `DevApiStatusAllApisTab` (the full modal opened to the apiHealth tab)
 * in the FULLY-POPULATED state — non-null `health` (mix of healthy/degraded
 * endpoints), a populated `opStatus` (audit24h, byBearer, prune with
 * deadUrlCount>0 + sample, actorQuality with counts + sample,
 * tokenBudget.providers.nvidia_nim + costShadow), a FlightRecorder with ≥1 run,
 * hero showing live values, all 4 groups EXPANDED, drawer CLOSED — and snapshots
 * the `all-apis-tab` subtree. The snapshot diffs if the consolidated layout
 * shape (hero + 4 collapsible groups + closed drawer) drifts.
 *
 * Scope: the snapshot is taken of the `data-testid="all-apis-tab"` subtree (NOT
 * the whole modal/app) so unrelated chrome changes (modal header, tab bar) do
 * not churn it.
 *
 * Determinism: `Date.now()` is pinned to a fixed epoch and every fixture
 * timestamp is derived from it, so relative-time strings ("4h ago", freshness)
 * are stable across runs.
 *
 * ---------------------------------------------------------------------------
 * UI-SPEC §Regression-Lock assertion cross-reference (for the next maintainer):
 *   1. all 4 groups render under all-null  → DevApiStatusAllApisTab.test.tsx
 *   2. muted placeholders (text-white/30)  → DevApiStatusAllApisTab.test.tsx +
 *                                             DevApiStatus.diagnosticBlocks.test.tsx +
 *                                             DevApiStatus.actorQuality.test.tsx
 *   3. hero 4-field fallback + live values → DevApiStatusAllApisTab.test.tsx
 *   4. default all-expanded + header toggle→ DevApiStatusAllApisTab.test.tsx
 *   5. drawer default-closed               → DevApiStatus.prune.test.tsx +
 *                                             DevApiStatus.operatorActions.test.tsx
 *   6. roving keyboard nav + active indic. → DevApiStatus.tabMerge.test.tsx
 *   7. --color-status-* byte-identity      → src/__tests__/lib/colorBridge.test.ts (Plan 01)
 *   8. consolidated-layout snapshot        → THIS FILE
 * ---------------------------------------------------------------------------
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { LLMStatus } from '@/hooks/useLLMStatusPolling';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

// Fixed clock so relative-time strings + freshness cells are deterministic.
const FIXED_NOW = 1_700_000_000_000; // 2023-11-14T22:13:20.000Z

// Hero "last run" reads llmStatus.lastRun (a prop in scope) — mock the poller.
let mockLLMStatus: LLMStatus = { stage: 'idle', lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

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
    name: '/api/flights',
    status: 'healthy',
    tier: 'critical',
    lastSuccessTs: FIXED_NOW - 1_000,
    lastErrorReason: null,
    freshnessMs: 1_000,
    freshnessThresholdMs: 120_000,
    latencyMs: 8,
    ...overrides,
  };
}

function makePopulatedHealth(): HealthResponse {
  const endpoints: Record<string, EndpointHealth> = {
    '/api/flights': makeEndpoint({ name: '/api/flights', status: 'healthy', tier: 'critical' }),
    '/api/events': makeEndpoint({ name: '/api/events', status: 'degraded', tier: 'critical' }),
    '/api/news': makeEndpoint({ name: '/api/news', status: 'healthy', tier: 'non-critical' }),
    // Phase 46 HARD-02 — cron-tier rows carry the missedRun sibling so the new
    // Cron Freshness block renders at full breadth in the snapshot: one healthy,
    // one missed (the load-bearing MISSED alarm), one unknown (pre-first-tick).
    cronHealth: makeEndpoint({
      name: 'cronHealth',
      status: 'healthy',
      tier: 'cron',
      freshnessMs: 3_600_000,
      freshnessThresholdMs: 26 * 60 * 60_000,
      latencyMs: null,
      missedRun: 'healthy',
    }),
    cronWarm: makeEndpoint({
      name: 'cronWarm',
      status: 'unhealthy',
      tier: 'cron',
      freshnessMs: 120_000_000,
      freshnessThresholdMs: 26 * 60 * 60_000,
      latencyMs: null,
      missedRun: 'missed',
    }),
    cronRefreshEvents: makeEndpoint({
      name: 'cronRefreshEvents',
      status: 'unknown',
      tier: 'cron',
      lastSuccessTs: null,
      freshnessMs: null,
      freshnessThresholdMs: 26 * 60 * 60_000,
      latencyMs: null,
      missedRun: 'unknown',
    }),
  };
  return {
    endpoints,
    summary: {
      critical: { healthy: 1, degraded: 1, unhealthy: 0, unknown: 0 },
      nonCritical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
      static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
      cron: { healthy: 1, degraded: 0, unhealthy: 1, unknown: 1 },
    },
    generatedAt: FIXED_NOW,
  };
}

// Fully-populated operator-status payload — every Group 4 + Budget + hero
// data path is non-null so the consolidated layout renders at full breadth.
const POPULATED_OP_STATUS = {
  audit24h: 7,
  byBearer: [{ bearerFingerprint: 'abc12345abcdef', actions: 5, swaps: 1, replays: 4 }],
  advEval: { total: 10, blocked: 9, leaked: 1 },
  prune: {
    deadUrlCount: 3,
    last24hPrunes: 1,
    deadUrlSample: [{ eventId: 'llm-v3-grp1', url: 'https://example.com/a', status: '404' }],
  },
  actorQuality: {
    totalEvents: 100,
    nullActors: 5,
    rawCameoActors: 2,
    ambiguousActors: 3,
    lowConfidenceActors: 10,
    sample: [{ eventId: 'evt-1', actors: ['USMIL'], actorConfidence: ['low'], issue: 'raw-cameo' }],
  },
  tokenBudget: {
    providers: { nvidia_nim: { used: 600, cap: 1000, soft: 800, hard: 950, state: 'ok' } },
    costShadow: { tokensIn: 1000, tokensOut: 500, usd: 0.0123 },
  },
  // Phase 46 HARD-01 — per-tier rate-limiter config + recent 429s so the new
  // Rate Limiter block renders at full breadth (with a non-zero amber-tinted
  // shed count) in the consolidated-layout snapshot.
  rateLimiter: {
    tiers: [
      { tier: 'flights', max: 120, windowSec: 60, recent429: 0 },
      { tier: 'events', max: 20, windowSec: 60, recent429: 4 },
      { tier: 'public', max: 60, windowSec: 60, recent429: 2 },
    ],
  },
};

// FlightRecorder history (its own /api/events/llm-history fetch) — ≥1 run.
const HISTORY_RESPONSE = {
  runs: [
    {
      runId: 'run-aaaaaaaa-1111',
      startedAt: new Date(FIXED_NOW - 4 * 3_600_000).toISOString(),
      completedAt: new Date(FIXED_NOW - 4 * 3_600_000 + 60_000).toISOString(),
      outcome: 'completed' as const,
      batchCount: 4,
      batchesCompleted: 4,
      batchesFailed: 0,
      tokenSpend: { nvidia_nim: 1200 },
      evalScore: { within5km: 40, within20km: 45, within100km: 48, total: 50 },
      dlqDelta: 0,
      watchdogTimeouts: 0,
      durationMs: 60_000,
      pipelineVersion: 'v3' as const,
    },
  ],
  calls: [],
};

function stubFetch() {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url === '/api/operator-status') {
      return { ok: true, status: 200, json: async () => POPULATED_OP_STATUS } as Response;
    }
    if (url === '/api/events/llm-history') {
      return { ok: true, status: 200, json: async () => HISTORY_RESPONSE } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

describe('DevApiStatus consolidated layout snapshot — Phase 40 §Regression-Lock assertion 8', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    stubFetch();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    // Hero "last run" — a completed (error == null) run 4h ago.
    mockLLMStatus = {
      stage: 'idle',
      lastRun: {
        lastRun: FIXED_NOW - 4 * 3_600_000,
        groupCount: 12,
        batchCount: 4,
        geocodeCount: 30,
        enrichedCount: 28,
        durationMs: 60_000,
        error: null,
        schemaVersion: 'v3',
      },
    };
    useFilterStore.setState({ showSites: true });
    // Default view-state: all groups expanded, drawer closed.
    useUIStore.setState({
      isDevApiStatusOpen: true,
      activeDevApiStatusTab: 'apiHealth',
      isOperatorDrawerOpen: false,
      devApiGroupCollapsed: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
      isOperatorDrawerOpen: false,
      devApiGroupCollapsed: {},
    });
  });

  it('locks the fully-populated consolidated-layout shape (hero + 4 expanded groups + closed drawer)', async () => {
    render(
      <HealthStatusContext.Provider
        value={{
          health: makePopulatedHealth(),
          loading: false,
          error: null,
          lastSuccessAt: FIXED_NOW,
        }}
      >
        <DevApiStatus />
      </HealthStatusContext.Provider>,
    );

    // Wait for the async operator-status + llm-history fetches to hydrate the
    // hero (budget %), Group 4 (dead-URL count), and FlightRecorder.
    await waitFor(() => {
      expect(screen.getByTestId('dead-url-count')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('flight-recorder')).toBeInTheDocument();
    });

    // Sanity: all 4 groups present + expanded, drawer closed (the populated
    // state this snapshot is meant to lock).
    expect(screen.getByTestId('group-endpoint-health')).toBeInTheDocument();
    expect(screen.getByTestId('group-llm-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('group-budget-cost')).toBeInTheDocument();
    expect(screen.getByTestId('group-operator-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('operator-drawer')).toBeNull();

    // Snapshot the consolidated tab subtree only (not the whole modal chrome).
    const tab = screen.getByTestId('all-apis-tab');
    expect(tab).toMatchSnapshot();
  });
});
