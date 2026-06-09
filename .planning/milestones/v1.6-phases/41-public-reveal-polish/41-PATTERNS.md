# Phase 41: Public Reveal Polish - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 8 code targets (REVEAL-SITE strand + capture tooling + OG tags)
**Analogs found:** 7 / 8 (1 greenfield: `tourSteps.ts` is a plain data module, no analog needed)

> Scope note: the REVEAL-DOCS strand (BUILDING / SHOWCASE / JOURNEY / concepts / COSTS / operator-guide / LESSONS / brainstorms cross-link) is markdown authoring with no code analogs — see `41-RESEARCH.md` §"REVEAL-DOCS Source-Material Map" for the per-doc input map. This document maps only the **code** surface.

## File Classification

| New/Modified File                                           | Role                                | Data Flow                                            | Closest Analog                                                                                      | Match Quality |
| ----------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| `src/components/reveal/IntroOverlay.tsx` (new)              | component (overlay)                 | event-driven (render-gated on Zustand bool)          | `src/components/ui/DashboardAuthModal.tsx` + `src/components/search/SearchModal.tsx`                | exact         |
| `src/components/reveal/TourTrigger.tsx` (new)               | component (HUD affordance)          | event-driven (button → store action)                 | `src/components/ui/DashboardAuthModal.tsx` (action wiring) + Topbar trigger idiom                   | role-match    |
| `src/components/reveal/GuidedTour.tsx` (new)                | provider/controller (behavior-only) | event-driven (driver.js drive/destroy on store flag) | `CompassControl` (behavior-only null-render mounted in shell) + DashboardAuthModal effect lifecycle | role-match    |
| `src/lib/tourSteps.ts` (new)                                | utility (data module)               | transform (static step list)                         | none — greenfield data array (mirror `ALL_LAYERS` const shape in capture-hero)                      | no-analog     |
| `src/stores/uiStore.ts` (modify)                            | store slice                         | event-driven + localStorage persist                  | `isMarketsCollapsed` / `toggleMarkets` / `collapseMarkets` slice (same file)                        | exact         |
| `src/types/ui.ts` (modify)                                  | type                                | —                                                    | `UIState` interface (same file)                                                                     | exact         |
| `scripts/capture-hero.ts` (modify → `--layers` mode)        | tooling (Playwright)                | file-I/O (headless capture)                          | itself (extend `parseArgs` + `setOnlyLayer` + `waitForMap`)                                         | exact (self)  |
| `index.html` (modify)                                       | config (static HTML head)           | request-response (crawler reads raw HTML)            | none — static, current head lines 3-8                                                               | no-analog     |
| `src/components/layout/AppShell.tsx` (modify — mount point) | shell                               | —                                                    | existing modal mount pattern (lines 102-110)                                                        | exact         |

## Pattern Assignments

### `src/components/reveal/IntroOverlay.tsx` (component, event-driven overlay)

**Analog:** `src/components/ui/DashboardAuthModal.tsx` (closest — render-gate + backdrop + z-modal + two action buttons). `SearchModal.tsx` is the secondary reference for the `data-testid` + backdrop-click idiom.

**Render-gate + backdrop pattern** (`DashboardAuthModal.tsx:57,80-88`):

```tsx
if (!isOpen) return null;            // ← IntroOverlay: `if (introSeen) return null;`

return (
  <div
    data-testid="dashboard-auth-modal"
    className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={(e) => {
      if (e.target === e.currentTarget) close();   // backdrop click closes
    }}
  >
    <form className="w-[360px] rounded-lg border border-border bg-surface-overlay p-5 shadow-xl">
```

**Store-selector + action wiring** (`DashboardAuthModal.tsx:22-25` — `s => s.field` selector convention):

```tsx
const isOpen = useUIStore((s) => s.isDashboardAuthOpen);
const close = useUIStore((s) => s.closeDashboardAuth);
const openDevApiStatus = useUIStore((s) => s.openDevApiStatus);
```

For IntroOverlay:

```tsx
const introSeen = useUIStore((s) => s.isIntroSeen);
const setIntroSeen = useUIStore((s) => s.setIntroSeen);
const openTour = useUIStore((s) => s.openTour);
```

