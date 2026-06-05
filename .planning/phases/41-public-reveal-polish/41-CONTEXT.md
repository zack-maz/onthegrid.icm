# Phase 41: Public Reveal Polish - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the public-reveal portfolio surface for Iran Monitor — the milestone's final phase. Two strands:

- **REVEAL-DOCS (10 reqs)** — portfolio documentation: `BUILDING-WITH-CLAUDE-CODE.md`, `SHOWCASE.md`, `JOURNEY.md`, `concepts.md`, `COSTS.md`, `operator-guide.md`, `LESSONS.md`, brainstorms cleanup, `public/screenshots/` extension + reproducible `npm run capture:layers`, and a final-sweep audit gate.
- **REVEAL-SITE (4 reqs)** — user-facing reveal surface: landing-page polish, demo flows, social-share assets, custom-domain decision.

**Audience (locked, carried from 999.6-CONTEXT):** portfolio visitors (engineers, hiring managers, agentic-dev practitioners) + operator return-visits. NOT commercial customers or enterprise SREs.

**Already locked before this discussion (do not re-open):**

- No docs site (Docusaurus/Mintlify) — GitHub-rendered markdown only. No new ADRs, no new architecture diagrams. _(999.6 out-of-scope)_
- Vercel Pro cleanup already shipped in Phase 38 (former 999.6 Strand B) — not in this phase.
- `timeline.md` folded into `JOURNEY.md` as a Mermaid gantt (7 portfolio docs, not 8).
- README stays the repo front door; `SHOWCASE.md` cross-links into it, does not replace it. _(999.6)_
- Phase 40 left the public hero/landing chrome to Phase 41 and kept its tab-bar work to interaction affordances (40-CONTEXT D-04b). Phase 40's "hero header" is the _operator_ API-Health rollup — distinct from any public landing surface.

</domain>

<decisions>
## Implementation Decisions

### Landing surface architecture (REVEAL-SITE-01)

- **D-01:** The public landing surface IS the live dashboard (no separate landing page). A lightweight, **dismissible first-visit intro overlay** frames what the visitor is seeing on first load. Front door stays the map; narrative framing lives in the overlay. On-ethos with the "mission-control, numbers-over-narratives" surface.
- **D-02:** The operator/dev surface (API Health tab — `DevApiStatus`, FlightRecorderBlock, budget/cost blocks) stays **visible read-only** to unauthenticated visitors. Write-actions (replay / prune / force-trigger) remain Bearer-gated exactly as today. The API Health dashboard is treated as a portfolio _highlight_ (REVEAL-DOCS-07 already wants screenshots of it), not something to hide. No new gating to build.

### Demo flow mechanism (REVEAL-SITE-02)

- **D-03:** Primary mechanism = a **step-through guided tour overlay** (~5-7 spotlight steps walking layers → LLM enrichment → threat density → API Health, each highlighting a real feature). The first-visit intro overlay (D-01) is the entry point to this tour. Must be **re-openable** via a persistent "Tour" affordance (not first-visit-only).
- **D-04:** The tour and `npm run capture:layers` both render against **live data** — no fixtures, no `?demo=true` canned state. "Reproducible" means re-runnable, not byte-identical. Rationale: non-event layers (geographic / ethnic / water-stress / threat-density) are always populated, so the map looks rich even on a quiet conflict day.

### Portfolio docs forks (REVEAL-DOCS-02 / 07 / 09)

- **D-05:** Guided-tour hub = **`docs/SHOWCASE.md`** (flat file at `docs/` root, alongside JOURNEY / LESSONS / COSTS / concepts). README hero block links to it. (Not `docs/portfolio/INDEX.md` — flat is more discoverable and consistent with the other 6 portfolio docs.)
- **D-06:** Screenshots **consolidate to `public/screenshots/`**. Move the existing 6 PNGs out of `docs/screenshots/` and `docs/hero.gif` into `public/screenshots/`, add the ~10 new layer-by-layer captures there, and update README/doc references. Rationale: matches the REVEAL-DOCS-07 req text, app-servable (the REVEAL-SITE-03 OG image needs a public/ origin anyway), and still renders in the GitHub README via relative path.
- **D-07:** Brainstorms cleanup = **cross-link as receipts from BUILDING-WITH-CLAUDE-CODE.md**. Keep the originals in place (git-tracked proof-of-process: `docs/brainstorms/2026-03-13-...md`, `docs/superpowers/plans/`, `docs/superpowers/specs/`), pull the most interesting bits into `BUILDING-WITH-CLAUDE-CODE.md`, and cross-link the originals as "historical receipts". Nothing deleted or archived away.

### Scope, sequencing & reach

