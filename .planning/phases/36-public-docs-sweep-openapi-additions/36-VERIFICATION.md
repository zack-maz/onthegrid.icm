---
phase: 36-public-docs-sweep-openapi-additions
verified: 2026-05-29T22:00:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: 'Run `npx vitest run` to confirm openapi-lint.test.ts passes with current spec'
    expected: '2380 tests pass; openapi-lint.test.ts among them exits 0'
    why_human: 'Cannot execute vitest in this verifier process; requires npm/node runtime environment'
  - test: 'Run `npx @redocly/cli lint server/openapi.yaml` directly'
    expected: '0 errors, style warnings only (35 pre-existing)'
    why_human: 'Cannot execute CLI tools in this verifier process'
  - test: 'Run `npm run docs:lint` to verify markdown-link-check passes on Phase-36-introduced surface'
    expected: 'Clean exit on README.md + docs/**/*.md scope (7 pre-existing dead links in Phase-26.4 ADRs are documented out-of-scope)'
    why_human: 'Cannot execute CLI tools in this verifier process'
---

# Phase 36: Public Docs Sweep + OpenAPI Additions — Verification Report

**Phase Goal:** Bring README, docs/architecture/\* (12 files + 21 Mermaid blocks), docs/runbook.md, docs/degradation.md into v1.4 + v1.5 reality; extend server/openapi.yaml with 5 new endpoints + 4 component schemas + split securitySchemes; introduce a Redocly-driven openapi-lint vitest drift gate.
**Verified:** 2026-05-29T22:00:00Z
**Status:** HUMAN_NEEDED (automated checks all pass; 3 gate-execution items require a runtime environment)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                 | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | README.md updated for v1.4/v1.5: rate-limit drift fixed (6→60 req/min), new LLM Enrichment section (~99 lines, 6 subsections) present | VERIFIED | `README.md` line 207 reads `rateLimiters.public (60 req/min global tier)`; `## LLM Enrichment` found at line 514 with subsections on v3 cron extraction, 6-path resolver, Production health verification, API Health dashboard tab, Redis key registry                                                                                                                                          |
| 2   | 12 architecture markdown files audited (7 edited / 5 verified-clean); 21 Mermaid blocks audited (3 edited / 18 verified-clean)        | VERIFIED | Grep confirms 21 Mermaid blocks: data-flows.md×9 + frontend.md×3 + state-machines.md×4 + deployment.md×2 + system-context.md×2 + types.md×1 = 21. Architecture README.md lists operator deep-dives (llm-pipeline-reliability.md, redis-keys.md) confirming 12-file reality. deployment.md shows corrected lambda node label and 3-cron topology.                                                |
| 3   | docs/runbook.md gains §6 rewrite (800s ceiling, anchor shim) + §13-§16 SRE sections                                                   | VERIFIED | `<a id="6-vercel-function-timeout-10-second-limit"></a>` anchor shim at line 355. `## 6. Vercel function timeout (300s default / 800s configured ceiling)` at line 357. Sections 13/14/15/16 found in ToC at lines 33-36. Rate-limit references in runbook corrected to 60 req/min. §10 carries HISTORICAL marker for v2-era content.                                                           |
| 4   | docs/degradation.md has explicit Pitfall 1 "map never goes blank" contract + v3 → raw GDELT chain (no v1/v2)                          | VERIFIED | `### Pitfall 1 contract — the "map never goes blank" invariant` section at line 71. Chain documented as `v3 (cron-driven extraction, daily 04:00 UTC) → raw GDELT (Pitfall 1 cache bridge terminal fallback)`. Phase 29 v1/v2 deletion acknowledged at line 88. ADR-0010 cross-link present.                                                                                                    |
| 5   | server/openapi.yaml gains 5 new endpoint entries (DOCS-API-01..05)                                                                    | VERIFIED | All 5 paths confirmed at lines 535 (`/api/audit-status`), 606 (`/api/operator-status`), 679 (`/api/events/llm-status`), 718 (`/api/events/llm-replay/{groupKey}`), 889 (`/api/cron/refresh-events`). Note: DOCS-API-03 landed as `/api/events/llm-status` not `/api/events/llm-pipeline` — this is correct; the plan documented the framing gap explicitly (framing-gap callout #6 in SUMMARY). |
| 6   | /api/cron/health and /api/cron/warm verified/retagged as Cron + cronSecret-secured (DOCS-API-06, DOCS-API-07)                         | VERIFIED | Lines 825 and 856 show both entries with `tags: [Cron]` and `security: - cronSecret: []`. Descriptions expanded to reference `runEval()` + `runAdversarialEval()` (health) and `cron:lastTick:warm` writer (warm).                                                                                                                                                                              |
| 7   | components.securitySchemes split into cronSecret + operatorBearer (D-06)                                                              | VERIFIED | Lines 1010-1033 show `cronSecret:` and `operatorBearer:` schemes declared. All operator endpoints reference `operatorBearer`, all cron endpoints reference `cronSecret`. `/api/cron/refresh-events` uses `cronSecret` only (framing-gap #6 correctly resolved against shipped handler reality).                                                                                                 |
| 8   | 4 new component schemas declared: AuditTierStatus, ByBearerMap, LlmPipelineState, LlmReplayDiff (D-07)                                | VERIFIED | Definitions found at lines 1751, 1771, 1805, 1846. All 4 schemas are $ref'd by at least one endpoint: AuditTierStatus×5 by audit-status, ByBearerMap by operator-status, LlmPipelineState by llm-status, LlmReplayDiff by llm-replay. No orphan schemas.                                                                                                                                        |
| 9   | openapi-lint vitest drift gate at server/**tests**/openapi/openapi-lint.test.ts (D-08)                                                | VERIFIED | File exists. Line 1 is `// @vitest-environment node`. Uses `spawnSync` with `@redocly/cli lint`. 30s timeout set. REPO_ROOT path resolution correct (3 levels up from `server/__tests__/openapi/`). Mirrors urlLiveness.schema.test.ts pattern.                                                                                                                                                 |
| 10  | package.json has openapi:lint + docs:lint scripts and @redocly/cli + markdown-link-check devDependencies (D-08, D-24)                 | VERIFIED | Scripts at lines 35-36: `"openapi:lint": "redocly lint server/openapi.yaml --format=stylish"` and `"docs:lint": "markdown-link-check --quiet README.md && find docs..."`. DevDeps: `@redocly/cli: ^2.31.5` and `markdown-link-check: ^3.14.2`.                                                                                                                                                  |
| 11  | ADR-0011 Phase 36 sub-block appended (D-21); NIM-only REAFFIRMED framing with ADR-0010 cross-links                                    | VERIFIED | "REAFFIRMED" framing found in ADR-0011 at line 171. "NIM-only at runtime as of" text present. ADR-0010 Phase 30.1 and Phase 34 sub-block cross-links confirmed.                                                                                                                                                                                                                                 |

**Score:** 11/11 truths verified

---

### Deferred Items

No must-haves from Phase 36 are deferred to later phases. DOCS-PUB-04 (ADR-0010 milestone-close sub-block) was pre-designated as Phase 37 territory in CONTEXT D-04 and is not a Phase 36 must-have.

---

### Required Artifacts

| Artifact                                        | Expected                                                                                   | Status   | Details                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `README.md`                                     | v1.4/v1.5 accuracy; LLM Enrichment section; rate-limit fix                                 | VERIFIED | 731 lines. `## LLM Enrichment` at line 514, 6 subsections. Rate-limit corrected at line 207.        |
| `docs/architecture/README.md`                   | Operator deep-dives section (llm-pipeline-reliability, redis-keys)                         | VERIFIED | Operator deep-dives section present with both Phase 30 + Phase 35 additions.                        |
| `docs/architecture/system-context.md`           | api/vercel-entry.js node label corrected                                                   | VERIFIED | Fallback diagram node label corrected per D-09.                                                     |
| `docs/architecture/data-flows.md`               | §3 conflict events diagram updated (NIM-only, Phase 30.1 dormancy, SIMPLIFY-02/03 retired) | VERIFIED | D-09 sweep commit `903063a`.                                                                        |
| `docs/architecture/deployment.md`               | 3-cron topology, 800s maxDuration, server/index.ts link fix                                | VERIFIED | Lambda node correct; 3 cron nodes present; server-entrypoint link fixed at D-24 (commit `edbf094`). |
| `docs/architecture/ontology/types.md`           | ConflictEventType file path and Cerebras/Groq framing corrected                            | VERIFIED | D-09 sweep commit `050fac2`.                                                                        |
| `docs/architecture/ontology/algorithms.md`      | §9 LLM extraction section rewritten for Phase 29/30/30.1/34/35 reality                     | VERIFIED | NIM-only at runtime, cron-only writer, v1/v2 deleted, Phase 29 SIMPLIFY-04 all present.             |
| `docs/adr/0011-v3-llm-pipeline-architecture.md` | Phase 36 sub-block appended (REAFFIRMED framing)                                           | VERIFIED | Sub-block at line 147+. REAFFIRMED + ADR-0010 cross-links confirmed.                                |
| `docs/runbook.md`                               | §6 rewrite (800s, anchor shim); §13-§16 SRE sections; rate-limit 60/min                    | VERIFIED | All present and confirmed via grep.                                                                 |
| `docs/degradation.md`                           | Pitfall 1 contract subsection; v3→raw GDELT chain; 60/min rate-limit                       | VERIFIED | Pitfall 1 sub-section at lines 71-104. Chain text and rate-limit (60 req/min) confirmed.            |
| `server/openapi.yaml`                           | 5 new endpoints + 2 verified-clean + 4 schemas + 2 security schemes                        | VERIFIED | 1868 lines total. All 7 endpoints present. 4 schemas declared. 2 security schemes.                  |
| `server/__tests__/openapi/openapi-lint.test.ts` | Redocly lint vitest; @vitest-environment node; spawnSync                                   | VERIFIED | File substantive. 73 lines. Correct structure and assertions.                                       |
| `redocly.yaml`                                  | Drift gate config; structural rules at error; style rules at warn                          | VERIFIED | 35-line config. `recommended` extended. 4 rules downgraded to warn.                                 |
| `package.json`                                  | openapi:lint + docs:lint scripts; @redocly/cli + markdown-link-check devDeps               | VERIFIED | Both scripts and both devDependencies confirmed.                                                    |

---

### Key Link Verification

| From                                            | To                                              | Via                                                                                                                             | Status | Details                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/__tests__/openapi/openapi-lint.test.ts` | `server/openapi.yaml` + `@redocly/cli`          | `spawnSync('npx', ['@redocly/cli', 'lint', SPEC, ...])`                                                                         | WIRED  | SPEC resolved from REPO_ROOT = `resolve(__dirname, '../../..')` then `resolve(REPO_ROOT, 'server/openapi.yaml')`. Correct 3-level traversal. |
| `server/openapi.yaml /api/audit-status`         | `server/routes/audit-status.ts` handler         | Response schema declares `{status, runId, timestamp, endpoints, durationMs, allTiersGreen, tierStatus}` + AuditTierStatus $refs | WIRED  | Schema matches CLAUDE.md documented handler shape. `AuditTierStatus` $ref'd 5 times for tier-specific fields.                                |
| `server/openapi.yaml /api/events/llm-status`    | `server/routes/events.ts:345` handler           | operatorBearer security; LlmPipelineState schema                                                                                | WIRED  | Framing gap acknowledged inline in spec description. Path correctly documents shipped `/llm-status` not deleted `/llm-pipeline`.             |
| `server/openapi.yaml /api/cron/refresh-events`  | `server/routes/refresh-events-cron.ts:46-55`    | cronSecret-only security (framing gap from CONTEXT D-06 correctly resolved)                                                     | WIRED  | Spec acknowledges the D-06 framing gap inline. cronSecret-only per handler reality.                                                          |
| `README.md LLM Enrichment`                      | `docs/degradation.md` Pitfall 1 contract        | Hyperlink at line 523                                                                                                           | WIRED  | Link present: `[Pitfall 1 cache bridge contract in degradation.md](docs/degradation.md)`.                                                    |
| `docs/architecture/README.md`                   | `docs/architecture/llm-pipeline-reliability.md` | Operator deep-dives hyperlink                                                                                                   | WIRED  | Link to `llm-pipeline-reliability.md` in Operator deep-dives section.                                                                        |

---

### Data-Flow Trace (Level 4)

Not applicable. Phase 36 is a documentation + spec sweep — no UI components or data-rendering artifacts were introduced. All artifacts are markdown documents, YAML specification, and a test file. No dynamic data flows to trace.

---

### Behavioral Spot-Checks

| Behavior                                 | Command                                       | Result                                                                                                      | Status               |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| vitest 2380 pass (incl. openapi-lint)    | `npx vitest run`                              | Reported 2380/2380 in SUMMARY Gate 1 (2026-05-30); verifier cannot re-execute                               | SKIP (needs runtime) |
| Redocly lint exit 0                      | `npx @redocly/cli lint server/openapi.yaml`   | Reported 0 errors / 35 warnings in SUMMARY Gate 2                                                           | SKIP (needs runtime) |
| markdown-link-check clean                | `npm run docs:lint`                           | Reported clean for Phase-36 surface in SUMMARY Gate 3                                                       | SKIP (needs runtime) |
| ConflictEventEntity.type enum = 5 values | `grep -A5 "ConflictEventEntity" openapi.yaml` | 5-value enum confirmed: airstrike, on_ground, explosion, targeted, other (fix CR-01 commit `f05e15c`)       | PASS                 |
| /api/cron/refresh-events response shape  | `grep -A5 "dispatched" openapi.yaml`          | Schema has `required: [ok, durationMs, dispatched]` with `dispatched: boolean` (fix WR-01 commit `acc75d8`) | PASS                 |

---

### Probe Execution

No probes declared or discovered. Phase 36 is a documentation phase; no `scripts/*/tests/probe-*.sh` files are applicable.

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                         | Status    | Evidence                                                                                                                                                                                                          |
| ----------- | ----------- | --------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCS-PUB-01 | 36-01       | README.md updated for v1.4/v1.5 domain, v3 LLM pipeline, API Health tab, Bearer-bypass rate limiter | SATISFIED | Rate-limit fix at README line 207; LLM Enrichment section at line 514; production health verification subsection; API Health dashboard tab subsection                                                             |
| DOCS-PUB-02 | 36-02       | docs/architecture/ (10→12 markdown files, 21 Mermaid diagrams) updated                              | SATISFIED | 12 files audited; 7 edited (system-context, data-flows, deployment, frontend verified-clean, ontology/types, ontology/algorithms, architecture/README); 21 Mermaid blocks confirmed; 3 edited / 18 verified-clean |
| DOCS-PUB-03 | 36-03       | docs/runbook.md gains v1.4+v1.5 incidents (NIM throttle, cron lessons, force-trigger, audit retry)  | SATISFIED | §6 rewritten with 800s ceiling + anchor shim; §13-§16 appended; ToC updated; §10 marked HISTORICAL; LLM_BATCH_TIMEOUT_MS updated to 120s default                                                                  |
| DOCS-PUB-05 | 36-04       | degradation.md reflects Pitfall 1 cache bridge, v3→raw GDELT chain                                  | SATISFIED | Pitfall 1 sub-section with "map never goes blank" contract; v3→raw GDELT chain; Phase 29 deletion acknowledged; ADR-0010 cross-link; 60 req/min rate-limit corrected                                              |
| DOCS-API-01 | 36-05       | /api/audit-status added to OpenAPI spec                                                             | SATISFIED | Path at line 535; AuditTierStatus $ref×5; degrade-open auth posture documented; X-Audit-Stale header declared                                                                                                     |
| DOCS-API-02 | 36-05       | /api/operator-status added to OpenAPI spec                                                          | SATISFIED | Path at line 606; operatorBearer security; ByBearerMap $ref; 401+503 responses                                                                                                                                    |
| DOCS-API-03 | 36-05       | /api/events/llm-pipeline (or live equivalent) added to spec                                         | SATISFIED | Documented as /api/events/llm-status (the live endpoint per Phase 29 D-02 deletion); framing gap #6 explicitly noted in spec description; LlmPipelineState $ref                                                   |
| DOCS-API-04 | 36-05       | /api/events/llm-replay/{groupKey} added to spec                                                     | SATISFIED | Path at line 718; operatorBearer security; LlmReplayDiff $ref; 429 quota response with Retry-After header; per-Bearer quota documented                                                                            |
| DOCS-API-05 | 36-05       | /api/cron/refresh-events added to spec                                                              | SATISFIED | Path at line 889; cronSecret-only per shipped handler reality; ?force=true query param; dispatched/reason response schema; honest framing-gap note in description                                                 |
| DOCS-API-06 | 36-05       | /api/cron/health verified accurate + retagged Cron + cronSecret-secured                             | SATISFIED | Line 825; tags: [Cron]; security: cronSecret; description expanded for runEval() + runAdversarialEval()                                                                                                           |
| DOCS-API-07 | 36-05       | /api/cron/warm verified accurate + retagged Cron + cronSecret-secured                               | SATISFIED | Line 856; tags: [Cron]; security: cronSecret; description expanded for cron:lastTick:warm                                                                                                                         |

**All 11 Phase 36 requirements verified as SATISFIED.** DOCS-PUB-04 is a Phase 37 deliverable per CONTEXT D-04 — not a Phase 36 gap.

---

### Anti-Patterns Found

| File                  | Line               | Pattern                                                                                             | Severity | Impact                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/runbook.md`     | 377, 385, 905, 937 | "90s `withBatchWatchdog` hard-kill" alongside "120s" default in §13/§14                             | INFO     | These are accurate: §6 references `LLM_BATCH_TIMEOUT_MS` as the operator override; §13/§14 cite the 90s watchdog which refers to a per-batch timeout metric that can be different from the 120s env-var default. The v3-era default caveat is correctly scoped in §10. No blocker. |
| `server/openapi.yaml` | 1028, 1799         | `/api/events/llm-replay/:groupKey` cited with colon-param syntax alongside `{groupKey}` OAS3 syntax | INFO     | The colon-syntax appears only in description text (not in path keys). OAS3 path keys use `{groupKey}` correctly. Not a spec error; Redocly would catch it if it were.                                                                                                              |

No TBD, FIXME, or XXX markers found in Phase-36-modified files. No unreferenced debt markers. No stub implementations.

**Notable observations (non-blocking):**

1. **`redocly.yaml` downgrade of `security-defined` rule to `warn`** — correct design choice; public data endpoints are intentionally unauthenticated (rate-limited instead). The downgrade prevents style noise from masking structural errors in the drift gate. The 4 downgraded rules (`operation-operationId`, `operation-4xx-response`, `no-server-example.com`, `security-defined`) match the 35-warning count reported at phase close.

2. **`ByBearerMap` schema shape** — shipped as an `array` (of per-bearer objects) rather than the `object` with `additionalProperties` proposed in the PLAN interfaces block. The actual implementation matches the array shape (confirmed by `server/routes/operator-status.ts` returning an array per SUMMARY framing gap #5 context). Redocly lint passing at phase close confirms no broken $refs.

3. **`AuditTierStatus.status` enum values** — shipped as `[healthy, degraded, unhealthy, unknown]` rather than the PLAN template `[green, yellow, red]`. The plan template described the outer envelope status (green/yellow/red); the per-tier status uses a different vocabulary from the handler. Redocly lint exit-0 confirms this is internally consistent.

4. **`LlmPipelineState` schema** — shipped as `additionalProperties: true` rather than a fully pinned shape. This is correctly justified in the schema description ("the observability surface evolves frequently"). The drift gate still catches auth posture regressions on this endpoint.

5. **7 pre-existing dead links** in Phase-26.4-vintage ADRs — documented out-of-scope in SUMMARY Gate 3. Not Phase-36-introduced. Future "ADR link-rot sweep" phase recommended.

---

### Human Verification Required

These items require a live runtime environment to execute — they cannot be verified by file inspection alone. All automated signals (SUMMARY gate reports, commit history, code structure) indicate they will pass.

#### 1. Full vitest suite (Gate 1)

**Test:** Run `npx vitest run` from the repository root on the current branch.
**Expected:** 2380 tests pass across 188+ files. `server/__tests__/openapi/openapi-lint.test.ts` is included and passes (exits 0). No regressions in unrelated tests from the Phase-36 doc/spec changes.
**Why human:** Cannot execute vitest in the verifier process. SUMMARY claims 2380/2380 at Gate 1 (2026-05-30 05:25 UTC), but commits `f05e15c`, `acc75d8`, `eb74403`, `ca61ee6`, `2562a18` landed after that run — the post-fix test count needs confirmation.

#### 2. Redocly lint direct execution (Gate 2)

**Test:** Run `npx @redocly/cli lint server/openapi.yaml --format=stylish` from repository root.
**Expected:** Exit code 0. 0 errors. Style warnings only (approximately 35, all pre-existing per `redocly.yaml` downgrade config).
**Why human:** Cannot execute CLI tools in the verifier process. Structural inspection of the spec shows no broken $refs or missing required fields, but only the tool can confirm definitively.

#### 3. Markdown link check (Gate 3)

**Test:** Run `npm run docs:lint` from repository root.
**Expected:** Clean exit for Phase-36-introduced surface (README.md + docs/**/\*.md). The 7 pre-existing dead links in Phase-26.4-vintage ADRs are known and out-of-scope; they may surface as failures in the link-check but were intentionally not fixed.
**Why human:\*\* Cannot execute CLI tools in the verifier process.

---

### Gaps Summary

No gaps found. All 11 must-have truths are VERIFIED at the code level. The 3 human verification items are gate-execution tasks (running the spec lint tool, running vitest, running markdown-link-check) — they are not code-implementation questions. All structural evidence from file inspection supports a confident expectation of gate success.

The status is `human_needed` rather than `passed` because the verification process cannot execute the 3 mechanical gates (vitest, Redocly CLI, markdown-link-check) programmatically from within the verifier. Once an operator confirms all 3 gates exit 0 on the current branch, status upgrades to `passed`.

**Post-fix validation note:** The orchestrator surfaced 1 BLOCKER (ConflictEventEntity.type 11→5 values, CR-01) and 4 scope-relevant WARNINGs (WR-01 cron response shape, WR-05 README test count, WR-06 runbook §10 HISTORICAL + LLM_BATCH_TIMEOUT_MS, WR-07 rate-limit 6→60) via inline code review. All 5 were fixed in commits `f05e15c`, `acc75d8`, `eb74403`, `ca61ee6`, `2562a18` before this verification. Each fix is observable in the codebase: the 5-value enum is at openapi.yaml line 1263-1267; the `dispatched` field schema is at line 956; README test count badge shows 2380; runbook §10 HISTORICAL marker at line 577; 60 req/min in degradation.md lines 235-236 and runbook grep results.

---

_Verified: 2026-05-29T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
