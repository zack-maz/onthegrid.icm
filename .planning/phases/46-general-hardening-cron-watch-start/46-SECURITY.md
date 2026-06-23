---
phase: 46
slug: general-hardening-cron-watch-start
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-22
---

# Phase 46 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                              | Description                                                                                                | Data Crossing                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| anonymous client → /api/\*                            | untrusted traffic the rate limiter sheds; the 429 counter sits on this already-error path                  | request metadata (tier, IP)                  |
| operator Bearer → /api/operator-status                | privileged read of limiter config + 429 counts; stays behind the existing `dashboardAuth` gate             | operator-tier metadata (non-secret)          |
| middleware / cron handler → Upstash Redis             | degrade-open boundary — a Redis failure on a counter / watch ring must not affect the response             | INCR counters, watch-ring samples            |
| public client → /api/health                           | intentionally un-gated (the prod audit reads it); the new `missedRun` field renders on this public surface | cron freshness + schedule grace (non-secret) |
| /api/health → prod-connectivity-audit.yml             | LLM-RELI-07 gate boundary — health status enum must stay 4-state so `okCron` never sees `missed`           | health status wire contract                  |
| /api/operator-status + /api/health → DevApiStatus DOM | client renders server strings; frozen WAI-ARIA tablist contract must not change                            | rendered text (tier names, counts, evidence) |
| test harness → mocked Redis (46-05)                   | test-only; the only boundary is the Vitest-mocked `cache/redis.js` module — no runtime/network surface     | n/a                                          |

---

## Threat Register

