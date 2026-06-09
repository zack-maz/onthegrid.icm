# Phase 40: Dashboard UI/UX Polish + Subtab Consolidation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 40-dashboard-ui-ux-polish-subtab-consolidation
**Areas discussed:** Consolidation mechanism, Section grouping taxonomy, Aesthetic / density direction, Polish scope boundary, Status legibility & honest degraded states (Claude-proposed 5th)

Operator selected all four offered gray areas to discuss, plus "Something else" → delegated the 5th-area topic to Claude ("whatever comes to your mind"). Claude proposed "Status legibility & honest degraded states." Operator confirmed all recommended leans.

---

## Consolidation mechanism (Layout)

| Option                | Description                                                                                                                 | Selected |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Sections + drawer     | 3-4 collapsible grouped sections (default-expanded) + a drawer for rarely-used + destructive controls (Replay probe, Prune) | ✓        |
| Nested sub-tabs       | A 2nd tab row inside API Health; least scroll but one group at a time                                                       |          |
| Flat grouped sections | 3-4 always-visible sections, no collapse; simplest, page stays long                                                         |          |

**User's choice:** Sections + drawer (Recommended)
**Notes:** Default-expanded chosen so portfolio screenshots show breadth; matches UI-POLISH-02's "redirect rarely-used controls into a sub-tab or drawer."

---

## Section grouping taxonomy (Grouping)

| Option                          | Description                                                                                              | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| By data domain — 4 groups       | Endpoint Health · LLM Pipeline (incl. Flight Recorder) · Budget & Cost · Operator Actions & Data Quality | ✓        |
| By operator question — 3 groups | "Is it healthy?" / "What's the LLM doing?" / "What can I do?"                                            |          |
| By read-vs-act — 2 groups       | Monitoring (read-only) vs Operator Controls                                                              |          |

**User's choice:** By data domain — 4 groups (Recommended)
**Notes:** Natural homes; each group also answers an operator question. Destructive/rarely-used controls go to the drawer; their read-only counters stay in group 4.

---

## Aesthetic / density direction (Aesthetic)

| Option                    | Description                                                                                 | Selected |
| ------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Dense-but-legible         | Keep mission-control density; add type hierarchy + 4px spacing scale + aligned tabular-nums | ✓        |
| Spacious modern dashboard | Larger text, cards, whitespace; more demo-friendly but generic/less dense                   |          |
| Minimal cleanup only      | Keep current density+styling, just regroup; lowest effort, least lift                       |          |

**User's choice:** Dense-but-legible (Recommended)
**Notes:** Fits "numbers over narratives"; the real fix is legibility (hierarchy + alignment), not spaciousness. frontend-design skill executes.

---

## Polish scope boundary (Scope)

| Option                             | Description                                                                                                                | Selected |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Content + tab-bar affordances      | API Health content + shared tab-bar focus/active/keyboard (UI-POLISH-04) + new tokens to colorBridge; no other-tab restyle | ✓        |
| API Health content only            | Leave shared tab bar untouched; defers UI-POLISH-04                                                                        |          |
| App-wide token + consistency sweep | Extend tokens across water/sites/events too; scope-creep risk                                                              |          |

**User's choice:** Content + tab-bar affordances (Recommended)
**Notes:** Shared tab bar also touched by Phase 41 REVEAL-SITE-01 — flag the boundary in UI-SPEC; keep Phase 40 to interaction affordances, not full shell restyle.

---

## Status legibility & honest degraded states (Claude-proposed 5th area)

### 5a — At-a-glance status header

| Option                    | Description                                                                                        | Selected |
| ------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Yes — rollup hero header  | Top summary strip: endpoints healthy / LLM last-run / budget / dead-URLs, from already-polled data | ✓        |
| No — section headers only | Skip the strip; rely on the 4 group headers                                                        |          |

**User's choice:** Yes — rollup hero header (Recommended)
**Notes:** Becomes the screenshot hero + information scent; no new fetch (reuses operator-status + FlightRecorder last-run).

### 5b — Degraded-state rendering

| Option                          | Description                                                                       | Selected |
| ------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Muted placeholder, never vanish | Top sections always render a muted "— / no data (reason)" instead of disappearing | ✓        |
| Keep current mixed behavior     | Silent-hide (BudgetBlock/prune) + "no data" (actorQuality) as-is                  |          |
| Always-on explicit empty states | Every block AND sub-row renders an empty state; noisiest                          |          |

**User's choice:** Muted placeholder, never vanish (Recommended)
**Notes:** Prevents layout jump + confusing gaps; satisfies SC40-3 fresh/stale/degraded intent. Micro-rows may still hide. Degrade-open error contract (200, no throw) preserved — changes only the empty render.

---

## Claude's Discretion

- 5th-area TOPIC delegated to Claude ("whatever comes to your mind") → Claude proposed Status legibility & honest degraded states.
- All sub-pixel execution details (type-size values, spacing token names, exact drawer membership, hero-header field ordering, keyboard-nav bindings, snapshot granularity) delegated to `/gsd-ui-phase` (UI-SPEC) and `/gsd-plan-phase`.

## Deferred Ideas

- App-wide token/type consistency sweep across water/sites/events — out of scope (D-04a).
- Cross-run analytics / eval-trend charts / token-spend sparklines beyond a basic surface — deferred from Phase 39.
- Rich FlightRecorder filters (outcome / date-range) — feature, not polish; default defer (UI-SPEC may scope a minimal filter only if part of the consolidation UX).
- Public-facing landing/hero chrome + landing-vs-dashboard decision — Phase 41 REVEAL-SITE-01.

### Reviewed Todos (not folded)

- `phase-27.4.2-ci-health` — CI tech-debt, generic-keyword false positive (also rejected in Phase 39).
- `phase-27.4.3-deckgl-v9-type-drift` — DeckGL typing tech-debt, generic-keyword false positive.
