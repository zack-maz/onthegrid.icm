---
phase: 46-general-hardening-cron-watch-start
plan: 01
subsystem: rate-limiter-observability
tags: [HARD-01, rate-limiter, 429-counter, operator-status, degrade-open, redis-sidecar]
requires:
  - server/middleware/rateLimit.ts (createRateLimiter, rateLimiters table, Bearer bypass)
  - server/routes/operator-status.ts (Bearer-gated aggregator)
  - server/openapi.yaml (operator-status 200 schema)
provides:
  - 'RATE_LIMITER_CONFIG export (per-tier limit config mirror)'
  - 'incr429(tier) degrade-open 429 sidecar writer'
  - 'rateLimiter block on /api/operator-status (config + recent429)'
  - 'ratelimit:429:{tier}:{YYYY-MM-DD} Redis key (registered in CLAUDE.md)'
affects:
  - src/components/ui/DevApiStatus.tsx (consumes rateLimiter field — wired in 46-04)
  - Phase 47 load test (reads recent429 counts to confirm load-shed)
tech-stack:
  added: []
  patterns:
    - 'INCR + EXPIRE-on-first per-UTC-day counter (replayQuota idiom) — degrade-open delta'
    - 'Per-block degrade-open aggregator read (tokenBudget block VERBATIM)'
    - '4-file operator-status sidecar lockstep (route + test + OpenAPI + CLAUDE.md key)'
key-files:
  created: []
  modified:
    - server/middleware/rateLimit.ts
    - server/middleware/__tests__/rateLimit.test.ts
    - server/routes/operator-status.ts
    - server/routes/__tests__/operator-status.test.ts
    - server/openapi.yaml
    - server/__tests__/rateLimitPublic.test.ts
    - CLAUDE.md
decisions:
  - 'recent429 = today + yesterday UTC-dated counters (RESEARCH Open-Q2 rolling window)'
  - '429 counter fired fire-and-forget via `void incr429(tier)` so a Redis throw can never 429->500'
  - 'EXPIRE-on-first (if used===1) form rather than re-assert-every-call; per-day key self-rolls'
  - 'tierName threaded as 4th createRateLimiter arg, falls back to prefix for ad-hoc limiters'
  - 'No runtime bypass change — D-03 proven by exhaustive per-tier test (no gap found)'
metrics:
  duration_min: 9
  completed: 2026-06-22
  tasks: 3
  files_modified: 7
status: complete
---

# Phase 46 Plan 01: Rate-Limiter Observability (HARD-01) Summary

Made the rate limiter operator-visible and operator-safe without changing any tier limit: a degrade-open per-tier-per-UTC-day 429 sidecar counter, a `rateLimiter` block on the Bearer-gated `/api/operator-status` aggregator (per-tier config + recent 429s), and an exhaustive test proof that a `DASHBOARD_PASSWORD` Bearer bypasses the limiter for the public tier AND every per-endpoint tier.

## What Was Built

### Task 1 — 429 sidecar counter (degrade-open) + RATE_LIMITER_CONFIG export

- Added `incr429(tier)` in `rateLimit.ts`: INCRs `ratelimit:429:{tier}:{YYYY-MM-DD}` (UTC) and, on the first INCR of the day (`used === 1`), sets a 48h TTL (EXPIRE-on-first). The entire body is wrapped in try/catch that swallows and returns void.
- Fired from the 429 branch as `void incr429(tierName ?? prefix)` — fire-and-forget so a Redis throw can never block or convert the 429 into a 500.
- Threaded an optional `tierName` 4th parameter through `createRateLimiter`, populated for every entry in the `rateLimiters` table (`'flights'`, `'ships'`, …, `'public'`); falls back to the closure-captured `prefix` for ad-hoc limiters.
- Exported `RATE_LIMITER_CONFIG: Record<string, { max; windowSec }>` mirroring the tier table byte-for-byte (limits are closure-captured and not introspectable from the returned middleware).
- Bearer bypass (74-93) and all tier limits UNCHANGED.
- Commit: `6ce5714`

