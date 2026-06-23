---
phase: 46-general-hardening-cron-watch-start
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - server/middleware/rateLimit.ts
  - server/lib/cronWatch.ts
  - server/lib/healthSchema.ts
  - server/lib/healthSources.ts
  - server/routes/cron-health.ts
  - server/routes/health.ts
  - server/routes/operator-status.ts
  - server/openapi.yaml
  - src/components/ui/DevApiStatus.tsx
  - server/middleware/__tests__/rateLimit.test.ts
  - server/__tests__/rateLimitPublic.test.ts
  - server/lib/__tests__/cronWatch.test.ts
  - server/__tests__/lib/healthSources.test.ts
  - server/__tests__/lib/healthSchema.test.ts
  - server/__tests__/routes/health.test.ts
  - server/__tests__/routes/cron-health.test.ts
  - server/routes/__tests__/operator-status.test.ts
  - server/lib/__tests__/llmCallHistory.test.ts
  - server/lib/__tests__/llmRunHistory.test.ts
  - server/lib/__tests__/trendHistory.test.ts
  - src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 46: Code Review Report

**Reviewed:** 2026-06-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 46 is a hardening/observability phase adding (a) a degrade-open per-tier 429
counter sidecar, (b) a three-state cron run-state (`missedRun`) surfaced as a
SIBLING field, (c) a bounded `cron:watch:v2` daily watch ring, and (d) two
read-only DevApiStatus telemetry blocks. The work is careful and well-tested.

All five phase-specific correctness invariants HOLD and are confirmed by tests:

1. **429 INCR degrade-open** — `incr429` (`rateLimit.ts:53-70`) wraps its entire
   body in `try/catch` returning void, and is invoked `void incr429(...)`
   (fire-and-forget) from the 429 branch (`:154`). A rejecting INCR mock still
   yields a 429, never a 500 (`rateLimit.test.ts:353-373`). Verified.
2. **`missed` is a sibling, never the wire `status` enum** — `healthStatusEnum`
   stays the 4 original members (regression-pinned `healthSchema.test.ts:143-151`);
   `missedRun` is a `.optional()` sibling on cron rows only (`healthSchema.ts:83`);
   `buildSummary` (`health.ts:463-498`) only buckets the 4-state `status`, never
   `missedRun`; Test 14 (`health.test.ts:399-428`) proves a 29h-stale tick yields
   `missedRun:'missed'` while `status` stays `degraded` (okCron gate safe).
3. **Watch-ring write degrade-open** — `appendWatchSample` (`cronWatch.ts:99-110`)
   never throws, AND the cron-health caller wraps it in its own `try/catch`
   (`cron-health.ts:213-230`). A throwing append does not degrade the health
   response (`cron-health.test.ts:176-186`). Verified.
4. **DevApiStatus blocks degrade-open + frozen tablist** — both new blocks render
   INSIDE the API-Health `role="tabpanel"` within a `CollapsibleGroup`
   (`DevApiStatus.tsx:2362-2370`), never touching the tablist; both render a
   `MutedPlaceholder` on null input (`:3768-3780`, `:3860-3869`). Verified.
5. **Bearer-bypass correctness** — length precheck precedes `timingSafeEqual`
   (`rateLimit.ts:125-128`); the 7-test matrix covers dev short-circuit, no-Bearer,
   valid Bearer, wrong-length, wrong-bytes, empty-password, and per-endpoint-tier
   bypass (`rateLimit.test.ts:104-273`). Verified.

The date/window math for the 429 rolling window (today + yesterday UTC) is correct
and tested (`operator-status.test.ts:1211-1235`); EXPIRE-on-first is correct and
tested (`rateLimit.test.ts:338-351`); `deriveCronRunState` boundary math is
exhaustively tested (`healthSources.test.ts:199-232`). No floating-promise issues —
every fire-and-forget is explicitly `void`-prefixed.

Remaining findings are quality/maintainability issues only. No blockers.

## Warnings

### WR-01: `incr429` ad-hoc fallback key collides on the `prefix` namespace

**File:** `server/middleware/rateLimit.ts:154`
**Issue:** When a limiter is created without an explicit `tierName` (the documented
ad-hoc case, e.g. `createRateLimiter(120, 60)` used in `rateLimit.test.ts:262`), the
429 counter falls back to the closure `prefix`: `void incr429(tierName ?? prefix)`.
For the default prefix this produces the key `ratelimit:429:ratelimit:prod:{date}`
— a doubled namespace segment. This is benign today because the operator-status
aggregator only reads tiers from `RATE_LIMITER_CONFIG` (clean names), so the
malformed key is never read and self-expires in 48h. But it is a latent footgun: a
future limiter wired into production without a `tierName` would silently emit
uncountable 429s (invisible to the dashboard) rather than failing loudly.
**Fix:** Make `tierName` required, or assert it at limiter-construction time:

```ts
export function createRateLimiter(
  maxRequests: number,
  windowSec: number,
  prefix: string = 'ratelimit:prod',
  tierName?: string,
) {
  // Fail loud rather than emit an uncountable `ratelimit:429:ratelimit:prod:*` key.
  if (process.env.NODE_ENV === 'production' && !tierName) {
    log.warn({ prefix }, 'createRateLimiter without tierName — 429 counter key will be malformed');
  }
  ...
}
```

### WR-02: `/api/health` aggregate response shape is undocumented in openapi.yaml; `missedRun` not in the contract