**Two-button footer** (`DashboardAuthModal.tsx:123-139`) — "Start the tour" (`setIntroSeen(true); openTour()`) + "Explore the map" (`setIntroSeen(true)`):

```tsx
<div className="flex justify-end gap-2">
  <button
    type="button"
    onClick={close}
    className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-white/5"
  >
    Cancel
  </button>
  <button
    type="submit"
    className="rounded-md bg-accent-blue/20 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
  >
    Unlock
  </button>
</div>
```

**Caveats:**

- **z-index via CSS-var token, NOT raw number:** use `z-[var(--z-modal)]` (= 40) for the overlay. The scale (`src/styles/app.css:25-30`): `--z-map:0 / --z-overlay:10 / --z-panel:20 / --z-controls:30 / --z-modal:40 / --z-tooltip:50`. The driver.js tour stage should sit at modal/tooltip layer too.
- **Color tokens, never inline hex:** use the existing Tailwind semantic utilities seen in the analogs — `border-border`, `bg-surface-overlay`, `bg-surface-elevated`, `text-text-primary`, `text-text-muted`, `text-accent-blue`, `bg-black/60`. These resolve through the D-13 `@theme` + colorBridge pipeline. Do NOT introduce `bg-[#…]` literals.
- **Add `data-testid`** (e.g. `data-testid="intro-overlay"`) for the Wave-0 RTL test (`IntroOverlay.test.tsx`), mirroring `data-testid="dashboard-auth-modal"`.

---

### `src/components/reveal/TourTrigger.tsx` (component, persistent HUD affordance)

**Analog:** the Topbar trigger idiom (`src/components/layout/Topbar.tsx:175` `data-testid="dev-api-status-trigger"`) for "a persistent button that dispatches a uiStore action"; action wiring mirrors DashboardAuthModal's `openDevApiStatus` selector.

**Pattern:** unconditionally-rendered button (NOT first-visit-gated per D-03), calls `openTour`:

```tsx
const openTour = useUIStore((s) => s.openTour);
return (
  <button
    type="button"
    data-tour-trigger
    data-testid="tour-trigger"
    onClick={openTour}
    className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-white/5"
  >
    Tour
  </button>
);
```

**Caveats:**

- Mount in the Topbar or as a fixed HUD control at `z-[var(--z-controls)]` (30) so it sits above the map but below modals. Respect 40-CONTEXT D-04b: do NOT re-style the existing tab-bar chrome — add a sibling affordance, don't refactor Topbar layout.
- Wave-0 test (`TourTrigger.test.tsx`) asserts it renders regardless of `isIntroSeen` — keep it free of any `if (seen) return null` gate.

---

### `src/components/reveal/GuidedTour.tsx` (provider/controller, behavior-only)

**Analog:** `CompassControl` (behavior-only, renders `null`, mounted in shell — per CLAUDE.md "Map Patterns") for the "mount a controller that has no own DOM" shape; `DashboardAuthModal.tsx:45-55` for the effect-driven lifecycle keyed on an `isOpen` store flag.

**Effect lifecycle keyed on store flag** (`DashboardAuthModal.tsx:45-55`):

```tsx
useEffect(() => {
  if (!isOpen) return;
  const onKey = (e: KeyboardEvent) => {
    /* … */
  };
  window.addEventListener('keydown', onKey, { capture: true });
  return () => window.removeEventListener('keydown', onKey, { capture: true });
}, [isOpen, close]);
```

**driver.js wiring** (from `41-RESEARCH.md` §Pattern 3 — verify install via the checkpoint before importing):

```tsx
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { tourSteps } from '@/lib/tourSteps';

const isTourOpen = useUIStore((s) => s.isTourOpen);
const closeTour = useUIStore((s) => s.closeTour);

useEffect(() => {
  if (!isTourOpen) return;
  const tour = driver({
    showProgress: true,
    steps: tourSteps,
    onDestroyed: () => useUIStore.getState().closeTour(),
  });
  tour.drive();
  return () => tour.destroy();
}, [isTourOpen]);

return null; // behavior-only, like CompassControl
```

**Caveats:**

