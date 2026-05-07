/**
 * Phase 28.2.5 D-05 — WeatherOverlay tooltip + findNearestPrecip widening tests.
 *
 * Three concerns covered:
 *   - findNearestPrecip widens from 2° → 4° Manhattan cutoff
 *   - Return shape changes from `PrecipitationData | null` to
 *     `{ value: PrecipitationData; distanceKm: number } | null`
 *   - WeatherTooltip renders "nearest sample, X km away" hint when
 *     distanceKm > 100km, suppresses the hint otherwise
 *
 * Per RESEARCH Open Question 2: cutoff = 4.0° Manhattan (~400km Manhattan,
 * ~280km Euclidean for mid-latitude positions in the Iran bbox).
 * Per RESEARCH Open Question 3: hint threshold = 100km Euclidean.
 *
 * Hydration verification (RESEARCH Landmine #2): useWaterPrecipPolling is
 * unconditional in AppShell.tsx:45 — no code change required, this test
 * does not exercise that path.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WeatherTooltip } from '@/components/map/layers/WeatherOverlay';
import type { PrecipitationData } from '@/stores/waterStore';
import type { WeatherGridPoint } from '@/stores/weatherStore';

// Mock the waterStore so we control rawPrecipData directly.
// Per Phase 27.3.2 the store exposes the rawPrecipData selector consumed at
// WeatherOverlay.tsx:99-102.
vi.mock('@/stores/waterStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/waterStore')>('@/stores/waterStore');
  return {
    ...actual,
    useWaterStore: vi.fn(),
  };
});

import { useWaterStore } from '@/stores/waterStore';

const mockGridPoint: WeatherGridPoint = {
  lat: 32,
  lng: 51,
  temperature: 25,
  windSpeed: 10,
  windDirection: 90,
};

function setPrecipData(samples: PrecipitationData[]) {
  // The component calls `useWaterStore((s) => s.rawPrecipData)` — the mock
  // wraps it as a selector function, so we mimic that.
  vi.mocked(useWaterStore).mockImplementation((selector: unknown) => {
    if (typeof selector === 'function') {
      return (selector as (s: { rawPrecipData: PrecipitationData[] }) => unknown)({
        rawPrecipData: samples,
      });
    }
    return { rawPrecipData: samples };
  });
}

describe('WeatherTooltip + findNearestPrecip widening (Phase 28.2.5 D-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test A: widened cutoff resolves a sample at ~3° Manhattan distance (would fail at 2°)', () => {
    const sample: PrecipitationData = {
      lat: 30,
      lng: 50,
      last30DaysMm: 12.3,
      anomalyRatio: 0.85,
      updatedAt: Date.now(),
    };
    // Manhattan distance from (32, 51) to (30, 50) = 2 + 1 = 3.0 — exceeds OLD 2.0 cutoff.
    setPrecipData([sample]);

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    // Precipitation block must render (proving widened cutoff resolved the sample)
    expect(screen.getByText('Precipitation')).toBeTruthy();
    expect(screen.getByText(/12\.3 mm/)).toBeTruthy();
  });

  it('Test C: a sample 10° away is rejected (cutoff is bounded, not Infinity)', () => {
    const farSample: PrecipitationData = {
      lat: 42, // 10° away
      lng: 51,
      last30DaysMm: 99,
      anomalyRatio: 1.5,
      updatedAt: Date.now(),
    };
    setPrecipData([farSample]);

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    // Precipitation block must NOT render — sample is outside the widened cutoff
    expect(screen.queryByText('Precipitation')).toBeNull();
    expect(screen.queryByText(/99 mm/)).toBeNull();
  });

  it('Test C2: a sample at exactly 4.5° Manhattan distance is rejected (locks the upper bound at < 4.0)', () => {
    // Manhattan distance from (32, 51) to (32, 55.5) = 0 + 4.5 = 4.5 —
    // just outside the new cutoff. Without this boundary case, the cutoff
    // could drift wider (5.0, ∞, or be removed entirely) and Test C alone
    // would still pass. This case fails LOUDLY when the literal `< 4.0`
    // boundary is touched.
    const justBeyondSample: PrecipitationData = {
      lat: 32,
      lng: 55.5, // 4.5° Manhattan from (32, 51)
      last30DaysMm: 7,
      anomalyRatio: 0.6,
      updatedAt: Date.now(),
    };
    setPrecipData([justBeyondSample]);

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    expect(screen.queryByText('Precipitation')).toBeNull();
    expect(screen.queryByText(/7\.0 mm/)).toBeNull();
  });

  it('Test E: distance hint renders when nearest sample is > 100km away', () => {
    const farSample: PrecipitationData = {
      lat: 30, // ~3° = ~330km Euclidean from (32, 51)
      lng: 50,
      last30DaysMm: 12.0,
      anomalyRatio: 0.8,
      updatedAt: Date.now(),
    };
    setPrecipData([farSample]);

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    // Hint must render with the literal text 'nearest sample' and a numeric distance
    expect(screen.getByText(/nearest sample/i)).toBeTruthy();
    expect(screen.getByText(/\d+\s*km/i)).toBeTruthy();
  });

  it('Test F: distance hint does NOT render when nearest sample is within 100km', () => {
    const closeSample: PrecipitationData = {
      lat: 32.3, // ~0.3° ≈ ~33km Euclidean
      lng: 51,
      last30DaysMm: 8,
      anomalyRatio: 0.7,
      updatedAt: Date.now(),
    };
    setPrecipData([closeSample]);

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    // The precip block renders, but no distance hint
    expect(screen.getByText('Precipitation')).toBeTruthy();
    expect(screen.queryByText(/nearest sample/i)).toBeNull();
  });

  it('Test G: closest sample wins when multiple are within cutoff', () => {
    const close: PrecipitationData = {
      lat: 32.5,
      lng: 51,
      last30DaysMm: 5,
      anomalyRatio: 0.5,
      updatedAt: Date.now(),
    };
    const far: PrecipitationData = {
      lat: 30,
      lng: 50,
      last30DaysMm: 99,
      anomalyRatio: 0.9,
      updatedAt: Date.now(),
    };
    setPrecipData([far, close]); // order shouldn't matter

    render(<WeatherTooltip point={mockGridPoint} x={100} y={100} />);

    expect(screen.getByText(/5\.0 mm/)).toBeTruthy();
    expect(screen.queryByText(/99 mm/)).toBeNull();
  });
});
