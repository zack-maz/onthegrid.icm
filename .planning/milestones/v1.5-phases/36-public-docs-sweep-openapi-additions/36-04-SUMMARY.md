---
phase: 36-public-docs-sweep-openapi-additions
plan: 04
subsystem: docs
tags: [degradation, pitfall-1, fallback-chain, contract, v3-only, public-docs]
requires:
  - docs/degradation.md (pre-Phase-36 state — Phase 26.4 contract grounding, no Pitfall 1 mention)
  - server/__tests__/resilience/redis-death.test.ts (test that pins Pitfall 1 contract — exists, unmodified)
  - server/routes/events.ts (Pitfall 1 cache bridge implementation — exists, unmodified)
  - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md (v1/v2 deletion rationale — exists, unmodified)
provides:
  - 'docs/degradation.md `### Pitfall 1 contract — the "map never goes blank" invariant` sub-section under Cache Layer (lines 71-103)'
  - 'v3 → raw GDELT chain language in public docs (no v1, no v2)'
  - 'explicit Phase 29 deletion acknowledgement with ADR-0010 cross-link'
  - 'inline citation of redis-death.test.ts as mechanical proof of contract'
affects:
  - docs/degradation.md (single file; +34 lines; 303 → 337)
tech_stack:
  added: []
  patterns:
    - 'sub-section nesting (### under ##) for contract refinement that conceptually belongs to existing layer narrative — avoids new top-level section proliferation per Claude-Discretion minimal-change'
    - 'paraphrase-not-quote of stale wording from planning artifacts (keeps public docs free of legacy-chain literals while still acknowledging the historical brief)'
key_files:
  created: []
  modified:
    - 'docs/degradation.md'
decisions:
  - 'D-15 + D-16 single rollup commit (CONTEXT.md D-27 allows when edits touch the same insertion site)'
  - 'in-place sub-section under Cache Layer (Pitfall 1 is conceptually the cache-bridge degraded-behavior narrative, not a separate top-level concern)'
  - 'paraphrase the legacy "v3 → v2 → v1 → raw GDELT" framing rather than quoting it verbatim — keeps the file clean of stale-chain literals while still acknowledging the planning-text gap (per CONTEXT.md D-04 framing-gap policy)'
metrics:
  duration_minutes: 7
  completed: '2026-05-30T05:00:38Z'
---

# Phase 36 Plan 04: Degradation Contract Update — Pitfall 1 + v3-only Chain Summary

Single-file edit adds the "map never goes blank" Pitfall 1 contract as a `###` sub-section under the existing Cache Layer in `docs/degradation.md`, documenting the v3 → raw GDELT fallback chain with explicit Phase 29 v1/v2-deletion acknowledgement, all three required cross-links (events.ts bridge, redis-death.test.ts proof, ADR-0010 rationale), and zero changes outside the target file.

## Insertion Approach Chosen

**In-place refinement of Cache Layer (sub-section approach).**

The drift-detection grep pass surfaced ZERO existing mentions of `Pitfall 1`, `v3`, `LLM`, `raw GDELT`, or `Phase 29` in degradation.md as it existed pre-edit. The Cache Layer section (lines 22-69) talks exclusively about Upstash Redis being unreachable and falling through to in-memory `memCache` — it doesn't cover the conceptually-distinct case where Redis IS reachable but the `events:llm:v3` key is empty/stale.

Per the plan STEP C decision tree:

- Cache Layer does NOT mention Pitfall 1 today → "APPEND the verbatim contract statement at the end of the Cache Layer section" branch.
- Per Claude-Discretion minimal-change default: prefer in-place addition under Cache Layer rather than a new top-level section.

Resolved as: **a new `### Pitfall 1 contract — the "map never goes blank" invariant` sub-section** nested under `## Cache Layer: Upstash Redis`, inserted immediately after the "Proven by the chaos test" bullet and immediately before the section's `---` divider that separates it from `## Data Source Layer`. Sub-section heading uses `###` so it's discoverable in TOC tooling without elevating Pitfall 1 to a sibling-of-Cache-Layer top-level concern.

## Line Range of New Contract Statement

`docs/degradation.md` lines 71-103 (33 lines of new content + 1 blank-line separator = 34 lines added to the file).

| Line range | Content                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 71         | `### Pitfall 1 contract — the "map never goes blank" invariant` heading                                                           |
| 73-80      | Contract statement (v3 LLM pipeline optional; events:llm:v3 empty/stale; /api/events serves raw GDELT via Pitfall 1 cache bridge) |
| 82-86      | Invariant claim + redis-death.test.ts citation                                                                                    |
| 88-93      | Phase 29 v1/v2 deletion acknowledgement + ADR-0010 cross-link + "terminal fallback is raw GDELT" reframing                        |
| 95-97      | Fenced text block: `v3 (cron-driven extraction, daily 04:00 UTC) → raw GDELT (Pitfall 1 cache bridge terminal fallback)`          |
| 99-103     | Planning-text framing-gap acknowledgement (paraphrased, not verbatim quote — see "Drift Hits Remediated" below)                   |

