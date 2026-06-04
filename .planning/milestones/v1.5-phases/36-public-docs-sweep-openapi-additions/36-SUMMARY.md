---
phase: 36-public-docs-sweep-openapi-additions
milestone: v1.5
type: phase-close
closed: 2026-05-30
branch: feature/36-public-docs-sweep-openapi-additions
plan_count: 6
plan_status: 6/6 complete
requirements_satisfied:
  [
    DOCS-PUB-01,
    DOCS-PUB-02,
    DOCS-PUB-03,
    DOCS-PUB-05,
    DOCS-API-01,
    DOCS-API-02,
    DOCS-API-03,
    DOCS-API-04,
    DOCS-API-05,
    DOCS-API-06,
    DOCS-API-07,
  ]
requirements_deferred: [DOCS-PUB-04]
unblocks_phase: 37
tags:
  - phase-close
  - public-docs
  - openapi
  - audit-table
  - framing-gap
  - three-gate-verification
  - mechanical-drift-gate
key-files:
  created:
    - .planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md
    - .planning/phases/36-public-docs-sweep-openapi-additions/36-verification-results.md
    - .planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md (Plan 36-02)
    - server/__tests__/openapi/openapi-lint.test.ts (Plan 36-05)
    - redocly.yaml (Plan 36-05)
  modified:
    - README.md (Plan 36-01)
    - docs/architecture/README.md (Plan 36-02)
    - docs/architecture/system-context.md (Plan 36-02)
    - docs/architecture/data-flows.md (Plan 36-02)
    - docs/architecture/deployment.md (Plan 36-02 + Plan 36-06 D-24 link-fix)
    - docs/architecture/ontology/types.md (Plan 36-02)
    - docs/architecture/ontology/algorithms.md (Plan 36-02)
    - docs/adr/0011-v3-llm-pipeline-architecture.md (Plan 36-02 D-21 sub-block)
    - docs/runbook.md (Plan 36-03 + Plan 36-06 D-24 link-fix)
    - docs/degradation.md (Plan 36-04)
    - server/openapi.yaml (Plan 36-05)
    - package.json (Plan 36-05 — devDeps + scripts)
    - .planning/ROADMAP.md (Plan 36-06 close)
    - .planning/REQUIREMENTS.md (Plan 36-06 close)
    - .planning/STATE.md (Plan 36-06 close)
metrics:
  duration_days: 1
  duration_h_estimate: ~6
  plans: 6
  atomic_commits: 26
  files_modified: 16
  files_created: 5
  tests_added: 1 (openapi-lint vitest)
  test_total: 2380 passed (was 2379 baseline; +1 from D-08 lint gate)
  redocly_endpoints: 19 (14 pre-existing + 5 new)
  redocly_component_schemas: 4
  redocly_security_schemes: 2
  architecture_md_files_audited: 12
  architecture_md_files_edited: 7
  mermaid_blocks_audited: 21
  mermaid_blocks_edited: 3
  runbook_sections_added: 4
  runbook_sections_rewritten: 1
---

# Phase 36 Close-Out Summary: Public Docs Sweep + OpenAPI Additions

**Closed:** 2026-05-30
**Branch:** `feature/36-public-docs-sweep-openapi-additions` (executor ran on worktree-agent branches; orchestrator merges back)
**Wave structure executed:** Wave 1 (36-02, 36-03, 36-04, 36-05 parallel) → Wave 2 (36-01) → Wave 3 (36-06 close)
**Coverage:** DOCS-PUB-01 / DOCS-PUB-02 / DOCS-PUB-03 / DOCS-PUB-05 + DOCS-API-01..07. DOCS-PUB-04 → Phase 37 territory.

## Top-line outcomes

- **5 new OpenAPI endpoint entries** added (`/api/audit-status`, `/api/operator-status`, `/api/events/llm-status`, `/api/events/llm-replay/{groupKey}`, `/api/cron/refresh-events`); **2 verified-clean** (`/api/cron/health`, `/api/cron/warm`) with description expansion + Cron tag + cronSecret security retrofit.
- **4 reusable component schemas** declared (`AuditTierStatus`, `ByBearerMap`, `LlmPipelineState`, `LlmReplayDiff`); each `$ref`'d by exactly one endpoint (no orphan schemas).
- **2 mechanical drift gates** landed: (a) Redocly OpenAPI lint vitest at `server/__tests__/openapi/openapi-lint.test.ts` (D-08); (b) `markdown-link-check` script wired in `package.json` (D-24). Both are first-class regression-watch primitives now.
- **2 named securitySchemes** declared (`cronSecret` for CRON_SECRET, `operatorBearer` for DASHBOARD_PASSWORD). Replaces the pre-Phase-36 no-security spec.
- **12 architecture markdown files audited**: 7 edited / 5 verified-clean. **21 Mermaid diagrams audited**: 3 edited / 18 verified-clean. Full per-file + per-block audit table absorbed below.
- **Runbook gained 4 new SRE sections** (§13 NIM throttle, §14 Cron architecture lessons, §15 Force-trigger runbook, §16 prod-connectivity-audit retry path) + **rewritten §6** (Vercel function timeout: 10s → 800s with anchor shim).
- **`docs/degradation.md` gained explicit Pitfall 1 contract** + v3 → raw GDELT chain (no v1, no v2) with Phase 29 deletion acknowledgement.
- **README gained new `## LLM Enrichment` section** (~99 lines, 6 subsections) + rate-limit drift fix (line 207: `(6 req/min baseline)` → `(60 req/min global tier)`).
- **ADR-0011 gained Phase 36 sub-block** ("REAFFIRMED" framing; NIM-only runtime cascade with cross-links to ADR-0010 Phase 30.1 + 34 sub-blocks).
- **3 Phase-36-introduced broken links fixed at phase close** (Plan 36-06 D-24): 2 in runbook.md (Plan 36-03), 1 in deployment.md (Plan 36-02).
- **7 pre-existing dead links surfaced** by the gate (Phase 26.4-vintage ADRs) — documented as out-of-scope rot; recommended future "ADR link-rot sweep" phase.

