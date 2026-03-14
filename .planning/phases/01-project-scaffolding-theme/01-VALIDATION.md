---
phase: 1
slug: project-scaffolding-theme
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + @testing-library/react 16.3.2 |
| **Config file** | vite.config.ts (Vitest reads Vite config) or vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | INFRA-02 | setup | `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFRA-02-a | smoke | `npx vitest run src/__tests__/App.test.tsx -t "renders"` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | INFRA-02-b | unit | `npx vitest run src/__tests__/theme.test.ts -t "theme"` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | INFRA-02-c | unit | `npx vitest run src/__tests__/AppShell.test.tsx -t "layout"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | INFRA-02-d | unit | `npx vitest run src/__tests__/uiStore.test.ts -t "store"` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | INFRA-02-e | smoke | `npx tsc --noEmit` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/App.test.tsx` — smoke test for app render (INFRA-02-a)
- [ ] `src/__tests__/AppShell.test.tsx` — layout region tests (INFRA-02-c)
- [ ] `src/__tests__/uiStore.test.ts` — Zustand store toggle tests (INFRA-02-d)
- [ ] `src/__tests__/theme.test.ts` — theme CSS variable tests (INFRA-02-b)
- [ ] `src/test/setup.ts` — jest-dom matchers setup
- [ ] Framework install: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dark theme visual appearance | INFRA-02 | Visual correctness needs human eye | 1. Run `npm run dev` 2. Verify dark background, white text 3. Check accent colors render correctly |
| HMR hot reload works | Success Criteria 1 | Dev server behavior | 1. Run `npm run dev` 2. Edit a component 3. Verify change appears without full reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
