---
phase: 16
slug: news-feed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
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
| 16-01-01 | 01 | 1 | NEWS-01 | unit | `npx vitest run server/__tests__/adapters/gdelt-doc.test.ts -x` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | NEWS-01 | unit | `npx vitest run server/__tests__/adapters/rss.test.ts -x` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | NEWS-02 | unit | `npx vitest run server/__tests__/adapters/gdelt-doc.test.ts -x` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | NEWS-01 | integration | `npx vitest run server/__tests__/routes/news.test.ts -x` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | NEWS-02 | unit | `npx vitest run server/__tests__/routes/news.test.ts -x` | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 2 | NEWS-03 | unit | `npx vitest run server/__tests__/routes/news.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/adapters/gdelt-doc.test.ts` — stubs for NEWS-01, NEWS-02 (GDELT DOC API adapter)
- [ ] `server/__tests__/adapters/rss.test.ts` — stubs for NEWS-01 (RSS feed adapter)
- [ ] `server/__tests__/routes/news.test.ts` — stubs for NEWS-01, NEWS-02, NEWS-03 (route integration)
- [ ] `npm install fast-xml-parser` — new dependency for RSS parsing

*Existing infrastructure covers test framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GDELT DOC API returns live results | NEWS-01 | External API dependency | Hit `/api/news` locally, verify GDELT articles present |
| RSS feeds return live articles | NEWS-01 | External feed dependency | Check server logs for RSS fetch results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
