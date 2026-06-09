/**
 * Phase 28.2 Plan 04 Task 3 — WaterFacilityDetail Path B render-parity
 * + notabilityScore lockdown regression guard.
 *
 * Path B chosen for OSM ID per CONTEXT D-06 addendum + UI-SPEC §3.4.
 * Rationale: D-06 lists OSM IDs as graduation targets; Path A's
 * "preserve always-rendered behavior" creates an asymmetry where event
 * IDs (same panel-class) are Bearer-gated while OSM IDs leak to all
 * users. Path B aligns operator-tier metadata across panel classes.
 *
 * Surface A (Path B gate-swap): OSM ID row at line 117. 3 snapshots
 *   (dev / Bearer-prod / no-Bearer-prod).
 *
 * Surface B (lockdown — notabilityScore): D-07 says STAYS dev-only.
 * The lockdown test asserts that when DEV=false AND Bearer is present
 * (shouldRenderDashboard()=true), the notabilityScore row STILL hides.
 * If a future agent search-and-replaces `import.meta.env.DEV` →
 * `shouldRenderDashboard()` for the notabilityScore predicate, this
 * test fails — the regression guard.
 *
 * Test 4 (graduation does not bleed across same file): asserts that
 * within the same Bearer-prod render, OSM ID appears (graduated) AND
 * notabilityScore does NOT (locked). Catches a future "swap them all"
 * regression that would silently graduate the locked block.
 */

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WaterFacilityDetail } from '@/components/detail/WaterFacilityDetail';
import * as DashboardAuth from '@/lib/dashboardAuth';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

import type { WaterFacility } from '../../../../server/types';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof DashboardAuth>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
  };
});

vi.mock('@/hooks/useSiteImage', () => ({
  useSiteImage: () => null,
}));

const mockFacility: WaterFacility = {
  id: 'water-test-1',
  osmId: 12345,
  facilityType: 'dam',
  label: 'Test Dam',
  lat: 32.5,
  lng: 51.5,
  operator: 'Test Authority',
  stress: {
    bws_score: 3.0,
    bws_label: 'High',
    drr_score: 2.5,
    gtd_score: 1.5,
    sev_score: 2.0,
    iav_score: 1.8,
    compositeHealth: 0.5,
  },
  notabilityScore: 87,
} as unknown as WaterFacility;

// WATER-LATIN-04: a facility whose original name was non-Latin — `label` carries
// the romanized token, `nameOriginal` preserves the original for hover/sub-label.
const mockRomanizedFacility: WaterFacility = {
  ...mockFacility,
  id: 'water-test-2',
  label: 'Sd Lmwsl',
  nameLatin: 'Sd Lmwsl',
  nameOriginal: 'سد الموصل',
} as unknown as WaterFacility;

function findOsmIdRow(container: HTMLElement): HTMLElement | null {
  const labels = container.querySelectorAll('span');
  for (const el of labels) {
    if (el.textContent === 'OSM ID') {
      return el.parentElement as HTMLElement | null;
    }
  }
  return null;
}

function findNotabilityScoreSection(container: HTMLElement): HTMLElement | null {
  // The notability score block has a heading "Notability Score (dev)" — search for it.
  const headings = container.querySelectorAll('h3');
  for (const h of headings) {
    if (h.textContent?.includes('Notability Score')) {
      return h as HTMLElement;
    }
  }
  return null;
}

describe('WaterFacilityDetail — OSM ID Path B gate-swap + notabilityScore lockdown (UI-SPEC §3.4 + §1)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReset();
    // Reset cross-store state used by WaterFacilityDetail
    useEventStore.setState({ events: [] });
    useFilterStore.setState({ dateEnd: Date.now() });
    useUIStore.setState({ selectedEntityId: null });
  });

  // --- Surface A: OSM ID row (Path B gate swap) ---

  it('Surface A — Test 1 (dev render after swap): OSM ID row renders', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);
    const row = findOsmIdRow(container);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('12345');
  });

  it('Surface A — Test 2 (Bearer-prod render): OSM ID row renders when DEV=false but shouldRenderDashboard=true', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);
    const row = findOsmIdRow(container);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('12345');
  });

  it('Surface A — Test 3 (no-Bearer prod render): OSM ID row absent when shouldRenderDashboard=false', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(false);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);
    const row = findOsmIdRow(container);
    expect(row).toBeNull();
  });

  // --- Surface B: notabilityScore lockdown (D-07) ---

  it('Surface B — Test 4 (lockdown — graduation does not bleed): in Bearer-prod, OSM ID shows AND notabilityScore stays hidden', () => {
    // The single most important regression guard for this plan: a future
    // agent who search-and-replaces `import.meta.env.DEV` →
    // `shouldRenderDashboard()` across the entire file will accidentally
    // graduate notabilityScore. This test catches that drift.
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);

    // OSM ID is present (graduated via shouldRenderDashboard()).
    const osmRow = findOsmIdRow(container);
    expect(osmRow).not.toBeNull();
    expect(osmRow!.textContent).toContain('12345');

    // notabilityScore section is ABSENT — its predicate is still
    // `import.meta.env.DEV` which is false in this test env.
    const notabilitySection = findNotabilityScoreSection(container);
    expect(notabilitySection).toBeNull();
  });

  it('Surface B — Test 5 (no-Bearer prod render): both rows hidden', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(false);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);
    expect(findOsmIdRow(container)).toBeNull();
    expect(findNotabilityScoreSection(container)).toBeNull();
  });

  // --- Surface C: WATER-LATIN-04 romanized-name display ---

  it('Surface C — Test 6: romanized label displays with the original as a sub-label', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<WaterFacilityDetail facility={mockRomanizedFacility} />);
    // The romanized (searchable) display name is rendered.
    expect(container.textContent).toContain('Sd Lmwsl');
    // The preserved original is reachable (sub-label).
    expect(container.textContent).toContain('سد الموصل');
  });

  it('Surface C — Test 7: a Latin-named facility shows no original sub-label', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<WaterFacilityDetail facility={mockFacility} />);
    // No nameOriginal → no Arabic sub-label leaks in.
    expect(container.textContent).not.toContain('سد');
    // The Latin label is present.
    expect(container.textContent).toContain('Test Dam');
  });
});
