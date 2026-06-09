---
phase: 40-dashboard-ui-ux-polish-subtab-consolidation
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/styles/app.css
  - src/lib/colorBridge.ts
  - src/types/ui.ts
  - src/stores/uiStore.ts
  - src/components/ui/DevApiStatus.tsx
  - src/components/ui/BudgetBlock.tsx
  - src/components/ui/FlightRecorderBlock.tsx
  - src/__tests__/lib/colorBridge.test.ts
  - src/__tests__/components/DevApiStatus.actorQuality.test.tsx
  - src/__tests__/components/DevApiStatus.prune.test.tsx
  - src/components/ui/__tests__/BudgetBlock.test.tsx
  - src/components/ui/__tests__/FlightRecorderBlock.test.tsx
  - src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx
  - src/components/ui/__tests__/DevApiStatus.operatorActions.test.tsx
  - src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx
  - src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx
  - src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 40 restructured the `DevApiStatusAllApisTab` operator console into a hero header + 4 collapsible groups + an operator drawer, added WAI-ARIA tablist roving-tabindex keyboard nav, introduced 3 `--color-status-*` tokens through the D-13 colorBridge pipeline, added session-scoped uiStore view-state, and converted BudgetBlock/FlightRecorderBlock to a muted-placeholder degrade pattern. The colorBridge byte-identity contract is correctly extended and the new tokens are byte-identical to the map tokens they shadow. The Zustand selector patterns are correct and the test suite is genuinely adversarial (e.g., FlightRecorderBlock tests exercise previously-dead bands).

No correctness/security blockers were found. However, there is one **clear semantic colour bug** in the tier-summary banner (unhealthy count paired with the wrong status dot), one **accessibility regression** in the new collapsible groups (collapsed bodies hidden via `hidden` attribute keep `aria-expanded` correct but still mount their interactive descendants in some paths), and several robustness/maintainability warnings around the roving-tabindex focus restoration, the drawer Escape handler, and a stale-closure risk in `recentFetchesFor`. Test-pollution risk is mostly handled, but two RTL files leave `useEventStore`/`useFlightStore` seeded across the file with no reset.

No structural findings block was provided.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Tier-summary banner pairs the "unhealthy" count with the wrong (yellow/warning) status dot

**File:** `src/components/ui/DevApiStatus.tsx:1641-1647`
**Issue:** In the tier-summary banner the three status rows are:

- `totalHealthy` → `var(--color-status-healthy)` (green) — correct
- `totalDegraded` → `var(--color-status-degraded)` (orange) — correct
- `totalUnhealthy` → `var(--color-status-warning)` (yellow `#eab308`) — **wrong**

The "unhealthy" count is the most severe state, yet it is rendered with the _warning_ (yellow) dot, while the less-severe "degraded" count gets the _degraded_ (orange) dot. This inverts the visual severity ordering: a yellow dot next to "unhealthy" and an orange dot next to "degraded" reads backwards to an operator scanning for outages. The `--color-status-*` namespace has no `unhealthy`/`red` token at all, so there is no correct token to point at — the namespace is missing a red entry. Test `DevApiStatus.diagnosticBlocks.test.tsx:166-168` only asserts that each of the three vars _appears somewhere_ in the banner, so it does not catch the mis-pairing.

**Fix:** Add a red status token (e.g. `--color-status-unhealthy: #ef4444` or reuse `--color-accent-red`) through the colorBridge D-13 pipeline and point the unhealthy dot at it; or, at minimum, swap so unhealthy is visually more severe than degraded. Then tighten the test to assert the dot adjacent to the "unhealthy" text, not just presence anywhere in the banner.

```tsx
// add to app.css @theme + colorBridge sentinel:
--color-status-unhealthy: #ef4444;
// banner:
<span ... style={{ backgroundColor: 'var(--color-status-unhealthy)' }} />
{totalUnhealthy} unhealthy
```

