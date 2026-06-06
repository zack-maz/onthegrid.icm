/**
 * Phase 41 Plan 06 (REVEAL-SITE-02) — guided-tour step list.
 *
 * A plain static data module (no analog needed; shape mirrors the `ALL_LAYERS`
 * const in scripts/capture-hero.ts — a flat exported array that drives
 * sequenced UI). Consumed by GuidedTour.tsx, which feeds it to driver.js.
 *
 * CONTRACT (pinned by src/__tests__/components/reveal/tourSteps.test.tsx):
 *   - 5-7 steps (D-03).
 *   - every `element` is a `[data-tour="..."]` selector — NEVER a Tailwind
 *     class selector (Pitfall 5) and NEVER an in-canvas WebGL entity (Pitfall 1;
 *     Deck.gl entities are pixels in the map <canvas>, not DOM nodes).
 *   - every selector resolves to exactly one present DOM node in the rendered
 *     AppShell. The matching data-tour attributes are wired onto the HUD chrome
 *     in Task 3b (StatusDropdown / LayerTogglesSlot / DetailPanelSlot /
 *     map-container / DevApiStatus trigger).
 *
 * driver.js's Step shape is `{ element, popover: { title, description } }`. We
 * keep our own structural type so this module carries no driver.js import (the
 * library is only loaded inside GuidedTour, behind the isTourOpen gate).
 */

export interface TourStep {
  /** A stable `[data-tour="..."]` selector resolving to one HUD DOM node. */
  element: string;
  popover: {
    title: string;
    description: string;
  };
}

export const tourSteps: TourStep[] = [
  {
    element: '[data-tour="status"]',
    popover: {
      title: 'Live counts',
      description:
        'Top-left shows the live connection status and visible entity counts for every feed — flights, ships, events, sites and more. Numbers over narratives: the dots go green when a source is healthy.',
    },
  },
  {
    element: '[data-tour="layers"]',
    popover: {
      title: 'Visualization layers',
      description:
        'Toggle the data layers here — geographic terrain, climate, water health, threat density, political factions and ethnic distribution. Each renders against live data; flip them on to recompose the map.',
    },
  },
  {
    element: '[data-tour="threat-density"]',
    popover: {
      title: 'The map itself',
      description:
        'The 2.5D map is the front door. Flights, ships and conflict events live inside the WebGL canvas; enable Threat Density to see GDELT-derived hotspots cluster over the conflict zone.',
    },
  },
  {
    element: '[data-tour="detail"]',
    popover: {
      title: 'Detail panel',
      description:
        'Click any entity or threat cluster and this panel slides in with the full record — coordinates, provenance, LLM-enriched event context and a copyable lat/long.',
    },
  },
  {
    element: '[data-tour="api-health"]',
    popover: {
      title: 'Operator dashboard',
      description:
        'The API Health surface exposes the whole pipeline read-only: feed health, LLM extraction runs, token budget and cost. Write-actions (replay, prune, force-trigger) stay behind a Bearer gate.',
    },
  },
];
