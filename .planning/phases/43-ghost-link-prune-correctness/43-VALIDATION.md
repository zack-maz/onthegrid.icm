---
phase: 43
slug: ghost-link-prune-correctness
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-10
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (node environment for `server/`)                                                                                                                                                                           |
| **Config file**        | `vite.config.ts` (test.alias + environment config)                                                                                                                                                                |
| **Quick run command**  | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts server/__tests__/lib/urlLiveness.probe.test.ts server/__tests__/lib/urlLiveness.sweep.test.ts server/__tests__/lib/urlLiveness.cronPrune.test.ts` |
| **Full suite command** | `npx vitest run server/ && npx vitest run src/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/redis-registry.test.ts`                                                                                  |
| **Estimated runtime**  | ~30 seconds (quick) / ~3 minutes (full server suite)                                                                                                                                                              |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (4 urlLiveness suites)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npx tsc --noEmit` (typecheck gate)
- **Max feedback latency:** ~180 seconds

---

## Per-Task Verification Map

> Filled in by the planner — each task maps to a requirement, its automated command, and (where applicable) a threat ref from the plan's `<threat_model>`.

| Task ID  | Plan  | Wave | Requirement       | Threat Ref                | Secure Behavior                                                                         | Test Type | Automated Command                                                                                             | File Exists | Status     |
| -------- | ----- | ---- | ----------------- | ------------------------- | --------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 43-01-T1 | 43-01 | 1    | GHOST-10          | T-43-01                   | schema migration safe — writer-only Zod parse; old entries read via generic cast        | unit      | `npx tsc --noEmit`                                                                                            | ✅          | ⬜ pending |
| 43-01-T2 | 43-01 | 1    | GHOST-10          | T-43-02                   | `.strict()` gains `evidence`; all fixtures + shim updated in lockstep                   | unit      | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/urlLiveness.schema.test.ts` | ✅          | ⬜ pending |
| 43-01-T3 | 43-01 | 1    | GHOST-10          | —                         | Redis registry lockstep; redis-registry drift gate stays green                          | unit      | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                                                     | ✅          | ⬜ pending |
| 43-02-T1 | 43-02 | 2    | GHOST-06          | T-43-07                   | precision-first tie-break — never flags live content dead                               | unit      | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "classifySoft404"`                          | ✅          | ⬜ pending |
| 43-02-T2 | 43-02 | 2    | GHOST-06          | T-43-03, T-43-04          | capped GET on already-SSRF-vetted finalUrl; 16 KiB abort; degrade-open                  | unit      | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts`                                               | ✅          | ⬜ pending |
| 43-03-T1 | 43-03 | 3    | GHOST-08          | T-43-09                   | `unknown` preserves attemptCount; `live` resets; DECR retained; evidence persisted      | unit      | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "persistLiveness"`                          | ✅          | ⬜ pending |
| 43-03-T2 | 43-03 | 3    | GHOST-07          | T-43-08, T-43-10          | source-less → `no-url` (no fetch); excluded from sidecar count                          | unit      | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "buildProbeCandidates"`                     | ✅          | ⬜ pending |
| 43-04-T1 | 43-04 | 2    | GHOST-09 (SC-3/4) | T-43-11, T-43-12, T-43-13 | evidence-sample script; env-only creds; polite re-probe; degrade-open                   | tsc       | `npx tsc --noEmit` + `grep Mozilla scripts/sample-pruned-urls.ts`                                             | ➕ new      | ⬜ pending |
| 43-04-CK | 43-04 | 2    | GHOST-09 (SC-3/4) | —                         | operator reviews prod prunedIds + 403 verdicts; locks demote-or-keep decision           | manual    | checkpoint:human-verify (blocking-human)                                                                      | n/a         | ⬜ pending |
| 43-04-T2 | 43-04 | 2    | GHOST-09 (SC-3/4) | —                         | decision + verdict tables recorded in 43-VERIFICATION.md                                | doc       | `grep "GHOST-09 / SC-3 Evidence Sample" 43-VERIFICATION.md`                                                   | ✅          | ⬜ pending |
| 43-05-T1 | 43-05 | 4    | GHOST-09          | T-43-14, T-43-15          | cron-only 403 exclusion (prune-filter-local, NOT isTerminalDead); unknown/no-url pinned | unit      | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts`                                           | ✅          | ⬜ pending |
| 43-05-T2 | 43-05 | 4    | GHOST-10          | T-43-16, T-43-17          | `DeadUrlSampleEntry` gains evidence + soft-404; degrade-open on old entries             | unit      | `npx tsc --noEmit`                                                                                            | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — the four `server/__tests__/lib/urlLiveness.*.test.ts` suites, the `src/` schema shim, and the redis-registry drift gate already exist. No new framework install needed. New test cases extend existing files. The only NEW file is `scripts/sample-pruned-urls.ts` (Plan 04, a one-off evidence-sample utility, not test infrastructure). `wave_0_complete: true` — no test scaffold gaps; every code-producing task extends an existing suite.

---

## Manual-Only Verifications

| Behavior                                             | Requirement     | Why Manual                                                     | Test Instructions                                                                                                                                                |
| ---------------------------------------------------- | --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prunedIds sample audit confirms no live events swept | GHOST-08 (SC-3) | Requires production `operator:audit-log` data + live re-probes | Plan 43-04 checkpoint: run `scripts/sample-pruned-urls.ts` against prod, re-probe up to ~20 pruned URLs with a browser UA, record verdicts in 43-VERIFICATION.md |
| 403 false-positive evidence sample                   | GHOST-09 (SC-4) | Requires production 403-status keys + browser-context probes   | Plan 43-04 checkpoint: re-probe current prod `403`-flagged URLs with browser UA; any live article confirms the demotion decision (consumed by Plan 43-05)        |

> Both manual verifications are wrapped by Plan 43-04's `checkpoint:human-verify` (blocking-human) task and recorded by its autonomous Task 2 — the recorded decision feeds Plan 43-05's prune-filter implementation (D-14 evidence-gated, Phase 42 D-03 pivot pattern).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the GHOST-09 manual sample is a `checkpoint:human-verify` with an autonomous recording task; all code tasks have `<automated>` commands)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — all suites + shim + drift gate exist)
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner 2026-06-10
