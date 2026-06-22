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

  // ── Phase 44 (EVENTS-TAB-01, D-05/D-08) — the v2-era blocks + FlightRecorder
  //    now also mount inside the PRODUCTION V3 composer (EventsFiltersSectionV3),
  //    presence-gated. The legacy v2-composer tests above are unchanged; these
  //    cover the v3 default path.

  it('R12 (Phase 44): the v2 blocks + FlightRecorder mount inside the V3 composer under populated data', () => {
    mockLLMStatus = makePopulatedStatus({ schemaVersion: 'v3', stage: 'done' });
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // v3-native header confirms we are on the V3 path (no legacy v2 header).
    expect(screen.getByText(/Schema: v3 · Stage: done/)).toBeInTheDocument();
    expect(screen.queryByText(/Events Pipeline \(v2\)/)).toBeNull();
    // The mounted v2 blocks render their content (presence gates satisfied).
    expect(screen.getByText('Pipeline Waterfall')).toBeInTheDocument();
    expect(screen.getByText('Provenance Distribution')).toBeInTheDocument();
    expect(screen.getByText(/LLM Call Log/)).toBeInTheDocument();
    expect(screen.getByText('Token Budget (daily)')).toBeInTheDocument();
    expect(screen.getByText(/Accuracy Eval/)).toBeInTheDocument();
    expect(screen.getByText(/DLQ \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Suspect events:/)).toBeInTheDocument();
    // FlightRecorderBlock re-mount (D-08) — self-contained. With no resolved
    // /api/events/llm-history fetch in jsdom, it degrades open to its canonical
    // muted placeholder (proving the re-mount is present + degrade-open).
    expect(screen.getByTestId('flight-recorder-placeholder')).toBeInTheDocument();
  });

  it('R13 (Phase 44, D-05): the v2 blocks SELF-HIDE in the V3 composer under empty data (degrade-open, no crash)', () => {
    mockLLMStatus = { stage: 'idle', schemaVersion: 'v3' };
    openAndSelectEventsTab();
    // No throw == degrade-open.
    expect(() => render(<DevApiStatus />)).not.toThrow();
    // Presence-gated v2 blocks are absent (no fabricated zeros).
    expect(screen.queryByText('Provenance Distribution')).toBeNull();
    expect(screen.queryByText('Token Budget (daily)')).toBeNull();
    expect(screen.queryByText(/DLQ: 0 entries/)).toBeNull();
    expect(screen.queryByText(/Suspect events:/)).toBeNull();
    // FlightRecorder is self-contained → still mounts; degrades open to its
    // muted placeholder when its own fetch has not resolved.
    expect(screen.getByTestId('flight-recorder-placeholder')).toBeInTheDocument();
  });
});

// ── Phase 45 DASH-READ-05 (Plan 04) — the four trend sparkline wells in the
//    events subtab. These are RENDER pins (evolve in lockstep with the
//    intentional UI change, NOT a frozen behavioral pin). They assert the four
//    wells render from a ≥2-point opStatus.trendHistory and that the block
//    degrades open (self-hides) when trendHistory is absent — UI-SPEC §Regression
//    -Lock assertion 6 (sparklines render once ring ≥2, self-hide below) + 7
//    (degrade-open). The trend ring rides the already-fetched /api/operator-status
//    response (no new fetch), so these stub fetch to thread trendHistory down.

type TrendSampleFixture = {
  sampledAt: string;
  cronAgeMs: { health: number | null; warm: number | null; 'refresh-events': number | null };
  deadUrlCount: number;
};

function makeTrendSample(over: Partial<TrendSampleFixture> = {}): TrendSampleFixture {
  return {
    sampledAt: new Date(now).toISOString(),
    cronAgeMs: { health: 3_600_000, warm: 7_200_000, 'refresh-events': 1_800_000 },
    deadUrlCount: 5,
    ...over,
  };
}

/**
 * Stub fetch so /api/operator-status resolves with the given trendHistory ring
 * (newest-first). All other endpoints (the FlightRecorder's llm-history, etc.)
 * resolve to an empty-but-ok body so they degrade open without throwing.
 */
function stubOperatorStatusFetch(trendHistory: TrendSampleFixture[] | null): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/operator-status')) {
      return {
        ok: true,
        json: async () => ({
          audit24h: 0,
          byBearer: [],
          advEval: null,
          prune: null,
          trendHistory,
        }),
      } as Response;
    }
    // Any other endpoint: ok with an empty object → degrade-open, no throw.
    return { ok: true, json: async () => ({}), text: async () => '{}' } as Response;
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
}

