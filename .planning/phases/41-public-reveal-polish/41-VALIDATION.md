---
phase: 41
slug: public-reveal-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `41-RESEARCH.md` § Validation Architecture. Task IDs bind at plan time.

---

## Test Infrastructure

| Property               | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.x + jsdom (frontend) / node (server) `[VERIFIED: package.json]`                      |
| **Config file**        | `vite.config.ts` (test block; map libs mocked via `test.alias`)                               |
| **Quick run command**  | `npx vitest run src/__tests__/components/reveal/ src/__tests__/stores/uiStore.reveal.test.ts` |
| **Full suite command** | `npx vitest run`                                                                              |
| **Estimated runtime**  | ~5s (quick reveal subset) · full suite project-dependent (~1–2 min)                           |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/components/reveal/ src/__tests__/stores/uiStore.reveal.test.ts` + `npm run docs:lint`
- **After every plan wave:** Run `npx vitest run` (full suite) + `npm run typecheck` + `npm run lint`
- **Before `/gsd-verify-work`:** Full suite green + `docs:lint` green + manual OG-validator pass + manual tour walkthrough
- **Max feedback latency:** ~10 seconds (quick reveal subset)

---

## Per-Task Verification Map

> Task IDs / Plan numbers bind when plans are written; Wave + Requirement + Command are pinned by research.

| Task ID | Plan | Wave | Requirement          | Threat Ref | Secure Behavior                                                                              | Test Type              | Automated Command                                                      | File Exists | Status     |
| ------- | ---- | ---- | -------------------- | ---------- | -------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ----------- | ---------- |
| TBD     | TBD  | 3    | REVEAL-SITE-01       | —          | Intro overlay renders on first visit; hidden when `isIntroSeen` true                         | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/IntroOverlay.test.tsx` | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-SITE-01       | —          | Dismissal writes `iran-monitor.intro-seen=true` to localStorage; persists across re-mount    | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/IntroOverlay.test.tsx` | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-SITE-02       | —          | `openTour`/`closeTour` toggle `isTourOpen`; tour re-openable after dismissal                 | unit (store)           | `npx vitest run src/__tests__/stores/uiStore.reveal.test.ts`           | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-SITE-02       | —          | TourTrigger affordance always rendered (not first-visit-gated)                               | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/TourTrigger.test.tsx`  | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-SITE-02       | —          | Tour steps reference only `data-tour` selectors present in the rendered shell                | unit (RTL)             | `npx vitest run src/__tests__/components/reveal/tourSteps.test.tsx`    | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-SITE-03       | T-XSS      | `index.html` contains required OG/Twitter tags with absolute vercel.app URLs + 1200×630 dims | unit (read index.html) | `npx vitest run src/__tests__/og-tags.test.ts`                         | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 3    | REVEAL-DOCS-07       | —          | `capture:layers` exports expected output filenames / target selectors non-empty              | unit (contract)        | `npx vitest run src/__tests__/capture-layers.contract.test.ts`         | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 1–3  | REVEAL-DOCS-02..09   | —          | New docs exist at expected paths (`docs/SHOWCASE.md`, etc.)                                  | unit/script            | `npx vitest run src/__tests__/docs-exist.test.ts`                      | ❌ W0       | ⬜ pending |
| TBD     | TBD  | 1–3  | REVEAL-DOCS-06/08/09 | —          | Doc cross-links resolve (no dead links)                                                      | lint                   | `npm run docs:lint`                                                    | ✅ exists   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/__tests__/components/reveal/IntroOverlay.test.tsx` — REVEAL-SITE-01
- [ ] `src/__tests__/components/reveal/TourTrigger.test.tsx` — REVEAL-SITE-02
- [ ] `src/__tests__/components/reveal/tourSteps.test.tsx` — REVEAL-SITE-02 (selector existence)
- [ ] `src/__tests__/stores/uiStore.reveal.test.ts` — REVEAL-SITE-01/02 store slice
- [ ] `src/__tests__/og-tags.test.ts` — REVEAL-SITE-03 static-tag assertions
- [ ] `src/__tests__/capture-layers.contract.test.ts` — REVEAL-DOCS-07 contract
- [ ] `src/__tests__/docs-exist.test.ts` — REVEAL-DOCS doc-path existence (optional)
- [ ] Framework install: **none** — Vitest + RTL already present.

---

## Manual-Only Verifications

| Behavior                                        | Requirement    | Why Manual                                                                      | Test Instructions                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| driver.js spotlight lands on each tour target   | REVEAL-SITE-02 | jsdom has no layout/bounding boxes — spotlight geometry is not unit-testable    | Run dev server, open the tour via the persistent Tour affordance, step through; confirm the spotlight highlights each intended HUD node (StatusDropdown → layer toggles → DetailPanelSlot → threat-density legend → API Health) |
| OG/Twitter card preview renders                 | REVEAL-SITE-03 | Crawler-side rendering, not in-repo                                             | Validate the vercel.app URL via LinkedIn Post Inspector + Twitter/X Card Validator + a direct share preview; confirm 1200×630 `og-card.png` resolves and renders                                                                |
| `capture:layers` produces the 10 live-data PNGs | REVEAL-DOCS-07 | Live-data WebGL capture; "reproducible" = re-runnable not byte-identical (D-04) | Run `npm run capture:layers`; eyeball the ~10 PNGs in `public/screenshots/` for non-empty, settled layers                                                                                                                       |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
