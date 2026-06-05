// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
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
 * Phase 33 Plan 07 (D-17) — DevApiStatus Actor Quality sub-block jsdom tests.
 *
 * Mirrors the DevApiStatus.prune.test.tsx pattern: mock useLLMStatusPolling,
 * reset all polling-store slices in beforeEach, open the modal + select the
 * apiHealth tab via uiStore.setState before render().
 *
 * The component fires /api/operator-status on mount. This file routes the
 * mockFetch by URL so the per-test `opStatusPayload` mutation steers what
 * actorQuality block the component sees.
 *
 * Test cases map to PLAN.md Task 1 behavior § (6 cases):
 *   1. actor-quality-row renders count row with all four counters
 *   2. actor-quality-list caps drill-down at 20 entries (server-side cap respected)
 *   3. issue-badge color tokens match UI-SPEC mapping (4 issue values)
 *   4. actor-quality-empty renders when totalEvents === 0
 *   5. sub-block absent when opStatus.actorQuality is null (pre-Phase-33 server)
 *   6. count row aria-label contains all four count words
 *
 * UI-SPEC color tokens (verbatim from .planning/phases/33-.../33-UI-SPEC.md §Color):
 *   - 'null'           → text-text-muted/60       (uses --color-text-muted)
 *   - 'raw-cameo'      → text-[color:var(--color-faction-disputed)]
 *   - 'ambiguous'      → text-[color:var(--color-faction-disputed)]
 *   - 'low-confidence' → text-[color:var(--color-event-other)]
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

type IssueKind = 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';

interface ActorQualitySampleEntry {
  eventId: string;
  actors: string[];
  actorConfidence: Array<'high' | 'medium' | 'low'>;
  issue: IssueKind;
}

interface ActorQualityBlock {
  totalEvents: number;
  nullActors: number;
  rawCameoActors: number;
  ambiguousActors: number;
  lowConfidenceActors: number;
  sample: ActorQualitySampleEntry[];
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
  prune: null;
  actorQuality: ActorQualityBlock | null;
}

function makeOpStatus(overrides: Partial<OperatorStatusPayload> = {}): OperatorStatusPayload {
  return {
    audit24h: 1,
    byBearer: [],
    advEval: null,
    prune: null,
    actorQuality: {
      totalEvents: 100,
      nullActors: 5,
      rawCameoActors: 2,
      ambiguousActors: 3,
      lowConfidenceActors: 10,
      sample: [
        { eventId: 'evt-1', actors: [''], actorConfidence: ['low'], issue: 'null' },
        { eventId: 'evt-2', actors: ['USMIL'], actorConfidence: ['low'], issue: 'raw-cameo' },
        { eventId: 'evt-3', actors: ['forces'], actorConfidence: ['low'], issue: 'ambiguous' },
        {
          eventId: 'evt-4',
          actors: ['Israeli Defense Forces'],
          actorConfidence: ['low'],
          issue: 'low-confidence',
        },
      ],
    },
    ...overrides,
  };
}

// Module-level mock payload so individual tests can override per case.
let opStatusPayload: OperatorStatusPayload = makeOpStatus();

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
  // Everything else (audit-status, health endpoints, etc.) — return a safe
  // not-ok response so the component's defensive guards short-circuit and
  // we don't crash on missing fields.
  return {
    ok: false,
    status: 404,
    json: async () => ({}),
  } as Response;
});

