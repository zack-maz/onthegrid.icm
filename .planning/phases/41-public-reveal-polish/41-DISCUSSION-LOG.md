# Phase 41: Public Reveal Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 41-public-reveal-polish
**Areas discussed:** Landing surface architecture, Demo flow mechanism, Portfolio docs forks, Scope/sequencing/reach

Operator selected all 4 offered gray areas to discuss.

---

## Landing surface architecture (REVEAL-SITE-01)

### Q1 — Public landing surface

| Option                     | Description                                                                              | Selected |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Dashboard + intro overlay  | Land directly on live dashboard; dismissible first-visit overlay frames it + offers tour | ✓        |
| Dashboard only, no framing | Raw live dashboard, no intro layer                                                       |          |
| Separate landing page      | Distinct marketing-style page in front of the app                                        |          |

**User's choice:** Dashboard + intro overlay
**Notes:** Front door stays the live map (on-ethos with "mission-control, numbers-over-narratives"); framing lives in an overlay that ties into the demo-flow area.

### Q2 — Operator/dev surface visibility

| Option                       | Description                                                                | Selected |
| ---------------------------- | -------------------------------------------------------------------------- | -------- |
| Visible read-only            | API Health dashboard visible to all; write-actions stay Bearer-gated       | ✓        |
| Hidden behind flag/Bearer    | Hide dev/operator panels from public; surface only with Bearer/`?dev=true` |          |
| Visible but visually demoted | Reachable but pushed behind a secondary affordance                         |          |

**User's choice:** Visible read-only
**Notes:** The API Health dashboard is a portfolio highlight for an engineer/hiring-manager audience; REVEAL-DOCS-07 already wants screenshots of it. No new gating to build.

---

## Demo flow mechanism (REVEAL-SITE-02)

### Q1 — Primary mechanism

| Option                      | Description                                                         | Selected |
| --------------------------- | ------------------------------------------------------------------- | -------- |
| Step-through guided tour    | Dismissible overlay walking ~5-7 spotlight steps over real features | ✓        |
| Single intro card           | One framing card, then dismiss to the live map                      |          |
| `?demo=true` scripted state | Shareable URL driving a canned auto-playing sequence                |          |

**User's choice:** Step-through guided tour
**Notes:** Re-openable via a persistent "Tour" affordance (not first-visit-only). Steps: layers → LLM enrichment → threat density → API Health.

### Q2 — Data state for tour + capture

| Option                             | Description                                                         | Selected |
| ---------------------------------- | ------------------------------------------------------------------- | -------- |
| Live data for both                 | Tour and `capture:layers` run against live data; no fixtures        | ✓        |
| Hybrid: live tour, fixture capture | Live public tour; deterministic fixture for byte-stable screenshots |          |
| Canned snapshot for both           | Frozen `?demo=true` state drives tour + capture                     |          |

**User's choice:** Live data for both
**Notes:** "Reproducible" = re-runnable. Non-event layers always populated, so the map looks rich even on a quiet conflict day.

---

## Portfolio docs forks (REVEAL-DOCS-02 / 07 / 09)

### Q1 — Guided-tour hub form (REVEAL-DOCS-02)

| Option                  | Description                                                 | Selected |
| ----------------------- | ----------------------------------------------------------- | -------- |
| docs/SHOWCASE.md        | Flat file at docs/ root, alongside the other portfolio docs | ✓        |
| docs/portfolio/INDEX.md | Dedicated portfolio/ subdir hub                             |          |

**User's choice:** docs/SHOWCASE.md
**Notes:** README stays the repo front door and cross-links to SHOWCASE.

### Q2 — Screenshot location (REVEAL-DOCS-07)

| Option                             | Description                                                   | Selected |
| ---------------------------------- | ------------------------------------------------------------- | -------- |
| Consolidate to public/screenshots/ | Move existing 6 + hero, add ~10 new there, update README refs | ✓        |
| Keep in docs/screenshots/          | Leave as-is; treat "public/" as loose wording                 |          |
| Dual location                      | docs/ for README embeds + public/ for app-served assets       |          |