### WR-02: Roving-tabindex `currentIndex` fallback silently anchors on the FIRST tab, breaking End→ArrowRight wrap and Enter activation when focus is outside the tablist

**File:** `src/components/ui/DevApiStatus.tsx:727-730, 752-759`
**Issue:** `currentIndex` is computed as `Math.max(0, tabs.findIndex(t => t === document.activeElement))`. When `document.activeElement` is not one of the tabs (focus has not yet landed in the tablist, or focus is on the panel), `findIndex` returns `-1` and `Math.max(0, -1)` collapses to `0`. That means:

- A keydown dispatched on the tablist while focus is elsewhere always treats the _first_ tab as current. `ArrowLeft` then moves to the last tab and `ArrowRight` to the second — surprising, but tolerable.
- More importantly, `Enter`/`Space` with focus outside the tablist will activate `tabs[0]` (`apiHealth`) regardless of which tab the operator believes is focused, because the same `-1 → 0` collapse feeds the activation branch (`tabs[currentIndex]`). This is a latent wrong-activation bug if the keydown handler ever fires without a focused tab (e.g. programmatic dispatch, or a browser that focuses the tablist container itself).

**Fix:** Distinguish "no tab focused" from "first tab focused" and bail out of activation in that case:

```tsx
const rawIndex = tabs.findIndex((t) => t === document.activeElement);
// for arrow nav, default to the active tab; for activation, require a real focus
if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && rawIndex < 0) {
  e.preventDefault();
  return;
}
const currentIndex =
  rawIndex < 0 ? tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true') : rawIndex;
```

### WR-03: Tab keyboard activation does not move focus to the newly-activated tab, leaving roving tabindex desynced

**File:** `src/components/ui/DevApiStatus.tsx:752-760`; `src/components/ui/DevApiStatus.tsx:287`
**Issue:** On `Enter`/`Space` the handler calls `setTab(key)` but does not focus the activated tab. Because `tabIndex` is bound to `active` (`tabIndex={active ? 0 : -1}`), after activation the previously-active tab drops to `tabIndex=-1` while DOM focus is still on it. The roving-tabindex invariant (the single `tabIndex=0` element is the focused one) is now violated: focus sits on a `tabIndex=-1` element, and a subsequent natural `Tab` press will behave unexpectedly (browser may jump to the start of the document or skip the tablist). The WAI-ARIA manual-activation pattern requires that activating a tab also keeps focus on it. The tabMerge test (`Enter on the focused tab activates it`) only checks `activeDevApiStatusTab`, not focus, so it passes despite the desync.

**Fix:** After `setTab(key)`, keep focus on the focused element (it is already focused, so re-assert after the re-render) — or simpler, move focus management to follow activation:

```tsx
if (key) {
  setTab(key);
  // keep DOM focus on the now-active tab so roving tabindex stays consistent
  requestAnimationFrame(() => tabs[currentIndex]?.focus());
}
```

### WR-04: Operator-drawer Escape handler only fires when focus is inside the drawer, so Escape from the trigger or hero closes the whole modal instead of the drawer

**File:** `src/components/ui/DevApiStatus.tsx:2118-2130`; capture-phase listener at `src/components/ui/DevApiStatus.tsx:679-689`
**Issue:** The drawer's Escape handling is a React `onKeyDown` on the drawer `<div>` (`:2125`). React key events only bubble from descendants, so Escape is intercepted-and-stopped only while focus is _inside_ the drawer. The modal-level Escape listener is registered on `window` with `{ capture: true }` (`:687`), so it runs in the capture phase _before_ the drawer's bubble-phase React handler ever sees the event. Concretely: if the operator opens the drawer, then moves focus to the drawer-trigger button (which lives in Group 4, outside `#operator-drawer`) and presses Escape, the capture-phase window listener calls `close()` and tears down the entire DevApiStatus modal — the drawer's `stopPropagation` never runs because focus is not inside the drawer subtree. The intended "Escape closes the drawer first" contract only holds for the narrow case where focus is already inside the drawer.

