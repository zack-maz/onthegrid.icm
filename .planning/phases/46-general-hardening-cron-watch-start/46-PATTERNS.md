# Phase 46: General Hardening + Cron Watch Start - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 14 (4 created, 10 modified)
**Analogs found:** 14 / 14 (every new/modified file has a verbatim sibling in-repo)

> **This phase is "copy the sibling, not invent."** Every mechanism already exists in a sibling file. The excerpts below are the EXACT code the planner/executor must replicate. All line numbers verified against source this session.

---

## File Classification

| New/Modified File                                                                                                                | Role                                 | Data Flow                      | Closest Analog                                                          | Match Quality                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------ |
| `server/lib/rateLimit429Counter.ts` _(new — or inline in rateLimit.ts)_                                                          | utility (Redis sidecar writer)       | event-driven (per-429 INCR)    | `server/lib/replayQuota.ts:62-93`                                       | exact (INCR + EXPIRE-on-first idiom) |
| `server/middleware/rateLimit.ts` _(modified)_                                                                                    | middleware                           | request-response               | self (429 branch :104-111) + `replayQuota.ts`                           | exact                                |
| `server/routes/operator-status.ts` _(modified — `rateLimiter` block)_                                                            | route (aggregator)                   | request-response               | self `tokenBudget` block :591-627                                       | exact                                |
| `server/lib/healthSources.ts` _(modified — `CRON_SCHEDULE_GRACE_MS` + `deriveCronRunState`)_                                     | utility (static table + pure helper) | transform                      | self `FRESHNESS_THRESHOLDS_MS` :83-101 + `deriveStatus` :150-160        | exact                                |
| `server/routes/health.ts` _(modified — `missedRun` sibling field)_                                                               | route                                | request-response               | self endpoint-row build :519-529 + `probeCronTick` :348-383             | exact                                |
| `server/lib/healthSchema.ts` _(modified — `.optional()` `missedRun`)_                                                            | model (Zod schema)                   | transform                      | self `endpointHealthSchema` :45-62                                      | exact                                |
| `server/lib/cronWatch.ts` _(new — watch ring)_                                                                                   | utility (Redis ring)                 | batch (once-daily LPUSH+LTRIM) | `server/lib/trendHistory.ts:82-108`                                     | exact (verbatim structural copy)     |
| `server/routes/cron-health.ts` _(modified — `appendWatchSample` call)_                                                           | route (cron handler)                 | event-driven (daily)           | self `appendTrendSample` append :146-187                                | exact                                |
| `src/components/ui/DevApiStatus.tsx` _(modified — 2 blocks + interface)_                                                         | component                            | request-response (poll)        | self `BudgetBlock` render :2035 + `OperatorStatus` interface :1185-1247 | exact                                |
| `server/openapi.yaml` _(modified — `rateLimiter` schema)_                                                                        | config (contract)                    | —                              | existing operator-status `200` props :606-735                           | exact                                |
| `server/middleware/__tests__/rateLimit.test.ts` _(modified)_                                                                     | test                                 | —                              | self + `llmCallHistory.test.ts:17-32` mock idiom                        | exact                                |
| `server/__tests__/rateLimitPublic.test.ts` _(modified — 999.1 proof)_                                                            | test                                 | —                              | self                                                                    | exact                                |
| `server/routes/__tests__/operator-status.test.ts` _(modified — `rateLimiter` block)_                                             | test                                 | —                              | self `tokenBudget`/`prune` degrade-open blocks                          | exact                                |
| `server/lib/__tests__/cronWatch.test.ts` + `healthSources.cronGrace.test.ts` _(new)_ + `trendHistory.test.ts` _(new — backfill)_ | test                                 | —                              | `llmCallHistory.test.ts:17-32` mocked-Redis-throw harness               | exact                                |

---

## Shared Patterns

### Pattern A — INCR + EXPIRE-on-first per-day counter (HARD-01 429 sidecar)

