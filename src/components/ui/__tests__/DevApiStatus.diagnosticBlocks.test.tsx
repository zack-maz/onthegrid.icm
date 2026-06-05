/**
 * Phase 28.2 W5 Plan 05 Tasks 3-6 — DevApiStatus diagnostic blocks tests.
 *
 * Tests the four NEW D-23 diagnostic blocks layered onto the merged API
 * Health tab:
 *   Block 1 (Task 3): tier-grouped summary banner
 *   Block 2 (Task 4): per-endpoint quality metrics
 *   Block 3 (Task 5): per-endpoint manual retry button
 *   Block 4 (Task 6): recent-fetch sparkline
 *
 * Tests for blocks 2/3/4 are RED until the corresponding implementation
 * lands. Test names map 1:1 to plan acceptance criteria.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFlightStore } from '@/stores/flightStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';

type HealthSummary = HealthResponse['summary'];

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

function makeSummary(overrides: Partial<HealthSummary>): HealthSummary {
  return {
    critical: { healthy: 5, degraded: 0, unhealthy: 0, unknown: 0 },
    nonCritical: { healthy: 9, degraded: 1, unhealthy: 0, unknown: 0 },
    static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
    cron: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
    ...overrides,
  };
}

function makeResponse(opts: {
  endpoints?: Record<string, EndpointHealth>;
  summary?: Partial<HealthSummary>;
}): HealthResponse {
  return {
    endpoints: opts.endpoints ?? {
      Flights: makeEndpoint({ name: 'Flights' }),
      Events: makeEndpoint({ name: 'Events', tier: 'non-critical' }),
      Water: makeEndpoint({ name: 'Water', tier: 'non-critical' }),
      Ships: makeEndpoint({ name: 'Ships', tier: 'non-critical' }),
    },
    summary: makeSummary(opts.summary ?? {}),
    generatedAt: Date.now(),
  };
}

function renderModal(opts: {
  health: HealthResponse | null;
  loading?: boolean;
  error?: Error | null;
}) {
  const { health, loading = false, error = null } = opts;
  const value = { health, loading, error, lastSuccessAt: Date.now() };

  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'apiHealth',
  });

  return render(
    <HealthStatusContext.Provider value={value}>
      <DevApiStatus />
    </HealthStatusContext.Provider>,
  );
}

describe('DevApiStatus diagnostic blocks (Phase 28.2 W5 Plan 05 Tasks 3-6)', () => {
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

  describe('Block 1 (Task 3) — tier summary banner', () => {
    it('Test 1: renders tier-grouped summary banner with verbatim copy + breakdown line', () => {
      const health = makeResponse({
        endpoints: {
          F: makeEndpoint({ name: 'F', tier: 'critical', status: 'healthy' }),
          G: makeEndpoint({ name: 'G', tier: 'critical', status: 'healthy' }),
          H: makeEndpoint({ name: 'H', tier: 'critical', status: 'healthy' }),
          I: makeEndpoint({ name: 'I', tier: 'critical', status: 'healthy' }),
          J: makeEndpoint({ name: 'J', tier: 'critical', status: 'healthy' }),
          K: makeEndpoint({ name: 'K', tier: 'non-critical', status: 'healthy' }),
          L: makeEndpoint({ name: 'L', tier: 'non-critical', status: 'healthy' }),
          M: makeEndpoint({ name: 'M', tier: 'non-critical', status: 'healthy' }),
          N: makeEndpoint({ name: 'N', tier: 'non-critical', status: 'healthy' }),
          O: makeEndpoint({ name: 'O', tier: 'non-critical', status: 'healthy' }),
          P: makeEndpoint({ name: 'P', tier: 'non-critical', status: 'healthy' }),
          Q: makeEndpoint({ name: 'Q', tier: 'non-critical', status: 'healthy' }),
          R: makeEndpoint({ name: 'R', tier: 'non-critical', status: 'healthy' }),
          S: makeEndpoint({ name: 'S', tier: 'non-critical', status: 'healthy' }),
          T: makeEndpoint({ name: 'T', tier: 'non-critical', status: 'degraded' }),
          U: makeEndpoint({ name: 'U', tier: 'cron', status: 'healthy' }),
        },
        summary: {
          critical: { healthy: 5, degraded: 0, unhealthy: 0, unknown: 0 },
          nonCritical: { healthy: 9, degraded: 1, unhealthy: 0, unknown: 0 },
          cron: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
        },
      });
      renderModal({ health });
      const banner = screen.getByTestId('tier-summary-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('15 of 16 healthy');
      expect(banner.textContent).toContain('1 degraded');
      expect(banner.textContent).toContain('0 unhealthy');
      expect(banner.textContent).toContain('critical: 5/5');
      expect(banner.textContent).toContain('non-critical: 9/10');
      expect(banner.textContent).toContain('cron: 1/1');
    });

    it('Test 2: dot indicators source from CSS variables (no inline hex)', () => {
      const health = makeResponse({});
      renderModal({ health });
      const banner = screen.getByTestId('tier-summary-banner');
      const dots = banner.querySelectorAll('span[style]');
      // Expect at least 3 dots; each must use a CSS var, not hex literal.
      expect(dots.length).toBeGreaterThanOrEqual(3);
      const styles = Array.from(dots).map((d) => (d as HTMLElement).getAttribute('style') ?? '');
      // Phase 40 Task 2 — tier-banner dots migrated to the operator-console
      // --color-status-* namespace (byte-identical hex; zero visual change).
      expect(styles.some((s) => s.includes('var(--color-status-healthy)'))).toBe(true);
      expect(styles.some((s) => s.includes('var(--color-status-degraded)'))).toBe(true);
      expect(styles.some((s) => s.includes('var(--color-status-warning)'))).toBe(true);
    });

    it('Test 3: spacing classes are multiples of 4', () => {
      const health = makeResponse({});
      renderModal({ health });
      const banner = screen.getByTestId('tier-summary-banner');
      const cls = banner.className;
      expect(cls).toContain('mb-2');
      expect(cls).toContain('px-3');
      expect(cls).toContain('py-1');
      expect(cls).toContain('gap-3');
      // The banner uses text-[10px] sizing per spec
      expect(cls).toContain('text-[10px]');
    });

    it('Test 4: loading state (health=null) does NOT render the banner', () => {
      renderModal({ health: null, loading: true });
      expect(screen.queryByTestId('tier-summary-banner')).toBeNull();
    });

    it('Test 5: cron.total === 0 still renders cron: 0/0 (no division-by-zero)', () => {
      const health = makeResponse({
        summary: {
          critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
          nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
          cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
        },
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const banner = screen.getByTestId('tier-summary-banner');
      expect(banner.textContent).toContain('cron: 0/0');
    });
  });

  describe('Block 2 (Task 4) — per-endpoint quality metrics', () => {
    beforeEach(() => {
      // Seed event store with quality fixture
      useEventStore.setState({
        events: [
          // 12 exact + 8 city + 3 region = 23 events, 18 LLM, 5 raw -> 78%
          ...Array.from({ length: 12 }, (_, i) => ({
            id: `e${i}`,
            type: 'airstrike' as const,
            lat: 0,
            lng: 0,
            timestamp: Date.now(),
            label: '',
            data: {
              cameoEventCode: '193',
              cameoBaseCode: '19',
              precision: 'exact' as const,
              llmProcessed: i < 9, // 9 LLM in this set
            },
          })),
          ...Array.from({ length: 8 }, (_, i) => ({
            id: `c${i}`,
            type: 'on_ground' as const,
            lat: 0,
            lng: 0,
            timestamp: Date.now(),
            label: '',
            data: {
              cameoEventCode: '170',
              cameoBaseCode: '17',
              precision: 'city' as const,
              llmProcessed: i < 6, // 6 LLM in this set
            },
          })),
          ...Array.from({ length: 3 }, (_, i) => ({
            id: `r${i}`,
            type: 'other' as const,
            lat: 0,
            lng: 0,
            timestamp: Date.now(),
            label: '',
            data: {
              cameoEventCode: '180',
              cameoBaseCode: '18',
              precision: 'region' as const,
              llmProcessed: i < 3, // 3 LLM in this set
            },
          })),
        ],
        // Total: 9+6+3 = 18 LLM, 5 raw, 78% = round(18/23*100)
      } as Partial<ReturnType<typeof useEventStore.getState>>);
      // Seed flight store: 7 unidentified of 142 total
      useFlightStore.setState({
        flights: Array.from({ length: 142 }, (_, i) => ({
          id: `f${i}`,
          type: 'flight' as const,
          lat: 0,
          lng: 0,
          timestamp: Date.now(),
          label: '',
          data: {
            unidentified: i < 7,
            altitude: 30000,
            speed: 0,
            heading: 0,
          },
        })),
      } as Partial<ReturnType<typeof useFlightStore.getState>>);
      // Seed water store filterStats: admitted 305 of 1284
      useWaterStore.setState({
        filterStats: {
          rawCounts: { dam: 800, reservoir: 400, desalination: 84 },
          filteredCounts: { dam: 200, reservoir: 80, desalination: 25 },
          rejections: {
            excluded_location: 0,
            excluded_turkey: 0,
            not_notable: 0,
            no_name: 0,
            no_resolved_name: 0,
            duplicate: 0,
            low_score: 0,
            no_city: 0,
          },
          byTypeRejections: {},
          byCountry: {},
          overpass: [],
          source: 'overpass',
          generatedAt: new Date().toISOString(),
          enrichment: { withCapacity: 0, withCity: 0, withRiver: 0 },
          scoreHistogram: [],
        },
      } as Partial<ReturnType<typeof useWaterStore.getState>>);
    });

    it('Test 6 (per-endpoint quality — events): renders Precision histogram + LLM-vs-raw verbatim copy', () => {
      const health = makeResponse({
        endpoints: { Events: makeEndpoint({ name: 'Events' }) },
      });
      renderModal({ health });
      const row = screen.getByTestId('all-apis-row-Events');
      fireEvent.click(row);
      // Quality block content lives inside the expanded row
      expect(screen.getByText(/Precision: exact 12 \/ city 8 \/ region 3/)).toBeDefined();
      expect(screen.getByText(/LLM-vs-raw: 78%/)).toBeDefined();
    });

    it('Test 7 (per-endpoint quality — water): renders Admission verbatim copy', () => {
      const health = makeResponse({
        endpoints: { Water: makeEndpoint({ name: 'Water' }) },
      });
      renderModal({ health });
      const row = screen.getByTestId('all-apis-row-Water');
      fireEvent.click(row);
      expect(screen.getByText(/Admission: 305 of 1284 \(24%\)/)).toBeDefined();
    });

    it('Test 8 (per-endpoint quality — flights): renders Unidentified verbatim copy', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const row = screen.getByTestId('all-apis-row-Flights');
      fireEvent.click(row);
      expect(screen.getByText(/Unidentified: 7 of 142/)).toBeDefined();
    });

    it('Test 9 (per-endpoint quality — ships): NO quality block', () => {
      const health = makeResponse({
        endpoints: { Ships: makeEndpoint({ name: 'Ships' }) },
      });
      renderModal({ health });
      const row = screen.getByTestId('all-apis-row-Ships');
      fireEvent.click(row);
      // No Precision / Admission / Unidentified copy
      expect(screen.queryByText(/Precision:/)).toBeNull();
      expect(screen.queryByText(/Admission:/)).toBeNull();
      expect(screen.queryByText(/Unidentified:/)).toBeNull();
    });
  });

  describe('Block 3 (Task 5) — per-endpoint manual retry button', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      vi.stubGlobal('fetch', fetchSpy);
    });

    it('Test 11: Refresh now button renders inside Flights expanded row with class spec', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      fireEvent.click(screen.getByTestId('all-apis-row-Flights'));
      const btn = screen.getByTestId('api-health-retry-Flights');
      expect(btn.textContent).toBe('Refresh now');
      const cls = btn.className;
      expect(cls).toContain('text-xs');
      expect(cls).toContain('px-2');
      expect(cls).toContain('py-1');
      expect(cls).toContain('rounded');
      expect(cls).toContain('border-white/10');
    });

    it('Test 12: clicking the button changes copy to Refreshing... and fires a fetch', async () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      fireEvent.click(screen.getByTestId('all-apis-row-Flights'));
      const btn = screen.getByTestId('api-health-retry-Flights');
      fireEvent.click(btn);
      // Synchronously the button text flips.
      expect(btn.textContent).toBe('Refreshing...');
      // Fetch was called
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('Test 14 (cache-bust scope): retry does NOT call /llm-replay or events:llm:v3 URL', async () => {
      const health = makeResponse({
        endpoints: { Events: makeEndpoint({ name: 'Events' }) },
      });
      renderModal({ health });
      fireEvent.click(screen.getByTestId('all-apis-row-Events'));
      fireEvent.click(screen.getByTestId('api-health-retry-Events'));
      const calls = fetchSpy.mock.calls.map((c) => String(c[0] ?? ''));
      expect(calls.some((u) => u.includes('llm-replay'))).toBe(false);
      expect(calls.some((u) => u.includes('events:llm:v3'))).toBe(false);
    });

    it('Test 15: Bearer attached on retry fetch', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      fireEvent.click(screen.getByTestId('all-apis-row-Flights'));
      fireEvent.click(screen.getByTestId('api-health-retry-Flights'));
      // Find at least one call where headers include Bearer
      const found = fetchSpy.mock.calls.some((call) => {
        const init = call[1] as RequestInit | undefined;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const auth = headers['Authorization'] ?? '';
        return auth.startsWith('Bearer ');
      });
      expect(found).toBe(true);
    });
  });

  describe('Block 4 (Task 6) — recent-fetch sparkline', () => {
    beforeEach(() => {
      // Seed flightStore.recentFetches with 7 entries (5 ok, 2 fail)
      useFlightStore.setState({
        recentFetches: [
          { ok: true, durationMs: 100, timestamp: 1 },
          { ok: false, durationMs: 100, timestamp: 2 },
          { ok: true, durationMs: 100, timestamp: 3 },
          { ok: true, durationMs: 100, timestamp: 4 },
          { ok: false, durationMs: 100, timestamp: 5 },
          { ok: true, durationMs: 100, timestamp: 6 },
          { ok: true, durationMs: 100, timestamp: 7 },
        ],
      } as Partial<ReturnType<typeof useFlightStore.getState>>);
    });

    it('Test 16: Flights sparkline has exactly 10 dots; first 3 are placeholder, rest colored', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const sl = screen.getByTestId('api-health-sparkline-Flights');
      const dots = sl.querySelectorAll('span');
      expect(dots.length).toBe(10);
      // First 3 placeholders (oldest/padding) — bg-white/10 class
      expect((dots[0] as HTMLElement).className).toContain('bg-white/10');
      expect((dots[1] as HTMLElement).className).toContain('bg-white/10');
      expect((dots[2] as HTMLElement).className).toContain('bg-white/10');
      // Last 7 have inline backgroundColor matching the var pattern
      const last7Styles = Array.from(dots)
        .slice(3)
        .map((d) => (d as HTMLElement).getAttribute('style') ?? '');
      // Phase 40 Task 2 — sparkline dots migrated to the --color-status-*
      // namespace (ok → status-healthy, fail → status-degraded).
      const greens = last7Styles.filter((s) => s.includes('--color-status-healthy')).length;
      const reds = last7Styles.filter((s) => s.includes('--color-status-degraded')).length;
      expect(greens).toBe(5);
      expect(reds).toBe(2);
    });

    it('Test 17: empty recentFetches → all 10 dots are bg-white/10 placeholders', () => {
      useFlightStore.setState({ recentFetches: [] } as Partial<
        ReturnType<typeof useFlightStore.getState>
      >);
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const sl = screen.getByTestId('api-health-sparkline-Flights');
      const dots = sl.querySelectorAll('span');
      const placeholders = Array.from(dots).filter((d) =>
        (d as HTMLElement).className.includes('bg-white/10'),
      );
      expect(placeholders.length).toBe(10);
    });

    it('Test 18: 15 recentFetches → only the LAST 10 (newest) render', () => {
      useFlightStore.setState({
        recentFetches: Array.from({ length: 15 }, (_, i) => ({
          ok: i >= 5,
          durationMs: 100,
          timestamp: i + 1,
        })),
      } as Partial<ReturnType<typeof useFlightStore.getState>>);
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const sl = screen.getByTestId('api-health-sparkline-Flights');
      const dots = sl.querySelectorAll('span');
      expect(dots.length).toBe(10);
      // Newest 10 = entries 5..14. Entries 5..14 have ok=true (i>=5 in seed).
      const styles = Array.from(dots).map((d) => (d as HTMLElement).getAttribute('style') ?? '');
      // Phase 40 Task 2 — sparkline ok-dot migrated to --color-status-healthy.
      const greens = styles.filter((s) => s.includes('--color-status-healthy')).length;
      // Items 5..14: ok=true => 10 greens
      expect(greens).toBe(10);
    });

    it('Test 19: dot/container classes — flex gap-1 + w-1 h-1 rounded-full', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const sl = screen.getByTestId('api-health-sparkline-Flights');
      expect(sl.className).toContain('flex');
      expect(sl.className).toContain('gap-1');
      const firstDot = sl.querySelector('span') as HTMLElement;
      expect(firstDot.className).toContain('w-1');
      expect(firstDot.className).toContain('h-1');
      expect(firstDot.className).toContain('rounded-full');
    });

    it('Test 20: sparkline lives inside the per-endpoint table row (NOT inside expanded view)', () => {
      const health = makeResponse({
        endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
      });
      renderModal({ health });
      const sl = screen.getByTestId('api-health-sparkline-Flights');
      // It should be a descendant of the row element
      const row = screen.getByTestId('all-apis-row-Flights');
      expect(row.contains(sl)).toBe(true);
    });
  });
});