| Threat ID  | Category                 | Component                                                  | Disposition | Mitigation                                                                                                                                                                                                         | Status |
| ---------- | ------------------------ | ---------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T-46-01-01 | Denial of Service        | 429 INCR on hot error path (`rateLimit.ts`)                | mitigate    | `incr429` body try/caught `server/middleware/rateLimit.ts:54-69`; fired `void incr429(...)` at `:154` BEFORE `res.status(429)` `:155`. Test `rateLimit.test.ts:353-373` — throwing INCR stays 429, never 500       | closed |
| T-46-01-02 | Denial of Service        | `ratelimit:429:*` Redis-write amplification                | mitigate    | Per-tier-per-day key `:56`; EXPIRE-on-first `if (used === 1)` `:58`; 48h TTL `:51,63`. Test `rateLimit.test.ts:338-351` (no re-EXPIRE)                                                                             | closed |
| T-46-01-03 | Information Disclosure   | rateLimiter block exposes limit config + 429 counts        | accept      | Operator-tier non-secret metadata behind `dashboardAuth` Bearer gate (`operator-status.ts:395`); block in own try/catch → null `:681-706`                                                                          | closed |
| T-46-01-04 | Elevation of Privilege   | Bearer bypass blast radius (per-route budget)              | accept      | Pre-existing W6 audit decision (`rateLimit.ts:95-115`); D-03 only PROVES bypass reaches every tier (`rateLimit.test.ts:259-272`), does not widen radius                                                            | closed |
| T-46-01-05 | Tampering                | `ratelimit:429` key components                             | mitigate    | Both components server-derived: `tier` from `rateLimiters` table `:178-226`, date from `new Date()` `:55`; no client input                                                                                         | closed |
| T-46-02-01 | Tampering                | health status wire contract / LLM-RELI-07 gate             | mitigate    | `missed` is a SIBLING `missedRun` field, not a `healthStatusEnum` value (`healthSchema.ts:25,41,83`); `healthSchema.test.ts:149-150` pins enum to 4 states; `health.test.ts:423,427` asserts status never `missed` | closed |
| T-46-02-02 | Information Disclosure   | missedRun + schedule grace on public /api/health           | accept      | /api/health already exposes cron freshness publicly for the audit; grace windows non-secret; field derived purely in-process (`health.ts:540-552`)                                                                 | closed |
| T-46-02-03 | Denial of Service        | missedRun derivation on the health request path            | mitigate    | `deriveCronRunState` pure, no Redis/throw (`healthSources.ts:216-225`); consumes already-read `probe.freshnessMs` (`health.ts:545-550`) — no new I/O                                                               | closed |
| T-46-02-04 | Tampering                | `.strict()` schema drift (dev `.parse` throw)              | mitigate    | `missedRun: cronRunStateEnum.optional()` on `.strict()` schema (`healthSchema.ts:83,85`), same task as route edit. Tests `healthSchema.test.ts:157,173,188`                                                        | closed |
| T-46-03-01 | Denial of Service        | appendWatchSample throw degrading /api/cron/health         | mitigate    | Own try/catch (`cron-health.ts:213-230`) AFTER `cron:lastTick:health` + trend writes; throw logged+swallowed `:229`; `res.json` continues `:232`. Test `cron-health.test.ts:176`                                   | closed |
| T-46-03-02 | Denial of Service        | cron:watch ring unbounded growth                           | mitigate    | Bounded LPUSH+LTRIM(0,13) cap 14 (`cronWatch.ts:104`), ~30d TTL `:41,105`, atomic single `.exec()` `:106`. Test `cronWatch.test.ts:105-119`                                                                        | closed |
| T-46-03-03 | Information Disclosure   | watch ring/artifact exposing eval scores + DLQ counts      | accept      | Eval/DLQ already surface via /api/cron/health + operator dashboard; WATCH artifact lives in `.planning/` (not shipped)                                                                                             | closed |
| T-46-03-04 | Tampering                | watch row values (server-derived)                          | mitigate    | Static literal key `cron:watch:v2` (`cronWatch.ts:37`); all sample fields server-computed (`cron-health.ts:216-226`); no injection surface                                                                         | closed |
| T-46-04-01 | Tampering                | frozen tablist/tabpanel DOM                                | mitigate    | Both blocks render INSIDE existing `role="tabpanel"` (`DevApiStatus.tsx:968,2368-2369`); `tabMerge.test.tsx:626-650` pins tablist byte-stability + roving tabindex `:433-471`                                      | closed |
| T-46-04-02 | Information Disclosure   | rateLimiter config + 429 counts rendered client-side       | accept      | Already Bearer-gated server-side (`operator-status.ts:395`); client render adds no new exposure                                                                                                                    | closed |
| T-46-04-03 | Information Disclosure   | missedRun / cron schedule rendered from public /api/health | accept      | /api/health already publicly exposes cron freshness; grace non-secret (carries T-46-02-02)                                                                                                                         | closed |
| T-46-04-04 | Tampering                | rendering server strings (tier names, evidence) as TEXT    | mitigate    | No `dangerouslySetInnerHTML` (grep: 0 matches); server strings rendered as React text children (`DevApiStatus.tsx:3796,3899,3905`)                                                                                 | closed |
| T-46-04-05 | Denial of Service        | a null/absent sidecar field crashing the panel             | mitigate    | Both blocks degrade-open to `MutedPlaceholder` on null (`DevApiStatus.tsx:3768-3779,3860-3868`). Tests `tabMerge.test.tsx:520,532,558`                                                                             | closed |
| T-46-05-01 | Tampering                | test-only change to existing green suites                  | mitigate    | `git diff main...HEAD`: only 3 test files touched, zero runtime edits; additive cases (`trendHistory.test.ts:12-18`, `llmCallHistory.test.ts:143`, `llmRunHistory.test.ts:155`)                                    | closed |
| T-46-05-02 | N/A (no runtime surface) | flight-recorder / trend-ring degrade-open contracts        | accept      | Test-only, no new attack surface; mocked-throwing Redis; runtime modules unchanged and already degrade-open                                                                                                        | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                  | Accepted By | Date       |
| -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| AR-46-01 | T-46-01-03 | Limiter config + 429 counts are operator-tier non-secret metadata; stays behind the existing `dashboardAuth` Bearer gate on /api/operator-status (ASVS V4) | Operator    | 2026-06-22 |
| AR-46-02 | T-46-01-04 | Bearer-bypass blast radius is a pre-existing W6 audit decision; D-03 only proves the bypass reaches every tier, it does not widen the radius               | Operator    | 2026-06-22 |
| AR-46-03 | T-46-02-02 | /api/health already exposes cron freshness publicly for the prod audit; schedule grace windows are not secret — no new disclosure                          | Operator    | 2026-06-22 |
| AR-46-04 | T-46-03-03 | Eval scores + DLQ counts already surface via /api/cron/health + the operator dashboard; the WATCH artifact lives in `.planning/` and is not shipped        | Operator    | 2026-06-22 |
| AR-46-05 | T-46-04-02 | rateLimiter data is already Bearer-gated server-side at /api/operator-status; client-side render adds no new exposure                                      | Operator    | 2026-06-22 |
| AR-46-06 | T-46-04-03 | missedRun / schedule rendered from the already-public /api/health (carries T-46-02-02); grace windows not secret                                           | Operator    | 2026-06-22 |
| AR-46-07 | T-46-05-02 | Test-only plan; no runtime surface; mocked-throwing Redis only; runtime modules unchanged                                                                  | Operator    | 2026-06-22 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                      |
| ---------- | ------------- | ------ | ---- | --------------------------- |
| 2026-06-22 | 20            | 20     | 0    | gsd-security-auditor (opus) |

Audit method: register authored at plan time (`register_authored_at_plan_time: true`) → verify-mitigations mode (no new-threat scan). 13 mitigate dispositions verified present in implementation with passing fault-injection / contract tests; 7 accept/N-A dispositions confirmed reasonable. Verification run: server suites 120 tests passed (rateLimit, rateLimitPublic, healthSchema, health, cronWatch, cron-health, trendHistory, llmCallHistory, llmRunHistory, operator-status) + 23 dashboard tests (DevApiStatus.tabMerge, ConsolidatedLayout.snapshot). `healthStatusEnum` confirmed exactly `['healthy','degraded','unhealthy','unknown']` (no `missed`). Implementation files never modified. No `## Threat Flags` in any SUMMARY → no unregistered attack surface flagged during execution.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-22
