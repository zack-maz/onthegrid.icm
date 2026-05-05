/**
 * Phase 28.2 Plan 04 Task 2 — EventDetail render-parity for two gate swaps.
 *
 * Per UI-SPEC §3.5: 6 snapshots = 2 surfaces × 3 conditions:
 *   Surface A: event-ID DetailValue row at line 56.
 *   Surface B: Confidence + GeoPrecision wrapper at line 165 (entire
 *     wrapper div with `mt-2 border-t border-white/5 pt-2` classes plus
 *     both child DetailValue rows).
 *
 * Conditions: dev-after-swap, Bearer-prod-after-swap, no-Bearer-prod-after-swap.
 *
 * Bearer-prod surfaces fail BEFORE the gate swaps land (predicates were
 * `import.meta.env.DEV` which is false in vi.stubEnv('DEV', false) mode
 * but `shouldRenderDashboard()` returns true via the mock). Atomic-commit
 * RED → GREEN.
 */

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EventDetail } from '@/components/detail/EventDetail';
import * as DashboardAuth from '@/lib/dashboardAuth';
import type { ConflictEventEntity } from '@/types/entities';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof DashboardAuth>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
  };
});

// Mock the satellite-image hook so the test stays deterministic in jsdom.
vi.mock('@/hooks/useSiteImage', () => ({
  useSiteImage: () => 'data:image/png;base64,placeholder',
}));

const mockEnrichedEvent: ConflictEventEntity = {
  id: 'evt-airstrike-xyz789',
  type: 'airstrike',
  lat: 32.654321,
  lng: 51.123456,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 3,
    actor1: 'Coalition',
    actor2: 'IRGC',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -7.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
    confidence: 0.8472,
    geoPrecision: 'nominatim-verified-2pass',
    llmProcessed: true,
    precision: 'neighborhood',
  },
};

function findEventIdRow(container: HTMLElement): HTMLElement | null {
  // The DetailValue row labeled "ID" surfaces "ID" as its label and
  // the entity's full id as the value. Search by text.
  const labels = container.querySelectorAll('span');
  for (const el of labels) {
    if (el.textContent === 'ID') {
      // The DetailValue parent row.
      return el.parentElement as HTMLElement | null;
    }
  }
  return null;
}

function findConfidenceWrapper(container: HTMLElement): HTMLElement | null {
  // The wrapper div has the verbatim class string `mt-2 border-t border-white/5 pt-2`
  // (UI-SPEC §3.3). Use a class-based query so we never confuse it with
  // DetailValue rows.
  return container.querySelector('div.mt-2.border-t.border-white\\/5.pt-2') as HTMLElement | null;
}

describe('EventDetail — event-ID row + Confidence/GeoPrecision wrapper gate-swap (UI-SPEC §3.2/§3.3, §3.5)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReset();
  });

  // --- Surface A: event-ID row ---

  it('Surface A — Test 1 (dev render after swap): ID row renders with full entity.id', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const row = findEventIdRow(container);
    expect(row).not.toBeNull();
    // Full id shown (not truncated)
    expect(row!.textContent).toContain('evt-airstrike-xyz789');
  });

  it('Surface A — Test 2 (Bearer-prod render): ID row renders when DEV=false but shouldRenderDashboard=true', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const row = findEventIdRow(container);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('evt-airstrike-xyz789');
  });

  it('Surface A — Test 3 (no-Bearer prod render): ID row absent when shouldRenderDashboard=false', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(false);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const row = findEventIdRow(container);
    expect(row).toBeNull();
  });

  // --- Surface B: Confidence + GeoPrecision wrapper ---

  it('Surface B — Test 1 (dev render after swap): wrapper renders with .toFixed(3) confidence and raw geoPrecision', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const wrapper = findConfidenceWrapper(container);
    expect(wrapper).not.toBeNull();
    // .toFixed(3) on 0.8472 → "0.847"
    expect(wrapper!.textContent).toContain('0.847');
    // raw enum string preserved (no remap, no humanization)
    expect(wrapper!.textContent).toContain('nominatim-verified-2pass');
  });

  it('Surface B — Test 2 (Bearer-prod render): wrapper renders when DEV=false but shouldRenderDashboard=true', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const wrapper = findConfidenceWrapper(container);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.textContent).toContain('0.847');
    expect(wrapper!.textContent).toContain('nominatim-verified-2pass');
  });

  it('Surface B — Test 3 (no-Bearer prod render): wrapper absent when shouldRenderDashboard=false', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(false);
    const { container } = render(<EventDetail entity={mockEnrichedEvent} />);
    const wrapper = findConfidenceWrapper(container);
    expect(wrapper).toBeNull();
  });
});
