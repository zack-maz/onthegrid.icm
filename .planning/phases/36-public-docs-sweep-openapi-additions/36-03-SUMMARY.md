---
phase: 36-public-docs-sweep-openapi-additions
plan: 03
subsystem: docs/runbook
tags:
  [
    runbook,
    sre,
    incident-playbook,
    anchor-shim,
    table-of-contents,
    nim-throttle,
    cron-architecture,
    force-trigger,
    prod-audit,
  ]
requires: []
provides:
  - 'runbook §6 rewritten against Vercel Pro maxDuration: 800 ceiling (D-14)'
  - 'runbook §13 NIM throttle handling SRE playbook (D-13)'
  - 'runbook §14 Cron architecture lessons SRE playbook (D-13)'
  - 'runbook §15 Force-trigger /api/cron/refresh-events operator runbook (D-13)'
  - 'runbook §16 prod-connectivity-audit.yml workflow_dispatch retry runbook (D-13)'
  - 'preserved <a id="6-vercel-function-timeout-10-second-limit"></a> anchor shim so external links to the old anchor still resolve'
affects: [docs/runbook.md]
key-files:
  modified:
    - docs/runbook.md
  created: []
decisions:
  - 'D-14 — §6 rewrite-in-place + anchor shim (old anchor preserved, ToC display text retitled, anchor link target unchanged)'
  - 'D-13 — Four standalone SRE-template sections appended (§13-§16) between §12 and "See also"; ToC entries 13-16 added'
  - 'Claude-Discretion 5 — §13 cross-links to llm-pipeline-reliability.md "Multi-Provider Cascade (Phase 34)" rather than paraphrasing Path B framing inline'
metrics:
  duration: ~25 min
  completed: 2026-05-29
  tasks: 2
  files: 1
  commits: 2
---

# Phase 36 Plan 03: Runbook Update (DOCS-PUB-03) Summary

Runbook brought from pre-Phase-27 framing (Hobby 10s timeout, no v3 cron incidents, no force-trigger, no prod-audit retry path) to v1.4 + v1.5 incident reality. Two atomic commits: §6 rewrite-in-place with old-anchor shim (D-14) → §13-§16 SRE-template appendage + ToC update (D-13).

## What Shipped

### §6 Rewrite (Task 1, commit `0cef703`)

| Aspect              | Before                                                          | After                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading             | `## 6. Vercel function timeout (10-second limit)`               | `## 6. Vercel function timeout (300s default / 800s configured ceiling)`                                                                                         |
| Anchor shim         | _(absent)_                                                      | `<a id="6-vercel-function-timeout-10-second-limit"></a>` installed immediately ABOVE the new heading                                                             |
| Body framing        | Hobby plan 10s; cold-start + upstream latency exceeds 10s       | Vercel Pro `vercel.json functions."api/vercel-entry.js".maxDuration: 800` (Phase 29 D-08); NIM throttle on `/api/cron/refresh-events` is dominant timeout driver |
| Cross-link to §13   | _(absent)_                                                      | "Cross-reference §13 NIM throttle handling" in Remediation step 2                                                                                                |
| `withBatchWatchdog` | Mentioned only in `REDIS_OP_TIMEOUT_MS` context                 | Explicit Prevention bullet — 90s hard-kill `server/lib/llmExtractorWatchdog.ts` prevents extraction from approaching `maxDuration`                               |
| ToC line 26         | `6. [Vercel function timeout (10-second limit)](#6-vercel-...)` | `6. [Vercel function timeout (300s default / 800s configured ceiling)](#6-vercel-function-timeout-10-second-limit)` — display text retitled; anchor unchanged    |

**Anchor shim mechanics (intentional D-14 design):** external/in-repo links pointing to `docs/runbook.md#6-vercel-function-timeout-10-second-limit` resolve to the `<a id="...">` HTML anchor immediately above the new heading. The new heading also generates its own GitHub-rendered anchor (`#6-vercel-function-timeout-300s-default-800s-configured-ceiling`) which would be the "natural" link target if the runbook were authored from scratch — both coexist. The ToC was kept on the old anchor so the shim is the active landing point.

### §13-§16 Append + ToC Update (Task 2, commit `5ef53e1`)

