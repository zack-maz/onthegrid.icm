# Phase 45: Dashboard Subtab Readability Redesign - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 45-Dashboard Subtab Readability Redesign
**Areas discussed:** Sparkline trend backing, Sparkline visual style, Shared primitives vs inline
**Areas offered but not selected:** Progressive-disclosure density

---

## Sparkline trend backing

### Q1 — Where should the history backing the sparklines live?

| Option                   | Description                                                                                                                                       | Selected                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Server Redis ring (rec.) | Bounded LPUSH+LTRIM ring written by the existing health cron; survives reloads, true multi-day trend; one new Redis key, no pipeline/probe change | (chosen via "You decide") |
| Client ephemeral ring    | In-memory/sessionStorage; zero server change but resets on reload, can't catch multi-day slow-burn                                                |                           |
| You decide               | Pick whichever best honors requirement intent                                                                                                     | ✓                         |

**User's choice:** "You decide" → Claude selected the **server-backed Redis ring**.
**Notes:** Only option that satisfies DASH-READ-05's "catches slow-burn regressions." Reuses `llm:runs:history` idiom; written by existing health cron (`0 0 * * *`); read via existing `/api/operator-status` aggregator thread (Phase 44 D-01/D-10), not a new endpoint.

### Q2 — Cron-freshness sparkline granularity (3 crons)?

| Option                  | Description                                                                 | Selected                |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------- |
| Per-cron (3 sparklines) | One trend each for health/warm/refresh-events — most diagnostic, more space | (chosen via "your rec") |
| Combined worst-case (1) | Single sparkline of stalest tick — compact but masks which cron drifts      |                         |
| refresh-events only (1) | Just the daily LLM-extraction cron — densest signal                         |                         |

**User's choice:** "your rec" → Claude recommended **Per-cron (3 sparklines)**.
**Notes:** DASH-READ-05 exists to catch a single subsystem drifting; combined/single masks which. "Small history rings" (plural) supports 3 small sparklines. Self-referential signal noted (stalled health cron → flatlining sparkline). `warm` collapsible later if noisy.

### Q3 — History ring depth?

| Option         | Description                                                         | Selected |
| -------------- | ------------------------------------------------------------------- | -------- |
| 30 days (rec.) | LTRIM cap 30, 30d TTL; matches llm:calls:history / llm:runs:history | ✓        |
| 14 days        | Tighter recent view, can miss slow drift                            |          |
| 90 days        | Quarter visibility but 90 pts get mushy at small size               |          |

**User's choice:** 30 days.
**Notes:** Aligns with existing 30d history retention.

---

## Sparkline visual style

### Q1 — How should sparklines render (~30 daily points)?

| Option                     | Description                                                                             | Selected |
| -------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Inline SVG polyline (rec.) | True mini line-chart; reads slow-burn cleanly; becomes reusable `<Sparkline>` primitive | ✓        |
| Extend the 10-dot dots     | Reuse existing pinned recent-fetch sparkline; consistent but 30 dots dense              |          |
| CSS/unicode bars           | Lightest, very terminal — but coarser for subtle deltas                                 |          |

**User's choice:** Inline SVG polyline.
**Notes:** Doubles as the reusable primitive feeding Area 3; testable via path `d` / point count.

### Q2 — How to encode degradation (all via @theme tokens)?

| Option                                      | Description                                                                                     | Selected |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| Neutral stroke + semantic last point (rec.) | Muted line; latest point tints to semantic @theme token on threshold cross                      | ✓        |
| Full semantic threshold stroke              | Whole line tints green/amber/red — loudest, risks fighting muted aesthetic                      |          |
| Mono only, shape carries it                 | Single neutral token, trend read from slope only — purest but rising-bad looks like rising-good |          |

**User's choice:** Neutral stroke + semantic last point.
**Notes:** Understated to match off-the-grid aesthetic; "now" state still pops. No inline hex. Cold-start = render whatever points exist (degrade-open) — Claude discretion.

---

## Shared primitives vs inline

### Q1 — How to structure the restyle across 3 subtabs in one 3,851-line file?

| Option                                        | Description                                                                                            | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Hybrid: extract atoms, inline the rest (rec.) | Extract `<Sparkline>` + `<MetricRow>`, inline-restyle everything else                                  | ✓        |
| Full shared primitives                        | Rebuild all 3 subtabs on a component set — best consistency, largest diff, most pinning-suite pressure |          |
| Inline restyle in place                       | No new components — smallest blast radius but repetitive, drift risk                                   |          |

**User's choice:** Hybrid.
**Notes:** Balances consistency vs churn; keeps pinning-suite blast radius small.

### Q2 — Where do the extracted atoms live?

| Option                            | Description                                                                                                                     | Selected |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Separate files + own tests (rec.) | `MetricRow.tsx` / `Sparkline.tsx` — matches FlightRecorderBlock/BudgetBlock precedent, shrinks the monster file, isolated tests | ✓        |
| In-file alongside existing blocks | Smaller diff but grows the 3,851-line file, couples tests to heavy suites                                                       |          |

**User's choice:** Separate files + own tests.

### Q3 — DASH-READ-04 non-breakage strategy (snapshot suite)?

| Option                                                          | Description                                                                                                                                               | Selected |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Regenerate snapshot deliberately; freeze behavioral pins (rec.) | Visual snapshot is meant to change — regenerate, review diff, land green; behavioral pins (tabMerge/diagnosticBlocks/operatorActions/degrade-open) frozen | ✓        |
| Restyle around the snapshotted DOM                              | Avoid altering snapshot-covered structure — minimal churn but cripples redesign                                                                           |          |
| You decide                                                      | Pick interpretation honoring behavioral non-breakage                                                                                                      |          |

**User's choice:** Regenerate snapshot deliberately; freeze behavioral pins.
**Notes:** Mirrors Phase 44 D-12 (behavioral contract frozen vs render/snapshot tests evolve in lockstep). All restyling stays inside existing `role="tabpanel"` containers.

---

## Claude's Discretion

- Trend-backing fork (Q1): user said "You decide" → server-backed Redis ring.
- Cron-freshness granularity (Q2): user said "your rec" → per-cron (3 sparklines).
- Redis key name + exact `/api/operator-status` aggregator field shape (Phase 44 D-04 lockstep).
- Degradation thresholds for the semantic last-point tint.
- Cold-start / partial-ring rendering (degrade-open).
- Component names, sparkline dimensions/placement, missed-tick gap rendering.
- Progressive-disclosure density (deselected area) — planner decides within the run→call→detail idiom.

## Deferred Ideas

- Progressive-disclosure density tuning / operator density toggle for the events subtab.
- Collapsing the `warm` cron sparkline if per-cron reads as noise.
- True `firstSeenDead` timestamp (would re-open Phase 43 liveness lockstep) — carried from Phase 44.

## Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md` — keyword noise (0.6), unrelated; 4th consecutive deferral → Phase 46 candidate.
- `phase-27.4.3-deckgl-v9-type-drift.md` — keyword noise (0.6), unrelated → Phase 46 candidate.

## Process note

Discussion ran from the Documents copy of the project (`~/Documents/Claude/Projects/otg-iran-monitor`), which was fast-forwarded from `origin/main` (commit `f635df1`, Phase 44 shipped) at the start of the session to reconcile it with the previously-active Desktop working copy. No work lost — clean fast-forward, shared remote.
