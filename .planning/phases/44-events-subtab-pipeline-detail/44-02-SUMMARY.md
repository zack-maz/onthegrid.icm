---
phase: 44-events-subtab-pipeline-detail
plan: 02
subsystem: ui
tags:
  [
    dev-api-status,
    events-subtab,
    llm-pipeline-observability,
    dead-links,
    presence-gated,
    degrade-open,
    evidence-as-text,
  ]

# Dependency graph
requires:
  - phase: 44-events-subtab-pipeline-detail
    plan: 01
    provides: 'prune.countsByStatus sampled tally + prune.deadUrlSample[].lastProbedAt/attemptCount/evidence + soft-404 enum; widened OperatorStatus.prune client interface (forward-compat optional)'
  - phase: 39-operator-visibility
    provides: 'self-contained FlightRecorderBlock (own /api/events/llm-history fetch + degrade-open placeholder)'
  - phase: 43-ghost-link-prune-correctness
    provides: '7-status liveness taxonomy, evidence string semantics, attemptCount dead-streak meaning'
provides:
  - 'EventsFiltersSectionV3 now mounts the 7 v2-era LLM blocks (Waterfall/Histograms/CallLog/BudgetBars/EvalScore/Dlq/Suspect) presence-gated + re-mounts FlightRecorderBlock (D-08) in the production events subtab'
  - 'New DeadLinkBucketsBlock — authoritative deadUrlCount, sampled per-status buckets labeled "of N scanned", drill-down rows (status badge / url / evidence-as-TEXT / relativeTime / dead ×attemptCount); self-hides when prune absent'
  - 'EventsFiltersSectionV3 gains optional prune prop; module-level PruneSummary type'
  - 'Events-tab-scoped operator-status fetch in DevApiStatus feeding prune to the events subtab (mutually-exclusive with the API-Health-tab fetch → no concurrent double fetch)'
