---
phase: 5
slug: entity-rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 with jsdom |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/entityLayers.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/entityLayers.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | MAP-02a | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | MAP-02b | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | MAP-02c | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | MAP-02d | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | MAP-02e | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 1 | MAP-02f | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-07 | 01 | 1 | MAP-02g | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-08 | 01 | 1 | MAP-02h | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-09 | 01 | 1 | MAP-02i | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/entityLayers.test.ts` — stubs for MAP-02a through MAP-02i
- [ ] Test mock for `@deck.gl/layers` (IconLayer constructor capture) — verify layer props without WebGL
- [ ] Add `@deck.gl/layers` to `vite.config.ts` test.alias if IconLayer import causes jsdom issues

*Existing Vitest + jsdom infrastructure covers test runner needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual marker appearance on map | MAP-02 | WebGL rendering requires visual inspection | Run dev server, verify chevrons/diamonds/starbursts/X-marks appear correctly on the map |
| Pulse animation smoothness | MAP-02 | Animation timing is perceptual | Run dev server, observe unidentified flights pulsing at ~2s cycle |
| Marker rotation with heading | MAP-02 | Rotation visual correctness | Run dev server, verify chevrons point in flight direction |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
