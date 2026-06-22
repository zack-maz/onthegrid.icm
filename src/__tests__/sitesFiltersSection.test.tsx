import { render, screen, fireEvent, within } from '@testing-library/react';
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
    // Phase 45 Plan 03 — render pin EVOLVED in lockstep with the intentional
    // DASH-READ-01/02/03 restyle: the rejection string-dump is now a Reason|Count
    // MetricRow table behind a collapsed disclosure; By Country is also disclosure-
    // gated. The verbatim provenance + raw→kept strings are preserved.
    resetAllStoresForSitesSection(makeSiteFilterStats());
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Sites Filters heading present
    expect(screen.getByText('Sites Filters')).toBeInTheDocument();

    // Block 1: Provenance header (source) — "snapshot" (verbatim)
    expect(screen.getByText(/snapshot/)).toBeInTheDocument();

    // Block 2: Raw/kept summary (verbatim)
    expect(screen.getByText(/876 raw → 720 kept/)).toBeInTheDocument();
    expect(screen.getByText(/\(82%\)/)).toBeInTheDocument(); // 720/876 = 82%

    // Block 3: By Type header + at least one of the 5 types rendered (default open)
    expect(screen.getByText('By Type')).toBeInTheDocument();
    expect(screen.getByText('airbase')).toBeInTheDocument();
    // airbase count = 284 (highest, so sorted first)
    expect(screen.getByText('284')).toBeInTheDocument();

    // Block 4: By Country behind a collapsed disclosure — expand, then assert
    expect(screen.queryByText('United Arab Emirates')).toBeNull();
    fireEvent.click(screen.getByTestId('sites-country-toggle'));
    const countryPanel = document.getElementById('sites-country-panel');
    expect(countryPanel).not.toBeNull();
    expect(
      within(countryPanel as HTMLElement).getByText('United Arab Emirates'),
    ).toBeInTheDocument();

    // Block 5: Rejections — 4-bucket Reason|Count table behind a collapsed disclosure
    fireEvent.click(screen.getByTestId('sites-rejections-toggle'));
    const rejPanel = document.getElementById('sites-rejections-panel');
    expect(rejPanel).not.toBeNull();
    expect(
      within(rejPanel as HTMLElement).getByTestId('sites-rejection-excluded_turkey-value'),
    ).toHaveTextContent('156');
    expect(
      within(rejPanel as HTMLElement).getByTestId('sites-rejection-no_coords-value'),
    ).toHaveTextContent('0');
    expect(
      within(rejPanel as HTMLElement).getByTestId('sites-rejection-no_type-value'),
    ).toHaveTextContent('0');
    expect(
      within(rejPanel as HTMLElement).getByTestId('sites-rejection-duplicate-value'),
    ).toHaveTextContent('0');

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
    // empty stats pre-Plan-11). Phase 45 Plan 03 — By Country is now disclosure-gated.
    resetAllStoresForSitesSection(makeSiteFilterStats({ source: 'redis' }));
    openAndSelectSitesTab();
    render(<DevApiStatus />);
    // source=redis in provenance header proves the envelope round-trip path
    expect(screen.getByText(/redis/)).toBeInTheDocument();
    // byType populated: all 5 sites types should appear (default open)
    expect(screen.getByText('airbase')).toBeInTheDocument();
    expect(screen.getByText('port')).toBeInTheDocument();
    expect(screen.getByText('oil')).toBeInTheDocument();
    expect(screen.getByText('naval')).toBeInTheDocument();
    expect(screen.getByText('nuclear')).toBeInTheDocument();
    // byCountry populated behind the disclosure: 3 countries from the fixture
    fireEvent.click(screen.getByTestId('sites-country-toggle'));
    const countryPanel = document.getElementById('sites-country-panel') as HTMLElement;
    expect(within(countryPanel).getByText('United Arab Emirates')).toBeInTheDocument();
    expect(within(countryPanel).getByText('Israel')).toBeInTheDocument();
    expect(within(countryPanel).getByText('Kuwait')).toBeInTheDocument();
  });

  it('Phase 45 DASH-READ render contract: one primary metric, two weights only, disclosure aria-expanded flips', () => {
    resetAllStoresForSitesSection(makeSiteFilterStats());
    openAndSelectSitesTab();
    render(<DevApiStatus />);

    // Scope all weight/metric assertions to the SitesFiltersSection container
    // (the `border-t` block that owns the "Sites Filters" heading) — the Phase-40
    // modal chrome (h2 title) lives outside the subtab and is out of scope.
    const sitesSection = screen.getByText('Sites Filters').closest('div') as HTMLElement;
    expect(sitesSection).not.toBeNull();

    // (a) Exactly ONE 13px/600 primary metric headline in the sites subtab
    const primaries = sitesSection.querySelectorAll('.text-\\[13px\\].font-semibold');
    expect(primaries.length).toBe(1);
    expect(screen.getByTestId('sites-primary-metric')).toHaveTextContent('82%');

    // (b) Two weights only — no font-bold (700) survives in the restyled section
    expect(sitesSection.querySelectorAll('.font-bold').length).toBe(0);

    // (c) Progressive disclosure: rejections collapsed by default, aria-expanded flips
    const toggle = screen.getByTestId('sites-rejections-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('sites-rejections-panel')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('sites-rejections-panel')).not.toBeNull();
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