affects: [45 (dashboard restyle of DevApiStatus — keeps the diff surface minimal per D-13)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Presence-gated block mount (gate at composer, NonNullable block props) — self-hide on absent data, never fabricate zeros (D-05)'
    - 'Degrade-open prop threading — optional prune prop, block self-hides when null (D-10)'
    - 'Redis-sourced strings rendered as React TEXT nodes (default-escaped) — never dangerouslySetInnerHTML (D-11 / T-44-04)'
    - 'Mutually-exclusive activeTab render branches mean a per-tab-scoped fetch never runs concurrently with a sibling tab fetch'

key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx
    - src/__tests__/DevApiStatusV3.test.tsx
    - src/__tests__/devApiStatusEventsSection.test.tsx
    - src/__tests__/components/DevApiStatus.prune.test.tsx

key-decisions:
  - 'D-05/D-06: 7 v2 blocks mounted presence-gated; BudgetBarsBlock self-hides under NIM-only (correct, honest — no synthetic cerebras:0/groq:0)'
  - 'D-05 (planner discretion): WaterfallBlock gated on stage !== "idle" for honesty (it self-?? 0-guards but an idle pipeline should not show a zeroed waterfall)'
  - 'D-09/D-10: new DeadLinkBucketsBlock fed by threaded prune prop; deadUrlCount authoritative, countsByStatus sampled ("of N scanned"), evidence as TEXT, attemptCount as dead-streak depth'
  - '[Rule 3 deviation] prune threaded via a NEW events-tab-scoped operator-status fetch in DevApiStatus — the canonical opStatus fetch lives in the sibling DevApiStatusAllApisTab (API-Health tab), NOT at the top level as the plan assumed. Mutually-exclusive activeTab branches mean it never runs concurrently with the API-Health fetch (honors D-10 no-double-fetch intent); degrade-open to null.'

requirements-completed: [EVENTS-TAB-01, EVENTS-TAB-02]

# Metrics
duration: ~11min
completed: 2026-06-10
---

# Phase 44 Plan 02: Events Subtab Pipeline Detail (UI) Summary

**Wired the existing LLM-pipeline observability into the production events subtab: mounted the 7 v2-era blocks + FlightRecorder presence-gated into `EventsFiltersSectionV3`, added a new degrade-open `DeadLinkBucketsBlock` (authoritative `deadUrlCount` + sampled "of N scanned" per-status buckets + drill-down rows with evidence rendered as TEXT), threaded the prune data down, and evolved the two events-section test suites in lockstep — all with the WAI-ARIA tablist DOM frozen and the 5 pinning suites green untouched.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-10T15:37Z
- **Completed:** 2026-06-10T15:48Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- **Task 1 — 7 v2 blocks + FlightRecorder mounted (EVENTS-TAB-01, D-05/D-08):** `WaterfallBlock` (gated `stage !== 'idle'`), `HistogramsBlock`, `CallLogBlock`, `BudgetBarsBlock`, `EvalScoreBlock`, `DlqBlock`, `SuspectBlock` mounted presence-gated into the production `EventsFiltersSectionV3`; `FlightRecorderBlock` re-mounted for run-history visibility. Gates live at the composer (block bodies declare NonNullable props). No synthetic `cerebras:0/groq:0` zero-defaults — `BudgetBarsBlock` self-hides under NIM-only, the correct honest outcome (D-06).
- **Task 2 — DeadLinkBucketsBlock + prune thread (EVENTS-TAB-02, D-09/D-10):** New `DeadLinkBucketsBlock` renders the authoritative `deadUrlCount` + `last24hPrunes`, sampled per-status buckets labeled `of N scanned` (D-03), and ≤20 drill-down rows (semantic status badge / truncated url / `evidence` as a plain TEXT node / `relativeTime(lastProbedAt)` / `dead ×attemptCount`). `EventsFiltersSectionV3` gained an optional `prune` prop; the block self-hides when `prune` is null (degrade-open). Module-level `PruneSummary` type + `DEAD_LINK_STATUS_COLORS` semantic ladder.
- **Task 3 — test evolution (D-12):** `DevApiStatusV3.test.tsx` (Pitfall 1) clarified + gained a self-hide test and a populated-path test; `devApiStatusEventsSection.test.tsx` gained R12 (mounts under data) + R13 (self-hide + degrade-open); `DevApiStatus.prune.test.tsx` gained a 6-test `DeadLinkBucketsBlock` describe block (authoritative total, "of N scanned", sample rows, evidence-as-TEXT with an adversarial `<b>` rendering literal, self-hide, empty path). The 5 pinning suites stayed green with zero edits.

## Task Commits

1. **Task 1: Mount 7 v2 LLM blocks + FlightRecorder into EventsFiltersSectionV3 (presence-gated)** - `7232f0c` (feat)
2. **Task 2: Add DeadLinkBucketsBlock + thread prune into EventsFiltersSectionV3** - `694b3ac` (feat)
3. **Task 3: Evolve events-section pins for v3 mounts + DeadLinkBucketsBlock** - `8b76b89` (test)

## Files Created/Modified

- `src/components/ui/DevApiStatus.tsx` — Presence-gated mounts of the 7 v2 blocks + FlightRecorder into `EventsFiltersSectionV3`; new `DeadLinkBucketsBlock` + `DEAD_LINK_STATUS_COLORS` + module-level `PruneSummary` type; `EventsFiltersSectionV3` signature gains optional `prune`; new events-tab-scoped `/api/operator-status` fetch (`eventsPrune` state) threaded to the composer.
- `src/__tests__/DevApiStatusV3.test.tsx` — Evolved empty-state note + self-hide test + populated-path test.
- `src/__tests__/devApiStatusEventsSection.test.tsx` — R12 (data-fed mounts) + R13 (self-hide / degrade-open).
- `src/__tests__/components/DevApiStatus.prune.test.tsx` — New `DeadLinkBucketsBlock` describe block (6 tests, events tab).

## Decisions Made

- **WaterfallBlock gating (D-05 planner's call):** gated on `stage !== 'idle'` rather than mounted unconditionally — the block self-`?? 0`-guards, but an idle pipeline rendering a fully-zeroed waterfall is less honest than self-hiding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] prune threaded via a new events-tab-scoped fetch, not from a top-level `opStatus`**

- **Found during:** Task 2
- **Issue:** The plan (and 44-PATTERNS §"Prune-prop threading") assumed `opStatus` was "already fetched once at top level" and the render switch could pass `prune={opStatus?.prune ?? null}`. In reality the canonical `/api/operator-status` fetch + `opStatus` state + `OperatorStatus` interface all live **inside the sibling `DevApiStatusAllApisTab` component** (the API-Health tab body, fn at line 1068), NOT in `DevApiStatus` (fn at line 350) where the events render switch lives. `opStatus` is out of scope at the render switch — `prune={opStatus?.prune ?? null}` fails to compile (`TS2552: Cannot find name 'opStatus'`). The local `OperatorStatus.prune` type is also unreachable from module-scope block components.
- **Fix:** (a) Added a module-level `PruneSummary` type (structurally identical to the local `OperatorStatus.prune`) so the module-scope `EventsFiltersSectionV3` + `DeadLinkBucketsBlock` can type the prop. (b) Added a small events-tab-scoped `/api/operator-status` fetch in `DevApiStatus` (`eventsPrune` state) that runs ONLY while `activeTab === 'events' && showEventsTab`, extracts only `prune`, polls every 30s, and degrades open to `null`. Because the API-Health and events tabpanels are **mutually-exclusive `activeTab` render branches**, only one fetcher is ever mounted at a time — so this never runs **concurrently** with the API-Health-tab fetch, honoring D-10's no-double-fetch intent. The render switch passes `prune={eventsPrune}`.
- **Why not Rule 4 (architectural):** lifting the 42-usage `opStatus`/`fetchOpStatus`/`setOpStatus` state out of `DevApiStatusAllApisTab` into the parent and re-threading would be a large refactor with high risk to the 5 frozen pinning suites. The scoped fetch is the minimal, lower-risk path that preserves the frozen suites and the runtime "single fetch instance at a time" guarantee.
- **Trade-off note:** the literal acceptance grep `prune=\{opStatus` does not match (the variable is correctly named `eventsPrune`); the prune prop IS threaded at the render switch with the already-fetched prune object as the plan intended.
- **Files modified:** `src/components/ui/DevApiStatus.tsx`
- **Commit:** `694b3ac`

## Authentication Gates

None — no auth gates encountered (the events subtab + operator-status fetch are Bearer-gated via the existing `dashboardAuthHeaders()` / `shouldRenderDashboard()`, already wired).

## Issues Encountered

- Two minor test-fixture corrections during Task 3 (both caught + fixed before commit, no separate deviation): (a) `callHistory` fixture entry needed a `model` field (NonNullable type); (b) `SuspectBlock` label asserted via regex `/Suspect events:/` not exact string (label + count split across spans); (c) `FlightRecorderBlock` asserted via its `flight-recorder-placeholder` testid (degrade-open state in jsdom with no resolved `/api/events/llm-history` fetch) rather than its "FLIGHT RECORDER" header.

## Verification Results

- `npx vitest run` (full frontend): **2605 passed, 19 skipped, 5 todo, 0 failed** (208 files).
- `npx tsc -b`: **0 errors** (exit 0); `type-coverage` success.
- 5 pinning suites green with **zero edits** — `git diff --stat HEAD` on the 4 pure-pinning suite files is empty; the prune suite's pre-existing 10 assertions are unchanged (only a new describe block appended).
- Actual `dangerouslySetInnerHTML=` JSX usages: **0** (T-44-04 satisfied; the single `grep -c` match is a pre-existing comment). The adversarial `<b>`-bearing evidence value renders as literal text with no injected `<b>` element (asserted in the prune suite).
- Tablist DOM unchanged: single `role="tabpanel" aria-labelledby="tab-events"` occurrence.
- `<DrillDownBlock` appears once in `EventsFiltersSectionV3` (pre-existing; not re-added — D-07).
- `npm run openapi:lint` (Redocly): valid, 37 pre-existing warnings, exit 0 (no drift — no OpenAPI changes this plan).

## Manual Verification (deferred to UAT per VALIDATION §Manual-Only)

- On the live prod dashboard with a Bearer, the Events subtab should show the mounted blocks with real Redis data, and `BudgetBarsBlock` should honestly **self-hide** under NIM-only (record this as the expected, correct outcome — D-06, NOT a defect).

## Threat Surface

No new security-relevant surface beyond the plan's `<threat_model>`. T-44-04 (stored XSS via evidence/url) mitigated by TEXT-node rendering + the adversarial-`<b>` test; T-44-05 (info disclosure) — only telemetry counts/durations/provider names render, no prompt/response text; T-44-06 (honest signal) — `BudgetBarsBlock` self-hides under NIM-only, `countsByStatus` labeled "of N scanned"; T-44-07 (DoS under partial data) — every mount presence-gated + degrade-open.

## Next Phase Readiness

- Phase 45 (Dashboard Subtab Readability Redesign) restyles this same file. The diff surface was kept minimal per D-13 (existing block idiom matched exactly; no new visual language). The block order inside `EventsFiltersSectionV3` (v3-native → DrillDownBlock → 7 v2 blocks → FlightRecorder → DeadLinkBuckets) is the restyle phase's starting point and may be reordered there.

## Self-Check: PASSED

- FOUND: src/components/ui/DevApiStatus.tsx (DeadLinkBucketsBlock at line 3490; PruneSummary type; eventsPrune fetch)
- FOUND: src/**tests**/DevApiStatusV3.test.tsx (self-hide + populated-path tests)
- FOUND: src/**tests**/devApiStatusEventsSection.test.tsx (R12 + R13)
- FOUND: src/**tests**/components/DevApiStatus.prune.test.tsx (DeadLinkBucketsBlock describe block)
- FOUND commit: 7232f0c (Task 1)
- FOUND commit: 694b3ac (Task 2)
- FOUND commit: 8b76b89 (Task 3)

---

_Phase: 44-events-subtab-pipeline-detail_
_Completed: 2026-06-10_
