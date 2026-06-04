# Phase 40: Dashboard UI/UX Polish + Subtab Consolidation - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 7 source files + 6 test files
**Analogs found:** 13 / 13 (all in-codebase; brownfield refactor — every new construct has an established idiom to copy)

> Source of truth for the live DOM is the UI-SPEC §Section Grouping inventory (D-08). This map pairs each new/modified construct with the closest EXISTING idiom in the same codebase, with concrete excerpts + line numbers, so the planner reuses patterns rather than inventing.

---

## File Classification

| New/Modified File                                                         | Role                         | Data Flow                        | Closest Analog                                              | Match Quality   |
| ------------------------------------------------------------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------------------- | --------------- |
| `src/components/ui/DevApiStatus.tsx` (`DevApiStatusAllApisTab` :873–1772) | component (operator console) | request-response (polled render) | self — existing `<section>` blocks + expand-row idiom       | exact (in-file) |
| `src/components/ui/DevApiStatus.tsx` (`TabButton` :258, tablist :708)     | component (a11y tab)         | event-driven (keyboard/click)    | self — existing `role="tab"`/`aria-selected`                | exact (in-file) |
| `src/components/ui/BudgetBlock.tsx`                                       | component                    | transform (render gate)          | `FlightRecorderBlock` degrade gate + own `budget-empty` row | exact           |
| `src/components/ui/FlightRecorderBlock.tsx`                               | component                    | request-response (own fetch)     | `BudgetBlock` empty-row + actor-quality "no data"           | exact           |
| `src/stores/uiStore.ts` (collapse + drawer slice)                         | store (Zustand)              | event-driven                     | `activeDevApiStatusTab` / modal-state slice :37–41          | exact           |
| `src/styles/app.css` `@theme` (3 status tokens)                           | config (CSS tokens)          | n/a                              | `--color-site-healthy` etc. :54–55                          | exact           |
| `src/lib/colorBridge.ts` (3 hex re-exports)                               | utility                      | transform                        | `COLOR_SITE_HEALTHY_HEX` readCssHex :124–125                | exact           |
| `src/__tests__/lib/colorBridge.test.ts` (3 assertions)                    | test                         | n/a                              | site-healthy/attacked hex byte-identity :181–187            | exact           |
| RTL/snapshot test files (6)                                               | test                         | n/a                              | `DevApiStatusAllApisTab.test.tsx` render harness            | exact           |

---

## Pattern Assignments

### `uiStore.ts` — collapse + drawer state (component: store, event-driven)

**Analog:** `src/stores/uiStore.ts` :37–41 (the DevApiStatus modal/tab slice) + the type at `src/types/ui.ts` :106–111.

**Slice idiom to copy** (uiStore.ts :34–41):

```typescript
// session-scoped; no localStorage persistence by design
isDevApiStatusOpen: false,
activeDevApiStatusTab: 'apiHealth',
openDevApiStatus: () => set({ isDevApiStatusOpen: true }),
closeDevApiStatus: () => set({ isDevApiStatusOpen: false }),
setDevApiStatusTab: (tab) => set({ activeDevApiStatusTab: tab }),
```

**Toggle idiom to copy** — the `set((s) => ({ ... }))` functional updater (uiStore.ts :50):

```typescript
toggleStatus: () => set((s) => ({ isStatusCollapsed: !s.isStatusCollapsed })),
```

**What to add (new this phase):**

- State: `devApiGroupCollapsed: Record<string, boolean>` (default `{}` ⇒ all expanded), `isOperatorDrawerOpen: boolean` (default `false`).
- Actions: `toggleDevApiGroup: (slug: string) => set((s) => ({ devApiGroupCollapsed: { ...s.devApiGroupCollapsed, [slug]: !s.devApiGroupCollapsed[slug] } }))` and `toggleOperatorDrawer` / `setOperatorDrawerOpen`.
- Mirror the curried `create<UIState>()(...)` pattern (uiStore.ts :14) — store stays one `create()` call.

**Type additions:** add the 4 new members to `UIState` in `src/types/ui.ts` next to :108–111. SESSION-SCOPED — DO NOT route through `readBool`/`localStorage` (mirrors the modal-state comment at :34–36 and `isDevApiStatusOpen`). NOTE: `isMarketsCollapsed` (:27) DOES persist — do NOT copy that branch; copy the modal branch.

