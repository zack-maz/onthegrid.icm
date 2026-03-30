---
phase: 21
slug: production-review-deploy-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 with jsdom (frontend) and node (server) |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run` + `npx vite build`
- **Before `/gsd:verify-work`:** Full suite must be green + production deploy + smoke test pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | Scale: Cache-Control | integration | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | Scale: Helmet headers | integration | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | Scale: Per-endpoint rate limits | unit | `npx vitest run server/__tests__/rateLimit.test.ts` | ✅ (update) | ⬜ pending |
| 21-01-04 | 01 | 1 | Scale: Health endpoint | integration | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-01-05 | 01 | 1 | Scale: Structured logging | unit | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-01-06 | 01 | 1 | Scale: CORS lockdown | integration | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | Redis: Graceful degradation | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | ✅ (update) | ⬜ pending |
| 21-02-02 | 02 | 1 | Redis: Budget monitoring | unit | `npx vitest run server/__tests__/` | ❌ W0 | ⬜ pending |
| 21-03-01 | 03 | 2 | Polish: Bundle optimization | build | `npx vite build` | N/A | ⬜ pending |
| 21-03-02 | 03 | 2 | Polish: Code correctness | unit | `npx vitest run` | ✅ | ⬜ pending |
| 21-04-01 | 04 | 3 | Deploy: Smoke tests | e2e | `npx tsx scripts/smoke-test.ts $URL` | ❌ W0 | ⬜ pending |
| 21-04-02 | 04 | 3 | Deploy: Env var audit | manual | N/A | N/A | ⬜ pending |
| 21-04-03 | 04 | 3 | Deploy: Visual verification | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/middleware/cacheControl.test.ts` — stubs for Cache-Control header verification
- [ ] `server/__tests__/health.test.ts` — stubs for rich health endpoint response shape
- [ ] `scripts/smoke-test.ts` — production endpoint smoke test script (stub)
- [ ] Fix 6 pre-existing ThreatHeatmapOverlay test failures

*Existing infrastructure covers most phase requirements; Wave 0 fills integration test gaps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual overlay coexistence | SC-2: No z-index/layout conflicts | Visual check on rendered map | Open app, toggle all overlays on, verify no visual overlap or clipping |
| Map interactions | SC-1: All features function together | Complex user interaction flows | Click entities, open panels, toggle layers, verify tooltips and detail panels |
| Production deploy | SC-1: Deployed to Vercel | Requires deployment action | Run `vercel --prod`, verify URL loads |
| Env var audit | Deploy: env var completeness | Cross-reference with Vercel dashboard | Compare `server/config.ts` vars against Vercel project environment settings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
