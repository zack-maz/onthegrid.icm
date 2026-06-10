---
phase: 44
slug: events-subtab-pipeline-detail
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| **Framework**          | Vitest ^4.1.0 (jsdom for frontend, node for server)                      |
| **Config file**        | `vite.config.ts` (test block, with `test.alias` map mocks per CLAUDE.md) |
| **Quick run command**  | `npx vitest run <path>` (single file)                                    |
| **Full suite command** | `npx vitest run` (all) / `npx vitest run server/` (server only)          |
| **Estimated runtime**  | ~120 seconds (full suite); single file < 15s                             |

Additional gates: `npm run openapi:lint` (Redocly drift gate, D-04) · `npm run typecheck` (`tsc -b && type-coverage`).

---

## Sampling Rate

- **After every task commit:** Run the single affected test file (`npx vitest run server/routes/__tests__/operator-status.test.ts` for server tasks; `npx vitest run src/__tests__/DevApiStatusV3.test.tsx` / `src/__tests__/devApiStatusEventsSection.test.tsx` for client tasks)
- **After every plan wave:** Run `npx vitest run` + `npm run openapi:lint` + `npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID             | Plan | Wave | Requirement   | Threat Ref | Secure Behavior                                         | Test Type | Automated Command                                                     | File Exists  | Status     |
| ------------------- | ---- | ---- | ------------- | ---------- | ------------------------------------------------------- | --------- | --------------------------------------------------------------------- | ------------ | ---------- |
| (filled by planner) | —    | —    | EVENTS-TAB-01 | —          | presence-gated mounts self-hide                         | component | `npx vitest run src/__tests__/devApiStatusEventsSection.test.tsx`     | ✅ extend    | ⬜ pending |
| (filled by planner) | —    | —    | EVENTS-TAB-01 | —          | V3 empty-state pins evolved in lockstep                 | component | `npx vitest run src/__tests__/DevApiStatusV3.test.tsx`                | ✅ extend    | ⬜ pending |
| (filled by planner) | —    | —    | EVENTS-TAB-02 | —          | countsByStatus/lastProbedAt/attemptCount in prune block | route     | `npx vitest run server/routes/__tests__/operator-status.test.ts`      | ✅ extend    | ⬜ pending |
| (filled by planner) | —    | —    | EVENTS-TAB-02 | T-43-16    | `evidence` rendered as TEXT, not HTML                   | component | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` | ✅ extend    | ⬜ pending |
| (filled by planner) | —    | —    | SC-3          | —          | tablist DOM unchanged; 5 pinning suites green untouched | component | `npx vitest run src/components/ui/__tests__/`                         | ✅ untouched | ⬜ pending |
| (filled by planner) | —    | —    | SC-3 contract | —          | OpenAPI prune schema valid after additions              | lint      | `npm run openapi:lint`                                                | ✅           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

None — every test file needed already exists; all five are extension targets, not net-new infrastructure. The new `DeadLinkBucketsBlock` assertions live inside the existing `DevApiStatus.prune.test.tsx`. The 5 pinning suites (snapshot, tabMerge, diagnosticBlocks, operatorActions) already exist and must stay green untouched.

_Existing infrastructure covers all phase requirements._

---

## Manual-Only Verifications

| Behavior                                                          | Requirement      | Why Manual                                                                   | Test Instructions                                                                                                          |
| ----------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Live prod events subtab shows mounted blocks with real Redis data | EVENTS-TAB-01/02 | jsdom mocks fetch; real Bearer + live Redis state only on deployed dashboard | Open dashboard with Bearer, switch to Events subtab, confirm blocks render with live data and absent-data blocks self-hide |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
