import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailValue } from '@/components/detail/DetailValue';

describe('DetailValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders label and value text', () => {
    render(<DetailValue label="Altitude" value="10,000" />);
    expect(screen.getByText('Altitude')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
  });

  it('does NOT apply animate-flash class on initial render', () => {
    render(<DetailValue label="Speed" value="250" />);
    const valueEl = screen.getByText('250');
    expect(valueEl.classList.contains('animate-flash')).toBe(false);
  });

  it('applies animate-flash class when value changes after initial render', () => {
    const { rerender } = render(<DetailValue label="Speed" value="250" />);
    rerender(<DetailValue label="Speed" value="300" />);

    const valueEl = screen.getByText('300');
    expect(valueEl.classList.contains('animate-flash')).toBe(true);
  });

  it('removes animate-flash class after 600ms timeout', () => {
    const { rerender } = render(<DetailValue label="Speed" value="250" />);
    rerender(<DetailValue label="Speed" value="300" />);

    const valueEl = screen.getByText('300');
    expect(valueEl.classList.contains('animate-flash')).toBe(true);

    vi.advanceTimersByTime(600);

    expect(valueEl.classList.contains('animate-flash')).toBe(false);
  });

  it('renders optional unit suffix with muted text styling', () => {
    render(<DetailValue label="Altitude" value="10,000" unit="m" />);
    const unitEl = screen.getByText('m');
    expect(unitEl).toBeInTheDocument();
    expect(unitEl.classList.contains('text-text-muted')).toBe(true);
  });
});
