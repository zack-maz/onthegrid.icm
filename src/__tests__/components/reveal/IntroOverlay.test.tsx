/**
 * Wave-0 RED stub — REVEAL-SITE-01 first-visit intro overlay.
 *
 * Pins the contract for `src/components/reveal/IntroOverlay.tsx` (Plan 06):
 *   - renders when isIntroSeen === false
 *   - returns null when isIntroSeen === true
 *   - "Explore the map" click calls setIntroSeen(true)
 *   - "Start the tour" click calls setIntroSeen(true) + openTour()
 *   - asserts data-testid="intro-overlay"
 *
 * RED because the component import path does not exist yet — the import
 * failure / assertion failure IS the red state. Goes GREEN when Plan 06
 * implements the component. Mirrors the DashboardAuthModal RTL render-gate
 * idiom (`src/components/ui/DashboardAuthModal.tsx`, data-testid render gate).
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { IntroOverlay } from '@/components/reveal/IntroOverlay';
import { useUIStore } from '@/stores/uiStore';
// @ts-expect-error — Plan 06 creates this module; RED until implementation lands.

describe('IntroOverlay (REVEAL-SITE-01)', () => {
  beforeEach(() => {
    cleanup();
    // start each test from a known reveal-slice state
    useUIStore.setState({ isIntroSeen: false, isTourOpen: false });
  });

  it('renders the overlay when isIntroSeen is false', () => {
    useUIStore.setState({ isIntroSeen: false });
    render(<IntroOverlay />);
    expect(screen.getByTestId('intro-overlay')).toBeTruthy();
  });

  it('renders nothing (null) when isIntroSeen is true', () => {
    useUIStore.setState({ isIntroSeen: true });
    render(<IntroOverlay />);
    expect(screen.queryByTestId('intro-overlay')).toBeNull();
  });

  it('"Explore the map" click calls setIntroSeen(true)', () => {
    const setIntroSeen = vi.fn();
    useUIStore.setState({ isIntroSeen: false, setIntroSeen });
    render(<IntroOverlay />);
    fireEvent.click(screen.getByText(/explore the map/i));
    expect(setIntroSeen).toHaveBeenCalledWith(true);
  });

  it('"Start the tour" click calls setIntroSeen(true) AND openTour()', () => {
    const setIntroSeen = vi.fn();
    const openTour = vi.fn();
    useUIStore.setState({ isIntroSeen: false, setIntroSeen, openTour });
    render(<IntroOverlay />);
    fireEvent.click(screen.getByText(/start the tour/i));
    expect(setIntroSeen).toHaveBeenCalledWith(true);
    expect(openTour).toHaveBeenCalled();
  });
});
