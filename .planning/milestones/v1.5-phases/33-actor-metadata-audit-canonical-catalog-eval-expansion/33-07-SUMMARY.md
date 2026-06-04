---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 07
subsystem: devapistatus-actor-quality-render
tags: [actor-metadata, dashboard, devapistatus, ui, observability, ACTOR-05]
requires:
  - 33-06 (server/routes/operator-status.ts — actorQuality block on /api/operator-status)
provides:
  - DevApiStatus.tsx Actor Quality sub-block (D-17) — read-only counters + drill-down list
affects:
  - src/components/ui/DevApiStatus.tsx (modified — OperatorStatus interface + JSX sub-block)
  - src/__tests__/components/DevApiStatus.actorQuality.test.tsx (created — 6 RTL cases)
tech-stack:
  added: []
  patterns:
    - Inline JSX sub-block alongside Phase 32 prune block precedent
    - Forward-compat render gate (opStatus?.actorQuality != null) mirrors Phase 32 D-10
    - Tailwind CSS-var consumption via text-[color:var(--token-name)] arbitrary class
    - aria-label on count row for screen-reader assembly of the four counts
key-files:
  created:
    - src/__tests__/components/DevApiStatus.actorQuality.test.tsx
  modified:
    - src/components/ui/DevApiStatus.tsx
decisions:
  - D-17 mount point pinned between Phase 32 prune block close (~L1671) and pruneQuotaAlert (~L1736); post-edit Phase 33 block spans L1673-1734
  - Issue-badge color mapping (UI-SPEC §Color verbatim) — null → text-text-muted/60; raw-cameo + ambiguous → --color-faction-disputed; low-confidence → --color-event-other
  - Zero new color tokens introduced (D-13 single-source-of-truth contract preserved)
  - Zero buttons / zero destructive surface added (Phase 33 is read-only)
  - Truncation footer triggers when sample.length === 20 (server-side LIMIT_DRILL_DOWN sentinel)
metrics:
  duration: 10m
  tasks_completed: 2
  commits: 2
  date_completed: 2026-05-21T13:43:00Z
requirements:
  - ACTOR-05 (client-side; server side = Plan 33-06)
---

# Phase 33 Plan 07: DevApiStatus Actor Quality Sub-Block Render (D-17) — Summary

ACTOR-05 client-side fulfilled. The API Health tab's Operator Actions section now renders a read-only Actor Quality sub-block consuming the `actorQuality` field that Plan 33-06 shipped on `/api/operator-status`. No new poll, no new endpoint, no new operator action — pure observability surface inheriting the existing 30s poll loop.

## What was built

### `src/components/ui/DevApiStatus.tsx` (modified)

**1. `OperatorStatus` interface extension (line 918):** New optional field

```ts
actorQuality?: {
  totalEvents: number;
  nullActors: number;
  rawCameoActors: number;
  ambiguousActors: number;
  lowConfidenceActors: number;
  sample: Array<{
    eventId: string;
    actors: string[];
    actorConfidence: Array<'high' | 'medium' | 'low'>;
    issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
  }>;
} | null;
```

Matches Plan 33-06 server shape byte-for-byte.

**2. JSX sub-block (lines 1673-1734):** Mounted inside `<section data-testid="operator-actions">` between the Phase 32 prune block's closing `</>` (line ~1671) and the `{pruneQuotaAlert && (` conditional (line ~1736). Three render gates:

| Condition                                                              | What renders                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| `opStatus?.actorQuality != null && actorQuality.totalEvents > 0`       | Count row + drill-down list (if sample non-empty) |
| `opStatus?.actorQuality != null && actorQuality.totalEvents === 0`     | Empty state (`Actor quality: no data`)            |
| `opStatus?.actorQuality == null` (default, pre-Phase-33 server deploy) | Silent absence — sub-block doesn't render at all  |

