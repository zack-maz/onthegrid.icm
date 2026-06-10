---
phase: 43-ghost-link-prune-correctness
plan: 01
subsystem: ghost-event-url-liveness
tags: [url-liveness, zod-contract, schema-widening, redis-registry, tdd]
requires:
  - server/lib/urlLiveness.ts (Phase 32 5-status schema + ProbeResult + TTL map + isTerminalDead)
provides:
  - UrlLivenessStatusSchema 7-status enum (+soft-404 +no-url)
  - UrlLivenessSchema.evidence required-but-nullable field
  - UrlLivenessSchema.lastUrlProbed nullable
  - TTL_SEC_BY_STATUS soft-404/no-url 24h tiers
  - isTerminalDead(soft-404)=true (NOT no-url)
  - ProbeResult.evidence string|null
affects:
  - Plan 43-02 (soft-404 body heuristic — classifySoft404 + 16 KiB GET)
  - Plan 43-03 (persistLiveness D-10 attemptCount + no-url write + evidence wiring)
  - Plan 43-04 (cron-only 403 prune demotion + operator-status soft-404 widening)
  - Phase 44 (downstream readers of soft-404/no-url status + evidence)
tech-stack:
  added: []
  patterns:
    - '.strict() Zod schema + Record<UrlLivenessStatus, number> exhaustive TTL map as compile-time + vitest drift gate'
    - 'writer-only Zod parse (readers use TS-generic cacheGetSafe casts) — old entries migrate by TTL turnover, no migration code (T-43-01 accept)'
    - 'contract-lockstep: schema + server test + src shim + redis-keys.md + CLAUDE.md in one logical change'
key-files:
  created: []
  modified:
    - server/lib/urlLiveness.ts
    - server/__tests__/lib/urlLiveness.schema.test.ts
    - src/__tests__/lib/urlLiveness.schema.test.ts
    - server/__tests__/lib/urlLiveness.sweep.test.ts
    - docs/architecture/redis-keys.md
    - CLAUDE.md
decisions:
  - 'D-04/D-06: 7-status taxonomy — soft-404 + no-url added to the Phase 32 5-status enum'
  - 'D-07: lastUrlProbed → nullable (null for no-url entries)'
  - 'D-08: isTerminalDead(soft-404)=true, isTerminalDead(no-url)=false — 403 unchanged here (cron-only demotion is Plan 04 prune-filter-local)'
  - 'D-09: soft-404 + no-url both 24h TTL tiers'
  - 'D-10: attemptCount JSDoc amended — live resets to 0, unknown PRESERVES prior count, dead→dead increments (full wiring in Plan 03)'
  - 'D-16: evidence required-but-nullable (z.string().max(200).nullable()); status-only verdicts use http-404/http-403/dead-host: fetch failed literals; live/unknown null'
  - 'D-18: redis-keys.md + CLAUDE.md registry lines updated in lockstep with the schema'
metrics:
  duration_min: 6
  completed: 2026-06-10
  tasks: 3
  files: 6
---

# Phase 43 Plan 01: UrlLiveness 7-Status Contract Foundation Summary

Widened the Phase 32 `UrlLiveness` Zod contract to a 7-status taxonomy (`+soft-404 +no-url`), added a required-but-nullable `evidence` provenance field, made `lastUrlProbed` nullable, added two 24h TTL tiers, and flagged `soft-404` as terminal-dead — landing all four contract-lockstep surfaces (server schema test, src shim, redis-keys.md, CLAUDE.md) so the `.strict()` drift gate stays green and Plans 02/03/04 compile against a stable foundation.

## What Was Built