- **Spotlight DOM HUD chrome only, never in-canvas entities** (RESEARCH Pitfall 1). Deck.gl entities are WebGL pixels in `data-testid="map-container"` (`AppShell.tsx:69`), not DOM nodes. To "point at the map," target the `map-container` div.
- **Add stable `data-tour="…"` attributes** to the 5-7 spotlight targets (StatusDropdown `data-testid="topbar-status"` at `StatusDropdown.tsx:81`, the Layers sidebar button `aria-label="Layers"`, DetailPanelSlot, the API Health tab trigger `data-testid="dev-api-status-trigger"` at `Topbar.tsx:175`). Do not select on volatile Tailwind classes (Pitfall 5).
- **No `localStorage` for tour-open** — `isTourOpen` is session-scoped, mirroring `isDevApiStatusOpen` / `isDashboardAuthOpen` (NOT the `isMarketsCollapsed` persisted branch).

---

### `src/lib/tourSteps.ts` (utility, static data — no analog)

Plain exported array of `{ element: '[data-tour="…"]', popover: { title, description } }`. Shape mirrors the `ALL_LAYERS` const in `capture-hero.ts:61` (a flat exported const driving sequenced UI). Wave-0 test (`tourSteps.test.tsx`) renders AppShell and asserts every `data-tour` selector resolves to a present node.

---

### `src/stores/uiStore.ts` (store slice, localStorage-persisted)

**Analog:** the `isMarketsCollapsed` slice in the **same file** — this is the canonical localStorage-persist idiom and the new intro flag must copy it verbatim.

**`readBool` initializer** (`uiStore.ts:5-12`):

```ts
function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}
```

**Initial state + persisted-write action** (`uiStore.ts:27,99-115` — `toggleMarkets`/`collapseMarkets`):

```ts
isMarketsCollapsed: readBool('markets-collapsed', false),
// …
toggleMarkets: () => {
  const next = !get().isMarketsCollapsed;
  set({ isMarketsCollapsed: next });
  try { localStorage.setItem('markets-collapsed', String(next)); } catch { /* */ }
},
```

**Session-scoped (non-persisted) action idiom** for the tour flag (`uiStore.ts:39-40,61-62`):

```ts
isDashboardAuthOpen: false,
openDashboardAuth: () => set({ isDashboardAuthOpen: true }),
closeDashboardAuth: () => set({ isDashboardAuthOpen: false }),
```

**New members to add** (mirror exactly):

```ts
// initial state (in create<UIState>()((set, get) => ({ … })))
isIntroSeen: readBool('iran-monitor.intro-seen', false),   // ← persisted (markets idiom)
isTourOpen: false,                                          // ← session-scoped (auth-modal idiom)
// actions
setIntroSeen: (seen) => {
  set({ isIntroSeen: seen });
  try { localStorage.setItem('iran-monitor.intro-seen', String(seen)); } catch { /* */ }
},
openTour: () => set({ isTourOpen: true }),
closeTour: () => set({ isTourOpen: false }),
```

**Caveats:** curried `create<UIState>()(…)` pattern is already in place (line 14) — do not change the signature. Wave-0 test `uiStore.reveal.test.ts` asserts `openTour`/`closeTour` toggle `isTourOpen` and that `setIntroSeen` persists.

---

### `src/types/ui.ts` (type — extend `UIState`)

**Analog:** the `UIState` interface in the same file (lines 86-151). Add the 5 new members alongside the existing `isMarketsCollapsed` / `toggleMarkets` / `collapseMarkets` / auth-modal declarations:

```ts
isIntroSeen: boolean;
isTourOpen: boolean;
setIntroSeen: (seen: boolean) => void;
openTour: () => void;
closeTour: () => void;
```

**Caveat:** strict TS — the store object literal must implement every interface member or `create<UIState>()` fails to compile. Add type + store members in the same change.

---

### `scripts/capture-hero.ts` → add `--layers` mode (tooling, self-analog)

**Extend, do not rewrite** (RESEARCH "Don't Hand-Roll"). Every primitive already exists.

**`parseArgs` extension** (`capture-hero.ts:65-72`):

```ts
type Mode = 'full' | 'gif' | 'shots'; // ← add 'layers'
function parseArgs(): Mode {
  const args = process.argv.slice(2);
  if (args.includes('--gif')) return 'gif';
  if (args.includes('--shots')) return 'shots';
  if (args.includes('--layers')) return 'layers'; // ← new
  return 'full';
}
```