describe('DevApiStatus — Phase 33 Actor Quality sub-block (D-17)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.stubGlobal('fetch', mockFetch);
    // Seed dashboardAuthHeaders() Bearer (mirrors prune test setup).
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
    });
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    mockLLMStatus = { stage: 'idle', lastRun: null };
    opStatusPayload = makeOpStatus();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('actor-quality-row renders count row with all four counters', async () => {
    opStatusPayload = makeOpStatus();
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-quality-row')).toBeInTheDocument();
    });
    const row = screen.getByTestId('actor-quality-row');
    expect(row.textContent).toMatch(/Actor quality:/);
    expect(row.textContent).toMatch(/Null:\s*5/);
    expect(row.textContent).toMatch(/Raw-CAMEO:\s*2/);
    expect(row.textContent).toMatch(/Ambiguous:\s*3/);
    expect(row.textContent).toMatch(/Low-confidence:\s*10/);
  });

  it('actor-quality-list caps drill-down at 20 entries (server-side LIMIT_DRILL_DOWN cap respected by client)', async () => {
    // Server caps sample[] at 20 (D-16). The client renders what it receives.
    // This test feeds the maximum 20 entries that a properly-behaved server
    // would deliver and asserts the client renders <= 20.
    const sample: ActorQualitySampleEntry[] = Array.from({ length: 20 }, (_, i) => ({
      eventId: `evt-${i}`,
      actors: [`USMIL`],
      actorConfidence: ['low'],
      issue: 'raw-cameo' as IssueKind,
    }));
    opStatusPayload = makeOpStatus({
      actorQuality: {
        totalEvents: 100,
        nullActors: 0,
        rawCameoActors: 30,
        ambiguousActors: 0,
        lowConfidenceActors: 0,
        sample,
      },
    });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-quality-list')).toBeInTheDocument();
    });
    const rows = screen.queryAllByTestId(/^actor-quality-row-/);
    expect(rows.length).toBeLessThanOrEqual(20);
    expect(rows.length).toBe(20);
  });

  it('issue-badge color tokens match UI-SPEC mapping (null → text-muted, raw-cameo + ambiguous → faction-disputed, low-confidence → event-other)', async () => {
    opStatusPayload = makeOpStatus({
      actorQuality: {
        totalEvents: 4,
        nullActors: 1,
        rawCameoActors: 1,
        ambiguousActors: 1,
        lowConfidenceActors: 1,
        sample: [
          { eventId: 'evt-n', actors: [''], actorConfidence: ['low'], issue: 'null' },
          { eventId: 'evt-r', actors: ['USMIL'], actorConfidence: ['low'], issue: 'raw-cameo' },
          { eventId: 'evt-a', actors: ['forces'], actorConfidence: ['low'], issue: 'ambiguous' },
          {
            eventId: 'evt-l',
            actors: ['Israeli Defense Forces'],
            actorConfidence: ['low'],
            issue: 'low-confidence',
          },
        ],
      },
    });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-quality-row-evt-n')).toBeInTheDocument();
    });

    // jsdom does not resolve CSS vars at compute time, so we assert against
    // the className strings the component emits (per UI-SPEC color table).
    const nullRow = screen.getByTestId('actor-quality-row-evt-n');
    expect(nullRow.innerHTML).toMatch(/text-text-muted/);

    const rawRow = screen.getByTestId('actor-quality-row-evt-r');
    expect(rawRow.innerHTML).toMatch(/--color-faction-disputed/);

    const ambigRow = screen.getByTestId('actor-quality-row-evt-a');
    expect(ambigRow.innerHTML).toMatch(/--color-faction-disputed/);

    const lowRow = screen.getByTestId('actor-quality-row-evt-l');
    expect(lowRow.innerHTML).toMatch(/--color-event-other/);
  });

  it('actor-quality-empty renders when totalEvents === 0 AND actorQuality non-null', async () => {
    opStatusPayload = makeOpStatus({
      actorQuality: {
        totalEvents: 0,
        nullActors: 0,
        rawCameoActors: 0,
        ambiguousActors: 0,
        lowConfidenceActors: 0,
        sample: [],
      },
    });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-quality-empty')).toBeInTheDocument();
    });
    // Phase 40 Task 3 (D-06) — actor-quality empty unified onto the canonical
    // muted-placeholder pattern. The `actor-quality-empty` wrapper is kept; the
    // inner `actor-quality-placeholder` carries the `— no data (reason)` copy.
    expect(screen.getByTestId('actor-quality-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('actor-quality-placeholder').textContent).toMatch(
      /—\s*no data \(no actor data\)/,
    );
    expect(screen.queryByTestId('actor-quality-row')).toBeNull();
  });

  it('sub-block silently absent when opStatus.actorQuality is null (pre-Phase-33 server)', async () => {
    opStatusPayload = makeOpStatus({ actorQuality: null });
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    // Wait until the parent operator-actions block has hydrated (one of the
    // pre-existing rows must be present so we know the fetch resolved).
    await waitFor(() => {
      expect(screen.getByTestId('operator-actions-24h-count')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('actor-quality-row')).toBeNull();
    expect(screen.queryByTestId('actor-quality-empty')).toBeNull();
    expect(screen.queryByTestId('actor-quality-list')).toBeNull();
  });

  it('count row aria-label contains all four count words for screen readers', async () => {
    opStatusPayload = makeOpStatus();
    openAndSelectApiHealthTab();
    render(<DevApiStatus />);
    await waitFor(() => {
      expect(screen.getByTestId('actor-quality-row')).toBeInTheDocument();
    });
    const row = screen.getByTestId('actor-quality-row');
    const ariaLabel = row.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toMatch(/null actors/);
    expect(ariaLabel).toMatch(/raw CAMEO codes/);
    expect(ariaLabel).toMatch(/ambiguous strings/);
    expect(ariaLabel).toMatch(/low confidence/);
  });
});