### Task 2 — rateLimiter block on /api/operator-status + OpenAPI + CLAUDE.md

- Added `RateLimiterBlock` interface + the `rateLimiter` aggregator block following the `tokenBudget` block VERBATIM (per-block degrade-open try/catch → `null` on throw, route stays 200).
- Block maps `RATE_LIMITER_CONFIG` to `{ tier, max, windowSec }` and reads recent 429 counts = today's + yesterday's `ratelimit:429:{tier}:{date}` sidecars, each coerced `Number(raw) || 0` so a missing key leaves the tier at 0.
- Appended `rateLimiter` to the `res.json` payload.
- OpenAPI: added the nullable `rateLimiter` object (`tiers` array of `{tier,max,windowSec,recent429}`) under the `/api/operator-status` 200 schema — Redocly green.
- CLAUDE.md: registered `ratelimit:429:{tier}:{YYYY-MM-DD}` in the active-key registry (48h TTL, EXPIRE-on-first, writer `rateLimit.ts` degrade-open, reader `operator-status.ts`).
- Commit: `7d4c834`

### Task 3 — 999.1 Bearer-bypass coverage proof

- Extended `rateLimitPublic.test.ts` with a data-driven block proving a valid Bearer reaches `next()` and NEVER invokes `limiter.limit` for ALL 11 tiers (flights/ships/events/news/markets/weather/sites/sources/geocode/water/public).
- Added a sanity pin on the `rateLimiters` tier set and preserved the empty-`DASHBOARD_PASSWORD` fall-through (limiter consulted, NOT a 503).
- Test-only — no runtime bypass change; no gap found (the W6 audit-extension already covers every tier).
- Commit: `497c60b`

## Critical Constraints Satisfied

- **Degrade-open never 429→500:** `incr429` is fully try/caught AND fired fire-and-forget; an explicit fault-injection test (`rateLimit.test.ts` "DEGRADE-OPEN: a rejecting INCR mock STILL yields a 429") asserts a rejecting INCR mock keeps the response a 429 and the middleware promise resolves (never rejects → no 500).
- **4-file sidecar lockstep:** server route + route test + OpenAPI schema + CLAUDE.md key all moved in Task 2's single commit. (Client interface `DevApiStatus.tsx` is the forward-compat consumer wired in 46-04 per the plan.)
- **New Redis key registered** in CLAUDE.md's active-key registry.

## Verification

- `npx vitest run server/middleware/__tests__/rateLimit.test.ts` — 12 passed
- `npx vitest run server/routes/__tests__/operator-status.test.ts` — 29 passed
- `npx vitest run server/__tests__/rateLimitPublic.test.ts` — 18 passed
- `npm run openapi:lint` — valid (37 pre-existing warnings, 0 errors; rateLimiter schema added)
- `npx vitest run server/` — 119 files, 1459 tests passed (no regression)

## Threat Model Coverage

- T-46-01-01 (DoS, 429 INCR on hot error path) — mitigated: fire-and-forget + full try/catch; explicit rejecting-INCR-stays-429 test.
- T-46-01-02 (Redis-write amplification) — mitigated: per-tier per-day key, 1 EXPIRE/day, self-expiring 48h TTL, bounded by the limiter itself.
- T-46-01-05 (key-component tampering) — mitigated: tier name + UTC date both server-derived, no client input.
- T-46-01-03 / T-46-01-04 — accepted dispositions unchanged (operator-tier metadata behind existing Bearer gate; bypass blast radius pre-existing W6 decision).

## Deviations from Plan

None — plan executed exactly as written. No runtime bypass change was needed (Task 3 found no gap); RATE_LIMITER_CONFIG and the operator-status block were added as specified.

## Known Stubs

None.

## Self-Check: PASSED

- server/middleware/rateLimit.ts — FOUND (incr429 + RATE_LIMITER_CONFIG)
- server/routes/operator-status.ts — FOUND (rateLimiter block)
- server/openapi.yaml — FOUND (rateLimiter schema)
- CLAUDE.md — FOUND (ratelimit:429 registry line)
- Commits 6ce5714, 7d4c834, 497c60b — all present in git log
