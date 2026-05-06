import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { DevApiStatus } from '@/components/ui/DevApiStatus';
import { useEventStore } from '@/stores/eventStore';
import { useFlightStore } from '@/stores/flightStore';
import { useMarketStore } from '@/stores/marketStore';
import { useNewsStore } from '@/stores/newsStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore, type SiteFilterStats } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import { useWeatherStore } from '@/stores/weatherStore';

// Mock useLLMStatusPolling (same pattern as devApiStatus.test.tsx)
const mockLLMStatus = { stage: 'idle' as const, lastRun: null };
vi.mock('@/hooks/useLLMStatusPolling', () => ({
  useLLMStatusPolling: () => mockLLMStatus,
}));

// Import AFTER mocks

function makeSiteFilterStats(overrides: Partial<SiteFilterStats> = {}): SiteFilterStats {
  return {
    rawCount: 876,
    filteredCount: 720,
    rejections: {
      excluded_turkey: 156,
      no_coords: 0,
      no_type: 0,
      duplicate: 0,
    },
    byCountry: {
      'United Arab Emirates': { port: 50, airbase: 15, naval: 7, nuclear: 5, oil: 2 },
      Israel: { airbase: 29, port: 28, oil: 11, naval: 6, nuclear: 2 },
      Kuwait: { airbase: 25, port: 23, oil: 15, naval: 13 },
    },
    byType: { airbase: 284, port: 232, oil: 99, naval: 60, nuclear: 45 },
    overpass: [
      {
        facilityType: 'sites',
        mirror: 'primary',
        status: 200,
        durationMs: 17524,
        attempts: 1,
        ok: true,
      },
    ],
    source: 'snapshot',
    generatedAt: '2026-04-19T08:28:47.786Z',
    ...overrides,
  };
}

function resetAllStoresForSitesSection(filterStats: SiteFilterStats | null) {
  const now = Date.now();
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
    filterStats,
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

/**
 * Phase 27.3.1 Plan 12 G6 — DevApiStatus is a modal with Sites as its own
 * tab. Set both flags via uiStore.setState BEFORE render() so the component
 * mounts with the Sites tab visible in one pass (no re-render race).
 */
function openAndSelectSitesTab() {
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'sites',
  });
}

describe('SitesFiltersSection (Phase 27.3.1 R-05 D-19)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset UI store to closed + apiHealth tab so tests start from a clean slate
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
    Object.assign(mockLLMStatus, { stage: 'idle', lastRun: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the null-safe placeholder when siteStore.filterStats is null', () => {
    resetAllStoresForSitesSection(null);
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Sites Filters heading present in the Sites tab body
    expect(screen.getByText('Sites Filters')).toBeInTheDocument();
    // Placeholder "loading filter stats…" renders because siteStore.filterStats is null
    expect(screen.getByText(/loading filter stats…/)).toBeInTheDocument();
  });

  it('renders all 6 blocks when filterStats is populated (provenance, raw/kept, byType, byCountry, rejections, Overpass health)', () => {
    resetAllStoresForSitesSection(makeSiteFilterStats());
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Sites Filters heading present
    expect(screen.getByText('Sites Filters')).toBeInTheDocument();

    // Block 1: Provenance header (source) — "snapshot"
    expect(screen.getByText(/snapshot/)).toBeInTheDocument();

    // Block 2: Raw/kept summary
    expect(screen.getByText(/876 raw → 720 kept/)).toBeInTheDocument();
    expect(screen.getByText(/\(82%\)/)).toBeInTheDocument(); // 720/876 = 82%

    // Block 3: By Type header + at least one of the 5 types rendered
    expect(screen.getByText('By Type')).toBeInTheDocument();
    expect(screen.getByText('airbase')).toBeInTheDocument();
    // airbase count = 284 (highest, so sorted first)
    expect(screen.getByText('284')).toBeInTheDocument();

    // Block 4: By Country header
    expect(screen.getByText('By Country')).toBeInTheDocument();
    expect(screen.getByText('United Arab Emirates')).toBeInTheDocument();

    // Block 5: Rejections row — 4 buckets, sites-specific
    const rejectionsLine = screen.getByText(/turkey=156.*nocoords=0.*notype=0.*dup=0/);
    expect(rejectionsLine).toBeInTheDocument();

    // Block 6: Overpass Health
    expect(screen.getByText('Overpass Health')).toBeInTheDocument();
    expect(
      screen.getByText(/sites.*primary.*status=200.*17524ms.*attempts=1.*OK/),
    ).toBeInTheDocument();
  });

  it('Plan 11 Redis envelope round-trip: populated siteStore.filterStats renders the full byType + byCountry tables', () => {
    // Regression test for Plan 11 — confirms that when the Redis envelope
    // round-trips populated filterStats into siteStore (as it does post-deploy
    // on a warm sites:v3 key), the Sites tab renders the populated tables.
    // This is the UAT Test 5 regression check (was failing when Redis echoed
    // empty stats pre-Plan-11).
    resetAllStoresForSitesSection(makeSiteFilterStats({ source: 'redis' }));
    openAndSelectSitesTab();
    render(<DevApiStatus />);
    // source=redis in provenance header proves the envelope round-trip path
    expect(screen.getByText(/redis/)).toBeInTheDocument();
    // byType populated: all 5 sites types should appear
    expect(screen.getByText('airbase')).toBeInTheDocument();
    expect(screen.getByText('port')).toBeInTheDocument();
    expect(screen.getByText('oil')).toBeInTheDocument();
    expect(screen.getByText('naval')).toBeInTheDocument();
    expect(screen.getByText('nuclear')).toBeInTheDocument();
    // byCountry populated: 3 countries from the fixture
    expect(screen.getByText('United Arab Emirates')).toBeInTheDocument();
    expect(screen.getByText('Israel')).toBeInTheDocument();
    expect(screen.getByText('Kuwait')).toBeInTheDocument();
  });

  it('tolerates an empty overpass array (no Overpass Health block rendered)', () => {
    resetAllStoresForSitesSection(makeSiteFilterStats({ overpass: [] }));
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Sites section still renders otherwise (heading present)
    expect(screen.getByText('Sites Filters')).toBeInTheDocument();
    // Overpass Health heading should NOT be visible
    expect(screen.queryByText('Overpass Health')).toBeNull();
  });

  it('does not render a Rejections by Type block for sites (asymmetry with water byTypeRejections)', () => {
    resetAllStoresForSitesSection(makeSiteFilterStats());
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Sites section intentionally omits a "Rejections by Type" block because
    // the sites adapter uses a single combined Overpass query rather than
    // per-type queries.
    expect(screen.queryByText('Rejections by Type')).toBeNull();
  });
});