| Section | Title                                                                  | Line range (final file) |
| ------- | ---------------------------------------------------------------------- | ----------------------- |
| §13     | NIM throttle handling (429 burst + circuit-breaker trip)               | 867-901                 |
| §14     | Cron architecture lessons (Phase 28.2.6 fire-and-forget IIFE incident) | 903-933                 |
| §15     | Force-trigger `/api/cron/refresh-events` (operator-only)               | 935-967                 |
| §16     | `prod-connectivity-audit.yml` retry path (workflow_dispatch)           | 969-1011                |

All four sections follow the existing SRE template: `## N. Title` + bolded Symptom / Detection / Cause / Remediation / Prevention subheadings (mirrors §1-§12). §14 uses parenthesized variants (`Detection (historical)`, `Remediation (architectural — Phase 29 removed this failure mode)`, etc.) because the failure mode was architecturally retired by Phase 29 — the section is partly post-mortem and partly anti-pattern-defense documentation.

### ToC update (lines 33-36)

```
13. [NIM throttle handling](#13-nim-throttle-handling-429-burst--circuit-breaker-trip)
14. [Cron architecture lessons](#14-cron-architecture-lessons-phase-2826-fire-and-forget-iife-incident)
15. [Force-trigger /api/cron/refresh-events](#15-force-trigger-apicronrefresh-events-operator-only)
16. [prod-connectivity-audit.yml retry path](#16-prod-connectivity-auditymyl-retry-path-workflow_dispatch)
```

Inserted between the existing §12 entry (line 32) and the trailing `---` separator. Anchor link targets match GitHub auto-generated slug shape (lowercase, spaces → `-`, punctuation removed). markdown-link-check (Plan 36-06 D-24) will mechanically verify on the next gate run.

## Cross-link Inventory (added in §13-§16)

| From section             | To target                                                                            | Path                                                                                           | Status                                         |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| §13 Cause                | `docs/architecture/llm-pipeline-reliability.md` §"Multi-Provider Cascade (Phase 34)" | `./architecture/llm-pipeline-reliability.md`                                                   | resolves (file + heading verified)             |
| §13 Cause                | ADR-0010 Phase 30.1 sub-block (OpenRouter-dormant rationale)                         | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                                       | resolves (file + heading verified)             |
| §13 Remediation step 3   | `llm-pipeline-reliability.md` Path B framing                                         | `./architecture/llm-pipeline-reliability.md`                                                   | resolves                                       |
| §13 Prevention bullet 1  | `llm-pipeline-reliability.md` "Tuned defaults reference"                             | `./architecture/llm-pipeline-reliability.md`                                                   | resolves                                       |
| §13 Prevention open item | ADR-0010 Phase 30.1 (OR re-enable deferral rationale)                                | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                                       | resolves                                       |
| §14 Cause                | ADR-0010 Phase 29 sub-block + Phase 28.2.6 phase folder (incident diagnosis trail)   | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` + `.planning/milestones/v1.4-phases/` | resolves (ADR); pointer-only (planning folder) |
| §14 Remediation          | ADR-0010 (v1/v2 deletion context)                                                    | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                                       | resolves                                       |
| §16 Prevention bullet 1  | ADR-0010 (acceptance-gate rationale)                                                 | `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                                       | resolves                                       |

8 outbound cross-links added across §13-§16. All target files verified to exist on disk; the two named headings (`Multi-Provider Cascade (Phase 34)` in `llm-pipeline-reliability.md` and `Phase 30.1 Sub-block` in ADR-0010) were verified by grep. The plain-file links (no fragment) intentionally land on the doc top — markdown-link-check (Plan 36-06 D-24) will mechanically verify resolution.

## Acceptance Criteria

### Task 1 (§6 rewrite + anchor shim — D-14)

- [x] `^## 6\. Vercel function timeout (300s default / 800s configured ceiling)` appears exactly once
- [x] `<a id="6-vercel-function-timeout-10-second-limit"></a>` appears exactly once, immediately above the new heading (line 351 → 353)
- [x] ToC line for §6 displays "(300s default / 800s configured ceiling)" but anchor link target is `#6-vercel-function-timeout-10-second-limit`
- [x] Old heading `^## 6\. Vercel function timeout (10-second limit)` absent
- [x] String `maxDuration: 800` present (Phase 29 D-08 ceiling reference) — appears at 2 callsites in §6 body
- [x] §6 references `withBatchWatchdog` 90s hard-kill (cross-link primitive to §13 NIM cause framing)
- [x] Commit subject matches `docs(36):` with `D-14` in body (commit `0cef703`)

### Task 2 (§13-§16 + ToC — D-13)

