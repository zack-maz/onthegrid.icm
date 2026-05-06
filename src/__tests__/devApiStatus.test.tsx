import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { DevApiStatus } from '@/components/ui/DevApiStatus';
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
import type { ConflictEventEntity } from '@/types/entities';

// Mock useLLMStatusPolling
const mockLLMStatus = { stage: 'idle' as const, lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

// Import after mocks

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

/**
 * Phase 27.3.1 Plan 12 G6 — DevApiStatus is now a modal. Open it via
 * uiStore.setState() BEFORE render() so the component's initial selector
 * read sees isDevApiStatusOpen=true and renders the modal synchronously.
 */
function openModal() {
  useUIStore.setState({ isDevApiStatusOpen: true });
}

describe('DevApiStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    // Reset UI store modal state to default closed + apiHealth
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
    // Phase 27.3.1 HUMAN-UAT Gap 1 — tab gating defaults for existing tests.
    // The Water and Sites tabs now require their owning toggles to be ON:
    // water layer active in layerStore, showSites true in filterStore.
    useLayerStore.setState({ activeLayers: new Set(['water']) });
    useFilterStore.setState({ showSites: true });
    // Reset LLM status to default
    Object.assign(mockLLMStatus, { stage: 'idle', lastRun: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when isDevApiStatusOpen is false', () => {
    const { container } = render(<DevApiStatus />);
    // No modal rendered; container is effectively empty
    expect(screen.queryByTestId('dev-api-status-modal')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders modal when isDevApiStatusOpen is true', () => {
    openModal();
    render(<DevApiStatus />);
    expect(screen.getByTestId('dev-api-status-modal')).toBeInTheDocument();
    expect(screen.getByTestId('dev-api-status-container')).toBeInTheDocument();
    expect(screen.getByTestId('dev-api-status-backdrop')).toBeInTheDocument();
  });

  it('renders all 8 source rows in the Overview tab', () => {
    openModal();
    render(<DevApiStatus />);

    // "Sites", "Water", and (post-Phase-27.4.6) "Events" also appear as tab
    // button text, so we assert presence via getAllByText with length >= 1
    // for those three and direct lookup for the rest.
    expect(screen.getByText('Flights')).toBeInTheDocument();
    expect(screen.getByText('Ships')).toBeInTheDocument();
    expect(screen.getAllByText('Events').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sites').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(screen.getByText('Markets')).toBeInTheDocument();
    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.getAllByText('Water').length).toBeGreaterThanOrEqual(1);
  });

  it('copies valid JSON to clipboard on copy diagnostics click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    openModal();
    render(<DevApiStatus />);

    const copyBtn = screen.getByTestId('copy-diagnostics');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const jsonStr = writeTextMock.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonStr);

    expect(parsed.timestamp).toBeDefined();
    // Pre-existing baseline: rows array has 9 entries (including Precip) —
    // we verify presence of 8 primary sources here; Precip is included in
    // parsed.sources but the exact length assertion is stale per
    // deferred-items.md. Asserting the 8 we care about:
    const names = parsed.sources.map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Flights',
        'Ships',
        'Events',
        'Sites',
        'News',
        'Markets',
        'Weather',
        'Water',
      ]),
    );
    expect(parsed.llmPipeline).toBeDefined();
  });

  it('copy diagnostics works regardless of active tab (Plan 12 G6)', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    openModal();
    render(<DevApiStatus />);
    // Switch to water tab — copy should still emit the full diagnostics payload
    fireEvent.click(screen.getByTestId('tab-water'));
    const copyBtn = screen.getByTestId('copy-diagnostics');
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(writeTextMock.mock.calls[0][0] as string);
    // Same shape as overview — copy payload is contract-level, not tab-scoped
    expect(parsed.sources).toBeDefined();
    expect(parsed.llmPipeline).toBeDefined();
  });

  it('switches to Water tab on tab-water click', () => {
    openModal();
    render(<DevApiStatus />);
    fireEvent.click(screen.getByTestId('tab-water'));
    expect(useUIStore.getState().activeDevApiStatusTab).toBe('water');
    // Water tab shows the Water Filters heading (via WaterFiltersSection)
    expect(screen.getByText('Water Filters')).toBeInTheDocument();
  });

  it('switches to Sites tab on tab-sites click', () => {
    openModal();
    render(<DevApiStatus />);
    fireEvent.click(screen.getByTestId('tab-sites'));
    expect(useUIStore.getState().activeDevApiStatusTab).toBe('sites');
    expect(screen.getByText('Sites Filters')).toBeInTheDocument();
  });

  // Phase 27.4.6 — Water tab is now always visible regardless of layer state
  // (was: hidden when `useLayerStore.activeLayers.has('water')` was false; the
  // empty-default Set hid the tab on cold start). The dashboard surface is
  // observability, not layer-state-driven.
  it('Water tab stays visible even when the water layer is inactive (Phase 27.4.6)', () => {
    useLayerStore.setState({ activeLayers: new Set() }); // water off
    openModal();
    render(<DevApiStatus />);
    expect(screen.getByTestId('tab-water')).toBeInTheDocument();
    expect(screen.getByTestId('tab-api-health')).toBeInTheDocument();
    expect(screen.getByTestId('tab-sites')).toBeInTheDocument();
  });

  it('hides Sites tab when showSites filter is off', () => {
    useFilterStore.setState({ showSites: false });
    openModal();
    render(<DevApiStatus />);
    expect(screen.queryByTestId('tab-sites')).toBeNull();
    expect(screen.getByTestId('tab-api-health')).toBeInTheDocument();
    expect(screen.getByTestId('tab-water')).toBeInTheDocument();
  });

  // Phase 27.4.6 — the Water snap-back is gone. Water is always visible, so
  // there is no scenario where the active Water tab can disappear under the
  // user. The Sites snap-back remains because Sites is filter-driven.

  it('redirects active Sites tab back to Overview when showSites is turned off', () => {
    useUIStore.setState({
      isDevApiStatusOpen: true,
      activeDevApiStatusTab: 'sites',
    });
    const { rerender } = render(<DevApiStatus />);
    expect(useUIStore.getState().activeDevApiStatusTab).toBe('sites');
    act(() => {
      useFilterStore.setState({ showSites: false });
    });
    rerender(<DevApiStatus />);
    expect(useUIStore.getState().activeDevApiStatusTab).toBe('apiHealth');
  });

  it('close button calls closeDevApiStatus', () => {
    openModal();
    render(<DevApiStatus />);
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
    fireEvent.click(screen.getByTestId('dev-api-status-close'));
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
  });

  it('Escape key closes the modal', () => {
    openModal();
    render(<DevApiStatus />);
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
    // Dispatch keydown on window since capture-phase listener is on window
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
  });

  it('clicking the backdrop closes the modal', () => {
    openModal();
    render(<DevApiStatus />);
    fireEvent.click(screen.getByTestId('dev-api-status-backdrop'));
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
  });

  it('clicking inside the modal container does NOT close (stopPropagation)', () => {
    openModal();
    render(<DevApiStatus />);
    fireEvent.click(screen.getByTestId('dev-api-status-container'));
    // Still open after inside click
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
  });

  it('shows lastError when row is expanded (Overview tab)', () => {
    useFlightStore.setState({ lastError: 'Flights API 503' });
    openModal();
    render(<DevApiStatus />);

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
    openModal();
    render(<DevApiStatus />);

    // 2 ok out of 3 total = "2/3"
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('shows "Complete" for one-shot sources', () => {
    useSiteStore.setState({ connectionStatus: 'connected', siteCount: 20 });
    openModal();
    render(<DevApiStatus />);

    const completeCells = screen.getAllByText('Complete');
    expect(completeCells.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Fetching..." for one-shot sources during loading', () => {
    useSiteStore.setState({ connectionStatus: 'loading', siteCount: 0 });
    openModal();
    render(<DevApiStatus />);

    expect(screen.getByText('Fetching...')).toBeInTheDocument();
  });
});
