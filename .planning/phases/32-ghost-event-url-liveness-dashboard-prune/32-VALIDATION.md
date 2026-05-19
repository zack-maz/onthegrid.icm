---
phase: 32
slug: ghost-event-url-liveness-dashboard-prune
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `32-RESEARCH.md` §Validation Architecture (lines 707-767); planner fills in per-task rows + status during plan-phase Step 8.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 (server: `--environment node`, frontend: `--environment jsdom`) |
| **Config file** | `vite.config.ts` (inline test config) |
| **Quick run command** | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts server/__tests__/lib/pruneQuota.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5s (quick) / ~30s (per-wave) / ~3min (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command (the two unit suites that change most often).
- **After every plan wave:** Run `npx vitest run server/__tests__/lib/urlLiveness.*.test.ts server/__tests__/routes/events.prune.test.ts server/__tests__/routes/refresh-events-cron.prune.test.ts` (~30s).
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** 30 seconds (per-wave). 5 seconds (per-task).

---

## Per-Task Verification Map

> Planner fills these rows during Step 8 from the Phase Requirements → Test Map in `32-RESEARCH.md:720-744`. Source-of-truth for the requirement→test mapping lives there; this section is the per-task expansion.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 0 | GHOST-02 | T-32-01 (schema drift) | Zod parse round-trip; TTL upper-bound per status | unit | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts` | ❌ W0 | ⬜ pending |
| _(planner expands)_ | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per `32-RESEARCH.md:752-765` (Wave 0 Gaps):

- [ ] `server/__tests__/lib/urlLiveness.schema.test.ts` — D-22 contract test (Zod parse round-trip; TTL upper-bound; rejects unknown status; rejects missing fields)
- [ ] `src/__tests__/lib/urlLiveness.schema.test.ts` — Literal CONTEXT D-22 path; 5-line shim re-running server-side suite (per RESEARCH A5)
- [ ] `server/__tests__/lib/urlLiveness.probe.test.ts` — Mocked-fetch matrix: 200 / 404 / 403 / 405-then-GET / 3xx-chain / timeout / DNS-fail / User-Agent assertion
- [ ] `server/__tests__/lib/urlLiveness.sweep.test.ts` — `createLimit(8)` bound, per-host 1s throttle, deadline-skip, sweep priority sort (never-probed first, then oldest `lastProbedAt`)
- [ ] `server/__tests__/lib/urlLiveness.cronPrune.test.ts` — `attemptCount ≥ 3` gate for cron auto-prune, status taxonomy filtering (D-12)
- [ ] `server/__tests__/lib/pruneQuota.test.ts` — Clone of `server/__tests__/lib/replayQuota.test.ts`: 51st call → `allowed:false`, Retry-After value, UTC-midnight reset
- [ ] `server/__tests__/routes/events.prune.test.ts` — Supertest harness: Bearer gate (401 without bearer), quota (429 + Retry-After at cap), cron-bypass, splice-and-audit-log assertion
- [ ] `server/__tests__/routes/refresh-events-cron.prune.test.ts` — Verify cron handler calls probe sweep + prune in the right order, inside `safeWaitUntil` envelope (post `runRefreshExtraction()`, respects 800s budget)
- [ ] `src/__tests__/components/DevApiStatus.prune.test.tsx` — jsdom render: dead-URL count display when `opStatus.prune.deadUrlCount > 0`; button click → `fetch` POST assertion with operator Bearer; in-flight state; 429 alert path
- [ ] Extend `server/__tests__/routes/operator-status.test.ts` — assert new `prune.deadUrlCount` field in response shape
- [ ] Extend `server/__tests__/resilience/redis-death.test.ts` — add `POST /api/events/prune-dead-urls` to the asserted-routes list; assert 200 OR 503, never 500 (RESEARCH Pitfall 4)

No framework install needed — Vitest is already in `devDependencies` (`^4.1.0`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator clicks "Prune N dead events" in deployed dashboard, audit-log surfaces the entry via `/api/operator-status`, deleted events no longer appear in event panel | GHOST-04 (operator-facing flow) | End-to-end against deployed Vercel + live Upstash Redis; the unit/integration tests cover wire-up but cannot exercise the operator's actual Bearer session | 1) Deploy to Vercel preview, 2) Open `/api/health` dashboard with operator Bearer cookie set, 3) Note "Dead URL events: N" count, 4) Click "Prune N dead events", 5) Confirm count drops to 0 (or expected residual), 6) Check Operator Actions block shows the new `prune-dead-urls` entry with correct `prunedCount` |
| Daily cron auto-prune fires at 04:00 UTC + audit-log shows `bearerFingerprint: 'cron:refresh-events'` entry | GHOST-04 (cron path, D-11) | Real cron firing on Vercel Pro; cannot be faked by integration test | 1) Wait for or force `/api/cron/refresh-events?force=true` (Bearer), 2) Tail `/api/operator-status`, 3) Verify a `prune-dead-urls` entry with `bearerFingerprint: 'cron:refresh-events'` and `args: {trigger: 'cron'}`, 4) Spot-check that any pruned IDs had `attemptCount >= 3` before deletion |
| Probe sweep respects 800s `maxDuration` budget under realistic event count | GHOST-01, GHOST-05 (perf budget) | Tied to live Vercel function execution; unit test can simulate but cannot reproduce real cold-start latency | Tail `/api/cron/refresh-events?force=true` runtime logs after 04:00 UTC cron; assert handler completes (not killed) and probe sweep reports `eventsProbed: N` to logs with N reasonably close to `events:llm:v3` size minus the deadline-skipped tail |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (11 test files / extensions above)
- [ ] No watch-mode flags (CI runs `vitest run`, never `vitest`)
- [ ] Feedback latency < 30s per wave
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips this after Per-Task Verification Map is fully populated)

**Approval:** pending