**User's choice:** Consolidate to public/screenshots/
**Notes:** Matches req text, app-servable (OG image needs public/ origin), still renders in GitHub README via relative path.

### Q3 — Brainstorms cleanup (REVEAL-DOCS-09)

| Option                               | Description                                                                     | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| Cross-link as receipts from BUILDING | Keep originals; pull best bits into BUILDING; cross-link as historical receipts | ✓        |
| Index page only                      | Add a docs/brainstorms index listing artifacts                                  |          |
| Consolidate + archive the rest       | Lift best bits into BUILDING; move rest to archive/                             |          |

**User's choice:** Cross-link as receipts from BUILDING
**Notes:** Nothing deleted/archived — the artifacts are git-tracked proof-of-process.

---

## Scope, sequencing & reach

### Q1 — Execution shape for 14 REQs

| Option                            | Description                                                                | Selected |
| --------------------------------- | -------------------------------------------------------------------------- | -------- |
| All 14, wave-structured           | All 14 in this phase as plan-waves (docs core → round-out → polish + SITE) | ✓        |
| Wave 1 + SITE first, defer polish | Ship ~80%-signal subset; defer screenshots/LESSONS/brainstorms to v1.7     |          |

**User's choice:** All 14, wave-structured
**Notes:** One clean, complete reveal — it's the milestone's final phase.

### Q2 — Custom-domain decision (REVEAL-SITE-04)

| Option                   | Description                                     | Selected |
| ------------------------ | ----------------------------------------------- | -------- |
| Stay on \*.vercel.app    | Keep otg-iran-monitor.vercel.app; zero cost/DNS | ✓        |
| Migrate to custom domain | Register/point a custom domain via Vercel       |          |

**User's choice:** Stay on \*.vercel.app
**Notes:** Already a clean URL; OG/share URLs use the vercel.app origin. Decision itself satisfies the requirement.

### Q3 — Final-sweep audit rigor (REVEAL-DOCS-10)

| Option                         | Description                                                            | Selected |
| ------------------------------ | ---------------------------------------------------------------------- | -------- |
| Full re-audit, parallel agents | Wave-0 blocking gate; re-run v1.5-close 2nd-pass audit vs current main | ✓        |
| Light memory-refresh           | Manually re-walk the two memories without a full parallel-agent audit  |          |

**User's choice:** Full re-audit, parallel agents
**Notes:** Runs BEFORE any REVEAL-DOCS work lands (SC41-1). Accept higher token spend for thoroughness; refresh both v1.6 memories.

### Q4 — Narrative voice

| Option                          | Description                                                             | Selected |
| ------------------------------- | ----------------------------------------------------------------------- | -------- |
| First-person builder voice      | "I wanted to track Iran conflict events → 10 phases of LLM reliability" | ✓        |
| Neutral third-person case study | "The project began as…" detached report voice                           |          |

**User's choice:** First-person builder voice
**Notes:** Matches the 999.6 framing and the agentic-dev "you can do this too" angle.

---

## Claude's Discretion

Delegated downstream (researcher / planner / executor) — see CONTEXT.md `<decisions>` "Claude's Discretion":

- Intro-overlay + tour copy, step list, ordering, spotlight selectors; tour implementation approach (custom overlay vs lightweight coachmark lib).
- SHOWCASE section ordering + exact 1-click cross-link targets.
- `capture:layers` headless/Playwright mechanics, viewport, layer sequencing, output naming.
- OG/Twitter card image source + dimensions; favicon refresh scope.
- `concepts.md` final ~30-term list; per-doc length within req-stated targets.

## Deferred Ideas

None — discussion stayed within phase scope.

Two weak keyword-match todos (`phase-27.4.2-ci-health.md`, `phase-27.4.3-deckgl-v9-type-drift.md`) were reviewed and NOT folded — both are unrelated technical notes, out of scope for a docs/reveal phase.
