---
phase: 32
slug: ghost-event-url-liveness-dashboard-prune
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-19
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `32-RESEARCH.md` §Validation Architecture (lines 707-767); planner filled in per-task rows during Plan 32-01..32-06 authoring.

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

> Each row: one task from the 32-NN-PLAN.md set, the requirement(s) it addresses, the threat it mitigates, the test type, the automated command, file-existence status (Wave 0 not yet created vs. landed), and execution status.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | (chore) | — | Branch cut from main; clean working tree | branch op | `test "$(git rev-parse --abbrev-ref HEAD)" = "feature/32-ghost-event-url-liveness-dashboard-prune"` | n/a | ⬜ pending |
| 32-01-02 | 01 | 1 | GHOST-02 | T-32-01 (schema drift) | Schema constants + ttl exported; tsc clean | unit (compile) | `npm run typecheck && grep -q "URL_LIVENESS_KEY_PREFIX" server/lib/urlLiveness.ts` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | GHOST-02 | T-32-01 | Zod `.strict()` parse round-trip + TTL upper-bound | unit (Vitest) | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/urlLiveness.schema.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-04 | 01 | 1 | (D-15) | — | INCR / 50-cap / 51st-call denied / UTC-midnight reset | unit | `npx vitest run server/__tests__/lib/pruneQuota.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-05 | 01 | 1 | (D-14) | T-32-04 | OperatorAuditEntry.operation widened to admit 'prune-dead-urls' | unit (compile) | `grep -q "'pipeline-swap' \| 'replay' \| 'prune-dead-urls'" server/lib/operatorAudit.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 2 | GHOST-05 | T-32-02 (SSRF), T-32-09 (DoS) | HEAD-then-GET-on-405; redirect ≤3; 10s timeout; SSRF guard; User-Agent on every fetch | unit (mocked-fetch matrix) | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 2 | GHOST-05 | T-32-09 | Per-host throttle waits ≥800ms between same-host probes; module-private | unit | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "throttle"` | ❌ W0 | ⬜ pending |
| 32-02-03 | 02 | 2 | GHOST-02 | T-32-01 | attemptCount monotonic-with-reset; sidecar INCR/DECR on transition only; cacheSetSafe exclusively | unit | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "persistLiveness"` | ❌ W0 | ⬜ pending |
| 32-02-04 | 02 | 2 | GHOST-01, GHOST-05 | T-32-06 (DoS) | createLimit(8) bound; deadlineMs short-circuit increments skippedBudget | unit | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "runProbeSweep\|concurrency\|deadline"` | ❌ W0 | ⬜ pending |
| 32-02-05 | 02 | 2 | GHOST-01 | — | D-04 two-tier sort: never-probed-first, then ascending lastProbedAt | unit | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts -t "buildProbeCandidates"` | ❌ W0 | ⬜ pending |
| 32-03-01 | 03 | 3 | GHOST-04 | T-32-05 (cron over-prune) | attemptCount>=3 cron gate; manual bypasses gate; D-13 delete scope | unit | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-02 | 03 | 3 | GHOST-04 | T-32-03 (Bearer), T-32-04 (audit) | dashboardAuth gate; manual quota; cron bypass; 503-never-500 on helper throw; audit-log delegated to helper | integration (supertest-style) | `npx vitest run server/__tests__/routes/events.prune.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-03 | 03 | 3 | GHOST-01 | T-32-06 (budget) | cron sweep+prune dispatched in order inside safeWaitUntil; deadline budget honored; deadline-elapsed skip path tested | integration | `npx vitest run server/__tests__/routes/refresh-events-cron.prune.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-04 | 03 | 3 | GHOST-04, GHOST-05 | T-32-03 + Pitfall 6 | prune endpoint returns 200 OR 503 under chaos — never 500 | chaos | `npx vitest run server/__tests__/resilience/redis-death.test.ts -t "prune-dead-urls"` | ❌ W0 (extend) | ⬜ pending |
| 32-04-01 | 04 | 4 | GHOST-03 | T-32-10, T-32-11 | /operator-status returns new `prune: {deadUrlCount, last24hPrunes}` block; defaults 0 on Redis death; byBearer.prunes counter increments | integration | `npx vitest run server/__tests__/routes/operator-status.test.ts -t "prune"` | ❌ W0 (extend) | ⬜ pending |
| 32-05-01 | 05 | 5 | GHOST-03, GHOST-04 | T-32-12, T-32-13 | dead-URL count row renders when present; button gated on count>0; click POSTs with operator Bearer; 429 alert; 200 triggers refresh | unit (jsdom) | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` | ❌ W0 | ⬜ pending |
| 32-05-02 | 05 | 5 | GHOST-03 | — | OperatorStatus interface forward-compatible (older servers without `prune` field still type-check) | unit (compile) | `npm run typecheck` | n/a | ⬜ pending |
| 32-06-01 | 06 | 6 | (close) | T-32-14 | CLAUDE.md registry + REQUIREMENTS + ROADMAP + STATE all updated atomically; no `[ ] **GHOST-0[1-5]**` remaining | docs (grep) | `! grep -q "\[ \] \*\*GHOST-0[1-5]\*\*" .planning/REQUIREMENTS.md && grep -q "events:url-liveness" CLAUDE.md` | n/a | ⬜ pending |
| 32-06-02 | 06 | 6 | (close) | — | 32-SUMMARY.md exists with per-decision + per-requirement evidence maps | docs (grep) | `test -f .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md && grep -q "GHOST-01" .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md` | n/a | ⬜ pending |
| 32-06-03 | 06 | 6 | (close) | — | PR opened against main with closing-PR description | gh CLI | `gh pr view --json url --jq .url` | n/a | ⬜ pending |
| 32-06-04 | 06 | 6 | GHOST-03, GHOST-04 | T-32-15 | Operator UAT against deployed preview — 4-6 manual items confirmed | manual | (see §Manual-Only Verifications below) | n/a | ⬜ pending (blocking checkpoint) |
| 32-06-05 | 06 | 6 | (close) | — | PR merged with --merge strategy (preserve atomic commit history); branch deleted | gh CLI | `gh pr view --json state --jq .state` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per `32-RESEARCH.md:752-765` (Wave 0 Gaps), 11 test files must be created before / alongside the production code. Distribution across plans:

| File | Owning Plan |
|------|-------------|
| `server/__tests__/lib/urlLiveness.schema.test.ts` | 32-01 Task 3 |
| `src/__tests__/lib/urlLiveness.schema.test.ts` (shim) | 32-01 Task 3 |
| `server/__tests__/lib/pruneQuota.test.ts` | 32-01 Task 4 |
| `server/__tests__/lib/urlLiveness.probe.test.ts` | 32-02 Task 1 |
| `server/__tests__/lib/urlLiveness.sweep.test.ts` | 32-02 Tasks 2, 3, 4, 5 (single file, growing as tasks land) |
| `server/__tests__/lib/urlLiveness.cronPrune.test.ts` | 32-03 Task 1 |
| `server/__tests__/routes/events.prune.test.ts` | 32-03 Task 2 |
| `server/__tests__/routes/refresh-events-cron.prune.test.ts` | 32-03 Task 3 |
| `src/__tests__/components/DevApiStatus.prune.test.tsx` | 32-05 Task 2 |
| Extend `server/__tests__/routes/operator-status.test.ts` | 32-04 Task 1 |
| Extend `server/__tests__/resilience/redis-death.test.ts` | 32-03 Task 4 |

No framework install needed — Vitest is already in `devDependencies` (`^4.1.0`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator clicks "Prune N dead events" in deployed dashboard, audit-log surfaces the entry via `/api/operator-status`, deleted events no longer appear in event panel | GHOST-04 (operator-facing flow) | End-to-end against deployed Vercel + live Upstash Redis; the unit/integration tests cover wire-up but cannot exercise the operator's actual Bearer session | 1) Deploy PR branch to Vercel preview, 2) Open `/api/health` dashboard with operator Bearer cookie set, 3) Note "Dead URL events: N" count, 4) Click "Prune N dead events", 5) Confirm count drops to 0 (or expected residual), 6) Check Operator Actions block shows the new `prune-dead-urls` entry with correct `prunedCount` |
| Daily cron auto-prune fires at 04:00 UTC + audit-log shows `bearerFingerprint: 'cron:refresh-events'` entry | GHOST-04 (cron path, D-11) | Real cron firing on Vercel Pro; cannot be faked by integration test | 1) Wait for or force `/api/cron/refresh-events?force=true` (Bearer), 2) Tail `/api/operator-status`, 3) Verify a `prune-dead-urls` entry with `bearerFingerprint: 'cron:refresh-events'` and `args: {trigger: 'cron'}`, 4) Spot-check that any pruned IDs had `attemptCount >= 3` before deletion |
| Probe sweep respects 800s `maxDuration` budget under realistic event count | GHOST-01, GHOST-05 (perf budget) | Tied to live Vercel function execution; unit test can simulate but cannot reproduce real cold-start latency | Tail `/api/cron/refresh-events?force=true` runtime logs after 04:00 UTC cron; assert handler completes (not killed) and probe sweep reports `phase 32 probe sweep complete` with `probed: N` close to `events:llm:v3` size minus deadline-skipped tail |
| Dashboard surface renders new `Dead URL events: N` row + `Prune N dead events` button when `prune.deadUrlCount > 0` | GHOST-03 (visibility) | jsdom render test covers the wire-up but cannot exercise the deployed CSS / Tailwind v4 `@theme` integration / real Bearer session | 1) Open deployed dashboard, 2) Navigate API Health tab → Operator Actions block, 3) Confirm count row renders + button is keyboard-accessible + Tailwind classes match the adjacent replay button styling |
| Chaos resilience: prune endpoint degrades open on Redis death | GHOST-04, GHOST-05 (Pitfall 6) | Test mocks redis but cannot reproduce real network partition between Vercel and Upstash | (Optional belt-and-suspenders) Temporarily revoke Upstash URL env on preview deploy; curl prune endpoint; expect 200 OR 503, NEVER 500 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are documented as manual under §Manual-Only Verifications
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Tasks 32-06-01..05 are docs/CLI-driven but all have grep / `gh` verify commands)
- [x] Wave 0 covers all MISSING references (11 test files / extensions, mapped to plans above)
- [x] No watch-mode flags (CI runs `vitest run`, never `vitest`)
- [x] Feedback latency < 30s per wave
- [x] `nyquist_compliant: true` set in frontmatter (Per-Task Verification Map fully populated)

**Approval:** ready for `/gsd:execute-phase 32`
