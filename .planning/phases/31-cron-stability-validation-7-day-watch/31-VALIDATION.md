---
phase: 31
slug: cron-stability-validation-7-day-watch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sources: `31-RESEARCH.md` "Validation Architecture" section + CLAUDE.md "Testing" section.

---

## Test Infrastructure

| Property               | Value                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Framework**          | Vitest `^4.1.0` (already installed; node env for server tests, jsdom for frontend)                                       |
| **Config file**        | `vite.config.ts` (test config)                                                                                           |
| **Quick run command**  | `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts server/__tests__/scripts/snapshot-cron-watch.test.ts` |
| **Full suite command** | `npx vitest run`                                                                                                         |
| **Estimated runtime**  | Quick ~5s · Full ~60–90s                                                                                                 |

---

## Sampling Rate

- **After every task commit:** Run quick command (~5s)
- **After every plan wave:** Run `npm run typecheck && npm run lint && npx vitest run` (~60–90s)
- **Before `/gsd-verify-work`:** Full suite must be green AND 7 consecutive natural PASS rows in `watch-log.json`
- **Max feedback latency:** 5 s for the diff-filter + snapshot-script tests; the 7-day observation window itself is wall-clock-bound

---

## Per-Task Verification Map

> Plan IDs are placeholder until gsd-planner emits PLAN.md files. Update during plan-check pass with real task IDs.

| Task ID                                                             | Plan     | Wave | Requirement | Threat Ref | Secure Behavior                                                                                                                         | Test Type         | Automated Command                                                                                                   | File Exists               | Status     |
| ------------------------------------------------------------------- | -------- | ---- | ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------- |
| 31-XX-01 (eval-bundle fix)                                          | prep #1  | 1    | LLM-RELI-06 | —          | Vercel bundle includes `ground-truth-events.json`; `evalScore.total > 0` in prod                                                        | integration       | force-trigger `/api/cron/refresh-events?force=true` + `npm run analyze:llm-run` → confirm `evalScore.total > 0`     | partial — analyzer exists | ⬜ pending |
| 31-XX-02 (diff-filter fix)                                          | prep #2  | 1    | LLM-RELI-06 | —          | `groups.filter` correctly excludes already-cached groups (prefix-add fix at `llmExtractionPipeline.ts:277`)                             | unit              | `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts -t "diff-filter excludes already-cached groups"` | ❌ Wave 0 — NEW FILE      | ⬜ pending |
| 31-XX-03 (analyzer docstring + --help)                              | prep #3  | 1    | LLM-RELI-06 | —          | `scripts/analyze-llm-run.ts --help` prints `CACHE_KEY_PREFIX` whitespace warning                                                        | unit / smoke      | `node --env-file-if-exists=.env --import tsx/esm scripts/analyze-llm-run.ts --help` grep `CACHE_KEY_PREFIX`         | manual smoke              | ⬜ pending |
| 31-XX-04 (runbook probe note)                                       | prep #4  | 1    | LLM-RELI-06 | —          | `docs/runbook.md` contains a paragraph naming `npm run probe:openrouter` as a quarterly check                                           | doc               | `grep -q "quarterly" docs/runbook.md && grep -q "probe:openrouter" docs/runbook.md`                                 | n/a (file edit)           | ⬜ pending |
| 31-XX-05 (snapshot script + watch-log schema + WATCH_DLQ_WHITELIST) | snapshot | 2    | LLM-RELI-06 | —          | Row schema matches contract; non-whitelisted DLQ reason → FAIL; GAP row pauses counter                                                  | contract + unit   | `npx vitest run server/__tests__/scripts/snapshot-cron-watch.test.ts`                                               | ❌ Wave 0 — NEW FILE      | ⬜ pending |
| 31-XX-06 (watch-log Day-1 + ongoing)                                | watch    | 3    | LLM-RELI-06 | —          | Daily `npm run watch:snapshot` writes PASS row to `watch-log.json`; markdown table regenerated                                          | manual / operator | `npm run watch:snapshot` exit 0 for 7 consecutive natural days                                                      | n/a (operator gate)       | ⬜ pending |
| 31-XX-07 (phase close)                                              | close    | 4    | LLM-RELI-06 | —          | SUMMARY.md written; LLM-RELI-06 checked in REQUIREMENTS.md; 7-day narrative appended to `docs/architecture/llm-pipeline-reliability.md` | manual            | `grep -q "LLM-RELI-06.*\[x\]" .planning/REQUIREMENTS.md`                                                            | n/a (final commit)        | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Nyquist 8-Dimension Verification (this phase)

