# Phase 46: General Hardening + Cron Watch Start - Research

**Researched:** 2026-06-22
**Domain:** Brownfield observability hardening — Express middleware, Upstash Redis sidecars, `/api/health` probe ladder, in-app cron freshness, Vitest degrade-open fault-injection
**Confidence:** HIGH (this is reconnaissance of existing in-repo code, not external-library research; every claim below is `[VERIFIED: codebase]` from a file read this session unless tagged otherwise)

## Summary

Phase 46 is a **pure additive observability + test-backfill phase over code that already exists**. Nothing here introduces a new library, a new endpoint, or a new cron. All four requirements extend established in-repo idioms: the `/api/operator-status` aggregator (HARD-01 surface), the per-day Redis `INCR` sidecar with EXPIRE-on-first (HARD-01 429 counter), the `probeCronTick` + `deriveStatus` health ladder (HARD-02), the once-daily `LPUSH`+`LTRIM` ring written by `/api/cron/health` (CRON-WATCH-01), and the mocked-Redis-throw Vitest pattern (HARD-03). The bulk of the planning value is exact-signature reconnaissance plus three sharp landmines.

**The three landmines that dominate the plan's risk:**

1. **`missed` is a NEW health enum value.** `server/lib/healthSchema.ts` `healthStatusEnum` is a 4-member `z.enum([...]).strict()` and the whole `healthResponseSchema` is `.strict()`. Adding `missed` is a wire-contract change that ripples into the Zod schema, `deriveStatus`'s return type, `buildSummary`'s tier rollups, the client `HealthStatus` type, **and** the `prod-connectivity-audit.yml` tier-green gate.
2. **The prod-connectivity-audit `okCron` check will break LLM-RELI-07 if `missed` leaks into the cron tier.** `.github/workflows/prod-connectivity-audit.yml:208` hardcodes `okCron = ["healthy","degraded"].includes(tierStatus.cron)`. A surfaced `missed` cron status makes `allTiersGreen=false`, regressing the milestone-close acceptance gate. The plan MUST decide where `missed` is surfaced (a sibling field vs. the `status` enum) so it never flows into `tierStatus.cron`.
3. **HARD-03 coverage is largely ALREADY GREEN.** `llmCallHistory.test.ts`, `llmRunHistory.test.ts`, `llmTokenBudget.test.ts`, and `BudgetBlock.test.tsx` already assert degrade-open / null-gate behavior including the Redis-throw cases. The real gap is narrower than D-10 implies — research the _actual_ uncovered paths (cold-start hydration throw, `tabMerge` sidecar-absent rendering) rather than re-asserting covered ones.

**Primary recommendation:** Plan HARD-02 around a **sibling `missedRun` boolean/object field on the health response** (forward-compat optional, Phase 32 D-10 pattern) rather than widening `healthStatusEnum`. This satisfies "3-state semantics surfaced via `/api/health`" (D-05) without touching the 4-state `deriveStatus` ladder, the `.strict()` schema enum, or the audit's `okCron` gate. If the operator insists `missed` be a true status enum value, the plan must include a coordinated edit to `prod-connectivity-audit.yml:208` and accept that as a deliberate gate change — flag it as a `checkpoint:human-verify`.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**HARD-01 — Rate-limiter visibility & 429 tracking**

- **D-01:** Surface via the existing `/api/operator-status` aggregator → existing DevApiStatus API Health tab. No new endpoint. New block surfaces per-tier limit config (from `rateLimiters`) + recent 429 counts (D-02).
- **D-02:** 429 counts tracked via a bounded Redis sidecar `INCR` incremented inside the rate-limit middleware at the 429-return point (`server/middleware/rateLimit.ts` ~line 105). Per-tier per-UTC-day `INCR` with short TTL (e.g. `ratelimit:429:{tier}:{YYYY-MM-DD}`, 48h TTL). **Degrade-open — a Redis failure on the counter must NEVER turn a 429 into a 500 or block the response.**
- **D-03:** 999.1 Bearer-bypass coverage is proven by TEST, not by a runtime change. Assert the `DASHBOARD_PASSWORD` Bearer bypass (`timingSafeEqual` path) is reached for every endpoint an operator dashboard poll hits. Extend `rateLimitPublic.test.ts`. No change to bypass logic unless a gap is found.

**HARD-02 — Cron first-tick & missed-run detection**

