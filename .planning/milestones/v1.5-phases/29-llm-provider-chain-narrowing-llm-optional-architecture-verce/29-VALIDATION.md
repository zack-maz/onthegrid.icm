---
phase: 29
slug: llm-provider-chain-narrowing-llm-optional-architecture-verce
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Framework**          | vitest (jsdom for src/, node for server/)                                             |
| **Config file**        | vite.config.ts (test.alias for jsdom map mocks); separate node env for server/        |
| **Quick run command**  | `npx vitest run server/__tests__/routes/llm-optional.test.ts` (after D-04 task lands) |
| **Full suite command** | `npx vitest run && npm run lint && npx tsc --noEmit && npm run build`                 |
| **Estimated runtime**  | ~60–90 seconds for the full suite (vitest ~30s, lint ~5s, tsc ~10s, build ~30s)       |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` (server/ + src/) and `npx tsc --noEmit`
- **After every plan wave:** Run the full suite (vitest + lint + tsc + build)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Filled in by gsd-planner. Each task in the wave plans MUST land in this table with a `Test Type` (unit / integration / smoke / synthetic-prod / manual) and an `<automated>` command. Any row that drops to "manual" must list the operator step in the Manual-Only section.

| Task ID  | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| 29-XX-XX | TBD  | TBD  | TBD         | TBD        | TBD             | TBD       | TBD               | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `server/__tests__/routes/llm-optional.test.ts` — D-04 LLM-optional regression guard (LLM-RELI-05)
- [ ] Vitest mock factory pattern reuse — match `server/__tests__/routes/events-fallback.test.ts` style (researcher confirmed harness)
- [ ] No new framework installs needed — vitest + supertest already present (Phase 28.2 W6 stack)

---

## Manual-Only Verifications

| Behavior                                                                | Requirement                        | Why Manual                                                                                         | Test Instructions                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Pro plan active on `onthegrid.icm`                               | LLM-RELI-01 (D-08)                 | Operator action — billing dashboard, not codebase                                                  | Visit `https://vercel.com/zack-maz-projects/onthegrid.icm/settings/billing`; confirm "Pro" plan active. Required BEFORE first Phase 29 commit.                                                                                                                       |
| 800s synthetic invocation against `/api/cron/refresh-events?force=true` | LLM-RELI-01 (D-09)                 | Requires Vercel Pro upgrade + CRON_SECRET Bearer; can't be CI-automated without leaking the secret | After D-08 deploy: `curl -H "Authorization: Bearer $CRON_SECRET" "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"`. Watch `vercel logs` for `Duration:` >300s without function-killed signal. Authoritative signal for the maxDuration bump. |
| GitHub repo rename completed via Settings → Rename                      | D-11                               | Operator action — GitHub UI                                                                        | After Phase 29 docs commit lands: GitHub Settings → Rename to `otg-iran-monitor`. Confirm `git remote -v` works (auto-redirect) OR run `git remote set-url origin https://github.com/zack-maz/otg-iran-monitor.git`.                                                 |
| Local folder rename                                                     | D-11                               | Operator action — filesystem                                                                       | After all in-flight Bash sessions for Phase 29 finish: `mv /Users/zackmaz/Desktop/my_world /Users/zackmaz/Desktop/otg-iran-monitor`.                                                                                                                                 |
| Vercel ↔ GitHub link survives the rename                                | D-11                               | Operator post-rename verification — Vercel UI                                                      | After GitHub rename: visit `https://vercel.com/zack-maz-projects/onthegrid.icm/settings/git`; confirm "Connected Git Repository" shows the new repo name (Vercel auto-tracks). If broken, re-link via the same UI.                                                   |
| CLAUDE.md token-count + 5-item operator skim test                       | DOCS-INT-01 (D-07)                 | Operator skim is the verification contract; no automated tooling for "findable in <30s"            | Run `npx tiktoken-cli CLAUDE.md` before + after D-06 commit; capture in commit message. Then time-box a manual 30-second skim per item (Redis keys, env vars, color tokens, domain constants, cron schedule). PASS = all five findable.                              |
| LLM-optional in production (operator-facing smoke)                      | LLM-RELI-05 (D-04 runbook section) | Operator action against prod                                                                       | Vercel dashboard → unset `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` → redeploy → hit `https://otg-iran-monitor.vercel.app/api/events` → confirm events render → confirm DevApiStatus shows raw-GDELT source tier. Re-set keys + redeploy after.                     |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (currently: `server/__tests__/routes/llm-optional.test.ts`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after task table is filled)

**Approval:** pending
