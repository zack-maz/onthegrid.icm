---
phase: 41-public-reveal-polish
plan: 01
subsystem: planning-gate + test-infra
tags: [audit, wave-0, tdd-red, reveal, docs-drift, memory-refresh]
requires:
  - 41-PLAN.md
  - project-v1-6-cleanup-punchlist (memory)
  - project-v1-6-docs-drift (memory)
provides:
  - 41-AUDIT.md (merged resolved/still-open/net-new classification + wave-routing table)
  - 7 Wave-0 red Vitest stubs (REVEAL-SITE + capture contract)
  - refreshed operator memories (both)
affects:
  - Plans 02-06 (absorb routed docs fixes)
  - Plan 04 (capture:layers contract goes green)
  - Plan 06 (REVEAL-SITE store slice + overlays go green)
tech-stack:
  added: [] # zero installs; Vitest + RTL already present
  patterns:
    - '@ts-expect-error-glued unresolved imports survive the lint-staged import sorter via import/order disable blocks'
    - 'contract tests read source-as-text (capture-hero.ts, index.html) rather than executing Playwright-importing modules'
key-files:
  created:
    - .planning/phases/41-public-reveal-polish/41-AUDIT.md
    - src/__tests__/stores/uiStore.reveal.test.ts
    - src/__tests__/components/reveal/IntroOverlay.test.tsx
    - src/__tests__/components/reveal/TourTrigger.test.tsx
    - src/__tests__/components/reveal/tourSteps.test.tsx
    - src/__tests__/og-tags.test.ts
    - src/__tests__/capture-layers.contract.test.ts
    - src/__tests__/docs-exist.test.ts
  modified:
    - ~/.claude/.../memory/project_v1_6_cleanup_punchlist.md (outside repo)
    - ~/.claude/.../memory/project_v1_6_docs_drift.md (outside repo)
decisions:
  - 'News-warmer (punch-list #15) DEFERRED to v1.7 — operability nicety out-of-scope for a reveal phase; not a locked REQ-ID'
  - 'Cerebras/Groq test fixtures RESOLVED-BY-REFRAME — Phase 38 LLM-PURGE-06 keeps them as deferred-provider scaffolding (live structures, not stale)'
  - 'Contract tests read scripts/capture-hero.ts as TEXT (module imports Playwright at load); assert source patterns not runtime behavior'
metrics:
  duration: ~11m
  completed: 2026-06-06
  tasks: 3
  commits: 3
  files_created: 8
---

# Phase 41 Plan 01: Wave-0 Audit Gate + Test Infra Summary

**One-liner:** Re-ran the D-10 final-sweep code+docs audit against current `main` (post-Phase-38/39/40), proving the **entire code-side punch-list is resolved** and the residual v1.6 cleanup is now a pure docs sweep; refreshed both operator memories and pinned 7 RED Vitest stubs for the REVEAL-SITE store slice, overlays, tour-selector existence, OG tags, and capture:layers contract before Plans 04 + 06 implement.

## What Was Built

Three deliverables, all gating Waves 1-3 (every later Phase 41 plan `depends_on` 41-01):

1. **`41-AUDIT.md`** — Re-ran the v1.5-close 2nd-pass code+docs audit against then-current `main`. Each of the 19+6 cleanup-punchlist items and 23 docs-drift items classified Resolved / Still-Open / Net-New, with file-line evidence. All 3 BUGS verified RESOLVED. A wave-routing table maps each carried/net-new finding to its target Phase 41 wave by domain. SC41-1 preserved: no REVEAL-DOCS markdown authored in this plan — only the planning artifact under `.planning/`.

2. **Refreshed operator memories** (both, in place, outside the repo) — Resolved items dropped, still-open annotated "carried into Phase 41 (see 41-AUDIT.md)", net-new appended, `last_refreshed: 2026-06-05` notes added. YAML front-matter + `[[wikilink]]` cross-reference preserved verbatim in both.

3. **7 Wave-0 red Vitest stubs** — real failing assertions (not `it.todo`) pinning every automatable REVEAL-SITE + capture contract. Confirmed RED (7 files, 21 assertions failing) against not-yet-existing code; `tsc -p tsconfig.json --noEmit` clean.

## Audit Verdict Summary

