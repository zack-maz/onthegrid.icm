# Phase 30.1 — Post-Execution Handoff

> **Phase 30.1 has shipped locally.** All 4 plans done (01 executed,
> 04 executed, 02/03 skipped per mutual exclusion). 6 commits on
> `feature/30.1-cascade-fallback-fix` ready to ship. This handoff covers
> the two remaining out-of-band steps the executing agent did not run.
>
> The prior pre-execution handoff (the "resume in fresh session with
> `/gsd-discuss-phase 30.1`" version) is preserved in git history at
> commit `b238428` if you need it.

## TL;DR (60-second briefing)

The OpenRouter free-tier probe landed at **27/30 rate-limited (90.0%)**,
which D-05 routed to the `nim-only` bucket. Plan 04 (docs-only) amended
three files so the architecture claim, the ADR decision record, and
the Claude-context instructions all tell the same honest NIM-only
story. No code change. Server still has `skipOpenRouter: true` at both
v3 call sites (correct per D-01 Minimum scope).

Two things still need to happen:

1. **Push the branch and open the PR.**
2. **Manually correct STATE.md's `Current Position` block** — `gsd-sdk
query phase.complete` set `next_phase: 999.1`, but per v1.5 ROADMAP
   the spine continues to **Phase 31**. 999.1 is parked backlog.

Both are quick.

## Step 1 — Push + open PR

### Pre-flight (already true, verify if you're picking this up cold)

```bash
git branch --show-current        # → feature/30.1-cascade-fallback-fix
git status --porcelain           # → empty
git log main..HEAD --oneline | wc -l   # → 6
```

### Push

```bash
git push -u origin feature/30.1-cascade-fallback-fix
```

### Open PR (squash-merge, matches main convention)

```bash
gh pr create \
  --base main \
  --head feature/30.1-cascade-fallback-fix \
  --title "Phase 30.1: cascade fallback fix — NIM-only declared honest (no code change)" \
  --body "$(cat <<'EOF'
## Summary

Phase 30.1 confronts the silent NIM-only cascade reality the operator
surfaced at the Phase 30 boundary. Phase 27.4.4 Plan 02 had hardcoded
`skipOpenRouter: true` at `server/lib/llmEventExtractor.v3.ts:622, 929`,
silently removing OpenRouter from the cascade declared in Phase 29 D-01.
The 2026-05-17 04:00 UTC cron exposed the failure mode: NIM 39 rate_limit
errors → breaker tripped → 50+ batches dropped with zero OR attempts.

Plan 01 ran a fresh probe of OpenRouter free-tier rate-limit behavior
(`scripts/probe-openrouter.ts`, 30 single-event payloads). Result:
**27/30 rate_limited (90.0%)** — D-05 `nim-only` bucket. Free tier
isn't viable; restoring the fallback would amplify breaker error rate
without delivering successful extractions. Plan 04 (Minimum scope)
fired: docs-only amendments so the cascade declaration matches runtime.

**No server code changed.** `grep -c "skipOpenRouter: true"
server/lib/llmEventExtractor.v3.ts` still returns 2.

## What changed (3 docs + 1 new dev script)

- `docs/architecture/llm-pipeline-reliability.md` — new
  `## Cascade Reality (Phase 30.1, 2026-05-17)` section between Retired
  Mechanisms and 7-Day Watch. Probe result table, NIM-only rationale,
  the negative-evidence invariant (`routingTrace` must contain ZERO
  `provider: 'openrouter'` rows in the daily cron), D-08 raw-GDELT
  terminal-fallback paragraph, and "What changes if a future probe
  re-restores OR" recipe.
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — new
  `## Phase 30.1 Sub-block` after Phase 30's sub-block; `<expand_at_36>`
  marker preserved untouched.
- `CLAUDE.md` — "LLM Event Pipeline" `Active providers` bullet
  replaced verbatim per D-13 with terse "qwen-235b instruct model.
  OpenRouter fallback dormant — see
  `docs/architecture/llm-pipeline-reliability.md` for re-validation
  history." Single-line change; Phase 29 D-06 5018-token budget preserved.
- `scripts/probe-openrouter.ts` (new) + `npm run probe:openrouter` —
  byte-stable snapshot probe; imports `OPENROUTER_DEFAULT_MODEL` from
  `server/lib/freeClaudeRouter.ts` (which gained an `export` keyword)
  so the probe always measures whatever model production actually uses.

## Commits

| SHA | Subject |
|---|---|
| `aab2177` | docs(30.1): capture phase context |
| `dcd0d29` | docs(state): record phase 30.1 context session |
| `2ef9fab` | docs(30.1): plan cascade fallback fix (4 plans, probe-then-decide flow) |
| `0834ff9` | feat(30.1): add scripts/probe-openrouter.ts + 30.1-or-pulse-snapshot.json (D-03..D-06) |
| `32ea1af` | docs(30.1): amend architecture + ADR-0010 sub-block — NIM-only active, OpenRouter dormant (D-01, D-08, D-10, D-11, D-12, D-13) |
| `6dadbbe` | docs(30.1): close phase 30.1 — write SUMMARYs, mark complete in STATE/ROADMAP |

Total: 6 commits, 7 source files touched (3 docs + 1 dev script + 1 export +
1 npm-script + 1 snapshot artifact) + planning artifacts.

## Test plan

- [x] `npx vitest run` — 2138 passed, 19 skipped, 0 failed (no regressions)
- [x] `npx tsc -b` — clean
- [x] `npx eslint scripts/probe-openrouter.ts server/lib/freeClaudeRouter.ts` — clean
- [x] `npx prettier --check docs/architecture/llm-pipeline-reliability.md docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md CLAUDE.md` — clean
- [x] `grep -c "skipOpenRouter: true" server/lib/llmEventExtractor.v3.ts` returns 2 (server code untouched)
- [x] D-13 verbatim wording in CLAUDE.md confirmed; old wording removed; no parenthetical drift
- [x] `<expand_at_36>` preserved in ADR-0010
- [x] All 17 plan acceptance grep criteria green
- [ ] Confirm `npm run probe:openrouter` is documented in the dev runbook as a Phase 31 quarterly check (suggested follow-up — see Phase 31 prep list below)

## Phase 31 follow-up candidates (carried forward in ADR-0010 sub-block)

1. **Paid-OR conversion** — ~$0.04/day = ~$1.20/mo for full coverage.
2. **Adaptive Retry-After-aware NIM limiter** — Phase 30 D-01's
   `retryAfterMs` field is already on `callHistory`; wire it into
   `nvidiaNimWindow` so post-429 calls wait the server-requested duration.
3. **NIM model switch** to a lower-cap-friendly variant.
4. **Dashboard surface for cascade-degraded state** (overlaps Phase 32 + Phase 34).
5. **Re-run `scripts/probe-openrouter.ts` quarterly.**
EOF
)"
```

### Merge

Wait for CI green (`gh pr checks <PR#> --watch`), then:

