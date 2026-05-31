# Phase 37: ADR-0010 + Acceptance Gate Closeout - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 37-adr-0010-acceptance-gate-closeout
**Areas discussed:** ADR-0010 close sub-block scope, Acceptance-gate observation protocol, Plan decomposition + waves, Milestone-close SUMMARY.md framing

---

## Area-Selection Round

| Option                               | Description                                                                                                                                      | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| ADR-0010 close sub-block scope       | What goes in: just decision summary, milestone-close rollup, or full ADR rewrite? Cross-link strategy to all 9 requirements? Status line update? | ✓        |
| Acceptance-gate observation protocol | Cadence (back-to-back vs spaced), failure handling, evidence capture, operator out-of-band trigger                                               | ✓        |
| Plan decomposition + waves           | 3 vs 2 vs 1 plan; wave shape given 02 wall-clock blocks 03                                                                                       | ✓        |
| Milestone-close SUMMARY.md framing   | Per-phase rollup, framing-gap catalog carryover, quantitative snapshot, v1.6 promotion readiness, CHANGELOG[v1.5]                                | ✓        |

**User's choice:** All 4 areas selected via multiSelect.
**Notes:** Phase 37 is a small milestone-close phase but every decision compounds into the public artifacts (ADR, SUMMARY, CHANGELOG) that document v1.5 forever. All gray areas worth locking before planning.

---

## ADR-0010 close sub-block scope

### Q1: Sub-block content scope

| Option                                    | Description                                                                                    | Selected |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Decision-summary only (Phase 35-style)    | Mirror Phase 35: 6-10 D-N rows; ~80-120 lines; minimal                                         |          |
| Decision-summary + milestone-close rollup | Phase 35-style D-N rows + cumulative v1.5 retrospective; ~150-200 lines                        |          |
| Full ADR rewrite + sub-blocks preserved   | Rewrite body to milestone-final state; keep 5 sub-blocks as historical waymarkers; ~250+ lines | ✓        |

**User's choice:** Full ADR rewrite + sub-blocks preserved.
**Notes:** Aligns with Phase 36's "describe shipped not aspirational" framing. ADR body describes final shipped reality (NIM-only at runtime, v1+v2 deleted, etc.) — not the Phase 29-open intent partly superseded by Phases 30.1 + 34. Sub-blocks show how we got here.

### Q2: `<expand_at_36>` marker handling

| Option                              | Description                                                                                                                                                      | Selected |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Absorb into rewrite + delete marker | Rewrite Consequences/Alternatives/References against milestone-final reality; fill References fully; delete `<expand_at_36>` HTML comment. Single canonical ADR. | ✓ (rec)  |
| Keep marker, expand minimally       | Leave marker + add Phase 37 close subsection beneath it. Awkward inline marker.                                                                                  |          |
| Delete marker, keep current bodies  | Delete marker but keep existing Phase-29-perspective bodies. Tension with full-rewrite decision.                                                                 |          |

**User's choice:** "your recommendation" → Absorb into rewrite + delete marker.
**Notes:** Cleanest path — Phase 36 wrote the marker as "Phase 37 will absorb this"; absorbing = deleting the marker.

### Q3: Requirement tracking style

| Option                                         | Description                                                                                   | Selected |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| Inline citation per D-N row                    | Each D-N row cites its closed requirement inline                                              | ✓ (rec)  |
| Closing-table format (Phase 36 D-25 precedent) | Sub-block ends with Req-ID/Status/Evidence table; cleaner grep but duplicative if also inline |          |
| Both — inline + closing table                  | Maximally explicit; some duplication                                                          |          |

**User's choice:** Inline citation per D-N row.
**Notes:** Matches Phase 35 D-15 / Phase 36 D-25 conventions. SUMMARY closing-table provides the second cross-reference surface so no duplication needed in the ADR sub-block.

### Q4: Status line update

| Option                             | Description                                                                                                                      | Selected |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Add second status line             | Append "Status: Accepted (v1.5 closed YYYY-MM-DD)" below existing "Status: Accepted". Two-state visual; preserves original date. | ✓ (rec)  |
| Edit in-place                      | Change line 3 to single combined line. Tighter but loses two-state evolution.                                                    |          |
| Leave 'Status: Accepted' untouched | Most ADR-orthodox (Nygard immutable); milestone-close info lives entirely in sub-block. Least operator-skimmable.                |          |

**User's choice:** Add second status line.
**Notes:** Preserves the Phase 29-open acceptance date (2026-05-11) as the decision-acceptance point; surfaces milestone-close as the lifecycle terminus.

### Q5: Continue or move on?

**User's choice:** Next area (Acceptance-gate observation protocol).

---

## Acceptance-gate observation protocol

### Q1: Cadence between 3 runs