| Dimension             | Verification for Phase 31                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build**             | `npm run build` after each prep fix lands. Validates tsup bundles cleanly with the new `vercel.json includeFiles` directive and that the diff-filter fix doesn't break the `runRefreshExtraction` import graph.           |
| **Types**             | `npm run typecheck` (`tsc -b && type-coverage`). The 97% type-coverage floor (`package.json:37`) is a regression ratchet. New snapshot script must hit 97% type coverage on its own LOC.                                  |
| **Lint**              | `npm run lint`. Zero-warnings policy enforced by Phase 29+ atomic commits.                                                                                                                                                |
| **Unit tests**        | Vitest. Diff-filter test + snapshot-schema contract test + DLQ-whitelist classification test + GAP-counter pause test.                                                                                                    |
| **Runtime (dev)**     | `npm run dev:server`; exercise `/api/health` JSON response and invoke `npm run watch:snapshot` against the dev Redis instance.                                                                                            |
| **Contract tests**    | `server/__tests__/scripts/snapshot-cron-watch.test.ts` pins the `watch-log.json` row schema. Any change requires updating writer + test in the same commit.                                                               |
| **Integration**       | Force-trigger of `/api/cron/refresh-events?force=true` against prod after eval-bundle fix lands — confirms `evalScore.total > 0` end-to-end. Then `npm run watch:snapshot` against the resulting `events:llm-summary:v3`. |
| **Manual / operator** | (a) D-02 validation force-trigger; (b) Daily morning snapshot run for ≥7 consecutive natural days; (c) Phase-close PR review per D-12.                                                                                    |

---

## Wave 0 Requirements

- [ ] `server/__tests__/lib/llmExtractionPipeline.test.ts` — covers the diff-filter prefix-add fix (verifies cached `llm-v3-X-Y-Z` ids correctly match against bare `g.key='X-Y-Z'` after prefix). NEW FILE.
- [ ] `server/__tests__/scripts/snapshot-cron-watch.test.ts` — pins `watch-log.json` row schema; classifies `WATCH_DLQ_WHITELIST` reasons (`v3:timeout_watchdog`, `v3:adaptive-retry-fail`) as non-failing; non-whitelisted reasons → FAIL; GAP row pauses counter. NEW FILE.
- [ ] Framework install: **none needed** — Vitest is already at `^4.1.0` per `package.json:121`.

---

## Manual-Only Verifications

| Behavior                                                                            | Requirement                        | Why Manual                                                                            | Test Instructions                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-02 force-trigger validation (eval-bundle + diff-filter fix verified live in prod) | LLM-RELI-06                        | Requires real prod cron run with NIM token spend (~30–200k tokens); cannot run in CI. | After prep fixes deploy, operator runs `curl -H "Authorization: Bearer $DASHBOARD_PASSWORD" "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"`. Then `npm run analyze:llm-run` to confirm `evalScore.total > 0`, processed-batch count is ≥30% lower than Phase 30 baseline (213), and no breaker trip. Result logged in `watch-log.json` with `natural: false, notes: "D-02 prep-validation force-trigger"`. |
| Day-1..Day-7 natural cron observation                                               | LLM-RELI-06 (success criteria 1–4) | Wall-clock observation of real prod 04:00 UTC cron over ≥7 consecutive days.          | Each morning (~04:30 UTC operator-local), run `npm run watch:snapshot`. Exit 0 = PASS day. Commit the new row per D-12 commit pattern. After Day 7 consecutive PASS, write SUMMARY.md and append 7-day narrative to `docs/architecture/llm-pipeline-reliability.md`.                                                                                                                                                                 |
| 3-reset-cycle escalation gate (conditional)                                         | LLM-RELI-06                        | Failure analysis judges whether to escalate to Phase 31.1 limiter rework.             | If `watch-log.json` records 3 reset cycles (counter dropped to 0 three times), operator opens Phase 31.1 (`/gsd-add-phase 31.1`) with `watch-log.json` as seed material; closes Phase 31 "Conditional on 31.1" per D-05.                                                                                                                                                                                                             |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR Wave 0 dependency OR documented manual-only verification
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual operator tasks are explicit, not silent gaps)
- [ ] Wave 0 covers both NEW test files (`llmExtractionPipeline.test.ts`, `snapshot-cron-watch.test.ts`)
- [ ] No watch-mode flags (CI gate)
- [ ] Feedback latency < 5 s for prep-fix unit tests
- [ ] `nyquist_compliant: true` set in frontmatter (flip after gsd-plan-checker passes)

**Approval:** pending
