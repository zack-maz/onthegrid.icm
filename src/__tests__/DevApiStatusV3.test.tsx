// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useNewsStore } from '@/stores/newsStore';
import { useMarketStore } from '@/stores/marketStore';
import { useWeatherStore } from '@/stores/weatherStore';
import { useWaterStore } from '@/stores/waterStore';
import { useUIStore } from '@/stores/uiStore';
import { useLayerStore } from '@/stores/layerStore';
import { useFilterStore } from '@/stores/filterStore';
import type { LLMStatus, RecentEnrichedEvent } from '@/hooks/useLLMStatusPolling';

/**
 * Phase 27.4.3 Plan 04 — DevApiStatus v3 surface render tests. Mirrors the
 * existing devApiStatusEventsSection.test.tsx pattern: mock useLLMStatusPolling
 * via a mutable module-level variable + reset all stores in beforeEach +
 * open the modal & select Events tab via uiStore.setState before render().
 */

let mockLLMStatus: LLMStatus = { stage: 'idle', lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

// Import AFTER the mock so the component reads the mocked hook.
import { DevApiStatus } from '@/components/ui/DevApiStatus';

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

function openAndSelectEventsTab() {
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'events',
  });
}

function makeRecentEventV3(overrides: Partial<RecentEnrichedEvent> = {}): RecentEnrichedEvent {
  return {
    groupKey: 'group-v3-test',
    location: {
      country: 'Iran',
      admin1: 'Tehran Province',
      city: 'Tehran',
      neighborhood: null,
      landmark: null,
    },
    precision: 'city',
    confidence: 0.9,
    reasoning: 'v3 ground truth',
    weaponType: 'airstrike',
    targetType: 'government',
    tokensIn: 1234,
    tokensOut: 456,
    provenance: 'nominatim-direct',
    sources: [],
    fetchedAt: now - 60_000,
    reasoningTrace: 'Reasoning: based on the source mentions of Tehran...',
    lineageHash: 'a1b2c3d4e5f6abcd',
    ...overrides,
  };
}

