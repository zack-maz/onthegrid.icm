# Phase 40: Dashboard UI/UX Polish + Subtab Consolidation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Take the operator-only **API Health tab** (`DevApiStatusAllApisTab`, lines 873–1772 of the 3119-line `src/components/ui/DevApiStatus.tsx`) from its current ~13 stacked sub-blocks (accumulated through Phases 28.2 + 32 + 33 + 35 + 39) into a navigable, polished surface of 3–4 grouped sections. Deliver: a visual polish pass (type hierarchy, spacing scale, color tokens), shared dev-shell tab-bar interaction refinement, agent-native parity verification, and RTL + snapshot regression-lock against the consolidated layout.

**This is a UI phase.** Sequence is: discuss (this) → `/gsd-ui-phase 40` (produces UI-SPEC.md — the detailed visual contract, and the SC40-1 gate) → `/gsd-plan-phase 40` → `/gsd-execute-phase 40`. The decisions below are the locked vision constraints the UI-SPEC turns into a pixel-level contract.

**In scope:** API Health tab content consolidation + polish; shared tab-bar interaction affordances (focus / active-tab / keyboard); any NEW semantic color tokens (added via `colorBridge.ts`).
**Out of scope:** restyling other tabs' content (water / sites / events); app-wide token sweep; new analytics/charts; public-facing landing chrome (Phase 41); building BudgetBlock/FlightRecorderBlock (shipped in Phase 39 — placed/grouped here, not rebuilt).

**Requirements (5):** UI-POLISH-01..05. SC40-1..3. (No SPEC.md — requirements + the decisions below are the contract.)

</domain>

<decisions>
## Implementation Decisions

