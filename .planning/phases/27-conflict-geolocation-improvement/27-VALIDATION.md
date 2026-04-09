---
phase: 27
slug: conflict-geolocation-improvement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value            |
| ---------------------- | ---------------- |
| **Framework**          | vitest           |
| **Config file**        | vite.config.ts   |
| **Quick run command**  | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime**  | ~30 seconds      |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| ------- | ---- | ---- | ----------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| TBD     | TBD  | TBD  | TBD         | TBD        | TBD             | TBD       | TBD               | TBD         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] Test stubs for LLM adapter (Cerebras/Groq providers)
- [ ] Test stubs for event grouping algorithm
- [ ] Test stubs for 5-type ontology mapping
- [ ] Test stubs for Nominatim forward geocoding

_Will be refined after planning produces specific task breakdown._

---

## Manual-Only Verifications

| Behavior                                | Requirement | Why Manual               | Test Instructions                                                          |
| --------------------------------------- | ----------- | ------------------------ | -------------------------------------------------------------------------- |
| Precision radius rings render correctly | D-13        | WebGL visual rendering   | Verify exact/neighborhood/city/region rings appear at correct sizes on map |
| LLM-generated summaries are coherent    | D-18        | Subjective quality check | Read 10 event summaries, verify they describe events accurately            |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
