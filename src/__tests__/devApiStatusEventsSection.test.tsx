import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { LLMStatus, RecentEnrichedEvent } from '@/hooks/useLLMStatusPolling';
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
 * Phase 27.4 Plan 09 — DevApiStatus Events tab render tests. Follows the
 * sitesFiltersSection.test.tsx pattern: reset all stores + mock
 * useLLMStatusPolling → setState + render in one pass → assert block
 * visibility.
 */

// Mutable mock status so tests can swap llmStatus between render cases.
let mockLLMStatus: LLMStatus = { stage: 'idle', lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

// Import AFTER the mock so the component reads the mocked hook.

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

function makeRecentEvent(overrides: Partial<RecentEnrichedEvent> = {}): RecentEnrichedEvent {
  return {
    groupKey: 'group-abc',
    location: {
      country: 'Iran',
      admin1: 'Tehran Province',
      city: 'Tehran',
      neighborhood: 'Niavaran',
      landmark: 'Niavaran Palace',
    },
    precision: 'city',
    confidence: 0.87,
    reasoning: 'Sources mention Tehran explicitly',
    weaponType: 'airstrike',
    targetType: 'government',
    tokensIn: 1234,
    tokensOut: 456,
    provenance: 'nominatim-direct',
    sources: ['https://example.com/a', 'https://example.com/b'],
    fetchedAt: now - 60_000,
    ...overrides,
  };
}

function makePopulatedStatus(overrides: Partial<LLMStatus> = {}): LLMStatus {
  return {
    stage: 'idle',
    schemaVersion: 'v2',
    startedAt: now - 120_000,
    completedAt: now - 60_000,
    totalGroups: 40,
    newGroups: 20,
    totalBatches: 3,
    completedBatches: 3,
    totalGeocodes: 20,
    completedGeocodes: 20,
    enrichedCount: 18,
    durationMs: 12_345,
    callHistory: [
      {
        provider: 'cerebras',
        model: 'gpt-oss-120b',
        tokensIn: 1000,
        tokensOut: 300,
        durationMs: 450,
        ok: true,
        batchSize: 8,
        timestamp: now - 10_000,
      },
      {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        tokensIn: 900,
        tokensOut: 250,
        durationMs: 520,
        ok: false,
        batchSize: 8,
        timestamp: now - 5_000,
      },
    ],
    tokenCounters: { cerebras: 150_000, groq: 80_000 },
    dlqCount: 1,
    dlqRecent: [
      {
        id: 'group-dead-12345abcdef',
        reason: 'zod_fail',
        lastError: 'missing field',
        timestamp: now - 30_000,
      },
    ],
    breakerState: { cerebras: 'ok', groq: 'paused' },
    evalScore: { within5km: 7, within20km: 9, within100km: 10, total: 10 },
    provenanceCounts: {
      'nominatim-direct': 10,
      'own-site-snapshot': 5,
      'poi-amenity-nominatim': 3,
    },
    suspectCount: 2,
    recentEvents: [makeRecentEvent()],
    paused: false,
    ...overrides,
  };
}

function openAndSelectEventsTab() {
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'events',
  });
}