**Pinned data-testids (UI-SPEC §"Test IDs" verbatim):**

- `actor-quality-row` — count row `<div>`
- `actor-quality-list` — drill-down `<ul>`
- `actor-quality-row-{eventId}` — each drill-down `<li>` (one per sample entry)
- `actor-quality-list-truncated` — truncation footer (renders when `sample.length === 20`)
- `actor-quality-empty` — empty-state `<div>` (renders only when `totalEvents === 0`)

**Issue-badge color mapping (UI-SPEC §Color verbatim — zero new tokens):**

| `issue` value    | Tailwind class                               | CSS var consumed           |
| ---------------- | -------------------------------------------- | -------------------------- |
| `null`           | `text-text-muted/60`                         | `--color-text-muted`       |
| `raw-cameo`      | `text-[color:var(--color-faction-disputed)]` | `--color-faction-disputed` |
| `ambiguous`      | `text-[color:var(--color-faction-disputed)]` | `--color-faction-disputed` |
| `low-confidence` | `text-[color:var(--color-event-other)]`      | `--color-event-other`      |

All three vars are pre-existing `@theme` declarations in `src/styles/app.css`. D-13 single-source-of-truth contract preserved — `colorBridge.ts` byte-identity sentinel test is unaffected.

**Accessibility contract (UI-SPEC §Accessibility):**

- Count row `aria-label="Actor quality counters: {N} null actors, {N} raw CAMEO codes, {N} ambiguous strings, {N} low confidence"` — screen readers announce the four conjoined counts as one unit.
- Drill-down list `aria-label="Actor quality drill-down sample (up to 20 events)"`.
- Issue badge: text content (`null` / `raw-cameo` / `ambiguous` / `low-confidence`) is its own label (no aria override).

**Copywriting verbatim (UI-SPEC §Copywriting):**

- Count row content: `Actor quality: Null: {X} · Raw-CAMEO: {Y} · Ambiguous: {Z} · Low-confidence: {W}`
- Empty state: `Actor quality: no data`
- Truncation footer: `… and more`

### `src/__tests__/components/DevApiStatus.actorQuality.test.tsx` (created)

Six `it()` cases covering D-17 contract — all GREEN after Task 2:

1. `actor-quality-row renders count row with all four counters` — verifies `Null: 5`, `Raw-CAMEO: 2`, `Ambiguous: 3`, `Low-confidence: 10` from the mock payload all appear in the rendered row's textContent.
2. `actor-quality-list caps drill-down at 20 entries` — feeds a 20-entry sample (the maximum a properly-behaved server delivers) and asserts `queryAllByTestId(/^actor-quality-row-/).length === 20` (client renders all 20 from the server cap).
3. `issue-badge color tokens match UI-SPEC mapping` — for each of the 4 `issue` enum values, finds the row's innerHTML and asserts the substring of the expected color class is present (`text-text-muted` for null, `--color-faction-disputed` for raw-cameo + ambiguous, `--color-event-other` for low-confidence).
4. `actor-quality-empty renders when totalEvents === 0 AND actorQuality non-null` — asserts the empty state's `data-testid` + verbatim copy and that `actor-quality-row` is absent.
5. `sub-block silently absent when opStatus.actorQuality is null` — feeds `actorQuality: null` (pre-Phase-33 server shape) and asserts none of the three sub-block testIDs are in the DOM. Parent block still renders (`operator-actions-24h-count` present).
6. `count row aria-label contains all four count words for screen readers` — verifies the count row's `aria-label` string contains `null actors`, `raw CAMEO codes`, `ambiguous strings`, `low confidence`.

Mirrors `DevApiStatus.prune.test.tsx` verbatim for the jsdom matrix: `resetAllStores()` 8-store reset, `useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' })`, `vi.stubGlobal('fetch', mockFetch)` with URL-routed implementation, `mockLLMStatus` mock, localStorage Bearer seed.