**Fix:** Hoist the drawer-Escape to a capture-phase window listener gated on `isOperatorDrawerOpen`, registered so it runs and `stopImmediatePropagation()`s before the modal listener (or have the single modal listener check `isOperatorDrawerOpen` first and close the drawer instead of the modal):

```tsx
useEffect(() => {
  if (!isOperatorDrawerOpen) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      setOperatorDrawerOpen(false);
    }
  };
  window.addEventListener('keydown', onKey, { capture: true });
  return () => window.removeEventListener('keydown', onKey, { capture: true });
}, [isOperatorDrawerOpen, setOperatorDrawerOpen]);
```

Note: two capture-phase window listeners require deterministic ordering; registering the drawer listener while open and using `stopImmediatePropagation` is the reliable mechanism.

### WR-05: `recentFetchesFor` / `renderSparkline` use a string-switch over store snapshots subscribed by name — Precip vs Water ambiguity and silent default-to-empty

**File:** `src/components/ui/DevApiStatus.tsx:1369-1413`
**Issue:** `renderSparkline(ep.name)` is called with the `/api/health` endpoint name (`ep.name`), but `recentFetchesFor` switches on the _store-row_ names `'Flights' | 'Ships' | … | 'Precip'`. The `/api/health` endpoint names are different identifiers entirely (e.g. `'/api/flights'`, `'events:llm:v3'`, `'/api/water/precip'` — see the tabMerge tests which use `name: '/api/flights'`). For every real `/api/health` endpoint whose `ep.name` does not exactly equal one of the nine switch labels, `recentFetchesFor` falls through to `default: return []` and the sparkline renders 10 empty placeholder dots — i.e. the sparkline is blank for most rows in production, silently. The diagnosticBlocks tests pass only because they fabricate endpoints named exactly `'Flights'`/`'Water'`/etc., which do not match the production `/api/health` naming. This is a real "looks-wired, renders-empty" defect masked by fixtures that use friendly names.

**Fix:** Normalise the endpoint name to the store key before the switch (strip `/api/` prefix, map `events:llm:v3` → events, `/api/water/precip` → Precip), or thread the store key through `groupedRows` so the sparkline lookup is keyed on a stable identifier rather than a display string. At minimum, change the tests to use the production `/api/*` endpoint names so the mismatch is observable.

### WR-06: Two RTL test files seed module-global Zustand stores in `beforeEach` blocks but never reset them, leaking state across tests in the file and to later files in the same worker

**File:** `src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx:204-296`; `src/__tests__/components/DevApiStatus.prune.test.tsx:53-123` (and actorQuality `:52-122`)
**Issue:** The Block 2 `beforeEach` (`diagnosticBlocks.test.tsx:205`) seeds `useEventStore`, `useFlightStore`, and `useWaterStore` with large fixtures but there is no corresponding `afterEach` that resets those stores to defaults — the top-level `afterEach` only does `cleanup()` + `vi.unstubAllGlobals()` + `vi.restoreAllMocks()`. Zustand stores are module singletons shared across the whole vitest worker, so the 142-flight / 23-event / water-filterStats fixtures persist into the Block 3 and Block 4 describe blocks (which re-seed `useFlightStore.recentFetches` but leave `flights`/`events` from Block 2 in place) and into any later test file that runs in the same worker and reads these stores without seeding. The prune/actorQuality files reset stores in `beforeEach` (good) but never restore on teardown, so they leave `connected`/populated state behind for whatever runs next. This is latent test-order-dependence: the suite passes today because of incidental ordering, but is fragile.

**Fix:** Add an `afterEach` (or extend the existing one) that resets each touched store, e.g. `useEventStore.setState({ events: [] }); useFlightStore.setState({ flights: [], recentFetches: [] }); useWaterStore.setState({ filterStats: null });`. Prefer a shared `resetStores()` helper invoked in both `beforeEach` and `afterEach`.

## Info

### IN-01: Dead per-provider color map includes a provider that is documented as dormant; `PROVIDER_COLORS` keys are a frozen literal that will silently fall through for restored providers