| Bucket                            | Resolved                            | Still-Open (carried)               | Net-New |
| --------------------------------- | ----------------------------------- | ---------------------------------- | ------- |
| **Code** (punch-list 1-18, 24-29) | ALL (Phase 38 LLM-FIX + LLM-PURGE)  | #15 news-warmer (→ deferred v1.7)  | none    |
| **Docs** (drift 1-23)             | 5, 13, 14, 15, 20 (Phase 38 PRO-04) | 1,2,3,4,6,7-ACLED,8-12,16-19,21,23 | NN-1..4 |

**Key reframe:** punch-list #7 (Cerebras/Groq test fixtures) is RESOLVED-BY-REFRAME — Phase 38 LLM-PURGE-06 deliberately keeps the `DAILY_LIMITS` + circuit-breaker state + `Provider` union as Phase-34 deferred-provider scaffolding (live structures), so the tests legitimately reference them.

## Net-New Finding → Wave Routing Table (REQUIRED OUTPUT — for Plans 02-06)

> Full table with all carried items in `41-AUDIT.md` §D. This is the net-new subset plus the load-bearing carried-docs routing Plans 02-06 must absorb.

| Finding                                                                                                                            | Domain              | Target Wave    | Target Plan (likely)                      | Fix                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **NN-1** README describes ZERO Phase 38/39/40 features (BudgetBlock, Flight Recorder, water romanization, dashboard consolidation) | docs (README)       | **Wave 3**     | README/screenshot pass + SHOWCASE/JOURNEY | Add the four feature areas to README; reference in SHOWCASE/JOURNEY.                                                                       |
| **NN-2** CHANGELOG has no `[v1.6]` entry                                                                                           | docs (CHANGELOG)    | **Wave 3**     | phase close / JOURNEY input               | Add `[v1.6]` (Phases 38-41) at close; JOURNEY.md (REVEAL-DOCS-03) sources from it.                                                         |
| **NN-3** OpenAPI likely missing Phase 39 `GET /api/events/llm-history`                                                             | docs (API)          | **Wave 2**     | operator-guide (REVEAL-DOCS-06)           | Verify + add path alongside the #16 prune-dead-urls gap.                                                                                   |
| **NN-4** `llm-pipeline-reliability.md` title still "(v1.5)"                                                                        | docs (architecture) | **Wave 2**     | round-out docs                            | Retitle / note v1.6 coverage.                                                                                                              |
| Docs #1-4,21,23 ADR-layer drift                                                                                                    | docs (ADR)          | **Wave 2**     | round-out docs / concepts                 | ADR-0011 §3 Phase-35 note; ADR-README stub+NIM-only fixes; ADR-0010 double-Status; footer phase range; ADR-0009 status amendment.          |
| Docs #6, #7-ACLED `.env.example` retired flags + ACLED                                                                             | docs/config         | **Wave 2**     | operator-guide (reads `.env.example`)     | Delete LLM_PIPELINE_V2/V3 blocks; remove/mark ACLED pair historical.                                                                       |
| Docs #16 OpenAPI prune-dead-urls path                                                                                              | docs (API)          | **Wave 2**     | operator-guide                            | Add POST path (operatorBearer, 200/429/503).                                                                                               |
| Docs #17 runbook operator-surface playbooks                                                                                        | docs (runbook)      | **Wave 2**     | operator-guide cross-link                 | Cross-link the Phase 32/33/35 surfaces.                                                                                                    |
| Docs #8-12, #19 README metric/currency drift                                                                                       | docs (README)       | **Wave 3**     | README pass + phase close                 | test count 2380→2511; satellite "carried"; 8→11 ADRs / 10→12 arch files; 30+→32 keys; last-updated → Phase 41; add v1.5 operator surfaces. |
| Code #15 news:feed cron warmer                                                                                                     | code (operability)  | **DEFER v1.7** | —                                         | Not a reveal REQ-ID; carry to v1.7 (4th cron or fold into `/api/cron/warm`).                                                               |

### Wave absorption summary

