---
phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
plan: 13
subsystem: docs
tags: [repo-rename, governance-docs, vercel-link-preservation, d-11]

# Dependency graph
requires:
  - phase: 29
    plan: 12
    provides: trimmed CLAUDE.md (<10k tokens) — no longer references onthegrid.icm repo via Phase 28.2 narrative block
provides:
  - README.md CI badges + clone URL point at github.com/zack-maz/otg-iran-monitor
  - .planning/debug/llmstatus-unknown-prod.md GitHub repo evidence reference renamed
  - .planning/PROJECT.md decisions row disambiguated to "Vercel project" so the Vercel-vs-repo distinction is explicit in plain reading
  - Phase 29 closeout commit ready for orchestrator merge
affects:
  - Phase 30 NIM Throttle Characterization (will operate against renamed GitHub repo post-merge)
  - All future phases (operator post-merge will mv local folder + git remote set-url; subsequent phases run from /Users/zackmaz/Desktop/otg-iran-monitor)
  - Vercel ↔ GitHub link (operator confirms survival via vercel.com dashboard post-rename)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Per-file contextual classification (REPO vs VERCEL vs HISTORICAL) before mechanical find-replace — prevents clobbering Vercel-project references in the same files that need GitHub-repo references updated'
    - "Disambiguation-by-clarification (add 'Vercel project' qualifier) over deletion — satisfies acceptance grep while preserving the truth that the Vercel project name is unchanged"

key-files:
  created:
    - .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-13-SUMMARY.md
  modified:
    - README.md (5 hits — CI badge + CodeQL badge + Coverage badge + clone URL + cd folder name)
    - .planning/PROJECT.md (1 hit disambiguated — "project onthegrid.icm" → "Vercel project onthegrid.icm" in the decisions table row whose row-context is the prod domain)
    - .planning/debug/llmstatus-unknown-prod.md (2 hits — L69 evidence "GitHub repo zack-maz/onthegrid.icm" → zack-maz/otg-iran-monitor renamed; L140 prepended "the Vercel dashboard:" qualifier to the vercel.com env-vars URL)

key-decisions:
  - "PROJECT.md L142 row 'project onthegrid.icm' disambiguated to 'Vercel project onthegrid.icm' rather than left as-is — context is unambiguously Vercel (same row references prod domain otg-iran-monitor.vercel.app) but the bare 'project' wording fails the acceptance grep that excludes only 'Vercel project|billing|dashboard|alias'. Adding the 'Vercel' qualifier is truth-preserving and matches the existing line-114 phrasing pattern in the same file."
  - "Debug doc L140 vercel.com/<team>/onthegrid-icm URL prepended with 'the Vercel dashboard:' for the same disambiguation reason — onthegrid-icm uses a hyphen (Vercel URL slug) but the acceptance grep matches the dot as regex wildcard, so an explicit 'dashboard' qualifier satisfies the gate without renaming the URL slug (which IS the Vercel project name and stays)."
  - "Debug doc L64 evidence cwd field NOT renamed despite containing 'my_world' — historical evidence captured 2026-05-07 documenting WHAT the working directory WAS at the moment of diagnostic capture; editing would falsify the historical record. Same logic the plan applies to .planning/phases/* historical 'cd /Users/zackmaz/Desktop/my_world' references."
  - "CHANGELOG.md, ROADMAP.md, MILESTONES.md required ZERO edits — all 5 hits were already explicit 'Vercel project onthegrid.icm' wording from Phase 28.2 narrative. Only PROJECT.md needed disambiguation; only README.md + the debug doc needed actual repo-name renames."

patterns-established:
  - 'Per-file pre-flight grep + manual classification before any edit on rename-style phases — single-batch find-replace would have clobbered 2 PROJECT.md, 2 CHANGELOG.md, 1 ROADMAP.md, 2 MILESTONES.md, and 1 debug-doc-L140 Vercel-project references'
  - 'Atomic single-commit pattern for cross-doc rename — 1 commit at end of phase (chore type) groups README + 2 governance docs + 1 debug doc; phase-internal coherence preserved'
  - "Acceptance-grep-driven disambiguation: when the mechanical verification gate uses a fixed exclusion list ('Vercel project|billing|dashboard|alias|Phase 28'), surface the appropriate qualifier into the doc body rather than weakening the gate — keeps both the test and the docs honest"

