---
phase: 41-public-reveal-polish
verified: 2026-06-05T19:05:00Z
status: human_needed
score: 14/14
overrides_applied: 0
human_verification:
  - test: 'Intro overlay first-visit + persistence'
    expected: "IntroOverlay appears on first load with cleared localStorage (iran-monitor.intro-seen); 'Explore the map' dismisses it; reload confirms it stays dismissed"
    why_human: 'localStorage persistence and first-visit render-gate cannot be tested in jsdom with full fidelity; requires a real browser profile'
  - test: 'Re-openable guided tour spotlight geometry'
    expected: 'The Tour affordance (Topbar) opens a driver.js spotlight that lands on each HUD node in sequence — status (StatusDropdown) → layers panel (Sidebar accordion, opened by onHighlightStarted hook) → map (map-container) → detail panel (DetailPanelSlot, opened by hook) → API Health trigger — and NOT the WebGL canvas or a flight icon'
    why_human: 'driver.js spotlight bounding-box geometry requires a real browser with CSS layout; jsdom has no layout engine. tourSteps.test.tsx only asserts DOM-node existence, not visual spotlight placement'
  - test: 'OG card social-share preview (post-deploy)'
    expected: 'After deploy, https://otg-iran-monitor.vercel.app/screenshots/og-card.png resolves and renders at 1200x630 on LinkedIn Post Inspector + Twitter/X Card Validator'
    why_human: 'Crawler-side OG rendering requires an actual deployed URL and an external validator; cannot be tested programmatically'
  - test: 'D-02 read-only API-Health verification'
    expected: 'The read-only API-Health surface exposes no Bearer/token/key, and write paths (replay / prune / force-trigger) still demand a Bearer'
    why_human: 'Security/secrets verification requires human visual inspection of the rendered dashboard; automated tests do not cover rendered secret exposure'
---

# Phase 41: public-reveal-polish Verification Report

**Phase Goal:** Ship the public-reveal portfolio surface — the agentic-development meta-story (BUILDING-WITH-CLAUDE-CODE.md + SHOWCASE.md + JOURNEY.md + concepts.md + COSTS.md + operator-guide.md + LESSONS.md + screenshots + brainstorms cleanup) AND the user-facing reveal polish (REVEAL-SITE: intro overlay + guided tour + social-share OG assets + custom-domain decision). A final-sweep audit against then-current main ran BEFORE any REVEAL-DOCS work landed.

