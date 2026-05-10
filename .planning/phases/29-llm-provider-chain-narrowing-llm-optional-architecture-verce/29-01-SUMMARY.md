---
phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
plan: 01
subsystem: infra
tags: [vercel, vercel-pro, maxDuration, cron, llm-pipeline, infra-config]

# Dependency graph
requires:
  - phase: 28.2.6
    provides: "Vercel cron architecture fixes (waitUntil migration option enumerated in deferred-items.md); identified Hobby 300s ceiling as the blocking constraint that 29-01 raises."
provides:
  - "vercel.json maxDuration ceiling raised 300 → 800 — Phase 29 (and all subsequent phases) now run against the Pro envelope, not the Hobby cliff."
  - "First Phase 29 commit (per D-08) that locks the Pro upgrade into the deployed contract — future commits inherit the 800s headroom automatically."
  - "Operator pre-flight pattern: pre-confirmed-via-AskUserQuestion before executor spawn, captured in plan as autonomous: false."
affects:
  - "Phase 29-02..29-13 (every subsequent plan in this phase runs deploys against 800s, not 300s)"
  - "Phase 30 (NIM throttle characterization — tunes against measured throttle inside the new envelope, not around the Hobby cliff)"
  - "Phase 31 (7-day cron stability watch — measures completion against 800s ceiling)"
  - "Future LLM-cron tuning across the v1.5 milestone"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-pre-flight gate captured as autonomous: false task — executor accepts the upgrade as already-confirmed via orchestrator AskUserQuestion."
    - "Single-line infra-config commit shipping as the FIRST commit of a phase so all subsequent commits inherit the new ceiling automatically."

key-files:
  created:
    - .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-01-SUMMARY.md
  modified:
    - vercel.json

key-decisions:
  - "Land the Pro-plan maxDuration ceiling as the first commit of Phase 29 (D-08) — every subsequent phase commit then runs against the 800s envelope without needing per-plan coordination."
  - "Keep the cron schedule unchanged (3 entries: /api/cron/health 00:00 UTC, /api/cron/warm 12:00 UTC, /api/cron/refresh-events 04:00 UTC) — only the function ceiling shifts, not the trigger cadence."
  - "Accept operator pre-flight (Vercel Pro upgrade) as a verified prerequisite via orchestrator AskUserQuestion before executor spawn — executor does not re-prompt, treats task 29-01-01 as ACCEPTED."

patterns-established:
  - "Phase-opening infra-ceiling bump: a phase that depends on raised platform ceilings ships the ceiling change as plan 01 commit 01 so the rest of the phase inherits it deterministically."
  - "Pre-flight gate documentation: autonomous: false tasks that depend on operator-side actions (billing dashboards, API key issuance, plan upgrades) are noted in the plan with the exact dashboard URL + checklist line for the operator."

requirements-completed:
  - LLM-RELI-01
  - D-08

# Metrics
duration: 1min
completed: 2026-05-10
---

# Phase 29 Plan 01: LLM Provider Chain Narrowing & LLM-Optional Architecture & CLAUDE.md Trim — Vercel Pro Upgrade Summary

**Vercel Pro upgrade locked into deployed contract: `vercel.json` `functions["api/vercel-entry.js"].maxDuration` raised 300 → 800, giving the daily LLM cron 2.7x wall-clock headroom against measured NIM throttle behavior.**

## Performance

- **Duration:** 1 min (53 seconds actual wall-clock)
- **Started:** 2026-05-10T22:43:01Z
- **Completed:** 2026-05-10T22:43:54Z
- **Tasks:** 4 (1 operator pre-flight, 3 executor tasks)
- **Files modified:** 1 (`vercel.json` — single-line change at L17)

## Accomplishments

- Operator pre-flight (Vercel Pro upgrade on `onthegrid.icm` project at https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing) confirmed via `/gsd-execute-phase` AskUserQuestion before this executor was spawned. (Task 29-01-01)
- `vercel.json` line 17 `"maxDuration": 300` → `"maxDuration": 800`. (Task 29-01-02)
- Single-line change committed as `chore(29): bump api/vercel-entry.js maxDuration 300 → 800 (Vercel Pro)` — first code commit of Phase 29 per D-08. (Task 29-01-03)
- Local `npm run build` re-verified: Vite frontend `built in 4.44s` + tsup server `Build success in 105ms`. (Task 29-01-04)
- Cron schedule preserved unchanged (3 entries — health 00:00, warm 12:00, refresh-events 04:00 UTC). Rewrites preserved unchanged. Only the function ceiling shifted.

## Task Commits

Each task was committed atomically (`--no-verify` flag per parallel-executor protocol):

