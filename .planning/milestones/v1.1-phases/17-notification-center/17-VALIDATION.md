---
phase: 17
slug: notification-center
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x with jsdom (frontend), node (server) |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | NOTF-02 | unit | `npx vitest run src/__tests__/severity.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | NOTF-03 | unit | `npx vitest run src/__tests__/newsMatching.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | NOTF-02 | unit | `npx vitest run src/__tests__/notificationStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | NOTF-01 | unit | `npx vitest run src/__tests__/NotificationBell.test.tsx -x` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | NOTF-02 | unit | `npx vitest run src/__tests__/notificationStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | NOTF-04 | unit | `npx vitest run src/__tests__/proximityAlerts.test.ts -x` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 2 | NOTF-05 | unit | `npx vitest run src/__tests__/filterStore.test.ts -x` | ✅ Extend | ⬜ pending |
| 17-04-02 | 04 | 2 | NOTF-05 | unit | `npx vitest run src/__tests__/FilterPanel.test.tsx -x` | ✅ Extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/severity.test.ts` — stubs for NOTF-02 scoring formula
- [ ] `src/__tests__/newsMatching.test.ts` — stubs for NOTF-03 matching
- [ ] `src/__tests__/notificationStore.test.ts` — stubs for NOTF-02 store derivation
- [ ] `src/__tests__/NotificationBell.test.tsx` — stubs for NOTF-01 rendering
- [ ] `src/__tests__/proximityAlerts.test.ts` — stubs for NOTF-04 computation
- [ ] Extend `src/__tests__/filterStore.test.ts` — additional cases for NOTF-05 default window
- [ ] Extend `server/__tests__/gdelt.test.ts` — numMentions/numSources normalization

*Existing infrastructure covers test framework and configuration.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dropdown z-index renders above all controls | NOTF-01 | Visual stacking order | Open dropdown, verify it floats above filter panel, detail panel, and map controls |
| Proximity alert icon appears near threatened site | NOTF-04 | Requires live map with unidentified flight near a site | Observe map when unidentified flight enters 50km radius of a key site |
| Map flies to event location on notification click | NOTF-02 | Requires interactive map fly-to animation | Click a notification card, verify map centers on event |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