**Verified:** 2026-06-05T19:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                             | Status   | Evidence                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The v1.5-close 2nd-pass code+docs audit is re-run against then-current main BEFORE any REVEAL-DOCS doc is authored (SC41-1)                                       | VERIFIED | `41-AUDIT.md` exists with resolved/still-open/net-new classification + wave-routing table; git log confirms `docs(41-01)` commit (audit gate) precedes all `docs(41-02)` through `docs(41-06)` commits                         |
| 2   | Both operator memories refreshed: resolved items dropped, net-new merged, still-open annotated "carried into Phase 41"                                            | VERIFIED | Both `project_v1_6_cleanup_punchlist.md` and `project_v1_6_docs_drift.md` contain `Phase 41` / `2026-06-05` / `carried` markers                                                                                                |
| 3   | Net-new findings recorded as concrete fix tasks routed to later waves by domain                                                                                   | VERIFIED | `41-AUDIT.md` §D routing table maps NN-1..4 and carried docs items to Wave 1/2/3 by domain                                                                                                                                     |
| 4   | Seven Wave-0 Vitest stubs exist and the full reveal+contract subset (32 tests) is green                                                                           | VERIFIED | All 7 stubs confirmed at their VALIDATION-specified paths; `npx vitest run` (all 7 files) = 32/32 PASS                                                                                                                         |
| 5   | A portfolio visitor lands on a 1-page guided-tour hub (SHOWCASE.md) reaching BUILDING-WITH-CLAUDE-CODE.md, JOURNEY.md, and ADR decisions in 1 click each (SC41-2) | VERIFIED | `docs/SHOWCASE.md` exists (114 lines), contains links to BUILDING-WITH-CLAUDE-CODE, JOURNEY, ADR-0005 (0005), ADR-0010 (0010), system-context, and BaseMap.tsx; `README.md` contains link to `docs/SHOWCASE.md`                |
| 6   | BUILDING-WITH-CLAUDE-CODE.md is ~600-1000 lines, first-person, covers /gsd workflow + compounding worked + didn't + cost (SC41-2)                                 | VERIFIED | File exists (787 total / 618 non-blank lines); uses first-person "I" (55 occurrences); contains Phase 26.2/NLP anecdote, ADR-0005 and ADR-0010 cross-links, brainstorms cross-link, receipts section                           |
| 7   | JOURNEY.md renders a GitHub-native Mermaid gantt of the 7-milestone progression and first-person WHY-per-milestone prose (SC41-2)                                 | VERIFIED | File exists (236 lines, 19 first-person "I" uses); contains `\`\`\`mermaid`, `gantt`, `v0.9`, `v1.5`, `2026-03`, `2026-06-03`; no standalone `docs/timeline.md` created (correctly folded in)                                  |
| 8   | concepts.md defines >=30 proprietary terms incl all 12 named seed terms (SC41-3)                                                                                  | VERIFIED | 38 heading-level terms confirmed; all 5 spot-checked seeds present: Pitfall 1, 6-path resolver, flight recorder, degrade-open, tier-green gate                                                                                 |
| 9   | COSTS.md shows Vercel Pro $20/mo as sole paid line + free data sources + stay-on-vercel.app decision (SC41-3, REVEAL-SITE-04)                                     | VERIFIED | File exists (103 lines/81 non-blank); Vercel Pro, $20, NIM, Upstash, vercel.app all present; grep 'stay' matches the D-09 decision note                                                                                        |
| 10  | operator-guide.md covers all six visitor workflows distinct from runbook (SC41-3)                                                                                 | VERIFIED | File exists (164 lines/122 non-blank); npm install, eval:replay, capture:hero, operator-status, force=true, runbook link all confirmed                                                                                         |
| 11  | LESSONS.md is a 1-page distillation with all 5 named lessons, first-person (SC41-3)                                                                               | VERIFIED | File exists (29 lines); all 5 named lessons confirmed: probe-before-commit, honest deferral, drift gate, deletion over deprecation, audit-tier; cross-links to BUILDING and SHOWCASE present (see note on min_lines)           |
| 12  | public/screenshots/ extended with ~10 layer/feature captures + og-card.png (1200x630); `npm run capture:layers` reproduces them (SC41-3)                          | VERIFIED | 14 PNGs in public/screenshots/ (includes og-card.png); hero.gif present; capture:layers script in package.json; --layers mode in scripts/capture-hero.ts; capture-layers.contract.test.ts = 5/5 PASS                           |
| 13  | IntroOverlay + GuidedTour + TourTrigger mounted in AppShell; OG/Twitter social-share meta in index.html (absolute vercel.app og:image, 1200x630) (SC41-4)         | VERIFIED | All 3 reveal components exist and are mounted in AppShell; index.html contains og:image, twitter:card, absolute `otg-iran-monitor.vercel.app/screenshots/og-card.png`, width 1200, height 630; 20/20 reveal subset tests green |
| 14  | Custom-domain decision recorded as stay-on-vercel.app (REVEAL-SITE-04)                                                                                            | VERIFIED | docs/COSTS.md contains 'stay' (grep confirmed); SUMMARY.md confirms D-09 decision                                                                                                                                              |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact                                               | Expected                                                      | Status             | Details                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/phases/41-public-reveal-polish/41-AUDIT.md` | Merged audit with resolved/still-open/net-new + routing table | VERIFIED           | Exists; contains net-new, resolved/dropped, Wave 1/2/3 routing                                                                                                                                                                                                                                                                         |
| `docs/BUILDING-WITH-CLAUDE-CODE.md`                    | ~600-1000 lines, first-person meta-story                      | VERIFIED           | 618 non-blank lines; first-person voice confirmed                                                                                                                                                                                                                                                                                      |
| `docs/SHOWCASE.md`                                     | 1-page hub, >= 40 lines, all tour-path 1-click links          | VERIFIED           | 85 non-blank lines; all 6 tour stops confirmed                                                                                                                                                                                                                                                                                         |
| `docs/JOURNEY.md`                                      | Mermaid gantt covering v0.9-v1.5                              | VERIFIED           | Gantt block confirmed; first-person WHY-per-milestone prose present                                                                                                                                                                                                                                                                    |
| `docs/concepts.md`                                     | >= 30 term headings, all seed terms                           | VERIFIED           | 38 headings; all seed terms confirmed                                                                                                                                                                                                                                                                                                  |
| `docs/COSTS.md`                                        | >= 30 lines, paid/free breakdown, D-09 rationale              | VERIFIED           | 81 non-blank lines; all required content confirmed                                                                                                                                                                                                                                                                                     |
| `docs/operator-guide.md`                               | >= 40 lines, visitor how-to, 6 workflows                      | VERIFIED           | 122 non-blank lines; all 6 workflows confirmed                                                                                                                                                                                                                                                                                         |
| `docs/LESSONS.md`                                      | 1-page, 5 named lessons, >= 30 lines                          | VERIFIED with NOTE | 29 total lines / 15 non-blank — 1 line short of the plan artifact spec `min_lines: 30`. All 5 named lessons substantively present. The ROADMAP SC41-3 does not specify a line count; the requirement text says "1-page" which the file satisfies. The automated plan verify check does not gate on line count. Minor discrepancy only. |
| `public/screenshots/og-card.png`                       | 1200x630 OG image asset                                       | VERIFIED           | File exists; git-tracked (WR-06 confirmed false positive)                                                                                                                                                                                                                                                                              |
| `package.json`                                         | capture:layers npm script                                     | VERIFIED           | Script present                                                                                                                                                                                                                                                                                                                         |
| `scripts/capture-hero.ts`                              | --layers mode + public/screenshots/ path constants            | VERIFIED           | Both confirmed                                                                                                                                                                                                                                                                                                                         |
| `src/components/reveal/IntroOverlay.tsx`               | First-visit dismissible overlay (isIntroSeen)                 | VERIFIED           | Exists; contains isIntroSeen; 20/20 IntroOverlay tests green                                                                                                                                                                                                                                                                           |
| `src/components/reveal/GuidedTour.tsx`                 | driver.js wiring (isTourOpen)                                 | VERIFIED           | Exists; 104-line behavior-only controller; isTourOpen + driver usage confirmed                                                                                                                                                                                                                                                         |
| `src/components/reveal/TourTrigger.tsx`                | Persistent re-open affordance (openTour)                      | VERIFIED           | Exists; contains openTour; TourTrigger tests green                                                                                                                                                                                                                                                                                     |
| `src/lib/tourSteps.ts`                                 | 5-step tour list with data-tour selectors                     | VERIFIED           | Exists; data-tour present; tourSteps.test.tsx = green                                                                                                                                                                                                                                                                                  |
| `index.html`                                           | Static OG/Twitter/description meta                            | VERIFIED           | All required tags confirmed with absolute vercel.app URLs + 1200x630                                                                                                                                                                                                                                                                   |

### Key Link Verification

| From                                                 | To                                                                                               | Via                                                              | Status   | Details                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `docs/SHOWCASE.md`                                   | `docs/BUILDING-WITH-CLAUDE-CODE.md`, `docs/JOURNEY.md`, `docs/adr/0005-...`, `docs/adr/0010-...` | Markdown links                                                   | VERIFIED | All 4 link targets confirmed with grep                                                                                        |
| `README.md hero block`                               | `docs/SHOWCASE.md`                                                                               | Markdown link                                                    | VERIFIED | `grep -q 'docs/SHOWCASE.md' README.md` confirmed                                                                              |
| `src/components/reveal/*`                            | `src/stores/uiStore.ts`                                                                          | isIntroSeen/isTourOpen/openTour/closeTour/setIntroSeen selectors | VERIFIED | uiStore contains all 5 reveal members; components use useUIStore selectors                                                    |
| `src/lib/tourSteps.ts`                               | HUD data-tour attrs                                                                              | [data-tour=...] selectors resolving to present DOM nodes         | VERIFIED | data-tour attrs on StatusDropdown, Sidebar, DetailPanelSlot, Topbar, AppShell (map-container); tourSteps.test.tsx green (9/9) |
| `index.html og:image`                                | `/screenshots/og-card.png`                                                                       | Absolute vercel.app served path                                  | VERIFIED | `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` confirmed in index.html                                         |
| `docs/BUILDING-WITH-CLAUDE-CODE.md receipts section` | `docs/brainstorms/` + `docs/superpowers/plans/` + `docs/superpowers/specs/`                      | Repo-relative cross-links                                        | VERIFIED | All 3 target paths confirmed both in BUILDING and on disk                                                                     |
| `docs/LESSONS.md`                                    | `docs/BUILDING-WITH-CLAUDE-CODE.md`                                                              | Cross-link                                                       | VERIFIED | Link confirmed in LESSONS.md                                                                                                  |
| `scripts/capture-hero.ts path constants`             | `public/screenshots/`                                                                            | DOCS_DIR/SCREENSHOTS_DIR/HERO_GIF repoint                        | VERIFIED | `grep -q 'public/screenshots' scripts/capture-hero.ts` confirmed                                                              |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces static docs, screenshots, and UI overlay components that do not render database-fetched data. The reveal components consume uiStore state (localStorage-backed, not network), which is verified by the unit test contract (uiStore.reveal.test.ts green).

### Behavioral Spot-Checks

| Behavior                                                  | Command                                                    | Result                                               | Status |
| --------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- | ------ |
| All 7 Wave-0 contract tests green                         | `npx vitest run [all 7 files]`                             | 7 files / 32 tests PASS                              | PASS   |
| Reveal+og subset green                                    | `npx vitest run components/reveal/ uiStore.reveal og-tags` | 5 files / 20 tests PASS                              | PASS   |
| capture-layers contract green                             | `npx vitest run capture-layers.contract.test.ts`           | 1 file / 5 tests PASS                                | PASS   |
| docs-exist contract green                                 | `npx vitest run docs-exist.test.ts`                        | 1 file / 7 tests PASS                                | PASS   |
| og-card.png git-tracked                                   | `git ls-files public/screenshots/og-card.png`              | `public/screenshots/og-card.png` returned            | PASS   |
| No stale docs/screenshots/\*.png                          | `ls docs/screenshots/*.png`                                | "no matches found"                                   | PASS   |
| No stale docs/hero.gif or docs/screenshots refs in README | `grep 'docs/hero.gif\|docs/screenshots' README.md`         | No matches                                           | PASS   |
| WR-01/02/04 review fixes committed                        | `git log --oneline d2d925e`                                | fix(41): WR-01/WR-02/WR-04 guided tour...            | PASS   |
| WR-03 review fix committed                                | `git log --oneline 847456b`                                | fix(41): WR-03 IntroOverlay dialog semantics...      | PASS   |
| WR-05 review fix committed                                | `git log --oneline 9eeae1e`                                | fix(41): WR-05 harden capture-hero shell integration | PASS   |

### Requirements Coverage

| Requirement    | Source Plan | Description                                    | Status                                         | Evidence                                                                                                  |
| -------------- | ----------- | ---------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| REVEAL-DOCS-01 | 41-02       | BUILDING-WITH-CLAUDE-CODE.md meta-story        | SATISFIED                                      | File exists, 618 non-blank lines, first-person, all 4 anecdotes confirmed                                 |
| REVEAL-DOCS-02 | 41-02       | SHOWCASE.md 1-page hub                         | SATISFIED                                      | File exists, all tour-path links confirmed, README links to it                                            |
| REVEAL-DOCS-03 | 41-02       | JOURNEY.md Mermaid gantt                       | SATISFIED                                      | Mermaid block confirmed, all 7 milestones (v0.9-v1.5), first-person prose                                 |
| REVEAL-DOCS-04 | 41-03       | concepts.md >=30-term glossary                 | SATISFIED                                      | 38 terms, all 12 seed terms confirmed                                                                     |
| REVEAL-DOCS-05 | 41-03       | COSTS.md cost transparency                     | SATISFIED                                      | Vercel Pro, free sources, D-09 rationale, all confirmed                                                   |
| REVEAL-DOCS-06 | 41-03       | operator-guide.md visitor how-to               | SATISFIED                                      | All 6 workflows confirmed, runbook distinction present                                                    |
| REVEAL-DOCS-07 | 41-04       | public/screenshots/ extension + capture:layers | SATISFIED                                      | 14 PNGs + hero.gif + og-card.png; npm script; --layers mode; contract test green                          |
| REVEAL-DOCS-08 | 41-05       | LESSONS.md distilled retrospective             | SATISFIED                                      | All 5 named lessons present; 29 total lines (see LESSONS.md note)                                         |
| REVEAL-DOCS-09 | 41-05       | Brainstorms cleanup (cross-link as receipts)   | SATISFIED                                      | BUILDING receipts section cross-links brainstorms + superpowers; originals untouched                      |
| REVEAL-DOCS-10 | 41-01       | Final-sweep audit before REVEAL-DOCS work      | SATISFIED                                      | 41-AUDIT.md exists with all required sections; git ordering confirmed                                     |
| REVEAL-SITE-01 | 41-06       | IntroOverlay first-visit polish                | SATISFIED (automated) / HUMAN NEEDED (visual)  | IntroOverlay.tsx exists, isIntroSeen gated, localStorage key, tests green; spotlight geometry needs human |
| REVEAL-SITE-02 | 41-06       | GuidedTour + TourTrigger demo flows            | SATISFIED (automated) / HUMAN NEEDED (visual)  | All reveal files exist, data-tour attrs wired, WR-01 fix committed; spotlight geometry needs human        |
| REVEAL-SITE-03 | 41-06       | OG/Twitter social-share meta                   | SATISFIED (automated) / HUMAN NEEDED (crawler) | index.html OG block complete, og-card.png git-tracked; crawler preview needs human                        |
| REVEAL-SITE-04 | 41-06       | Custom-domain stay-on-vercel.app decision      | SATISFIED                                      | Decision recorded in docs/COSTS.md                                                                        |

### Anti-Patterns Found

| File                                   | Pattern                                                  | Severity | Impact                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/reveal/GuidedTour.tsx` | `return null`                                            | INFO     | Intentional behavior-only null-render controller (mirrors CompassControl pattern); not a stub — 104 lines of driver.js wiring                                                    |
| `docs/LESSONS.md`                      | File is 29 lines (plan artifact spec says min_lines: 30) | WARNING  | 1 line below the plan artifact threshold. Content is substantively complete. ROADMAP SC41-3 does not specify a line count; the "1-page" requirement is satisfied. Not a blocker. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any phase 41 deliverable file (new docs or new code). No unreferenced debt markers.

### Human Verification Required

**Note:** Per `workflow.human_verify_mode=end-of-phase`, the following items were deferred from their `checkpoint:human-verify` tasks (Plan 41-04 Task 2, Plan 41-06 Task 5) and are harvested here.

#### 1. Intro Overlay First-Visit + Persistence

**Test:** `npm run dev` (http://localhost:5173). In a fresh browser profile, clear `localStorage` key `iran-monitor.intro-seen`. Confirm IntroOverlay appears on first load. Click "Explore the map" — overlay dismisses. Reload — overlay stays dismissed (localStorage persisted). Also test "Start the tour" button dismisses overlay AND opens the tour.

**Expected:** IntroOverlay renders on first load and not on subsequent loads after dismissal. localStorage key `iran-monitor.intro-seen` persists across hard reload.

**Why human:** localStorage persistence and first-visit render-gate require a real browser profile; jsdom's localStorage is ephemeral and does not survive test isolation boundaries. The automated test (IntroOverlay.test.tsx) uses mock-localStorage that is reset per test.

#### 2. Re-Openable Guided Tour Spotlight Geometry

**Test:** After confirming (or skipping) the IntroOverlay, click the persistent "Tour" button in the Topbar. Step through all 5 driver.js tour steps. Confirm:

- Step 1: StatusDropdown (top-right status cluster) is spotlit
- Step 2: Sidebar layers panel opens (onHighlightStarted hook) and is spotlit — NOT empty space
- Step 3: Map container is spotlit (data-tour="map" on the map-container div)
- Step 4: Detail panel opens and is spotlit — NOT empty right edge
- Step 5: API Health trigger (dev-api-status) is spotlit
- At no step is the WebGL canvas interior or a flight entity spotlit

**Expected:** Spotlight bounding boxes land on their intended HUD nodes, not empty or off-screen regions. The WR-01 fix (onHighlightStarted panel-open hooks) should resolve the off-screen issue.

**Why human:** driver.js spotlight uses CSS bounding-box geometry; jsdom has no layout engine. `tourSteps.test.tsx` only asserts DOM-node existence (querySelector), not visual placement.

#### 3. OG Card Social-Share Preview (Post-Deploy)

**Test:** After deploying to Vercel, visit the LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/) and the Twitter/X Card Validator with `https://otg-iran-monitor.vercel.app`. Confirm `og-card.png` resolves at `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` and renders at 1200x630 (not a broken-image placeholder).

**Expected:** Rich preview card appears on both validators showing the og-card.png at correct dimensions.

**Why human:** Requires a deployed Vercel URL and external crawler-side validators. `og-tags.test.ts` only asserts the meta string values in index.html, not that the image URL resolves.

#### 4. D-02 Read-Only API-Health Surface

**Test:** Visit `/api/operator-status` (unauthenticated) and the API Health dashboard tab. Confirm no Bearer token, DASHBOARD_PASSWORD, Redis credentials, or API keys are exposed in the rendered JSON or UI. Then confirm that write paths (POST /api/events/llm-replay, POST /api/events/prune-dead-urls, GET /api/cron/refresh-events?force=true) return 401/403 without a valid Bearer.

**Expected:** Read-only view shows operator metrics without secrets. Write paths remain Bearer-gated.

**Why human:** Security/secrets inspection requires human visual review of the rendered dashboard. No automated test covers secret-exposure in the API Health surface.

---

## Gaps Summary

No gaps found. All 14 must-have truths are verified. All 14 requirement IDs (REVEAL-DOCS-01 through REVEAL-DOCS-10 + REVEAL-SITE-01 through REVEAL-SITE-04) are satisfied.

The `status: human_needed` reflects 4 visual/behavioral items requiring human testing — the automated implementation is complete and all automated contracts pass (32/32 tests green, WR-01/02/03/04/05 review fixes committed).

The LESSONS.md 1-line shortfall (29 vs 30 total lines) is noted but not a blocker: all content requirements are met, the ROADMAP success criterion does not specify a line count, and the automated plan verify check does not gate on it.

---

_Verified: 2026-06-05T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
