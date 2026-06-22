/**
 * Phase 45 Plan 02 Task 2 — Sparkline line primitive unit test
 * (DASH-READ-05, CONTEXT D-04/D-05/D-07).
 *
 * Pins the DASH-READ-05 trend-line contract on the extracted atom:
 *   - N≥2 points → a <polyline> whose `points` attr has exactly N coordinate pairs
 *   - fewer than 2 points → returns null (renders nothing)
 *   - the line stroke is a single NEUTRAL muted token (currentColor via text-white/40),
 *     not a per-point color
 *   - latest value crossing the degradation threshold tints a distinct last-point
 *     marker with a semantic @theme token; below threshold it stays neutral
 *   - zero inline hex / rgba — colors are var(--color-*) / currentColor / utilities only
 *
 * RTL/jsdom, mirroring the DevApiStatusAllApisTab render-test idiom.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Sparkline } from '@/components/ui/Sparkline';

afterEach(cleanup);

function pairCount(pointsAttr: string): number {
  return pointsAttr.trim().split(/\s+/).filter(Boolean).length;
}

describe('Sparkline', () => {
  it('renders a polyline with exactly N coordinate pairs for N≥2 points', () => {
    const { container } = render(<Sparkline points={[1, 2, 3, 4, 5]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    expect(pairCount(polyline!.getAttribute('points') ?? '')).toBe(5);
  });

  it('returns null (renders nothing) below 2 points', () => {
    const { container: c1 } = render(<Sparkline points={[]} />);
    expect(c1.querySelector('svg')).toBeNull();
    const { container: c2 } = render(<Sparkline points={[7]} />);
    expect(c2.querySelector('svg')).toBeNull();
  });

  it('draws the line with a single neutral muted stroke token (currentColor), not per-point color', () => {
    const { container } = render(<Sparkline points={[1, 2, 3]} />);
    const svg = container.querySelector('svg')!;
    const polyline = container.querySelector('polyline')!;
    // Neutral stroke carried by the white-opacity ramp on the SVG, inherited via currentColor.
    expect(svg.getAttribute('class') ?? '').toContain('text-white/40');
    expect(polyline.getAttribute('stroke')).toBe('currentColor');
  });

  it('tints the last-point marker with a semantic token only when the latest value crosses the threshold', () => {
    // above-threshold crossing → tinted marker present
    const { container: hot } = render(
      <Sparkline points={[1, 2, 10]} threshold={5} thresholdDirection="above" />,
    );
    const marker = hot.querySelector('circle');
    expect(marker).not.toBeNull();
    const fill = marker!.getAttribute('fill') ?? '';
    expect(fill).toContain('var(--color-');

    // below-threshold → marker stays neutral (currentColor or no semantic tint)
    const { container: cool } = render(
      <Sparkline points={[1, 2, 3]} threshold={5} thresholdDirection="above" />,
    );
    const neutralMarker = cool.querySelector('circle');
    if (neutralMarker) {
      expect(neutralMarker.getAttribute('fill') ?? '').not.toContain('var(--color-');
    }
  });

  it('introduces no inline hex / rgba literals in the source', () => {
    const src = readFileSync(resolve(__dirname, '../Sparkline.tsx'), 'utf-8');
    expect(/#[0-9a-fA-F]{3,6}\b/.test(src)).toBe(false);
    expect(/rgba\(/.test(src)).toBe(false);
  });
});