## Decision-Coverage Trace (D-17)

| Coverage axis                                          | Implementation site                                                                      | Test pin                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `actorQuality` interface field                         | `OperatorStatus` interface line 918                                                      | Compile-time (tsc clean)                                             |
| Mount point (pinned BETWEEN prune and pruneQuotaAlert) | DevApiStatus.tsx lines 1673-1734 — inside `<section data-testid="operator-actions">`     | Test 1 + Test 5 (sub-block renders / silently absent in same parent) |
| Count row + 4 counters                                 | Lines 1683-1692 — `Actor quality: Null: {X} · Raw-CAMEO: {Y} · …`                        | Test 1                                                               |
| Drill-down list ≤ 20 entries                           | Lines 1694-1730 — server-side cap respected, no client-side truncation needed            | Test 2                                                               |
| Per-issue color mapping (UI-SPEC)                      | Lines 1700-1705 — ternary expression mapping `issue` enum to color class                 | Test 3                                                               |
| Empty state (`totalEvents === 0`)                      | Lines 1731-1733 — second render gate                                                     | Test 4                                                               |
| Silent absence (`actorQuality == null`)                | Both render gates require `opStatus?.actorQuality != null`                               | Test 5                                                               |
| aria-label accessibility                               | Line 1686 — template literal stitching four counter values into one screen-reader phrase | Test 6                                                               |
| Truncation footer (sample.length === 20)               | Lines 1722-1729                                                                          | Test 2 (20-entry mock fires the conditional)                         |
| Zero new color tokens (D-13)                           | All issue colors use existing `@theme` vars; zero hex/RGBA in Phase 33 block             | grep verification (0 matches in scoped awk range)                    |
| Zero new buttons (Phase 33 read-only)                  | No `<button` / `onClick=` in Phase 33 block                                              | grep verification (0 matches in scoped awk range)                    |

## Cross-Coverage Trace (ACTOR-05)

| Half                                            | Plan                  | Status                    | Surface                                                                 |
| ----------------------------------------------- | --------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Server: `/api/operator-status` aggregator block | **33-06**             | landed (commit `3aa6072`) | Lazy compute over `events:llm:v3`, INLINE_CAMEO_CODES, degrade-open     |
| Client: DevApiStatus.tsx sub-block render       | **33-07** (this plan) | landed (commit `c97c6c9`) | Read-only counters + drill-down, forward-compat silent skip, aria-label |

Both halves are now merged into `feature/33-actor-metadata-audit-canonical-catalog-eval-expansion`. ACTOR-05 closes when this plan lands.

## Post-edit line-number map (UI-SPEC anchor reconciliation)

The plan referenced "line 1654 (prune close) and 1658 (pruneQuotaAlert)" as the mount point. After the insertion the local line numbers shifted (the interface extension at line 918 adds 16 lines; the new JSX block adds 64 lines):

| Anchor                                            | Pre-edit line (per PLAN context) | Post-edit actual line |
| ------------------------------------------------- | -------------------------------- | --------------------- |
| `OperatorStatus` interface `actorQuality?:` field | (new — pre-edit was absent)      | 918                   |
| Prune block closing `</>`                         | 1654                             | 1671                  |
| Phase 33 sub-block start comment                  | (new)                            | 1673                  |
| `data-testid="actor-quality-row"`                 | (new)                            | 1685                  |
| `data-testid="actor-quality-list"`                | (new)                            | 1696                  |
| `data-testid="actor-quality-list-truncated"`      | (new)                            | 1721                  |
| `data-testid="actor-quality-empty"`               | (new)                            | 1731                  |
| `Actor quality: no data` literal                  | (new)                            | 1732                  |
| `pruneQuotaAlert &&` conditional                  | 1658                             | 1742                  |

This shift is expected and matches the byte-budget the planner allocated. The mount-point CONSTRAINT (between prune and pruneQuotaAlert) is honored.