- **D-04:** Hardcode a 3-entry schedule+grace table in `server/lib/healthSources.ts`, mirroring `FRESHNESS_THRESHOLDS_MS`. Crons: `health 0 0 * * *`, `warm 0 12 * * *`, `refresh-events 0 4 * * *`. Each entry: expected interval (24h) + grace window (planner's discretion, e.g. 2–6h). No `vercel.json` parsing, no external SaaS.
- **D-05:** Three-state semantics surfaced via `/api/health` (999.3): `unknown` (pre-first-tick), `missed` (null OR stale past `expected + grace` AFTER first expected fire), `healthy` (tick within grace).
- **D-06:** Extend the existing `probeCronTick` + `deriveStatus` rather than adding a new probe.

**CRON-WATCH-01 — 7-day non-blocking watch**

- **D-07:** Daily results auto-captured by piggybacking on the EXISTING `/api/cron/health` run (`0 0 * * *`), persisted to a bounded dated Redis ring (Phase 45 D-01 once-daily `LPUSH`+`LTRIM` idiom, e.g. `cron:watch:v2.0` capped 7–14) AND mirrored to a human-readable WATCH artifact in the phase directory. No new cron, no new endpoint, no manual daily step.
- **D-08:** Early-close is a LOGGED, explicit decision — never a silent repeat of v1.5 Phase 31. Watch is NON-BLOCKING: milestone close proceeds regardless of watch status. Default: run the full 7 days, auto-reported. Early-close permitted ONLY by explicit operator decision citing the v1.5 Phase 31 precedent and recording day-count + caveat in the watch artifact.
- **D-09:** Watch starts in this phase but reports asynchronously through later phases. Phase 46 delivers the structure; the 7-day clock runs in the background and does not block Phase 46 close.

**HARD-03 — Nyquist coverage backfill (Phase 39/40 surfaces)**

- **D-10:** Cover three degrade-open surfaces with unit tests, each including a fault-injection case: (1) flight recorder (`llmCallHistory.ts` + `llmRunHistory.ts`), (2) budget block (`llmTokenBudget.ts` + `BudgetBlock.tsx`), (3) subtab consolidation (`tabMerge`/consolidated-layout paths in `DevApiStatus.tsx`).
- **D-11:** Fault-injection style = unit tests with a mocked Redis that throws, asserting the surface degrades open (never throws, returns safe default / renders "collecting…"/empty rather than crashing). Coverage target is behavioral degrade-open paths, not line-count.

### Claude's Discretion

- Exact Redis key names/TTLs for the 429 sidecar (D-02) and the watch ring (D-07) — follow the Phase 32/44/45 sidecar lockstep pattern.
- Precise grace-window durations per cron in the D-04 schedule table.
- Exact dashboard block layout/placement for the rate-limiter and missed-run surfaces within DevApiStatus (must stay inside the existing API Health tab; behavioral tablist contract frozen per Phase 45 D-08).
- The WATCH artifact's exact filename/format (D-07) and how a missed daily capture renders.
- Whether the 429-count sidecar is rolling-window vs per-day, and how many days of history the watch ring retains (within the 7–14 bound).

### Deferred Ideas (OUT OF SCOPE)

- **`npm audit fix`** — 19 pre-existing transitive-dep vulns. NOT inside HARD-01/02/03 scope. Capture only; promote to its own phase or fold explicitly with `--all` if the operator wants it.
- **Phase 45 review Info findings (3, still open)** — `TrendSample` `.strict()` drift-pin, duplicate-label water rejection rows, opaque `999_999_999` magic TTL. Small polish; not part of HARD-01/02/03.
- **Reviewed Todos (not folded)** — CI-health flip (27.4.2), deck.gl v9 drift (27.4.3); off-topic, deferred to their own phases.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID            | Description                                                                                                                                                      | Research Support                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HARD-01       | Rate-limiter state operator-visible + operator-safe: verify Bearer bypass covers all operator dashboard polls (999.1); surface tier config + recent 429 counts   | §"HARD-01: Rate-limiter visibility" — exact `rateLimiters` table source, the 429 branch insertion point (rateLimit.ts:104–110), the `INCR`-EXPIRE-on-first sidecar idiom (replayQuota.ts/pruneQuota.ts), the operator-status aggregator block pattern, and the full operator-poll endpoint list for the D-03 bypass proof |
| HARD-02       | Cron first-tick + missed-run detection via `cron:lastTick:{name}` age vs schedule+grace, surfaced via `/api/health` (999.3); no external SaaS                    | §"HARD-02: Cron missed-run" — `probeCronTick`/`deriveStatus` exact signatures, the schedule+grace table shape mirroring `FRESHNESS_THRESHOLDS_MS`, and the **critical** `.strict()` enum + `okCron` audit-gate landmine forcing a sibling-field design                                                                    |
| CRON-WATCH-01 | 7-day cron stability watch as NON-BLOCKING auto-reported observation; daily auto-captured; does not gate milestone close; avoid v1.5 Phase 31 early-close repeat | §"CRON-WATCH-01" — the exact `appendTrendSample` once-daily ring idiom to copy, the v1.5 Phase 31 `watch-log.json` row shape + SUMMARY early-close framing, and the non-blocking reporting structure                                                                                                                      |
| HARD-03       | Nyquist coverage backfill for Phase 39/40 surfaces incl. degrade-open fault-injection                                                                            | §"HARD-03: Nyquist backfill" — the existing mocked-Redis-throw pattern (`vi.hoisted` + `vi.mock('../../cache/redis.js')`), an audit of what is ALREADY covered vs. the real gap, and the per-surface fault-injection plan                                                                                                 |

</phase_requirements>

## Architectural Responsibility Map

| Capability                        | Primary Tier                                                   | Secondary Tier                                                | Rationale                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 429 counter increment             | API / Backend (Express middleware)                             | Database/Storage (Redis sidecar)                              | The 429 is decided in `rateLimit.ts`; the count is incidental telemetry on an already-error response path — must not add latency or convert 429→500 |
| Rate-limiter config + 429 surface | API / Backend (`/api/operator-status` aggregator)              | Frontend Server / Client (DevApiStatus render)                | Aggregator is the single Bearer-gated read thread; client only renders                                                                              |
| Cron schedule+grace truth-table   | API / Backend (`healthSources.ts` static const)                | —                                                             | Static in-process table is the honest, testable source of truth (D-04); no vercel.json parse                                                        |
| Missed-run derivation             | API / Backend (`probeCronTick`/`deriveStatus` → `/api/health`) | —                                                             | Pure freshness math over `cron:lastTick:{name}` age; surfaced on the existing health response                                                       |
| Daily watch capture               | API / Backend (`cron-health.ts` handler → Redis ring)          | Database/Storage (bounded ring) + Filesystem (WATCH artifact) | Piggybacks the existing 0 0 \* \* \* cron; ring is Redis, artifact is a committed `.md`/`.json` in the phase dir                                    |
| Degrade-open fault-injection      | Test tier (Vitest node + jsdom)                                | —                                                             | Pure unit tests with mocked-throwing Redis; no runtime change                                                                                       |

## Standard Stack

This phase adds **no new packages**. All tooling is already present and pinned.

### Core

| Library              | Version (in repo)                          | Purpose                                                                     | Why Standard                                                                            |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@upstash/redis`     | `^1.37.0` (per operator-status.ts comment) | Redis REST client — `incr`, `expire`, `lpush`, `ltrim`, `pipeline`, `multi` | Serverless-compatible REST; the only Redis client in the repo `[VERIFIED: codebase]`    |
| `@upstash/ratelimit` | (installed; mocked in tests)               | Sliding-window limiter wrapped by `createRateLimiter`                       | Already the limiter backing `rateLimiters` `[VERIFIED: codebase]`                       |
| `express`            | (installed)                                | Route + middleware host                                                     | Existing server framework `[VERIFIED: codebase]`                                        |
| `zod`                | (installed)                                | `.strict()` wire-contract schemas (`healthResponseSchema`, tokenBudget pin) | Phase 27.4 canon: every network-boundary object uses `.strict()` `[VERIFIED: codebase]` |
| `vitest`             | (installed)                                | Test runner (jsdom for `src/`, node for `server/`)                          | Project test framework per CLAUDE.md `[VERIFIED: CLAUDE.md]`                            |

### Supporting (no install — already imported)

| Module                                                                | Purpose                                                                                | When to Use                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/cache/redis.ts` → `redis`, `cacheGetSafe`, `cacheSetSafe`     | Degrade-open cache helpers                                                             | `cacheSetSafe(key, val, ttlSec)` for the watch ring sample; raw `redis.incr`/`redis.expire` for the 429 counter (mirrors `replayQuota.ts`) |
| `server/lib/healthSources.ts`                                         | `FRESHNESS_THRESHOLDS_MS`, `CRON_LASTTICK_TTL_SEC`, `deriveStatus`, `TIER_BY_ENDPOINT` | Home of the new schedule+grace table (D-04)                                                                                                |
| `server/lib/trendHistory.ts` → `appendTrendSample`/`readTrendHistory` | The exact once-daily LPUSH+LTRIM+EXPIRE pipeline ring to copy for CRON-WATCH-01        | Structural template for `cron:watch:v2.0`                                                                                                  |
| `server/lib/replayQuota.ts` / `pruneQuota.ts`                         | INCR-then-EXPIRE-on-first-call idiom (`if (used === 1) await redis.expire(key, TTL)`)  | Exact template for the 429 per-day counter                                                                                                 |

**Installation:** None. `npm install` adds nothing this phase.

## Package Legitimacy Audit

> No external packages are installed in this phase. All modules are first-party (`server/*`, `src/*`) or already-present dependencies. **Package Legitimacy Gate: N/A — zero new installs.**

| Package | Registry | Verdict | Disposition            |
| ------- | -------- | ------- | ---------------------- |
| (none)  | —        | —       | No installs this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
HARD-01 (429 counter + surface)
  client poll ──▶ /api/* ──▶ rateLimiters.public ──▶ per-endpoint limiter
                                    │                        │
                          [Bearer? timingSafeEqual]   limiter.limit(ip)
                                    │ bypass                 │ !success
                                    ▼                        ▼
                                  next()             res.status(429)  ◀── INCR ratelimit:429:{tier}:{date}
                                                                          (fire-and-forget, degrade-open,
                                                                           EXPIRE-on-first; NEVER awaited
                                                                           in a way that can 500/block)

  DevApiStatus (API Health tab) ──poll──▶ GET /api/operator-status (Bearer)
       rateLimiter block ◀── { rateLimiter: { tiers:[...], counts429:{...} } }
                                    ▲
                          aggregator reads rateLimiters table (static)
                          + reads ratelimit:429:* sidecars (degrade-open)

HARD-02 (missed-run)
  GET /api/health ──▶ probeCronTick('health'|'warm'|'refresh-events')
                            │ reads cron:lastTick:{name}
                            ▼
                   freshnessMs ──▶ deriveStatus (4-state, UNCHANGED)
                            │
                            └──▶ NEW: missedRun derivation vs CRON_SCHEDULE_GRACE table
                                 surfaced as a SIBLING field (not the status enum)
                                 → response.endpoints[name].missedRun?  OR  response.cronMissed?

CRON-WATCH-01 (daily capture)
  Vercel cron 0 0 * * * ──▶ /api/cron/health handler
       (after lastTick:health write + appendTrendSample)
            └──▶ NEW: appendWatchSample() → LPUSH+LTRIM+EXPIRE cron:watch:v2.0 (cap 7–14, dated)
                 + (manual/extract step) mirror to WATCH-<phase>.md artifact

HARD-03 (tests only — no runtime path)
  vitest: mocked redis that THROWS ──▶ assert append=no-op / list=[] / render=placeholder
```

### Pattern 1: Per-day Redis counter with EXPIRE-on-first (429 sidecar — D-02)

**What:** `INCR key`; when the return value is `1` (first INCR of the day), set the TTL. Subsequent INCRs do NOT re-issue EXPIRE.
**When to use:** The 429 counter. This is the **verbatim** `replayQuota.ts`/`pruneQuota.ts` idiom.
**Example:**

```typescript
// Source: server/lib/replayQuota.ts:71,93-96 + pruneQuota.ts (verbatim)  [VERIFIED: codebase]
const key = `ratelimit:429:${tier}:${utcDate}`; // YYYY-MM-DD
const used = await redis.incr(key);
if (used === 1) {
  await redis.expire(key, 48 * 3600); // EXPIRE only on first INCR of the day
}
```

**Degrade-open requirement (D-02):** inside `rateLimit.ts` the INCR must be wrapped so a throw is swallowed BEFORE the 429 is sent — or fired-and-not-awaited — so it can never turn the 429 into a 500. `redis.incr`/`redis.expire` are raw (not the safe wrappers), so an explicit `try/catch` is mandatory. Precedent: `urlLiveness.ts:903` ("Wrap raw redis.incr/decr in try/catch — cacheSetSafe shape doesn't fit").

### Pattern 2: Per-block degrade-open aggregator read (HARD-01 surface)

**What:** Each operator-status sub-block reads its sidecar inside its own `try/catch`; on throw it logs `log.warn` and leaves the block `null`/empty; the route still returns 200.
**When to use:** The new `rateLimiter` block in `/api/operator-status`.
**Example:**

```typescript
// Source: server/routes/operator-status.ts:591-627 (tokenBudget block — copy this shape)  [VERIFIED: codebase]
let rateLimiter: RateLimiterBlock | null = null;
try {
  const tiers = Object.entries(rateLimiters).map(/* read static config */);
  const counts429 = await readRateLimit429Counts(); // degrade-open inside
  rateLimiter = { tiers, counts429 };
} catch (err) {
  log.warn({ err }, 'failed to compute rateLimiter block');
  // rateLimiter stays null (degrade-open — mirrors actorQuality/tokenBudget VERBATIM)
}
// ... res.json({ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget, trendHistory, rateLimiter });
```

**Note:** `rateLimiters` (the limit config) is a static module const — to surface per-tier _limits_ you need the numbers passed into `createRateLimiter`. They are NOT currently introspectable from the returned middleware function. **Plan must expose a config table** (e.g. add a sibling `export const RATE_LIMITER_CONFIG: Record<tier,{max,windowSec}>` in `rateLimit.ts`) so the aggregator can read limits without dissecting Upstash internals. This is the same approach `rateLimitPublic.test.ts` uses indirectly (it spies on `slidingWindow` args).

### Pattern 3: Sidecar lockstep contract (the files that move together)

**What:** When a new optional field is added to the `/api/operator-status` response, FOUR artifacts move in one commit:

1. **Server route** — `server/routes/operator-status.ts` (the new block + its shape interface)
2. **Server route test** — `server/routes/__tests__/operator-status.test.ts` (happy path + degrade-open-on-throw test, mirroring the `tokenBudget`/`prune` test blocks)
3. **OpenAPI schema** — `server/openapi.yaml` under `/api/operator-status` `200` response properties (Redocly drift gate enforces this — DOCS-CLEAN-01)
4. **Client interface** — the `OperatorStatus` interface in `src/components/ui/DevApiStatus.tsx:1185` (new field as `field?: T | null` — forward-compat optional, Phase 32 D-10 / Phase 44 D-04)
   **When to use:** HARD-01 rate-limiter block, and any field the missed-run surface adds to operator-status.
   **Citation:** This is the **Phase 32 D-10 forward-compat-optional-field** pattern. Every operator-status field since `prune` (Phase 32) → `actorQuality` (Phase 33) → `tokenBudget` (Phase 39) → `trendHistory` (Phase 45) follows it. The client comment at DevApiStatus.tsx:1178-1184 states it explicitly: "older servers that pre-date Plan 32-04 still type-check + render without it." `[VERIFIED: codebase]`

### Pattern 4: Once-daily bounded ring (CRON-WATCH-01 — D-07)

**What:** `redis.pipeline().lpush(key, JSON).ltrim(key, 0, MAX-1).expire(key, TTL).exec()` — one atomic round-trip; reader `lrange(key, 0, limit-1)` with dual-shape `parseEntry`; degrade-open (both sides try/catch → never throw / return `[]`).
**When to use:** The `cron:watch:v2.0` daily capture ring.
**Example:** `server/lib/trendHistory.ts:82-93` is a **verbatim structural template** (it itself is "a verbatim structural copy of `llmRunHistory.ts`"). Copy `appendTrendSample`/`readTrendHistory` and swap the key/shape. `[VERIFIED: codebase]`
**Phase 45 WR-02 lesson:** use `.pipeline()` for atomic LPUSH+LTRIM+EXPIRE — a kill between `lpush` and `expire` previously left a no-TTL key; between `lpush` and `ltrim` left a transient 31-entry ring. The reader caps at `MAX-1` to keep the bound pinned regardless.

### Anti-Patterns to Avoid

- **Widening `healthStatusEnum` to add `missed`** — see Landmine 1/2. Prefer a sibling field. If you must widen it, you ALSO edit `prod-connectivity-audit.yml:208` `okCron`, the `tierRollupSchema` (4 counters), `buildSummary`, and the client `HealthStatus` type — a much larger blast radius.
- **`await`ing the 429 INCR on the response-blocking path** — adds Redis round-trip latency to every rejected request and risks a throw → 500. Fire-and-forget or wrap-and-swallow.
- **Re-introducing a cron or endpoint** — CLAUDE.md anti-pattern #17 (cron-only writer) + the "no new endpoints/crons since Phase 32" line. Both HARD-01 and CRON-WATCH-01 explicitly ride existing surfaces.
- **`redis.set(key, 0)` for the 429 counter reset** — not needed; per-day keys self-expire. The only sanctioned raw `redis.set(KEY, 0)` in the repo is the `url-liveness-count` DECR-underflow floor (urlLiveness.ts:927).
- **Asserting already-covered degrade-open paths as "new" HARD-03 coverage** — wasted effort; the gap is narrower (see §HARD-03).

## Don't Hand-Roll

| Problem                    | Don't Build                              | Use Instead                                                                                                | Why                                                                                               |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Per-day counter w/ TTL     | A custom INCR + manual TTL-tracking      | `redis.incr` + `if (used===1) expire` (replayQuota idiom)                                                  | Already proven, race-safe enough, EXPIRE-on-first avoids TTL churn                                |
| Bounded daily ring         | Manual array trim + JSON blob in one key | `redis.pipeline().lpush().ltrim().expire()` (trendHistory)                                                 | Atomic, native eviction, dual-shape parse already solved                                          |
| Cron schedule source       | Parsing `vercel.json` at runtime         | Hardcoded `CRON_SCHEDULE_GRACE` const (D-04)                                                               | The 3 crons are known/bounded; static = honest + testable; vercel.json isn't in the server bundle |
| Cron-miss detection        | An external monitor (Healthchecks.io)    | In-app `cron:lastTick` age vs schedule+grace                                                               | Explicitly out-of-scope per REQUIREMENTS.md (third-party dep + secret for a single-operator tool) |
| Mocked-Redis-throw harness | A new shared mock                        | Per-file `vi.hoisted` + `vi.mock('../../cache/redis.js')` returning `vi.fn`s that `mockRejectedValue(...)` | Every existing degrade-open test uses this; `src/test/__mocks__/` is WebGL-only                   |

**Key insight:** This phase is "make the implicit observable + pin the untested." Every mechanism it needs already exists in a sibling file — the planning skill is _which existing file to copy_, not _what to build_.

## Existing-Code Reconnaissance (exact signatures the plan must replicate)

### HARD-01: Rate-limiter visibility

**`server/middleware/rateLimit.ts`** `[VERIFIED: codebase]`

- `createRateLimiter(maxRequests, windowSec, prefix='ratelimit:prod')` returns the `rateLimitHandler` middleware. The limit numbers are **closure-captured, not exposed** on the returned function.
- The Bearer bypass block: **lines 74-93** — `expected = process.env.DASHBOARD_PASSWORD ?? ''`; if non-empty and header `startsWith('Bearer ')`, length-check then `timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` → `next(); return`. Empty `DASHBOARD_PASSWORD` falls through to the limiter (NOT a 503).
- The 429 branch: **lines 104-111** — `if (!result.success) { res.status(429).json({ error:'Too many requests', code:'RATE_LIMITED', statusCode:429 }); return; }`. **This is the D-02 INCR insertion point** (just before or after the `res.status(429)` call, wrapped degrade-open).
- The dev/test skip: **lines 47-51** — `if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) { next(); return; }`. Tests force production via `vi.stubEnv('NODE_ENV','production')`.
- `rateLimiters` table (**lines 126-177**): flights 120/60, ships 60/60, events 20/60, news 20/60, markets 30/60, weather 10/60, sites 10/60, sources 30/60, geocode 10/60, water 10/60, public 60/60 (`'ratelimit:public'` prefix). These are the per-tier limits to surface.

**`server/index.ts`** wiring (**lines ~108-148**) `[VERIFIED: codebase]` — the operator-poll endpoint inventory for the D-03 bypass proof:

- Global pre-filter: `app.use('/api', rateLimiters.public)` runs before all per-endpoint limiters.
- Per-endpoint: `/api/flights` (flights), `/api/ships` (ships), `/api/events` (events), `/api/sources` (sources), `/api/sites` (sites), `/api/news` (news), `/api/markets` (markets), `/api/weather` (weather), `/api/geocode` (geocode), `/api/water` (water).
- **Operator-poll surfaces hit by the dashboard:** `/api/operator-status` (Bearer-gated, mounted via `app.use('/api', ..., operatorStatusRouter)`), `/api/audit-status`, `/api/health` (NOT rate-limited — mounted before the public limiter), plus the data-poll endpoints AppShell fires. The D-03 proof must show that for an operator Bearer, BOTH the public tier AND every per-endpoint tier reach `next()` (bypass), per the rateLimit.ts:53-73 comment ("bypass scoped to public tier AND every per-endpoint tier" after the W6 audit fix).

**`server/routes/operator-status.ts`** `[VERIFIED: codebase]`

- Aggregator: `operatorStatusRouter.get('/operator-status', dashboardAuth, async (_req,res) => {...})`. Bearer-gated. Read-only.
- Response shape: `res.json({ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget, trendHistory })` (**line 648-656**). The new `rateLimiter` block appends here.
- Each block is per-block degrade-open (`try { ... } catch (err) { log.warn(...); /* block stays null */ }`). Copy the **tokenBudget** block (lines 591-627) as the template.
- `log = logger.child({ module: 'operator-status' })`.

**`src/components/ui/DevApiStatus.tsx`** `[VERIFIED: codebase]`

- The `OperatorStatus` interface is at **lines 1185-1247** (all post-`prune` fields are `field?: T | null` forward-compat optional). Add `rateLimiter?: RateLimiterBlock | null` here.
- `fetchOpStatus` (lines 1254-1277): defensive shape gate checks `audit24h`/`byBearer`/`advEval`; new optional fields are NOT gated (correct — they degrade silently if absent). 30s poll.
- The API Health tab is the render target; the behavioral tablist contract (roving tabindex, tab ids, `role="tablist"`) is **frozen** (Phase 45 D-08 / DASH-READ-04). New blocks render inside the existing tab without altering tab structure.

### HARD-02: Cron missed-run

**`server/routes/health.ts`** `[VERIFIED: codebase]`

- `probeCronTick(name)` (**lines 348-383**): reads `cron:lastTick:${name}` via `cacheGetSafe(key, 999_999_999)`; `entry===null` → `{freshnessMs:null, hadError:false}` (→ `unknown`); else `freshnessMs = Date.now() - tickTs` where `tickTs = typeof entry.data === 'number' ? entry.data : entry.lastFresh`; throw → `hadError:true`.
- `ProbeStrategy` union (**lines 386-391**) includes `{ kind:'cron'; cronName:string }`. `PROBE_STRATEGIES` maps `cronHealth/cronWarm/cronRefreshEvents` (lines 431-433).
- The endpoint row is built at **lines 519-529**: `status = deriveStatus(probe.freshnessMs, threshold, probe.hadError)` then `endpoints[name] = { name, status, tier, lastSuccessTs, lastErrorReason, freshnessMs, freshnessThresholdMs, latencyMs }`. **A sibling `missedRun` field would be added to this object** (and to `endpointHealthSchema`).
- Dev-only `healthResponseSchema.parse(response)` at lines 539-545 fails loud on shape drift — so any new field MUST be added to the Zod schema or dev parsing throws.

**`server/lib/healthSources.ts`** `[VERIFIED: codebase]`

- `FRESHNESS_THRESHOLDS_MS` (**lines 83-101**): `cronHealth/cronWarm/cronRefreshEvents` all `26 * 60 * 60_000` (26h). This is the table to MIRROR for the new `CRON_SCHEDULE_GRACE` const.
- `CRON_LASTTICK_TTL_SEC = 7*24*60*60` (line 70).
- `deriveStatus(freshnessMs, thresholdMs, hadError)` (**lines 150-160**): the 4-state ladder — `hadError → unhealthy`; `null → unknown`; `≤threshold → healthy`; `≤2×threshold → degraded`; else `unhealthy`. **D-06 extends ON TOP of this, not replacing it.** A new pure helper `deriveCronRunState(freshnessMs, expectedIntervalMs, graceMs, hasFiredYet)` → `'unknown'|'missed'|'healthy'` is the cleanest addition.
- `TIER_BY_ENDPOINT`: crons are tier `'cron'`.

**The schedule+grace table (D-04) — recommended shape:**

```typescript
// server/lib/healthSources.ts — NEW const mirroring FRESHNESS_THRESHOLDS_MS
export const CRON_SCHEDULE_GRACE_MS: Record<
  string,
  { expectedIntervalMs: number; graceMs: number }
