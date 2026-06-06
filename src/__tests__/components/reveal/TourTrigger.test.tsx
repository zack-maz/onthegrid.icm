/**
 * Wave-0 RED stub — REVEAL-SITE-02 persistent Tour affordance.
 *
 * Pins the contract for `src/components/reveal/TourTrigger.tsx` (Plan 06):
 *   - renders the Tour affordance REGARDLESS of isIntroSeen (NOT first-visit-gated, D-03)
 *   - click calls openTour
 *   - asserts data-testid="tour-trigger"
 *
 * RED because the component import path does not exist yet. Goes GREEN when
 * Plan 06 implements it. The "always rendered" assertion is the load-bearing
 * D-03 contract — the trigger must NOT carry an `if (seen) return null` gate.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useUIStore } from '@/stores/uiStore';

/* eslint-disable import/order */
// Plan 06 creates this module; RED until implementation lands.
// @ts-expect-error — module does not exist until Plan 06 implements it.
import { TourTrigger } from '@/components/reveal/TourTrigger';
/* eslint-enable import/order */

describe('TourTrigger (REVEAL-SITE-02)', () => {
  beforeEach(() => {
    cleanup();
    useUIStore.setState({ isIntroSeen: false, isTourOpen: false });
  });

  it('renders the Tour affordance when isIntroSeen is false', () => {
    useUIStore.setState({ isIntroSeen: false });
    render(<TourTrigger />);
    expect(screen.getByTestId('tour-trigger')).toBeTruthy();
  });

  it('renders the Tour affordance EVEN when isIntroSeen is true (not first-visit-gated, D-03)', () => {
    useUIStore.setState({ isIntroSeen: true });
    render(<TourTrigger />);
    expect(screen.getByTestId('tour-trigger')).toBeTruthy();
  });

  it('click calls openTour', () => {
    const openTour = vi.fn();
    useUIStore.setState({ openTour });
    render(<TourTrigger />);
    fireEvent.click(screen.getByTestId('tour-trigger'));
    expect(openTour).toHaveBeenCalled();
  });
});
