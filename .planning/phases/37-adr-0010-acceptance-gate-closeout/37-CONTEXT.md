# Phase 37: ADR-0010 + Acceptance Gate Closeout — Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock the v1.5 LLM Reliability & Reveal Prep milestone close with two load-bearing artifacts:

1. **ADR-0010 milestone-final rewrite + close sub-block.** `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` is rewritten so the **body** reflects the milestone-final shipped reality (NIM-only at runtime; v1/v2 deleted; LLM-optional proven; Pro upgrade landed; docs swept) — not the Phase 29-open intent that was already partly superseded by Phases 30.1 + 34. The 5 existing sub-blocks (Phase 29 / 30 / 30.1 / 34 / 35) stay verbatim as historical waymarkers showing how we got here. The `<expand_at_36>` HTML comment at line 150 is deleted; Consequences / Alternatives / References are rewritten against milestone-final reality. A new **Phase 37 close sub-block** is appended (Phase 35-style D-N rows + a "v1.5 Milestone Close Rollup" subsection that surfaces the cumulative arc across all 6 sub-blocks). The status line gains a second line: `Status: Accepted (v1.5 closed YYYY-MM-DD)` below the existing `Status: Accepted`.

2. **Acceptance-gate observation (LLM-RELI-07).** `prod-connectivity-audit.yml` exit-0 with `audit:connectivity:last-result.allTiersGreen === true` observed for **3 consecutive runs** spaced **1 per day across 24-48 hours** (crosses the 04:00 UTC daily cron tick; most robust evidence of stability; closest to the spirit of the Phase 31 7-day watch). **Hard reset** on any red — a mid-sequence failure wipes the streak and the count restarts from 0. Evidence captured **inline in 37-SUMMARY.md** as a dedicated `## Acceptance Gate Observation (LLM-RELI-07)` section with 3 rows; each row carries GitHub Actions run URL + ISO timestamp + the full `audit:connectivity:last-result` JSON payload (status / runId / timestamp / endpoints map / allTiersGreen / tierStatus). Reviewer verifies without leaving the doc.

Then the milestone close ritual: CHANGELOG[v1.5] entry inline in Plan 37-03 (mirrors CHANGELOG[v1.4] entry shape); 37-SUMMARY.md with per-phase rollup across all 10 v1.5 phases (29, 30, 30.1, 31, 32, 33, 34, 35, 36, 37) + framing-gap callouts + v1.5 quantitative snapshot + v1.6 promotion readiness statement; ROADMAP / REQUIREMENTS / STATE flips for Phase 37 + DOCS-PUB-04 + LLM-RELI-07.

**Requirements covered (this phase):** DOCS-PUB-04 (ADR-0010 rewrite + close sub-block), LLM-RELI-07 (3× consecutive `prod-connectivity-audit.yml` greens).

**Out of scope (deferred elsewhere or unrelated):**

- **999.5 load test promotion.** Phase 37 unblocks v1.6 promotion — the actual promotion ritual lands when v1.6 starts. Phase 37 does NOT move `.planning/phases/999.5-performance-load-test/` into v1.6 territory.
- **LLM-RELI-06 7-day cron watch.** Phase 31 closed early at Day 1 / 7 with the caveat documented (`validated single-day, monitoring continues opportunistically`). Phase 37's 3× mechanical gate is the load-bearing acceptance check, NOT the 7-day watch. The two are intentionally separate per ROADMAP construction.
- **REVEAL-01 polish.** v1.6 territory. No landing-page edits, no demo flows, no social-share assets, no hero GIF regen.
- **ADR-0011 sub-block.** Phase 36 D-21 already appended the Phase 36 sub-block to ADR-0011. Phase 37 does NOT touch ADR-0011 unless milestone-close framing surfaces an inconsistency.
- **ROADMAP / REQUIREMENTS retroactive rewording for the 6 Phase 36 framing gaps.** Phase 36 D-04 + SUMMARY callouts established the policy: planning text stays as historical brief; SUMMARY records the gap. Phase 37 inherits the policy and adds its own gap row if one surfaces (e.g., the back-to-back→spaced-out cadence interpretation noted below in D-08).
- **Cerebras + Groq adapter restoration.** Phase 34 closed `cerebras-groq-deferred`; not relitigated. Future provider-restoration phase would re-introduce alongside `scripts/probe-cerebras-groq.ts` per the ADR-0010 Phase 34 sub-block.
- **OpenAPI full-spec audit / Zod-handler reconciliation.** Phase 36 D-05 capped at additions + lightweight verify; deferred to a future "API hardening" phase.

**Carrying forward (locked, not re-decided here):**

