/**
 * Wave-0 RED stub — REVEAL-SITE-02 tour-step selector-existence contract.
 *
 * Pins the contract that every step in `src/lib/tourSteps.ts` (Plan 06)
 * references a `data-tour="..."` selector that resolves to a present DOM node
 * in the rendered AppShell. This is the guardrail against Pitfall 1
 * (spotlighting in-canvas WebGL entities, which have no DOM node) and
 * Pitfall 5 (selectors coupled to volatile Tailwind classes).
 *
 * RED because `@/lib/tourSteps` does not exist yet AND the `data-tour`
 * attributes are not yet on the HUD chrome. Goes GREEN when Plan 06 ships the
 * step list AND wires the data-tour attributes onto StatusDropdown / layer
 * toggles / detail panel / API Health tab.
 *
 * AppShell renders cleanly in jsdom (map libs mocked via vite.config test.alias).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
// @ts-expect-error — Plan 06 creates this module; RED until implementation lands.
import { tourSteps } from '@/lib/tourSteps';

type TourStep = { element: string; popover?: { title?: string; description?: string } };

describe('tourSteps selector-existence contract (REVEAL-SITE-02)', () => {
  it('exports a non-empty tourSteps array (5-7 steps per D-03)', () => {
    expect(Array.isArray(tourSteps)).toBe(true);
    expect((tourSteps as TourStep[]).length).toBeGreaterThanOrEqual(5);
  });

  it('every step uses a [data-tour="..."] selector (not a class / canvas selector)', () => {
    for (const step of tourSteps as TourStep[]) {
      expect(step.element).toMatch(/^\[data-tour="[^"]+"\]$/);
    }
  });

  it('every step data-tour selector resolves to a present node in the rendered AppShell', () => {
    const { container } = render(<AppShell />);
    for (const step of tourSteps as TourStep[]) {
      const node = container.querySelector(step.element);
      expect(
        node,
        `tour step selector ${step.element} should resolve to a DOM node`,
      ).not.toBeNull();
    }
  });
});
