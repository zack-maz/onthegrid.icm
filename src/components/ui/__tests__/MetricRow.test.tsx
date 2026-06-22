/**
 * Phase 45 Plan 02 Task 1 — MetricRow atom unit test (DASH-READ-01, CONTEXT D-06/D-07).
 *
 * Pins the DASH-READ-01 numeric-scannability contract on the extracted atom:
 *   - small uppercase label on the left + value on the right
 *   - value cell carries `tabular-nums` and is `text-right`
 *   - optional `unit` renders adjacent to the value (omitted when absent)
 *   - `emphasized` swaps the value tone text-white/60 → text-white/80
 *
 * RTL/jsdom, mirroring the DevApiStatusAllApisTab render-test idiom.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MetricRow } from '@/components/ui/MetricRow';

afterEach(cleanup);

describe('MetricRow', () => {
  it('renders the provided label (small uppercase) and value', () => {
    render(<MetricRow label="Kept" value="82%" data-testid="row" />);
    const label = screen.getByText('Kept');
    expect(label).toBeTruthy();
    expect(label.className).toContain('uppercase');
    expect(label.className).toContain('text-[9px]');
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('right-aligns the value cell with tabular-nums', () => {
    render(<MetricRow label="Total" value={1234} data-testid="row" />);
    const value = screen.getByTestId('row-value');
    expect(value.className).toContain('tabular-nums');
    expect(value.className).toContain('text-right');
  });

  it('renders an optional unit adjacent to the value when provided, omits it otherwise', () => {
    const { rerender } = render(
      <MetricRow label="Latency" value={8} unit="ms" data-testid="row" />,
    );
    expect(screen.getByTestId('row-unit').textContent).toContain('ms');

    rerender(<MetricRow label="Latency" value={8} data-testid="row" />);
    expect(screen.queryByTestId('row-unit')).toBeNull();
  });

  it('emphasized swaps the value tone from text-white/60 to text-white/80', () => {
    const { rerender } = render(<MetricRow label="X" value={1} data-testid="row" />);
    expect(screen.getByTestId('row-value').className).toContain('text-white/60');

    rerender(<MetricRow label="X" value={1} emphasized data-testid="row" />);
    const value = screen.getByTestId('row-value');
    expect(value.className).toContain('text-white/80');
    expect(value.className).not.toContain('text-white/60');
  });
});