- **Branch-per-phase from `main`** (`feature/37-adr-0010-acceptance-gate-closeout`) cut after the Phase 36 merge commit. CONTEXT.md + DISCUSSION-LOG.md + checkpoint may sit on the current branch as scaffold; branch cut at Plan 37-01 execution start.
- **Atomic per-decision commits** within plans. `docs(37):` / `chore(37):` / `test(37):` prefixes with body that names the decision number. Phase 30 D-08 → Phase 36 D-27 invariant.
- **Plan-rollup commits** update `.planning/phases/37-*/37-NN-SUMMARY.md` at plan close if used.
- **Cron-only writer discipline (anti-pattern #17).** Phase 37 ships **zero new production cache writers**. The gate observation reads the existing `audit:connectivity:last-result` sidecar (written by the workflow itself); no Redis writes from code land in this phase.
- **"Describe shipped not aspirational"** (Phase 30.1 / 34 / 35 / 36 framing). The ADR rewrite (D-01) makes the body match the milestone-final shipped state, not the Phase 29 intent that was partly superseded.
- **Framing-gap-in-SUMMARY policy** (Phase 36 D-04). New gaps surfaced during Phase 37 land in SUMMARY's `## Framing-Gap Callouts` section; planning artifacts (ROADMAP, REQUIREMENTS, PROJECT.md) stay untouched.
- **ADR sub-block-per-phase convention.** Phase 29 / 30 / 30.1 / 34 / 35 precedent — Phase 37 appends the same shape (markdown heading + dated paragraph + cross-link to architecture doc). The Phase 37 sub-block is the **6th and final** v1.5 sub-block; the body rewrite (D-01) means the sub-blocks then sit beneath a milestone-final body, not a Phase-29-perspective body.
- **Closing-table format for D-N rows** (Phase 35 SUMMARY precedent). 37-SUMMARY.md ends with a Decision-by-Decision Outcome table.
- **Operator out-of-band actions are explicitly flagged in plans.** Mirrors Phase 29's "operator upgrades Vercel to Pro before plans run" framing. Plan 37-02 calls out: workflow_dispatch requires GitHub Actions UI access or `gh workflow run` with credentials the executor agent doesn't have.
- **TypeScript ~5.9.3 pinned**; any new test code (if added) uses `logger.child({ module: '...' })` not `console.*`. Phase 37 likely ships zero new code outside docs/ADR/markdown.
- **`docs/architecture/llm-pipeline-reliability.md` + `docs/architecture/redis-keys.md` current.** Phase 30 / 30.1 / 34 + Phase 35 shipped them; Phase 37 cross-links from ADR-0010 References block but does NOT rewrite.

</domain>

<decisions>
## Implementation Decisions

### ADR-0010 close artifact (DOCS-PUB-04)

- **D-01: Full ADR-0010 rewrite + 5 sub-blocks preserved.** Rewrite the ADR **body** sections (Context, Decision, Consequences, Alternatives Considered, References) so they describe the milestone-final shipped state — not the Phase 29-open intent. Specifically: the `Decision` section says **"Active cascade is NIM-only at runtime; OpenRouter dormant per Phase 30.1; Cerebras + Groq deferred per Phase 34; v1+v2 extractors deleted Phase 29; Pitfall 1 cache bridge serves raw GDELT when `events:llm:v3` is empty (map never goes blank)."** The 5 existing sub-blocks (Phase 29 / 30 / 30.1 / 34 / 35) stay verbatim as the historical decision trail — the sub-blocks show HOW the milestone-final state was reached one phase at a time. Reads as a single canonical ADR end-to-end. ~250+ lines after rewrite. The Phase 37 close sub-block (D-04) is appended below the Phase 35 sub-block as the 6th and final sub-block.

- **D-02: Absorb `<expand_at_36>` marker into the rewrite + delete marker.** The HTML comment at line 150 (`<expand_at_36>`) is deleted. **Consequences** is rewritten against milestone-final reality: positive (smaller bundle 1.72MB→1.79MB+10KB delta which is JSDoc-additions-dominant, simpler rollback via `git revert`, active-path-is-active-path clarity, NIM-only honesty surfaces DLQ baseline that would have been hidden behind a non-functional OR fallback claim); negative (Phase 27.4 D-26/D-40 deep-rollback lock superseded; ADR-0009 partially historical re: v2 keys; cron Hobby-300s class of failures eliminated but NIM throttle remains the single point of failure per Phase 34 deferral); neutral (`shouldPauseNewEvents()` soft-cap pause unreachable post-narrowing, documented as Phase 30 cleanup). **Alternatives Considered** is rewritten to include not just the Phase 29-era alternatives (archive v1.ts+v2.ts to attic/, add `LLM_PIPELINE_ENABLED` kill-switch) but also the Phase 30.1-era OR-restore choice (rejected per ≥90% rate_limited probe) and the Phase 34-era Cerebras/Groq-provision choice (rejected per operator deferral). **References** is rewritten to include all 9 phase CONTEXT.md paths + commit ranges (filled at PR merge time) + cross-links to `docs/architecture/llm-pipeline-reliability.md` + `docs/architecture/redis-keys.md` + ADR-0009 + ADR-0011 + the 7 v1.5 phase SUMMARY.md paths.

- **D-03: Inline citation per D-N row in close sub-block.** Each D-N row in the Phase 37 close sub-block that closes a requirement cites it inline: e.g., `D-04 (DOCS-PUB-04): ADR-0010 milestone-final rewrite + close sub-block landed; preserves 5 historical sub-blocks; status line updated to "Accepted (v1.5 closed YYYY-MM-DD)"; commit range <filled at PR merge>.` Requirements traceability lives in the prose; SUMMARY closing-table format provides the second cross-reference surface. (Matches Phase 35 D-15 / Phase 36 D-25 conventions.)

- **D-04: Phase 37 close sub-block content (Phase 35-style + milestone-close rollup).** 6 D-N rows mirroring this CONTEXT's decisions plus a **v1.5 Milestone Close Rollup** subsection that surfaces the cumulative arc: cascade narrowed (Phase 29) → NIM-only honest (Phase 30.1) → providers deferred (Phase 34) → docs+Redis cleanup (Phase 35) → public docs sweep + OpenAPI gates (Phase 36) → milestone gate observed + ADR canonicalized (Phase 37). The rollup reads as the milestone retrospective from inside the ADR. Cross-link to `37-SUMMARY.md` for the full per-phase outcome table. ~150-200 lines of new sub-block content.

- **D-05: Status line gains second line.** Append `Status: Accepted (v1.5 closed YYYY-MM-DD)` as a **second line** below the existing `Status: Accepted` (date 2026-05-11, Phase 29 open). Preserves the original decision-acceptance point; surfaces the milestone-close date as the lifecycle terminus. Reads as a two-state visual at the top of the ADR. Operator-skim friendly. (Not a single-line in-place edit per Phase 29-orthodox preservation.)

### Acceptance-gate observation (LLM-RELI-07)

- **D-06: Cadence — 1 run per day across 24-48 hours.** Operator triggers `prod-connectivity-audit.yml` once per day for 3 consecutive days (or across ≥24 hr and ≤48 hr if compressed). Each run crosses the 04:00 UTC daily cron tick so the gate observation includes the cron-warm + refresh-events + health daily ticks within the streak window. Closest to the spirit of the Phase 31 7-day watch while still meeting LLM-RELI-07's literal "3 consecutive" wording. Most robust evidence of stability. Total elapsed wall-clock ~48-72 hr from first trigger to milestone close.

- **D-07: Hard reset on any red mid-sequence.** If a run lands red (workflow exit-1 OR `allTiersGreen=false` from the Step 3 inline node script — they're equivalent post-Phase 28.2.5 D-09), the streak wipes and the count restarts from 0. The next 3-consecutive-green observation starts from scratch. Matches Phase 31's strictness; rejects the "longest-streak-of-3" reading because a red mid-sequence indicates the system was NOT stable across the observation window even if it recovered.

- **D-08: Evidence inline in 37-SUMMARY.md — URL + payload triplet.** Dedicated `## Acceptance Gate Observation (LLM-RELI-07)` section in 37-SUMMARY.md. 3 rows; each row: **(a)** GitHub Actions run URL (e.g., `https://github.com/.../actions/runs/<runId>`); **(b)** ISO 8601 timestamp from the sidecar payload; **(c)** full `audit:connectivity:last-result` JSON payload — `{status, runId, timestamp, endpoints, durationMs, allTiersGreen, tierStatus}` — embedded as a fenced JSON code block. Reviewer verifies streak completeness without leaving the doc. Payloads survive the Redis sidecar's 7d TTL because they're committed to git inside the SUMMARY. NOTE: If the operator chooses to compress the cadence to back-to-back (~10-30 min apart) for any reason, surface that in the SUMMARY framing-gap callouts as a new row noting the deviation from D-06 and the rationale.

- **D-09: Operator triggers manually — documented as out-of-band step.** Plan 37-02's task list **explicitly flags** the workflow_dispatch trigger as an operator out-of-band action (mirrors Phase 29's "operator upgrades Vercel to Pro before plans run"). The executor agent does NOT have GitHub Actions credentials; running `gh workflow run prod-connectivity-audit.yml` from the executor will fail on auth. Plan 37-02 is therefore structured as: (a) [operator] trigger run #1, wait for green, capture run URL + sidecar JSON; (b) [operator] same for run #2; (c) [operator] same for run #3; (d) [executor] commit the evidence triplet into 37-SUMMARY.md draft + cross-link from ADR-0010 close sub-block. No helper script (`scripts/run-prod-audit-thrice.sh`) is added — premature automation for a one-shot phase-close action.

### Plan decomposition + commit discipline

- **D-10: 3 plans — ADR / gate / close.** **37-01-PLAN.md** ADR-0010 milestone-final rewrite + close sub-block (D-01..D-05). **37-02-PLAN.md** Acceptance-gate observation (D-06..D-09; operator out-of-band trigger × 3; evidence capture). **37-03-PLAN.md** Milestone close (CHANGELOG[v1.5] entry, 37-SUMMARY.md including the gate evidence section + per-phase rollup + framing-gap callouts + quantitative snapshot + v1.6 promotion readiness, ROADMAP/REQUIREMENTS/STATE flips for Phase 37 + DOCS-PUB-04 + LLM-RELI-07). Clean separation; each plan is independently reviewable.

- **D-11: Strictly sequential 01 → 02 → 03.** Plan 37-01 (ADR rewrite) lands first — the ADR sub-block's `D-N (LLM-RELI-07)` row references the gate evidence via cross-link to 37-SUMMARY.md (`"3 consecutive greens observed; see 37-SUMMARY.md §Acceptance Gate Observation for triplets"`). Plan 37-02 runs the 24-48h gate observation. Plan 37-03 (close) writes 37-SUMMARY.md with the observed evidence + the rest of the milestone-close artifacts + flips tracking. Each plan blocks the next. Total elapsed wall-clock: ~1-2 days for 37-01 + ~24-48 hr for 37-02 + ~1 day for 37-03 = ~3-5 days from branch cut to merge. ADR is honest at every commit because the cross-link is a stable reference to a section that will exist by close.

- **D-12: Branch + per-plan commit discipline — inherit Phase 36 verbatim.** Branch `feature/37-adr-0010-acceptance-gate-closeout` from `main` after the Phase 36 merge commit. Atomic per-decision commits within plans: `docs(37):` / `chore(37):` prefixes naming the D-N in the body (e.g., `docs(37): D-01 rewrite ADR-0010 body to milestone-final shipped state`). Plan-rollup commits update `.planning/phases/37-*/37-NN-SUMMARY.md` if used. CONTEXT.md + DISCUSSION-LOG.md + checkpoint may sit on the current branch as scaffold; branch cut at Plan 37-01 execution start. No new commit-prefix conventions (no `gate(37):`); existing `chore(37):` covers the 3 gate-observation commits.

- **D-13: Verification gates inherit Phase 36 D-24.** Plan 37-03 close runs all 3 mechanical gates: (a) `npx vitest run` — no regressions, includes the Phase 36 D-08 `openapi-lint.test.ts` + the Phase 35 D-01 `redis-registry.test.ts` + all earlier schema-pinning tests; (b) `npx @redocly/cli lint server/openapi.yaml --format=stylish` — no spec errors (also enforced by the vitest in Phase 36 D-08); (c) `markdown-link-check` per `npm run docs:lint` script scope (`docs/` + README + ADRs) — catches broken cross-references created by the ADR rewrite. 37-SUMMARY.md records the all-green observation at close. No new gates added.

### Milestone-close SUMMARY.md framing

- **D-14: Per-phase rollup table for all 10 v1.5 phases.** 37-SUMMARY.md contains a `## v1.5 Phase Rollup` section with one row per phase: **29, 30, 30.1, 31, 32, 33, 34, 35, 36, 37**. Columns: `Phase | Name | Status | Closed | Requirements Closed | Notes`. The Notes column carries the per-phase outcome flavor (e.g., Phase 31 = "Closed early Day 1 / 7"; Phase 34 = "Closed `cerebras-groq-deferred`"; Phase 37 = "Milestone close gate observed; v1.6 promotion unblocked"). Reads as the v1.5 retrospective at-a-glance.

- **D-15: Framing-gap callouts — inherit Phase 36's 6 + add 1 new for cadence interpretation.** 37-SUMMARY.md `## Framing-Gap Callouts` section carries forward all 6 callouts from 36-SUMMARY.md (NIM+OR cascade wording, 10-vs-12 file count, v3→v2→v1 fallback chain, rate-limit middleware filename, ADR-0011 §3 `events:llm:v3:partial` body, `/llm-pipeline`→`/llm-status` rename) + adds 1 NEW row for any Phase 37-era cadence interpretation deviation (per D-08 NOTE — if operator compresses to back-to-back this is logged here; if cadence ran as D-06 specifies this row says "Cadence ran as specified — no deviation"). Total: 6 carryover + 1 new (deviation or not) = 7 callouts.

- **D-16: v1.5 quantitative snapshot — follows CHANGELOG[v1.4] entry shape.** A `## v1.5 Quantitative Snapshot` subsection in 37-SUMMARY.md captures: (a) **test count delta** baseline→close (Phase 36 close was 2400+ tests per the OpenAPI gate addition; Phase 37 adds 0 new tests so delta is 0); (b) **bundle delta** (api/vercel-entry.js bytes; Phase 35 close was 1,790,243 bytes; Phase 37 adds 0 code so delta is 0 — note this in the snapshot); (c) **ADR count delta** (v1.4 close had 8 ADRs in `docs/adr/`; v1.5 added ADR-0009 Phase 27.4.3 + ADR-0010 + ADR-0011 = 3 net adds = 11 total at v1.5 close); (d) **Redis key registry growth** (Phase 35 close had 32 keys; any Phase 36/37 additions captured here; expected delta = 0); (e) **cron job count** (still 3 within Hobby cap → Pro cap; unchanged); (f) **commit count across all v1.5 phases** (rough sum from `git log --oneline feature/29... feature/36...` etc.); (g) **operator hours spent** (rough estimate from per-phase SUMMARY hours-spent rows). Mirrors CHANGELOG[v1.4]'s "Quantitative snapshot" block shape.

- **D-17: v1.6 promotion readiness statement.** A `## v1.6 Promotion Readiness` subsection in 37-SUMMARY.md explicitly states: **"v1.6 promotion is unblocked. 999.5 (Performance Optimization + 1-300 VU k6 sweep) can be pulled from `.planning/phases/999.5-performance-load-test/` into v1.6 as the first phase. v1.5 acceptance gate (3× consecutive `prod-connectivity-audit.yml` exit-0 with `allTiersGreen=true`) observed on YYYY-MM-DD; evidence at §Acceptance Gate Observation above. REVEAL-01 polish + REVEAL-02 public domain are v1.6 scope items per `.planning/REQUIREMENTS.md` §v2 Requirements."** Reader knows exactly what the gate unblocked + what's next.

- **D-18: CHANGELOG[v1.5] inline in Plan 37-03 — mirrors CHANGELOG[v1.4] entry shape.** Plan 37-03 writes the v1.5 entry into `CHANGELOG.md` ABOVE the existing v1.4 entry. Format mirrors v1.4: title with span + 1-paragraph milestone framing + `### Headline deliverables` bullets organized by track (LLM-RELI, GHOST, ACTOR, DOCS-INT, REDIS-OPT, SIMPLIFY, DOCS-PUB, DOCS-API) + `### Quantitative snapshot` (matches 37-SUMMARY D-16 content) + `### Migration notes (v1.4 → v1.5)` (e.g., Vercel Pro plan required for `maxDuration: 800`; CLAUDE.md trimmed; v1+v2 extractors deleted — rollback is `git revert` not flag flip; partial-key retired; OR dormant + Cerebras/Groq deferred — single-provider DLQ baseline is known known) + `### Deferred to v1.6+ (carried forward)` (999.5 load test, REVEAL-01/02, Cerebras/Groq adapter restoration). Single commit `docs(37): CHANGELOG[v1.5] milestone entry` at Plan 37-03 close.

- **D-19: Closing-table format for D-N rows in 37-SUMMARY.md.** Phase 35 SUMMARY precedent — 37-SUMMARY.md ends with a `## Decision-by-Decision Outcome` table. Columns: `D-N | Decision | Plan | Status | Commit Ref`. ~19 rows for D-01..D-19. Reader can grep any D-N back to its commit.

### Claude's Discretion

- Whether the ADR-0010 rewrite preserves the existing line-3 `Status: Accepted` date `2026-05-11` exactly (recommended: yes — that IS the Phase 29-open date when the decision was Accepted; the milestone-close date goes on the new second line per D-05).
- Whether the Phase 37 close sub-block includes an explicit `**Architecture-level numbers**:` cross-link footer (mirrors Phase 30 / 30.1 / 34 / 35 convention) — recommended: yes, pointing to `docs/architecture/llm-pipeline-reliability.md` for the cumulative measurement story.
- Whether 37-SUMMARY.md's `## Decision-by-Decision Outcome` closing table includes a "Hours spent" column (Phase 35 SUMMARY did this in baseline-measurements.md not the closing table) — recommended: no for the closing table; surface aggregate hours in D-16 quantitative snapshot instead.
- Whether the ADR-0010 References block lists commits by SHA or commit message (recommended: commit range like `<first-Phase-29-commit>..<last-Phase-37-commit>` per the existing References block convention; filled at PR merge time).
- Whether to add a small Mermaid diagram to the ADR-0010 rewrite illustrating the cascade evolution Phase 29 → Phase 30.1 → Phase 34 → Phase 37 (recommended: no — the 5 sub-blocks + the milestone-final body already tell the story in prose; a diagram would risk drift against `docs/architecture/llm-pipeline-reliability.md` which is the diagram home).
- Whether Plan 37-02's gate-observation task list specifies which run-of-the-day is preferred (recommended: leave operator's choice flexible — any 24-hr-apart triplet works; document only that the cron tick at 04:00 UTC should be crossed at least once during the streak).
- Whether 37-SUMMARY.md captures a `## Operator Out-of-Band Actions` section listing the 3 workflow_dispatch triggers + any other operator manual steps (recommended: yes, single-row section noting "3× workflow_dispatch on prod-connectivity-audit.yml; operator-triggered manually via GitHub Actions UI or `gh workflow run`"; mirrors Phase 29 D-08's Vercel-Pro upgrade callout pattern).
- Whether CHANGELOG[v1.5]'s `### Migration notes` includes a callout for the API Health tab merge state at v1.5 close vs v1.4 close (Phase 28.2 W5 already merged in v1.4; v1.5 didn't touch it; recommended: no migration note for it since it didn't change).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 37 source material

- `.planning/ROADMAP.md` §"Phase 37: ADR-0010 + Acceptance Gate Closeout" (lines 113 + 304-315) — Goal, depends-on, 4 success criteria.
- `.planning/REQUIREMENTS.md` DOCS-PUB-04 + LLM-RELI-07 — normative acceptance text for the 2 requirements this phase closes.
- `.planning/PROJECT.md` — Milestone goal + v1.4 baseline + v1.5 acceptance-gate framing.
- `.planning/STATE.md` — Current milestone progress (Phase 36 closed 2026-05-30; Phase 37 unblocked).

### ADR-0010 rewrite target (D-01..D-05)

- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — **The rewrite target.** Existing 207 lines: Status / Date / Deciders / Context (Phase 29 framing) / Decision (4 numbered items) / Phase 30 sub-block / Phase 30.1 sub-block / Phase 34 sub-block / Phase 35 sub-block / `<expand_at_36>` marker at line 150 / Consequences / Alternatives Considered / References. Body sections get the milestone-final rewrite per D-01..D-02; sub-blocks stay verbatim; Phase 37 close sub-block appended per D-04.
- `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` — Referenced by ADR-0010 Consequences ("partially historical" framing). The Phase 37 rewrite preserves the cross-reference but updates the framing now that the `events:llm:v3:partial` key was retired (Phase 35 D-12).
- `docs/adr/0011-v3-llm-pipeline-architecture.md` — Referenced by ADR-0010 References (parallel v3-architecture ADR). Phase 36 D-21 appended its own Phase 36 sub-block; Phase 37 does NOT touch ADR-0011 (out of scope per the Domain section above).
- `docs/adr/template.md` — Nygard short format reference. The rewrite preserves Nygard discipline (immutable post-Accepted body except for status line + sub-block append).

### Acceptance-gate observation source-of-truth (D-06..D-09)

- `.github/workflows/prod-connectivity-audit.yml` — **The workflow.** workflow_dispatch trigger; runs vitest connectivity smoke (16 endpoints) + rate-limit defense companion + tier-green assertion at Step 3; writes `audit:connectivity:last-result` to Redis sidecar (7d TTL); exits non-zero when `allTiersGreen=false`. Phase 28.2 W6 + Phase 28.2.5 D-09 origin.
- `server/routes/audit-status.ts` — Reads the sidecar key; surfaces shape `{status, runId, timestamp, endpoints, durationMs, allTiersGreen?, tierStatus?}` to `/api/audit-status` (degrade-open; no Bearer required). Source of truth for the payload shape that gets embedded in 37-SUMMARY.md.
- `server/routes/__tests__/audit-status.test.ts` — W-3 contract test pinning the payload shape. Drift fails the next `vitest run` (Phase 36 D-24 inherited gate).
- `src/__tests__/api-connectivity.test.ts` — The vitest suite the workflow runs (16-endpoint smoke).
- `src/__tests__/rate-limit.test.ts` — The rate-limit defense companion (D-30, B-6 target `/api/health`).

### Milestone-close source artifacts (D-14..D-19)

- `CHANGELOG.md` — **Above the existing v1.4 entry is where v1.5 lands.** Existing v1.4 entry shape (title + span + paragraph + Headline deliverables + Quantitative snapshot + Migration notes + Deferred-to-v1.5+) is the template for D-18.
- `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-SUMMARY.md` — Phase 35 close template (134 lines; includes per-decision outcome table; baseline-measurements.md sidecar). Direct template for 37-SUMMARY.md structure.
- `.planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md` — Phase 36 close template (423 lines; includes 28-row decision table + framing-gap callouts + architecture-doc audit table + 3-gate verification results). Direct template for D-19 closing-table format + D-15 framing-gap callout pattern.
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — Phase 29 D-08 origin for `vercel.json maxDuration: 800` + Phase 29 D-06 5018-token CLAUDE.md budget that the subsequent phases preserved.

### v1.5 phase artifacts (D-14 per-phase rollup source)

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/` — Phase 29 LLM-RELI-01/05 + SIMPLIFY-04/06 + DOCS-INT-01 (closed 2026-05-11).
- `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/` — Phase 30 LLM-RELI-02/03/04 + SIMPLIFY-01/03 (closed 2026-05-17).
- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/` — Phase 30.1 OR-dormant honest declaration (closed 2026-05-17).
- `.planning/phases/31-cron-stability-validation-7-day-watch/` — Phase 31 LLM-RELI-06 closed early Day 1 / 7 with caveat (closed 2026-05-19); `31-SUMMARY.md` carries the caveat language.
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/` (or similar slug) — Phase 32 GHOST-01..05 (closed 2026-05-21).
- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/` — Phase 33 ACTOR-01..05 (closed 2026-05-21).
- `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/` — Phase 34 `cerebras-groq-deferred` close (closed 2026-05-23).
- `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/` — Phase 35 DOCS-INT-02/03 + REDIS-OPT-01..04 + SIMPLIFY-02/05/07 (closed 2026-05-27).
- `.planning/phases/36-public-docs-sweep-openapi-additions/` — Phase 36 DOCS-PUB-01/02/03/05 + DOCS-API-01..07 (closed 2026-05-30); SUMMARY's framing-gap callouts carry forward to 37-SUMMARY per D-15.

### Architecture-level cross-links for ADR-0010 References (D-02)

- `docs/architecture/llm-pipeline-reliability.md` — **The canonical doc for the shipped LLM pipeline state.** Phase 30 + Phase 30.1 + Phase 34 sub-blocks document the NIM-only-at-runtime reality. ADR-0010's "Architecture-level numbers" footer cross-links here (mirrors Phase 30 / 30.1 / 34 / 35 sub-block convention).
- `docs/architecture/redis-keys.md` — Phase 35 D-05 32-key deep-dive inventory pinned by the Phase 35 D-01 drift gate. ADR-0010 References block cites this for the Redis registry surface.
- `CLAUDE.md` §"LLM Event Pipeline" + §"Serverless Cache" — Operator-skim of the shipped state. Phase 37 does NOT trim CLAUDE.md (Phase 29 D-06 5018-token budget preserved); ADR-0010 References block cites these sections.
- `server/routes/events.ts` — Pitfall 1 cache bridge (the terminal fallback when `events:llm:v3` is empty). ADR-0010 Decision section cites this as the "map never goes blank" mechanical proof.
- `server/__tests__/resilience/redis-death.test.ts` — Proves the chain works under Redis death. ADR-0010 Consequences cites this test.

### Existing schema-pinning + gate test patterns (D-13 inheritance)

- `src/__tests__/lib/redis-registry.test.ts` (Phase 35 D-01) — Drift gate for Redis registry across CLAUDE.md + `redis-keys.md` + production code. Phase 37 D-13 inherits this gate via the `npx vitest run` invocation.
- `server/__tests__/openapi/openapi-lint.test.ts` (Phase 36 D-08) — Redocly lint gate. Phase 37 D-13 inherits via `npx @redocly/cli lint` + the vitest invocation.
- `server/__tests__/lib/urlLiveness.schema.test.ts` (Phase 32 D-22) — Schema-pinning template. Inherited via vitest.
- `src/__tests__/lib/actorCatalog.test.ts` (Phase 33 D-07) — Catalog-invariant template. Inherited via vitest.
- `src/__tests__/lib/colorBridge.test.ts` — Byte-identity sentinel template. Inherited via vitest.
- `package.json scripts.docs:lint` (Phase 36 D-08 + D-24) — `markdown-link-check` across `docs/` + README + ADRs. Phase 37 D-13 invokes this script.

### Carryover context

- `.planning/phases/36-public-docs-sweep-openapi-additions/36-CONTEXT.md` — Phase 36 carryover: branch discipline, atomic-per-decision commit invariant, "describe shipped not aspirational", framing-gap-in-SUMMARY policy.
- `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-CONTEXT.md` — Phase 35 carryover: schema-pinning gate pattern, baseline-measurements.md sidecar precedent.
- `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/34-CONTEXT.md` — Phase 34 carryover: honest-deferral close-out language; "empirical deferral is itself a load-bearing outcome".
- `.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md` — Phase 31 carryover: LLM-RELI-06 single-day caveat; 7-day watch vs 3× mechanical gate distinction.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Phase 36 D-25 5-plan + close decomposition shape** — Direct template for D-10's 3-plan slice. Each plan ships its own decisions atomically; close plan does CHANGELOG + SUMMARY + tracking flips.
- **Phase 35 SUMMARY structure (134 lines)** — Lightweight close-summary template for 37-SUMMARY.md when the phase is small.
- **Phase 36 SUMMARY structure (423 lines)** — Larger close-summary template if 37-SUMMARY swells with the per-phase rollup + framing-gap + quantitative-snapshot + v1.6-promotion sections.
- **ADR-0010 sub-block-per-phase convention (Phase 29 / 30 / 30.1 / 34 / 35 precedent)** — Direct template for D-04 Phase 37 close sub-block append. Markdown heading + dated paragraph + cross-link to architecture doc + Out-of-scope-carries-forward block.
- **CHANGELOG[v1.4] entry shape (existing in `CHANGELOG.md`)** — Direct template for D-18 CHANGELOG[v1.5] entry. Headline deliverables / Quantitative snapshot / Migration notes / Deferred-to-vN+1+ structure.
- **`prod-connectivity-audit.yml` Step 3 inline node script (Phase 28.2.5 D-09)** — Already does the tier-green assertion + sidecar write + non-zero exit. Plan 37-02 just needs to fire the workflow and capture the resulting sidecar JSON; no script changes needed.

### Established Patterns

- **Atomic per-decision commits** (Phase 30 D-08 → 31 → 32 → 33 → 34 → 35 → 36 D-27). Each D-N is a commit. `docs(37):` / `chore(37):` prefixes with body that names the decision number.
- **Branch-per-phase from `main`** (`feature/37-adr-0010-acceptance-gate-closeout`). Cut after Phase 36 merge commit. Plan 37-01 execution start triggers the cut.
- **Sub-block-per-phase ADR convention** (Phase 29 / 30 / 30.1 / 34 / 35 sub-blocks within ADR-0010). Phase 37 appends the same shape as the 6th and final v1.5 sub-block.
- **"Describe shipped not aspirational"** (Phase 30.1 framing, Phase 34 deferred close, Phase 35 D-09 historical-waymarker, Phase 36 D-04 planning-text-policy). D-01 + D-02 + D-15 all align with this; ADR body rewrites the Phase 29-perspective to milestone-final-perspective.
- **Honest-deferral close-out language** (Phase 30.1 `nim-only`, Phase 34 `cerebras-groq-deferred`, Phase 31 early-close caveat). Phase 37's milestone close inherits the same honesty discipline — D-17 v1.6 promotion readiness statement acknowledges what's NOT done (REVEAL-01/02, Cerebras/Groq restoration) alongside what IS done.
- **Framing-gap-in-SUMMARY policy** (Phase 36 D-04 + SUMMARY callouts). D-15 inherits the 6 Phase 36 callouts + adds 1 new row for any Phase 37-era deviation.
- **Cron-only writer discipline (anti-pattern #17).** Phase 37 ships zero new production cache writers; all changes are docs + ADR + markdown + SUMMARY/CHANGELOG.
- **Strictly-sequential plan waves** (when downstream depends on operator wall-clock). D-11's 01 → 02 → 03 shape mirrors Phase 31 (operator waits on daily cron tick) + Phase 34 (operator chose deferral). Distinct from Phase 30 / 33 / 35 / 36 two-wave-parallel patterns where plans are file-independent.
- **Operator out-of-band action callouts in plans** (Phase 29 D-08 Vercel Pro upgrade, Phase 31 operator-triggered snapshots, Phase 34 operator deferral). D-09 inherits this pattern; Plan 37-02 explicitly flags the workflow_dispatch trigger as operator-only.

### Integration Points

- **`docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`** — Body rewrite + Consequences + Alternatives + References per D-01..D-02; status line gains second line per D-05; Phase 37 close sub-block appended per D-04. Single file touched in Plan 37-01.
- **`CHANGELOG.md`** — v1.5 entry inserted above existing v1.4 entry per D-18. Single file touched in Plan 37-03.
- **`.planning/phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md`** (NEW) — Created by Plan 37-03; includes Acceptance Gate Observation section (D-08), per-phase rollup table (D-14), framing-gap callouts (D-15), quantitative snapshot (D-16), v1.6 promotion readiness (D-17), closing decision table (D-19).
- **`.planning/ROADMAP.md`** — Phase 37 row flipped from `[ ]` to `[x]` per Plan 37-03 close ritual. Plan-count table updated.
- **`.planning/REQUIREMENTS.md`** — DOCS-PUB-04 + LLM-RELI-07 traceability table rows flipped to `Complete (2026-MM-DD)` per Plan 37-03 close ritual.
- **`.planning/STATE.md`** — `last_updated`, `last_activity`, `progress`, `stopped_at`, "Current Position" all updated to reflect v1.5 milestone close + v1.6 unblock.
- **`.github/workflows/prod-connectivity-audit.yml`** — Read-only by Phase 37 (Plan 37-02 triggers it 3× via workflow_dispatch; does not modify the workflow itself).
- **No code files touched** — Phase 37 ships zero production code changes. Bundle delta expected = 0 bytes.

</code_context>

<specifics>

## Specific Ideas

- **"The ADR body should describe what we shipped, not what we intended to ship 30 days ago."** D-01's load-bearing framing — Phase 30.1 + Phase 34 already surfaced that the Phase 29-open framing ("narrow to NIM + OpenRouter") was overtaken by reality ("NIM-only at runtime"). The rewrite makes the ADR body honest at milestone close.
- **"Sub-blocks are the historical decision trail; the body is the milestone-final state."** D-01 + D-04 — readers who want the canonical answer read the body; readers who want the journey read the sub-blocks bottom-up.
- **"3 consecutive greens with a daily-cron-tick crossing is the strictest reasonable reading of LLM-RELI-07."** D-06 + D-07 + D-08 — back-to-back is too lax (doesn't prove stability across the daily 04:00 UTC tick); 7-day watch is Phase 31 territory and was closed early with the caveat. 24-48h spaced strikes the right balance for a milestone-close gate.
- **"Hard reset on red — strictest reading wins for milestone close."** D-07 — Phase 31's "validated single-day" caveat would have NOT counted as a passing 7-day watch under hard-reset rules; the same strictness applies here.
- **"Inline payload in SUMMARY beats sidecar JSON file."** D-08 — payloads survive git forever; sidecar JSON is just another file that can drift or be forgotten. The 3-row evidence section is the milestone-close proof and lives where reviewers look.
- **"Operator out-of-band actions are flagged explicitly in plans — executor agents fail loudly on credentials, not silently mid-step."** D-09 — Phase 29's pattern of calling out operator actions BEFORE the plan runs is the inheritance.
- **"Sequential plan waves for a closing phase — there's no parallelism advantage when 02 wall-clock-blocks 03."** D-11 — Phase 36's 2-wave parallel was right for that phase's 4 file-independent plans; Phase 37's 3-plan close is intrinsically sequential.
- **"3 plans + Phase 36 D-24 verification gates is enough overhead for a 2-requirement milestone-close phase."** D-10 + D-13 — no new gates, no new commit-prefix conventions, no new scripts; everything Phase 37 needs already exists.
- **"`<expand_at_36>` marker was a deferral breadcrumb; deleting it is the point."** D-02 — Phase 36 wrote the marker as "Phase 37 will absorb this"; absorbing it = deleting the marker.
- **"v1.6 promotion is unblocked is the headline; 999.5 specifically is what unblocks first."** D-17 — readers want to know what's next, not just "v1.5 is done".

</specifics>

<deferred>

## Deferred Ideas

### v1.6 prep (post-Phase-37 milestone close)

- **999.5 Performance Optimization + 1-300 VU k6 sweep.** Unblocked by Phase 37 D-17. Promotes from `.planning/phases/999.5-performance-load-test/` into v1.6 as the first phase when v1.6 starts. Phase 37 does NOT execute the promotion ritual — that's v1.6 start work.
- **REVEAL-01 polish.** Landing-page polish, demo flows, social-share assets, hero GIF regen, SEO + Open Graph + Twitter Cards + sitemap audit. v1.6 territory.
- **REVEAL-02 public domain.** TBD whether v1.6 stages a custom domain vs. continuing on `otg-iran-monitor.vercel.app`. v1.6 milestone-open scoping question.
- **CHANGELOG[v1.5] → CHANGELOG[v1.4] cross-link audit.** Whether the existing v1.4 entry's "Deferred to v1.5+" bullets all map cleanly to the v1.5 outcome. Phase 37 D-18 writes the v1.5 entry but does NOT retroactively edit v1.4's deferred list — a future "CHANGELOG hygiene" phase could.

### Provider-restoration prep (post-v1.5 if/when reconsidered)

- **Paid Cerebras or Groq tier (~$5-50/mo)** to bypass the free-tier rate-limit ceiling. Per ADR-0010 Phase 34 sub-block "follow-up candidates" list. Not Phase 37 scope.
- **Adaptive Retry-After-aware NIM limiter.** Per ADR-0010 Phase 30 sub-block — `retryAfterMs` field already on `callHistory`; wiring into `nvidiaNimWindow` is deferred to a future LLM-RELI phase.
- **Per-provider eval infrastructure** (`providerProvenance` + `EvalScore.byProvider` shape + UI block). Per ADR-0010 Phase 34 sub-block; only re-introduced alongside actual provider restoration work.
- **`cascade_exhausted` DLQ taxonomy.** Per ADR-0010 Phase 34 sub-block; deferred alongside the per-provider eval work.

### Future ADR/docs phases (post-v1.5)

- **ADR-0011 Phase 37 sub-block.** ADR-0011 (v3 LLM pipeline architecture) got a Phase 36 sub-block via Phase 36 D-21. Phase 37 does NOT append a Phase 37 sub-block — milestone-close work is concentrated in ADR-0010. A future "ADR hygiene" phase could add cross-links between the two ADRs at milestone-close boundaries.
- **OpenAPI full-spec audit + Zod-handler reconciliation.** Phase 36 D-05 capped at additions + lightweight verify. A future "API hardening" phase could mechanically reconcile every spec entry against its handler's actual response shape via runtime response validation in tests.
- **ROADMAP / REQUIREMENTS retroactive rewording.** Phase 36 D-04 + Phase 37 D-15 leave planning text untouched. A future "planning artifact refresh" phase could reconcile them with shipped reality if the framing-gap accrual becomes confusing.

### Reviewed Todos (not folded)

- **phase-27.4.2-ci-health.md** (score 0.6) — Reviewed but not folded. Keywords matched on "status, captured, 2026, phase, close" but the todo content is about Phase 27.4.2 CI health work, not Phase 37 milestone close. Out of scope.
- **phase-27.4.3-deckgl-v9-type-drift.md** (score 0.6) — Reviewed but not folded. Same keyword-overlap-without-scope-overlap pattern. Out of scope.
- **phase-27.4.5-llm-pipeline-observability.md** (score 0.6) — Reviewed but not folded. Phase 27.4.5 LLM observability flight recorder was operator-rejected at v1.5 milestone start (per REQUIREMENTS.md §Out of Scope row). Not folded.

</deferred>

---

_Phase: 37-adr-0010-acceptance-gate-closeout_
_Context gathered: 2026-05-30_