## Drift Hits Remediated

The drift-detection grep pass surfaced **zero hits in the pre-edit file** for all four drift signals from `<interfaces>` "Drift signals to fix":

| Drift signal                                                 | Pre-edit hits | Action |
| ------------------------------------------------------------ | ------------- | ------ |
| `"v3 → v2 → v1 → raw GDELT"` or `"three.*pipeline versions"` | 0             | n/a    |
| `llmEventExtractor\.v[12]` (live module references)          | 0             | n/a    |
| Prose claiming a fallback to v2 or v1 when v3 fails          | 0             | n/a    |
| Prose framing the Pitfall 1 bridge as conditional / future   | 0             | n/a    |

**Reasoning for zero remediation hits:** degradation.md was authored in Phase 26.4 — predating the Phase 29 cascade narrowing that introduced the v3 → v2 → v1 framing in planning text. The Phase 26.4 author wrote about the Cache Layer (Upstash) and Data Source Layer (8 upstream APIs) without explicitly discussing the LLM pipeline, so no stale LLM-cascade prose accumulated here. The Pitfall 1 contract is genuinely **new** material to this file, not a rewrite of stale material.

### Self-introduced stale-chain literal — caught and remediated mid-edit

During verification, my first-pass insertion contained a literal verbatim quote of the legacy framing — `"v3 → v2 → v1 → raw GDELT"` — inside the acknowledgement paragraph at line ~100. The plan's verification grep `! grep -qE "v3 .* v2 .* v1|three.*pipeline versions"` caught it immediately. Remediation: paraphrased the acknowledgement to describe the legacy framing semantically without emitting the literal chain string. Final wording:

```
Older planning artifacts (ROADMAP.md success criteria, etc.) may
reference a legacy multi-version cascade framing that names v1
and v2 as intermediate fallbacks — that wording predates Phase 29
deletion and is preserved in planning text as historical brief.
Public docs (this file) describe shipped reality.
```

This honors CONTEXT.md D-04 (planning text stays as-is; public docs describe shipped reality; SUMMARY notes the gap) without contaminating the public doc with a stale-chain literal that mechanical drift gates would flag in future audits.

## Cross-link Inventory

All 3 new inline markdown links verified to resolve on disk (relative paths from `docs/degradation.md`):