1. **Task 29-01-01: Operator pre-flight — Vercel Pro upgrade** — confirmed via `/gsd-execute-phase` AskUserQuestion before spawn; no executor commit (operator-only action).
2. **Task 29-01-02: Bump vercel.json maxDuration 300 → 800** — committed together with Task 29-01-03 (single-line infra-config change).
3. **Task 29-01-03: Commit chore(29): bump maxDuration** — `3a4fc01` (chore) `chore(29): bump api/vercel-entry.js maxDuration 300 → 800 (Vercel Pro)`.
4. **Task 29-01-04: Verify build still succeeds against new maxDuration** — no code change; `npm run build` confirmed pass (Vite 4.44s, tsup 105ms); no commit required.

## Files Created/Modified

- `vercel.json` — `functions["api/vercel-entry.js"].maxDuration` raised 300 → 800. No other config keys touched (crons, rewrites, framework all unchanged).
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-01-SUMMARY.md` — this file.

## Decisions Made

- **Pro upgrade lands as first Phase 29 commit (D-08):** Per the plan's explicit truth assertion, every subsequent Phase 29 commit must run against the 800s ceiling, so the ceiling bump ships as commit 1 of plan 1. Future tuning in Phase 30 (NIM throttle characterization) and Phase 31 (7-day watch) measures against the Pro envelope, not the Hobby cliff. — Followed plan as specified.
- **Single-line change, no other vercel.json edits:** Plan acceptance criteria explicitly required `grep -c '"maxDuration": 800' = 1` AND `grep -c '"maxDuration": 300' = 0` AND `JSON.parse()` succeeds. Honored by editing only the one targeted line. Rewrites array, crons array, framework, schema all byte-identical post-commit.
- **Operator pre-flight pre-confirmed before spawn:** Orchestrator AskUserQuestion confirmed Vercel Pro active on `onthegrid.icm`. Executor accepted task 29-01-01 as ACCEPTED per spawn-prompt directive and did NOT re-prompt the user.

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<acceptance_criteria>` for Task 29-01-02 referenced line 13 (`Before/After` blocks showed `"functions"` at L11 in the snippet), but the actual current file has `"functions"` block at L15-19 with `"maxDuration"` at L17. This is a snippet-vs-file line-number mismatch in the plan documentation, NOT a deviation — the surrounding 3-line context (`"functions"` / `"api/vercel-entry.js"` / `"maxDuration": 300`) is unique in the file, the Edit tool matched on context, and the post-edit grep + JSON.parse acceptance checks all pass. No file content was changed beyond what the plan specified. Documenting here so a future audit reading the plan can reconcile.

## Issues Encountered

None.

## User Setup Required

**Operator-side already complete (pre-confirmed before executor spawn):**

- Vercel Pro plan active on the `onthegrid.icm` project. Dashboard URL: https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/billing.

**Post-merge operator verification (D-09, out of scope for this plan, captured in phase SUMMARY):**

- After merging this commit to `main` and triggering a Vercel deploy, the operator runs the synthetic >300s invocation per D-09:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" \
    https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true
  ```
  Expected: invocation runs >300s wall-clock without function-killed signal (check `vercel logs` for completion timestamp). A successful deploy alone proves the Pro plan is active (Hobby plan rejects `maxDuration: 800` at vercel.json validation).
- Rollback path if the synthetic check fails: revert commit `3a4fc01` + downgrade the Vercel plan (operator action). The cron schedule remains valid against the Hobby ceiling because the prior 300s value was successful before the bump.

## Next Phase Readiness

- Plan 29-02 (`feature/29-llm-cascade-narrowing-claude-md-cleanup` branch) is unblocked: all subsequent Phase 29 commits now deploy against the 800s function ceiling.
- Phase 30 (NIM Throttle Characterization & Cascade Tuning) inherits the 800s envelope by construction — no per-plan Pro-upgrade coordination needed.
- Phase 31 (Cron Stability Validation 7-day watch) measures cron completion against the new envelope; the acceptance gate (`prod-connectivity-audit.yml` exit-0 with `allTiersGreen=true` × 3 consecutive runs) becomes achievable once Phases 29-31 close.
- No blockers identified. No threat-model `mitigate` dispositions remain open for this plan (T-29-01-01 mitigated by pre-flight; T-29-01-02 mitigated by exact dashboard URL in plan + operator confirmation).

## Threat Flags

None — this plan is pure infra-config (a single integer literal in `vercel.json`) and introduces no new network endpoint, auth path, file access pattern, or schema change at a trust boundary. The function ceiling raise itself is operator-cost surface (Pro plan billing), not security surface.

## Self-Check: PASSED

Verified via on-disk + git state:

- `vercel.json` exists with `"maxDuration": 800` at line 17 — FOUND.
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-01-SUMMARY.md` exists — FOUND.
- Commit `3a4fc01` exists in `git log --all` with subject `chore(29): bump api/vercel-entry.js maxDuration 300 → 800 (Vercel Pro)` — FOUND.
- `npm run build` exits 0 with Vite + tsup both reporting success — FOUND.

---
*Phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce*
*Plan: 01*
*Completed: 2026-05-10*
