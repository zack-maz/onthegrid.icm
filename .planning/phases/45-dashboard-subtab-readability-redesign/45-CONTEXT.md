# Phase 45: Dashboard Subtab Readability Redesign - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A purely **presentational** readability redesign of three operator dashboard subtabs — **water**, **events**, and **sites** — all rendered inside the single 3,851-line `src/components/ui/DevApiStatus.tsx`. The work makes numeric data scannable (`tabular-nums`, right-aligned numeric columns, labeled headers, whitespace grouping — DASH-READ-01), replaces raw data dumps with formatted summaries behind progressive disclosure following the `FlightRecorderBlock` run→call→detail idiom (DASH-READ-02), establishes visual hierarchy within the existing off-the-grid military aesthetic using only `@theme` tokens (DASH-READ-03), and adds trend sparklines for dead-link count and cron freshness backed by small history rings to catch slow-burn regressions (DASH-READ-05) — all **without breaking behavior**: the WAI-ARIA tablist contract is frozen and the behavioral pinning suites stay green (DASH-READ-04).

**One narrow server exception** (locked in D-01 below): a small bounded Redis history ring + a few lines appended inside the **existing** health cron handler, surfaced through the **existing** `/api/operator-status` aggregator. No new cron, no pipeline/probe-behavior change, no new endpoint — this is the minimal server surface required to make DASH-READ-05's "catches slow-burn regressions" actually true rather than session-ephemeral.

**Out of scope:** new dashboard capabilities (filters, new tabs, new metrics beyond the two named sparklines), any change to the LLM pipeline / probe / prune behavior (Phase 43 territory, closed), new Redis fields on event/liveness records, prose docs (Phase 49), and the deselected progressive-disclosure _density_ tuning (left to planner discretion within the established drill-down idiom).
</domain>

<decisions>
## Implementation Decisions

### Sparkline trend backing (DASH-READ-05)

- **D-01:** History that backs the sparklines lives in a **server-backed bounded Redis ring**, not a client-ephemeral one. Rationale: the requirement explicitly demands trends that "catch slow-burn regressions" — a client-only ring resets on reload and only trends while the tab is open, under-delivering DASH-READ-05. The ring reuses the existing bounded-ring idiom (`LPUSH` + `LTRIM`, exactly like `llm:calls:history` / `llm:runs:history`), is **written by the existing health cron** (`0 0 * * *`) as a once-daily append, and is **read via the existing `/api/operator-status` aggregator thread** (the Phase 44 D-01/D-10 pattern), NOT a new endpoint. Interpret "redesign breaks nothing behavioral" the same way Phase 44 D-01 did: no new Redis _event/liveness_ keys, no new writers to the pipeline, no probe/sweep/prune behavior change — a tiny observability ring written by an already-running cron honors that.
- **D-02:** **Cron-freshness is rendered per-cron — 3 sparklines** (health / warm / refresh-events), plus **1 dead-link-count sparkline** (4 total). Rationale: DASH-READ-05 exists to catch a _single_ subsystem slow-burning; a combined/worst-case view masks _which_ cron is drifting. "Small history **rings**" (plural) supports multiple small sparklines, and they fit the off-the-grid density. Self-referential note to preserve in verification: because the health cron writes the ring, a stalled health cron manifests as a **flatlining/stale** sparkline — that is itself a valid signal, not a bug. `warm` is the least critical of the three and can be collapsed later if it reads as noise.
- **D-03:** Ring depth is **30 daily samples** (`LTRIM` cap 30, 30d TTL) — matches the existing `llm:calls:history` / `llm:runs:history` retention exactly. One month is enough to surface a slow-burn without over-compressing a small sparkline.

### Sparkline visual style (DASH-READ-05 / DASH-READ-03)

- **D-04:** Sparklines render as an **inline SVG `<polyline>`/`<path>` mini line-chart** (~30 points), extracted into a reusable `<Sparkline>` primitive. Rationale: 30 daily points read as a true slow-burn trend far better than 30 discrete dots; a line scales to any ring depth; and an SVG component is cleanly testable (path `d` / point count) without the existing 10-dot dot-sparkline's test coupling. (The existing API-Health 10-dot "recent-fetch sparkline" stays as-is; this is a new, separate primitive.)
- **D-05:** Color encoding is **neutral stroke + semantic last point**: the line is drawn in a single muted `@theme` token; only the latest data point tints to a semantic `@theme` token (e.g. `--color-site-attacked`) when it crosses a degradation threshold (dead-link count rising / cron tick stale). Understated to match the off-the-grid aesthetic and DASH-READ-03's restraint, while the "now" state still pops. **Zero inline hex** — every color resolves through the `@theme` block / `colorBridge`. Threshold definitions are at planner discretion.

### Restyle structure (DASH-READ-01 / DASH-READ-03 / DASH-READ-04)