describe('DevApiStatus v3 surface — Phase 27.4.3 Plan 04', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'overview',
    });
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    mockLLMStatus = { stage: 'idle', lastRun: null };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all 7 v3 empty-state lines when schemaVersion=v3 and fields are empty', () => {
    mockLLMStatus = {
      stage: 'idle',
      schemaVersion: 'v3',
      // All v3 observability fields intentionally undefined.
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // Empty-state copy verbatim per UI-SPEC §"Empty states":
    expect(screen.getByText('No routing decisions yet.')).toBeInTheDocument();
    // Note: 'No LLM calls yet.' is shared between LatencyHistogramBlock (v3) and
    // CallLogBlock (v2). EventsFiltersSectionV3 only renders LatencyHistogramBlock,
    // so a single match is the expected result here.
    expect(screen.getByText('No LLM calls yet.')).toBeInTheDocument();
    expect(screen.getByText('No requests this window.')).toBeInTheDocument();
    expect(screen.getByText('No schema rejections.')).toBeInTheDocument();
    expect(screen.getByText('No errors today.')).toBeInTheDocument();
    expect(screen.getByText('No flips recorded.')).toBeInTheDocument();
    expect(screen.getByText('No tokens billed this window.')).toBeInTheDocument();
  });

  it('renders v3 section headers verbatim per UI-SPEC', () => {
    mockLLMStatus = {
      stage: 'idle',
      schemaVersion: 'v3',
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText('Routing Trace (last 50)')).toBeInTheDocument();
    expect(screen.getByText('Latency (P50/P95/P99)')).toBeInTheDocument();
    expect(screen.getByText('Rate-Limit Headroom')).toBeInTheDocument();
    expect(screen.getByText('Schema-Strict Failure Rate')).toBeInTheDocument();
    expect(screen.getByText('Error Taxonomy (today UTC)')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Flips (last 200)')).toBeInTheDocument();
    expect(screen.getByText('v3 Cost Shadow (last 24h)')).toBeInTheDocument();
  });

  it('does NOT render v3 blocks when schemaVersion=v2 (no version leakage)', () => {
    mockLLMStatus = {
      stage: 'done',
      schemaVersion: 'v2',
      callHistory: [],
      tokenCounters: { cerebras: 0, groq: 0 },
      breakerState: { cerebras: 'ok', groq: 'ok' },
      provenanceCounts: {},
      suspectCount: 0,
      dlqRecent: [],
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    // The v2 composer mounts (existing 'Events Pipeline (v2)' header)
    expect(screen.getByText(/Events Pipeline \(v2\)/)).toBeInTheDocument();
    // None of the v3-only headers leak through
    expect(screen.queryByText('Routing Trace (last 50)')).toBeNull();
    expect(screen.queryByText('v3 Cost Shadow (last 24h)')).toBeNull();
    expect(screen.queryByText('Pipeline Flips (last 200)')).toBeNull();
  });

  it('renders populated routing-trace row with provider/model and reason chip', () => {
    mockLLMStatus = {
      stage: 'done',
      schemaVersion: 'v3',
      routingTrace: [
        {
          ts: now - 1000,
          batch: 1,
          provider: 'nvidia_nim',
          model: 'kimi-k2.5',
          reason: 'primary',
        },
      ],
    };
    openAndSelectEventsTab();
    const { container } = render(<DevApiStatus />);
    expect(container.textContent).toContain('primary');
    expect(container.textContent).toContain('nvidia_nim/kimi-k2.5');
    expect(container.textContent).toContain('batch=1');
  });

  it('renders cost-shadow tagline verbatim when costShadow is populated', () => {
    mockLLMStatus = {
      stage: 'done',
      schemaVersion: 'v3',
      costShadow: { tokensIn: 1_200_000, tokensOut: 340_000, usd: 0.376 },
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText('↳ saved by free-claude-code routing')).toBeInTheDocument();
    // Token in/out counters render with locale separators
    expect(screen.getByText(/1,200,000/)).toBeInTheDocument();
    expect(screen.getByText(/340,000/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.376/)).toBeInTheDocument();
  });

  it('renders the Schema/Stage header line under EventsFiltersSectionV3', () => {
    mockLLMStatus = {
      stage: 'llm-processing',
      schemaVersion: 'v3',
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText(/Schema: v3 · Stage: llm-processing/)).toBeInTheDocument();
  });

  it('renders DrillDownRow lineage extension when reasoningTrace + lineageHash are populated', () => {
    mockLLMStatus = {
      stage: 'done',
      schemaVersion: 'v3',
      recentEvents: [makeRecentEventV3()],
    };
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // Drill-down section is collapsed by default; expand it
    const drillExpand = screen.getByTestId('drill-down-expand');
    fireEvent.click(drillExpand);

    // The single row is then collapsed; expand it
    const rowToggle = screen.getByTestId('drill-down-row-toggle');
    fireEvent.click(rowToggle);

    // Lineage extension chips
    expect(screen.getByText('Reasoning trace')).toBeInTheDocument();
    expect(
      screen.getByText(/Reasoning: based on the source mentions of Tehran/),
    ).toBeInTheDocument();
    expect(screen.getByText('Lineage')).toBeInTheDocument();
    // Hash chip shows first 8 chars + ellipsis
    expect(screen.getByText(/hash: a1b2c3d4…/)).toBeInTheDocument();
  });
});

// Phase 27.4.3 Plan 04 — Topbar PipelineVersionPill v3 color rendering.
describe('Topbar PipelineVersionPill v3 — Phase 27.4.3 Plan 04', () => {
  beforeEach(() => {
    // Stub /api/events/llm-pipeline so PipelineVersionPillInner.fetchVersion()
    // resolves with effective: 'v3' regardless of network.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ effective: 'v3' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    // Reset stores so DevApiStatusTrigger has deterministic input.
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders 'v3' in blue rgb(96,165,250) when /api/events/llm-pipeline returns effective: 'v3'", async () => {
    // Lazy import so vi.stubGlobal('fetch') is in place before module init.
    const { Topbar } = await import('@/components/layout/Topbar');
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<Topbar />);
      // flush microtasks so fetchVersion resolves
      await Promise.resolve();
      await Promise.resolve();
    });
    const pill = result!.getByTestId('pipeline-version-pill');
    expect(pill.textContent).toBe('v3');
    expect(pill.getAttribute('style')).toContain('rgb(96, 165, 250)');
  });
});