All five gray areas were resolved with the recommended lean; the operator confirmed each (and delegated the 5th area's selection to Claude — "whatever comes to your mind"). Treat these as locked constraints; sub-pixel execution details resolve downstream in UI-SPEC / plan.

### Consolidation mechanism (Layout)

- **D-01:** **Collapsible grouped sections, default-EXPANDED** (so portfolio screenshots show breadth at once) **+ a drawer / overflow for rarely-used and destructive controls** (Replay probe, Prune dead URLs). NOT nested sub-tabs (hides data one-group-at-a-time — bad for incident triage and for screenshots). Directly satisfies UI-POLISH-02's "redirect rarely-used controls into a sub-tab or drawer."

### Section grouping taxonomy (Grouping)

- **D-02:** **Four data-domain groups:**
  1. **Endpoint Health** — tier summary + per-endpoint quality table + per-endpoint retry button + recent-fetch sparkline + freshness/latency.
  2. **LLM Pipeline** — `LLMPipelineSection` + `FlightRecorderBlock` + eval / adversarial-eval (prompt-injection robustness) rows.
  3. **Budget & Cost** — `BudgetBlock` (token-proximity bars, soft 0.8 / hard 0.95) + cost-shadow USD.
  4. **Operator Actions & Data Quality** — dead-URL count + drill-down, `actorQuality` counters + drill-down, `byBearer` breakdown, 24h action count, replay probe, quota alerts.
- **D-02a:** The drawer (D-01) pulls the **destructive / rarely-used controls** (Replay probe button, Prune button) OUT of the always-visible flow; their **read-only counters** (dead-URL count, actorQuality counters, byBearer) STAY in group 4. UI-SPEC finalizes exact drawer membership.

### Aesthetic / density direction (Aesthetic)

- **D-03:** **Dense-but-legible.** Keep the mission-control density (fits "numbers over narratives" + operator triage). Fix legibility with: a real **type hierarchy** (distinct section-header / label / value sizes — not everything at 9–10px), a **4px spacing scale** (carry forward the 28.2-UI-SPEC §7 multiples-of-4 convention), and **aligned `tabular-nums` grids**. NOT a spacious modern dashboard (generic-SaaS look, less data per screen); NOT minimal-cleanup-only (leaves the no-hierarchy noise). `frontend-design` skill executes the pass; UI-SPEC defines the exact type scale.

### Polish scope boundary (Scope)

- **D-04:** **In scope:** (a) API Health tab content (the consolidation + visual polish), (b) shared dev-shell **tab-bar interaction affordances** — focus state, active-tab affordance, keyboard navigability (UI-POLISH-04), (c) any **NEW semantic color tokens** needed (healthy / degraded / warning for the hero header), added to `colorBridge.ts` + `app.css @theme` per the D-13 single-source contract.
- **D-04a:** **Out of scope:** restyling other tabs' CONTENT (water / sites / events) — they carry their own phase history; an app-wide token/type sweep is scope-creep for a polish phase.
- **D-04b:** The shared tab bar is ALSO touched by **Phase 41 REVEAL-SITE-01** (landing-page polish coordinates with UI-POLISH-04). UI-SPEC must flag the boundary so the two phases don't double-touch the dev shell. Keep Phase 40's tab-bar work to **interaction affordances**, not a full visual restyle of the shell chrome (leave hero/landing chrome to 41).

### Status legibility & honest degraded states (Claude-proposed 5th area)

- **D-05:** Add a **top-of-tab rollup HERO header** — a single summary strip: endpoints-healthy count (N/M), LLM last-run outcome + timestamp, budget state (% of cap, soft/hard proximity), dead-URL count. **Sourced from already-polled data** (operator-status `tokenBudget` + `prune.deadUrlCount`, FlightRecorder last-run, endpoint tier statuses) — NO new fetch / endpoint. Becomes the screenshot hero + gives information scent before drill-in.
- **D-06:** **Honest degraded-state convention.** The 3–4 top-level SECTIONS always render; on null/stale/missing data they show a **muted "— / no data (reason)" placeholder rather than silently vanishing** (today `BudgetBlock` + the prune block self-hide; `actorQuality` shows "no data" — unify on the muted-placeholder pattern). Prevents layout jump + confusing gaps and makes missing data look intentional in screenshots. Truly-optional **micro-rows** (e.g. a single drill-down sample list) MAY still hide. Satisfies SC40-3's fresh/stale/degraded render-contract intent. **Degrade-open semantics are preserved** — route stays 200, block never throws; this changes only the EMPTY render, not the error contract.

### Process / sequencing & reconciliation

- **D-07:** UI-SPEC.md (via `/gsd-ui-phase 40`) is the **SC40-1 gate** — it MUST publish before any consolidation code lands. It turns D-01..D-06 into the detailed visual contract: exact type scale, spacing token names, DOM grouping, drawer membership, hero-header field list + ordering, keyboard-nav bindings.
- **D-08 [reconciliation — MANDATORY for UI-SPEC + planner]:** The UI-POLISH-02 sub-block enumeration is **partially STALE vs the real DOM.** "pin TTL" was REMOVED in Phase 29 (the `POST /api/events/llm-pipeline` override surface is gone); "eval scoreblock" (`EvalScoreBlock`, :2460) currently renders in the **Events tab, not API Health**. The UI-SPEC + planner MUST inventory the **live `DevApiStatusAllApisTab` DOM (:873–1772)** as the source of truth for what gets grouped — not the requirement's enumeration.

### Claude's Discretion

- Operator confirmed all 5 recommended leans and delegated the 5th-area topic to Claude. Delegated downstream to UI-SPEC / plan: exact type-size values, spacing token names, precise drawer membership, hero-header field ordering, keyboard-nav key bindings, snapshot-test granularity. The decisions above are locked; resolve sub-pixel details downstream — do not re-ask the operator.

### Folded Todos

None.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap

- `.planning/REQUIREMENTS.md` §UI-POLISH-01..05 — locked requirement text (sub-block enumeration [see D-08 staleness caveat], agent-native parity, RTL + snapshot lock).
- `.planning/ROADMAP.md` → Phase 40 section — goal + SC40-1..3 + the "UI-SPEC.md via `/gsd-ui-phase` BEFORE `/gsd-plan-phase`" ordering and the Phase 39 dependency note.

### UI design contract (prior + Phase 39)

- `.planning/milestones/v1.4-phases/28.2-dev-prod-sync-domain-rename/28.2-UI-SPEC.md` — the PRIOR UI-SPEC the current `DevApiStatus` code follows (§5.2 "LLM Pipeline" heading, §7 multiples-of-4 spacing, §9 sparkline color tokens, §5.3.x per-endpoint quality/retry blocks). The new UI-SPEC supersedes it; read for the spacing/color/type conventions to carry forward (D-03).
- `.planning/phases/39-operator-visibility-token-budget-cost-shadow-llm-flight-reco/39-UI-SPEC.md` — Phase 39 design contract for `BudgetBlock` + `FlightRecorderBlock` (their render contracts + placement constraints).
- `.planning/phases/39-operator-visibility-token-budget-cost-shadow-llm-flight-reco/39-CONTEXT.md` §GA-1 — explicitly deferred "rich FlightRecorder filters + tab/subtab placement + visual polish" to Phase 40.

### Integration anchors (existing code — read before writing)

- `src/components/ui/DevApiStatus.tsx` — the consolidation target. `DevApiStatusAllApisTab` (:873–1772) is the API Health tab body (the live DOM = D-08 source of truth); tab shell + `TabButton` (:258, :328, switching :713–790); the `operator-actions` section (:1557–1759) holds most of group 4.
- `src/components/ui/BudgetBlock.tsx` (mount at DevApiStatus :1747) + `src/components/ui/FlightRecorderBlock.tsx` (mount at :1765) — Phase 39 SHIPPED components; place/group, don't rebuild. FlightRecorderBlock does its OWN Bearer fetch of `/api/events/llm-history` with run→call→detail drill-down. Note their current degrade-open self-hide to change per D-06.
- `src/lib/dashboardAuth.ts` §`shouldRenderDashboard` / `useShouldRenderDashboard` — operator-only gate (`import.meta.env.DEV || hasDashboardKey()`). The surface is NOT public — audience is operator + portfolio screenshots, not visitors.
- `src/styles/app.css` `@theme` block + `src/lib/colorBridge.ts` — the D-13 color single-source-of-truth. Any NEW semantic token MUST route through both (CLAUDE.md "Color Tokens" contract; byte-identity sentinel `src/__tests__/lib/colorBridge.test.ts` fails otherwise).
- `src/stores/uiStore.ts` — `activeDevApiStatusTab` / `setDevApiStatusTab` tab state; new collapse/drawer state likely co-locates here.
- `src/__tests__/devApiStatus.test.tsx`, `src/__tests__/components/DevApiStatus.actorQuality.test.tsx`, `DevApiStatus.prune.test.tsx`, `src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx` (+ siblings) — existing RTL tests to extend + snapshot-lock (UI-POLISH-05).

### Skills / process

- `frontend-design` skill — drives the polish pass (UI-POLISH-03; no generic AI aesthetics).
- `compound-engineering:review:agent-native-reviewer` agent — UI-POLISH-04 parity check (every UI action has a Bearer-gated endpoint / query-param equivalent).
- `CLAUDE.md` §"Color Tokens (Phase 28.1+)" + §"Vercel Deployment" (rate-limit / Bearer model) — token + access-control contracts the polish must respect.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`BudgetBlock.tsx` (129 LOC) + `FlightRecorderBlock.tsx` (471 LOC)** — Phase 39 shipped; group/place into the Budget & Cost / LLM Pipeline sections respectively, don't rebuild.
- **`TabButton` (:258)** — existing active-state tab button; the tab-bar affordance work (D-04) extends it.
- **`colorBridge.ts` + `app.css @theme`** — the token pipeline for any new healthy/degraded/warning semantic colors the hero header needs.
- **28.2-UI-SPEC conventions already embedded in the code** (multiples-of-4 spacing comments, CSS-var color tokens, `tabular-nums`) — carry forward, don't reinvent.
- **Existing degrade-open gates** (`opStatus?.X != null` patterns, `actorQuality` "no data" row) — the templates to unify under D-06.

### Established Patterns

- DevApiStatus polls `/api/operator-status` once per cycle into a typed `OperatorStatus` shape; the hero header (D-05) reads from this EXISTING poll — no new data layer.
- `shouldRenderDashboard()` gate (`dev || dashboardKey`) — operator-only surface; polish targets the operator + portfolio-screenshot audience.
- Per-block RTL component tests already exist — extend + add the consolidated-layout snapshot for UI-POLISH-05.
- D-13 color single-source contract enforced by the colorBridge byte-identity sentinel test.

### Integration Points

- `DevApiStatusAllApisTab` (:873–1772) — the function being restructured into 4 sections + drawer + hero header.
- `uiStore` `activeDevApiStatusTab` / `setDevApiStatusTab` — tab state; new collapse/drawer state co-locates here.
- `BudgetBlock` mount (:1747) + `FlightRecorderBlock` mount (:1765) — current positions; relocate into their groups.
- **agent-native parity:** every UI control (per-endpoint retry, replay probe, prune, refresh) already maps to a Bearer-gated endpoint / query-param — UI-POLISH-04 verification confirms the consolidation introduces no UI-only action.

</code_context>

<specifics>
## Specific Ideas

No specific reference design or "make it like X" — the operator confirmed the recommended leans and delegated the 5th-area selection ("whatever comes to your mind"). Guiding intent: an **operator/portfolio-grade "mission-control" surface** that is **scannable in 2 seconds** (the D-05 hero header) and **looks intentional even when data is degraded** (D-06). Dense, serious, data-first — not a generic spacious SaaS dashboard.

</specifics>

<deferred>
## Deferred Ideas

- **App-wide token / type consistency sweep** across water / sites / events tabs — out of scope (D-04a); candidate for a future consistency phase, or fold into Phase 41 if the reveal needs cross-tab consistency.
- **Cross-run analytics / eval-trend charts / token-spend sparklines beyond a basic surface** — deferred from Phase 39; still out of scope (Phase 40 is layout/polish, not new analytics).
- **Rich FlightRecorder filters (outcome / date-range)** — Phase 39 GA-1 nominally deferred these "to Phase 40," but they are a FEATURE addition, not polish. Default: keep Phase 40 to placement/grouping/visual polish; UI-SPEC may scope a minimal filter only if it's part of the consolidation UX.
- **Public-facing landing / hero chrome + landing-vs-dashboard decision** — Phase 41 REVEAL-SITE-01 (coordinate the shared tab bar per D-04b).

### Reviewed Todos (not folded)

- **`phase-27.4.2-ci-health`** — CI-health tech-debt; matched only on generic "phase/health" keywords. Not dashboard-UI scope. (Same false positive reviewed-and-rejected in Phase 39.)
- **`phase-27.4.3-deckgl-v9-type-drift`** — DeckGL v9 typing tech-debt; generic-keyword match only. Not in scope.

</deferred>

---

_Phase: 40-dashboard-ui-ux-polish-subtab-consolidation_
_Context gathered: 2026-06-04_