- **D-08:** **All 14 REQs ship in this phase, wave-structured** into plans: docs core (BUILDING / SHOWCASE / JOURNEY) → round-out docs (concepts / COSTS / operator-guide) → polish (10 screenshots / LESSONS / brainstorms) + the REVEAL-SITE strand. One clean, complete reveal — it is the milestone's final phase. (Not Wave-1-first-defer-the-rest.)
- **D-09:** Custom-domain decision (REVEAL-SITE-04) = **stay on `otg-iran-monitor.vercel.app`**. Zero cost, zero DNS work, already a clean URL. OG/share absolute URLs use the `vercel.app` origin. Decision recorded as "stay" — the requirement is satisfied by the decision itself.
- **D-10:** Final-sweep audit (REVEAL-DOCS-10) = **full re-audit with parallel subagents, as a Wave-0 blocking gate** that runs BEFORE any REVEAL-DOCS work lands (satisfies SC41-1). Re-run the v1.5-close 2nd-pass code+docs audit against then-current `main`, diff against the `project-v1-6-cleanup-punchlist` + `project-v1-6-docs-drift` memories, merge net-new findings into Phase 41 scope, drop captured-but-resolved items, refresh both memories. Accept the higher token spend for thoroughness.
- **D-11:** Narrative voice for the meta-story docs (BUILDING / JOURNEY / LESSONS) = **first-person builder voice** ("I wanted to track Iran conflict events → 10 phases of LLM reliability"). Authentic, personal, matches the agentic-dev "you can do this too" angle. (Not neutral third-person case-study.)

### Claude's Discretion

Downstream (researcher / planner / executor) resolve without re-asking the operator:

- Intro-overlay + guided-tour exact copy, step list, ordering, and spotlight target selectors.
- Tour implementation approach (custom React overlay vs a lightweight coachmark lib) — pick what fits the existing Deck.gl + React + Zustand stack with minimal new deps.
- `SHOWCASE.md` section ordering and the exact 1-click cross-link targets (hero GIF → ADR-0005/0010 → system-context.md → runbook.md → BUILDING-WITH-CLAUDE-CODE.md → `src/components/map/BaseMap.tsx`).
- `capture:layers` headless/Playwright mechanics, viewport, per-layer toggle sequencing, output naming.
- OG/Twitter card image source + dimensions (hero GIF or a derived static PNG), favicon refresh scope.
- `concepts.md` final term list (~30 terms; req gives the seed set) and per-term length.
- Per-doc length within the req-stated targets (e.g., BUILDING ~600-1000 lines).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements

- `.planning/ROADMAP.md` §"Phase 41: Public Reveal Polish" — goal, 14 REQ-IDs, SC41-1..SC41-4, dependency notes.
- `.planning/REQUIREMENTS.md` lines 105-126 — full REVEAL-DOCS-01..10 + REVEAL-SITE-01..04 definitions (each req pre-specifies most content).
- `.planning/phases/999.6-portfolio-documentation-polish/999.6-CONTEXT.md` — **source-of-truth for the REVEAL-DOCS strand scope/rationale**: audience definition, 10-deliverable breakdown, out-of-scope list, suggested wave structure, source-material map.

### Carried-forward decisions / coordination

- `.planning/phases/40-dashboard-ui-ux-polish-subtab-consolidation/40-CONTEXT.md` §D-04b + §D-05 — Phase 40 / REVEAL-SITE-01 shared-tab-bar boundary; operator "hero header" is the API-Health rollup, distinct from the public landing surface. Avoid double-touching the dev shell.
- `.planning/PROJECT.md` §"Current State" + §"Current Milestone: v1.6" — milestone framing, shipped-through-v1.5 state, operator-locked priority order.

### Source material for the narrative docs

- `.planning/RETROSPECTIVE.md` (271 lines) — 7 milestone retrospectives (What Worked / Inefficient / Patterns / Lessons / Cost). Primary source for BUILDING-WITH-CLAUDE-CODE.md + LESSONS.md.
- `.planning/MILESTONES.md` (243 lines) — 7 milestone entries + quantitative snapshots. Primary source for JOURNEY.md.
- `.planning/milestones/v1.5-phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md` — Phase 37 framing-gap callouts (the architectural-mismatch anecdote for BUILDING-WITH-CLAUDE-CODE.md).
- `docs/adr/0005-phase-26-2-nlp-approach-scrapped.md` — the "honest failure" exhibit (NLP scrap). Cross-link, don't rewrite.
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — the "honest deferral" exhibit. Cross-link.

### Existing surfaces the new docs cross-link / extend

- `README.md` — repo front door; already portfolio-tuned with hero GIF + Engineering Documentation block. SHOWCASE.md links into it, doesn't replace it.
- `docs/architecture/system-context.md` (155 lines) — architecture entry point referenced by SHOWCASE.
- `docs/runbook.md` (1038 lines) — operations entry point referenced by SHOWCASE; `operator-guide.md` is the visitor how-to counterpart (NOT incident response).
- `scripts/capture-hero.ts` + `package.json` script `capture:hero` — extension surface for `npm run capture:layers` (REVEAL-DOCS-07).
- `package.json` script `eval:replay` — referenced by `operator-guide.md` (REVEAL-DOCS-06).