## Static-grep acceptance criteria — one PLAN.md regex flagged, runtime contract verified

PLAN.md Task 2 acceptance criterion "Count row format verbatim: `grep -Ec 'Null:.*Raw-CAMEO:.*Ambiguous:.*Low-confidence:'` returns ≥ 1" failed against the as-written JSX because Prettier formatting splits the counter labels across four source lines (each `· Raw-CAMEO:{' '}`, `· Ambiguous:{' '}`, `· Low-confidence:{' '}` wrapping segment lands on its own line). A multi-line-aware perl regex returns 1 match as expected:

```bash
perl -0777 -ne '$c++ while /Null:.*?Raw-CAMEO:.*?Ambiguous:.*?Low-confidence:/gs; print $c' \
  src/components/ui/DevApiStatus.tsx
# => 1
```

The runtime contract (count row textContent contains all four labels with their numeric values) is verified by RTL Test 1, which passed. No code change needed — the JSX shape is byte-equivalent to the planner's reference snippet; the grep was a single-line probe applied to multi-line JSX.

## Verification

- `npx vitest run src/__tests__/components/DevApiStatus.actorQuality.test.tsx` → **6 passed**
- `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` → **9 passed** (no Phase 32 regression)
- `npx vitest run src/__tests__/components/` → **15 passed** (two files, no regressions)
- `npx tsc --noEmit -p tsconfig.app.json` → **clean (exit 0)**
- Pinned data-testids present in DevApiStatus.tsx: `actor-quality-row`, `actor-quality-list`, `actor-quality-row-{eventId}`, `actor-quality-list-truncated`, `actor-quality-empty` — all 5 found
- Zero new color tokens in app.css `@theme` block (no diff to that file)
- Zero buttons / zero `onClick` handlers in the Phase 33 block (scoped awk grep)
- Zero hex/RGBA literals in the Phase 33 block

## Deviations from Plan

None — plan executed exactly as written. The one static-grep mismatch (count-row format regex) is a tooling artifact of single-line grep against multi-line JSX; the runtime contract is verified by RTL Test 1 and the multi-line-aware perl regex returns the expected 1 match. No code adjustment made.

## Known Stubs

None. The sub-block consumes a fully-wired server field (Plan 33-06 ships `actorQuality` on every `/api/operator-status` response, with `null` reserved for the "cache miss / cacheGetSafe failure" degrade-open path). The render gates handle all four states (`null`, `totalEvents === 0`, `sample.length === 0`, populated).

## Threat Flags

None — Phase 33 plan 07 surface introduces no new endpoints / no new auth paths / no new schema. Actor strings are rendered via React (auto-escaped); no `dangerouslySetInnerHTML`; no eval. T-33-07 and T-33-07b in the plan's threat register are mitigated as designed.

## Commits

| Commit  | Type | Message                                                             |
| ------- | ---- | ------------------------------------------------------------------- |
| f765ea8 | test | add failing RTL tests for DevApiStatus actorQuality sub-block (RED) |
| c97c6c9 | feat | render DevApiStatus actorQuality sub-block (D-17) — GREEN           |

## Self-Check: PASSED

- `src/__tests__/components/DevApiStatus.actorQuality.test.tsx` — created (385 lines, 6 it() cases)
- `src/components/ui/DevApiStatus.tsx` — modified (OperatorStatus interface extended + JSX sub-block at L1673-1734)
- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-07-SUMMARY.md` — created
- Commit `f765ea8` (test RED) — in `git log`
- Commit `c97c6c9` (feat GREEN) — in `git log`
- All 6 Phase 33 Plan 07 actorQuality RTL cases pass on the implementation HEAD
- Phase 32 prune tests still pass (9/9, no regression)
- `tsc --noEmit -p tsconfig.app.json` exits clean
- `actorQuality` ident appears 12× in DevApiStatus.tsx (1 interface decl + 11 render usages)
