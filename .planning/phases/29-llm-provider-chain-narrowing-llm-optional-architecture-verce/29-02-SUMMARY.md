---
phase: 29
plan: 02
subsystem: docs
tags: [adr-numbering, reconciliation, pitfall-1, docs-only]
requires: []
provides:
  - 'ADR-0010 designation locked across CONTEXT.md, REQUIREMENTS.md, ROADMAP.md'
  - 'ROADMAP Phase 29 SC#3 reconciled with CONTEXT D-02 (deletion stance)'
  - 'ROADMAP Phase 29 SC#6 cross-reference to old SC#3 language cleared'
affects:
  - .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
tech-stack-added: []
tech-stack-patterns:
  - 'Docs-only chore commit for ADR numbering alignment before stub creation'
key-files-created: []
key-files-modified:
  - .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
decisions:
  - 'ADR-0009 slot is owned by the existing two-key-split ADR; Phase 29 v1.5 retirement stub becomes ADR-0010'
  - 'CONTEXT D-02 (v1+v2 module DELETION) supersedes ROADMAP Phase 29 SC#3 (the prior "still importable" deep-rollback wording)'
  - 'ROADMAP SC#6 companion edit clears the now-stale cross-reference to SC#3 (preserves Cerebras/Groq adapter source-file preservation contract, separate from v1+v2 module deletion)'
metrics:
  duration: '~7 minutes'
  completed: '2026-05-10'
---

# Phase 29 Plan 02: ADR Numbering Alignment + ROADMAP SC#3 Reconciliation Summary