**Source:** `server/lib/replayQuota.ts:62-93` (verbatim idiom; `pruneQuota.ts` identical)
**Apply to:** the 429 counter `ratelimit:429:{tier}:{YYYY-MM-DD}` (48h TTL)

```typescript
// server/lib/replayQuota.ts:65-77
const { redis } = await import('../cache/redis.js');
const now = new Date();
const ymd = now.toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
const key = `${QUOTA_KEY_PREFIX}${fingerprint}:${ymd}`;
const used = await redis.incr(key);
// WR-04: re-assert TTL every call — idempotent, self-heals a window whose
// first EXPIRE never landed (Redis flap leaving a no-TTL permanent key).
await redis.expire(key, QUOTA_TTL_SEC);
```

**CRITICAL degrade-open delta (D-02 / Pitfall 3):** `replayQuota` is on the response-blocking path and is allowed to throw. The 429 counter must NOT — it sits on the hot error path inside `rateLimit.ts`. Wrap the INCR in `try/catch` that swallows (precedent `urlLiveness.ts:903` "wrap raw redis.incr/decr in try/catch") OR fire-and-forget `void incr429(tier)`. The 429 response (`rateLimit.ts:104-111`) must send regardless of counter outcome. Note: `replayQuota` re-asserts EXPIRE every call; for the 429 counter the lighter `if (used === 1) await redis.expire(...)` is the canonical "EXPIRE-on-first" form named in RESEARCH Pattern 1 — either is acceptable, both self-heal.

### Pattern B — Per-block degrade-open aggregator read (HARD-01 surface)

**Source:** `server/routes/operator-status.ts:591-627` (the `tokenBudget` block) + `:640-646` (the `trendHistory` block)
**Apply to:** the new `rateLimiter` block

```typescript
// server/routes/operator-status.ts:640-646 (trendHistory — closest shape)
let trendHistory: TrendSample[] | null = null;
try {
  trendHistory = await readTrendHistory();
} catch (err) {
  log.warn({ err }, 'failed to read trendHistory ring');
  // trendHistory stays null (degrade-open).
}
// ...
res.json({ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget, trendHistory });
// → add `rateLimiter` to BOTH the try/catch-null block AND this res.json (:648-656)
```

**Config-exposure note (A4 / Pattern 2):** `rateLimiters` limits are closure-captured in `createRateLimiter`, NOT introspectable from the returned middleware. Add a sibling `export const RATE_LIMITER_CONFIG: Record<string, {max:number; windowSec:number}>` in `rateLimit.ts` (mirrors the `rateLimiters` table at :126-177) so the aggregator can read per-tier `max`/`window` without dissecting Upstash internals.

### Pattern C — Sidecar lockstep (4 files move in 1 commit)

**Source:** every operator-status field since `prune` (Phase 32 D-10). The client comment at `DevApiStatus.tsx:1178-1184` states it explicitly.
**Apply to:** the `rateLimiter` field — and analogously the `missedRun` health field.

1. **Server route** — `operator-status.ts` (block + res.json) / for health: `health.ts:519-529` endpoint row
2. **Server route test** — `operator-status.test.ts` (happy + degrade-open-on-throw → `null`, route 200)
3. **OpenAPI / Zod schema** — `openapi.yaml` :606-735 (Redocly drift gate) / for health: `healthSchema.ts` `endpointHealthSchema` `.optional()`
4. **Client interface** — `DevApiStatus.tsx:1185-1247` (`field?: T | null` forward-compat optional; `tokenBudget?:` :1239, `trendHistory?:` :1246 are the exact precedent lines)

### Pattern D — Once-daily bounded ring (CRON-WATCH-01)

**Source:** `server/lib/trendHistory.ts:82-108` (itself a "verbatim structural copy of llmRunHistory.ts")
**Apply to:** `cronWatch.ts` `appendWatchSample`/`readWatchHistory` for key `cron:watch:v2.0` (cap 14, ~30d TTL)

