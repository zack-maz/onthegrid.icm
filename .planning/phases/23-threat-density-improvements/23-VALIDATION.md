---
phase: 23
slug: threat-density-improvements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | P23-01 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial | ⬜ pending |
| 23-01-02 | 01 | 1 | P23-02 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial | ⬜ pending |
| 23-01-03 | 01 | 1 | P23-03 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial | ⬜ pending |
| 23-01-04 | 01 | 1 | P23-04 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No | ⬜ pending |
| 23-01-05 | 01 | 1 | P23-05 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No | ⬜ pending |
| 23-02-01 | 02 | 1 | P23-06 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | No | ⬜ pending |
| 23-02-02 | 02 | 1 | P23-07 | unit | `npx vitest run src/__tests__/ThreatClusterDetail.test.tsx -x` | No | ⬜ pending |
| 23-02-03 | 02 | 1 | P23-08 | unit | `npx vitest run src/__tests__/ThreatClusterDetail.test.tsx -x` | No | ⬜ pending |
| 23-02-04 | 02 | 1 | P23-09 | unit | `npx vitest run src/__tests__/ThreatHeatmapOverlay.test.tsx -x` | Partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update existing `computeThreatWeight` tests to expect no temporal decay (P23-02)
- [ ] Update existing `aggregateToGrid` tests for 0.25-degree cell size (P23-03)
- [ ] Add `computeP90` test suite (P23-04)
- [ ] Add `mergeClusters` test suite (P23-06)
- [ ] Create `src/__tests__/ThreatClusterDetail.test.tsx` (P23-07, P23-08)
- [ ] Update legend test expectations (P23-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Military thermal palette looks correct visually | P23-01 | Visual rendering judgment | Toggle threat layer, verify dark blue/purple → yellow → orange → red gradient |
| P90 normalization makes quieter areas visible | P23-05 | Visual perception | Compare Iran interior vs Syria border — both should have visible color variation |
| Cluster click opens detail panel with event list | P23-07 | Full interaction flow | Click a cluster hotspot, verify detail panel opens with scrollable event cards |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