---

### `DevApiStatus.tsx` — collapsible `<section>` group (component, request-response)

**Analog A — existing `<section>` block idiom** (the LLMPipelineSection wrapper, :1543–1550):

```tsx
<section className="mt-2 border-t border-white/10 pt-2" data-testid="llm-pipeline-section">
  <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">LLM Pipeline</span>
  <div className="mt-0.5 text-[9px]">
    <LLMPipelineSection llmStatus={llmStatus} />
  </div>
</section>
```

Carry forward: `<section>` + `border-t border-white/10 pt-2` divider + `data-testid` + an uppercase-tracking-wider header. CHANGE per UI-SPEC Typography: header goes `text-[9px] font-bold` → `text-[11px] font-semibold` (group-header role); `mt-2`→`mt-4` for inter-group break.

**Analog B — existing expand/collapse toggle** (per-endpoint expanded row, :1490–1531). The codebase's collapse idiom is conditional render gated by a Set membership flag:

```tsx
{isExpanded && (
  <tr>
    <td colSpan={7} ... data-testid={`expanded-row-${ep.name}`}>
      {renderQualityBlock(ep.name)}
      ...
    </td>
  </tr>
)}
```

Replicate the conditional-body pattern, but drive it from `devApiGroupCollapsed[slug]` (uiStore) instead of a local `expandedRows` Set, and use the UI-SPEC group-header `<button aria-expanded aria-controls>` + chevron (`▸`/`▾`) instead of a row click. Body uses `hidden={collapsed}` per UI-SPEC Collapsible Group Contract.

**What's new:** the clickable group-header `<button>` with `aria-expanded`/`aria-controls`, the rotating chevron SVG, and the `uiStore`-backed (not local-Set) collapse state.

---

### `DevApiStatus.tsx` — drawer / slide-out (component, event-driven)

**Analog — `animate-slide-in-right` keyframe usage** (`src/components/layout/DetailPanelSlot.tsx` :159–168; keyframe defined `src/styles/app.css` :140–164):

```tsx
<div
  className={`p-4 ${
    slideDirection === 'forward' ? 'animate-slide-in-right'
    : slideDirection === 'back' ? 'animate-slide-in-left' : ''
  }`}
>
```

The keyframe `.animate-slide-in-right` (app.css :162, `150ms cubic-bezier`) is the established slide-out animation. The 360px detail panel (`--width-detail-panel`, app.css :33) is the established right-anchored panel width.

**What's new:** `<div id="operator-drawer" role="region" aria-label="Operator controls">` gated by `isOperatorDrawerOpen` (uiStore). Membership EXACT per UI-SPEC: only `replay-test-trigger` (:1617–1626) + `prune-dead-urls-trigger` button (:1666–1677) move IN; their read-only counters STAY in Group 4. Scoped-Escape handler must `stopPropagation` so it does NOT hit the modal's capture-phase Escape (DevApiStatus header comment :322–323).

---

### `DevApiStatus.tsx` — `TabButton` + tablist a11y (component, event-driven)

**Analog — existing `TabButton`** (:258–285) already has `role="tab"` + `aria-selected`:

```tsx
<button
  role="tab"
  aria-selected={active}
  data-testid={testid}
  onClick={onClick}
  className={`flex items-center gap-1 rounded-md px-3 py-1 text-[10px] font-medium transition-colors ${
    active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
  }`}
>
```

The tablist wrapper already exists (:708 `<div className="flex items-center gap-1" role="tablist">`).

**What's new (additive only — D-04b chrome-restyle lockdown):**

- Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 ...` to the existing className (do NOT change `px-3 py-1`, `rounded-md`, colors).
- Add active-tab 2px indicator (`border-b-2 border-accent-blue` or `after:`).
- Add `tabIndex={active ? 0 : -1}` (roving) + an `onKeyDown` handler at the tablist for ArrowLeft/Right/Home/End/Enter/Space per UI-SPEC bindings table.
- Add `role="tabpanel"` + `aria-labelledby` to the panel containers at :780–790 (currently missing).

---

### `BudgetBlock.tsx` + `FlightRecorderBlock.tsx` — degrade-open → muted placeholder (component, transform)

**Current self-hide gates to CHANGE (D-06):**

- `BudgetBlock.tsx` :60–62:

```tsx
export function BudgetBlock({ tokenBudget }: { tokenBudget: TokenBudgetBlock | null }) {
  // Degrade-open render gate — mirrors `opStatus?.actorQuality != null` (:1681).
  if (tokenBudget == null) return null;
```

- `BudgetBlock.tsx` :73 existing empty-row (re-tone to muted placeholder):

```tsx
<div className="mt-1 text-[10px] text-white/30" data-testid="budget-empty">
  No provider budget data yet
</div>
```

- `FlightRecorderBlock.tsx` :240–241:

```tsx
// Degrade-open: no data → block hides entirely
if (data == null) return null;
```

- Actor-quality "no data" row (DevApiStatus :1738–1742) — already close to target; UNIFY onto the canonical markup:

```tsx
<div className="mt-1 text-text-muted italic" data-testid="actor-quality-empty">
  Actor quality: no data
</div>
```

**Canonical muted-placeholder markup to converge on (UI-SPEC §Degraded-State):**

```tsx
<div className="text-[10px] text-white/30 italic" data-testid="{block}-placeholder">
  — no data ({reason})
</div>
```

Replicate: `return null` → render the placeholder; preserve degrade-open semantics (no throw, route stays 200). The GROUP shell always renders around it. NOTE `text-white/30` (dimmer than `text-white/40` label) + `italic` is the contract. The existing `budget-empty` already uses `text-white/30` — only the COPY changes to `— no data (...)`.

---

### `app.css @theme` + `colorBridge.ts` — 3 new status tokens (config + utility, transform)

**Full D-13 routing chain to replicate** (the site-healthy token is the exact template since the new hex is byte-identical):

**1. Declaration** (`app.css` @theme, alongside :54–55):

```css
--color-site-healthy: #22c55e;
--color-site-attacked: #f97316;
```

Add: `--color-status-healthy: #22c55e;` `--color-status-degraded: #f97316;` `--color-status-warning: #eab308;` (hex NOT OKLCH — comment at :38–43 explains why: the colorBridge hex parser roundtrips).

**2. Hex re-export** (`colorBridge.ts` :124–125):

```typescript
export const COLOR_SITE_HEALTHY_HEX = readCssHex('--color-site-healthy', '#22c55e');
export const COLOR_SITE_ATTACKED_HEX = readCssHex('--color-site-attacked', '#f97316');
```

Add 3 `readCssHex` hex re-exports: `COLOR_STATUS_HEALTHY_HEX` (`'#22c55e'`), `COLOR_STATUS_DEGRADED_HEX` (`'#f97316'`), `COLOR_STATUS_WARNING_HEX` (`'#eab308'`). **HEX ONLY — NO `readCssRGB` tuple** (no deck.gl consumer; UI-SPEC migration note).

**3. Byte-identity sentinel** (`colorBridge.test.ts` :181–187 idiom for hex):

```typescript
it('site healthy hex matches ENTITY_DOT_COLORS.siteHealthy', () => {
  expect(bridge.COLOR_SITE_HEALTHY_HEX).toBe(ENTITY_DOT_COLORS.siteHealthy);
});
```

Add 3 assertions. Since there is no entity-map counterpart for status tokens, assert against the literal expected hex (matches the `faction disputed hex is #f59e0b` literal-assertion precedent at :201–206):

```typescript
it('status healthy hex is #22c55e', () => {
  expect(bridge.COLOR_STATUS_HEALTHY_HEX).toBe('#22c55e');
});
```

Also add to the `hexExports` shape array (:67–92) so the `/^#[0-9a-f]{6}$/i` shape test covers them.

**Migration (zero-visual-change rename):** sparkline (:1204 `var(--color-site-healthy)` / `var(--color-event-airstrike)`) and tier-summary banner dots (:1314, :1322, :1330) flip token NAME only to `var(--color-status-healthy/degraded/warning)`. Byte-identical hex ⇒ no runtime visual change.

---

### RTL / snapshot tests (test)

**Analog — `DevApiStatusAllApisTab.test.tsx`** (render harness :30–77). Copy:

- `makeEndpoint` / `makeResponse` fixture builders (:30–56).
- The `renderModalWithHealth` harness: drives state via `useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' })` (:67–70) and wraps in `HealthStatusContext.Provider` (:72–76).
- `beforeEach` localStorage stub + store reset (:80–90).
- Imports: `render, screen, fireEvent, cleanup` from `@testing-library/react`; `vi, beforeEach, afterEach`.

**OperatorStatus mock shape:** the operator-actions blocks read `opStatus` (`tokenBudget`, `prune.deadUrlCount`/`deadUrlSample`, `actorQuality`, `byBearer`, `audit24h`, `advEval`). New tests must inject this; check how `DevApiStatus.actorQuality.test.tsx` / `.prune.test.tsx` already mock `/api/operator-status` and reuse that mock builder.

**New assertions to code (UI-SPEC §Regression-Lock 1–8):** all 4 `group-*` testids present under all-null data; muted-placeholder (`text-white/30 italic`, `— no data (...)`) per null group; hero 4 fields w/ independent fallbacks; default all-expanded; drawer default-closed (replay/prune buttons absent until open, read-only counts present); roving keyboard nav + active indicator; colorBridge byte-identity (in colorBridge.test.ts); ONE fully-populated consolidated-layout snapshot of `DevApiStatusAllApisTab`.

---

## Shared Patterns

### Session-scoped Zustand state (no persistence)

**Source:** `uiStore.ts` :34–41 (modal/tab slice). **Apply to:** collapse + drawer state. Curried `create<UIState>()()`, `set((s) => ({...}))` updater, no `localStorage`.

### Degrade-open → muted placeholder

**Source:** canonical markup `text-[10px] text-white/30 italic` + copy `— no data ({reason})`. **Apply to:** BudgetBlock, FlightRecorderBlock, actor-quality, group-level operator-status-null fallback. Preserves no-throw/200 contract; changes only the empty render.

### D-13 color single-source routing

**Source:** `--color-site-healthy` chain (app.css :54 → colorBridge :124 → test :181). **Apply to:** all 3 new `--color-status-*` tokens. Hex-only re-exports (no RGBA tuple), shape test + byte-identity assertion both extended.

### Accent + neutral-only operator-console palette

**Source:** `BudgetBlock.tsx` :19–22 color-discipline comment + `BAND_FILL_CLASS` (:54). **Apply to:** all new hero/group/drawer chrome — only `accent-{blue,red,green,yellow}` + `white/N` + the 3 new `status-*` tokens. No entity `--color-*` tokens, no inline hex.

### Spacing = multiples of 4

**Source:** existing `mt-2`/`pt-2`/`px-3 py-1` throughout DevApiStatus; UI-SPEC §Spacing. **Apply to:** every new structural element (`xs`/`sm`/`lg`/`xl` = 4/8/16/24). Grandfathered exception: `py-0.5` (2px) drill-down micro-rows at :1648, :1717 stay verbatim; no NEW 2px/6px.

### `data-testid` on every block

**Source:** universal in DevApiStatus (`tier-summary-banner`, `expanded-row-{name}`, `budget-block`, etc.). **Apply to:** every new group/hero/drawer/placeholder — the regression-lock tests depend on the testids enumerated in UI-SPEC §Section Grouping.

---

## No Analog Found

None. Every Phase 40 construct has an in-codebase idiom (collapsible body = expand-row gate; drawer = `animate-slide-in-right`; status tokens = site-healthy chain; tab a11y = existing `TabButton`; muted placeholder = budget-empty row). This is a pure brownfield restructure.

---

## Metadata

**Analog search scope:** `src/components/ui/DevApiStatus.tsx`, `src/components/ui/BudgetBlock.tsx`, `src/components/ui/FlightRecorderBlock.tsx`, `src/stores/uiStore.ts`, `src/types/ui.ts`, `src/lib/colorBridge.ts`, `src/styles/app.css`, `src/components/layout/DetailPanelSlot.tsx`, `src/__tests__/lib/colorBridge.test.ts`, `src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx`
**Pattern extraction date:** 2026-06-04
</content>
</invoke>
