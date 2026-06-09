---
phase: 41
slug: public-reveal-polish
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
validated: 2026-06-05
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `41-RESEARCH.md` § Validation Architecture. Task IDs bound at plan time; statuses reconciled against the executed phase on 2026-06-05.

---

## Test Infrastructure

| Property               | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.x + jsdom (frontend) / node (server) `[VERIFIED: package.json]`                      |
| **Config file**        | `vite.config.ts` (test block; map libs mocked via `test.alias`)                               |
| **Quick run command**  | `npx vitest run src/__tests__/components/reveal/ src/__tests__/stores/uiStore.reveal.test.ts` |
| **Full suite command** | `npx vitest run`                                                                              |
| **Estimated runtime**  | ~3s (quick reveal subset, measured) · full suite project-dependent (~1–2 min)                 |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/components/reveal/ src/__tests__/stores/uiStore.reveal.test.ts` + `npm run docs:lint`
- **After every plan wave:** Run `npx vitest run` (full suite) + `npm run typecheck` + `npm run lint`
- **Before `/gsd-verify-work`:** Full suite green + `docs:lint` green + manual OG-validator pass + manual tour walkthrough
- **Max feedback latency:** ~3 seconds (quick reveal subset, measured)

---

## Per-Task Verification Map

> Plan numbers bind the Wave-0 contracts (authored in Plan 41-01) to the implementing plans (41-04 capture, 41-06 REVEAL-SITE). Statuses reconciled 2026-06-05: all 7 Wave-0 contract files present and green (`npx vitest run` → 7 files / 32 tests PASS, 2.83s).

| Task ID  | Plan        | Wave | Requirement          | Threat Ref | Secure Behavior                                                                              | Test Type              | Automated Command                                                      | File Exists | Status   |
| -------- | ----------- | ---- | -------------------- | ---------- | -------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ----------- | -------- |
| 41-06 T3 | 41-06       | 3    | REVEAL-SITE-01       | —          | Intro overlay renders on first visit; hidden when `isIntroSeen` true                         | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/IntroOverlay.test.tsx` | ✅ exists   | ✅ green |
| 41-06 T2 | 41-06       | 3    | REVEAL-SITE-01       | —          | Dismissal writes `iran-monitor.intro-seen=true` to localStorage; survives store re-init      | unit (store)           | `npx vitest run src/__tests__/stores/uiStore.reveal.test.ts`           | ✅ exists   | ✅ green |
| 41-06 T2 | 41-06       | 3    | REVEAL-SITE-02       | —          | `openTour`/`closeTour` toggle `isTourOpen`; tour re-openable after dismissal                 | unit (store)           | `npx vitest run src/__tests__/stores/uiStore.reveal.test.ts`           | ✅ exists   | ✅ green |
| 41-06 T3 | 41-06       | 3    | REVEAL-SITE-02       | —          | TourTrigger affordance always rendered (D-03, not first-visit-gated)                         | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/TourTrigger.test.tsx`  | ✅ exists   | ✅ green |
| 41-06 T3 | 41-06       | 3    | REVEAL-SITE-02       | —          | Tour steps reference only `data-tour` selectors present in the rendered shell                | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/tourSteps.test.tsx`    | ✅ exists   | ✅ green |
| 41-06 T3 | 41-06       | 3    | REVEAL-SITE-03       | T-XSS      | `index.html` contains required OG/Twitter tags with absolute vercel.app URLs + 1200×630 dims | unit (read index.html) | `npx vitest run src/__tests__/og-tags.test.ts`                         | ✅ exists   | ✅ green |
| 41-04 T2 | 41-04       | 3    | REVEAL-DOCS-07       | —          | `capture:layers` exports expected output filenames / target selectors non-empty              | unit (contract)        | `npx vitest run src/__tests__/capture-layers.contract.test.ts`         | ✅ exists   | ✅ green |
| 41-01 T3 | 41-02/03/05 | 1–3  | REVEAL-DOCS-02..09   | —          | New docs exist at expected paths (`docs/SHOWCASE.md`, etc.)                                  | unit/script            | `npx vitest run src/__tests__/docs-exist.test.ts`                      | ✅ exists   | ✅ green |
| 41-01 T3 | 41-02/03/05 | 1–3  | REVEAL-DOCS-06/08/09 | —          | Doc cross-links resolve (no dead links)                                                      | lint                   | `npm run docs:lint`                                                    | ✅ exists   | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