describe('Events subtab trend sparklines (Phase 45 DASH-READ-05, Plan 04)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    useUIStore.setState({ isDevApiStatusOpen: false, activeDevApiStatusTab: 'apiHealth' });
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    mockLLMStatus = { stage: 'idle', lastRun: null };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // T1 — the four trend wells render from a ≥2-point trendHistory ring.
  it('T1: renders 4 trend wells (cron ×3 + dead-links) given a ≥2-point trendHistory', async () => {
    stubOperatorStatusFetch([
      makeTrendSample({ deadUrlCount: 7 }),
      makeTrendSample({ deadUrlCount: 4 }),
    ]);
    mockLLMStatus = makePopulatedStatus({ schemaVersion: 'v3', stage: 'done' });
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    // Flush the operator-status fetch promise chain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('events-trend-block')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cron-health')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cron-warm')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cron-refresh')).toBeInTheDocument();
    expect(screen.getByTestId('trend-dead-links')).toBeInTheDocument();
    // The well labels read.
    expect(screen.getByText('CRON · HEALTH')).toBeInTheDocument();
    expect(screen.getByText('DEAD LINKS · 30d')).toBeInTheDocument();
    // Each well shows its current value as the primary metric beside the spark.
    expect(screen.getByTestId('trend-dead-links-value')).toHaveTextContent('7');
    // ≥2 points → each Sparkline renders (it returns null below 2).
    expect(screen.getByTestId('trend-dead-links-spark')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cron-health-spark')).toBeInTheDocument();
  });

  // T2 — degrade-open: the block self-hides when trendHistory is absent.
  it('T2: the trend block self-hides (degrade-open) when trendHistory is absent', async () => {
    stubOperatorStatusFetch(null);
    mockLLMStatus = makePopulatedStatus({ schemaVersion: 'v3', stage: 'done' });
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // No fabricated zeros — the whole block is absent.
    expect(screen.queryByTestId('events-trend-block')).toBeNull();
    expect(screen.queryByTestId('trend-dead-links')).toBeNull();
    // The rest of the V3 body still renders (degrade-open is scoped to the block).
    expect(screen.getByText(/Schema: v3 · Stage: done/)).toBeInTheDocument();
  });

  // T3 — each Sparkline self-hides below 2 points; the bare current value still
  //       renders (no fabricated zeros). A single-sample ring fills the wells'
  //       current-value metric but every Sparkline returns null.
  it('T3: a 1-point ring renders the wells with bare values but no Sparklines (self-hide < 2)', async () => {
    stubOperatorStatusFetch([makeTrendSample({ deadUrlCount: 3 })]);
    mockLLMStatus = makePopulatedStatus({ schemaVersion: 'v3', stage: 'done' });
    openAndSelectEventsTab();
    render(<DevApiStatus />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Block + wells present (ring is non-empty), current value shown.
    expect(screen.getByTestId('events-trend-block')).toBeInTheDocument();
    expect(screen.getByTestId('trend-dead-links-value')).toHaveTextContent('3');
    // Every Sparkline self-hides below 2 points (Plan-02 `return null`).
    expect(screen.queryByTestId('trend-dead-links-spark')).toBeNull();
    expect(screen.queryByTestId('trend-cron-health-spark')).toBeNull();
  });

  // T4 — the Phase-44 honest-signal contract is preserved alongside the new trend
  //       wells: the authoritative dead-URL total + "of N scanned" sampled caveat.
  it('T4: the Phase-44 dead-link honest-signal copy survives beside the trend wells', async () => {
    stubOperatorStatusFetch([makeTrendSample(), makeTrendSample()]);
    mockLLMStatus = makePopulatedStatus({ schemaVersion: 'v3', stage: 'done' });
    // Thread a prune payload so DeadLinkBucketsBlock mounts. The events-scoped
    // fetch reads `prune` off the same operator-status body, so re-stub with it.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/operator-status')) {
        return {
          ok: true,
          json: async () => ({
            audit24h: 0,
            byBearer: [],
            advEval: null,
            prune: {
              deadUrlCount: 9,
              last24hPrunes: 2,
              countsByStatus: { '404': 3, '403': 1 },
              deadUrlSample: [],
            },
            trendHistory: [makeTrendSample(), makeTrendSample()],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}), text: async () => '{}' } as Response;
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    openAndSelectEventsTab();
    render(<DevApiStatus />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Trend wells present.
    expect(screen.getByTestId('events-trend-block')).toBeInTheDocument();
    // Authoritative total line (sidecar) preserved verbatim.
    expect(screen.getByTestId('dead-link-authoritative-total')).toHaveTextContent(
      'Dead URL events:',
    );
    expect(screen.getByTestId('dead-link-authoritative-total')).toHaveTextContent('9');
    // "of N scanned" sampled-tally caveat preserved.
    expect(screen.getAllByText(/of 4 scanned/).length).toBeGreaterThan(0);
  });
});