```bash
gh pr merge <PR#> --squash --delete-branch
```

Matches the main-branch squash-merge convention. Post-merge the
operator's main will fast-forward via `git pull` on the next checkout.

## Step 2 — Manually correct STATE.md `Current Position`

`gsd-sdk query phase.complete 30.1` ran successfully and incremented
`completed_phases: 3` in the frontmatter, but it routed `next_phase`
to **999.1**. That's wrong for the v1.5 spine — 999.1 is parked
backlog (`promotes to v1.6 once acceptance gate is hit`). Per CLAUDE.md
and `.planning/STATE.md`'s `## v1.5 Phases (planned)` table, the
sequencing is **29 → 30 → 30.1 → 31 → 36** with 32/33/34/35 parallel.

### What to fix

Open `.planning/STATE.md`. Find the `## Current Position` block (around
line 24). Currently reads:

```markdown
## Current Position

Phase: 999.1
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-17
```

Replace with:

```markdown
## Current Position

Phase: 31 (Cron Stability Validation — LLM-RELI-06)
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-17 -- Phase 30.1 shipped (PR <PR#> merged)
```

Also update the `## v1.5 Phases (planned)` table (around line 38)
to show Phase 30.1 between rows 30 and 31, e.g.:

```markdown
| 30.1 | Cascade fallback fix — NIM-only declared honest | (gap closure from Phase 30 boundary review) | Shipped 2026-05-17 |
| 31 | Cron Stability Validation (7-day Watch) | LLM-RELI-06 | Not started |
```

(Or leave the table as-is and let the next phase's `gsd-discuss-phase`
sweep fix it — both options are fine.)

### Commit

```bash
git checkout main && git pull   # post-PR-merge sync
git checkout -b chore/post-30.1-state-routing-fix  # or commit to main directly
# edit .planning/STATE.md per above
git add .planning/STATE.md
git commit -m "docs(state): route Current Position to Phase 31 (LLM-RELI-06) after 30.1 ship

gsd-sdk query phase.complete routed to 999.1 (parked backlog) instead
of the v1.5 spine's next phase. Manual fix; the SDK doesn't distinguish
milestone-spine phases from parked 999.x backlog when computing
next_phase."
```

If you commit straight to main, that's a planning-only tracking
artifact and doesn't break the branch-per-phase rule (which applies
to feature work, not single-line state corrections).

## What's NOT in this handoff

- **No backend redeploy needed.** Phase 30.1 changed only docs +
  added a dev-only probe script. Zero production runtime impact.
- **No env-var changes.** `.env.example` untouched.
- **No new Redis keys, no schema drift, no migration.** Server
  surface unchanged.

## Pointers if anything goes sideways

- **Probe artifact:** `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-or-pulse-snapshot.json` — byte-stable JSON with 30 attempts, summary block.
- **Re-run the probe:** `npm run probe:openrouter` (requires `OPENROUTER_API_KEY` in `.env.local`; wall-clock ~5–30 min depending on OR free-tier responsiveness).
- **Verify cascade reality on a live cron:** after the daily 04:00 UTC `/api/cron/refresh-events` run, check `events:llm-summary:v3.routingTrace` in prod Redis (`dev: events:llm-summary:v3`) — every row should have `provider: 'nvidia_nim'`, ZERO with `provider: 'openrouter'`. The negative-evidence invariant is documented in the new `## Cascade Reality (Phase 30.1)` section.
- **If a future probe lands `< 50%`:** the architecture doc's "What changes if Phase 31 re-probes and lands <50%" section is the recipe. Plan 02 (currently skipped) becomes the actionable plan.

## Author

Drafted by the executing agent at phase close, 2026-05-17.