> All Wave-0 contract stubs were authored RED in Plan 41-01 and driven GREEN by Plans 41-04 (capture contract) and 41-06 (REVEAL-SITE store + overlays). Confirmed green 2026-06-05.

- [x] `src/__tests__/components/reveal/IntroOverlay.test.tsx` — REVEAL-SITE-01
- [x] `src/__tests__/components/reveal/TourTrigger.test.tsx` — REVEAL-SITE-02
- [x] `src/__tests__/components/reveal/tourSteps.test.tsx` — REVEAL-SITE-02 (selector existence)
- [x] `src/__tests__/stores/uiStore.reveal.test.ts` — REVEAL-SITE-01/02 store slice
- [x] `src/__tests__/og-tags.test.ts` — REVEAL-SITE-03 static-tag assertions
- [x] `src/__tests__/capture-layers.contract.test.ts` — REVEAL-DOCS-07 contract
- [x] `src/__tests__/docs-exist.test.ts` — REVEAL-DOCS doc-path existence
- [x] Framework install: **none** — Vitest + RTL already present.

---

## Manual-Only Verifications

> Reconciled 2026-06-05 with the `41-VERIFICATION.md` human-verification harvest and `41-UAT.md`. Each item has a documented reason it cannot run in jsdom/CI; they are acknowledged carve-outs, not coverage gaps.

| Behavior                                                    | Requirement            | Why Manual                                                                                                                      | Test Instructions                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Intro overlay first-visit render + cross-reload persistence | REVEAL-SITE-01         | jsdom's localStorage is reset per test; cross-hard-reload persistence + first-visit render-gate need a real browser profile     | `npm run dev`. In a fresh profile, clear `iran-monitor.intro-seen`; confirm IntroOverlay appears on first load; "Explore the map" dismisses + persists across reload; "Start the tour" dismisses AND opens the tour; Escape also dismisses       |
| driver.js spotlight lands on each tour target               | REVEAL-SITE-02         | jsdom has no layout/bounding boxes — spotlight geometry is not unit-testable (`tourSteps.test.tsx` asserts node existence only) | Open the tour via the persistent Topbar affordance; step through; confirm the spotlight highlights each intended HUD node (StatusDropdown → layers panel → map-container → DetailPanelSlot → API Health), never the WebGL canvas / a flight icon |
| OG/Twitter card preview renders                             | REVEAL-SITE-03         | Crawler-side rendering of a deployed URL, not in-repo                                                                           | Validate the vercel.app URL via LinkedIn Post Inspector + Twitter/X Card Validator; confirm `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` resolves and renders at 1200×630                                                       |
| `capture:layers` produces the ~10 live-data PNGs            | REVEAL-DOCS-07         | Live-data WebGL capture; "reproducible" = re-runnable not byte-identical (D-04)                                                 | Run `npm run capture:layers`; eyeball the ~10 PNGs in `public/screenshots/` for non-empty, settled layers                                                                                                                                        |
| D-02 read-only API-Health surface exposes no secrets        | REVEAL-SITE (security) | Secret-exposure inspection requires human visual review of the rendered dashboard                                               | Visit `/api/operator-status` + the API Health tab; confirm no Bearer/token/key leaks in the read-only view, and that write paths (replay / prune / force-trigger) still demand a Bearer                                                          |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — all automatable contracts green)
- [x] No watch-mode flags
- [x] Feedback latency < 10s (measured ~3s for the quick reveal subset)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-05 — automatable surface fully covered (7 files / 32 tests green); 5 documented manual-only carve-outs.

---

## Validation Audit 2026-06-05

| Metric                    | Count                                     |
| ------------------------- | ----------------------------------------- |
| Requirements audited      | 14                                        |
| Automatable — COVERED     | 9 contract rows / 7 test files (32 tests) |
| MISSING gaps              | 0                                         |
| Resolved (auditor-filled) | 0 (no gaps to fill)                       |
| Manual-only carve-outs    | 5                                         |

**Method:** State A re-audit of a completed phase. Independently re-ran all 7 Wave-0 contract files (`npx vitest run` → 7 files / 32 tests PASS, 2.83s); confirmed each test file exists on disk and the `docs:lint` script is wired in `package.json`. No auditor subagent spawned — there were no MISSING/PARTIAL gaps to fill. Updated stale plan-time statuses (`draft` → `complete`, all `⬜ pending` → `✅ green`, bound TBD task IDs to implementing plans) and reconciled the Manual-Only section with the `41-VERIFICATION.md` human-verify harvest (added the intro-persistence and D-02 read-only-API-Health items).
