import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useNewsStore } from '@/stores/newsStore';
import { useMarketStore } from '@/stores/marketStore';
import { useWeatherStore } from '@/stores/weatherStore';
import { useWaterStore } from '@/stores/waterStore';
import type { ConflictEventEntity } from '@/types/entities';

// Mock useLLMStatusPolling
const mockLLMStatus = { stage: 'idle' as const, lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

// Import after mocks
import { DevApiStatus } from '@/components/ui/DevApiStatus';

function makeEvent(
  id: string,
  opts: { llmProcessed?: boolean; precision?: string } = {},
): ConflictEventEntity {
  return {
    id,
    type: 'airstrike',
    lat: 32,
    lng: 51,
    timestamp: Date.now(),
    label: id,
    data: {
      eventType: '',
      subEventType: '',
      fatalities: 0,
      actor1: '',
      actor2: '',
      notes: '',
      source: '',
      goldsteinScale: 0,
      locationName: '',
      cameoCode: '',
      llmProcessed: opts.llmProcessed,
      precision: opts.precision as 'exact' | 'city' | 'region' | undefined,
    },
  };
}

const now = Date.now();

function resetAllStores() {
  useFlightStore.setState({
    connectionStatus: 'connected',
    flightCount: 10,
    lastFetchAt: now - 5000,
    lastError: null,
    nextPollAt: now + 3000,
    recentFetches: [
      { ok: true, durationMs: 150, timestamp: now },
      { ok: true, durationMs: 200, timestamp: now },
    ],
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
    events: [
      makeEvent('e1', { llmProcessed: true, precision: 'exact' }),
      makeEvent('e2', { llmProcessed: true, precision: 'city' }),
      makeEvent('e3', { precision: 'region' }),
    ],
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
    quotes: Array.from({ length: 5 }, (_, i) => ({
      symbol: `SYM${i}`,
      name: `Symbol ${i}`,
      price: 100 + i,
      change: 0.5,
      changePercent: 0.5,
      previousClose: 99.5 + i,
      timestamp: now,
      sparkline: [],
    })),
  });
  useWeatherStore.setState({
    connectionStatus: 'connected',
    lastFetchAt: now - 120000,
    lastError: null,
    nextPollAt: now + 1680000,
    recentFetches: [{ ok: true, durationMs: 600, timestamp: now }],
    grid: Array.from({ length: 100 }, (_, i) => ({
      lat: 30 + i * 0.1,
      lng: 50 + i * 0.1,
      temperature: 25,
      windSpeed: 10,
      windDirection: 180,
      humidity: 50,
    })),
  });
  useWaterStore.setState({
    connectionStatus: 'connected',
    lastError: null,
    nextPollAt: null,
    recentFetches: [{ ok: true, durationMs: 2000, timestamp: now }],
    // Provide at least one facility so count > 0 and status is not 'empty'
    facilities: [{ id: 'w1', name: 'Test Dam', lat: 33, lng: 51 }] as never[],
  });
}

/** Click the collapsed "API ~" button to expand the panel */
function expandPanel() {
  const btn = screen.getByText(/^API/);
  fireEvent.click(btn);
}

describe('DevApiStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    // Reset LLM status to default
    Object.assign(mockLLMStatus, { stage: 'idle', lastRun: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all 8 source rows when expanded', () => {
    render(<DevApiStatus />);
    expandPanel();

    expect(screen.getByText('Flights')).toBeInTheDocument();
    expect(screen.getByText('Ships')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Sites')).toBeInTheDocument();
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(screen.getByText('Markets')).toBeInTheDocument();
    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });

  it('copies valid JSON to clipboard on copy diagnostics click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<DevApiStatus />);
    expandPanel();

    const copyBtn = screen.getByTestId('copy-diagnostics');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const jsonStr = writeTextMock.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonStr);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.sources).toHaveLength(8);
    expect(parsed.sources.map((s: { name: string }) => s.name)).toEqual([
      'Flights',
      'Ships',
      'Events',
      'Sites',
      'News',
      'Markets',
      'Weather',
      'Water',
    ]);
    expect(parsed.llmPipeline).toBeDefined();
  });

  it('shows collapsed "API ~" or "API !" indicator', () => {
    render(<DevApiStatus />);
    // All sources connected with data -- should show "~"
    expect(screen.getByText(/^API/)).toHaveTextContent('API ~');
  });

  it('shows collapsed "API !" when a source has error', () => {
    useFlightStore.setState({ connectionStatus: 'error', flightCount: 0 });
    render(<DevApiStatus />);
    expect(screen.getByText(/^API/)).toHaveTextContent('API !');
  });

  it('shows lastError when row is expanded', () => {
    useFlightStore.setState({ lastError: 'Flights API 503' });
    render(<DevApiStatus />);
    expandPanel();

    // Click Flights row to expand error
    const flightsRow = screen.getByText('Flights').closest('tr')!;
    fireEvent.click(flightsRow);

    expect(screen.getByText(/Flights API 503/)).toBeInTheDocument();
  });

  it('shows correct success rate X/Y format from recentFetches', () => {
    useFlightStore.setState({
      recentFetches: [
        { ok: true, durationMs: 100, timestamp: now },
        { ok: true, durationMs: 150, timestamp: now },
        { ok: false, durationMs: 200, timestamp: now },
      ],
    });
    render(<DevApiStatus />);
    expandPanel();

    // 2 ok out of 3 total = "2/3"
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('shows "One-time" or "Complete" for one-shot sources', () => {
    // Sites is connected (one-shot complete)
    useSiteStore.setState({ connectionStatus: 'connected', siteCount: 20 });
    render(<DevApiStatus />);
    expandPanel();

    // Sites and Water are one-shot -- should show "Complete" when connected
    const completeCells = screen.getAllByText('Complete');
    expect(completeCells.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Fetching..." for one-shot sources during loading', () => {
    useSiteStore.setState({ connectionStatus: 'loading', siteCount: 0 });
    render(<DevApiStatus />);
    expandPanel();

    expect(screen.getByText('Fetching...')).toBeInTheDocument();
  });
});