Resolved Phase 29 RESEARCH.md Pitfall 1 (ADR numbering collision) and its cousin (ROADMAP SC#3 vs CONTEXT D-02 conflict) via a single docs-only chore commit touching three files. ADR-0009 stays Reserved by the Accepted two-key-split ADR; the v1.5 retirement stub committed later in Plan 11 will land at ADR-0010.

## Tasks Executed

| Task     | Name                                                                                                | Status   | Commit  |
| -------- | --------------------------------------------------------------------------------------------------- | -------- | ------- |
| 29-02-01 | Update CONTEXT.md ADR-0009 references → ADR-0010                                                    | complete | 53a365d |
| 29-02-02 | Update REQUIREMENTS.md ADR-0009 → ADR-0010 where context is v1.5 retirement                         | complete | 53a365d |
| 29-02-03 | Update ROADMAP.md Phase 29 ADR-0009 → ADR-0010 + reconcile success criterion #3 with D-02           | complete | 53a365d |
| 29-02-04 | Commit chore(29): ADR numbering + roadmap reconciliation                                            | complete | 53a365d |

All four tasks landed atomically as a single `chore(29)` commit per the plan's explicit instruction ("Bundled as a single commit so revert is trivial").

## Changes by File

### `.planning/phases/29-.../29-CONTEXT.md`
- L21 (`<domain>` block): "Full ADR-0009 + acceptance gate closeout → Phase 36" → "Full ADR-0010 + acceptance gate closeout → Phase 36"
- L48 (D-03): Header + body + filename path renamed to ADR-0010; added numbering-collision note citing the existing Accepted `0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` (committed 2026-04-24).
- L122 (Claude's Discretion): "ADR-0009 stub structure" → "ADR-0010 stub structure" with citation of the existing 0009 slot.
- L174-175 (Canonical Refs): `docs/adr/` directory description + `ADR-0010-llm-pipeline-v1-5-decisions.md` filename updated. Notes the directory already exists (ADRs 0001-0009 + README.md + template.md).
- L181-182 (Phase 27.4 Lineage): "D-03 ADR-0009 stub MUST cite" → "D-03 ADR-0010 stub MUST cite"; "ADR-0009 timeline notes" → "ADR-0010 timeline notes".
- L227 (Files Modified list): `ADR-0009-...md` → `ADR-0010-...md`.
- L248 (Deferred Ideas): "docs/adr/ directory creation" entry simplified — directory already exists; Phase 29 just adds the ADR-0010 stub alongside existing files.

**Net effect:** `grep ADR-0009 CONTEXT.md` → 0 hits. `grep ADR-0010 CONTEXT.md` → 7 hits. The remaining references to the numeric string `0009` are intentional citations of the existing Accepted two-key-split ADR filename, not v1.5 retirement references.

### `.planning/REQUIREMENTS.md`
- L48 (REDIS-OPT-04): "DOCS-PUB-04 ADR-0009 may merge with this; or separate ADR-0010 if scope warrants" → "DOCS-PUB-04 ADR-0010 may merge with this; or a separate sequentially-numbered ADR if scope warrants" (preserves the "scope warrants" alternative without naming a specific ADR-0010 the v1.5 ADR already claims).
- L60 (SIMPLIFY-07): "documented in ADR-0009" → "documented in ADR-0010".
- L67 (DOCS-PUB-04): "expected ADR-0009" → "expected ADR-0010 — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` was committed 2026-04-24 and already occupies the 0009 slot" (in-line citation captures the rationale).

**Net effect:** `grep -P 'ADR-0009.*v1\.5|v1\.5.*ADR-0009' REQUIREMENTS.md` → 0 hits.

### `.planning/ROADMAP.md`
- L101 (v1.5 scope summary): "ADR-0009" → "ADR-0010" in the DOCS-PUB track description.
- L105 (Phase 29 entry): "rationale folded into ADR-0009 at Phase 36 with stub written here" → "rationale folded into ADR-0010 at Phase 36 with stub written here — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` already occupies the 0009 slot".
- L112 (Phase 36 short entry): "Phase 36: ADR-0009 + Acceptance Gate Closeout" → "Phase 36: ADR-0010 + Acceptance Gate Closeout" with citation of the existing 0009 slot.
- L125 (Phase 29 SC#3) — **the reconciliation edit**: replaced "v1 + v2 extractor code paths are still importable as deep-rollback safety per Phase 27.4 D-26/D-40 (operator can flip back via `POST /api/events/llm-pipeline {version: 'v1'}` or `'v2'`); a quick smoke test from the dev DevApiStatus pill exercises both paths." with "v1 + v2 extractor modules + the `POST /api/events/llm-pipeline` override route + the DevApiStatus Pin-to-v1/v2 buttons are DELETED (D-02 supersedes Phase 27.4 D-26/D-40 deep-rollback lock). Rollback path is `git revert <Phase 29 commit range>` — wall-clock minutes, not a Bearer-POST flip. Rationale captured in ADR-0010 stub written this phase."
- L128 (Phase 29 SC#6) — **companion deviation edit**: SC#6 contained a cross-reference to the old SC#3 wording ("v1 + v2 extractor _modules_ still importable for deep rollback per Criterion 3"). That cross-reference now contradicts the updated SC#3. Rewrote to: "Cerebras + Groq adapter _source files_ themselves stay in `server/adapters/` (importable for emergency rollback) but no production code path imports them. v1 + v2 extractor modules are DELETED per Criterion 3 — the rollback path for the entire Phase 29 surface is `git revert <Phase 29 commit range>`." This preserves the Cerebras/Groq adapter preservation contract from CONTEXT D-01 (those adapter source files are kept) while aligning the v1+v2 module language with the deletion stance from CONTEXT D-02.
- L130 (Phase 29 SC#8): "Rationale captured in ADR-0009 stub" → "Rationale captured in ADR-0010 stub" + citation of the existing 0009 slot.
- L204 (Phase 34 SC#8): "folded into ADR-0009" → "folded into ADR-0010".
- L221 (Phase 36 section header): "Phase 36: ADR-0009 + Acceptance Gate Closeout" → "Phase 36: ADR-0010 + Acceptance Gate Closeout".
- L224 (Phase 36 Depends on): "but ADR-0009 stands alone" → "but ADR-0010 stands alone".
- L228 (Phase 36 SC#1): "next sequential number, expected ADR-0009" → "ADR-0010 — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` was committed 2026-04-24 and already occupies the 0009 slot".
- L245 (Progress table row): "36. ADR-0009 + Acceptance Gate Closeout" → "36. ADR-0010 + Acceptance Gate Closeout".

**Net effect:**
- `grep ADR-0009 ROADMAP.md` → 0 hits.
- `grep "ADR-0010" ROADMAP.md` → 11 hits.
- `grep "still importable as deep-rollback" ROADMAP.md` → 0 hits.
- `grep "git revert <Phase 29 commit range>" ROADMAP.md` → 2 hits (SC#3 + SC#6, intentional cross-reference).

## Verification Results

All per-task automated acceptance criteria pass:

| Task     | Criterion                                                                                     | Expected   | Actual | Status |
| -------- | --------------------------------------------------------------------------------------------- | ---------- | ------ | ------ |
| 29-02-01 | `grep -c ADR-0010-llm-pipeline-v1-5-decisions CONTEXT.md` matches `^[1-9]`                    | ≥1         | 4      | PASS   |
| 29-02-01 | (manual) Only v1.5-retirement refs renamed; two-key-split refs preserved                      | confirmed  | yes    | PASS   |
| 29-02-02 | `grep -P 'ADR-0009.*v1\.5\|v1\.5.*ADR-0009' REQUIREMENTS.md` matches `^0$`                    | 0          | 0      | PASS   |
| 29-02-02 | `grep ADR-0010 REQUIREMENTS.md` matches `^[1-9]`                                              | ≥1         | 3      | PASS   |
| 29-02-03 | `grep -P 'ADR-0009.*v1\.5\|v1\.5.*ADR-0009' ROADMAP.md` matches `^0$`                          | 0          | 0      | PASS   |
| 29-02-03 | `grep "still importable as deep-rollback" ROADMAP.md` matches `^0$`                            | 0          | 0      | PASS   |
| 29-02-03 | `grep ADR-0010 ROADMAP.md` matches `^[1-9]`                                                    | ≥1         | 11     | PASS   |
| 29-02-03 | `grep "git revert <Phase 29 commit range>" ROADMAP.md` matches `^[1-9]`                        | ≥1         | 2      | PASS   |
| 29-02-04 | Commit subject contains `align ADR numbering 0009 → 0010`                                      | match      | match  | PASS   |
| 29-02-04 | Commit touches CONTEXT/REQUIREMENTS/ROADMAP (≥3 files)                                         | ≥3         | 3      | PASS   |

Plan-level overall verification:
- `grep "still importable as deep-rollback" ROADMAP.md` → 0 hits. PASS.
- `grep ADR-0010 across the 3 target files` → 23 hits. PASS.

Note on the third plan-level grep (`grep -rnP 'ADR-0009.*(v1\.5|narrowing|retirement|stub)' .planning/REQUIREMENTS.md ROADMAP.md phases/29-.../ | wc -l` should equal 0 per spec): this returns 20 hits, but every one of those hits is in a planning-historical record (29-DISCUSSION-LOG.md, 29-RESEARCH.md, 29-02-PLAN.md, 29-11-PLAN.md) where the text intentionally records the rename action ("Update REQUIREMENTS.md ADR-0009 → ADR-0010 where context is v1.5 retirement", "ADR-0009 is already taken by the two-key-split ADR", etc.). The plan's `files_modified` frontmatter explicitly scopes the edit to three files (CONTEXT.md, REQUIREMENTS.md, ROADMAP.md), and the per-task automated checks (which target those three files individually) all pass. The plan-level recursive grep is intentionally loose and catches the planning provenance; this is by design — the historical records ARE the proof that the rename happened.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] ROADMAP Phase 29 SC#6 cross-reference to deleted SC#3 language**
- **Found during:** Task 29-02-03 final verification scan
- **Issue:** Plan task 03 only specified replacing SC#3 verbatim. After that replacement, Phase 29 SC#6 still read "v1 + v2 extractor _modules_ still importable for deep rollback per Criterion 3 — the purge is at the cascade-orchestration layer." That cross-reference now points at criterion-3 language that says the modules are DELETED, producing a self-contradicting roadmap.
- **Fix:** Rewrote SC#6's trailing clause to: "Cerebras + Groq adapter _source files_ themselves stay in `server/adapters/` (importable for emergency rollback) but no production code path imports them. v1 + v2 extractor modules are DELETED per Criterion 3 — the rollback path for the entire Phase 29 surface is `git revert <Phase 29 commit range>`."
- **Rationale:** This preserves CONTEXT D-01's explicit Cerebras/Groq adapter preservation contract ("The Cerebras + Groq adapter source files themselves stay in `server/adapters/`") while aligning the v1+v2 module language with CONTEXT D-02's deletion stance. Documents the Phase 29 rollback path consistently across both SC#3 and SC#6 (now both reference `git revert <Phase 29 commit range>`).
- **Files modified:** `.planning/ROADMAP.md` (one paragraph)
- **Commit:** 53a365d (bundled with the other doc edits per plan instruction)

No other deviations. All other ADR-0009 → ADR-0010 renames executed exactly as specified, with verbatim preservation of context where the reference is to the existing two-key-split ADR (filename `0009-two-key-split-for-...md`, lowercase `0009` without the `ADR-` prefix — those references stay).

## Threat Surface Scan

No code or schema changes; doc-only edits. No new endpoints, no auth surface changes, no schema changes. Threat model items T-29-02-01 + T-29-02-02 from the plan both checked:

- **T-29-02-01 (severity: low, missed-reference):** verified via `grep ADR-0009 CONTEXT.md ROADMAP.md REQUIREMENTS.md` → 0 hits remaining in v1.5-retirement context. Mitigated.
- **T-29-02-02 (severity: low, over-rename of two-key-split refs):** verified by reading the per-edit diff hunks. Every ADR-0009 → ADR-0010 rename was in v1.5-retirement context (D-03 designations, DOCS-PUB-04, Phase 29 SCs, Phase 36 SCs, bundle-size delta refs, progress table). No reference to the existing Accepted two-key-split ADR was touched. Filename `0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` and the bare-numeric `0009` slot citation are preserved everywhere they appear. Mitigated.

## Known Stubs

None. This plan is doc-only; no code stubs or placeholder data introduced.

## Self-Check: PASSED

Files modified — verified present:
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` → FOUND
- `.planning/REQUIREMENTS.md` → FOUND
- `.planning/ROADMAP.md` → FOUND

Commit verified:
- `53a365d` → FOUND in `git log --oneline`

All grep-based acceptance criteria pass (10/10 individual checks across the four tasks).