### Audit memories (refresh during D-10 Wave-0 gate)

- Operator memory `project_v1_6_cleanup_punchlist.md` + `project_v1_6_docs_drift.md` — captured at v1.5 close (2026-06-03); partially stale post-Phase-38/39/40. Re-audit, diff, merge net-new, drop resolved.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/components/layout/AppShell.tsx` — root shell; the intro-overlay + guided-tour mount point. The dashboard IS the landing surface (D-01).
- `src/stores/uiStore.ts` (Zustand) — natural home for first-visit / tour-open / tour-step state (curried `create<T>()()` pattern, `s => s.field` selectors per project conventions).
- `src/components/layout/StatusDropdown.tsx`, layer toggles, `DetailPanelSlot.tsx` — the existing surfaces the guided tour spotlights; tour steps reference these, no rebuild.
- `DevApiStatus` (API Health tab) — visible read-only per D-02; a REVEAL-DOCS-07 screenshot target (incl. Phase-39 FlightRecorderBlock drill-down).
- `scripts/capture-hero.ts` — Playwright-based capture; extend to `capture:layers` driving live data (D-04).
- `docs/screenshots/*.png` (6 existing) + `docs/hero.gif` — relocate to `public/screenshots/` per D-06.

### Established Patterns

- Polling hooks + Zustand stores already feed all layers — the tour and live capture (D-04) read existing state; no new data layer.
- `index.html` is minimal (favicon + `<title>` only) — REVEAL-SITE-03 social-share (OG/Twitter/meta-description) is greenfield, added here.
- Tailwind v4 CSS-first `@theme` + `colorBridge.ts` single-source color tokens — any overlay/tour chrome colors must source from the D-13 token pipeline, not inline hex.
- Z-index scale via CSS custom properties — the intro overlay + tour spotlight must slot into the existing overlay layering, above map/panels.

### Integration Points

- Intro overlay + guided tour mount in `AppShell`, gated on a uiStore first-visit flag (persist dismissal e.g. localStorage); re-open affordance always available (D-03).
- `public/screenshots/` becomes both the GitHub-README image source and the app-servable asset origin (OG image) — single home (D-06).
- REVEAL-SITE-01 tab-bar work must respect the 40-CONTEXT D-04b boundary (interaction affordances already shipped in Phase 40; don't restyle the shell chrome twice).

</code_context>

<specifics>
## Specific Ideas

- SHOWCASE.md guided-tour path (from 999.6): hero GIF → decisions (ADR-0005 NLP scrap + ADR-0010 v1.5 close) → architecture (`system-context.md`) → operations (`runbook.md`) → meta-story (`BUILDING-WITH-CLAUDE-CODE.md`) → codebase entry (`src/components/map/BaseMap.tsx`).
- BUILDING-WITH-CLAUDE-CODE.md is **the single biggest move** (999.6 note) — most care. Cover the `/gsd` workflow shape (CONTEXT → DISCUSSION → PLAN → EXECUTE → VERIFY), where compounding worked (mechanical drift gates, parallel agents, probe-before-commit) and where it didn't (Phase 26.2 NLP scrap, Phase 31 early close, Phase 34 honest deferral, Phase 37 unblocker PRs), cost observations.
- concepts.md glossary seed (~30 terms): Pitfall 1 cache bridge, LLM-optional architecture, tier-green gate, polite-citizen contracts, ghost event, canonical actor catalog, mechanical drift gate, degrade-open, 6-path resolver, honest deferral, probe-before-commit, flight recorder.
- COSTS.md "you can do this too" angle: Vercel Pro $20/mo as the only non-free cost; NIM/Upstash/GDELT/OpenSky/adsb.lol/Open-Meteo/Yahoo/AISStream/Overpass/WRI/Natural Earth/GeoEPR all free; Claude Code dev cost (session count, model mix, ~per-phase).
- 10 new screenshots: each viz layer (geographic, weather, political, ethnic, water-stress, threat-density) + API Health + threat-density clusters click-through + actor-quality drill-down + ghost-event prune flow + FlightRecorderBlock drill-down.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep capabilities surfaced; all four areas clarified HOW to implement the 14 locked REQs.

### Reviewed Todos (not folded)

Two weak keyword-match todos surfaced by `todo.match-phase 41` (both score 0.6 on generic keywords like "status / captured / 2026 / phase"); neither relates to portfolio docs or the public reveal:

- `phase-27.4.2-ci-health.md` — CI-health technical note. Out of scope for a docs/reveal phase.
- `phase-27.4.3-deckgl-v9-type-drift.md` — deck.gl v9 type-drift technical note. Out of scope for a docs/reveal phase.

</deferred>

---

_Phase: 41-Public Reveal Polish_
_Context gathered: 2026-06-05_