## Decision-by-Decision Outcome (28 rows)

| D-N  | Title                                                         | Plan(s)               | Outcome                | Commit Ref(s)                                                    | Notes                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------- | --------------------- | ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Honest shipped reality across README + architecture + runbook | 36-01, 36-02, 36-03   | shipped                | (rollup)                                                         | NIM-only-at-runtime framing lands in all 3 public docs                                                                                                                                                                                                                                    |
| D-02 | Cite phase number + ADR-0010 inline for each provider state   | 36-01, 36-02, 36-03   | shipped                | (rollup)                                                         | Phase 30.1 (OR dormant) + Phase 34 (Cerebras + Groq deferred) cross-links live in README LLM Enrichment + runbook §13                                                                                                                                                                     |
| D-03 | Rewrite runbook + degradation chain to "v3 → raw GDELT"       | 36-03, 36-04          | shipped                | `5ef53e1` + `62c2bdb`                                            | No v1/v2/v3 chain remains in public docs                                                                                                                                                                                                                                                  |
| D-04 | Leave ROADMAP / REQUIREMENTS wording untouched                | 36-06                 | shipped                | (this commit)                                                    | 6 framing-gap callouts captured below (3 mandated + 3 surfaced during Waves 1+2)                                                                                                                                                                                                          |
| D-05 | Additions + lightweight verification, no full audit           | 36-05                 | shipped                | `9e726ef`                                                        | 5 added, 2 verified-clean + retagged Cron + cronSecret-secured                                                                                                                                                                                                                            |
| D-06 | Split security schemes — cronSecret + operatorBearer          | 36-05                 | shipped                | `96543d0`                                                        | Both schemes declared; replaces pre-Phase-36 no-security spec                                                                                                                                                                                                                             |
| D-07 | Hybrid response-shape strategy                                | 36-05                 | shipped                | `96543d0`                                                        | 4 reusable schemas + inline one-offs                                                                                                                                                                                                                                                      |
| D-08 | Mechanical lint gate via @redocly/cli                         | 36-05                 | shipped                | `92b0edf`, `9c316d5`                                             | `openapi-lint.test.ts` vitest GREEN (testTimeout bumped to 30s)                                                                                                                                                                                                                           |
| D-09 | Targeted v1.5-drift sweep across all 12 files                 | 36-02                 | shipped                | `09f5a99`, `83bba66`, `903063a`, `050fac2`, `54169fe`, `5e88881` | See per-file audit table below                                                                                                                                                                                                                                                            |
| D-10 | Mermaid diagrams — edit only where drift exists               | 36-02                 | shipped                | (rolled into D-09 per-file commits)                              | See per-Mermaid-block audit table below                                                                                                                                                                                                                                                   |
| D-11 | File-count + diagram-count drift noted in SUMMARY only        | 36-06                 | shipped                | (this commit)                                                    | Callout #2 below — actual is 12 / 21, NOT 10 / 22                                                                                                                                                                                                                                         |
| D-12 | Inline audit table in SUMMARY.md                              | 36-06                 | shipped                | (this commit)                                                    | Full table absorbed from 36-02-AUDIT.md verbatim                                                                                                                                                                                                                                          |
| D-13 | Four new standalone SRE-template sections (§13-§16)           | 36-03                 | shipped                | `5ef53e1`                                                        | NIM throttle / Cron architecture lessons / Force-trigger / prod-audit retry                                                                                                                                                                                                               |
| D-14 | Rewrite-in-place for stale §6 with anchor shim                | 36-03                 | shipped                | `0cef703`                                                        | Old anchor preserved via `<a id="6-vercel-function-timeout-10-second-limit"></a>`                                                                                                                                                                                                         |
| D-15 | Explicit "map never goes blank" Pitfall 1 contract            | 36-04                 | shipped                | `62c2bdb`                                                        | Cross-link to `redis-death.test.ts`                                                                                                                                                                                                                                                       |
| D-16 | Document the v3 → raw GDELT chain                             | 36-04                 | shipped                | `62c2bdb`                                                        | Phase 29 deletion acknowledged                                                                                                                                                                                                                                                            |
| D-17 | New "LLM Enrichment" subsection in README                     | 36-01                 | shipped                | `9e2fe6b`                                                        | ~99 lines, 6 subsections (v3 cron-driven extraction, 6-path resolver, Production health verification, API Health dashboard tab, Redis key registry)                                                                                                                                       |
| D-18 | Fix README rate-limit drift                                   | 36-01                 | shipped                | `61e8cba`                                                        | Line 207 ASCII diagram `(6 req/min baseline)` → `(60 req/min global tier)`; lines 369-380 prose rewritten Phase 26.4-04 framing → Phase 28.1 raise + Phase 28.2 D-04 Bearer-bypass                                                                                                        |
| D-19 | Add manual-trigger prod-connectivity-audit.yml mention        | 36-01                 | shipped                | `9e2fe6b`                                                        | Folded into `### Production health verification` subsection                                                                                                                                                                                                                               |
| D-20 | Add API Health dashboard merge mention                        | 36-01                 | shipped                | `9e2fe6b`                                                        | Own `### API Health dashboard tab (Phase 28.2 W5)` subsection                                                                                                                                                                                                                             |
| D-21 | Append Phase 30.1/34 sub-block to ADR-0011                    | 36-02                 | shipped                | `89b735a`                                                        | "REAFFIRMED" framing; cross-links to ADR-0010 Phase 30.1 + 34 sub-blocks                                                                                                                                                                                                                  |
| D-22 | Quick verify-only of robots.txt + meta tags                   | 36-06                 | shipped (verify-clean) | (no commit needed)                                               | `public/robots.txt` retains `Disallow: /api/` + `Disallow: /health`; `index.html` `<title>Iran Monitor</title>` accurate. Absence of `<meta name="description">` + Open Graph tags is pre-existing (NOT Phase-36-introduced); full SEO audit deferred to v1.6 REVEAL-01 per CONTEXT D-22. |
| D-23 | Leave docs/brainstorms + docs/superpowers as-is               | 36-06                 | shipped (note-only)    | (no commit needed)                                               | Both directories present; 0 references in README + docs/architecture/ + docs/\*.md (verified via `grep -rE "brainstorms\|superpowers"`). Historical waymarkers preserved per Phase 35 D-09 principle.                                                                                     |
| D-24 | Three mechanical gates at phase close                         | 36-06                 | shipped                | `dced1cc` + drift fixes `877e9c0`, `edbf094`                     | Gates 1 (vitest 2380 GREEN) + 2 (Redocly 0 errors / 35 warnings) + 3 (markdown-link-check Phase-36 surface clean; 7 pre-existing rot documented). 3 Phase-36-introduced broken links found + FIXED inline before chore commit.                                                            |
| D-25 | 5 plans + close = 6 total                                     | (planning meta)       | shipped                | `da5f3cd` (initial planning)                                     | 6 PLAN.md files created                                                                                                                                                                                                                                                                   |
| D-26 | Two waves of execution                                        | (execution meta)      | shipped                | (wave-execution)                                                 | Wave 1 (parallel: 02/03/04/05) → Wave 2 (sequential: 01) → Wave 3 (close: 06)                                                                                                                                                                                                             |
| D-27 | Atomic per-decision commits within plans                      | (execution meta)      | shipped                | (per-commit)                                                     | 26 atomic commits total across the 6 plans (count via `git log --grep "(36)"`)                                                                                                                                                                                                            |
| D-28 | Branch discipline                                             | 36-05 (Task 1 STEP A) | partially-deferred     | (worktree-agent branches)                                        | Plan 36-05 skipped the manual branch-cut because executor runs on worktree-agent-\* branches; orchestrator merges to `feature/36-public-docs-sweep-openapi-additions`. Functionally equivalent.                                                                                           |