| Option                                | Description                                                                                                             | Selected (final) |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Back-to-back (~10-30 min apart)       | ~30-90 min wall-clock; maximally efficient; doesn't prove daily-cron-tick stability                                     |                  |
| Spaced across one day (~4-8 hr apart) | 3 runs over one day; crosses time-of-day patterns; ~12-16 hr wall-clock                                                 |                  |
| Spaced across 24-48 hours (1 per day) | 1 run per day for 3 days; crosses the 04:00 UTC daily cron tick; ~48-72 hr wall-clock; closest to Phase 31 7-day spirit | ✓ (rec)          |

**User's initial choice:** Back-to-back (~10-30 min apart).
**User's revised choice:** "your recommendation - same for the last two questions as well if it differs from my answer" → Spaced across 24-48 hours (1 per day).
**Notes:** User flipped to my recommendation. The cron-tick crossing is the load-bearing rationale — back-to-back wouldn't observe the system across a daily LLM extraction cycle. Hard reset on red (Q2) becomes more meaningful at this cadence since the system has more opportunity for natural drift.

### Q2: Failure handling

| Option                      | Description                                                                                    | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Hard reset — restart from 0 | Any red wipes the streak; matches Phase 31 strictness                                          | ✓ (rec)  |
| Longest-streak-of-3         | Last 3 in a row count as the consecutive streak; loose                                         |          |
| Investigate-and-retry       | Red triggers root-cause investigation; transient = retry from current; structural = gate fails |          |

**User's choice:** Hard reset — restart from 0 (matched my rec).
**Notes:** Phase 31's "validated single-day" caveat under a hard-reset rule would NOT have counted as a 7-day pass; the same strictness applies here. Consistent with milestone-close discipline.

### Q3: Evidence capture

| Option                                        | Description                                                                                                         | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Inline in SUMMARY.md — URL + payload triplet  | Dedicated section with 3 rows (run URL + timestamp + full JSON payload). Reviewer verifies without leaving the doc. | ✓ (rec)  |
| Run URLs in SUMMARY, payloads in JSON sidecar | Cleaner SUMMARY; separately greppable archive                                                                       |          |
| Run URLs only — ephemeral evidence            | Payloads rot after 7d Redis TTL + GH log retention                                                                  |          |

**User's choice:** Inline in SUMMARY.md — URL + payload triplet (matched my rec).
**Notes:** Payloads survive git forever. Sidecar JSON is just another file that can drift or be forgotten. Inline in SUMMARY = milestone-close proof lives where reviewers look.

### Q4: Operator trigger framing

| Option                                                 | Description                                                                                                                                               | Selected |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Operator (manual) — documented as out-of-band step     | Plan 37-02 explicitly flags workflow_dispatch as operator out-of-band (mirrors Phase 29 Vercel-Pro pattern). Executor can't fire workflow on credentials. | ✓ (rec)  |
| Operator (manual) — implicit, not specially called out | Same reality but treated as normal task. Risk: executor fails on credentials mid-step.                                                                    |          |
| Add automated 3-run dispatch script                    | scripts/run-prod-audit-thrice.sh; premature automation for a one-shot phase-close action                                                                  |          |

**User's choice:** "your recommendation" → Operator (manual) — documented as out-of-band step.
**Notes:** Phase 29's "operator upgrades Vercel to Pro BEFORE plans run" pattern is the inheritance. Calling out operator actions up-front prevents executor agents from failing silently on missing credentials.

### Q5: Continue or move on?

**User's choice:** Next area (Plan decomposition + waves).

---

## Plan decomposition + waves

### Q1: Plan slicing

| Option                             | Description                                                                                                               | Selected |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| 3 plans: ADR / gate / close        | 37-01 ADR rewrite + close sub-block; 37-02 gate observation; 37-03 close (CHANGELOG + SUMMARY + flips). Clean separation. | ✓ (rec)  |
| 2 plans: ADR / combined gate+close | Fewer plan files; gate-observation + close ritual share a plan                                                            |          |
| 1 plan: everything inline          | Smallest scope; risk of single plan spanning days of operator wall-clock                                                  |          |

**User's choice:** 3 plans: ADR / gate / close.
**Notes:** Each plan is independently reviewable; close plan is intrinsically separate because it depends on gate evidence existing.

### Q2: Wave shape

| Option                                                       | Description                                                                                                                        | Selected             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Strictly sequential: 01 → 02 → 03                            | ADR ships first with cross-link to SUMMARY gate evidence; gate runs; close writes SUMMARY. Each plan blocks next. Total ~3-5 days. | ✓ (rec; user picked) |
| Parallel 01+02 → 03                                          | ADR + gate kickoff simultaneously; ADR ships placeholder. Saves ~24-48h but ADR has two-edit lifecycle.                            |                      |
| 01 (ADR placeholder) → 02 (gate) → 03 (close + ADR finalize) | Sequential but ADR is honest at every commit via placeholder                                                                       |                      |

**User's choice:** "your recommendation" → Strictly sequential: 01 → 02 → 03.
**Notes:** Clarified in CONTEXT D-11: ADR sub-block's D-N row references gate evidence via cross-link to SUMMARY ("see 37-SUMMARY.md §Acceptance Gate Observation for triplets"). Stable reference to a section that will exist by close. ADR is honest at every commit.