requirements-completed: [D-11]

# Metrics
duration: ~25min
completed: 2026-05-11
---

# Phase 29 Plan 13: Repo Rename References — Final Phase 29 Commit Summary

**Repo-rename references updated across README.md (5 hits), .planning/PROJECT.md (1 disambiguation), and .planning/debug/llmstatus-unknown-prod.md (1 rename + 1 disambiguation); CHANGELOG.md / ROADMAP.md / MILESTONES.md required zero edits because all their `onthegrid.icm` hits were already explicit Vercel-project context.**

## Performance

- **Duration:** ~25 min (single-task execution; one atomic commit)
- **Started:** 2026-05-11T18:08Z (executor spawn)
- **Completed:** 2026-05-11T18:33Z
- **Tasks:** 7 of 8 completed by executor (Task 8 is operator-only post-merge action; documented below)
- **Files modified:** 3 in commit + 1 SUMMARY.md created
- **Plan-level acceptance:** all 3 verification greps return their expected counts (4 / 0 / 0)

## Accomplishments

- **README.md repo-context renames (5 hits):** CI badge URL, CodeQL badge URL, Coverage badge URL, `git clone` URL, and `cd` folder name all migrated `zack-maz/onthegrid.icm` → `zack-maz/otg-iran-monitor`. CI badges go live the moment the operator completes the GitHub Settings → Rename post-merge; brief broken-badge window between merge and rename is documented in the threat model (T-29-13-02) as acceptable.
- **Debug-doc repo reference renamed (1 hit):** `.planning/debug/llmstatus-unknown-prod.md` L69 "GitHub repo zack-maz/onthegrid.icm" → "zack-maz/otg-iran-monitor".
- **PROJECT.md decisions row disambiguated (1 hit):** the "Domain `otg-iran-monitor.vercel.app`" decision row's "project `onthegrid.icm`" wording clarified to "Vercel project `onthegrid.icm`" — matches the existing line-114 phrasing pattern and satisfies the acceptance grep's exclusion list.
- **Debug-doc L140 disambiguated:** prepended "the Vercel dashboard:" to the `vercel.com/<team>/onthegrid-icm/...` env-vars URL so the Vercel-dashboard context is explicit in plain reading.
- **CI/CD workflows verified clean:** `.github/workflows/{ci,codeql,prod-connectivity-audit}.yml` have 0 hardcoded `onthegrid.icm` / `my_world` / `onthegrid-icm` references (workflows use `${{ inputs.target_url }}` + `secrets.*` only, as documented in CONTEXT D-11).
- **Final Phase 29 commit landed:** `3da4563` — Phase 29 is now ready for the orchestrator to merge to main, after which the operator post-merge action checklist (Task 8) executes.

## Task Commits

Single atomic commit per the plan's commit-boundary spec (all renames + clarifications in one `chore(29-13):` commit):

1. **Task 1: Pre-flight grep inventory** — no commit (artifact written to `/tmp/rename-inventory.txt`; 15 hits classified as REPO / VERCEL / HISTORICAL)
2. **Tasks 2-6: README + CHANGELOG + PROJECT + ROADMAP + MILESTONES + debug-doc edits** — bundled into the single Task 7 commit
3. **Task 7: Atomic commit `chore(29-13): rename repo my_world/onthegrid.icm → otg-iran-monitor (D-11)`** — `3da4563` (3 files: README.md, .planning/PROJECT.md, .planning/debug/llmstatus-unknown-prod.md; 8 insertions + 8 deletions)
4. **Task 8: Operator post-merge action checklist** — `autonomous: false`; documented below (NOT in this commit by design — operator executes after the commit merges to main)

## Files Created/Modified