**File:** `src/components/ui/DevApiStatus.tsx:2518-2521`
**Issue:** `PROVIDER_COLORS: Record<'nvidia_nim' | 'openrouter', string>` is a closed 2-key literal. Per CLAUDE.md the cascade is GA-4 "provider-keyed map so a restored provider adds a key without breaking the consumer" — but this map will not auto-handle cerebras/groq if they are restored; they will hit no fallback here (the index access is typed to the 2 keys, so a runtime `cerebras` key would be `undefined`). Low impact today (single active provider) but inconsistent with the GA-4 forward-compat intent expressed in `BudgetBlock` (`PROVIDER_LABEL[provider] ?? provider`).
**Fix:** Widen to `Record<string, string>` with a `?? 'text-white/60'` fallback at the callsite, matching the BudgetBlock idiom.

### IN-02: `heroLastRunOk` uses `heroLastRun.error == null` but the LLM "last run" can be a successful run that still carries a non-fatal error string

**File:** `src/components/ui/DevApiStatus.tsx:1491`
**Issue:** The hero "last run" pill renders `ok` vs `failed` purely from `heroLastRun.error == null`. `LLMPipelineSection` (`:183`) treats `lr.error` the same way, so this is consistent, but the binary collapse means a run that completed with a soft warning surfaced into `error` reads as a hard "failed" in the hero. Not a correctness bug given the current `lastRun.error` contract (null on success), but worth noting if `error` ever becomes a warning channel.
**Fix:** None required now; document that `lastRun.error` is strictly fatal-only, or gate the hero on an explicit `outcome` field if one becomes available.

### IN-03: `MutedPlaceholder` and the inline budget/flight-recorder placeholders duplicate the exact same markup string in three places

**File:** `src/components/ui/DevApiStatus.tsx:1014-1020`; `src/components/ui/BudgetBlock.tsx:64-69`; `src/components/ui/FlightRecorderBlock.tsx:243-251`
**Issue:** The canonical muted-placeholder markup (`text-[10px] italic text-white/30` + `— no data (reason)`) is reimplemented inline in BudgetBlock and FlightRecorderBlock rather than importing the `MutedPlaceholder` component defined in DevApiStatus. The D-06 "canonical" copy is asserted by three separate tests via regex, so drift would be caught — but the duplication means the "single canonical placeholder" intent is only enforced by test, not by code reuse.
**Fix:** Export `MutedPlaceholder` from a shared module and consume it in all three sites so the markup has one definition.

### IN-04: `FlightRecorderBlock` per-call timing bar recomputes `Math.max(...selectedCalls.map(...))` inside the `.map` callback — O(n²) over calls

**File:** `src/components/ui/FlightRecorderBlock.tsx:343`
**Issue:** `const maxDur = Math.max(1, ...selectedCalls.map((c) => c.durationMs));` is evaluated once per rendered call row, recomputing the max across all calls for every row. Performance is explicitly out of scope for v1, and call counts are small (cap-20 ring), so this is informational only — flagged because it is trivially hoistable above the `.map`.
**Fix:** Hoist `maxDur` to a `useMemo` (or a `const` before the `.map`) keyed on `selectedCalls`.

### IN-05: Snapshot regression-lock test asserts a 930-line serialized subtree; high churn risk

**File:** `src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx:237-238` (snapshot at `__snapshots__/...snap`, 930 lines)
**Issue:** The consolidated-layout snapshot serializes the entire `all-apis-tab` subtree (930 lines per the diff stat). Any incidental class/markup change anywhere in the 4 groups will churn the snapshot and require regeneration, which trains maintainers to `--update` reflexively (defeating the lock). The determinism work (pinned `Date.now`) is good, but the breadth makes this a brittle lock rather than a targeted one.
**Fix:** Consider narrowing future snapshots to structural attributes (group testids + hidden state + drawer presence) via a custom serializer, or accept the churn cost explicitly. No change required this phase.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
