---
phase: 33
slug: actor-metadata-audit-canonical-catalog-eval-expansion
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-05-21
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `33-RESEARCH.md` §"Validation Architecture (Nyquist)". Planner fills `Task ID` + `Status` columns during plan-phase.

---

## Test Infrastructure

| Property               | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| **Framework**          | Vitest with jsdom (frontend) + node (server)                     |
| **Config file**        | `vite.config.ts` (frontend) + `vitest.config.server.ts` (server) |
| **Quick run command**  | `npx vitest run <file>`                                          |
| **Full suite command** | `npx vitest run`                                                 |
| **Server suite**       | `npx vitest run server/`                                         |
| **Estimated runtime**  | ~120-180 seconds (full); ~5-15 seconds (per-file quick)          |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-test-file>`
- **After every plan wave:** Run `npx vitest run server/` (and `npx vitest run` if frontend files touched)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds per file; ~180s for full suite

---

## Per-Task Verification Map

> Sourced verbatim from `33-RESEARCH.md` §"Validation Architecture". Planner inserts concrete Task IDs (`33-NN-MM`) and per-execution Status fields once PLAN.md files are committed. `T-33-NN` threat refs land from `<threat_model>` blocks in each PLAN.md.

| Plan | Wave | Requirement | Threat Ref | Behavior / Secure Outcome                                                                 | Test Type   | Test File Path                                                   | File Exists          | Status     |
| ---- | ---- | ----------- | ---------- | ----------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- | -------------------- | ---------- |
| 01   | 1    | ACTOR-01    | —          | `classifyActor()` deterministically buckets null / empty / raw-CAMEO / ambiguous / clean  | unit        | `server/__tests__/lib/actorClassifier.test.ts`                   | ❌ W0 (new file)     | ⬜ pending |
| 01   | 1    | ACTOR-01    | —          | Audit script end-to-end against mocked Redis fixture                                      | integration | `.planning/phases/33-*/audit/run-audit.test.ts` (or manual UAT)  | ❌ W0 (new file)     | ⬜ pending |
| 02   | 1    | ACTOR-02    | —          | Catalog: no duplicate canonical names                                                     | contract    | `src/__tests__/lib/actorCatalog.test.ts`                         | ❌ W0 (new file)     | ⬜ pending |
| 02   | 1    | ACTOR-02    | —          | Catalog: every `cameoCodes[]` entry exists in committed CAMEO codebook                    | contract    | `src/__tests__/lib/actorCatalog.test.ts`                         | ❌ W0 (extend above) | ⬜ pending |
| 02   | 1    | ACTOR-02    | —          | `canonicalize()` is case-insensitive                                                      | contract    | `src/__tests__/lib/actorCatalog.test.ts`                         | ❌ W0 (extend above) | ⬜ pending |
| 02   | 1    | ACTOR-02    | —          | `canonicalize('unknown')` returns `null`                                                  | contract    | `src/__tests__/lib/actorCatalog.test.ts`                         | ❌ W0 (extend above) | ⬜ pending |
| 02   | 1    | ACTOR-02    | —          | `ACTOR_LOOKUP` build rejects duplicate aliases (load-time guard)                          | contract    | `src/__tests__/lib/actorCatalog.test.ts`                         | ❌ W0 (extend above) | ⬜ pending |
| 03   | 2    | ACTOR-03    | T-33-03    | Post-mapping catalog walk after Zod parse: `['IDF','irgc']` → canonical names             | unit        | `server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts` | ❌ W0 (new file)     | ⬜ pending |
| 03   | 2    | ACTOR-03    | —          | `repairActorConfidence()` fills missing entries with `'low'` defaults                     | unit        | `server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts` | ❌ W0 (extend above) | ⬜ pending |
| 03   | 2    | ACTOR-03    | —          | `enrichedEventV3` accepts new `actorConfidence` field; legacy payloads still parse        | contract    | `server/__tests__/lib/llmSchema.test.ts`                         | ✅ (extend existing) | ⬜ pending |
| 03   | 2    | ACTOR-03    | —          | `EVENT_EXTRACTION_SCHEMA_V3` JSON Schema literal includes `actorConfidence`               | contract    | `server/__tests__/lib/llmSchema.test.ts`                         | ✅ (extend existing) | ⬜ pending |
| 03   | 2    | ACTOR-03    | —          | SYSTEM_PROMPT_V3 line 143 extended with canonical-name hint                               | snapshot    | `server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts`       | ❌ W0 (new file)     | ⬜ pending |
| 04   | 3    | ACTOR-04    | —          | `runEval()` returns `actorMatchRate` field                                                | unit        | `server/__tests__/lib/llmEvalHarness.test.ts`                    | ✅ (extend existing) | ⬜ pending |
| 04   | 3    | ACTOR-04    | —          | Actor match is case-insensitive substring AND between `expectedActor1` + `expectedActor2` | unit        | `server/__tests__/lib/llmEvalHarness.test.ts`                    | ✅ (extend existing) | ⬜ pending |
| 04   | 3    | ACTOR-04    | —          | 3 new adversarial injections parse + score                                                | integration | `server/__tests__/lib/llmEvalHarness.adversarial.test.ts`        | ✅ (extend existing) | ⬜ pending |
| 04   | 3    | ACTOR-04    | —          | Ground-truth fixture: ≥30 of 50 events have non-null `expectedActor1`                     | contract    | `server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts`  | ❌ W0 (new file)     | ⬜ pending |
| 05   | 3    | ACTOR-05    | T-33-05    | `/api/operator-status` returns `actorQuality` block with correct shape (Bearer-gated)     | integration | `server/__tests__/routes/operator-status.test.ts`                | ✅ (extend existing) | ⬜ pending |
| 05   | 3    | ACTOR-05    | —          | `actorQuality.sample[]` capped at 20 entries                                              | integration | `server/__tests__/routes/operator-status.test.ts`                | ✅ (extend existing) | ⬜ pending |
| 05   | 3    | ACTOR-05    | T-33-05b   | `actorQuality` block degrade-open on Redis failure (no 500)                               | integration | `server/__tests__/routes/operator-status.test.ts`                | ✅ (extend existing) | ⬜ pending |
| 06   | 3    | ACTOR-05    | —          | `DevApiStatus.tsx` renders Actor Quality sub-block from mocked `opStatus.actorQuality`    | unit (RTL)  | `src/__tests__/components/DevApiStatus.actorQuality.test.tsx`    | ❌ W0 (new file)     | ⬜ pending |
| 06   | 3    | ACTOR-05    | —          | Drill-down: ≤20 rows + truncation footer when count > sample                              | unit (RTL)  | `src/__tests__/components/DevApiStatus.actorQuality.test.tsx`    | ❌ W0 (extend above) | ⬜ pending |
| 06   | 3    | ACTOR-05    | —          | Issue-badge color tokens match UI-SPEC                                                    | unit (RTL)  | `src/__tests__/components/DevApiStatus.actorQuality.test.tsx`    | ❌ W0 (extend above) | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [x] **`server/__tests__/lib/actorClassifier.test.ts`** (NEW) — unit tests for `classifyActor()` stub created in Wave 1 alongside the audit script. Stubs the 4 buckets before classifier impl lands.
- [x] **`src/__tests__/lib/actorCatalog.test.ts`** (NEW) — contract tests for catalog invariants (5 describes). Stubs first; impl in Wave 1 makes them pass.
- [x] **`server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts`** (NEW) — unit tests for D-08 post-mapping + D-10 repair. Stubs before extractor changes.
- [x] **`server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts`** (NEW) — snapshot test for SYSTEM_PROMPT_V3 line 143 extension. Stub stays trivial.
- [x] **`server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts`** (NEW) — contract test asserting `expectedActor{1,2}` backfill coverage ≥ 30/50.
- [x] **`src/__tests__/components/DevApiStatus.actorQuality.test.tsx`** (NEW) — RTL test for the actor-quality sub-block + drill-down + issue-badge colors.
- [ ] **`server/__tests__/lib/llmSchema.test.ts`** — extend existing schema test file (no Wave 0 install — file exists).
- [ ] **`server/__tests__/lib/llmEvalHarness.test.ts`** — extend existing eval test file (no Wave 0 install — file exists).
- [ ] **`server/__tests__/lib/llmEvalHarness.adversarial.test.ts`** — extend existing adversarial test file (no Wave 0 install — file exists).
- [ ] **`server/__tests__/routes/operator-status.test.ts`** — extend existing operator-status route test file (no Wave 0 install — file exists).

**Existing infrastructure covers all Vitest + jsdom + supertest patterns Phase 33 needs.** No new test-framework install. No new test-utility packages.

---

## Manual-Only Verifications

| Behavior                                                                | Requirement | Why Manual                                                                                                                                                   | Test Instructions                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit report against live `events:llm:v3` snapshot                      | ACTOR-01    | One-shot script run against staging Redis; output committed as `33-AUDIT-REPORT.md`. Not automated because the live cache state is the input, not a fixture. | Operator runs `npx tsx .planning/phases/33-*/audit/run-audit.ts` against staging Redis credentials; commits `33-AUDIT-REPORT.md`; reviewers spot-check bucket-d candidates and annotate `[✓ disagrees]` / `[✗ matches source]`.              |
| Daily cron tick produces forward-compat `events:llm:v3` with new fields | ACTOR-03    | Cron tick requires real LLM call (NIM); ~10 min wall-clock; not a unit-test workflow.                                                                        | After deploy: `GET /api/cron/refresh-events?force=true` with operator Bearer; wait for `events:llm:v3` rebuild (~10 min); confirm sample entries carry `actorConfidence` + canonical actor names.                                            |
| Eval cron run produces `actorMatchRate` baseline                        | ACTOR-04    | Eval baseline persists to Redis; verification requires post-cron inspection.                                                                                 | After cron tick: inspect `events:llm-eval-baseline:v3` Redis key; confirm `actorMatchRate` field populated and non-zero.                                                                                                                     |
| API Health dashboard renders Actor Quality sub-block                    | ACTOR-05    | Visual verification against UI-SPEC.                                                                                                                         | Operator opens API Health tab; confirms 4 counters render with non-zero values post-cron tick; expands drill-down list; confirms issue-badge colors match UI-SPEC `--color-text-muted` / `--color-faction-disputed` / `--color-event-other`. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify command OR Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual UATs are post-merge only)
- [ ] Wave 0 covers all NEW test files (6 stubs)
- [ ] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < 15s per file; < 180s full suite
- [ ] `nyquist_compliant: true` set in frontmatter after gsd-planner stamps Task IDs + threat refs into the per-task table

**Approval:** pending (gsd-planner / gsd-plan-checker)
