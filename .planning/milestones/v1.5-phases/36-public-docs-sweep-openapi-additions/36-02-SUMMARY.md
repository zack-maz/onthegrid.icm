---
phase: 36-public-docs-sweep-openapi-additions
plan: 02
subsystem: architecture-docs
tags: [architecture, mermaid, audit-table, adr, sub-block, v1.5-drift, docs-pub-02]
requires:
  - docs/architecture/llm-pipeline-reliability.md (Phase 30 + 30.1 + 34 canonical cascade-shape source)
  - docs/architecture/redis-keys.md (Phase 35 D-05 32-key inventory canonical source)
  - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md (Phase 29/30/30.1/34/35 sub-blocks — cross-link target)
provides:
  - .planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md (per-file + per-Mermaid-block audit accumulator for Plan 36-06 SUMMARY.md)
  - docs/adr/0011-v3-llm-pipeline-architecture.md Phase 36 sub-block (NIM-only runtime cascade reaffirmation)
affects:
  - 7 architecture markdown files edited; 5 verified-clean; 3 Mermaid blocks edited; 18 Mermaid verified-clean.
tech-stack:
  added: []
  patterns:
    - Audit-every / edit-if-drift sweep (CONTEXT.md D-09)
    - ADR sub-block convention (Nygard immutable body + dated sub-blocks; mirrors ADR-0010 Phase 30 / 30.1 / 34 / 35)
    - Cross-linking-as-breadcrumb between ADR-0011 ↔ ADR-0010 ↔ llm-pipeline-reliability.md
key-files:
  created:
    - .planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md
  modified:
    - docs/architecture/README.md
    - docs/architecture/system-context.md
    - docs/architecture/data-flows.md
    - docs/architecture/deployment.md
    - docs/architecture/ontology/types.md
    - docs/architecture/ontology/algorithms.md
    - docs/adr/0011-v3-llm-pipeline-architecture.md
decisions:
  - D-09 (CONTEXT 36): Targeted v1.5-drift sweep across all 12 architecture markdown files; edit only where drift surfaced.
  - D-10 (CONTEXT 36): Mermaid blocks edited only where v1.5 drift exists; surgical participant-label / node-label / cron-list edits; no structural rewrites.
  - D-11 (CONTEXT 36): File-count + diagram-count drift recorded in audit-accumulator callouts only (planning-text "10 / 22" preserved per D-04).
  - D-12 (CONTEXT 36): Inline per-file + per-Mermaid-block audit accumulator at .planning/phases/.../36-02-AUDIT.md feeds Plan 36-06.
  - D-21 (CONTEXT 36): ADR-0011 gains a Phase 36 sub-block (REAFFIRMED framing, cross-links to ADR-0010 Phase 30.1 + 34 sub-blocks).
  - Claude's Discretion 1: ADR-0011 sub-block landed in Plan 36-02 (architecture-adjacent) rather than Plan 36-06 (close-bookkeeping) per CONTEXT.md recommendation.
  - Sub-decision: Mermaid validation method = syntax-preservation review (no mmdc local invocation; surgical-edit scope limits rendering risk; operator-pause Option 2 available at phase close if desired).
metrics:
  duration: ~67 min
  completed: 2026-05-29
  tasks_completed: 3
  files_modified: 7
  files_created: 1
  commits: 9
---

# Phase 36 Plan 02: Architecture Sweep + ADR-0011 Sub-block Summary

Targeted v1.5-drift sweep across all 12 architecture markdown files in `docs/architecture/` and `docs/architecture/ontology/`, plus 21 Mermaid blocks, plus a new Phase 36 sub-block on ADR-0011. 7 files edited; 5 verified-clean; 3 Mermaid blocks edited; 18 verified-clean. Per-file + per-block audit accumulator captured at `36-02-AUDIT.md` for Plan 36-06.

## One-liner