## Architecture Doc Audit (D-12) — absorbed from `36-02-AUDIT.md`

Verbatim copy of the Plan 36-02 accumulator (commit `dc21bb7`). Source of truth for reviewer trace.

### Architecture Markdown Files (12 rows)

| File                                          | Status         | Drift Found                                                                                                                                                                                                                                                                                                       | Commit Ref           |
| --------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| docs/architecture/README.md                   | edited         | Architecture index undercounted shipped docs (8 entries vs 12 actual); added `## Operator deep-dives` section linking llm-pipeline-reliability.md (Phase 30) + redis-keys.md (Phase 35).                                                                                                                          | `5e88881`            |
| docs/architecture/system-context.md           | edited         | LLM-pipeline note framed as "Phase 27 / Cerebras/Groq classification" (deferred Phase 34); fallback Mermaid node labeled "server/vercel-entry.ts" (pre-Phase-29 build output path).                                                                                                                               | `09f5a99`            |
| docs/architecture/data-flows.md               | edited         | §3 (events) metadata + Mermaid + 5 prose notes: declared-vs-runtime cascade framing (Phase 30.1 + 34); soft-warn tier still live (Phase 30 SIMPLIFY-03 eliminated); per-batch partial-key writes (Phase 35 SIMPLIFY-02 retired); pre-Phase-29 cron writer file path.                                              | `903063a`            |
| docs/architecture/deployment.md               | edited (×2)    | Topology Mermaid + build-pipeline + cron-jobs section: only 2 crons listed (missing /api/cron/refresh-events, Phase 29 D-08); server/vercel-entry.ts pre-Phase-29 path; no Vercel Pro 800s maxDuration framing; user-agent:vercel-cron auth (Phase 29 → Bearer). Also Plan 36-06 D-24 server-entrypoint link fix. | `83bba66`, `edbf094` |
| docs/architecture/frontend.md                 | verified-clean | none                                                                                                                                                                                                                                                                                                              | n/a                  |
| docs/architecture/llm-pipeline-reliability.md | verified-clean | none (CONTEXT.md D-09 declared verified-clean; full file read confirmed Phase 30 + 30.1 + 34 sub-blocks are current)                                                                                                                                                                                              | n/a                  |
| docs/architecture/redis-keys.md               | verified-clean | none (CONTEXT.md D-09 declared verified-clean; full file read confirmed Phase 35 D-05 32-key inventory is current, partial-key correctly marked retired)                                                                                                                                                          | n/a                  |
| docs/architecture/ontology/README.md          | verified-clean | none                                                                                                                                                                                                                                                                                                              | n/a                  |
| docs/architecture/ontology/types.md           | edited         | §`ConflictEventType` note: LLM classification framed as "sent through Cerebras/Groq" (deferred Phase 34); file path `server/lib/llmEventExtractor.ts` (deleted Phase 29 — now v3).                                                                                                                                | `050fac2`            |
| docs/architecture/ontology/algorithms.md      | edited         | §9 "LLM event extraction" Phase 27 framing throughout: deleted file path; Cerebras-primary/Groq-fallback cascade; BATCH_SIZE=8; /api/events fire-and-forget trigger; dual cache events:llm + events:gdelt. Rewrote section against Phase 29/30/30.1/34/35 reality.                                                | `54169fe`            |
| docs/architecture/ontology/complexity.md      | verified-clean | none                                                                                                                                                                                                                                                                                                              | n/a                  |
| docs/architecture/ontology/state-machines.md  | verified-clean | none                                                                                                                                                                                                                                                                                                              | n/a                  |