- **Wave 1** (BUILDING/SHOWCASE/JOURNEY): no direct fix, but JOURNEY must reflect NN-2's `[v1.6]` facts.
- **Wave 2** (concepts/COSTS/operator-guide): ADR-layer drift + `.env.example` cleanup + OpenAPI gaps (#16, NN-3) + reliability-doc cosmetics (NN-4).
- **Wave 3** (polish + REVEAL-SITE + README/screenshots): all README currency drift + NN-1 feature coverage + phase-close markers (#11, NN-2).

## Wave-0 Test Stubs (RED contracts → green in Plans 04/06)

| File                                      | Pins                                                                                                                       | Green when                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `stores/uiStore.reveal.test.ts`           | isIntroSeen/isTourOpen/setIntroSeen/openTour/closeTour + `iran-monitor.intro-seen` localStorage persist + survives re-init | Plan 06 store slice                 |
| `components/reveal/IntroOverlay.test.tsx` | render-gate on isIntroSeen + "Explore"/"Start tour" wiring (`data-testid=intro-overlay`)                                   | Plan 06                             |
| `components/reveal/TourTrigger.test.tsx`  | always-rendered (D-03, not first-visit-gated) + click → openTour (`data-testid=tour-trigger`)                              | Plan 06                             |
| `components/reveal/tourSteps.test.tsx`    | every `[data-tour="…"]` step resolves to a DOM node in rendered AppShell (Pitfall 1/5 guard)                               | Plan 06 step list + data-tour attrs |
| `og-tags.test.ts`                         | index.html OG/Twitter tags + absolute vercel.app URLs + 1200×630 + served `/screenshots/og-card.png`                       | Plan 06 OG block                    |
| `capture-layers.contract.test.ts`         | ALL_LAYERS 6 labels + `public/screenshots/` constants + `--layers` mode + ~10 filenames + `capture:layers` npm script      | Plan 04                             |
| `docs-exist.test.ts`                      | 7 portfolio doc paths exist                                                                                                | Waves 1-3 docs                      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-glued `@ts-expect-error` to unresolved reveal imports**

- **Found during:** Task 3, after the lint-staged commit hook ran `eslint --fix`.
- **Issue:** The import-sorter reordered imports in `IntroOverlay.test.tsx` + `TourTrigger.test.tsx`, detaching the `@ts-expect-error` directive from the not-yet-existing `@/components/reveal/*` imports it suppresses. This would have failed `tsc` on BOTH the unresolved module AND an unused-directive error.
- **Fix:** Wrapped each unresolved import in an `/* eslint-disable import/order */` block with the `@ts-expect-error` glued to its import line, so the sorter can no longer detach it.
- **Files modified:** `src/__tests__/components/reveal/IntroOverlay.test.tsx`, `TourTrigger.test.tsx`
- **Commit:** 5070dac
- **Verified:** `tsc -p tsconfig.json --noEmit` clean for the stubs; reveal subset still RED.

### Scope decisions (recorded in 41-AUDIT.md, not deviations)

- **News-warmer (#15) deferred to v1.7** rather than pulled into a reveal phase (matches PROJECT.md "soft carry"; not a locked v1.6 REQ-ID).
- **No net-new CODE findings** — Phase 38 resolved the entire code-side audit; the only audit-carry work for Phase 41 is docs.

## Authentication Gates

None.

## Known Stubs

The 7 test files are intentional RED stubs (the whole point of Task 3). They are not product stubs — they pin contracts that go green when Plans 04 + 06 implement. The single passing assertion in `capture-layers.contract.test.ts` (ALL_LAYERS already enumerates the 6 labels) is expected; the file fails overall on the path/mode/filename/script sub-contracts.

## Verification

- `test -f 41-AUDIT.md && grep net-new && grep resolved && grep "wave [123]|route"` → AUDIT_OK
- Both memories: `grep "Phase 41|2026-06-05|carried"` → MEMORIES_REFRESHED; wikilink + front-matter preserved (verified).
- All 7 stub files present → ALL_7_STUBS_PRESENT.
- Reveal subset RED: `npx vitest run src/__tests__/components/reveal/ src/__tests__/stores/uiStore.reveal.test.ts src/__tests__/og-tags.test.ts src/__tests__/capture-layers.contract.test.ts` → 7 failed (21 assertions). Expected RED until Plans 04/06.
- `tsc -p tsconfig.json --noEmit` clean (no stub-introduced type errors).

## Self-Check: PASSED

All 8 created files exist on disk (41-AUDIT.md, 41-01-SUMMARY.md, 7 test stubs). All 3 commits (7db4fbb, bdc733a, 5070dac) present in git history. Both operator memory files present and refreshed.