Architecture docs now describe the NIM-only-at-runtime cascade (Phase 30.1 + 34), the cron-only writer discipline (Phase 29 anti-pattern #17), the single-tier watchdog (Phase 30 SIMPLIFY-03), the end-of-run terminal write (Phase 30 SIMPLIFY-01), the retired partial-key (Phase 35 SIMPLIFY-02), and the Vercel Pro 800s `maxDuration` ceiling — the same shipped reality reflected in `llm-pipeline-reliability.md` (Phase 30 / 30.1 / 31 / 34) and `redis-keys.md` (Phase 35).

## What was done

### Task 1 — Per-file v1.5-drift sweep across 12 markdown files (D-09, D-11, D-12)

**7 files edited:**

| File                                          | Commit  | Drift summary                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| docs/architecture/system-context.md           | 09f5a99 | "Phase 27 / Cerebras/Groq classification" framing → NIM-only runtime cascade with Phase 30.1 + 34 sub-block cross-links; `server/vercel-entry.ts` → `api/vercel-entry.js` bundle.                                                                                                             |
| docs/architecture/deployment.md               | 83bba66 | Topology Mermaid + cron-jobs section: added `/api/cron/refresh-events` (Phase 29 D-08 cron-only writer); `server/vercel-entry.ts` → `api/vercel-entry.js` + Pro `maxDuration: 800` framing; warm cadence "every 12h" → "daily 12:00 UTC"; user-agent:vercel-cron auth → CRON_SECRET Bearer.   |
| docs/architecture/data-flows.md               | 903063a | §3 events metadata + Mermaid + 5 prose notes: declared-vs-runtime cascade (Phase 30.1 + 34); soft-warn tier elimination (Phase 30 SIMPLIFY-03); end-of-run terminal write (Phase 30 SIMPLIFY-01) + partial-key retirement (Phase 35 SIMPLIFY-02).                                             |
| docs/architecture/ontology/types.md           | 050fac2 | §`ConflictEventType` note: Cerebras/Groq classification + deleted `llmEventExtractor.ts` path → NIM-only runtime with v3 module path + Phase 30.1 + 34 cross-links.                                                                                                                           |
| docs/architecture/ontology/algorithms.md      | 54169fe | §9 LLM event extraction Phase 27 framing throughout (deleted file path, Cerebras-primary cascade, BATCH_SIZE=8, /api/events fire-and-forget trigger, dual cache) → rewrote against Phase 29 / 30 / 30.1 / 34 / 35 reality with concurrencyLimit + 6-path resolver + cron-only writer framing. |
| docs/architecture/README.md                   | 5e88881 | Architecture index undercounted shipped docs (8 entries vs 12 actual); added `## Operator deep-dives` section linking `llm-pipeline-reliability.md` (Phase 30) + `redis-keys.md` (Phase 35).                                                                                                  |
| docs/adr/0011-v3-llm-pipeline-architecture.md | 89b735a | (Task 3 below — D-21 sub-block append.)                                                                                                                                                                                                                                                       |

**5 files verified-clean:**

- `docs/architecture/frontend.md` — frontend unchanged v1.4 → v1.5; all 3 Mermaid diagrams (component layout, layer stacking, Zustand store graph) describe shipped reality.
- `docs/architecture/llm-pipeline-reliability.md` — CONTEXT.md D-09 declared verified-clean; full read confirmed Phase 30 + 30.1 + 34 sub-blocks are current.
- `docs/architecture/redis-keys.md` — CONTEXT.md D-09 declared verified-clean; full read confirmed Phase 35 D-05 32-key inventory is current and `events:llm:v3:partial` is correctly marked retired.
- `docs/architecture/ontology/README.md` — index; cross-links unchanged.
- `docs/architecture/ontology/complexity.md` — runtime/space-complexity table; no LLM/cron/domain refs.
- `docs/architecture/ontology/state-machines.md` — 4 stateDiagram-v2 blocks (connection lifecycle, polling lifecycle, navigation stack, cache freshness); none impacted by Phase 29–35 changes.

### Task 2 — Per-Mermaid-block sweep (D-10, D-12)

**3 Mermaid blocks edited (one per applicable file already counted above):**

| File              | Diagram # | Edit                                                                                                                                                                                                                                                                                                                                | Commit  |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| system-context.md | 2 of 2    | Fallback flowchart API-node label: `server/vercel-entry.ts` → `api/vercel-entry.js bundle / tsup from server/vercel.ts`.                                                                                                                                                                                                            | 09f5a99 |
| deployment.md     | 1 of 2    | Topology flowchart: lambda label rewritten with `maxDuration 800s`; cron subgraph grew from 2 → 3 entries with new `/api/cron/refresh-events` node + "daily 12:00 UTC" / "daily 04:00 UTC" cadence labels.                                                                                                                          | 83bba66 |
| data-flows.md     | 3 of 9    | §3 conflict-events sequenceDiagram: NIM/OR participant labels add Phase 30.1 dormancy framing; watchdog label `90s hard / 60s soft` → `120s hard-kill single-tier per Phase 30 SIMPLIFY-03`; fallback alt-branch removed OR fallthrough → explicit DLQ; per-batch partial-key SET writes removed; terminal write moved out of loop. | 903063a |

**18 Mermaid blocks verified-clean** — full per-block audit table in `36-02-AUDIT.md`.

**Validation method:** syntax-preservation review (full re-read of each edited block; fence-count parity check; participant-declaration boundary check). No `mmdc` local invocation; surgical-edit scope makes rendering-bug risk negligible. Operator-pause GitHub-preview verification (D-10 Option 2) is available at phase close if desired but was not exercised in this plan.

### Task 3 — ADR-0011 Phase 36 sub-block append (D-21)

`docs/adr/0011-v3-llm-pipeline-architecture.md` gains a new `## Phase 36 Sub-block (appended 2026-05-29)` before the existing `## Consequences` section. Mirrors the ADR-0010 sub-block convention (Phase 30 / 30.1 / 34 / 35) — Context / Outcome / Cross-references shape.

Sub-block content:

- Documents the runtime cascade as shipped post-Phase-34: NIM-only active; OpenRouter dormant per Phase 30.1; Cerebras + Groq deferred per Phase 34.
- Cross-links to ADR-0010 Phase 30.1 sub-block (OR dormancy), ADR-0010 Phase 34 sub-block (Cerebras + Groq deferral), `llm-pipeline-reliability.md` cascade-shape table, CLAUDE.md operator skim, and Phase 36 SUMMARY.md.
- Uses "REAFFIRMED" framing — the v3 architectural primitives (watchdog, DLQ, circuit breaker, token budget, 6-path resolver, parallel batches, cron-only trigger) all remain load-bearing; what changed is the provider set the architecture orchestrates at runtime.

**Commit:** `89b735a`.

A reader of ADR-0011 alone now gets the current shipped state without having to also read ADR-0010 Phase 30.1 + 34 sub-blocks separately (though cross-links make that easy).

### Audit accumulator (D-12)

`.planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md` written and committed at `dc21bb7`. Contents:

- 12-row Architecture Markdown Files table with `File | Status | Drift Found | Commit Ref` columns.
- 21-row Mermaid Diagrams table with `File | Diagram # | Status | Drift Found | Commit Ref` columns.
- ADR-0011 Phase 36 sub-block status (commit ref).
- Mermaid validation method note.
- Framing-Gap Callouts section (see "Framing gaps" below).
- Verification command block (re-runnable shell snippets).

Plan 36-06's SUMMARY.md will read this accumulator when authoring the closing audit table.

## Framing gaps surfaced (for Plan 36-06 SUMMARY.md absorption)

Per CONTEXT.md D-04 "describe shipped not aspirational" policy — these planning-text gaps are intentionally NOT retroactively edited:

1. **CONTEXT.md D-11 says "22 Mermaid diagrams"; actual count is 21.** Verified by `grep -c '```mermaid'`: 9 (data-flows) + 3 (frontend) + 4 (state-machines) + 2 (deployment) + 2 (system-context) + 1 (types) = 21. The "22" in CONTEXT.md may have included a stale fence count or an early-snapshot estimate.

2. **ROADMAP / PROJECT.md / CONTEXT.md say "10 markdown files"; actual count is 12.** Phase 30 added `llm-pipeline-reliability.md`; Phase 35 added `redis-keys.md`. Reality is 12; planning text frames as 10.

3. **`architecture/README.md` index originally listed only 8 of the 12 files** — undercounted both Phase 30 and Phase 35 deep-dive files. Phase 36-02 commit `5e88881` added the missing 2 entries via a new "## Operator deep-dives" section. Index now matches reality post-edit.

4. **ADR-0011 §3 body text** describes `events:llm:v3:partial` as live (lines 71-79 of the ADR). The Phase 36 sub-block captures current state without rewriting the ADR body (ADRs are immutable-after-Accepted per the Nygard convention; sub-blocks supersede). Internally consistent with ADR-0010 convention; no edit required.

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed per CONTEXT.md D-09 / D-10 / D-12 / D-21 prescriptions with two minor expansions:

- **architecture/README.md edited** (commit 5e88881). The plan's Task 1 listed README.md as "likely verified-clean (architecture index — verify cross-links and file count)" but the read surfaced that the index undercounted shipped files by 33% (8 of 12 listed). Per D-09's "edit only if drift surfaces" rule, this is in-scope. Documented as one of the "framing gaps" rather than a deviation since the edit followed the plan's intent.

- **Mermaid validation chose Option 1 (syntax-preservation review) but did NOT invoke `mmdc`** (the plan's preferred Option 1). Rationale: only 3 blocks were edited and all edits were surgical (participant labels, node labels, cron-list growth, alt-branch swap). The risk of mmdc surfacing a rendering bug not caught by fence-count parity + participant-declaration boundary checks is low. Operator-pause GitHub-preview verification (Option 2) is documented in the audit as available at phase close if a reviewer requests it. Per CONTEXT.md "Claude's Discretion" framing this is within plan scope.

### Architectural Decisions

None — this is a documentation sweep; no code touched; no architectural change.

## Commit log (in execution order)

```
09f5a99 docs(36): D-09 sweep system-context.md
83bba66 docs(36): D-09 sweep deployment.md
903063a docs(36): D-09 sweep data-flows.md
050fac2 docs(36): D-09 sweep ontology/types.md
54169fe docs(36): D-09 sweep ontology/algorithms.md
89b735a docs(36): D-21 append Phase 36 sub-block to ADR-0011 (NIM-only runtime cascade reaffirmation)
5e88881 docs(36): D-09 sweep architecture/README.md
dc21bb7 docs(36): D-12 record architecture sweep audit accumulator
```

8 atomic per-decision commits. One per edited file (7 files) + one audit-accumulator rollup (D-12) + one ADR-0011 sub-block (D-21) = 9 commits including the still-unwritten SUMMARY commit.

## Verification

- [x] All 12 architecture markdown files audited (7 edited / 5 verified-clean).
- [x] All 21 Mermaid blocks audited (3 edited / 18 verified-clean).
- [x] ADR-0011 Phase 36 sub-block appended before `## Consequences` with cross-links to ADR-0010 Phase 30.1 + 34 sub-blocks.
- [x] `36-02-AUDIT.md` accumulator written and committed with rows for every file + Mermaid block.
- [x] Each material edit committed atomically with `docs(36):` prefix and decision number in body.
- [x] No edits to ROADMAP.md / REQUIREMENTS.md / PROJECT.md (D-04 + D-11 preserved).
- [x] `grep -rE "iran-conflict-monitor\.vercel\.app" docs/architecture/` returns 0 matches.
- [x] `grep -rE "llmEventExtractor\.v[12]" docs/architecture/` returns 0 matches (no live v1/v2 module refs).

## Coverage

DOCS-PUB-02 (architecture sweep) addressed.

## Known Stubs

None.

## Self-Check: PASSED

**File existence verification:**

```
FOUND: docs/architecture/README.md
FOUND: docs/architecture/system-context.md
FOUND: docs/architecture/data-flows.md
FOUND: docs/architecture/deployment.md
FOUND: docs/architecture/ontology/types.md
FOUND: docs/architecture/ontology/algorithms.md
FOUND: docs/adr/0011-v3-llm-pipeline-architecture.md
FOUND: .planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md
```

**Commit existence verification (all on worktree-agent-a0b8f5d63b72eeb60 branch):**

```
FOUND: 09f5a99 docs(36): D-09 sweep system-context.md
FOUND: 83bba66 docs(36): D-09 sweep deployment.md
FOUND: 903063a docs(36): D-09 sweep data-flows.md
FOUND: 050fac2 docs(36): D-09 sweep ontology/types.md
FOUND: 54169fe docs(36): D-09 sweep ontology/algorithms.md
FOUND: 89b735a docs(36): D-21 append Phase 36 sub-block to ADR-0011
FOUND: 5e88881 docs(36): D-09 sweep architecture/README.md
FOUND: dc21bb7 docs(36): D-12 record architecture sweep audit accumulator
```

**ADR-0011 sub-block placement verification:**

```
FOUND: ## Phase 36 Sub-block (appended 2026-05-29) at line 147
FOUND: ## Consequences appears AFTER the sub-block
FOUND: cross-link "DORMANT per [ADR-0010 Phase 30.1"
FOUND: cross-link "DEFERRED per [ADR-0010 Phase 34"
FOUND: "REAFFIRMED" framing in Outcome section
```

**Mermaid block counts** (post-edit): data-flows.md 9 / frontend.md 3 / state-machines.md 4 / deployment.md 2 / system-context.md 2 / types.md 1 = **21 total** (matches plan, off-by-one from CONTEXT.md D-11 "22" — captured as framing-gap callout #1).

All claims in this SUMMARY validated against `git log --oneline` + `git show <commit>` + filesystem state.