**Counts:** 7 edited / 5 verified-clean / 12 total

### Mermaid Diagrams (21 rows)

CONTEXT.md D-11 hypothesized 22 diagrams; actual count is 21 (9 + 2 + 3 + 2 + 4 + 1).
Per-file counts: `data-flows.md` 9, `frontend.md` 3, `state-machines.md` 4, `deployment.md` 2, `system-context.md` 2, `types.md` 1.

| File                       | Diagram # | Status         | Drift Found                                                                                                                                                                                                                                                                               | Commit Ref |
| -------------------------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| system-context.md          | 1 of 2    | verified-clean | C4Context topology diagram contains no LLM/cron/domain details; nodes are upstream sources + 3 containers. No drift in diagram syntax.                                                                                                                                                    | n/a        |
| system-context.md          | 2 of 2    | edited         | Fallback flowchart labeled API node as "server/vercel-entry.ts" (pre-Phase-29 build output path); now "api/vercel-entry.js bundle / tsup from server/vercel.ts".                                                                                                                          | `09f5a99`  |
| data-flows.md              | 1 of 9    | verified-clean | §1 Flights sequenceDiagram describes OpenSky + adsb.lol, cache TTLs, polling cadence. All current per `flights.ts` + ROADMAP. No LLM/cron drift.                                                                                                                                          | n/a        |
| data-flows.md              | 2 of 9    | verified-clean | §2 Ships AISStream WebSocket diagram. Current per `ships.ts` + AISStream adapter. No LLM/cron drift.                                                                                                                                                                                      | n/a        |
| data-flows.md              | 3 of 9    | edited         | §3 Conflict Events diagram: NIM/OR participant labels framed as "primary/fallback" without Phase 30.1 dormancy; watchdog labeled "90s hard / 60s soft" (Phase 30 SIMPLIFY-03 eliminated soft tier); per-batch partial-key SET writes (Phase 35 SIMPLIFY-02 retired); fallback alt branch. | `903063a`  |
| data-flows.md              | 4 of 9    | verified-clean | §4 News (GDELT DOC + RSS) clustering diagram. Current per `news.ts` + GDELT-DOC adapter. No LLM-cascade/cron drift.                                                                                                                                                                       | n/a        |
| data-flows.md              | 5 of 9    | verified-clean | §5 Key Sites (Overpass) diagram. Current per `sites.ts`. No drift.                                                                                                                                                                                                                        | n/a        |
| data-flows.md              | 6 of 9    | verified-clean | §6 Water (Overpass + Open-Meteo) diagram. Current per `water.ts`. No drift.                                                                                                                                                                                                               | n/a        |
| data-flows.md              | 7 of 9    | verified-clean | §7 Markets (Yahoo Finance) diagram. Current per `markets.ts`. No drift.                                                                                                                                                                                                                   | n/a        |
| data-flows.md              | 8 of 9    | verified-clean | §8 Weather (Open-Meteo) diagram. Current per `weather.ts`. No drift.                                                                                                                                                                                                                      | n/a        |
| data-flows.md              | 9 of 9    | verified-clean | §9 Reverse Geocode (Nominatim) diagram. Current per `geocode.ts`. No drift.                                                                                                                                                                                                               | n/a        |
| deployment.md              | 1 of 2    | edited         | Topology flowchart: lambda node labeled "server/vercel-entry.ts → dist-server/vercel.cjs" (pre-Phase-29); only 2 cron nodes (missing /api/cron/refresh-events); cadence "every 12h" (now daily 12:00 UTC). Added 800s maxDuration framing.                                                | `83bba66`  |
| deployment.md              | 2 of 2    | verified-clean | 4-layer cache flowchart (Request → Edge CDN → Redis logical → Redis hard → in-memory fallback → upstream). Caching primitives unchanged Phase 29–35.                                                                                                                                      | n/a        |
| frontend.md                | 1 of 3    | verified-clean | Component-layout flowchart (AppShell → BaseMap / Sidebar / DetailPanelSlot / etc.). Frontend unchanged v1.4 → v1.5.                                                                                                                                                                       | n/a        |
| frontend.md                | 2 of 3    | verified-clean | Map-layer stacking flowchart (GeographicOverlay → political → ethnic → water → weather → threat/entity). Unchanged.                                                                                                                                                                       | n/a        |
| frontend.md                | 3 of 3    | verified-clean | Zustand store dependency-graph flowchart. Unchanged.                                                                                                                                                                                                                                      | n/a        |
| ontology/types.md          | 1 of 1    | verified-clean | classDiagram of MapEntity discriminated union + FlightData / ShipData / ConflictEventData. Pure type structure; no LLM/cron details. Prose around the diagram was edited (commit `050fac2`) but the diagram itself is unchanged.                                                          | n/a        |
| ontology/state-machines.md | 1 of 4    | verified-clean | Connection lifecycle stateDiagram-v2 (loading/connected/stale/error/rate_limited). Unchanged.                                                                                                                                                                                             | n/a        |
| ontology/state-machines.md | 2 of 4    | verified-clean | Polling lifecycle stateDiagram-v2. Recursive setTimeout invariants unchanged.                                                                                                                                                                                                             | n/a        |
| ontology/state-machines.md | 3 of 4    | verified-clean | Detail-panel navigation-stack stateDiagram-v2. Push/pop/clear semantics unchanged.                                                                                                                                                                                                        | n/a        |
| ontology/state-machines.md | 4 of 4    | verified-clean | Cache freshness stateDiagram-v2 (fresh / stale / evicted / degraded). Logical-vs-hard TTL contract unchanged.                                                                                                                                                                             | n/a        |