### Q3: Branch + commit discipline

| Option                                | Description                                                                                                     | Selected             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| Inherit Phase 36 verbatim             | `feature/37-...` from main; atomic per-decision commits; `docs(37):`/`chore(37):` prefixes; plan-rollup commits | ✓ (rec; user picked) |
| Inherit + add 'gate(37):' commit type | New convention for 3 gate-observation commits in 37-02. Premature for 3 commits.                                |                      |
| Single PR-style commit per plan       | Drop atomic per-decision in favor of one commit per plan. Loses Phase 30→36 invariant.                          |                      |

**User's choice:** "your recommendation for this and everything else remaining" → Inherit Phase 36 verbatim.
**Notes:** User signaled high trust — locking my recommendations for all remaining decisions. From this point I batched the remaining Plan + SUMMARY framing decisions into a single confirmation gate.

---

## Milestone-close SUMMARY.md framing (batched + locked)

### Single consolidated lock-in question

| Sub-decision                       | My recommendation                                                                        | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Verification gates                 | Inherit Phase 36 D-24 (vitest + Redocly lint + markdown-link-check)                      | ✓        |
| Per-phase rollup table             | All 10 v1.5 phases (29, 30, 30.1, 31, 32, 33, 34, 35, 36, 37)                            | ✓        |
| Framing-gap callouts               | Inherit Phase 36's 6 + add 1 new for cadence-interpretation deviation                    | ✓        |
| Quantitative snapshot              | Follow CHANGELOG[v1.4] entry shape (tests, bundle, ADRs, registry, cron, commits, hours) | ✓        |
| v1.6 promotion readiness statement | Explicit "999.5 unblocked; REVEAL-01/02 are v1.6 scope"                                  | ✓        |
| CHANGELOG[v1.5]                    | Inline in Plan 37-03; mirror CHANGELOG[v1.4] structure exactly                           | ✓        |
| Closing-table format               | D-N rows in 37-SUMMARY.md per Phase 35 SUMMARY precedent                                 | ✓        |

**User's choice:** Lock all — proceed to CONTEXT.md.
**Notes:** User accepted the consolidated package without overrides. All 19 decisions (D-01..D-19) recorded in CONTEXT.md decisions section.

---

## Claude's Discretion

Captured inline in CONTEXT.md `<decisions>` § Claude's Discretion. Notable items:

- ADR-0010 status-line preservation of `2026-05-11` Phase-29-open date (recommended: yes — keep original date on line 3; milestone-close date on new line 4).
- ADR-0010 close sub-block "Architecture-level numbers" cross-link to `docs/architecture/llm-pipeline-reliability.md` (recommended: yes — mirrors Phase 30 / 30.1 / 34 / 35 sub-block convention).
- 37-SUMMARY.md closing-table column shape — "Hours spent" column? (recommended: no for closing table; surface aggregate hours in D-16 quantitative snapshot instead).
- ADR-0010 References block commit notation — by SHA or by commit-message range? (recommended: commit range `<first-Phase-29-commit>..<last-Phase-37-commit>`; filled at PR merge time).
- Cascade-evolution Mermaid diagram in ADR-0010 rewrite (recommended: no — sub-blocks + milestone-final body already tell the story; diagram would risk drift against `docs/architecture/llm-pipeline-reliability.md`).
- Plan 37-02 specifying which run-of-the-day is preferred (recommended: leave flexible — any 24h-apart triplet works; document only that ≥1 cron-tick at 04:00 UTC is crossed during the streak).
- 37-SUMMARY.md `## Operator Out-of-Band Actions` section listing 3 workflow_dispatch triggers (recommended: yes — single-row section; mirrors Phase 29 D-08 Vercel-Pro callout pattern).
- CHANGELOG[v1.5] `### Migration notes` callout for API Health tab merge state (recommended: no — Phase 28.2 W5 merged it in v1.4; v1.5 didn't touch it).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`. Highlights:

- **v1.6 prep:** 999.5 load test promotion ritual (executed at v1.6 start, not Phase 37); REVEAL-01 polish; REVEAL-02 public domain; CHANGELOG[v1.4] retroactive deferred-list audit.
- **Provider-restoration prep:** Paid Cerebras/Groq tier; adaptive Retry-After-aware NIM limiter; per-provider eval infrastructure; cascade_exhausted DLQ taxonomy.
- **Future ADR/docs phases:** ADR-0011 Phase 37 sub-block (skip — milestone-close work concentrated in ADR-0010); OpenAPI full-spec audit; ROADMAP/REQUIREMENTS retroactive rewording.
- **Reviewed Todos (not folded):** phase-27.4.2-ci-health, phase-27.4.3-deckgl-v9-type-drift, phase-27.4.5-llm-pipeline-observability — all scored 0.6 on keyword overlap but content is unrelated to Phase 37 milestone-close scope.
