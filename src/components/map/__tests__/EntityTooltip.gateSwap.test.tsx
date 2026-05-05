/**
 * Phase 28.2 Plan 04 Task 1 — EntityTooltip event-ID subscript render-parity.
 *
 * Per UI-SPEC §3.5: 4 render-parity snapshots covering the gate swap from
 * `import.meta.env.DEV` to `shouldRenderDashboard()` for the event-ID
 * debug subscript at EntityTooltip.tsx:125.
 *
 * Test 1 (dev render — baseline + after-swap parity): with
 *   `import.meta.env.DEV === true` (vitest default) AND
 *   `shouldRenderDashboard()` mocked to return true, the subscript renders
 *   with the verbatim styling from UI-SPEC §3.1 (color #6b7280, fontSize
 *   8px, marginLeft 4px, slice(0, 12)).
 * Test 2 (dev render after gate swap): same as Test 1 — captures the
 *   "no styling drift" property; renders identically.
 * Test 3 (Bearer-prod render): `shouldRenderDashboard()` returns true
 *   even with `import.meta.env.DEV === false` (Bearer in localStorage);
 *   subscript renders identically to dev.
 * Test 4 (no-Bearer prod render): `shouldRenderDashboard()` returns false;
 *   subscript is absent.
 *
 * Test 3 fails BEFORE the gate swap (the predicate at line 125 was
 * `import.meta.env.DEV` which is false in Test 3's environment but
 * `shouldRenderDashboard()` returns true). Atomic-commit RED → GREEN.
 */

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EntityTooltip } from '@/components/map/EntityTooltip';
import * as DashboardAuth from '@/lib/dashboardAuth';
import type { ConflictEventEntity } from '@/types/entities';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof DashboardAuth>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
  };
});

const mockEvent: ConflictEventEntity = {
  id: 'event-airstrike-abc123def456',
  type: 'airstrike',
  lat: 32.0,
  lng: 51.0,
  timestamp: Date.now(),
  label: 'Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'Unknown',
    actor2: 'Iran',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -5.0,
    locationName: 'Isfahan, Iran',
    cameoCode: '195',
  },
};

function findIdSubscript(container: HTMLElement): HTMLElement | null {
  // The subscript is the only span styled with fontSize 8px in the tooltip.
  const spans = container.querySelectorAll('span');
  for (const s of spans) {
    if ((s as HTMLElement).style.fontSize === '8px') {
      return s as HTMLElement;
    }
  }
  return null;
}

describe('EntityTooltip — event-ID subscript gate-swap (UI-SPEC §3.1, §3.5)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReset();
  });

  it('Test 1 (dev render baseline): subscript renders with UI-SPEC §3.1 verbatim styling', () => {
    // import.meta.env.DEV = true is vitest's default; shouldRenderDashboard returns true.
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EntityTooltip entity={mockEvent} x={100} y={100} />);
    const subscript = findIdSubscript(container);
    expect(subscript).not.toBeNull();
    expect(subscript!.style.color).toBe('rgb(107, 114, 128)'); // #6b7280
    expect(subscript!.style.fontSize).toBe('8px');
    expect(subscript!.style.marginLeft).toBe('4px');
    // entity.id sliced to 12 chars: 'event-airstr'
    expect(subscript!.textContent).toBe(mockEvent.id.slice(0, 12));
  });

  it('Test 2 (dev render after swap): byte-identical to Test 1', () => {
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EntityTooltip entity={mockEvent} x={100} y={100} />);
    const subscript = findIdSubscript(container);
    expect(subscript).not.toBeNull();
    // outerHTML is the byte-equality assertion: any class/style/text drift
    // surfaces as a string mismatch.
    expect(subscript!.outerHTML).toBe(
      `<span style="color: rgb(107, 114, 128); font-size: 8px; margin-left: 4px;">${mockEvent.id.slice(0, 12)}</span>`,
    );
  });

  it('Test 3 (Bearer-prod render): subscript renders when DEV=false but shouldRenderDashboard=true', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(true);
    const { container } = render(<EntityTooltip entity={mockEvent} x={100} y={100} />);
    const subscript = findIdSubscript(container);
    expect(subscript).not.toBeNull();
    expect(subscript!.style.color).toBe('rgb(107, 114, 128)');
    expect(subscript!.style.fontSize).toBe('8px');
    expect(subscript!.style.marginLeft).toBe('4px');
    expect(subscript!.textContent).toBe(mockEvent.id.slice(0, 12));
  });

  it('Test 4 (no-Bearer prod render): subscript absent when shouldRenderDashboard=false', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(DashboardAuth.shouldRenderDashboard).mockReturnValue(false);
    const { container } = render(<EntityTooltip entity={mockEvent} x={100} y={100} />);
    const subscript = findIdSubscript(container);
    expect(subscript).toBeNull();
  });
});