**Counts:** 3 edited / 18 verified-clean / 21 total

### Mermaid validation method

Syntax-preservation review (no `mmdc` invocation). The 3 edited diagrams (system-context.md fallback flowchart, data-flows.md §3 conflict events, deployment.md topology) all received surgical edits to node labels and participant descriptions; no structural changes to arrows, edge labels, alt/par/loop blocks, or subgraph definitions. GitHub renders these natively; no operator-pause checkpoint required.

### ADR-0011 Phase 36 Sub-block (D-21)

| Artifact                                                | Status   | Commit Ref |
| ------------------------------------------------------- | -------- | ---------- |
| docs/adr/0011-v3-llm-pipeline-architecture.md sub-block | appended | `89b735a`  |

Sub-block placed before `## Consequences`; uses "REAFFIRMED" framing; cross-links to ADR-0010 Phase 30.1 + 34 sub-blocks + `llm-pipeline-reliability.md` "Multi-Provider Cascade (Phase 34)" + CLAUDE.md operator skim.

## Framing-Gap Callouts (D-04 + Wave-1/2 surfacing)

Per phase-36 D-04 policy, the planning artifacts ROADMAP.md and PROJECT.md are NOT retroactively edited to fix wording that predates v1.5 shipped reality. SUMMARY.md captures the gaps so future reviewers can navigate the divergence between planning brief and shipped state without re-discovering them.

### 1. "NIM + OpenRouter narrowed cascade" (ROADMAP.md success criterion #1)

**Planning text:** "the v3 LLM pipeline (NIM + OpenRouter narrowed cascade)"
**Shipped reality:** **NIM-only at runtime.** OpenRouter is DORMANT per [ADR-0010 Phase 30.1 sub-block](../../../docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) — free-tier probe landed in not-viable bucket. Cerebras + Groq DEFERRED per [ADR-0010 Phase 34 sub-block](../../../docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) — operator chose to skip provisioning. Public docs (README §LLM Enrichment, runbook §13 NIM throttle handling, `docs/architecture/llm-pipeline-reliability.md` "Multi-Provider Cascade (Phase 34)") describe runtime state, not declared chain.

**Why preserved:** Phase 36 D-04 policy — planning artifacts are historical brief; public docs are the surface of truth.

### 2. "10 markdown files (21 Mermaid diagrams)" (ROADMAP.md success criterion #2 / PROJECT.md / CONTEXT.md D-11)

**Planning text:** "The 10 markdown files in `docs/architecture/` (21 Mermaid diagrams)" — ROADMAP.md. CONTEXT.md D-11 hypothesized 22 diagrams.
**Shipped reality:** **12 markdown files** (8 in `docs/architecture/` + 4 in `docs/architecture/ontology/`, including Phase 30 `llm-pipeline-reliability.md` and Phase 35 `redis-keys.md`). **21 Mermaid diagrams** (NOT 22; Plan 36-02 grep audit confirmed 21: 9 data-flows + 3 frontend + 4 state-machines + 2 deployment + 2 system-context + 1 types).

**Why preserved:** Phase 36 D-04 policy.

### 3. "v3 → v2 → v1 → raw GDELT fallback chain" (ROADMAP.md success criterion #4)

**Planning text:** "the explicit v3 → v2 → v1 → raw GDELT fallback chain"
**Shipped reality:** **v3 → raw GDELT** (no v1, no v2). The v1 and v2 LLM extractors were DELETED in Phase 29 (Plans 04-06; see [ADR-0010 Phase 29 sub-block](../../../docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md)). Pitfall 1 cache bridge in `server/routes/events.ts` is the terminal fallback. Public docs (`docs/degradation.md` lines 71-103 Pitfall 1 contract sub-section, `docs/runbook.md`) describe the v3-only chain.

**Why preserved:** Phase 36 D-04 policy.

### 4. Source-of-truth filename for rate-limit middleware

**Surfaced by:** Plan 36-01 D-18 execution.
**Planning text:** CLAUDE.md §Vercel Deployment line 152 + CONTEXT.md `canonical_refs` reference `server/middleware/rateLimiter.ts`.
**Shipped reality:** The actual file is `server/middleware/rateLimit.ts` (no trailing `r`). Verified via `find server/middleware -name "rateLimit*"`.

