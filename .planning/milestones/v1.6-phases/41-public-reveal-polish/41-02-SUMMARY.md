---
phase: 41-public-reveal-polish
plan: 02
subsystem: portfolio-docs (Wave 1 docs core)
tags: [reveal, docs, portfolio, first-person, mermaid-gantt, showcase, building-with-claude-code, journey]
requires:
  - 41-01-SUMMARY.md (Wave-0 audit gate; NN-1/NN-2 routing)
  - .planning/RETROSPECTIVE.md
  - .planning/MILESTONES.md
  - docs/adr/0005-phase-26-2-nlp-approach-scrapped.md
  - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md
provides:
  - docs/BUILDING-WITH-CLAUDE-CODE.md (first-person agentic-dev meta-story, ~606 non-blank lines)
  - docs/JOURNEY.md (product-arc narrative + GitHub-native Mermaid gantt, 7 milestones)
  - docs/SHOWCASE.md (flat 1-page guided-tour hub, 7-stop 1-click path)
  - README.md hero-block link into docs/SHOWCASE.md
  - 'Historical receipts' anchor section in BUILDING (D-07) for SHOWCASE/Plan 05 to point at
affects:
  - Plan 03 (Wave 2 concepts/COSTS/operator-guide — SHOWCASE forward-links them)
  - Plan 04 (Wave 3 screenshots — must keep ../public/screenshots/hero.gif resolvable)
  - Plan 05 (fleshes out the Historical receipts prose anchored here)
tech-stack:
  added: [] # zero installs — pure markdown authoring + one README link
  patterns:
    - 'GitHub-native fenced ```mermaid gantt block (dateFormat YYYY-MM-DD, section grouping, done rows)'
    - 'repo-relative markdown cross-links so npm run docs:lint resolves them'
    - 'forward-reference links to not-yet-authored Wave-2/Wave-3 docs (concepts/COSTS/operator-guide/LESSONS) + Plan-04 hero GIF — intentional, resolve at later waves'
key-files:
  created:
    - docs/BUILDING-WITH-CLAUDE-CODE.md
    - docs/JOURNEY.md
    - docs/SHOWCASE.md
  modified:
    - README.md
decisions:
  - 'BUILDING expanded past the 600 non-blank-line floor with two substantive on-topic sections (gsd-artifact discipline §2.1 + LLM-pipeline worked example §6b) rather than padding'
  - 'Mermaid gantt bars anchored to MILESTONES.md canonical ship dates (prev-ship-date -> own-ship-date ranges); project start 2026-03-13 from the brainstorm header'
  - 'No standalone docs/timeline.md created — folded into JOURNEY gantt per lock'
  - 'JOURNEY onward-to-v1.6 section reflects REAL shipped Phase 38/39/40 features (NN-1/NN-2) — not a v1.5-frozen view'
  - 'SHOWCASE hero GIF references ../public/screenshots/hero.gif (Plan 04 forward-ref, intentional per acceptance criteria)'
metrics:
  duration: ~22m
  completed: 2026-06-05
  tasks: 3
  commits: 3
  files_created: 3
  files_modified: 1
---

# Phase 41 Plan 02: Wave 1 Docs Core Summary

**One-liner:** Authored the three anchor portfolio docs — a ~606-line first-person agentic-dev meta-story (BUILDING-WITH-CLAUDE-CODE.md), a product-arc narrative with a 7-milestone GitHub-native Mermaid gantt (JOURNEY.md), and a flat 1-page guided-tour hub with a 7-stop 1-click path (SHOWCASE.md) — plus a README hero link, satisfying SC41-2 (visitor reaches meta-story, product-arc, and ADR-0005/0010 decisions in 1 click each) with every metric sourced from RETROSPECTIVE/MILESTONES and zero invented figures.

## What Was Built

Three new docs + one README edit, the highest-care move of the phase (D-08 Wave 1 docs core):

1. **`docs/BUILDING-WITH-CLAUDE-CODE.md`** (Task 1) — ~606 non-blank lines, first-person builder voice (D-11). Covers all four required areas:
   - The `/gsd` workflow shape (CONTEXT → DISCUSSION → PLAN → EXECUTE → VERIFY), walked through one real phase (Phase 32 Ghost Event URL Liveness) end-to-end, plus a §2.1 on the durable `/gsd` artifacts that make the agentic loop work.
   - Where compounding **worked**: mechanical drift gates (colorBridge byte-identity sentinel, domain.ts mirror, 32-key Redis registry, OpenAPI lint, markdown-link-check), parallel agents, probe-before-commit, deletion-over-deprecation — all with real in-repo receipts.
   - Where it **didn't**: the 4 named anecdotes with citations — Phase 26.2 NLP scrap (~1,500 LOC deleted, ADR-0005), Phase 31 early-close at Day 1/7, Phase 34 honest deferral (ADR-0010), Phase 37 architectural-mismatch unblocker PRs (#32/#33/#34/#35).
   - Cost observations (v0.9 ~4.7min/plan vs v1.5 ~3 days/closing-phase; $20/mo Vercel-Pro-only infra) + an agents-vs-human-judgment division + a worked LLM-pipeline example (§6b).
   - A "Historical receipts" section (§7) anchoring the D-07 cross-links to the 2026-03-13 brainstorm + superpowers/plans (4) + superpowers/specs (4).

2. **`docs/JOURNEY.md`** (Task 2) — first-person product arc v0.9 → v1.5 (D-11). A GitHub-native fenced Mermaid gantt covers all 7 milestones (Foundation / Intelligence / Reliability sections) with `done` rows; every gantt date is verified against MILESTONES.md ship-date headers. Each milestone gets a WHY-paragraph (the question it answered: v0.9 "can I render the map?" → v1.5 "is the LLM pipeline reliable?"). An "onward to v1.6" section reflects the real shipped Phase 38/39/40 feature set (NN-1/NN-2). No standalone timeline.md (folded into the gantt, per lock).

