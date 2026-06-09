# Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 39-operator-visibility-token-budget-cost-shadow-llm-flight-recorder
**Areas discussed:** Todo fold selection; gray-area selection (all delegated to research/planning)

---

## Todo Fold Selection

| Option                      | Description                                              | Selected |
| --------------------------- | -------------------------------------------------------- | -------- |
| 27.4.5 observability        | Original OBS-FLIGHT source spec (`resolves_phase: 39`)   | ✓        |
| 27.4.2 ci-health            | Unrelated CI tech-debt, generic-keyword match            |          |
| 27.4.3 deckgl-v9-type-drift | Unrelated DeckGL typing tech-debt, generic-keyword match |          |

**User's choice:** Fold 27.4.5 only.
**Notes:** 27.4.5 is the source spec for the OBS-FLIGHT strand; folded as resolved-by-39 (adapted v1/v2/Cerebras/Groq → v3/NIM). The other two left deferred (recorded under Reviewed Todos in CONTEXT.md).

---

## Gray-Area Selection

| Option                     | Description                                                            | Selected |
| -------------------------- | ---------------------------------------------------------------------- | -------- |
| 39↔40 UI scope boundary    | Full polished UI in 39 vs data-layer + minimal now, polish in Phase 40 |          |
| Crashed-run durability     | Record at run start (survives crashes) vs only on completion           |          |
| Cost-shadow trend depth    | 90d sparkline now vs today's number + bar now                          |          |
| tokenBudget contract shape | Provider-keyed map vs flat single-provider                             |          |

**User's choice:** "Let research and planning decide for all."
**Notes:** The operator delegated all four HOW decisions to downstream agents. Each is preserved in CONTEXT.md under "Claude's Discretion — delegated gray areas (GA-1..4)" with options, tradeoffs, and a recommended lean so planning starts with a prior rather than a blank slate. Downstream agents must NOT re-ask the operator on these.

---

## Claude's Discretion

All four identified gray areas (GA-1 UI scope boundary, GA-2 crashed-run durability, GA-3 cost-shadow trend depth, GA-4 tokenBudget contract shape) were delegated by the operator to research + planning. Recommended leans recorded in CONTEXT.md.

## Deferred Ideas

- Cross-run analytics/aggregations + run-outcome alerting — out of scope per the folded 27.4.5 todo; future analytics phase.
- Rich FlightRecorder filters + tab/subtab placement + visual polish — likely Phase 40 (UI/UX polish + subtab consolidation).
- Reviewed-not-folded todos: `phase-27.4.2-ci-health`, `phase-27.4.3-deckgl-v9-type-drift`.
