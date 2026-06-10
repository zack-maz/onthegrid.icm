---
phase: 43
slug: ghost-link-prune-correctness
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior                                                                           | Test Type | Automated Command                                                   | File Exists | Status     |
| ------- | ---- | ---- | ----------- | ---------- | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- | ----------- | ---------- |
| TBD     | —    | —    | GHOST-06    | T-43-XX    | soft-404 heuristic never issues fetch to SSRF-guarded hosts; capped read aborts at 16 KiB | unit      | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts`     | ✅          | ⬜ pending |
| TBD     | —    | —    | GHOST-07    | —          | `no-url` entries excluded from prune + sidecar count                                      | unit      | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts`     | ✅          | ⬜ pending |
| TBD     | —    | —    | GHOST-08    | —          | `unknown` preserves attemptCount; `unknown` never prune-eligible                          | unit      | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts` | ✅          | ⬜ pending |
| TBD     | —    | —    | GHOST-09    | —          | cron trigger excludes `403` (if demoted); manual path unchanged                           | unit      | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts` | ✅          | ⬜ pending |
| TBD     | —    | —    | GHOST-10    | —          | `.strict()` schema gains `evidence`; fixtures updated lockstep                            | unit      | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts`    | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — the four `server/__tests__/lib/urlLiveness.*.test.ts` suites, the `src/` schema shim, and the redis-registry drift gate already exist. No new framework install needed. New test cases extend existing files.

---

## Manual-Only Verifications

| Behavior                                             | Requirement     | Why Manual                                                     | Test Instructions                                                                                                                                    |
| ---------------------------------------------------- | --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| prunedIds sample audit confirms no live events swept | GHOST-08 (SC-3) | Requires production `operator:audit-log` data + live re-probes | Pull recent prune entries via `/api/operator-status` (Bearer), re-probe up to ~20 pruned URLs with a browser UA, record verdicts in verification doc |
| 403 false-positive evidence sample                   | GHOST-09 (SC-4) | Requires production 403-status keys + browser-context probes   | Re-probe current prod `403`-flagged URLs with browser UA; any live article confirms demotion decision                                                |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