3. **`docs/SHOWCASE.md`** (Task 3) — flat 1-page guided-tour hub at `docs/` root (D-05, NOT docs/portfolio/). A 7-stop tour with a 1-click link to each: hero → decisions (ADR-0005 + ADR-0010) → architecture (system-context.md) → operations (runbook.md) → meta-story (BUILDING) → product-arc (JOURNEY) → codebase entry (src/components/map/BaseMap.tsx). Plus a "Go deeper" block forward-linking the Wave-2/3 docs. Hero GIF references `../public/screenshots/hero.gif` (Plan 04 forward-ref). README hero block gains a sibling "Portfolio tour" link into it.

## Audit-Carried Context Applied (NN-1 / NN-2)

Per the carried Wave-0 audit findings routed to this wave:

- **NN-1** (README/portfolio docs describe zero Phase 38/39/40 features): JOURNEY's "onward to v1.6" section accurately names the real shipped v1.6 surfaces — operator **BudgetBlock + cost-shadow** accounting, the **LLM Flight Recorder** (`llm:calls:history` / `llm:runs:history`, `/api/events/llm-history`, cold-start-surviving), **water-facility romanization** (`nameLatin` / `nameOriginal`), and the **Phase 40 API-Health dashboard consolidation** (hero rollup + 4 collapsible groups). The docs do NOT present the app as frozen at v1.5.
- **NN-2** (JOURNEY should source accurate Phases 38–41 milestone facts ahead of the formal CHANGELOG `[v1.6]` entry): JOURNEY already reflects those shipped facts in the onward-to-v1.6 section.

These were applied as accuracy constraints on the content, not a separate fix task (per the audit-carry instruction).

## SC41-2 Cross-link Verification (the phase success criterion)

From `docs/SHOWCASE.md`, a portfolio visitor reaches in **1 click each**:

| Tour stop      | Target                                | Link verified |
| -------------- | ------------------------------------- | ------------- |
| Decisions      | docs/adr/0005-... + docs/adr/0010-... | ✅            |
| Architecture   | docs/architecture/system-context.md   | ✅            |
| Operations     | docs/runbook.md                       | ✅            |
| Meta-story     | docs/BUILDING-WITH-CLAUDE-CODE.md     | ✅            |
| Product-arc    | docs/JOURNEY.md                       | ✅            |
| Codebase entry | src/components/map/BaseMap.tsx        | ✅            |

README hero block → docs/SHOWCASE.md verified (`grep 'docs/SHOWCASE.md' README.md`).

## Deviations from Plan

**None — plan executed as written.** Tasks 1-3 each passed their automated `<verify>` blocks and acceptance criteria on the authored content.

One author-discretion note (not a deviation): Task 1's first draft landed at 507 non-blank lines (under the 600 floor). I expanded it with two genuinely on-topic sections — §2.1 (the `/gsd` artifact discipline that makes the agentic loop work) and §6b (a worked LLM-enrichment-pipeline example of the judgment-vs-throughput division) — plus a closing cost reflection, reaching 606 non-blank lines. No padding; the additions are substantive and source-grounded.

## Hero-GIF Cross-Wave Dependency (for Plan 04)

`docs/SHOWCASE.md` references the hero GIF as **`../public/screenshots/hero.gif`** — the path Plan 04 will create when it relocates `docs/hero.gif` into `public/screenshots/`. This link is INTENTIONALLY unresolved at 41-02 completion and is NOT a defect (plan Task 3 acceptance criteria explicitly call this out). **Plan 04 must keep this path resolvable** when it runs the screenshot consolidation + docs:lint gate. Do not "fix" it by pointing back at the soon-to-be-moved `docs/hero.gif`.

## Known Stubs

None. These are finished portfolio docs, not stubs. The forward-reference links (concepts.md, COSTS.md, operator-guide.md, LESSONS.md, ../public/screenshots/hero.gif) point at deliverables of later waves/plans and resolve when those land — this is the planned wave structure, not a stub.

## docs:lint / link status at 41-02 close

All **in-plan and same-wave** cross-links resolve. The only unresolved links are the planned forward-references:

- `concepts.md`, `COSTS.md`, `operator-guide.md` → Wave 2 (Plan 03)
- `LESSONS.md` → Wave 3
- `../public/screenshots/hero.gif` → Plan 04 (screenshot relocation)

`npm run docs:lint` runs as the wave-merge gate; these resolve as their owning plans land. (Per plan `<verification>`: the hero-GIF link is satisfied once Plan 04 relocates the asset — documented cross-wave dependency above.)

## Self-Check: PASSED

- Files exist: `docs/BUILDING-WITH-CLAUDE-CODE.md`, `docs/JOURNEY.md`, `docs/SHOWCASE.md` all FOUND; README link FOUND.
- Commits exist: 8a6c3ad (BUILDING), 7ab55fb (JOURNEY), b5cd990 (SHOWCASE + README) all FOUND in git history.
- Acceptance automated checks: BUILDING (LINES=606 ≥600, NLP/0005/0010/brainstorm OK), JOURNEY (mermaid/gantt/v0.9/v1.5 + all 7 ship dates OK, no timeline.md), SHOWCASE (BUILDING/JOURNEY/0005/0010/system-context/BaseMap.tsx/README-link OK, flat at docs/ root).
- `docs-exist.test.ts`: 3/7 pass = exactly the 3 Wave-1 docs this plan creates (other 4 are Wave-2/3 deliverables).