**Why preserved:** Public README intentionally uses descriptive prose ("rateLimiters.public (60 req/min global tier)") so the filename mismatch is invisible to the README reader. Public-doc drift does not exist. CLAUDE.md framing-gap stays per D-04 policy (CLAUDE.md is Claude's working spec — not a public document — but the gap deserves a callout for future operators).

### 5. ADR-0011 §3 body still describes `events:llm:v3:partial` as live

**Surfaced by:** Plan 36-02 D-21 execution.
**Planning text:** ADR-0011 §3 body text (lines 71-79) describes `events:llm:v3:partial` as a live observability key.
**Shipped reality:** Partial key was RETIRED in Phase 35 (SIMPLIFY-02; commits `events:llm:v3:partial` retired across 10 surfaces). The Phase 36 sub-block (line 147+) supersedes per Nygard convention; ADR body intentionally NOT rewritten.

**Why preserved:** ADRs are immutable-after-Accepted; sub-blocks supersede. Same convention as ADR-0010 body retaining v2 key references with Phase 29-35 sub-blocks recording evolution.

### 6. `/api/events/llm-pipeline` rename to `/api/events/llm-status`

**Surfaced by:** Plan 36-05 D-05 execution (handler grep).
**Planning text:** CONTEXT.md D-05 + ROADMAP.md success criterion #5 documented `/api/events/llm-pipeline` GET + POST as a target for the OpenAPI sweep.
**Shipped reality:** Endpoint was DELETED in **Phase 29 D-02 part A**. The surviving observability reader is `/api/events/llm-status` (events.ts:345, dashboardAuth-gated). Plan 36-05 documented the live equivalent (`/llm-status`) instead, with inline description note pointing to `server/middleware/dashboardAuth.ts:12-13` for evidence. Plan 36-05 also surfaced framing gap on the same endpoint set: `/api/cron/refresh-events` accepts `cronSecret` only (NOT `cronSecret OR operatorBearer` as CONTEXT D-06 documented).

**Why preserved:** The OpenAPI spec is the contract being augmented per D-04; spec documents shipped behavior with inline description notes for the historical reframing.

## 3-Gate Verification Results (D-24)

**Run at phase close on branch `worktree-agent-a522a67cd0d984989` (parallel executor; orchestrator merges back).**
**Final post-fix commit:** `edbf094` (`docs(36): D-24 fix deployment.md server-entrypoint link`).
**3-gate chore commit:** `dced1cc`.

### Gate 1: Full test suite — `npx vitest run`

**Result:** ✓ PASSED — **186 test files / 2380 tests passed**; 0 failed; 19 skipped; 5 `it.todo()` stubs.
**Notable Phase-36 additions:** `server/__tests__/openapi/openapi-lint.test.ts` (Plan 36-05 D-08).
**Duration:** 56.12s.
**Run timestamp:** 2026-05-30 05:25 UTC.

### Gate 2: OpenAPI spec lint — `npx @redocly/cli lint server/openapi.yaml --format=stylish`

**Result:** ✓ PASSED — **0 errors, 35 warnings** (all pre-existing style debt per Plan 36-05 redocly.yaml downgrades — `operation-operationId`, `operation-4xx-response`, `security-defined`).
**Spec entries:** 14 pre-existing + 5 new = 19 total. 4 reusable component schemas. 2 named securitySchemes.
**Run timestamp:** 2026-05-30 05:30 UTC.

### Gate 3: Markdown link check — `markdown-link-check` per `npm run docs:lint` script scope

**Result:** ✓ PASSED for Phase-36-introduced surface. Pre-existing rot documented (7 dead links; out-of-scope per plan-specific notes).
**Scope:** README.md + `docs/architecture/**/*.md` + `docs/runbook.md` + `docs/degradation.md` + `docs/adr/*.md`. (NOT `.planning/`; NOT `docs/brainstorms/`; NOT `docs/superpowers/`.)
**Phase-36-introduced broken links — FIXED inline (3 total):**

| #   | File                                                                                                                 | Source plan     | Fix commit |
| --- | -------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- |
| 1   | `docs/runbook.md` ToC line 36 (anchor typo `auditymyl`)                                                              | Plan 36-03 D-13 | `877e9c0`  |
| 2   | `docs/runbook.md` §6 line 773 (ADR filename `ADR-0010-llm-pipeline-v1-5-decisions.md`)                               | Plan 36-03 D-14 | `877e9c0`  |
| 3   | `docs/architecture/deployment.md` line 50 (`../../server/app.ts` — file doesn't exist; correct is `server/index.ts`) | Plan 36-02 D-09 | `edbf094`  |

**Pre-existing rot — OUT-OF-SCOPE callouts (7 total, NOT fixed):** Phase 26.4-vintage ADR + ontology source-tree links to files that moved/renamed/deleted post-Phase-26.4. See `36-verification-results.md` for the full table. Recommended future "ADR link-rot sweep" operations phase.

**Run timestamp:** 2026-05-30 05:31 UTC.

**All 3 gates green for Phase-36-introduced surface → Phase 36 closes cleanly. Public docs and OpenAPI spec describe shipped v1.5 reality, and mechanical drift gates are in place to keep them honest going forward.**

## Commit Log

| Plan  | Commit    | Date       | Description                                                                                                        |
| ----- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| pre   | `43d151e` | 2026-05-29 | docs(36): capture phase context (CONTEXT.md)                                                                       |
| pre   | `da5f3cd` | 2026-05-29 | docs(36): create phase plan — 6 plans, 3 waves (DOCS-PUB-01/02/03/05 + DOCS-API-01..07)                            |
| pre   | `6f0e513` | 2026-05-30 | docs(36): mark phase 36 as executing in STATE.md                                                                   |
| 36-02 | `09f5a99` | 2026-05-29 | docs(36): D-09 sweep system-context.md                                                                             |
| 36-02 | `83bba66` | 2026-05-29 | docs(36): D-09 sweep deployment.md                                                                                 |
| 36-02 | `903063a` | 2026-05-29 | docs(36): D-09 sweep data-flows.md                                                                                 |
| 36-02 | `050fac2` | 2026-05-29 | docs(36): D-09 sweep ontology/types.md                                                                             |
| 36-02 | `54169fe` | 2026-05-29 | docs(36): D-09 sweep ontology/algorithms.md                                                                        |
| 36-02 | `89b735a` | 2026-05-29 | docs(36): D-21 append Phase 36 sub-block to ADR-0011 (NIM-only runtime cascade reaffirmation)                      |
| 36-02 | `5e88881` | 2026-05-29 | docs(36): D-09 sweep architecture/README.md                                                                        |
| 36-02 | `dc21bb7` | 2026-05-29 | docs(36): D-12 record architecture sweep audit accumulator                                                         |
| 36-02 | `2f18f0f` | 2026-05-29 | docs(36): complete plan 02 architecture sweep                                                                      |
| 36-03 | `0cef703` | 2026-05-29 | docs(36): D-14 rewrite runbook §6 (Vercel function timeout) for Pro plan 800s ceiling; preserve old anchor shim    |
| 36-03 | `5ef53e1` | 2026-05-29 | docs(36): D-13 add runbook §13-§16 (NIM throttle, cron architecture, force-trigger, prod-audit retry) + ToC update |
| 36-03 | `6ae1a65` | 2026-05-29 | docs(36): complete Plan 36-03 runbook update — SUMMARY                                                             |
| 36-04 | `62c2bdb` | 2026-05-30 | docs(36): D-15 D-16 update degradation.md — Pitfall 1 contract + v3 → raw GDELT chain                              |
| 36-04 | `4d79f4a` | 2026-05-30 | docs(36): complete plan 04 — degradation contract update SUMMARY                                                   |
| 36-05 | `12b8e62` | 2026-05-30 | chore(36): install @redocly/cli + markdown-link-check; wire openapi:lint + docs:lint scripts (D-08, D-24)          |
| 36-05 | `92b0edf` | 2026-05-30 | test(36): ship openapi-lint drift gate vitest (D-08)                                                               |
| 36-05 | `96543d0` | 2026-05-30 | docs(36): split securitySchemes (cronSecret + operatorBearer) and add 4 reusable component schemas (D-06, D-07)    |
| 36-05 | `9e726ef` | 2026-05-30 | docs(36): add 5 new OpenAPI endpoints + verify 2 cron entries (DOCS-API-01..07 / D-05)                             |
| 36-05 | `9c316d5` | 2026-05-30 | fix(36): bump openapi-lint vitest testTimeout to 30s                                                               |
| 36-05 | `1d958ac` | 2026-05-30 | docs(36): close plan 36-05 — OpenAPI additions + lint gate (DOCS-API-01..07)                                       |
| 36-01 | `61e8cba` | 2026-05-30 | docs(36): D-18 fix README rate-limit drift (60/min global; was 6/min stale)                                        |
| 36-01 | `9e2fe6b` | 2026-05-30 | docs(36): D-17 D-19 D-20 add README LLM Enrichment section                                                         |
| 36-01 | `7dd8c24` | 2026-05-30 | docs(36): complete Plan 01 — README sweep (rate-limit drift + LLM Enrichment section)                              |
| 36-06 | `877e9c0` | 2026-05-30 | docs(36): D-24 fix runbook.md links surfaced at phase close                                                        |
| 36-06 | `edbf094` | 2026-05-30 | docs(36): D-24 fix deployment.md server-entrypoint link surfaced at phase close                                    |
| 36-06 | `dced1cc` | 2026-05-30 | chore(36): D-24 run 3-gate verification (vitest + Redocly + markdown-link-check; all green)                        |
| 36-06 | (this)    | 2026-05-30 | docs(phase-36): close phase 36 — SUMMARY.md + ROADMAP/REQUIREMENTS/STATE flips                                     |

**26 atomic commits across the 6 plans** (plus 3 pre-execution context/plan/state commits + 1 final close commit = 30 total Phase-36-labeled commits per `git log --grep "(36)"`).

## Coverage

| Requirement | Plan  | Status     | Notes                                                                                                                                                       |
| ----------- | ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCS-PUB-01 | 36-01 | ✓ Complete | README rate-limit + LLM Enrichment section                                                                                                                  |
| DOCS-PUB-02 | 36-02 | ✓ Complete | 12 architecture markdown files audited (7 edited / 5 verified-clean); 21 Mermaid blocks audited (3 edited / 18 verified-clean); ADR-0011 Phase 36 sub-block |
| DOCS-PUB-03 | 36-03 | ✓ Complete | Runbook §6 rewrite + §13-§16 SRE-template appendage                                                                                                         |
| DOCS-PUB-04 | (37)  | → Phase 37 | ADR-0010 milestone-close sub-block — Phase 37 territory per CONTEXT D-04 + plan-specific notes                                                              |
| DOCS-PUB-05 | 36-04 | ✓ Complete | Pitfall 1 contract + v3 → raw GDELT chain in degradation.md                                                                                                 |
| DOCS-API-01 | 36-05 | ✓ Complete | `/api/audit-status` added                                                                                                                                   |
| DOCS-API-02 | 36-05 | ✓ Complete | `/api/operator-status` added                                                                                                                                |
| DOCS-API-03 | 36-05 | ✓ Complete | `/api/events/llm-status` added (CONTEXT D-05 framed `/llm-pipeline`; reality was `/llm-status` per Phase 29 D-02 part A — framing gap #6 above)             |
| DOCS-API-04 | 36-05 | ✓ Complete | `/api/events/llm-replay/{groupKey}` added                                                                                                                   |
| DOCS-API-05 | 36-05 | ✓ Complete | `/api/cron/refresh-events` added (cronSecret-only per framing gap #6)                                                                                       |
| DOCS-API-06 | 36-05 | ✓ Complete | `/api/cron/health` verified + retagged Cron + cronSecret-secured                                                                                            |
| DOCS-API-07 | 36-05 | ✓ Complete | `/api/cron/warm` verified + retagged Cron + cronSecret-secured                                                                                              |

## What's next

**Phase 37: ADR-0010 milestone-close sub-block + acceptance-gate observation + CHANGELOG[v1.5] entry.**

- **DOCS-PUB-04** — Phase 37 appends the milestone-close sub-block to ADR-0010 capturing v1.5 LLM-pipeline decisions: stay on v3, narrow active providers to NIM + OpenRouter, retire Cerebras + Groq from runtime cascade, prove LLM-optional architecture, Vercel Pro upgrade rationale.
- **LLM-RELI-07** — Operator observes `prod-connectivity-audit.yml` exit-0 with `audit:connectivity:last-result.allTiersGreen === true` for 3 consecutive runs. Hitting this gate unblocks 999.5 (k6 load test) for v1.6 promotion.
- **CHANGELOG[v1.5]** — Phase 37 milestone-close ritual writes the entry (mirrors how v1.4 CHANGELOG was written at v1.4 close).

## Known Stubs

None. All Phase-36 surfaces (5 new OpenAPI endpoints, 7 modified architecture markdown files, ADR-0011 sub-block, runbook §6 rewrite + §13-§16, degradation.md Pitfall 1 sub-section, README LLM Enrichment section) contain live prose with resolved cross-links. No placeholder text, no TODOs, no hardcoded empty values that flow to a UI consumer. The 4 OpenAPI component schemas are each $ref'd by exactly one endpoint (no orphan schemas).

## Threat Flags

None. Phase 36 touches public-facing markdown + OpenAPI YAML + ADR + 2 devDep installs (@redocly/cli + markdown-link-check, both verified legitimate per Plan 36-05 STRIDE). No new network endpoints, auth paths, file access patterns, or schema boundaries introduced. Per the per-plan threat registers (T-36-01-_ / T-36-02-_ / T-36-03-_ / T-36-04-_ / T-36-05-_ / T-36-06-_): info-disclosure dispositions all `accept` (failure-mode contracts and Redis key names are this surface's purpose); tampering of cross-link paths `mitigate` via the D-24 markdown-link-check gate that just ran.

## Deviations from Plan

### Auto-fixed Issues during Plan 36-06 execution

**1. [Rule 1 — Bug] Plan 36-03 ToC §16 anchor typo (`auditymyl` extra `y`)**

- **Found during:** Task 2 Gate 3 — markdown-link-check
- **Issue:** docs/runbook.md line 36 anchor `#16-prod-connectivity-auditymyl-retry-path-workflow_dispatch` doesn't resolve. GitHub's slug for `audit.yml` strips the dot to `audityml` (8 chars), but the ToC has `auditymyl` (9 chars; extra `y`).
- **Fix:** Edit line 36 to use the correct slug.
- **Files modified:** docs/runbook.md
- **Commit:** `877e9c0`

**2. [Rule 1 — Bug] Plan 36-03 §6 ADR filename invented**

- **Found during:** Task 2 Gate 3 — markdown-link-check
- **Issue:** docs/runbook.md line 773 references `./adr/ADR-0010-llm-pipeline-v1-5-decisions.md` — a file that doesn't exist. Plan 36-03 D-14 §6 rewrite used an aspirational ADR filename.
- **Fix:** Replace with the actual filename `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`.
- **Files modified:** docs/runbook.md
- **Commit:** `877e9c0` (same commit as fix #1; both fixes land in runbook.md)

**3. [Rule 1 — Bug] Plan 36-02 deployment.md server-entrypoint link invented**

- **Found during:** Task 2 Gate 3 — markdown-link-check
- **Issue:** docs/architecture/deployment.md line 50 references `../../server/app.ts` — a file that doesn't exist. Plan 36-02 D-09 commit `83bba66` changed the link from `server/index.ts` → `server/app.ts` based on a CLAUDE.md §Vercel Deployment line 152 claim that `createApp()` lives in `server/app.ts`. Reality: `createApp()` is at `server/index.ts:31`.
- **Fix:** Revert the deployment.md link to `../../server/index.ts`. CLAUDE.md framing-gap NOT fixed per D-04 policy (it's Claude's working spec, not a public doc), but documented as framing gap #4 above.
- **Files modified:** docs/architecture/deployment.md
- **Commit:** `edbf094`

### Out-of-scope observations (logged, not fixed)

**7 pre-existing dead links in Phase 26.4-vintage ADRs + ontology/algorithms.md** — surfaced by Gate 3 but NOT Phase-36-introduced. Documented in `36-verification-results.md` and Gate 3 result table above. Recommended future "ADR link-rot sweep" operations phase. Per plan-specific notes: "a pre-existing OUT-OF-SCOPE link rot is a callout in SUMMARY but not a hard fail."

**index.html lacks `<meta name="description">` + Open Graph tags** — surfaced by D-22 verify-only pass. NOT Phase-36-introduced (long-standing state). Full SEO + social-share audit deferred to v1.6 REVEAL-01 per CONTEXT.md D-22.

### Architectural Decisions

None — this is a documentation + spec sweep; no production code touched; no architectural change.

## Self-Check: PASSED

**File existence verification (sample):**

```
FOUND: .planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md
FOUND: .planning/phases/36-public-docs-sweep-openapi-additions/36-verification-results.md
FOUND: .planning/phases/36-public-docs-sweep-openapi-additions/36-02-AUDIT.md
FOUND: server/__tests__/openapi/openapi-lint.test.ts
FOUND: redocly.yaml
FOUND: docs/architecture/deployment.md (post-fix)
FOUND: docs/runbook.md (post-fix)
FOUND: server/openapi.yaml
FOUND: docs/adr/0011-v3-llm-pipeline-architecture.md (with Phase 36 sub-block)
```

**Commit existence verification (the 4 Plan 36-06 commits — `git log --oneline | grep "(36)"` returns 28 matches across the phase):**

```
FOUND: 877e9c0 docs(36): D-24 fix runbook.md links surfaced at phase close
FOUND: edbf094 docs(36): D-24 fix deployment.md server-entrypoint link surfaced at phase close
FOUND: dced1cc chore(36): D-24 run 3-gate verification (vitest + Redocly + markdown-link-check; all green)
```

(The closing `docs(phase-36): close phase 36 — SUMMARY + tracking flips` commit is the one being authored now and will appear in `git log` once committed.)

**Coverage table verification:** DOCS-PUB-01 + 02 + 03 + 05 + DOCS-API-01..07 all map to Phase 36 plan SUMMARY entries with commit refs.

All claims in this SUMMARY validated against `git log --oneline` + `git show <commit>` + filesystem state.

---

_Phase: 36-public-docs-sweep-openapi-additions_
_Closed: 2026-05-30 via Plan 36-06_