**File:** `server/openapi.yaml:519-532, 1914-1939`
**Issue:** The `/health` (and `/api/health`) endpoint is documented against the
`HealthReport` schema, which describes a stale shape (`status`/`uptime`/
`estimatedDailyCommands`) that does NOT match the actual aggregate response
(`endpoints`/`summary`/`generatedAt` per `healthSchema.ts:115-132`). Consequently
the Phase-46 `missedRun` sibling field has no OpenAPI documentation. The
`rateLimiter` block WAS added to the operator-status spec (`:745-782`), so the
omission is asymmetric — a consumer reading the spec would not learn that cron rows
carry `missedRun`. This is partly pre-existing drift (the aggregate shape predates
Phase 46), but Phase 46 added a new field to an already-undocumented surface and
left the gap.
**Fix:** Either (a) update `HealthReport` to reflect the real `HealthResponse`
shape and add `missedRun` to the per-endpoint entry, or (b) explicitly note in the
phase docs that the aggregate `/api/health` shape is contract-pinned by
`healthResponseSchema` (Zod) rather than OpenAPI, so reviewers don't expect parity.
The Zod `.strict()` schema + `healthSchema.test.ts` is the real contract today; the
OpenAPI drift should at least be acknowledged.

### WR-03: `recent429` window double-counts on UTC-midnight boundary churn (off-by-window, not off-by-one)

**File:** `server/routes/operator-status.ts:683-702`
**Issue:** The rolling "recent 429s" window is `today(UTC) + yesterday(UTC)`. This
is correct per RESEARCH Open-Q2, but the window WIDTH is variable: immediately after
UTC midnight it represents only seconds-into-today plus all of yesterday (~24h+ε),
while just before midnight it represents ~48h. The 48h TTL on the counter
(`rateLimit.ts:51`) means yesterday's key is guaranteed alive for the full
two-day read window, so no data is lost — but the surfaced "· 24h" caption in the
UI (`DevApiStatus.tsx:3798`) is misleading: the value is a 24-48h sliding sum, not a
24h count. Operators reading "recent 429s · 24h" will under-interpret a value that
includes up to a full extra day. Not a data-integrity bug; a labeling/semantics
defect.
**Fix:** Either relabel the caption to `· ~24-48h` / `· 2d window`, or narrow the
read to today-only (accepting the post-midnight blind spot the two-day window was
designed to avoid). The cleanest honest label:

```tsx
<span className="text-[8px] tabular-nums text-white/40">recent 429s · 2d</span>
```

## Info

### IN-01: `now` variable shadowed inside the rateLimiter block

**File:** `server/routes/operator-status.ts:398, 683`
**Issue:** `const now = Date.now()` (number, `:398`, used for the 24h audit window)
is shadowed by `const now = new Date()` (Date object, `:683`) inside the
rateLimiter block. Both are scoped correctly so there is no runtime bug, but the
same identifier holding two different types in one function harms readability and
invites a future edit to grab the wrong `now`.
**Fix:** Rename the inner one, e.g. `const nowDate = new Date();` and derive the
YMDs from `nowDate`.

### IN-02: Redundant `PROBE_STRATEGIES[name]` re-lookup in the cron branch

**File:** `server/routes/health.ts:505, 541`
**Issue:** Inside the endpoints-assembly loop, `strategy` is already bound at
`:505` (`const strategy = PROBE_STRATEGIES[name]!`), but the cron-row branch
re-fetches it: `const strategy = PROBE_STRATEGIES[name]` (`:541`, shadowing the
outer binding inside the `if (tier === 'cron')` block). The re-lookup is harmless
but the shadowing of `strategy` within the same loop body is a minor smell.
**Fix:** Reuse the outer `strategy` and narrow it directly:

```ts
const cronName = strategy.kind === 'cron' ? strategy.cronName : undefined;
```

(The outer `strategy` is non-null via the `!` assertion at `:505`.)

### IN-03: `missedRun` silently omitted on cron rows lacking a grace-table entry

**File:** `server/routes/health.ts:540-552`
**Issue:** The `missedRun` field is only set when `grace !== undefined`
(`:544`). A cron-tier endpoint whose `cronName` is missing from
`CRON_SCHEDULE_GRACE_MS` would produce a cron row with NO `missedRun` and no log.
Today the three cron names are fully covered (test `healthSources.test.ts:172-176`),
so this never fires — but a future cron added to `TIER_BY_ENDPOINT`/`PROBE_STRATEGIES`
without a matching grace entry would silently lose its run-state signal.
**Fix:** Add a `log.warn` in the `grace === undefined` path, mirroring the
defensive log at `:518` for missing tier/threshold mappings.

### IN-04: `cronWatch.ts` registry note claims CLAUDE.md registration not yet present

**File:** `server/lib/cronWatch.ts:25-27`
**Issue:** The module header states `cron:watch:v2` is "Registered in CLAUDE.md",
but the active Redis-key registry in CLAUDE.md does not list `cron:watch:v2`
(it lists `dashboard:trends:history` and the `llm:*:history` family). Minor
doc-vs-code drift in a self-describing comment; the key itself works correctly.
**Fix:** Add the `cron:watch:v2` entry to the CLAUDE.md "Active Redis keys"
registry, or soften the comment to "to be registered in CLAUDE.md (Phase 49
registry sweep)" as the sibling `trendHistory.ts:19` comment does.

---

_Reviewed: 2026-06-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
