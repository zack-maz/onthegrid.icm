---
phase: 14
slug: vercel-deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 with jsdom (frontend) + node (server) |
| **Config file** | vite.config.ts (test section) |
| **Quick run command** | `npx vitest run server/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| DEPLOY-01 | 01 | 1 | api/index.ts exports createApp() as default | unit | `npx vitest run server/__tests__/vercel-entry.test.ts -x` | ❌ W0 | ⬜ pending |
| DEPLOY-02 | 01 | 1 | Rate limiting returns 429 on excess requests | unit | `npx vitest run server/__tests__/rateLimit.test.ts -x` | ❌ W0 | ⬜ pending |
| DEPLOY-03 | 01 | 1 | Routes return 503 (not crash) when API keys missing | unit | `npx vitest run server/__tests__/server.test.ts -x` | ✅ partial | ⬜ pending |
| DEPLOY-04 | 01 | 1 | CORS wildcard works in production config | unit | `npx vitest run server/__tests__/server.test.ts -x` | ✅ partial | ⬜ pending |
| DEPLOY-05 | 02 | 2 | All existing API routes still work | integration | `npx vitest run server/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/vercel-entry.test.ts` — stubs for DEPLOY-01 (api/index.ts exports app correctly)
- [ ] `server/__tests__/rateLimit.test.ts` — stubs for DEPLOY-02 (rate limiting middleware)
- [ ] Update `server/__tests__/server.test.ts` — covers DEPLOY-03, DEPLOY-04 (graceful degradation with missing env vars, CORS wildcard)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel deployment succeeds | DEPLOY-01 | Requires Vercel platform | Run `vercel --prod`, verify 200 response at deployed URL |
| CDN serves frontend assets | DEPLOY-05 | Requires deployed environment | Check Network tab for Vercel CDN headers on static assets |
| Environment variables configured | Config | Requires Vercel dashboard | Verify all env vars set in Vercel project settings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
