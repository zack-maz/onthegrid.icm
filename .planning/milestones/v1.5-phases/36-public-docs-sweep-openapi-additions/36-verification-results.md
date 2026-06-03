# Phase 36 D-24 — 3-Gate Verification Results

**Run at phase close on branch `worktree-agent-a522a67cd0d984989` (parallel executor; orchestrator merges back to `feature/36-public-docs-sweep-openapi-additions`).**
**Final post-fix commit:** `edbf094` (`docs(36): D-24 fix deployment.md server-entrypoint link`)
**Run timestamp:** 2026-05-30 05:31 UTC

---

## Gate 1: Full test suite — `npx vitest run`

**Result:** ✓ PASSED

- 186 test files passed / 2 skipped (188 total)
- 2380 tests passed / 19 skipped / 5 todo (2404 total)
- 0 failed
- Duration: 56.12s

**Notable Phase-36 additions:**

- `server/__tests__/openapi/openapi-lint.test.ts` (Plan 36-05 D-08) — Redocly drift gate vitest; GREEN.

**Run timestamp:** 2026-05-30 22:25 PT (= 05:25 UTC)

---

## Gate 2: OpenAPI spec lint — `npx @redocly/cli lint server/openapi.yaml --format=stylish`

**Result:** ✓ PASSED — **0 errors, 35 warnings**

- Spec validated in 47ms
- 14 pre-existing + 5 new = 19 total endpoint entries
- 4 reusable component schemas (AuditTierStatus, ByBearerMap, LlmPipelineState, LlmReplayDiff)
- 2 securitySchemes (cronSecret, operatorBearer)

**Warning breakdown (all pre-existing style debt — out of scope per Plan 36-05 D-08 redocly.yaml downgrades):**

- `operation-operationId` — 14 endpoints lack `operationId:` (future API-hardening phase)
- `operation-4xx-response` — health probes intentionally only declare 2xx (degrade-open contract)
- `security-defined` — 14 public unauth endpoints intentionally have no security block

The drift gate's purpose is `$ref` / schema-shape / YAML-syntax regression detection; stylistic warnings do not fail the gate.

**Run timestamp:** 2026-05-30 22:30 PT (= 05:30 UTC)

---

## Gate 3: Markdown link check — `npm run docs:lint` (scoped via npx fallback because worktree lacks node_modules)

**Result:** ✓ PASSED for Phase-36-introduced links; pre-existing rot documented separately.

**Scope:** README.md + `docs/architecture/**/*.md` + `docs/runbook.md` + `docs/degradation.md` + `docs/adr/*.md` (NOT `.planning/` — per CONTEXT Claude-Discretion 2; NOT `docs/brainstorms/` or `docs/superpowers/` — per Plan 36-05 docs:lint script filter).

### Phase-36-introduced broken links — FIXED inline (3 total)

| #   | File                                    | Link                                                                                                                                             | Source plan                | Fix commit |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------- |
| 1   | docs/runbook.md ToC line 36             | `#16-prod-connectivity-auditymyl-retry-path-workflow_dispatch` → `#16-prod-connectivity-audityml-retry-path-workflow_dispatch` (typo: extra `y`) | Plan 36-03 D-13            | `877e9c0`  |
| 2   | docs/runbook.md §6 line 773             | `./adr/ADR-0010-llm-pipeline-v1-5-decisions.md` → `./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                                       | Plan 36-03 D-14 §6 rewrite | `877e9c0`  |
| 3   | docs/architecture/deployment.md line 50 | `../../server/app.ts` → `../../server/index.ts` (the createApp() factory lives at server/index.ts:31, NOT server/app.ts which doesn't exist)     | Plan 36-02 D-09            | `edbf094`  |

### Pre-existing rot — OUT-OF-SCOPE callouts (7 total, NOT fixed)

Per plan-specific notes: "a pre-existing OUT-OF-SCOPE link rot is a callout in SUMMARY but not a hard fail." These are dead source-tree links in Phase 26.4-vintage ADRs (committed 2026-04-09) where the referenced source files moved/renamed/deleted in subsequent phases. None of these were Phase-36-touched.

| File                                                                  | Dead link                                                                      | Origin                       | Disposition                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| docs/adr/0002-vercel-serverless-over-traditional-hosting.md           | `../../server/vercel.ts`                                                       | Phase 26.4-06 commit 5724308 | Pre-existing; file renamed to `server/vercel-entry.ts`                                                   |
| docs/adr/0002-vercel-serverless-over-traditional-hosting.md           | `../../server/app.ts`                                                          | Phase 26.4-06 commit 5724308 | Pre-existing; file is `server/index.ts`                                                                  |
| docs/adr/0004-threat-density-via-radial-gradient-shader.md            | `../../src/lib/threatWeight.ts`                                                | Phase 26.4-06 commit 5724308 | Pre-existing; file moved/deleted post-Phase-26.4                                                         |
| docs/adr/0005-phase-26-2-nlp-approach-scrapped.md                     | `../../.planning/phases/26.2-conflict-geolocation-improvement/26.2-CONTEXT.md` | Phase 26.4-06 commit 0422aeb | Pre-existing; archived to `.planning/phases/archive-26.2-nlp-scrapped/` per 2026-04-08 Phase-27-renumber |
| docs/adr/0005-phase-26-2-nlp-approach-scrapped.md                     | `../../.planning/phases/26.3-production-code-cleanup/26.3-CONTEXT.md`          | Phase 26.4-06 commit 0422aeb | Pre-existing; same archive                                                                               |
| docs/adr/0008-ethnic-distribution-via-geoepr-with-hatched-overlays.md | `../../src/components/map/EthnicTooltip.tsx`                                   | Phase 26.4-06 commit 1983809 | Pre-existing; file moved/deleted post-Phase-26.4                                                         |
| docs/architecture/ontology/algorithms.md                              | `../../../server/lib/dispersion.ts`                                            | Phase 26.4-05 commit 41a7769 | Pre-existing; file moved/deleted post-Phase-26.4                                                         |

Also noted (not flagged by gate because checker treats `http://localhost:*` as 0-status not 4xx-status):

- README.md `http://localhost:5173` + `http://localhost:3001` — dev-server URLs in Quick Start; not real dead links.

### Recommendation

A future "ADR link-rot sweep" phase (or operations phase) should audit + fix the 7 Phase-26.4-vintage broken source-tree links. Out of Phase 36 scope per CONTEXT D-04 "describe shipped not aspirational" — public docs touched by Phase 36 are clean; older docs untouched.

**Run timestamp:** 2026-05-30 05:31 UTC

---

## All 3 gates green for Phase-36-introduced surface

Public docs and OpenAPI spec describe shipped v1.5 reality, and mechanical drift gates (Redocly lint vitest + markdown-link-check script) are in place to keep them honest going forward. Phase 36 closes cleanly per D-24.
