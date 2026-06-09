---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 05
subsystem: infra
tags: [vercel, vercel-pro, fluid-compute, docs-drift, deployment, cron]

# Dependency graph
requires:
  - phase: 38-02
    provides: LLM-PURGE CLAUDE.md + ADR-0010 edits already committed on this branch (reconciled, not reverted)
provides:
  - Recorded PRO-01 (vercel.ts) + PRO-02 (Build Output API) defer decision with rationale (D-09 / SC38-6)
  - Fluid Compute compatibility verdict on the memoized createApp() factory + no-cross-request-leak smoke assertion
  - Hobby→Pro docs-drift repair across 5 surfaces (CLAUDE.md + 4 docs)
  - Dev-env Vercel CLI bump 52.0.0 → 54.9.0 (global, not a package.json dependency)
affects: [vercel-deployment, v1.7-vercel-config-migration, phase-999.2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defer-with-rationale recorded in deployment.md satisfies SC38-6's shipped-or-explicitly-deferred bar without performing the risky migration"
    - 'Fluid Compute no-leak invariant guarded by a two-sequential + concurrent-request smoke assertion against the memoized app'

key-files:
  created: []
  modified:
    - docs/architecture/deployment.md
    - docs/runbook.md
    - docs/degradation.md
    - docs/architecture/llm-pipeline-reliability.md
    - CLAUDE.md
    - server/__tests__/vercel-entry.test.ts

key-decisions:
  - '(38-05 PRO-01, D-09) DEFER vercel.json → vercel.ts: vercel.json is purely declarative (crons/rewrites/functions, NO headers block, no drift handlers), so the migration is net-zero simplification while adding @vercel/config + a build step + deploy-path risk mid-cleanup. Revisit v1.7.'
  - '(38-05 PRO-02, D-09) DEFER Build Output API: a fundamental deploy-path change that risks the 800s maxDuration, the includeFiles eval-fixture copy, and the rewrite map simultaneously — wrong risk/reward mid-cleanup. Phase 999.2 stays open; revisit v1.7.'
  - '(38-05 PRO-03) Fluid Compute compat verdict: COMPATIBLE, no changes. Memoized createApp() reuse is correct (no per-request global state); no graceful-shutdown needed (Upstash REST = no connections to drain); callHistory/llmProgress singletons are process-scoped, cron-written (single writer), with Phase 28.2.7 Redis write-through — no cross-request leak.'
  - "(38-05 PRO-04) llm-pipeline-reliability.md header reconciled to NIM-primary / OpenRouter-dormant (consistent with the body's :134 NIM-only declaration) rather than the stale 'NIM + OpenRouter cascade' framing."

patterns-established:
  - 'Recorded-deferral pattern: a docs decision block naming each deferred REQ-ID + rationale is the artifact that closes SC38-6 for risky migrations'

requirements-completed: [VERCEL-PRO-01, VERCEL-PRO-02, VERCEL-PRO-03, VERCEL-PRO-04]

# Metrics
duration: 6min
completed: 2026-06-04
---

# Phase 38 Plan 05: VERCEL-PRO strand Summary

**Shipped the safe Vercel Pro work (Fluid Compute compat verification + 5-surface Hobby→Pro docs-drift repair + CLI bump 52→54.9.0) and recorded explicit defer-with-rationale for the two risky migrations (vercel.ts config + Build Output API) per D-09 — closing SC38-6 without touching the production deploy path mid-cleanup.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T16:42:50Z
- **Completed:** 2026-06-04T16:48:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- **PRO-01 + PRO-02 deferred with recorded rationale** — added a "Vercel Pro configuration decisions" block to `deployment.md` naming both migrations as deliberate D-09 deferrals: vercel.ts is net-zero (no `headers` block to express), Build Output API risks three load-bearing settings (800s `maxDuration`, `includeFiles` eval copy, rewrite map) at once. Neither migration was performed; no `vercel.ts`, no `@vercel/config` dep, no tracked `.vercel/output`.
- **PRO-03 Fluid Compute compatibility verified + documented + smoke-asserted** — confirmed the memoized `createApp()` factory (in `server/index.ts`) has no per-request global mutation hazard under in-instance concurrency; `callHistory`/`llmProgress` are process-scoped, cron-written, Redis-write-through (Phase 28.2.7). Added a "Fluid Compute compatibility" verdict section to `deployment.md` and a smoke assertion to `vercel-entry.test.ts` (two sequential + four concurrent `/health` requests, no cross-request state leakage).
- **PRO-04 Hobby→Pro docs-drift repaired across 5 surfaces** — CLAUDE.md (`Hobby cap 3` → `3 entries, well under the Pro 40-cron cap`), deployment.md (60s ceiling → Pro 800s / Fluid-Compute 300s default; 3-cron Hobby cap → Pro 40-cron cap; cross-linked the defer block), runbook.md (anchor slug + `10-second limit` → 800s ceiling; Hobby cron-count → Pro 40-cron; historical-labeled the pre-Phase-29 baseline), degradation.md (`10 s timeout` → `800 s timeout (Pro)`), llm-pipeline-reliability.md (header reconciled to NIM-primary / OpenRouter-dormant).
- **Vercel CLI bumped 52.0.0 → 54.9.0** in the dev environment (global install, NOT a package.json dependency). `vercel --version` now reports `Vercel CLI 54.9.0`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record PRO-01/02 defer + verify Fluid Compute compat (PRO-01/02/03)** - `ebea42d` (docs)
2. **Task 2: Hobby→Pro docs-drift repair across 5 surfaces + CLI bump (PRO-04)** - `048a9c4` (docs)

_Both tasks committed through git hooks (lint-staged + gitleaks), no `--no-verify`._

## Files Created/Modified

- `docs/architecture/deployment.md` - Added "Vercel Pro configuration decisions" (PRO-01/02 defer) + "Fluid Compute compatibility" verdict sections; repaired 60s→800s and 3-cron→40-cron claims; cross-linked the defer block from the build pipeline.
- `server/__tests__/vercel-entry.test.ts` - Added Fluid Compute no-cross-request-leak smoke assertion (2 sequential + 4 concurrent `/health` requests).
- `CLAUDE.md` - Cron-schedule line: `Hobby cap 3` → `3 entries, well under the Pro 40-cron cap`.
- `docs/runbook.md` - Section-6 anchor slug + body `10-second limit` → 800s ceiling; Hobby cron-count → Pro 40-cron cap; historical-labeled the pre-Phase-29 10s baseline note.
- `docs/degradation.md` - Failover table: `10 s timeout` → `800 s timeout (Pro)`.
- `docs/architecture/llm-pipeline-reliability.md` - Header (lines 3, 6) reconciled to NIM-primary / OpenRouter-dormant, consistent with the body's :134 NIM-only declaration.

## Decisions Made

See `key-decisions` frontmatter. Highlights:

- PRO-01 and PRO-02 deferred to v1.7 with recorded rationale (D-09); Phase 999.2 stays open for the Build Output API question.
- Fluid Compute verdict: compatible, no code changes required.

## Deviations from Plan

None - plan executed exactly as written. PRO-01/02 were default-deferred (recorded, not performed) and PRO-03/04 shipped, exactly per the plan's D-09 scope discipline. 38-02's prior CLAUDE.md edits were reconciled (the cron-schedule line was the only PRO-04 target on CLAUDE.md and was untouched by 38-02), not reverted.

## Issues Encountered

- **markdown-link-check pre-existing noise (out of scope, not fixed).** `npm run docs:lint` reports dead links in README.md (`http://localhost:5173`, `http://localhost:3001`) and `<a id>`-anchor 404s in runbook.md (`#13`/`#14`/`#15`) plus a `31-SUMMARY.md` 400. Verified pre-existing on `HEAD:docs/runbook.md` (the tool cannot resolve HTML `<a id>` anchors — 20 such "dead" links existed before my edits). My section-6 anchor (link + target) was updated together and is internally consistent. These are tooling limitations on files/links outside this plan's scope; not modified.

## User Setup Required

None - no external service configuration required. (The Vercel CLI bump is a dev-machine action already performed during execution; no operator action needed.)

## Next Phase Readiness

- VERCEL-PRO strand of Phase 38 complete; code + docs now agree on Pro 800s / 40-cron / Fluid-Compute-default semantics.
- PRO-01 (vercel.ts) and PRO-02 (Build Output API) are carry-forwards to v1.7 with recorded rationale; Phase 999.2 remains the open backlog dir for the Build Output API evaluation.
- No blockers introduced for the remaining Phase 38 wave-2/3 plans.

## Self-Check: PASSED

All 6 modified files + the SUMMARY exist on disk; both task commits (`ebea42d`, `048a9c4`) are present in git history. `npx vitest run server/__tests__/vercel-entry.test.ts` exits 0 (4 tests), `npm run typecheck` exits 0, PRO-04 stale-claim grep returns 0 live Hobby/timeout claims across the 5 in-scope surfaces, and the no-migration guards confirm PRO-01/02 were deferred (no `vercel.ts`, no `@vercel/config` dep, no tracked `.vercel/output`). `vercel --version` reports 54.9.0.

---

_Phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl_
_Completed: 2026-06-04_