```typescript
// server/lib/trendHistory.ts:82-93 (appendTrendSample — copy, swap key/shape)
export async function appendTrendSample(sample: TrendSample): Promise<void> {
  try {
    await redis
      .pipeline()
      .lpush(TREND_HISTORY_KEY, JSON.stringify(sample)) // newest at head
      .ltrim(TREND_HISTORY_KEY, 0, TREND_MAX - 1) // atomic bounded ring
      .expire(TREND_HISTORY_KEY, TREND_TTL_SEC)
      .exec();
  } catch (err) {
    log.warn({ err }, 'trendHistory append failed'); // never throw
  }
}
// reader trendHistory.ts:101-108 — lrange 0..limit-1, parseEntry dual-shape, []-on-throw
```

**Phase 45 WR-02 lesson:** use `.pipeline()` so LPUSH+LTRIM+EXPIRE are one atomic round-trip; reader caps at `MAX-1` to pin the bound. `parseEntry` (`trendHistory.ts:61-69`) handles both raw-string and already-object Upstash REST shapes.

### Pattern E — Mocked-Redis-throw harness (HARD-03 fault injection)

**Source:** `server/lib/__tests__/llmCallHistory.test.ts:17-32`
**Apply to:** all new degrade-open tests (cronWatch, trendHistory backfill, hydration-throw, rateLimiter block)

```typescript
// server/lib/__tests__/llmCallHistory.test.ts:17-31
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
// throw case: lpushMock.mockRejectedValue(new Error('redis down'));
//   → await expect(appendX(...)).resolves.not.toThrow();
```

For route tests, `operator-status.test.ts` uses a `mockRedis` object with `.scan/.get/.hgetall/.smembers` + `mockRejectedValue` (lines ~243, ~543) — extend for `rateLimiter` block reads.

---

## Pattern Assignments

### `server/middleware/rateLimit.ts` (middleware, request-response) — HARD-01

**Analog:** self + `replayQuota.ts` (Pattern A)

- **429 branch insertion point** (`:104-111`):

```typescript
if (!result.success) {
  res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED', statusCode: 429 });
  return;
}
```

The INCR fires here, wrapped degrade-open (Pattern A delta). Do NOT `await` it on the blocking path in a way that can throw → 500.

- **Bearer bypass** (`:75-93`) — UNCHANGED. `timingSafeEqual` constant-time path; D-03 only PROVES coverage. Empty `DASHBOARD_PASSWORD` falls through (not 503).
- **New export** `RATE_LIMITER_CONFIG` mirroring the `rateLimiters` table (`:126-177`).

### `server/lib/healthSources.ts` (utility) — HARD-02

**Analog:** self `FRESHNESS_THRESHOLDS_MS` (`:83-101`) + `deriveStatus` (`:150-160`)

- New const `CRON_SCHEDULE_GRACE_MS` mirroring the table shape (3 entries `health`/`warm`/`refresh-events`, each `{expectedIntervalMs: 24h, graceMs: ~4h}`). Keep `graceMs < (2×threshold − interval)` so `missed` fires strictly EARLIER than the existing `degraded` window.
- New PURE helper `deriveCronRunState(freshnessMs, expectedIntervalMs, graceMs, hasFiredYet) → 'unknown'|'missed'|'healthy'`, layered ON TOP of `deriveStatus` (D-06 — does NOT replace the 4-state ladder).

### `server/routes/health.ts` (route) — HARD-02

**Analog:** self `probeCronTick` (`:348-383`) + endpoint-row build (`:519-529`)

- `probeCronTick` (`:348-383`) already reads `cron:lastTick:${name}`, computes `freshnessMs`, handles `entry===null → unknown` and throw `→ hadError`. REUSE its `freshnessMs`.
- Add `missedRun` as a SIBLING field on the endpoint row object (`:519-529`), derived via `deriveCronRunState`. **NEVER widen `status`.**

### `server/lib/healthSchema.ts` (model) — HARD-02

**Analog:** self `endpointHealthSchema` (`:45-62`, `.strict()`)

```typescript
// healthSchema.ts:25 — UNCHANGED (4-state, do not widen)
export const healthStatusEnum = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);
```