- **D-06:** **Hybrid structure** — extract only the two genuinely-reused atoms and inline-restyle everything else. The atoms: `<Sparkline>` (D-04) and `<MetricRow>` (a `tabular-nums`, right-aligned-value, small-label row that directly serves DASH-READ-01 across all three subtabs). All other subtab markup is restyled in place. Rationale: balances cross-subtab consistency against churn, and keeps the pinning-suite blast radius small versus a full block-framework rebuild.
- **D-07:** The extracted atoms live in **separate files with their own unit tests** — `src/components/ui/MetricRow.tsx` and `src/components/ui/Sparkline.tsx` (names at planner's discretion) — matching the existing `FlightRecorderBlock.tsx` / `BudgetBlock.tsx` precedent. Shrinks the 3,851-line file slightly and lets the atoms be tested in isolation (tabular-nums class, right-align, polyline point count) without routing through the heavy `DevApiStatus` suites.
- **D-08:** **DASH-READ-04 non-breakage strategy** — the visual **consolidated-layout snapshot is regenerated deliberately** (it captures the look we are intentionally redesigning; review the diff line-by-line, land green). The contract that is truly **frozen** is **behavioral**: `tabMerge`, `diagnosticBlocks` (roving tabindex / tab ids), `operatorActions`, and degrade-open semantics stay strictly untouched and green. This mirrors Phase 44 D-12's distinction (behavioral contract frozen vs. render/snapshot tests evolve in lockstep with intentional UI change). All restyling stays **inside** the existing `role="tabpanel"` containers — no tablist DOM, tab-id, or roving-tabindex changes.

### Claude's Discretion

- Exact Redis key name(s) for the history ring and the precise `/api/operator-status` aggregator field shape — follow the Phase 44 D-04 lockstep pattern (server route test + OpenAPI schema + client `opStatus` interface move in the same commit; forward-compat optional fields per Phase 32 D-10).
- Cold-start / partially-filled-ring rendering — follow the degrade-open idiom: render whatever points exist, never fabricate zeros; a "collecting…" affordance is acceptable but optional.
- Exact degradation thresholds for the D-05 semantic last-point tint.
- Component names (`MetricRow`, `Sparkline`, etc.), internal layout, sparkline dimensions/placement, and how a missed-tick gap renders within the polyline.
- Progressive-disclosure _density_ (how aggressively to collapse the events subtab's blocks) — deselected as a discussion area; planner decides within the `FlightRecorderBlock` run→call→detail idiom (DASH-READ-02).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition

- `.planning/ROADMAP.md` §Phase 45 — goal gloss + `DASH-READ-01..05` requirement IDs and the dependency note (Phase 44 must wire the events subtab before this restyles the same file)
- `.planning/REQUIREMENTS.md` §Dashboard Readability (DASH-READ) — lines 32–38 (the 5 acceptance-criterion requirements) + traceability table lines 111–115

### Upstream phase contract (what this phase restyles)

- `.planning/phases/44-events-subtab-pipeline-detail/44-CONTEXT.md` — D-08 (FlightRecorder run→call→detail drill-down canon = DASH-READ-02 pattern), D-12 (ARIA tablist freeze + "restyle is Phase 45, keep diff minimal"), D-13 (off-the-grid block visual idiom this phase is allowed to restyle), D-01/D-10 (the `/api/operator-status` aggregator + prune-prop thread that D-01 here extends)

### Code under change

- `src/components/ui/DevApiStatus.tsx` — the whole surface (3,851 lines). Water tabpanel `activeTab === 'water'` and Sites tabpanel `activeTab === 'sites'` render at ~953–959; tab id map at ~767–768; tab buttons at ~880–893. Events subtab body is `EventsFiltersSectionV3` (Phase 44).
- `src/styles/app.css` — `@theme` token block at **line 3** (24 entity/event/site color CSS vars). DASH-READ-03's "all colors from the `@theme` token block, no inline hex" target.
- `src/lib/colorBridge.ts` — the canonical CSS-var reader; HTML/CSS consumers pull hex strings from here (the no-inline-hex enforcement path).
- `src/components/ui/FlightRecorderBlock.tsx` — run→call→detail drill-down reference (DASH-READ-02) and `tabular-nums` usage precedent.
- `src/components/ui/BudgetBlock.tsx` — separate-file block precedent (D-07) and `tabular-nums` precedent.
- `server/routes/operator-status.ts` — the existing aggregator the D-01 ring read threads through (Phase 44 added `countsByStatus` / `DeadUrlSampleEntry` here).
- The health cron handler (`/api/cron/health`, `0 0 * * *`) — D-01 ring write lands here as a once-daily append.

### Tests (lockstep / freeze)

- `src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx` — existing 10-dot "recent-fetch sparkline" precedent (`api-health-sparkline-*` testids); **behavioral pin** under DASH-READ-04
- `src/components/ui/__tests__/...DevApiStatusConsolidatedLayout.snapshot.test.tsx` — the snapshot that is **deliberately regenerated** per D-08
- `src/__tests__/DevApiStatusV3.test.tsx`, `src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx`, `src/__tests__/devApiStatus.test.tsx` — tab-merge / water+sites render pins
- Behavioral pins to keep **frozen & green**: `tabMerge`, `diagnosticBlocks`, `operatorActions` suites + degrade-open semantics (Phase 44 D-12 set)

### Contract surfaces (drift gates must stay green)

- `server/openapi.yaml` `/api/operator-status` — gains the D-01 history-ring field(s); Redocly lint green (Phase 44 D-04 lockstep pattern)

### Conventions

- `CLAUDE.md` §Color Tokens (D-13 single source of truth: `@theme` + `colorBridge`, no inline hex), §Serverless Cache (bounded-ring Redis key idioms: `llm:calls:history`/`llm:runs:history` LPUSH+LTRIM, TTL tiers), §LLM Event Pipeline (the 3-cron schedule)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`tabular-nums` is already an established Tailwind v4 class** in `BudgetBlock.tsx` and `FlightRecorderBlock.tsx` — DASH-READ-01 numeric alignment reuses it directly, no new utility.
- **`FlightRecorderBlock`** is the working run→call→detail progressive-disclosure exemplar (self-contained fetch + drill-down) — copy its interaction shape for DASH-READ-02.
- **An existing 10-dot "recent-fetch sparkline"** lives in the API-Health tab with pinned tests — proof the codebase already renders sparklines in this aesthetic; the new `<Sparkline>` is a distinct, richer (line, 30-pt) primitive.
- **`/api/operator-status` is already fetched once** (Bearer-gated) and threaded into subtabs (Phase 44) — the D-01 ring read piggybacks on this; no new poll.
- **Bounded-ring idiom** (`LPUSH`+`LTRIM`, tiered TTL) is established across `llm:calls:history`, `llm:runs:history`, `events:llm-pipeline-audit` — D-01's ring is a direct copy.
- **`@theme` block + `colorBridge`** give a mechanically drift-proof color path — DASH-READ-03's no-inline-hex is satisfied by sourcing every color from there.

### Established Patterns

- Off-the-grid block idiom: `text-[9px]`, `uppercase tracking-wider text-white/40` headers, `border-t border-white/10 pt-2` separators — the baseline this phase restyles _within_ (Phase 44 D-13).
- Degrade-open: every block self-hides / renders "—" when data absent; never crashes, never fabricates (applies to D-05 cold-start sparkline).
- Contract lockstep: server route test + OpenAPI + client interface move in one commit; forward-compat optional fields on the client interface (Phase 32 D-10 / Phase 44 D-04).
- ARIA tablist contract is behavior-frozen; restyle stays inside existing `role="tabpanel"` containers (Phase 44 D-12).

### Integration Points

- Water/sites/events tabpanels in `DevApiStatus.tsx` (~953–959 + `EventsFiltersSectionV3`) — where `<MetricRow>` / restyled blocks mount.
- `/api/operator-status` aggregator (`server/routes/operator-status.ts`) + health cron handler — where the D-01 ring is written and read.
- `@theme` block (`src/styles/app.css:3`) + `colorBridge` — the color source for `<Sparkline>` strokes/tints.

</code_context>

<specifics>
## Specific Ideas

- The two named sparklines are **dead-link count** and **cron freshness** (the latter rendered **per-cron**: health / warm / refresh-events) — 4 sparklines total.
- Sparkline = **inline SVG line**, not dots; **neutral muted stroke** with a **semantic last-point tint** on threshold cross.
- The history ring should match `llm:runs:history` precisely in shape (LPUSH+LTRIM 30-cap, 30d TTL) so it reads as "the same kind of thing" to a maintainer.
- `<MetricRow>` is the DASH-READ-01 workhorse atom — `tabular-nums`, right-aligned value, small uppercase label — reused across all three subtabs.

</specifics>

<deferred>
## Deferred Ideas

- **Progressive-disclosure density tuning** for the events subtab (how aggressively to collapse the 7+ Phase-44 blocks by default, or an operator density toggle) — deselected as a discussion area; left to planner discretion within the run→call→detail idiom. Not a new phase, just unspecified detail.
- **Collapsing the `warm` cron sparkline** if per-cron (D-02) reads as noise in practice — trivial later tweak, noted for the operator.
- **A true `firstSeenDead` timestamp** for richer dead-link trend semantics — would re-open Phase 43's liveness-schema lockstep surfaces; only worth it if the attemptCount/ring proxy proves insufficient (carried from Phase 44 deferred).

### Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md` — matched only on generic keyword "phase" (score 0.6); CI health is unrelated to a readability restyle. Fourth consecutive deferral (Phases 42/43/44/45) — strong candidate for Phase 46 (General Hardening) review.
- `phase-27.4.3-deckgl-v9-type-drift.md` — matched only on generic keyword (score 0.6); deck.gl layer typing is unrelated to the DevApiStatus dashboard. Candidate for Phase 46 review.
- (Both are keyword-noise with no scope overlap; folding them would violate the phase boundary, so they were reviewed-not-folded, matching the Phase 42/43/44 precedent.)

</deferred>

---

_Phase: 45-Dashboard Subtab Readability Redesign_
_Context gathered: 2026-06-21_