| Link                                         | Relative path                                            | Status |
| -------------------------------------------- | -------------------------------------------------------- | ------ |
| Pitfall 1 cache bridge implementation        | `../server/routes/events.ts`                             | EXISTS |
| Contract proof — Redis-death chaos test      | `../server/__tests__/resilience/redis-death.test.ts`     | EXISTS |
| Phase 29 v1/v2 deletion rationale — ADR-0010 | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` | EXISTS |

Plan 36-06 D-24 `markdown-link-check` gate will re-verify these mechanically across the docs tree at phase close. No broken cross-references introduced by this edit.

Note: the `redis-death.test.ts` cross-link is referenced **twice** in the file — once in the existing intro paragraph (line 17, pre-edit) and once in the new Pitfall 1 sub-section (line 83, new). Both use the same relative path; both resolve identically. Duplicate citation is intentional: the intro frames it as "exercises the full cache-layer degradation path" (general); the Pitfall 1 sub-section frames it as "proves the chain works under Redis death" (specific to the v3 → raw GDELT terminal contract). Two different framings, one test file, both honest.

## Commit

| Hash      | Subject                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `62c2bdb` | `docs(36): D-15 D-16 update degradation.md — Pitfall 1 contract + v3 → raw GDELT chain` |

Single rollup commit (not split D-15 / D-16) because both decisions touch the same insertion site (the new Pitfall 1 sub-section): D-15 contributes the Pitfall 1 contract statement and the redis-death citation; D-16 contributes the v3 → raw GDELT chain + Phase 29 deletion acknowledgement + ADR-0010 cross-link. Per CONTEXT.md D-27 atomic-per-decision discipline, atomicity is honored when the unit-of-decision is the unit-of-commit; here both decisions form a single conceptual unit (the Pitfall 1 contract IS the v3 → raw GDELT chain in narrative form), so one commit body that names both decisions satisfies the atomic-per-decision invariant.

Commit body explicitly cites both `D-15` and `D-16` in separate body sections, providing line-range pointers (71-103) and per-link resolution status. Pre-commit hooks ran clean: prettier formatted the file (no semantic diff), gitleaks scanned 0 leaks. Commit landed on per-agent branch `worktree-agent-a37c4c6c0b275dfb6`.

## Verification

### Plan-mandated automated gate (PLAN.md `<verify>` block)

All 6 checks PASS:

| Check                                                        | Result |
| ------------------------------------------------------------ | ------ |
| `grep -q "v3 .*raw GDELT" docs/degradation.md`               | PASS   |
| `grep -q "Phase 29" docs/degradation.md`                     | PASS   |
| `grep -q "redis-death.test.ts" docs/degradation.md`          | PASS   |
| `grep -q "0010-v1-5-llm-pipeline-narrowing-and-deletion.md"` | PASS   |
| `! grep -qE "v3 .* v2 .* v1\|three.*pipeline versions"`      | PASS   |
| `! grep -qE "llmEventExtractor\.v[12]"`                      | PASS   |

### Acceptance criteria (PLAN.md `<acceptance_criteria>` block)

| Criterion                                                                                          | Status    |
| -------------------------------------------------------------------------------------------------- | --------- |
| Contains v3-only chain wording ("v3 → raw GDELT")                                                  | MET       |
| Explicit Phase 29 v1+v2 deletion acknowledgement                                                   | MET       |
| Cross-link to redis-death.test.ts as proof                                                         | MET       |
| Cross-link to ADR-0010 for v1/v2-deletion rationale                                                | MET       |
| Cross-link to server/routes/events.ts for Pitfall 1 bridge                                         | MET       |
| No "v3 → v2 → v1" / "three pipeline versions" / live v1/v2 module refs                             | MET       |
| Cache Layer section reads coherently (new sub-section integrates with existing narrative)          | MET       |
| `git log -1 --format=%s docs/degradation.md` matches `docs(36):` with `D-15` AND/OR `D-16` in body | MET       |
| File size grew by ≤ 40 lines (target 30-40)                                                        | MET (+34) |

### Test suite delta

`docs/degradation.md` is pure markdown; no source / test code touched in this plan. No vitest re-run needed for this plan in isolation (Plan 36-06 D-24 runs the global gate `npx vitest run` + `npm run docs:lint` + `npx @redocly/cli lint` at phase close).

### Self-Check: PASSED

- `docs/degradation.md` exists, 337 lines, modified by this plan: **VERIFIED** (`git log -1 --stat` shows 34 insertions, 0 deletions).
- Commit `62c2bdb` exists on `worktree-agent-a37c4c6c0b275dfb6` branch: **VERIFIED** (`git log --oneline -1 62c2bdb`).
- Cross-links resolve on disk: **VERIFIED** (3/3 files exist at the paths claimed).
- No modifications to STATE.md / ROADMAP.md / REQUIREMENTS.md: **VERIFIED** (`git diff HEAD~1 HEAD --name-only` shows only `docs/degradation.md`).

## Decisions Implemented

| Decision | Action                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-15     | Pitfall 1 "map never goes blank" contract statement added as `### Pitfall 1 contract` sub-section under Cache Layer; redis-death.test.ts cited as mechanical proof. |
| D-16     | v3 → raw GDELT chain documented (no v1, no v2); Phase 29 deletion explicitly acknowledged; ADR-0010 cross-linked.                                                   |

## Deviations from Plan

None — plan executed exactly as written.

The plan offered two commit-shape options (single rollup vs. two split commits per decision). Selected the single rollup per CONTEXT.md D-27 reading: D-15 and D-16 land in the same paragraph block (the contract statement IS the chain documentation), so splitting them would produce two commits where the first commit creates content the second commit modifies — needless rework. Single commit names both decisions in body; atomic-per-decision honored at the body-section level.

Mid-edit, my first-pass insertion contained a verbatim quote of the legacy "v3 → v2 → v1 → raw GDELT" framing as part of the acknowledgement-of-stale-wording paragraph. The plan's verification grep caught it (Rule 1 - Bug: verification fail). Remediated by paraphrasing the legacy framing rather than quoting it verbatim. Both passes (initial + remediation) happened before the commit, so the commit history shows only the clean final state. Logged here for completeness, not deviation: the plan's verification gate is intentionally strict (no stale literals anywhere in the public doc), and the remediation honors that.

## Threat Flags

None. This plan touches a pure-prose markdown file with three new internal cross-links; no new network endpoints, auth paths, file access patterns, or schema boundaries introduced. Per the threat register (T-36-04-01 information-disclosure: accepted — failure-mode contracts are this file's purpose; T-36-04-02 tampering of cross-link paths: mitigated by D-24 markdown-link-check gate in Plan 36-06).

## Coverage

- **DOCS-PUB-05** — addressed in full. Pitfall 1 contract statement + v3 → raw GDELT chain documented in `docs/degradation.md`. Phase 36-06 close-out verifies via the D-24 mechanical gates.

## Known Stubs

None. The new Pitfall 1 sub-section contains live prose with three resolved cross-links; no placeholder text, no TODOs, no hardcoded empty values. The contract statement is declarative ("the map never goes blank — only enrichment quality degrades") not conditional ("the map may go blank if…"), which is what D-15 explicitly requires.

## Self-Check: PASSED

All claimed files exist, the single commit exists on the worktree branch, all three new cross-links resolve, and the plan's mechanical verification grep block exits 0. No discrepancies between this SUMMARY and the actual repository state.