**Headless-WebGL launch flags — REQUIRED or the canvas renders zeroed frames** (`capture-hero.ts:259-267`):

```ts
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-accelerated-2d-canvas',
  ],
});
```

**Map-settle wait — reuse verbatim** (`capture-hero.ts:102-132`): `window.__map` exists → `isStyleLoaded()` → 3 s dwell.

**Layer sequencing — reuse `setOnlyLayer`/`openLayersPanel`** (`capture-hero.ts:140-192`). `ALL_LAYERS` const (line 61) — note `Climate` IS the weather layer label:

```ts
const ALL_LAYERS = ['Geographic', 'Climate', 'Political', 'Ethnic', 'Water', 'Threat Density'];
```

**Crisp PNG context** (`capture-hero.ts:401`): `deviceScaleFactor: 2`. Capture via `page.screenshot({ path, fullPage: false })` (line 415).

**Caveats:**

- **Path constants must repoint to `public/screenshots/` (D-06)** — `DOCS_DIR`/`SCREENSHOTS_DIR`/`HERO_GIF` at lines 42-44, plus docstring output paths lines 14-22. Sequence: repoint constants + move files FIRST, then regenerate, then update README/doc links, then `docs:lint`.
- **API-Health shots need dev-open DevApiStatus** (RESEARCH A3/OpenQ1): verify `useShouldRenderDashboard()` (used at `AppShell.tsx:55`) returns true in local dev; if not, `page.addInitScript` a localStorage dashboard-auth key before navigating.
- **Add npm script** `"capture:layers": "tsx scripts/capture-hero.ts --layers"` next to `capture:hero` (`package.json:21`).
- **`ffmpeg`/`gifski` are GIF-only** — the `--layers` PNG path must NOT gate on them in `checkPrereqs` (lines 92-99 currently die if absent). Branch the prereq check by mode.

---

### `index.html` (config, static head — no analog)

Current head is minimal (lines 3-8: charset, favicon, viewport, title). **Insertion point: inside `<head>`, after line 7 (`<title>`).** Add static OG/Twitter/`description` tags with absolute `https://otg-iran-monitor.vercel.app/...` URLs (D-09); `og:image` → `/screenshots/og-card.png` (served path — Vite strips `public/`), 1200×630. Full tag block in `41-RESEARCH.md` §"OG / Twitter / Social-Share Mechanics". Wave-0 test `og-tags.test.ts` reads `index.html` and asserts the tags + absolute URLs + dims.

---

### `src/components/layout/AppShell.tsx` (shell — mount point)

**Analog:** the existing modal mount block (`AppShell.tsx:108-110`):

```tsx
{
  /* Self-closes when not open. */
}
<DashboardAuthModal />;
```

Mount `<IntroOverlay />`, `<GuidedTour />`, and `<TourTrigger />` as siblings inside the root `<div className="relative h-screen w-screen overflow-hidden bg-surface">` (line 63), alongside `<DashboardAuthModal />`. Wrap in `<ErrorBoundary>` only if they read polling state (IntroOverlay/TourTrigger/GuidedTour read only uiStore — ErrorBoundary optional but consistent). Do NOT add a second route or landing component (RESEARCH anti-pattern: D-01 locks the dashboard AS the landing surface).

## Shared Patterns

### Render-gate idiom (all reveal overlay components)

**Source:** `src/components/ui/DashboardAuthModal.tsx:57`, `src/components/search/SearchModal.tsx:255`
**Apply to:** IntroOverlay, GuidedTour

```tsx
if (!isOpen) return null; // mount unconditionally in AppShell; the component self-gates
```

### z-index CSS-var scale (all overlay/tour chrome)

**Source:** `src/styles/app.css:25-30`
**Apply to:** IntroOverlay (`--z-modal`), GuidedTour stage (`--z-modal`/`--z-tooltip`), TourTrigger (`--z-controls`)

```css
--z-map: 0;
--z-overlay: 10;
--z-panel: 20;
--z-controls: 30;
--z-modal: 40;
--z-tooltip: 50;
```

Always `z-[var(--z-modal)]`, never a raw `z-40`.