Add `missedRun: <boolean|object>.optional()` to `endpointHealthSchema` IN THE SAME TASK as the `health.ts` route change (Pitfall 2 — `.strict()` rejects unknown keys; dev `.parse` at `health.ts:539-545` throws on drift). Add the matching field to the client `EndpointHealth`/`HealthStatus` type.

### `server/routes/cron-health.ts` (route) — CRON-WATCH-01

**Analog:** self `appendTrendSample` append (`:146-187`)

- The handler already writes `cacheSetSafe('cron:lastTick:health', ...)` at `:133`, then computes per-cron `cronAgeMs` (`:141-173`) in its own try/catch, then `appendTrendSample(...)` at `:173`.
- Append `appendWatchSample(...)` AFTER `appendTrendSample`, in its OWN try/catch (Pitfall 4 — a watch-write throw must NEVER degrade the health-cron response). REUSE the already-computed per-cron `cronAgeMs` for the watch row.

### `src/components/ui/DevApiStatus.tsx` (component) — HARD-01 + HARD-02 surface

**Analog:** `BudgetBlock` render (`:2035`) + `OperatorStatus` interface (`:1185-1247`)

- Interface: append `rateLimiter?: RateLimiterBlock | null` at `:1185-1247` (alongside `tokenBudget?:` :1239 / `trendHistory?:` :1246). Forward-compat optional — NOT gated in `fetchOpStatus` (:1254-1277).
- Render: two new local `function XBlock(...)` components inside the existing API Health `role="tabpanel"` (`:968`), composed from the Phase-45 atoms `MetricRow.tsx` + `Sparkline.tsx`. See `46-UI-SPEC.md` for the visual contract (tablist DOM FROZEN, MISSED → `--color-status-degraded` badge).

---

## No Analog Found

None. Every file maps to a verbatim or near-verbatim in-repo sibling.

**One backfill (analog exists, test file does not yet):**

| File                                        | Role | Reason                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/__tests__/trendHistory.test.ts` | test | `trendHistory.ts` (Phase 45) ships WITHOUT a dedicated degrade-open throw test (RESEARCH Open Q3 confirmed: file MISSING this session). HARD-03 backfills it using the Pattern E harness — the module itself is fully degrade-open by construction. |

---

## Key Landmines (carried from RESEARCH — bind to the pattern, not just the code)

1. **`missed` must be a SIBLING field, never a `healthStatusEnum` value.** `healthStatusEnum` (`healthSchema.ts:25`) is a 4-member `.strict()` enum. `prod-connectivity-audit.yml:208` hardcodes `okCron = ["healthy","degraded"].includes(tierStatus.cron)`. A `missed` status on the cron tier → `allTiersGreen=false` → regresses the LLM-RELI-07 milestone-close gate. Surface `missedRun` as a sibling; the audit never reads it.
2. **`.strict()` schemas reject unknown keys.** Add `missedRun` (health) and `rateLimiter` (openapi) to their schemas IN THE SAME TASK as the route edit, or dev `.parse` throws / Redocly drift gate fails (Pattern C lockstep).
3. **429 INCR must not convert 429→500.** Raw `redis.incr` is unguarded by `cacheSetSafe`. Wrap-and-swallow or fire-and-forget (Pattern A delta, Pitfall 3).
4. **HARD-03 is mostly ALREADY GREEN.** `llmCallHistory/llmRunHistory/llmTokenBudget/BudgetBlock` degrade-open tests exist. Target the NARROW gap: hydration-throw no-op (flag stays set, no retry-loop), `tabMerge` sidecar-absent render, `trendHistory` throw backfill, the new `rateLimiter` block throw. Do NOT re-assert covered paths.

---

## Metadata

**Analog search scope:** `server/lib/`, `server/routes/`, `server/middleware/`, `src/components/ui/`, `server/**/__tests__/`, `.github/workflows/`
**Files scanned/verified this session:** 21 (all RESEARCH-named analogs confirmed present except `trendHistory.test.ts` — a known Wave-0 gap)
**Pattern extraction date:** 2026-06-22