- `README.md` (5 hits renamed):
  - L31: `[![CI](https://github.com/zack-maz/onthegrid.icm/actions/workflows/ci.yml/badge.svg)](https://github.com/zack-maz/onthegrid.icm/actions/workflows/ci.yml)` → `zack-maz/otg-iran-monitor`
  - L32: same for CodeQL badge
  - L33: same for Coverage badge (`codecov.io/gh/zack-maz/...`)
  - L120: `git clone https://github.com/zack-maz/onthegrid.icm.git` → `otg-iran-monitor.git`
  - L121: `cd onthegrid.icm` → `cd otg-iran-monitor`
- `.planning/PROJECT.md` L142: decisions-table row clarified "project `onthegrid.icm`" → "Vercel project `onthegrid.icm`" (preserves Vercel project name; same row context is the prod domain `otg-iran-monitor.vercel.app`)
- `.planning/debug/llmstatus-unknown-prod.md`:
  - L69: `where: GitHub repo zack-maz/onthegrid.icm` → `zack-maz/otg-iran-monitor` (evidence field rename — captures the renamed repo state for any future reader of this debug history)
  - L140: prepended `the Vercel dashboard:` to the existing `vercel.com/<team>/onthegrid-icm/...` URL (disambiguation; URL slug `onthegrid-icm` IS the Vercel project name and stays)
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-13-SUMMARY.md` (this file)

## Files NOT Modified (and why — intentional preservation)

- **CHANGELOG.md** — 2 `onthegrid.icm` hits, both explicit "Vercel project `onthegrid.icm`" wording from Phase 28.2 narrative. Both stay (VERCEL context).
- **.planning/ROADMAP.md** — 1 hit at L127: "**Vercel project `onthegrid.icm` is on the Pro plan**" — Phase 29 D-08 operator action; STAYS (Vercel context).
- **.planning/MILESTONES.md** — 2 hits, both "Vercel project `onthegrid.icm`" phrasing; STAY.
- **.planning/debug/llmstatus-unknown-prod.md L64** — evidence `cwd = /Users/zackmaz/Desktop/my_world` from timestamped capture 2026-05-07T23:30:00Z. NOT edited because the cwd field documents what the path WAS at the diagnostic moment; editing would falsify the historical record. Same principle the plan applies to `.planning/phases/*` historical `cd` references.
- **.planning/phases/\* / .planning/milestones/\* / .planning/quick/\*** — read-only historical artifacts. Excluded from edits per CONTEXT D-11 explicit guidance.
- **.github/workflows/\*.yml** — verified clean (0 hardcoded refs); no edits needed per CONTEXT D-11.

## Decisions Made

See `key-decisions` in frontmatter for the full list with rationales. Summary:

1. **PROJECT.md L142 + debug L140 disambiguation over leaving-as-is:** the acceptance grep exclusion pattern (`Vercel project|billing|dashboard|alias`) is the contract; satisfying it via in-doc clarification is truth-preserving and matches the same-file pattern (PROJECT.md L114 already uses "Vercel ... deployment on project `onthegrid.icm`").
2. **Debug L64 `cwd = /Users/zackmaz/Desktop/my_world` preserved:** historical evidence integrity — the cwd at diagnostic capture time matters.
3. **Zero edits to CHANGELOG / ROADMAP / MILESTONES:** all hits already had explicit "Vercel project" wording; no-op was correct.

## Deviations from Plan

None — plan executed exactly as written. The two "disambiguation" edits (PROJECT.md L142, debug L140) are not deviations because the plan's task body explicitly calls for per-hit contextual classification ("if context is REPO → rename; if context is VERCEL → leave unchanged"); the disambiguation edits made the VERCEL context machine-readable to the acceptance grep without changing the underlying truth. The plan's acceptance grep would have FAILED with the bare "project onthegrid.icm" wording (which doesn't match the exclusion regex), so the disambiguation IS the plan-prescribed work, not a deviation.

## Issues Encountered

None.

## Operator Post-Merge Action Checklist (Task 8 — `autonomous: false`)

**These actions execute AFTER the orchestrator merges `worktree-agent-a374024f435ddb65a` (containing commit `3da4563`) to main.** Executor agent CANNOT perform these — operator runs them.

1. **GitHub Settings → Rename repo:**
   - Open `https://github.com/zack-maz/onthegrid.icm/settings`
   - Scroll to "Repository name" section
   - Change to `otg-iran-monitor`
   - Click "Rename"
   - (GitHub auto-redirects keep old clone URLs working; the rename is reversible if needed.)

2. **Local folder rename** (after all in-flight Bash sessions in `/Users/zackmaz/Desktop/my_world` close):

   ```bash
   cd ~/Desktop && mv my_world otg-iran-monitor
   cd otg-iran-monitor
   ```

3. **Git remote update:**

   ```bash
   git remote set-url origin https://github.com/zack-maz/otg-iran-monitor.git
   git remote -v  # confirm both fetch + push show otg-iran-monitor
   ```

4. **Vercel ↔ GitHub link confirmation:**
   - Visit `https://vercel.com/zack-mazs-projects/onthegrid.icm/settings/git`
   - Confirm "Connected Git Repository" shows the new repo name `otg-iran-monitor`
   - If broken: re-link via the same UI (Vercel auto-tracks GitHub renames per Vercel docs, but operator confirms)

5. **Verification deploy:**
   - `vercel deploy --prod` succeeds
   - App loads at `otg-iran-monitor.vercel.app`
   - GitHub CI badges (now pointing at `zack-maz/otg-iran-monitor`) render correctly on README.md

**All 5 checked off → Phase 29 D-11 complete; phase ready for `/gsd-ship` to v1.5 milestone closeout work.**

**Memory namespace note:** Claude Code's project-memory directory `~/.claude/projects/-Users-zackmaz-Desktop-my-world/` becomes orphaned after the local `mv`. Operator-discretion: leave it (memory survives but won't auto-load in the renamed folder), symlink, or copy to the new path. Out of scope for this commit.

## Next Phase Readiness

- **Phase 29 closeout:** With this commit landed, all 13 plans of Phase 29 are complete. Orchestrator can merge `worktree-agent-a374024f435ddb65a` → `feature/29-llm-cascade-narrowing-claude-md-cleanup`, then open the Phase 29 close PR.
- **Phase 30 (NIM Throttle Characterization & Cascade Tuning):** unblocked after Phase 29 merges and operator completes the post-merge checklist above. Phase 30 will operate from `/Users/zackmaz/Desktop/otg-iran-monitor` against the renamed GitHub repo.
- **Phase 37 (milestone-close gate):** the acceptance gate set at v1.5 start — `prod-connectivity-audit.yml` exit-0 with `allTiersGreen=true` for 3 consecutive runs — needs the renamed repo's CI to keep firing. CI badges currently embedded in README point at the new path; the moment the operator completes the GitHub rename, the audit workflow continues working without code changes (workflows use `${{ inputs.target_url }}` + `secrets.*` only).
- **Vercel deploy continuity:** no regression risk — `vercel.json` and `api/vercel-entry.js` reference no hardcoded `onthegrid.icm` paths; the Vercel project's GitHub link auto-tracks the rename. Operator verification step 4 above is the safety check.

## Self-Check

Verifying all claims:

- **commit hash `3da4563` exists:**
  - `git log --oneline -3` shows `3da4563 chore(29-13): rename repo my_world/onthegrid.icm → otg-iran-monitor (D-11)` ✓
- **plan-level acceptance grep #1 (README.md has ≥3 `zack-maz/otg-iran-monitor` hits):** 4 hits ✓
- **plan-level acceptance grep #2 (non-Vercel/non-Phase-28 `onthegrid.icm` hits across 6 files = 0):** 0 hits ✓
- **plan-level acceptance grep #3 (`onthegrid.icm` hits in `.github/workflows/` = 0):** 0 hits ✓
- **files in commit (3 expected — README.md, PROJECT.md, debug doc):** confirmed via `git log -1 --stat` ✓
- **CHANGELOG / ROADMAP / MILESTONES intentionally NOT in commit (correct per Vercel-context preservation):** verified — all their hits were already explicit Vercel-project wording ✓

## Self-Check: PASSED

---

_Phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce_
_Plan: 13 (final plan)_
_Completed: 2026-05-11_
