---
phase: 41-public-reveal-polish
plan: 04
subsystem: docs
tags: [playwright, screenshots, capture-tooling, og-image, readme, markdown-link-check]

# Dependency graph
requires:
  - phase: 41-01
    provides: Wave-0 contract test src/__tests__/capture-layers.contract.test.ts + reveal test infra
  - phase: 41-02
    provides: docs/SHOWCASE.md guided-tour hub referencing ../public/screenshots/hero.gif + README hero link
provides:
  - public/screenshots/ as the single screenshot home (6 relocated PNGs + hero.gif + ~10 live-data PNGs + og-card.png)
  - scripts/capture-hero.ts --layers mode + npm run capture:layers (reproducible ~10-shot regen, REVEAL-DOCS-07)
  - public/screenshots/og-card.png (1200x630) served at /screenshots/og-card.png for Plan 06 og:image wiring
  - README + SHOWCASE image refs repointed to public/screenshots/ + README currency pass (NN-1, #9, #10, #12, #19)
affects: [41-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'capture:layers extends capture-hero.ts in place (mode flag) — no second capture file'
    - 'force-click + idempotent panel-open guard for repeated headless sidebar re-opens'
    - '.markdown-link-check.json ignores localhost so docs:lint is deterministic without a running dev server'

key-files:
  created:
    - public/screenshots/og-card.png
    - public/screenshots/{geographic,climate,political,ethnic,api-health,actor-quality,flight-recorder}.png
    - .markdown-link-check.json
    - .planning/phases/41-public-reveal-polish/deferred-items.md
  modified:
    - scripts/capture-hero.ts
    - package.json
    - README.md

key-decisions:
  - 'og-card.png composed by clipping a 600x315 CSS region at deviceScaleFactor:2 -> exact 1200x630 PNG'
  - 'Live capture ran successfully against the local dev server (Vite :5173 + API :3001) — real-data shots, no fabrication'
  - 'Pre-existing docs/** dead links are out of scope; logged to deferred-items.md, not fixed'

patterns-established:
  - 'Pattern: capture:layers as a --layers mode of capture-hero.ts sharing waitForMap/setOnlyLayer/openLayersPanel'
  - 'Pattern: README repo path (public/screenshots/...) vs served path (/screenshots/...) are distinct for the same file'

requirements-completed: [REVEAL-DOCS-07]

# Metrics
duration: 16min
completed: 2026-06-05
---

# Phase 41 Plan 04: Screenshot Consolidation + capture:layers Tooling + README Pass Summary

**Consolidated all screenshots under `public/screenshots/`, added a reproducible `npm run capture:layers` mode that regenerated ~10 live-data PNGs + a 1200x630 og-card.png against the running dev server, and repointed every README/SHOWCASE image ref while applying the carried README-currency fixes.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-06-05T17:33:00Z
- **Completed:** 2026-06-05T17:46:00Z
- **Tasks:** 3 (Task 2 was a human-verify checkpoint; ran live capture, not halted per end-of-phase mode)
- **Files modified:** 3 modified + 11 created (10 PNGs + config) + 6 relocated

## Accomplishments

- **D-06 consolidation:** `git mv` of the 6 existing PNGs + `hero.gif` from `docs/` to `public/screenshots/`; repointed `capture-hero.ts` path constants (`SCREENSHOTS_DIR`/`HERO_GIF` now under `public/`) and docstring. SHOWCASE's `../public/screenshots/hero.gif` now resolves.
- **capture:layers tooling (REVEAL-DOCS-07):** extended `parseArgs` with a `layers` mode, added a `captureLayers()` function driving the 6 isolated viz layers + API-Health / actor-quality / FlightRecorder feature shots + a clipped 1200x630 og-card.png, branched `checkPrereqs` so the PNG path skips ffmpeg/gifski (GIF-only), and added the `capture:layers` npm script.
- **Live capture succeeded:** started the dev server (Vite :5173 + API :3001), ran `npm run capture:layers` against LIVE data, produced 14 PNGs total (10 enumerated layer/feature shots + the 4 relocated-name layer shots). All non-empty; og-card.png verified at exactly 1200x630; no secrets visible in any API-Health shot (T-41-CAP-01 confirmed).
- **README/SHOWCASE refs + currency:** repointed all README image refs to `public/screenshots/`; applied NN-1 (new "Operator surfaces" section: BudgetBlock/cost-shadow, LLM Flight Recorder, water romanization, Phase 40 consolidation), #9 (satellite "deferred (carried forward)"), #10 ("11 ADRs / 12 architecture files"), #12 ("32 keys"), #19 (v1.5 operator surfaces).
- **Contract GREEN:** `src/__tests__/capture-layers.contract.test.ts` passes (5/5).

## Task Commits

1. **Task 1: Relocate assets + repoint constants + --layers mode + npm script** - `3fcacab` (feat)
2. **Task 2: Live capture ~10 PNGs + og-card.png** - `bd85d61` (feat) — checkpoint task; capture run + script flake fix
3. **Task 3: Repoint README/SHOWCASE refs + README currency pass** - `588b896` (docs)

_Note: Task 2 was a `checkpoint:human-verify` gate. Per `human_verify_mode: end-of-phase`, it was NOT halted — the live capture ran here. See "Human Verification Needed" below for the end-of-phase UAT steps._

## Files Created/Modified

- `scripts/capture-hero.ts` — repointed path constants to `public/screenshots/`, added `--layers` mode + `captureLayers()`, mode-branched `checkPrereqs`, robust `openLayersPanel`/force-click.
- `package.json` — added `capture:layers` script; wired `docs:lint` to `.markdown-link-check.json`.
- `README.md` — image refs -> `public/screenshots/`; currency pass (NN-1, #9, #10, #12, #19).
- `public/screenshots/*.png` + `hero.gif` — 6 relocated + 10 captured + og-card.png.
- `.markdown-link-check.json` — ignore `localhost` patterns (deterministic README gate).
- `.planning/phases/41-public-reveal-polish/deferred-items.md` — pre-existing docs/\*\* dead-link log.

## Decisions Made

- og-card.png produced by clipping a 600x315 CSS region at `deviceScaleFactor:2` for an exact 1200x630 PNG (simplest viable path per CONTEXT discretion).
- Kept both relocated-name PNGs (`political-layer.png`, etc., referenced by README) and the new enumerated `--layers` names (`political.png`, `geographic.png`, etc.) — they coexist cleanly; README points at the relocated set, the contract enumerates the new set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sidebar-icon-strip pointer-intercept flake in reused capture helpers**

- **Found during:** Task 2 (first live capture run)
- **Issue:** On repeated panel re-opens across 6 sequential `setOnlyLayer` calls, the layer toggle was visible+enabled but its click point landed under `sidebar-icon-strip`, which the default Playwright actionability check rejects as an intercept — the run died on the 5th layer toggle.
- **Fix:** `force: true` on the toggle clicks in `setOnlyLayer`/`enableAllLayers`, and made `openLayersPanel` idempotent (probe a toggle's visibility before clicking the toggle-button, with a `waitFor`-based settle + one recovery click).
- **Files modified:** scripts/capture-hero.ts
- **Verification:** Re-ran `npm run capture:layers` end-to-end — all 14 PNGs produced, exit 0.
- **Committed in:** bd85d61 (Task 2 commit)

**2. [Rule 3 - Blocking] docs:lint non-deterministic on localhost links**

- **Found during:** Task 3 (docs:lint gate)
- **Issue:** README's pre-existing `http://localhost:5173` / `:3001` dev-URL references (lines 146-147, untouched by this plan) made `markdown-link-check README.md` fail unless both dev servers were up — a non-deterministic gate that blocked Task 3's required `docs:lint` GREEN.
- **Fix:** Added `.markdown-link-check.json` ignoring `localhost`; wired `docs:lint` to use it. README link-check now passes clean (exit 0) regardless of server state.
- **Files modified:** package.json, .markdown-link-check.json
- **Verification:** `npx markdown-link-check --config .markdown-link-check.json README.md` exits 0 with no dead links.
- **Committed in:** 588b896 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary to complete the plan as written (live capture + docs:lint gate). No scope creep.

## Issues Encountered

- **Out-of-scope docs/** dead links:\*_ with the localhost links ignored, the full `docs:lint` glob surfaced ~12 PRE-EXISTING dead relative-source links in `docs/adr/_`, `docs/runbook.md`, `docs/architecture/ontology/algorithms.md`, `docs/architecture/llm-pipeline-reliability.md`(e.g.`../../server/vercel.ts`Status 400, runbook in-page anchors Status 404). Confirmed present at phase-start commit`4146679`and unrelated to the screenshot move (no failing doc references a moved asset). Per the SCOPE BOUNDARY rule these were NOT fixed — logged to`deferred-items.md`for a dedicated docs-link cleanup pass. The in-scope assertion (README's new`public/screenshots/` refs resolve) passes clean.

## Human Verification Needed

The Task 2 `checkpoint:human-verify` (LIVE capture) ran successfully here, but a human visual confirmation is recommended at end-of-phase UAT:

1. `npm run dev` (Vite reachable at :5173, API at :3001).
2. In a second shell: `npm run capture:layers`.
3. Confirm the ~10 fresh PNGs in `public/screenshots/` render non-empty, settled layers (a quiet-day event/threat shot may be sparse — acceptable per D-04 = re-runnable, not byte-identical).
4. Confirm `public/screenshots/og-card.png` exists and is 1200x630 (`sips -g pixelWidth -g pixelHeight public/screenshots/og-card.png`).
5. Confirm no Bearer/DASHBOARD_PASSWORD value is visible in any API-Health shot (api-health.png / actor-quality.png / flight-recorder.png) — verified during execution; please re-confirm.

The committed shots were captured against live data during this run (api-health.png shows 12/17 endpoints healthy; og-card.png is a branded all-layers Hormuz frame; flight-recorder.png shows the LLM Pipeline / Budget / Operator-Actions groups). No placeholder or fabricated screenshots were committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 06 handoff:** `public/screenshots/og-card.png` exists and is served at **`/screenshots/og-card.png`** (Vite strips the `public/` prefix). Plan 06 wires `<meta property="og:image" content="https://otg-iran-monitor.vercel.app/screenshots/og-card.png" />` (served path, NOT `public/...`).
- capture-layers contract is GREEN; README/SHOWCASE refs resolve; docs:lint README gate is deterministic.

## Self-Check: PASSED

All claimed files exist on disk (scripts/capture-hero.ts, package.json, README.md, public/screenshots/og-card.png, public/screenshots/hero.gif, .markdown-link-check.json, 41-04-SUMMARY.md) and all task commits resolve (3fcacab, bd85d61, 588b896).

---

_Phase: 41-public-reveal-polish_
_Completed: 2026-06-05_
