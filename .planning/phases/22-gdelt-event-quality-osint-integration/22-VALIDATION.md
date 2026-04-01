---
phase: 22
slug: gdelt-event-quality-osint-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 22 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via vite.config.ts test block) |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run server/__tests__/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/__tests__/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| DISP-01 | 01 | 1 | Concentric ring dispersion | unit | `npx vitest run server/__tests__/lib/dispersion.test.ts` | W0 | pending |
| DISP-02 | 01 | 1 | Per-centroid grouping | unit | `npx vitest run server/__tests__/lib/dispersion.test.ts` | W0 | pending |
| DISP-03 | 01 | 1 | Timestamp-stable slot assignment | unit | `npx vitest run server/__tests__/lib/dispersion.test.ts` | W0 | pending |
| DISP-04 | 01 | 1 | Ring overflow wrapping | unit | `npx vitest run server/__tests__/lib/dispersion.test.ts` | W0 | pending |
| GEO-01 | 01 | 1 | ActionGeo_Type=4 centroid detection | unit | `npx vitest run server/__tests__/gdelt.test.ts` | Extend | pending |
| GEO-02 | 01 | 1 | ActionGeo_Type=1,5 low-precision flag | unit | `npx vitest run server/__tests__/gdelt.test.ts` | Extend | pending |
| CFG-01 | 01 | 1 | Config-driven thresholds from env vars | unit | `npx vitest run server/__tests__/gdelt.test.ts` | Extend | pending |
| CFG-02 | 01 | 1 | Configurable CAMEO exclusion list | unit | `npx vitest run server/__tests__/gdelt.test.ts` | Extend | pending |
| BELL-01 | 02 | 2 | Bellingcat RSS feed integration | unit | `npx vitest run server/__tests__/adapters/rss.test.ts` | Extend | pending |
| BELL-02 | 02 | 2 | Corroboration requires temporal+geo+keyword | unit | `npx vitest run server/__tests__/lib/eventScoring.test.ts` | Extend | pending |
| BELL-03 | 02 | 2 | +0.2 confidence boost on corroboration | unit | `npx vitest run server/__tests__/lib/eventScoring.test.ts` | Extend | pending |
| BELL-04 | 02 | 2 | Corroboration wired into parseAndFilter pipeline | integration | `npx vitest run server/__tests__/gdelt.test.ts` | Extend | pending |
| AUD-01 | 03 | 3 | Audit collects accepted + rejected events | unit | `npx vitest run server/__tests__/lib/eventAudit.test.ts` | W0 | pending |
| AUD-02 | 03 | 3 | Rejected events include reason string | unit | `npx vitest run server/__tests__/lib/eventAudit.test.ts` | W0 | pending |
| FIX-01 | 03 | 3 | True positive fixtures pass pipeline | integration | `npx vitest run server/__tests__/gdelt-fixtures.test.ts` | W0 | pending |
| FIX-02 | 03 | 3 | False positive fixtures rejected | integration | `npx vitest run server/__tests__/gdelt-fixtures.test.ts` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/lib/dispersion.test.ts` -- stubs for DISP-01 through DISP-04
- [ ] `server/__tests__/lib/eventAudit.test.ts` -- stubs for AUD-01, AUD-02
- [ ] `server/__tests__/gdelt-fixtures.test.ts` -- stubs for FIX-01, FIX-02 (true/false positive fixture tests)
- [ ] Extend `server/__tests__/gdelt.test.ts` -- stubs for GEO-01, GEO-02, CFG-01, CFG-02, BELL-04
- [ ] Extend `server/__tests__/lib/eventScoring.test.ts` -- stubs for BELL-02, BELL-03
- [ ] Extend `server/__tests__/adapters/rss.test.ts` -- stubs for BELL-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual dispersion on map | DISP visual | Requires rendering + visual inspection | Deploy, zoom to city with stacked events, verify concentric ring pattern |
| Audit JSON readability | AUD readability | Subjective formatting quality | Run `npx tsx scripts/audit-events.ts`, review JSON structure |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
