---
phase: 29
plan: 10
subsystem: docs
tags: [runbook, llm-optional, operator-docs, LLM-RELI-05, D-04]
dependency-graph:
  requires:
    - "Plan 09 (CI integration test at server/__tests__/routes/llm-optional.test.ts) — paired with this runbook entry per CONTEXT D-04 belt + suspenders pattern"
    - "Plans 04-08 (cascade narrowing + override-surface deletion + v1/v2 extractor deletion) — already merged; create the LLM-optional surface this runbook documents"
  provides:
    - "Operator-facing smoke test + recovery procedure for LLM-disabled mode"
    - "Cross-reference target for ADR-0010 and CLAUDE.md Pitfall 1 bridge"
  affects:
    - "docs/runbook.md (TOC + new section 11)"
tech-stack:
  added: []
  patterns:
    - "Runbook section follows existing Symptom / Expected behavior / Smoke / Recovery / Why-it-matters style of sections 1-10"
key-files:
  created: []
  modified:
    - "docs/runbook.md (+130 lines: new section 11 + TOC entry; existing 'Common log query patterns' renumbered TOC slot 11 → 12)"
decisions:
  - "Placed section 11 between section 10 (LLM pipeline hung) and the unnumbered 'Common log query patterns' to keep numbered failure modes contiguous"
  - "Updated TOC to insert section 11 and renumber the 'Common log query patterns' slot to 12 (its heading stays unnumbered, matching the file's existing convention)"
  - "Used 5-step smoke + 5-step recovery format (per RESEARCH.md Code Examples spec); included exact curl commands with jq pipes for assertion clarity"
  - "Cross-referenced ADR-0010 stub (Plan 11) and the Plan 09 CI guard explicitly so operators can locate the related artifacts"
metrics:
  duration: "5 minutes"
  completed: "2026-05-11"
---

# Phase 29 Plan 10: LLM Pipeline Disabled / Keys Absent Runbook Entry Summary

Operator-facing runbook entry in `docs/runbook.md` section 11 documenting the LLM-optional contract (smoke test + recovery procedure) — paired with Plan 09's CI integration test per CONTEXT D-04 belt + suspenders pattern.

## What changed

- **`docs/runbook.md`** — appended a new `## 11. LLM Pipeline Disabled / Keys Absent` section (130 lines net) with:
  - **Symptom + Expected behavior** intro describing the three triggers (operator disable, key revocation, billing test) and the four expected runtime signals (`/api/events` serves raw GDELT, `events:llm:v3` empty, cron early-returns `llm_unconfigured`, DevApiStatus row honest).
  - **`### Operator smoke test`** — 5 numbered steps: (1) unset `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` in Vercel dashboard with direct link; (2) `vercel --prod`; (3) `curl /api/events | jq '.data | length'` expecting >0; (4) `curl /api/events | jq '.data[0].data | keys'` expecting raw-GDELT shape (no `enrichedSummary`, no `geocodeProvenance`, no `precision`, no `confidence`); (5) load DevApiStatus API Health tab and confirm honest tier state (Events (raw) healthy, Events (LLM) unknown/degraded).
  - **`### Recovery (re-enable LLM)`** — 5 numbered steps: (1) restore env vars; (2) `vercel --prod`; (3) force-trigger cron via `curl -H "Authorization: Bearer $CRON_SECRET" '...?force=true'`; (4) `vercel logs --since 10m | grep cron/refresh-events` to watch the extraction run; (5) re-run smoke step 4 to confirm LLM-enriched fields return.
  - **`### Why this matters`** — three bullets: Severity NONE (designed mode), CI guard at `server/__tests__/routes/llm-optional.test.ts` (Plan 09), and explicit cross-references to ADR-0010 + CLAUDE.md Pitfall 1 bridge.
- **`docs/runbook.md` Table of contents** — inserted new TOC entry `11. LLM Pipeline Disabled / Keys Absent` between the existing `10.` and the `Common log query patterns` slot; renumbered the TOC slot for "Common log query patterns" from 11 → 12 (the section heading itself stays unnumbered, matching the file's existing convention).

## Behavior change

None at runtime. This is documentation-only — the LLM-optional contract is created by Plans 04-08 (already merged) and mechanically guarded by Plan 09's CI integration test. This plan adds the operator-facing surface so a human running an incident can:

1. Recognize the symptom set in <30s (open TOC, see "11. LLM Pipeline Disabled / Keys Absent").
2. Execute a 5-step smoke without writing prose.
3. Recover with a 5-step procedure that includes a single curl command for force-trigger.
4. Find the architectural rationale (ADR-0010) and the test guard (`llm-optional.test.ts`) by name.

## Files modified

| File              | Change                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/runbook.md` | +130 lines: TOC entry for section 11; renumber TOC slot for Common log query patterns 11 → 12; new section 11 (~125 body lines) appended |

## Commits

| Hash    | Message                                                                                       |
| ------- | --------------------------------------------------------------------------------------------- |
| 44d2924 | `docs(29): add 'LLM Pipeline Disabled / Keys Absent' runbook entry (LLM-RELI-05)`             |

## Verification

All plan acceptance criteria passed:

- `grep -c "^## 11. LLM Pipeline Disabled" docs/runbook.md` → `1`
- `grep -c "### Operator smoke test" docs/runbook.md` → `1`
- `grep -c "### Recovery" docs/runbook.md` → `2` (one in section 11, one was already present elsewhere in the runbook)
- `grep -c "otg-iran-monitor.vercel.app" docs/runbook.md` → `4` (smoke step 3, smoke step 4, recovery step 3, plus existing CORS section reference)
- `grep -cP 'ADR-0010|server/__tests__/routes/llm-optional' docs/runbook.md` → `2` (both cross-references present in the Why-this-matters block)

Plan-level verification block also passes:

- `grep -c "^## 11. LLM Pipeline Disabled" docs/runbook.md` → `1` (≥1 required)
- `grep -cP "Operator smoke test|Recovery|Why this matters" docs/runbook.md` → `5` (≥3 required)

## Deviations from Plan

None — plan executed exactly as written. The verbatim section content from RESEARCH.md Code Examples was used; the 5-step smoke + 5-step recovery + Why-it-matters structure matches the spec.

## Threat surface scan

No new threat surface introduced. The runbook is documentation only. The smoke test instructs the operator to use `vercel --prod` (operator-side auth, not CI) and the recovery step's `curl` uses `Authorization: Bearer $CRON_SECRET` which the operator already has in their shell when running cron-related ops. Both T-29-10-01 (URL doc-drift — mitigated by using `otg-iran-monitor.vercel.app` which is the current prod alias per Phase 28.2 W1 D-03) and T-29-10-02 (`vercel --prod` requires operator login — not a CI concern; documented as operator-facing) are within their stated mitigations.

## Self-Check: PASSED

- `docs/runbook.md` — FOUND
- Commit `44d2924` — FOUND in git log
- TOC entry `11. LLM Pipeline Disabled / Keys Absent` — FOUND at line 31
- Section heading `## 11. LLM Pipeline Disabled / Keys Absent` — FOUND at line 673
- Cross-reference to `ADR-0010` — FOUND in Why-this-matters block
- Cross-reference to `server/__tests__/routes/llm-optional.test.ts` — FOUND in Why-this-matters block