### Color tokens, not inline hex (CLAUDE.md D-13)

**Source:** semantic Tailwind utilities in `DashboardAuthModal.tsx` / `SearchModal.tsx`
**Apply to:** all reveal chrome
Use `border-border`, `bg-surface-overlay`, `bg-surface-elevated`, `text-text-primary`, `text-text-muted`, `text-accent-blue`, `bg-black/60`. No `bg-[#…]` / RGBA literals — they bypass the colorBridge single-source pipeline.

### Store-selector convention (`s => s.field`)

**Source:** `uiStore.ts` consumers (`DashboardAuthModal.tsx:22-25`)
**Apply to:** every reveal component reading uiStore — one selector per field to minimize re-renders (CLAUDE.md convention).

### Stable selectors for automation (capture + tour)

**Source:** `capture-hero.ts` uses `getByRole('switch', { name: /Toggle … layer/ })`, `aria-label="Layers"`, `data-testid="map-container"`
**Apply to:** GuidedTour `data-tour` attributes + `capture:layers` new shots — prefer `data-testid`/`aria-label`/`role` over Tailwind classes (Pitfalls 1 & 5).

## Screenshot Reference Consolidation (D-06 — every path to update)

Existing references pointing at `docs/` that must repoint to `public/` (repo-relative) or `/screenshots/` (served), per RESEARCH §"Screenshot Consolidation Mechanics":

| File                      | Line(s)          | Current                                                                                                     | New (repo path for README/docs)                                               |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `README.md`               | 5                | `![Hero](docs/hero.gif)`                                                                                    | `public/screenshots/hero.gif` (or `public/hero.gif`)                          |
| `README.md`               | 265-268          | `docs/screenshots/{threat-density,political-layer,ethnic-layer,water-stress}.png`                           | `public/screenshots/…`                                                        |
| `README.md`               | 279-284          | `docs/screenshots/{threat-density,political-layer,ethnic-layer,water-stress,detail-panel,search-modal}.png` | `public/screenshots/…`                                                        |
| `scripts/capture-hero.ts` | 42-44            | `DOCS_DIR`/`SCREENSHOTS_DIR`/`HERO_GIF` → `docs/`                                                           | repoint to `public/screenshots/`                                              |
| `scripts/capture-hero.ts` | 14-22            | docstring output paths                                                                                      | update                                                                        |
| `package.json`            | 38 (`docs:lint`) | lints README + `docs/**` links                                                                              | verify `markdown-link-check` resolves new `public/…` relative paths post-move |

> `og:image` `<meta>` uses the **served** path `/screenshots/og-card.png` (NOT `public/…`) — Vite strips the `public/` prefix at serve time. README/docs use the **repo** path `public/screenshots/…`. Same files, two path forms (RESEARCH Pitfall 2). Existing 6 PNGs in `docs/screenshots/`: `detail-panel.png`, `ethnic-layer.png`, `political-layer.png`, `search-modal.png`, `threat-density.png`, `water-stress.png` + `docs/hero.gif`. No screenshot refs found in `docs/architecture/system-context.md` or `docs/runbook.md` (grep clean) — README is the only doc consumer.

## No Analog Found

| File                   | Role           | Data Flow        | Reason                                                                            |
| ---------------------- | -------------- | ---------------- | --------------------------------------------------------------------------------- |
| `src/lib/tourSteps.ts` | utility (data) | transform        | Plain static array; no existing analog needed (shape mirrors `ALL_LAYERS` const). |
| `index.html` OG tags   | config         | request-response | Static HTML, no React analog; insertion point identified (after line 7).          |

## Metadata

**Analog search scope:** `src/components/{ui,search,layout}/`, `src/stores/`, `src/types/`, `src/styles/`, `scripts/`, `index.html`, `package.json`, `README.md`, `docs/`.
**Files scanned:** uiStore.ts, types/ui.ts, SearchModal.tsx, DashboardAuthModal.tsx, AppShell.tsx, Topbar.tsx, StatusDropdown.tsx, app.css (z-index), capture-hero.ts, index.html, package.json, README.md, system-context.md, runbook.md.
**Pattern extraction date:** 2026-06-05

## PATTERN MAPPING COMPLETE