describe('EventsFiltersSection (Phase 27.4 Plan 09)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    // Reset to empty idle status — tests override as needed.
    mockLLMStatus = { stage: 'idle', lastRun: null };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // R1 — Phase 27.4.6: Events tab is always visible (was: hidden when
  // schemaVersion is unset). The cold-start gate hid the tab between deploys
  // and the first cron-driven extraction; the new contract renders the tab
  // whenever the dashboard surface itself is rendered, defaulting the body
  // to V3 when schemaVersion is unknown.
  it('R1: renders the Events tab when schemaVersion is unset (Phase 27.4.6 always-visible contract)', () => {
    mockLLMStatus = { stage: 'idle', lastRun: null };
    useUIStore.setState({ isDevApiStatusOpen: true });
    render(<DevApiStatus />);
    expect(screen.getByTestId('tab-events')).toBeInTheDocument();
  });

  // R2 — Events tab rendered when schemaVersion === 'v2' AND DEV is true
  it('R2: renders the Events tab when schemaVersion is v2 (dev gate satisfied)', () => {
    mockLLMStatus = makePopulatedStatus();
    useUIStore.setState({ isDevApiStatusOpen: true });
    render(<DevApiStatus />);
    expect(screen.getByTestId('tab-events')).toBeInTheDocument();
  });

  // R3 — All 8 block headings render when fixtures populate every surface
  it('R3: Events tab body renders every block heading (8 blocks)', () => {
    mockLLMStatus = makePopulatedStatus();
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // Section header
    expect(screen.getByText(/Events Pipeline \(v2\)/)).toBeInTheDocument();
    // Block 1: Waterfall
    expect(screen.getByText('Pipeline Waterfall')).toBeInTheDocument();
    // Block 2: Provenance Distribution + LLM Call Success line
    expect(screen.getByText('Provenance Distribution')).toBeInTheDocument();
    expect(screen.getByText(/LLM Call Success:/)).toBeInTheDocument();
    // Block 3: Drill-down (collapsed)
    expect(screen.getByText(/Drill-down \(1 events\)/)).toBeInTheDocument();
    // Block 4: LLM Call Log (header)
    expect(screen.getByText(/LLM Call Log \(last 2\)/)).toBeInTheDocument();
    // Block 5: Budget
    expect(screen.getByText('Token Budget (daily)')).toBeInTheDocument();
    // Block 6: Accuracy
    expect(screen.getByText(/Accuracy Eval/)).toBeInTheDocument();
    // Block 7: DLQ — populated, so the header appears
    expect(screen.getByText(/DLQ \(1\)/)).toBeInTheDocument();
    // Block 8: Suspect count
    expect(screen.getByText(/Suspect events:/)).toBeInTheDocument();
  });

  // R4 — D-25 gate PASS (20km / total >= 80%)
  it('R4: D-25 gate shows PASS when within20km/total >= 0.8', () => {
    mockLLMStatus = makePopulatedStatus({
      evalScore: { within5km: 5, within20km: 9, within100km: 10, total: 10 },
    });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  // R5 — D-25 gate FAIL
  it('R5: D-25 gate shows FAIL when within20km/total < 0.8', () => {
    mockLLMStatus = makePopulatedStatus({
      evalScore: { within5km: 2, within20km: 5, within100km: 9, total: 10 },
    });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText('FAIL')).toBeInTheDocument();
  });

  // R6 — Budget bars render both providers with ⏸ on paused ones
  it('R6: BudgetBarsBlock renders Cerebras + Groq bars with ⏸ on paused providers', () => {
    mockLLMStatus = makePopulatedStatus({
      breakerState: { cerebras: 'ok', groq: 'paused' },
    });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    // Both provider labels appear; Groq carries the pause glyph
    expect(screen.getByText(/Cerebras/)).toBeInTheDocument();
    expect(screen.getByText(/Groq ⏸/)).toBeInTheDocument();
  });

  // R7a — DLQ zero-state
  it('R7a: DlqBlock renders "DLQ: 0 entries" when empty', () => {
    mockLLMStatus = makePopulatedStatus({ dlqRecent: [], dlqCount: 0 });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText(/DLQ: 0 entries/)).toBeInTheDocument();
  });

  // R7b — DLQ populated lists reason + truncated id
  it('R7b: DlqBlock renders populated entries with reason + truncated id', () => {
    mockLLMStatus = makePopulatedStatus();
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    // Reason text
    expect(screen.getByText('zod_fail')).toBeInTheDocument();
  });

  // R8 — DrillDownRow expand toggles visibility and exposes the hierarchy row
  it('R8: DrillDownRow expand toggles visibility; expanded row shows hierarchy + provenance', async () => {
    mockLLMStatus = makePopulatedStatus();
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // Expand the drill-down block first so the row button is visible
    const expandButton = screen.getByTestId('drill-down-expand');
    await act(async () => {
      expandButton.click();
    });

    // Now the single row is visible; click to toggle
    const rowToggle = screen.getByTestId('drill-down-row-toggle');
    await act(async () => {
      rowToggle.click();
    });

    // Hierarchy row exposes country/admin1/city/etc values
    expect(screen.getByText(/Tehran Province/)).toBeInTheDocument();
    expect(screen.getByText(/Niavaran Palace/)).toBeInTheDocument();
    expect(screen.getByText(/reasoning:/)).toBeInTheDocument();
    // Provenance tag rendered with the nominatim-direct value — appears
    // once in the HistogramsBlock row AND once in the expanded drill-down
    // hierarchy, so getAllByText returns two matches.
    expect(screen.getAllByText('nominatim-direct').length).toBeGreaterThanOrEqual(2);
    // Source links [1] / [2]
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });

  // R9 (B4) — Copy prompt+response JSON POSTs to llm-replay and surfaces Copied!
  it('R9 (B4): Copy button POSTs to /api/events/llm-replay/:groupKey and shows Copied!', async () => {
    mockLLMStatus = makePopulatedStatus();
    openAndSelectEventsTab();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '{"old":{},"new":{}}',
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const writeTextMock = vi.fn(async () => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: writeTextMock },
    });

    render(<DevApiStatus />);

    // Expand the block + row
    await act(async () => {
      screen.getByTestId('drill-down-expand').click();
    });
    await act(async () => {
      screen.getByTestId('drill-down-row-toggle').click();
    });

    // Click copy button
    const copyBtn = screen.getByTestId('drill-down-copy');
    await act(async () => {
      copyBtn.click();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/events/llm-replay/'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(writeTextMock).toHaveBeenCalledWith('{"old":{},"new":{}}');
    // Feedback text
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  // R10 (B4) — Summary row includes precision + confidence + weapon/target
  it('R10 (B4): DrillDownRow summary line includes precision, confidence, and weapon/target', async () => {
    mockLLMStatus = makePopulatedStatus();
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    await act(async () => {
      screen.getByTestId('drill-down-expand').click();
    });

    // Summary elements appear in the visible row (collapsed state)
    expect(screen.getByText('Tehran')).toBeInTheDocument();
    expect(screen.getByText(/precision=city/)).toBeInTheDocument();
    expect(screen.getByText(/conf=0\.87/)).toBeInTheDocument();
    expect(screen.getByText(/airstrike\/government/)).toBeInTheDocument();
  });

  // R11 (B5 surface) — "Paused — soft cap" badge visibility
  it('R11 (B5 surface): "Paused — soft cap" badge visible when paused=true', () => {
    mockLLMStatus = makePopulatedStatus({ paused: true });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.getByText(/Paused — soft cap/)).toBeInTheDocument();
  });

  it('R11b (B5 surface): "Paused — soft cap" badge hidden when paused=false', () => {
    mockLLMStatus = makePopulatedStatus({ paused: false });
    openAndSelectEventsTab();
    render(<DevApiStatus />);
    expect(screen.queryByText(/Paused — soft cap/)).toBeNull();
  });
});