> = {
  health: { expectedIntervalMs: 24 * 60 * 60_000, graceMs: 4 * 60 * 60_000 }, // 0 0 * * *
  warm: { expectedIntervalMs: 24 * 60 * 60_000, graceMs: 4 * 60 * 60_000 }, // 0 12 * * *
  'refresh-events': { expectedIntervalMs: 24 * 60 * 60_000, graceMs: 4 * 60 * 60_000 }, // 0 4 * * *
};
```

Grace 2–6h is Claude's discretion (D-04); 4h sits comfortably under the existing 26h freshness threshold so `missed` fires well before `degraded`/`unhealthy` would. Keep grace < (2×threshold − interval) so the new signal is strictly _earlier_ than the existing degraded window and never contradicts it.

### CRON-WATCH-01

**`server/routes/cron-health.ts`** `[VERIFIED: codebase]`

- Handler `cronHealthRouter.get('/', ...)`. Optional `CRON_SECRET` Bearer gate (timingSafeEqual, lines 39-48). Runs Redis ping → per-source freshness → `runEval()` → `runAdversarialEval()` → `cacheSetSafe('cron:lastTick:health', Date.now(), CRON_LASTTICK_TTL_SEC)` → `appendTrendSample(...)`.
- **The watch capture appends AFTER `appendTrendSample` (lines 173-187)**, in its own try/catch (so a watch-write failure NEVER degrades the health response — mirror the trend/eval try/catch posture). It already computes per-cron `cronAgeMs` for all three crons (lines 146-184) — **reuse that exact computed value** for the watch row.

**`server/lib/trendHistory.ts`** — copy as the structural template (see Pattern 4).

**v1.5 Phase 31 precedent** (`.planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/`) `[VERIFIED: codebase]`:

- `watch-log.json` shape (the artifact to model): `{ schemaVersion, lastSnapshottedTickDate, rows: [{ tickDate, snapshotAt, natural, healthStatus, freshnessMs, dlq:{count,reasons}, eval:{at5km,at20km,at100km}, batchCount, breakerTrips, result:'PASS'|'FAIL', notes }] }`.
- `31-SUMMARY.md` is the **early-close framing to NOT repeat silently**: it closed at Day 1/7 under an explicit operator decision, declared the requirement "validated single-day, monitoring continues opportunistically," and recorded the caveat. D-08 requires this phase's structure make a partial close _visibly partial_ (dated ring + artifact) rather than a prose footnote. The watch artifact should carry an explicit `daysObserved / daysTarget` and an `earlyClose: { decided, citesPhase31, caveat }` block so an early close is structurally evident.

### HARD-03: Nyquist backfill — coverage audit (the real gap)

**Already-covered degrade-open paths** `[VERIFIED: codebase — tests read this session]`:

- `server/lib/__tests__/llmCallHistory.test.ts` — has "degrades open: a thrown redis op makes append a no-op and list returns []" (lpush+lrange `mockRejectedValue`). Also covers lpush/ltrim/expire shape + dual-shape parse + cold-start hydrate.
- `server/lib/__tests__/llmRunHistory.test.ts` — has "degrades open: thrown redis op makes writes no-ops and list returns []", the `running` record open, the dedupe-keeps-terminal-head, AND the never-closed-running survivor (Pitfall 5 "run that died").
- `server/__tests__/lib/llmTokenBudget.test.ts` — covers `budgetState` ok/soft/hard thresholds (TB3-TB7), an `execMock.mockRejectedValue` degrade-open case (line ~120), and the soft-cap helpers (TB11-TB15).
- `src/components/ui/__tests__/BudgetBlock.test.tsx` — covers the `tokenBudget===null` placeholder (degrade-open render), present-block render, cost USD formatting, soft/hard/ok band classes, empty-providers message.

**The ACTUAL gap to target (don't re-assert the above):**

1. **`hydrateCallHistoryIfCold` / `hydrateRunHistoryIfCold` throw-during-hydration** — the hydration helpers call `listCallHistory`/`listRunHistory` which already swallow throws (return `[]`), but there is no explicit test asserting hydration _itself_ is a no-op when Redis throws mid-hydrate AND the flag is still set (so it never retry-loops). Worth a targeted test (D-10 surface 1).
2. **`appendTrendSample` degrade-open** — `trendHistory.ts` is Phase 45 and may lack a dedicated throw test in lockstep; verify and backfill if absent (it shares the ring family with the covered modules).
3. **`tabMerge` / consolidated-layout sidecar-absent rendering** (D-10 surface 3) — `DevApiStatus.tabMerge.test.tsx` covers tab order, Bearer gate, single-poll preservation, and the roving-keyboard/active-indicator regression-lock, but the **degrade-open-when-an-operator-sidecar-field-is-absent** path (e.g. `rateLimiter` undefined, `tokenBudget` null, `trendHistory` absent → block hides, no crash) is the under-tested behavior the D-10/D-11 contract names. Add render tests passing partial `OperatorStatus` payloads.
4. **The NEW HARD-01 `rateLimiter` block** — its operator-status degrade-open test (Redis-throw → `rateLimiter: null`, route 200) is net-new coverage in the same commit as the feature (Pattern 3 lockstep).

**The mocked-Redis-throw pattern to copy** `[VERIFIED: codebase]`:

```typescript
// Source: server/lib/__tests__/llmCallHistory.test.ts:18-32
const { lpushMock, ltrimMock, expireMock, lrangeMock } = vi.hoisted(() => ({
  lpushMock: vi.fn(),
  ltrimMock: vi.fn(),
  expireMock: vi.fn(),
  lrangeMock: vi.fn(),
}));
vi.mock('../../cache/redis.js', () => ({
  redis: {
    lpush: (...a: unknown[]) => lpushMock(...a),
    ltrim: (...a: unknown[]) => ltrimMock(...a),
    expire: (...a: unknown[]) => expireMock(...a),
    lrange: (...a: unknown[]) => lrangeMock(...a),
  },
}));
// throw case:
lpushMock.mockRejectedValue(new Error('redis down'));
await expect(appendCallHistory(makeEntry())).resolves.not.toThrow();
```

For the operator-status route tests, the existing file uses a `mockRedis` object with `.scan`/`.get`/`.hgetall`/`.smembers` mocks and `mockRejectedValue` for the degrade-open assertions (`operator-status.test.ts` lines 243, 543) — extend that for the `rateLimiter` block and any `ratelimit:429:*` reads.

## Common Pitfalls

### Pitfall 1: Adding `missed` as a `healthStatusEnum` value silently regresses LLM-RELI-07

**What goes wrong:** `prod-connectivity-audit.yml:208` computes `okCron = ["healthy","degraded"].includes(tierStatus.cron)`. If `missed` becomes a real status that can appear on a cron-tier endpoint, `tierStatus.cron` can be `"missed"` → `okCron=false` → `allTiersGreen=false` → the milestone-close acceptance gate (LLM-RELI-07: 3 consecutive `allTiersGreen=true`) fails.
**Why it happens:** The audit derives `tierStatus[tier]` from the per-endpoint `status` enum and hardcodes the accepted set per tier (lines 172-175, 206-214).
**How to avoid:** Surface `missed` as a **SIBLING field** (`endpoints[name].missedRun?: boolean` or a top-level `cronMissed?` map), NOT as the `status` enum value. `status` stays in the 4-state ladder; `missedRun` is the new observability signal. The audit never reads the sibling field. If the operator demands a true enum value, the plan MUST co-edit `okCron` and accept it as a deliberate gate change (`checkpoint:human-verify`).
**Warning signs:** Any plan task that edits `healthStatusEnum`, `tierRollupSchema`, or `deriveStatus`'s return type.

### Pitfall 2: `.strict()` schema rejects the new field → dev throws / Redocly drift gate fails

**What goes wrong:** `healthResponseSchema` and `endpointHealthSchema` are `.strict()` (reject unknown keys). Adding `missedRun` to the response object without adding it to the Zod schema makes `healthResponseSchema.parse(response)` throw in dev (health.ts:540). Separately, `operator-status.ts`'s new `rateLimiter` field must be added to `openapi.yaml` or the Redocly drift gate (DOCS-CLEAN-01) fails.
**Why it happens:** Phase 27.4 canon: every network-boundary object is `.strict()`.
**How to avoid:** Schema-first. Add the optional field to `endpointHealthSchema`/`healthResponseSchema` (and `openapi.yaml`) in the SAME task as the route change (Pattern 3 lockstep). Make health-response additions `.optional()` so old clients / partial responses still parse.
**Warning signs:** A route-edit task with no paired schema-edit task.

### Pitfall 3: The 429 INCR throws and converts a 429 into a 500

**What goes wrong:** `redis.incr` is a raw call (not `cacheSetSafe`). If it throws on the response path and isn't caught, the middleware rejects the promise → Express error handler → 500. D-02 forbids exactly this.
**Why it happens:** The 429 branch currently has no Redis I/O; adding an unguarded `await redis.incr(...)` introduces a throw site on the hot error path.
**How to avoid:** Wrap the INCR in `try/catch` that swallows (precedent: `urlLiveness.ts:903`), OR fire-and-forget (`void incr429(tier)` where `incr429` is itself fully try/caught and returns void). Send the 429 response regardless of counter outcome. Add an explicit test: `incr` rejects → response is still `429` with the canonical envelope.
**Warning signs:** `await redis.incr` placed before `res.status(429)` without a surrounding try/catch.

### Pitfall 4: CRON-WATCH-01 watch write degrades the `/api/cron/health` response

**What goes wrong:** An unguarded `appendWatchSample` throw inside the cron handler propagates and fails the health-cron response (which also writes `cron:lastTick:health`, feeds the eval drift check, and the trend ring).
**How to avoid:** Wrap the watch append in its own try/catch, mirroring the existing trend-sample append (cron-health.ts:146-187) which logs `'trend sample append threw — continuing health response'` and continues. The watch ring is degrade-open by the same `appendTrendSample` contract.
**Warning signs:** Watch append outside a try/catch, or before the `cron:lastTick:health` write (it must come after, so the lastTick write isn't blocked).

### Pitfall 5: Treating HARD-03 as "write tests for everything" instead of the named gap

**What goes wrong:** Re-asserting the already-green degrade-open cases (call/run history throw, budget null-gate) burns effort and adds no coverage. D-11 says "coverage target is the behavioral degrade-open paths, not line-count."
**How to avoid:** Target the gap audited in §HARD-03 (hydration-throw no-op, tabMerge sidecar-absent render, trendHistory throw if absent, the new rateLimiter-block throw). Run `npx vitest run` for the named files first to confirm what's already green before writing.

## Runtime State Inventory

> This is an additive observability phase, not a rename/refactor. No stored data, OS-registered state, or build artifacts change identity. Included for completeness per the verification protocol.

| Category            | Items Found                                                                                                                                                                                           | Action Required                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | NEW Redis keys only: `ratelimit:429:{tier}:{YYYY-MM-DD}` (48h TTL, self-expiring) and the watch ring (e.g. `cron:watch:v2.0`, bounded LPUSH+LTRIM, ~30d TTL). No existing key is renamed or migrated. | Register both new keys in CLAUDE.md Redis registry + `docs/architecture/redis-keys.md` (DOCS-CLEAN-01, Phase 49) — but ADD them to CLAUDE.md in-phase per the registry convention. |
| Live service config | None — no vercel.json crons change (3 entries locked), no new cron, no env var added (D-04/D-09 "no new env-tunable surfaces").                                                                       | None.                                                                                                                                                                              |
| OS-registered state | None.                                                                                                                                                                                                 | None — verified by the no-new-cron / no-vercel.json-change constraint.                                                                                                             |
| Secrets/env vars    | None added. Reads existing `DASHBOARD_PASSWORD` (bypass), `CRON_SECRET` (cron-health gate) — neither renamed.                                                                                         | None.                                                                                                                                                                              |
| Build artifacts     | None — no package rename, no new bundled file. The WATCH artifact is a committed doc in the phase dir, not a build output.                                                                            | None.                                                                                                                                                                              |

**Nothing found in 4 of 5 categories** — verified by the additive-only, no-new-cron/endpoint/env constraints in CONTEXT.md.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest (jsdom for `src/`, node for `server/`)                                                                                             |
| Config file        | `vite.config.ts` (test.alias mocks maplibre/deck.gl for jsdom)                                                                            |
| Quick run command  | `npx vitest run server/middleware/rateLimit.test.ts server/__tests__/rateLimitPublic.test.ts server/lib/__tests__/llmCallHistory.test.ts` |
| Full suite command | `npx vitest run` (all) / `npx vitest run server/` (server only)                                                                           |

### Phase Requirements → Test Map

| Req ID        | Behavior                                                                                | Test Type      | Automated Command                                                                                       | File Exists?                            |
| ------------- | --------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| HARD-01       | 429 INCR fires `ratelimit:429:{tier}:{date}` with EXPIRE-on-first                       | unit           | `npx vitest run server/middleware/__tests__/rateLimit.test.ts`                                          | ✅ extend                               |
| HARD-01       | 429 INCR throw does NOT convert 429→500 (degrade-open)                                  | unit           | `npx vitest run server/middleware/__tests__/rateLimit.test.ts`                                          | ✅ extend                               |
| HARD-01       | Bearer bypass reaches `next()` for public AND every per-endpoint tier (999.1 proof)     | unit           | `npx vitest run server/__tests__/rateLimitPublic.test.ts`                                               | ✅ extend                               |
| HARD-01       | `/api/operator-status` `rateLimiter` block present; null on Redis throw (200 preserved) | route unit     | `npx vitest run server/routes/__tests__/operator-status.test.ts`                                        | ✅ extend                               |
| HARD-01       | OpenAPI `rateLimiter` schema present (Redocly drift gate)                               | contract       | `npm run <redocly/lint script>`                                                                         | ✅ openapi.yaml                         |
| HARD-02       | `CRON_SCHEDULE_GRACE_MS` table + `deriveCronRunState` → unknown/missed/healthy          | unit           | `npx vitest run server/__tests__/lib/healthSources*.test.ts`                                            | ❌ Wave 0 (new test)                    |
| HARD-02       | `/api/health` carries `missedRun` sibling; `healthResponseSchema` parses it             | route unit     | `npx vitest run server/__tests__/routes/health*.test.ts`                                                | ❌ Wave 0 (verify/extend)               |
| HARD-02       | `missed` does NOT appear in `tierStatus.cron` / `status` enum (audit-gate safety)       | unit/assertion | `npx vitest run server/__tests__/...health...`                                                          | ❌ Wave 0                               |
| CRON-WATCH-01 | `appendWatchSample` LPUSH+LTRIM+EXPIRE; reader dual-shape; degrade-open `[]`            | unit           | `npx vitest run server/lib/__tests__/cronWatch*.test.ts`                                                | ❌ Wave 0 (new, copy trendHistory.test) |
| CRON-WATCH-01 | cron-health watch append in its own try/catch (failure ≠ degrade health response)       | route unit     | `npx vitest run server/__tests__/routes/cron-health*.test.ts`                                           | ❌ Wave 0 (verify/extend)               |
| HARD-03       | hydrate\*IfCold no-op on Redis throw, flag stays set (no retry-loop)                    | unit           | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts server/lib/__tests__/llmRunHistory.test.ts` | ✅ extend                               |
| HARD-03       | trendHistory append degrade-open on throw                                               | unit           | `npx vitest run server/lib/__tests__/trendHistory*.test.ts`                                             | ❌ verify exists; backfill if absent    |
| HARD-03       | DevApiStatus tabMerge renders with sidecar fields absent/null (no crash)                | jsdom          | `npx vitest run src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx`                             | ✅ extend                               |
| HARD-03       | BudgetBlock null-gate render                                                            | jsdom          | `npx vitest run src/components/ui/__tests__/BudgetBlock.test.tsx`                                       | ✅ already green (don't re-assert)      |

### Sampling Rate

- **Per task commit:** the named file's `npx vitest run <file>` (sub-30s).
- **Per wave merge:** `npx vitest run server/` (server changes) + `npx vitest run src/components/ui/` (dashboard changes).
- **Phase gate:** full `npx vitest run` green + the Redocly/redis-registry/check:env drift gates green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `server/__tests__/lib/healthSources.cronGrace.test.ts` — `CRON_SCHEDULE_GRACE_MS` + `deriveCronRunState` (HARD-02)
- [ ] `server/lib/__tests__/cronWatch.test.ts` — watch ring append/read/degrade-open (CRON-WATCH-01; copy `trendHistory.test` if it exists, else `llmRunHistory.test`)
- [ ] Verify `server/lib/__tests__/trendHistory.test.ts` exists with a throw case; backfill if absent (HARD-03 surface)
- [ ] Verify a `health.ts` route test exists that pins the response shape (the dev `.parse` already guards, but a committed test prevents enum drift) — extend for `missedRun`
- [ ] No framework install needed — Vitest is present.

## Security Domain

> `security_enforcement` is ABSENT in `.planning/config.json` → treated as ENABLED. This phase touches a rate limiter (a security control) and Bearer-gated routes, so the section is load-bearing.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                                                       |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | `DASHBOARD_PASSWORD` Bearer via `timingSafeEqual` (rateLimit.ts bypass, dashboardAuth, cron-health CRON_SECRET) — **constant-time compare already in place; D-03 proves coverage, does not weaken it**                                                                 |
| V3 Session Management | no      | No sessions; stateless Bearer                                                                                                                                                                                                                                          |
| V4 Access Control     | yes     | `/api/operator-status` stays Bearer-gated; the new `rateLimiter` block exposes limit config + 429 counts — operator-tier metadata, non-secret, but keep it behind the existing `dashboardAuth` gate (do not move it to an un-gated route)                              |
| V5 Input Validation   | yes     | No new user input. Redis tier/date key components are server-derived (tier name from `rateLimiters`, date from `new Date()`), not client-controlled — no injection surface. The 429 surface renders `evidence`-style strings as TEXT not HTML (carry the T-43-16 rule) |
| V6 Cryptography       | no      | No new crypto; reuses existing `timingSafeEqual`. Never hand-roll.                                                                                                                                                                                                     |

### Known Threat Patterns for this stack

| Pattern                                                               | STRIDE          | Standard Mitigation                                                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator Bearer drains a per-route budget (bypass blast radius)       | Elevation/DoS   | Accepted in rateLimit.ts:53-73 (W6 audit decision) — operator scripts + the audit are the only Bearer holders. D-03 only PROVES the bypass reaches every tier; it does not widen the blast radius.    |
| 429 counter as a Redis-write amplification / DoS vector               | DoS             | Per-day key (1 EXPIRE per tier per day), bounded by the limiter itself (you can only INCR when you're already being 429'd). Degrade-open so a Redis flap can't be leveraged into 500s.                |
| `missed` cron status leaks privileged schedule info via `/api/health` | Info disclosure | `/api/health` already exposes cron freshness + tier status publicly (it is intentionally un-gated for the audit). Schedule grace windows are not secret. No new disclosure beyond existing freshness. |
| Watch artifact / ring exposing internal eval scores                   | Info disclosure | Eval scores + DLQ counts already surface via `/api/cron/health` and the operator dashboard; the watch ring is the same data. Keep the WATCH artifact in `.planning/` (not shipped).                   |

**No new attack surface is introduced** — every new read is behind an existing gate or on an already-public freshness endpoint; every new write is a bounded, self-expiring, degrade-open Redis key.

## State of the Art

| Old Approach                                                         | Current Approach                                                       | When Changed      | Impact                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| External cron monitor (Healthchecks.io)                              | In-app `cron:lastTick` age vs static schedule+grace                    | This phase (D-04) | No third-party dep/secret/egress for a single-operator tool                            |
| Per-block override TTL / pipeline-pin surfaces                       | Operator-status aggregator with forward-compat optional fields         | Phase 29→45       | Every new operator signal rides one Bearer-gated read; old clients tolerate new fields |
| Manual daily watch snapshot (v1.5 Phase 31 `npm run watch:snapshot`) | Auto-capture piggybacked on `/api/cron/health` + dated ring + artifact | This phase (D-07) | No manual daily step; partial close is structurally visible, not a prose footnote      |

**Deprecated/outdated:**

- v1.5 Phase 31's manual snapshot harness (`scripts/snapshot-cron-watch.ts`) — still operational but superseded for this watch by the auto-capture ring. Do NOT re-wire it; D-07 explicitly auto-captures.

## Assumptions Log

| #   | Claim                                                                                                                                                  | Section                | Risk if Wrong                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | A sibling `missedRun` field (not a `healthStatusEnum` value) is the operator's preferred way to satisfy D-05 "surfaced via /api/health"                | HARD-02 / Pitfall 1    | If operator wants a true enum value, plan must also edit `okCron` in prod-connectivity-audit.yml — flag as checkpoint:human-verify. `[ASSUMED]` from the LLM-RELI-07 risk; D-05's wording ("three-state semantics surfaced via /api/health") does not mandate the status enum. |
| A2  | Grace window of 4h per cron is acceptable (within the 2–6h D-04 discretion band)                                                                       | HARD-02 schedule table | Too-tight grace → false `missed` on legitimate Vercel cron skew; too-loose → slow detection. 4h is a starting recommendation, operator-tunable in planning. `[ASSUMED]`                                                                                                        |
| A3  | `redis.incr` + `redis.expire` are available on the prefixed `redis` instance (used in replayQuota.ts/urlLiveness.ts)                                   | HARD-01 429 counter    | If the wrapped instance lacks a method the plan must use `cacheSetSafe`-style alternative. Mitigated: `[VERIFIED: codebase]` — `redis.incr` used at replayQuota.ts:71, `redis.expire` at operatorAudit.ts:96 / llmDLQ.ts:64. Low risk.                                         |
| A4  | The `rateLimiter` block reading per-tier limits requires a NEW exported config const in rateLimit.ts (limits are closure-captured, not introspectable) | HARD-01 surface        | If a simpler introspection path exists it's a minor refactor. `[VERIFIED: codebase]` — `createRateLimiter` does not attach `.max`/`.windowSec` to the returned function.                                                                                                       |

**All other claims are `[VERIFIED: codebase]` from files read this session.**

## Open Questions

1. **Sibling field vs. status enum for `missed` (HARD-02).**
   - What we know: D-05 says "three-state semantics, surfaced via /api/health." The 4-state `deriveStatus` ladder, the `.strict()` enum, and the audit `okCron` gate all assume 4 states.
   - What's unclear: whether the operator reads "three-state" as literally a `status` value or as an observability signal.
   - Recommendation: implement as a sibling `missedRun` field (no enum/gate change). Surface "missed" as a derived display state in DevApiStatus while keeping the wire `status` 4-state. Confirm in discuss-phase / first plan.

2. **429 sidecar rolling-window vs per-day, and watch-ring retention (Claude's discretion D-02/D-07).**
   - What we know: per-day INCR (replayQuota idiom) is simplest and matches existing keys; 48h TTL gives a 24h lookback.
   - Recommendation: per-day `ratelimit:429:{tier}:{YYYY-MM-DD}` 48h TTL; the aggregator reads today + yesterday for a "recent 429s" rolling view. Watch ring: cap 14 entries (covers the 7-day watch + buffer), 30d TTL (matches trendHistory family).

3. **Does `appendTrendSample` already have a dedicated degrade-open throw test?**
   - What we know: trendHistory.ts is degrade-open by construction (try/catch → swallow / `[]`).
   - Recommendation: grep `server/lib/__tests__/trendHistory.test.ts`; if no throw case, backfill one in HARD-03 (it's the same ring family).

## Environment Availability

> Phase is code/config + tests only; the sole external dependency is Upstash Redis, which is mocked in all unit tests and already provisioned in prod.

| Dependency           | Required By                                         | Available                        | Version                  | Fallback                                                      |
| -------------------- | --------------------------------------------------- | -------------------------------- | ------------------------ | ------------------------------------------------------------- |
| Upstash Redis (prod) | 429 counter writes, watch ring, cron:lastTick reads | ✓ (prod Marketplace integration) | `@upstash/redis ^1.37.0` | Degrade-open by design — every new read/write swallows throws |
| Vitest               | All HARD-03 + new tests                             | ✓                                | installed                | —                                                             |
| Node                 | server runtime                                      | ✓                                | `>=20` (package.json)    | —                                                             |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — Redis is mocked in tests and degrade-open in runtime.

## Sources

### Primary (HIGH confidence — read this session)

- `server/middleware/rateLimit.ts` — createRateLimiter, rateLimiters table, Bearer bypass (74-93), 429 branch (104-111)
- `server/routes/operator-status.ts` — aggregator shape, per-block degrade-open template (tokenBudget 591-627)
- `server/routes/health.ts` — probeCronTick (348-383), ProbeStrategy, deriveStatus usage, endpoint-row build (519-529), dev `.parse` (539-545)
- `server/lib/healthSources.ts` — FRESHNESS_THRESHOLDS_MS, CRON_LASTTICK_TTL_SEC, deriveStatus 4-state ladder, TIER_BY_ENDPOINT
- `server/lib/healthSchema.ts` — `.strict()` healthStatusEnum (4 states), healthResponseSchema, tierRollupSchema
- `server/routes/cron-health.ts` — handler flow, lastTick write, appendTrendSample append point (146-187)
- `server/lib/trendHistory.ts` — once-daily LPUSH+LTRIM+EXPIRE pipeline ring (Pattern 4 template)
- `server/lib/llmCallHistory.ts` / `llmRunHistory.ts` / `llmTokenBudget.ts` — degrade-open contracts under test
- `server/lib/replayQuota.ts` / `pruneQuota.ts` — INCR-then-EXPIRE-on-first idiom
- `server/index.ts` (108-148) — limiter wiring + operator-poll endpoint inventory
- `server/openapi.yaml` (606-735) — operator-status response schema (Redocly drift gate)
- `src/components/ui/DevApiStatus.tsx` (1185-1287) — OperatorStatus interface, fetchOpStatus, forward-compat pattern
- `server/__tests__/rateLimitPublic.test.ts`, `server/routes/__tests__/operator-status.test.ts`, `server/lib/__tests__/llmCallHistory.test.ts` / `llmRunHistory.test.ts`, `src/components/ui/__tests__/BudgetBlock.test.tsx` / `DevApiStatus.tabMerge.test.tsx` — existing test patterns + coverage audit
- `.github/workflows/prod-connectivity-audit.yml` (136-230) — tierStatus derivation + `okCron` gate (LLM-RELI-07 landmine)
- `.planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md` + `watch-log.json` — early-close precedent + artifact shape

### Secondary (MEDIUM confidence)

- CLAUDE.md Redis-key registry + anti-pattern #17 (cron-only writer) + cron-schedule section

### Tertiary (LOW confidence)

- None — this phase required no external/web research; all findings are in-repo.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all modules verified in-repo.
- Architecture / existing-code reconnaissance: HIGH — every signature read from source this session.
- Pitfalls (esp. the `okCron`/`.strict()` landmines): HIGH — verified against the exact audit workflow + schema files.
- HARD-03 coverage gap audit: HIGH — read the existing test files and confirmed what's already green.
- HARD-02 sibling-field recommendation: MEDIUM — sound given the LLM-RELI-07 risk, but A1 needs operator confirmation on whether `missed` should be a true status enum value.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (30 days — stable; in-repo code, no fast-moving external deps). Re-verify only if Phase 47 lands the edge-cache headers or `prod-connectivity-audit.yml` `okCron` logic changes before this phase executes.