- **Task 1 (`feat`, `ded4728`)** — `server/lib/urlLiveness.ts`:
  - `UrlLivenessStatusSchema` extended to 7 members (`live`, `404`, `403`, `dead-host`, `unknown`, `soft-404`, `no-url`).
  - `UrlLivenessSchema`: `lastUrlProbed` → `z.string().url().nullable()`; new `evidence: z.string().max(200).nullable()` required field.
  - `TTL_SEC_BY_STATUS`: `soft-404` and `no-url` both `24 * 3600` (the exhaustive `Record<UrlLivenessStatus, number>` would not compile without them).
  - `isTerminalDead`: now returns true for `soft-404`; `no-url` deliberately excluded; `403` left unchanged.
  - `ProbeResult.evidence: string | null` added; every `probeUrl` return now sets it (status-only verdicts use the D-16 literals, `live`/`unknown` use `null`).
  - JSDoc (attemptCount block + writer block) amended for the D-10 `unknown`-PRESERVES rule.
  - Verify: `npx tsc --noEmit` exit 0.

- **Task 2 (`test`, `1ca4afe`)** — schema test + shim lockstep:
  - `validEntry()` gains `evidence: null` (else `.strict()` rejects every fixture).
  - Enum loop extended to all 7 statuses; positive cases for `no-url` (null `lastUrlProbed`) and string `evidence`; negative cases for missing-evidence and >200-char evidence.
  - `soft-404`/`no-url` 24h TTL pins in both the upper-bound and exact-ceiling blocks.
  - src shim mirrors the evidence literal + new TTL bounds.
  - Verify: both suites green (26 tests).

- **Task 3 (`docs`, `386b9d7`)** — registry lockstep (D-18):
  - `docs/architecture/redis-keys.md` and `CLAUDE.md` `events:url-liveness:{eventId}` lines now document the 7-status taxonomy, nullable `lastUrlProbed`, `evidence` field, `soft-404`/`no-url` 24h tiers, and the D-10 attemptCount semantics (replacing the old `monotonic-with-reset-on-live-or-unknown` wording).
  - `src/__tests__/lib/redis-registry.test.ts` left unchanged (RESEARCH A6 — pins key NAME only); drift gate green (41 tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `evidence` to sweep-test `ProbeResult` fixtures**

- **Found during:** Post-Task-3 full-suite verification.
- **Issue:** Making `evidence` a required schema field (Task 1) caused `persistLiveness`'s internal `UrlLivenessSchema.parse(next)` to throw on the 7 `__test__.persistLiveness` calls in `server/__tests__/lib/urlLiveness.sweep.test.ts`, whose inline `ProbeResult` literals predate the field. 7 tests failed.
- **Fix:** Added `evidence` to each of the 7 `ProbeResult` literals — D-16 status literals (`http-404`, `dead-host: fetch failed`) for dead verdicts, `null` for `live`/`unknown`. This is a direct consequence of the Task 1 evidence-required change, not new Plan 03 work (the attemptCount-semantics test flips remain for Plan 03).
- **Files modified:** `server/__tests__/lib/urlLiveness.sweep.test.ts`
- **Commit:** `3906943`

## Verification

- `npx tsc --noEmit` — exit 0 (Record map + ProbeResult union widenings compile).
- `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/urlLiveness.schema.test.ts` — 26 passed.
- `npx vitest run src/__tests__/lib/redis-registry.test.ts` — 41 passed (drift gate, no change).
- `npx vitest run server/__tests__/lib/urlLiveness` — 70 passed (all 4 urlLiveness suites including sweep + cronPrune).
- `npx vitest run server/__tests__/routes` — 191 passed (no route regression from the read-side cast).
- `grep "soft-404"` matches in `urlLiveness.ts` (9), both schema tests (6/2), `redis-keys.md` (1), and `CLAUDE.md` (1).

## Known Stubs

None. The `evidence` field is wired into `ProbeResult` and `persistLiveness` end-to-end at the foundation level; the `soft-404` body heuristic that populates non-null `evidence` is Plan 02 scope (documented in the field's JSDoc), and the full D-10 attemptCount + `no-url` write path is Plan 03 scope. These are intentional forward-references, not stubs that block this plan's goal (the schema half of GHOST-10).

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema-at-trust-boundary surfaces introduced beyond the planned writer-only schema widening (T-43-01 accepted in the plan's threat register; zero packages installed, T-43-SC n/a).

## Self-Check: PASSED

All 6 modified files exist on disk; all 4 task commits (`ded4728`, `1ca4afe`, `386b9d7`, `3906943`) present in git history.
