---
phase: 42
slug: water-filter-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| **Framework**          | vitest (jsdom frontend / node server)                              |
| **Config file**        | `vite.config.ts` (test block + aliases)                            |
| **Quick run command**  | `npx vitest run server/__tests__/adapters/overpass-water*.test.ts` |
| **Full suite command** | `npx vitest run`                                                   |
| **Estimated runtime**  | ~60 seconds (full), ~10 seconds (quick)                            |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/__tests__/adapters/overpass-water*.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID             | Plan | Wave | Requirement         | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| ------------------- | ---- | ---- | ------------------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| (filled by planner) | —    | —    | WATER-FILTER-01..04 | —          | N/A             | unit      | `npx vitest run`  | ⬜          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] Behavioral dedup test file — no dedup tests exist today (`duplicate` bucket is 0 in every fixture); likely requires extracting `spatialDedup(...)` as a pure exported function
- [ ] Fixture for the previously-dropped OSM element (regression pin per WATER-FILTER-04)

---

## Manual-Only Verifications

| Behavior                                          | Requirement     | Why Manual                                                      | Test Instructions                                                                                            |
| ------------------------------------------------- | --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Telemetry-first diagnosis from live Overpass data | WATER-FILTER-01 | Requires live `npm run refresh:water` runs against Overpass API | Run `npm run refresh:water` twice, diff facility ID sets, record `byTypeRejections` buckets in diagnosis doc |
| Production cache bump visible                     | WATER-FILTER-03 | Requires deployed Redis state                                   | Verify `water:facilities:v4` key populated post-deploy; snapshot regenerated                                 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