- [x] All four new headings present (`## 13. NIM throttle handling`, `## 14. Cron architecture lessons`, `## 15. Force-trigger`, `## 16. prod-connectivity-audit.yml`)
- [x] ToC entries 13-16 land between §12 entry and `---` separator (lines 33-36)
- [x] §13 contains inline link to `docs/architecture/llm-pipeline-reliability.md` (Claude-Discretion 5 honored — cross-link, not paraphrase)
- [x] §14 contains inline link to `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`
- [x] §15 references both `CRON_SECRET` AND `DASHBOARD_PASSWORD` as accepted Bearers AND the `?force=true` query param
- [x] §16 references `audit:connectivity:last-result` Redis key + the `allTiersGreen` field
- [x] All four sections follow the SRE template (Symptom / Detection / Cause / Remediation / Prevention)
- [x] Commit subject matches `docs(36):` with `D-13` in body (commit `5ef53e1`)
- [x] `wc -l docs/runbook.md` grew by ~150 lines (from 880 to 1030; within ±20 of planned ~200)

## Line Count Delta

| Stage              | Lines | Delta              |
| ------------------ | ----- | ------------------ |
| Pre-Plan-36-03     | 903   | (baseline)         |
| Post-Task-1 (D-14) | 880   | -23 (§6 condensed) |
| Post-Task-2 (D-13) | 1030  | +150 (4 new SRE)   |
| **Net Plan-36-03** | 1030  | **+127 lines**     |

Net +127 lines (rather than the planned +200) because the new §6 body is 32 lines vs the old 55-line body — the new framing is denser and shed legacy detail (e.g., the long Yahoo-style cache-eviction tangent that was already tangential to timeout-handling). Body count of §13-§16 alone is +150 lines.

## Deviations from Plan

None — both tasks executed exactly as written. Per-task verification commands from the plan ran clean on first attempt.

### Out-of-scope observations (logged here, not fixed in this plan)

The existing ToC line 32 reads `12. [Common log query patterns](#common-log-query-patterns)` but §12 in the file is actually `## 12. Quarterly LLM Health Probes`. The "Common log query patterns" section is unnumbered (just `## Common log query patterns`). This pre-dates Phase 36 and is out of scope for Plan 36-03 (scope is §6 + §13-§16, not §12 renumbering). Not added to deferred-items.md because Plan 36-06 (phase close) will run markdown-link-check and the anchor `#common-log-query-patterns` does resolve (GitHub auto-generates it from the unnumbered heading), so it's not broken — just visually inconsistent. Future operations phase could renumber if it bothers the eye.

## Authentication Gates

None encountered. All work was filesystem edits + git commits on a per-agent worktree branch.

## Commit Trail

| #   | Hash      | Task          | Subject                                                                                                              |
| --- | --------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | `0cef703` | Task 1 (D-14) | `docs(36): D-14 rewrite runbook §6 (Vercel function timeout) for Pro plan 800s ceiling; preserve old anchor shim`    |
| 2   | `5ef53e1` | Task 2 (D-13) | `docs(36): D-13 add runbook §13-§16 (NIM throttle, cron architecture, force-trigger, prod-audit retry) + ToC update` |

Both commits passed prettier + gitleaks pre-commit hooks. No file deletions; only modifications to `docs/runbook.md`.

## Self-Check: PASSED

- [x] `docs/runbook.md` exists (1030 lines)
- [x] Commit `0cef703` exists in `git log --oneline`
- [x] Commit `5ef53e1` exists in `git log --oneline`
- [x] §6 new heading present (line 357)
- [x] Anchor shim `<a id="6-vercel-function-timeout-10-second-limit"></a>` present (line 355)
- [x] ToC §6 display text retitled, anchor link unchanged
- [x] §13 / §14 / §15 / §16 headings present (lines 867, 903, 935, 969)
- [x] ToC entries 13-16 present (lines 33-36)
- [x] All cross-link target files exist on disk
- [x] Two key referenced headings (`Multi-Provider Cascade (Phase 34)` + `Phase 30.1 Sub-block`) verified in target docs
- [x] SRE template subheadings present in each new section
- [x] STATE.md, ROADMAP.md, REQUIREMENTS.md NOT modified (worktree mode discipline)

## Coverage

- **DOCS-PUB-03** — Runbook gains 4 new SRE-template sections covering v1.4 + v1.5 incident playbooks (NIM throttle, cron architecture lessons, operator force-trigger, prod-audit retry); §6 rewritten against Pro plan 800s ceiling; old §6 anchor preserved via HTML shim.
