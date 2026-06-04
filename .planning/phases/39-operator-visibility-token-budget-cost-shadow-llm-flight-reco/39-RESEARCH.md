# Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder — Research

**Researched:** 2026-06-04
**Domain:** Observability / dashboard surfacing of existing LLM-pipeline telemetry (Redis-backed in-memory state, Bearer-gated read aggregator, brownfield React operator console)
**Confidence:** HIGH (all claims grounded in this codebase via grep/Read; no external library introduced)

## Summary

Phase 39 is a pure **observability surfacing** phase over an already-built v3 LLM enrichment pipeline. No new AI system, model selection, prompt design, or eval rubric — the eval harness, token-budget primitives, cost-shadow accrual, and call-history all already exist. The work is three strands: (1) **BUDGET** — render existing `llm:tokens:{provider}:YYYY-MM-DD` + `events:llm-cost-shadow:v3:{date}` data in a new `BudgetBlock` inside `DevApiStatus.tsx`, fed by a new degrade-open `tokenBudget` field on `/api/operator-status`; (2) **OBS-FLIGHT** — Redis-back the in-memory `callHistory` (currently capped at 20, lost on cold start), add per-run summary records threaded with a `runId`, expose a new Bearer-gated `GET /api/events/llm-history`, and render a `FlightRecorderBlock` run-list → call → prompt drill-down.

Every integration anchor was verified against current source. **One CONTEXT claim is inaccurate and corrected below:** the `runId` injection point is NOT `withBatchWatchdog` (that is a pure timing primitive with only `batchIndex`, no generation counter — verified `server/lib/llmExtractorWatchdog.ts:68-117`). The actual run boundary is `runRefreshExtraction`'s `safeWaitUntil` IIFE (`server/lib/llmExtractionPipeline.ts:306-308`), where `resetProgress()` already marks run start. `runId` should be generated there and stamped onto `llmProgress` so every `callHistory` append (written in `freeClaudeRouter.ts`) inherits it.

**Primary recommendation:** Generate `runId` in `runRefreshExtraction` right after `resetProgress()`, store it on the `llmProgress` singleton, and have the two `callHistory` writers in `freeClaudeRouter.ts` (success ~:447 region, failure :519-535) copy it plus `batchIndex` onto each entry — then dual-write each entry to the Redis list `llm:calls:history` (LPUSH+LTRIM 500/30d) using the existing `llmDLQ.ts` bounded-list + `parseEntry` idiom. Open the `llm:runs:history` record at run start (`outcome:'running'`) and re-LPUSH the terminal record at each run-exit branch (GA-2). Mirror the `actorQuality` degrade-open block verbatim for `tokenBudget`. Defer the 90d sparkline and rich filters to Phase 40 (GA-1, GA-3).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Operator delegated all four gray areas (GA-1..GA-4) to research/planning. Do NOT re-ask. Each gray area below has a concrete recommendation grounded in the codebase.
- **D-02:** Redis shapes are pinned. `llm:calls:history` — LPUSH + LTRIM 500-entry cap, 30d TTL; entry = current `callHistory` fields + `runId` + `batchIndex`. `llm:runs:history` — LPUSH + LTRIM 200-run cap, 30d TTL; entry shape enumerated in OBS-FLIGHT-02. Both MUST register in CLAUDE.md §"Active Redis keys" + `docs/architecture/redis-keys.md` (Phase 35 drift gate `src/__tests__/lib/redis-registry.test.ts` enforces parity).
- **D-03:** All new reads are **Bearer-gated** via `dashboardAuth` (NOT `NODE_ENV`). `/api/events/llm-history` returns `{runs, calls}` with optional `?runId=X` / `?limit=N`.
- **D-04:** **v3-only / NIM single-provider.** Use `tokenSpend: { nvidia_nim: N }` and `pipelineVersion: 'v3'`. No cerebras/groq, no v1/v2.
- **D-05:** Cold-start hydration mirrors the Phase 28.2.7 `llm:lastProgress` write-through — hydrate in-memory state from Redis `LRANGE` on first `/llm-status` or `/llm-history` request after cold start.

### Claude's Discretion — delegated gray areas (resolved below in "Gray Area Resolutions")

- GA-1 — Phase 39 ↔ Phase 40 UI scope boundary
- GA-2 — Crashed/aborted run-record durability
- GA-3 — Cost-shadow trend depth (90d sparkline)
- GA-4 — `tokenBudget` operator-status contract shape

### Deferred Ideas (OUT OF SCOPE)

- Cross-run analytics / aggregations (eval-score trends, token-spend sparklines beyond a basic surface), alerting on run outcomes — future analytics phase.
- Rich FlightRecorder filters + tab/subtab placement + visual polish — Phase 40.
- Reviewed-not-folded todos: `phase-27.4.2-ci-health`, `phase-27.4.3-deckgl-v9-type-drift` (unrelated tech debt, keyword-match only).

## Phase Requirements

| ID            | Description                                                                                                                                                           | Research Support                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUDGET-01     | `BudgetBlock` in DevApiStatus surfacing per-provider used-vs-cap with soft 0.8 / hard 0.95 proximity bars; single-provider, extensibility-shaped                      | `llmTokenBudget.ts` `DAILY_LIMITS`, `getDailyTokens`, `budgetState` already compute the classification — no new math. GA-4 map shape carries `{used, cap, soft, hard, state}` per provider.                 |
| BUDGET-02     | Cost-shadow surface from `events:llm-cost-shadow:v3:{date}` HSET (`tokensIn`/`tokensOut`/`usdMicrocents`); today's USD via microcents→USD; trend across 90d window    | `accrueShadowCost` (`freeClaudeRouter.ts:646-668`) is the writer; read HGETALL of today's key. GA-3: ship today only; defer/thin 90d sparkline. Conversion: `usd = usdMicrocents / 1_000_000`.              |
| BUDGET-03     | New `/api/operator-status` `tokenBudget` field (Bearer-gated, degrade-open on Redis fail) mirroring `actorQuality`                                                    | Mirror `operator-status.ts:419-484` try/catch → `null` → route stays 200. Add `tokenBudget` to the `res.json({...})` at :486.                                                                               |
| BUDGET-04     | Contract test pins `tokenBudget` shape (Zod `.strict()`)                                                                                                              | Extend `server/routes/__tests__/operator-status.test.ts` (path drifted from CONTEXT's claim). Existing tests assert shape via TS interface + `expect`; add a Zod `.strict()` schema test for `tokenBudget`. |
| OBS-FLIGHT-01 | Redis-backed call history `llm:calls:history` (LPUSH+LTRIM 500/30d); entry = `callHistory` fields + `runId` + `batchIndex`; hydrate on first request after cold start | Dual-write at the two `callHistory` writers in `freeClaudeRouter.ts`. Read/parse via `llmDLQ.ts parseEntry` idiom (Upstash REST may auto-deserialize).                                                      |
| OBS-FLIGHT-02 | Per-run summary `llm:runs:history` (LPUSH+LTRIM 200/30d); enumerated entry shape                                                                                      | New writer keyed to `runRefreshExtraction` run boundary. Shape mapped to v3/NIM (see "Run Summary Shape" below).                                                                                            |
| OBS-FLIGHT-03 | `GET /api/events/llm-history` Bearer-gated; `{runs, calls}` + `?runId=X` / `?limit=N`                                                                                 | New route on `eventsRouter` with `dashboardAuth`, mirroring `/llm-status` registration (`events.ts:384`).                                                                                                   |
| OBS-FLIGHT-04 | FlightRecorderBlock — run list → drill-down (per-call timing, provenance, DLQ, watchdog)                                                                              | UI-SPEC §B is the contract. GA-1: functional baseline (run-list + inline expand + minimal prompt read); rich filters → Phase 40.                                                                            |
| OBS-FLIGHT-05 | Run-ID threading — every call in a `runRefreshExtraction` tags its `callHistory` entry with `runId`                                                                   | **CORRECTION:** injection point is `runRefreshExtraction` (`llmExtractionPipeline.ts:308`), NOT `withBatchWatchdog`. Stamp `runId` onto `llmProgress`; writers copy it.                                     |
| OBS-FLIGHT-06 | Cold-start hydration — populate in-memory state from `llm:calls:history` + `llm:runs:history` LRANGE on first `/llm-status` or `/llm-history` after cold start        | Mirror Phase 28.2.7 `llm:lastProgress` write-through. Hydration hook = top of `/llm-status` (`events.ts:384`) and `/llm-history` handlers, guarded by an in-memory `hydrated` flag.                         |

## Architectural Responsibility Map

| Capability                                | Primary Tier                                         | Secondary Tier                                                           | Rationale                                                                          |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Token-budget computation (used/cap/state) | API/Backend (`llmTokenBudget.ts`)                    | —                                                                        | Budget math already lives server-side; client only renders.                        |
| Cost-shadow USD accrual                   | API/Backend (`freeClaudeRouter.ts accrueShadowCost`) | Database/Redis (`events:llm-cost-shadow:v3:{date}`)                      | Accrual happens at LLM-call time; daily roll-up persisted to Redis HSET.           |
| `tokenBudget` aggregation                 | API/Backend (`operator-status.ts`)                   | Database/Redis                                                           | Aggregator reads token + cost-shadow keys, classifies, returns degrade-open field. |
| Call-history ring buffer                  | Database/Redis (`llm:calls:history`)                 | API/Backend (writers in `freeClaudeRouter.ts`, hydration in `events.ts`) | Survives Fluid Compute cold starts; in-memory singleton is per-instance cache.     |
| Run-summary records                       | Database/Redis (`llm:runs:history`)                  | API/Backend (run boundary in `llmExtractionPipeline.ts`)                 | Run lifecycle owns open/close; Redis is the durable store.                         |
| `/api/events/llm-history` read            | API/Backend (`events.ts` router)                     | —                                                                        | Bearer-gated read aggregator; LRANGE + optional filter.                            |
| BudgetBlock + FlightRecorderBlock render  | Browser/Client (`DevApiStatus.tsx`)                  | Frontend (no SSR — Vite SPA)                                             | Pure render of polled data; local React state for drill-down.                      |

## Standard Stack

No new libraries. Everything is existing project infrastructure.

### Core (existing)

| Library / Module          | Version     | Purpose                                                                    | Why Standard                                                                                               |
| ------------------------- | ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@upstash/redis`          | (installed) | REST-based Redis for serverless; `redis.lpush/lrange/ltrim/expire/hgetall` | Project's serverless cache layer (`server/cache/redis.ts`). Already exposes all list + hash ops needed.    |
| `express`                 | (installed) | Route handlers; `eventsRouter` + `dashboardAuth` middleware                | Existing API surface.                                                                                      |
| `zod`                     | (installed) | `.strict()` contract pin for `tokenBudget` (BUDGET-04)                     | Existing fail-fast `parseEnv` + contract-test precedent.                                                   |
| `vitest` + `jsdom`/`node` | (installed) | Test framework; `// @vitest-environment node` for server tests             | Project standard. Config is in `vite.config.ts` `test` block (NO standalone `vitest.config.*` — verified). |
| React + Tailwind v4       | (installed) | `DevApiStatus.tsx` blocks; `@theme` CSS-first tokens                       | Brownfield host; design system locked by UI-SPEC.                                                          |

### Supporting (existing, reused — no install)

| Module                                                | Purpose                                                              | When to Use                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `server/lib/llmTokenBudget.ts`                        | `DAILY_LIMITS`, `todayKey`, `getDailyTokens`, `budgetState`          | BudgetBlock data source — no new budget math.                                   |
| `server/lib/llmDLQ.ts`                                | LPUSH/SADD bounded-list + `parseEntry` (string                       | object) idiom                                                                   | Template for `llm:calls:history` / `llm:runs:history` read/write. |
| `server/cache/redis.ts` `cacheSetSafe`/`cacheGetSafe` | Degrade-open JSON cache helpers                                      | For `llm:lastProgress`-style write-through; raw `redis.lpush` for the list ops. |
| `server/middleware/dashboardAuth.ts`                  | Bearer gate (`timingSafeEqual`; prod-empty→503, bad→401, dev→bypass) | Gate `/llm-history`; already gates `/llm-status`.                               |
| `src/lib/dashboardAuth.ts` `dashboardAuthHeaders()`   | Client Bearer header injection                                       | FlightRecorderBlock fetch.                                                      |

**Installation:** None. `npm install` not required for this phase.

## Package Legitimacy Audit

> Not applicable — Phase 39 installs zero new external packages. All modules are existing first-party code or already-installed dependencies (`@upstash/redis`, `express`, `zod`, `vitest`, `react`). No registry verification or slopcheck needed.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────────┐
  LLM call (per batch)    │  freeClaudeRouter.callLLM                        │
  ───────────────────────▶│   • success (~:447): accrueShadowCost +          │
                          │     append callHistory entry                     │
                          │   • failure (:519-535): append failed-attempt    │
                          │     callHistory entry                            │
                          │   NEW: each entry copies runId + batchIndex      │
                          │   NEW: dual-write entry → llm:calls:history       │
                          │        (LPUSH + LTRIM 500 + EXPIRE 30d)           │
                          └───────────────┬─────────────────────────────────┘
                                          │
  Cron 04:00 UTC                          │ runId stamped here
  /api/cron/refresh-events                ▼
  ──────────────────────▶ runRefreshExtraction (llmExtractionPipeline.ts)
                            resetProgress()  ← NEW: generate runId (crypto.randomUUID)
                            NEW: LPUSH llm:runs:history { outcome:'running', runId, startedAt }
                            ... batch loop (processEventGroupsV3) ...
                            terminal branches (done / error / no-groups / paused):
                              NEW: re-LPUSH llm:runs:history { ...terminal outcome }
                            buildSummary() → events:llm-summary:v3  (existing)

  ┌──────────────────── READ PATHS (Bearer-gated) ────────────────────────┐
  │                                                                         │
  │  GET /api/operator-status ──▶ NEW tokenBudget block (degrade-open):     │
  │     read llm:tokens:nvidia_nim:{today} (getDailyTokens)                 │
  │     read events:llm-cost-shadow:v3:{today} (HGETALL)                    │
  │     classify via budgetState → { providers:{...}, costShadow:{...} }    │
  │                                                                         │
  │  GET /api/events/llm-history ──▶ NEW Bearer-gated:                      │
  │     hydrate-on-cold-start (LRANGE both lists if !hydrated)              │
  │     LRANGE llm:runs:history + llm:calls:history                         │
  │     optional ?runId / ?limit filter → { runs:[...], calls:[...] }       │
  │                                                                         │
  │  GET /api/events/llm-status ──▶ EXISTING; add same cold-start hydrate   │
  └─────────────────────────────────────────────────────────────────────────┘
              │                                   │
              ▼                                   ▼
  DevApiStatus.tsx (Browser SPA, 30s poll)
    • BudgetBlock      ← opStatus.tokenBudget (existing fetchOpStatus poll)
    • FlightRecorderBlock ← GET /llm-history (dashboardAuthHeaders)
        Level 1: run list → Level 2: calls (filter runId) → Level 3: prompt/response
```

### Recommended File Touch Map (no new top-level dirs)

```
server/
├── lib/
│   ├── llmRunHistory.ts        # NEW — llm:runs:history writer/reader + parseEntry (mirror llmDLQ.ts)
│   ├── llmCallHistory.ts       # NEW — llm:calls:history writer/reader + hydration helper
│   ├── llmProgress.ts          # EDIT — add `runId?: string` to singleton + INITIAL_PROGRESS reset
│   ├── llmExtractionPipeline.ts# EDIT — generate runId after resetProgress(); open/close run record
│   └── freeClaudeRouter.ts     # EDIT — copy runId+batchIndex onto callHistory entries; dual-write
├── routes/
│   ├── events.ts               # EDIT — add GET /llm-history (dashboardAuth); add hydrate hook to /llm-status
│   └── operator-status.ts      # EDIT — add tokenBudget degrade-open block
└── routes/__tests__/operator-status.test.ts  # EDIT — Zod .strict() tokenBudget pin (BUDGET-04)
src/
└── components/ui/DevApiStatus.tsx  # EDIT — OperatorStatus.tokenBudget type + BudgetBlock + FlightRecorderBlock
docs/architecture/redis-keys.md     # EDIT — register two new keys (drift gate)
CLAUDE.md                            # EDIT — register two new keys in §Active Redis keys
```

### Pattern 1: Bounded Redis list (LPUSH + LTRIM + EXPIRE) — write

**What:** Newest-first bounded ring buffer. The canonical project idiom is `llmDLQ.ts` (uses SADD; for an ordered ring use LPUSH).
**When to use:** `llm:calls:history` and `llm:runs:history`.

```typescript
// Source: pattern adapted from server/lib/llmDLQ.ts:57-70 (SADD→LPUSH variant)
// [VERIFIED: codebase — server/cache/redis.ts:16 documents redis.lpush/lrange]
const CALLS_KEY = 'llm:calls:history';
const CALLS_MAX = 500;
const CALLS_TTL_SEC = 30 * 24 * 3600;

export async function appendCallHistory(entry: CallHistoryEntry): Promise<void> {
  try {
    await redis.lpush(CALLS_KEY, JSON.stringify(entry)); // newest at head
    await redis.ltrim(CALLS_KEY, 0, CALLS_MAX - 1); // keep first 500
    await redis.expire(CALLS_KEY, CALLS_TTL_SEC);
  } catch {
    // observability-only — never throw out of the fire-and-forget pipeline
  }
}
```

### Pattern 2: Bounded Redis list — read with Upstash dual-shape parse

**What:** Upstash REST may return list members already-deserialized OR as JSON strings. Reads MUST handle both (the `llmDLQ.ts parseEntry` gotcha).

```typescript
// Source: server/lib/llmDLQ.ts:46-55 (parseEntry)  [VERIFIED: codebase]
function parseEntry<T>(raw: unknown): T | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    if (raw && typeof raw === 'object') return raw as T;
    return null;
  } catch {
    return null;
  }
}
export async function listCallHistory(limit = CALLS_MAX): Promise<CallHistoryEntry[]> {
  try {
    const raw = await redis.lrange(CALLS_KEY, 0, limit - 1);
    return raw
      .map((r) => parseEntry<CallHistoryEntry>(r))
      .filter((x): x is CallHistoryEntry => x !== null);
  } catch {
    return [];
  }
}
```

### Pattern 3: Degrade-open operator-status block (mirror actorQuality)

**What:** Any aggregator sub-block computes inside its own try/catch; Redis throw → field `null` → route stays 200.

```typescript
// Source: server/routes/operator-status.ts:419-484 (actorQuality)  [VERIFIED: codebase]
let tokenBudget: TokenBudgetBlock | null = null;
try {
  const nimUsed = await getDailyTokens('nvidia_nim'); // llmTokenBudget.ts
  const cap = DAILY_LIMITS.nvidia_nim;
  const state = budgetState('nvidia_nim', nimUsed);
  let costShadow = { tokensIn: 0, tokensOut: 0, usd: 0 };
  const cs = await redis.hgetall<Record<string, string | number>>(
    `events:llm-cost-shadow:v3:${todayKey()}`,
  );
  if (cs) {
    const microcents = Number(cs.usdMicrocents) || 0;
    costShadow = {
      tokensIn: Number(cs.tokensIn) || 0,
      tokensOut: Number(cs.tokensOut) || 0,
      usd: microcents / 1_000_000,
    };
  }
  tokenBudget = {
    providers: {
      nvidia_nim: {
        used: nimUsed,
        cap,
        soft: Math.round(cap * 0.8),
        hard: Math.round(cap * 0.95),
        state,
      },
    },
    costShadow,
  };
} catch (err) {
  log.warn({ err }, 'failed to compute tokenBudget block');
  // tokenBudget stays null
}
res.json({ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget });
```

### Pattern 4: Cold-start hydration guard (mirror llm:lastProgress write-through)

**What:** On first request after cold start, populate the in-memory singleton from Redis, then flip a module-level `hydrated` flag so subsequent requests skip the LRANGE.

```typescript
// Source: pattern from server/lib/llmProgress.ts:530-548 + events.ts:447 fallback  [VERIFIED]
let callHistoryHydrated = false;
export async function hydrateCallHistoryIfCold(): Promise<void> {
  if (callHistoryHydrated) return;
  callHistoryHydrated = true; // set first — best-effort, never retry-loop
  const fromRedis = await listCallHistory(20); // last N to repopulate singleton cap
  if (fromRedis.length > 0 && !llmProgress.callHistory) {
    llmProgress.callHistory = fromRedis.slice(0, 20);
  }
}
```

### Anti-Patterns to Avoid

- **Re-introducing fire-and-forget on `/api/events`** (CLAUDE.md anti-pattern #17). The history writes belong in the existing cron-driven `runRefreshExtraction` body and the per-call writers — NOT a new request-triggered write.
- **Throwing from a history write.** All Redis writes here are observability-only and MUST be try/caught (matches `accrueShadowCost`, `enqueueDLQ`, every `cacheSetSafe`). A history-write failure must never break extraction.
- **Fanning out 90 Redis GETs per dashboard poll** (GA-3). Do NOT loop `events:llm-cost-shadow:v3:{date}` over 90 days in the 30s `fetchOpStatus` aggregator.
- **Mutating `withBatchWatchdog` to carry runId.** It is a pure timing primitive (no Redis/progress imports by design — `llmExtractorWatchdog.ts:17-19`). Thread `runId` via the progress singleton instead.
- **Assuming Upstash list reads are strings.** Always run members through `parseEntry` (string-or-object).
- **Doubling the breaker-window `err` count.** The failure-path callHistory writer (`freeClaudeRouter.ts:519`) is per-attempt; the single breaker `record(...,'err')` is per-call (`:479`). Do not add a second recording when threading runId.

## Don't Hand-Roll

| Problem                         | Don't Build                     | Use Instead                                                                            | Why                                                                                        |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Budget soft/hard classification | New threshold math in the route | `budgetState(provider, used)` (`llmTokenBudget.ts:88`)                                 | Already computes ok/soft/hard at 0.8/0.95.                                                 |
| Cost-shadow USD conversion      | New pricing formula             | Read `usdMicrocents` field, divide by 1e6                                              | Accrual already prices tokens_in×$0.20/M + tokens_out×$0.40/M (`freeClaudeRouter.ts:648`). |
| Bounded Redis list eviction     | Custom trim loop                | `redis.lpush` + `redis.ltrim(key, 0, MAX-1)`                                           | LTRIM is the native bounded-ring primitive; `llmDLQ.ts` is the in-repo template.           |
| Upstash member parsing          | `JSON.parse` everywhere         | `parseEntry` string-or-object helper                                                   | Upstash REST auto-deserializes some payloads; raw `JSON.parse` throws on objects.          |
| Bearer gate                     | New auth check                  | `dashboardAuth` middleware                                                             | Constant-time compare, prod-fail-closed, dev-bypass already correct.                       |
| Client Bearer header            | Manual header build             | `dashboardAuthHeaders()` (`src/lib/dashboardAuth.ts`)                                  | Existing helper used by every operator fetch.                                              |
| Progress bar / status pill UI   | New components                  | `ProgressBar` (`:100`), `STATUS_PILL_CLASSES` (`:810`), `TIER_BORDER_CLASSES` (`:817`) | Locked design idioms per UI-SPEC; h-1 track, accent pills.                                 |
| Relative timestamp              | New formatter                   | `formatAge` / `freshnessText` / `formatDuration` (already in DevApiStatus host)        | UI-SPEC §B references these by name.                                                       |

**Key insight:** This phase is ~95% wiring existing primitives into two read endpoints and two render blocks. The only genuinely new logic is `runId` generation/threading and the run-record open/close lifecycle.

## Gray Area Resolutions (GA-1..GA-4)

### GA-1 — Phase 39 ↔ Phase 40 UI scope boundary — **ADOPT THE LEAN**

Ship in 39: the **data layer** (both Redis lists, both endpoints, `tokenBudget` field + contract test), **BudgetBlock** (full — it is small and read-only), and a **functional FlightRecorderBlock** with run-list → inline expand-run → call-list → minimal prompt/response read (reusing the existing copyable modal idiom, UI-SPEC §B Level 3).
Defer to Phase 40: rich filters (outcome/date-range dropdowns), polished prompt-copy syntax niceties, and final tab/subtab placement. **Grounded:** OBS-FLIGHT-04's own text says "Likely lives as a sub-block inside the broader Phase 40 UI polish reorganization"; ROADMAP Phase 40 §SC40-1 says UI-SPEC must account for Phase 39 block placement before consolidation; UI-SPEC §"Spacing Exceptions" + GA-1 provenance both scope a "functional-but-clean baseline." **Confidence: HIGH.**

### GA-2 — Crashed/aborted run-record durability — **ADOPT START-WRITE; use re-LPUSH + dedupe-by-runId, NOT in-place LSET**

Write the run record at run START with `outcome:'running'`, then re-LPUSH the terminal record at each run-exit branch. **Reader dedupes by `runId`, keeping the first (newest, head) occurrence.**
**Why re-LPUSH over LSET-by-index:** LSET requires knowing the entry's current list index, which is unstable — concurrent LPUSHes (a `callHistory` dual-write is a different key, but any future concurrent run, plus LTRIM shifting indices) make index-based mutation fragile. Re-LPUSH is append-only and ordering-safe: the terminal record lands at the head (newest), the stale `running` record sits deeper, and the reader's `runId` dedupe (first-wins) returns the terminal state. Cost: ~2 LPUSHes per daily cron run — negligible against the 200-cap/30d ring. The stale `running` row ages out via LTRIM.
**Crash coverage:** Vercel maxDuration kill (800s) or process death leaves only the `running` record — which is exactly the "what happened to last night's 3am run that died?" signal the phase exists to surface. UI renders it with a blue `running` badge that never resolved (a visible anomaly). **Confidence: HIGH.**

Run-exit branches that must close the record (all in `llmExtractionPipeline.ts`): no-new-groups (:338-351), soft-cap paused (:356-369), null-extraction (:393-407), success (:465-474), catch/error (:475-487). Map each to an `outcome` (see Run Summary Shape).

### GA-3 — Cost-shadow trend depth — **ADOPT TODAY-ONLY; defer 90d sparkline**

Ship today's USD + the soft/hard proximity context in 39 (single HGETALL of `events:llm-cost-shadow:v3:{today}`). Defer the 90d sparkline. **Grounded:** a 90d sparkline reads up to 90 daily HSET keys per 30s `fetchOpStatus` poll — unacceptable fan-out for a single-operator dashboard. UI-SPEC §A.3 explicitly defers the sparkline. If a thinned trend is ever wanted, the cheapest path is a **pre-rolled sidecar** (a single key the accrual writer also updates with a rolling 7-element array) so the reader does one GET — but that is out of 39 baseline scope. **Confidence: HIGH.**

### GA-4 — `tokenBudget` operator-status contract shape — **ADOPT PROVIDER-KEYED MAP**

```typescript
interface TokenBudgetBlock {
  providers: {
    nvidia_nim: {
      used: number;
      cap: number;
      soft: number;
      hard: number;
      state: 'ok' | 'soft' | 'hard';
    };
    // future providers add a map entry — no .strict() break
  };
  costShadow: { tokensIn: number; tokensOut: number; usd: number };
}
// On /api/operator-status: tokenBudget: TokenBudgetBlock | null  (null = degrade-open)
```

Field provenance: `used` = `getDailyTokens('nvidia_nim')`; `cap` = `DAILY_LIMITS.nvidia_nim` (currently 1_000_000); `soft`/`hard` = `cap * 0.8` / `cap * 0.95` (the constants `SOFT_CAP_RATIO`/`HARD_CAP_RATIO` in `llmTokenBudget.ts:50-51` are module-private — recompute or export them; recommend exporting `SOFT_CAP_RATIO`/`HARD_CAP_RATIO` to avoid a magic-number drift); `state` = `budgetState('nvidia_nim', used)`; `costShadow.usd` = `usdMicrocents / 1_000_000`.
**Why map over flat:** restoring a provider later (e.g., OpenRouter un-dormant) adds a map key without breaking the Zod `.strict()` contract test — a flat `{used, cap, ...}` would force a breaking shape change. **Confidence: HIGH.**

**Caveat (LOW-confidence note for planner):** `DAILY_LIMITS.nvidia_nim = 1_000_000` is a "zero-cost type-compat default" per the comment at `llmTokenBudget.ts:24-27` — the v3 cascade does NOT call `incrDailyTokens` (the module is retired from the v3 path, D-04). So `getDailyTokens('nvidia_nim')` will read whatever `events:llm-cost-shadow` accrual… **does NOT write** — token counters and cost-shadow are SEPARATE keys. **`llm:tokens:nvidia_nim:{date}` may be 0/absent at runtime because nothing increments it in the v3 path.** This means BudgetBlock's per-provider bar will likely render `0/1000000 (ok)`. This is HONEST (NIM free-tier usage isn't metered into that counter), but the planner should decide whether BUDGET-01 wants the bar fed from the real NIM rate-limit window (`nvidiaNimWindow.headroom()` in `freeClaudeRouter.ts:620`, surfaced via `llmProgress.rateLimit.nvidia_nim`) instead of the dormant `llm:tokens` counter. **[ASSUMED — verify with operator/planner which source BUDGET-01's "used vs cap" should read.]** See Open Questions Q1.

## Run Summary Shape (OBS-FLIGHT-02, v3/NIM-adapted)

The folded 27.4.5 todo's shape mapped to D-04. Note: the existing `LLMRunSummary` interface (`llmProgress.ts:275`) is a DIFFERENT artifact — it is the `/llm-status` last-run summary persisted to `events:llm-summary:v3`. OBS-FLIGHT-02's run record is a NEW, leaner per-run history entry. Do NOT overload `LLMRunSummary`; define a new `RunHistoryEntry`.

```typescript
interface RunHistoryEntry {
  runId: string; // crypto.randomUUID() at run start
  startedAt: string; // ISO8601
  completedAt: string | null; // ISO8601; null while running
  outcome: 'running' | 'completed' | 'watchdog_aborted' | 'breaker_paused' | 'budget_hit' | 'error';
  batchCount: number; // llmProgress.totalBatches
  batchesCompleted: number; // llmProgress.completedBatches
  batchesFailed: number; // derived (totalBatches - completedBatches) or watchdog+dlq count
  tokenSpend: { nvidia_nim: number }; // D-04 single provider
  evalScore: LLMPipelineProgress['evalScore']; // reuse existing shape
  dlqDelta: number; // DLQ entries added during this run
  watchdogTimeouts: number; // llmProgress.watchdogTimeoutCount
  durationMs: number; // completedAt - startedAt
  pipelineVersion: 'v3'; // D-04 fixed
}
```

**Outcome mapping** (from `llmExtractionPipeline.ts` branches): success path → `completed`; soft-cap pause → `breaker_paused` (or a new `budget_hit` if distinguishing soft-cap from breaker; soft-cap is `shouldPauseNewEvents` → use `budget_hit`); catch/error → `error`; watchdog-killed batches don't abort the whole run (the watchdog returns null per-batch), so `watchdog_aborted` only applies if the WHOLE run is killed by maxDuration (which leaves the `running` record — no terminal write). UI distinguishes `running`-that-never-closed visually.

## Validation Architecture

> Nyquist validation is ENABLED for this phase. This section is REQUIRED; VALIDATION.md is generated from it.

### Test Framework

| Property                  | Value                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Framework                 | Vitest (jsdom for `src/`, node for `server/`)                                      |
| Config file               | `vite.config.ts` `test` block (NO standalone `vitest.config.*` — verified by glob) |
| Quick run command         | `npx vitest run server/lib/llmCallHistory.test.ts` (single new test file)          |
| Full suite command        | `npx vitest run` (all) / `npx vitest run server/` (server only)                    |
| Server test env directive | `// @vitest-environment node` at file top                                          |

### Phase Requirements → Test Map

| Req ID        | Behavior                                                                                                  | Test Type        | Automated Command                                                           | File Exists?       |
| ------------- | --------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------ |
| BUDGET-03     | `tokenBudget` present + degrade-open null on Redis throw; route stays 200                                 | unit (route)     | `npx vitest run server/routes/__tests__/operator-status.test.ts`            | ✅ extend existing |
| BUDGET-04     | `tokenBudget` shape pinned via Zod `.strict()` (rejects extra keys)                                       | contract         | same file, new `it('tokenBudget Zod .strict() pin')`                        | ✅ extend          |
| BUDGET-01/02  | BudgetBlock renders used/cap/state + cost today; hides when `tokenBudget===null`                          | unit (component) | `npx vitest run src/components/ui/__tests__/BudgetBlock.test.tsx`           | ❌ Wave 0          |
| OBS-FLIGHT-01 | `llm:calls:history` LPUSH+LTRIM 500/30d; entries carry runId+batchIndex; parseEntry handles string+object | unit             | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts`                | ❌ Wave 0          |
| OBS-FLIGHT-02 | run record opens `running` at start, closes terminal; re-LPUSH + dedupe-by-runId reader                   | unit             | `npx vitest run server/lib/__tests__/llmRunHistory.test.ts`                 | ❌ Wave 0          |
| OBS-FLIGHT-03 | `GET /llm-history` Bearer-gated (401 no Bearer, 200 with); `{runs,calls}`; `?runId`/`?limit` filter       | unit (route)     | `npx vitest run server/routes/__tests__/llm-history.test.ts`                | ❌ Wave 0          |
| OBS-FLIGHT-05 | every call in a run carries the run's runId (back-correlation)                                            | unit             | covered in `llmCallHistory.test.ts` + an integration assert                 | ❌ Wave 0          |
| OBS-FLIGHT-06 | cold-start hydration: empty singleton + populated Redis → first request hydrates; flag prevents re-LRANGE | unit             | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` (hydrate case) | ❌ Wave 0          |
| (drift gate)  | both new keys documented in CLAUDE.md + redis-keys.md + referenced in code                                | registry         | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                   | ✅ existing gate   |
| OBS-FLIGHT-04 | FlightRecorderBlock run-list → expand → call → prompt; degrade-open hides on non-200                      | UAT (manual)     | 27.4.5 verification checklist (below)                                       | manual             |

### Sampling Rate

- **Per task commit:** the single new test file for the strand touched (e.g. `npx vitest run server/lib/__tests__/llmRunHistory.test.ts`).
- **Per wave merge:** `npx vitest run server/` (server strand) then `npx vitest run` (full) including the registry drift gate.
- **Phase gate:** full `npx vitest run` green + the redis-registry drift gate green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `server/lib/__tests__/llmCallHistory.test.ts` — covers OBS-FLIGHT-01, -05, -06
- [ ] `server/lib/__tests__/llmRunHistory.test.ts` — covers OBS-FLIGHT-02 (open/close, re-LPUSH dedupe)
- [ ] `server/routes/__tests__/llm-history.test.ts` — covers OBS-FLIGHT-03 (Bearer gate + filters)
- [ ] `src/components/ui/__tests__/BudgetBlock.test.tsx` — covers BUDGET-01/02 render + null-gate (optional if planner folds into manual UAT per GA-1 functional-baseline)
- [ ] Extend `server/routes/__tests__/operator-status.test.ts` — BUDGET-03/04 Zod `.strict()` pin
- [ ] CLAUDE.md + docs/architecture/redis-keys.md registration — REQUIRED for `redis-registry.test.ts` to pass (this is a hard gate, not optional)

### UAT — 27.4.5 verification checklist (adapted v1/v2→v3/NIM)

1. Restart server / force cold start mid-run → confirm a partial run shows in `/llm-history` with `outcome:'running'` (never-closed) on boot.
2. Complete a run (force `GET /api/cron/refresh-events?force=true` with Bearer) → confirm full run record + all calls present in `llm:runs:history` / `llm:calls:history`.
3. DevApiStatus API Health tab: click a run → see its calls (filtered by runId); click a call → read prompt + response.
4. Call-count reconciliation: compare `llm:calls:history` count to cumulative batch count across runs — should roughly match (modulo retries + skip entries).

### Redis-registry drift gate — EXACT registration format

The gate (`src/__tests__/lib/redis-registry.test.ts`) requires three-surface parity: (1) a backticked key in CLAUDE.md §"Active Redis keys" subsection, (2) a backticked key in a `redis-keys.md` table row, (3) a string literal in non-test `.ts` code. The regex normalizes `{...}` placeholders and `:YYYY-MM-DD` away, and treats prefix-equivalent keys as matching. Both new keys (`llm:calls:history`, `llm:runs:history`) are static (no placeholder) so they must appear verbatim in all three. **redis-keys.md row format (from existing `llm:*` rows):**

```
| `llm:calls:history` | <writer file:line> | <reader file:line + /api/events/llm-history> | 30d (LTRIM 500) | JSON CallHistoryEntry[] | <purpose> | ≤500 (capped) | observability |
```

CLAUDE.md format: add a bullet under "Active Redis keys (current-state registry)" mirroring the `events:llm-dlq` bullet style (key in backticks + LPUSH+LTRIM cap + TTL + writer + reader).

## Common Pitfalls

### Pitfall 1: Threading runId through the wrong layer

**What goes wrong:** Plan tries to inject runId in `withBatchWatchdog` per CONTEXT's (incorrect) note.
**Why it happens:** CONTEXT canonical_refs says "generation counter is the runId injection point" — but `withBatchWatchdog` has no generation counter; it is a pure timing primitive with only `batchIndex` (`llmExtractorWatchdog.ts:37-52, 68-117`).
**How to avoid:** Generate runId in `runRefreshExtraction` after `resetProgress()` (`llmExtractionPipeline.ts:308`); store on `llmProgress.runId`; the two `callHistory` writers in `freeClaudeRouter.ts` read `llmProgress.runId` when appending.
**Warning sign:** A plan task editing `llmExtractorWatchdog.ts` to add Redis/progress imports — that file is deliberately dependency-free.

### Pitfall 2: token counter is dormant in the v3 path

**What goes wrong:** BudgetBlock shows `0/1000000` because nothing increments `llm:tokens:nvidia_nim:{date}` in v3.
**Why it happens:** `llmTokenBudget.incrDailyTokens` is retired from the v3 cascade (`llmTokenBudget.ts:24-27` comment); cost-shadow accrual writes a DIFFERENT key (`events:llm-cost-shadow:v3:*`).
**How to avoid:** Planner decides BUDGET-01's "used" source: (a) the dormant `llm:tokens` counter (honest 0, extensibility-shaped for restored providers), or (b) the live NIM rate-limit window `llmProgress.rateLimit.nvidia_nim` (real per-minute headroom). See Open Questions Q1.
**Warning sign:** A green test that asserts `used > 0` from `getDailyTokens('nvidia_nim')` against a real v3 run — it will be 0.

### Pitfall 3: Upstash list members are not always strings

**What goes wrong:** `JSON.parse(member)` throws when Upstash REST returns an already-parsed object.
**How to avoid:** Use the `parseEntry` string-or-object guard (`llmDLQ.ts:46-55`).
**Warning sign:** Intermittent parse errors in cold-start hydration but not in unit tests (unit mocks return strings; real Upstash may not).

### Pitfall 4: Double-counting the breaker error window

**What goes wrong:** Adding a `record(p.name,'err')` near the failure-path callHistory writer.
**Why it happens:** The failure callHistory append (`freeClaudeRouter.ts:519-535`) is per-attempt; the single breaker recording is per-call (:479). Threading runId near :519 invites an accidental second `record`.
**How to avoid:** Only copy `runId`+`batchIndex` onto the entry; do not touch breaker recording.
**Warning sign:** Circuit breaker pauses sooner than expected under retries.

### Pitfall 5: Stale `running` record after maxDuration kill

**What goes wrong:** A run killed by Vercel's 800s `maxDuration` never writes a terminal record, leaving a permanent `running` row.
**Why it happens:** GA-2's start-write opens `running`; a hard process kill skips the close.
**How to avoid:** This is BY DESIGN — it is the "run that died" signal. UI renders never-closed `running` runs distinctly (blue badge, no completedAt). Reader dedupes by runId (first-wins) so a later successful run with a different runId is unaffected.

### Pitfall 6: Contract-test path drift

**What goes wrong:** Plan edits `server/__tests__/routes/operator-status.test.ts` (CONTEXT's claimed path).
**Why it happens:** Path drifted; actual is `server/routes/__tests__/operator-status.test.ts`.
**How to avoid:** Edit the verified path.

## Code Examples

### Generate + thread runId at the run boundary

```typescript
// Source: edit at server/lib/llmExtractionPipeline.ts:306-311  [VERIFIED location]
safeWaitUntil(
  (async () => {
    resetProgress(); // existing — sets startedAt
    const runId = crypto.randomUUID(); // NEW
    updateProgress({ schemaVersion: 'v3', lastTriggerSource: opts.triggeredBy, runId }); // NEW field
    await openRunRecord({ runId, startedAt: new Date().toISOString() }); // NEW — outcome:'running'
    try {
      // ... existing batch loop; callHistory writers inherit llmProgress.runId ...
      // success branch:
      await closeRunRecord({ runId, outcome: 'completed' /* ...derived from llmProgress... */ });
    } catch (llmErr) {
      await closeRunRecord({ runId, outcome: 'error' /* ... */ });
    }
  })(),
);
```

### Copy runId onto a callHistory entry (success + failure writers)

```typescript
// Source: edit at server/lib/freeClaudeRouter.ts callHistory append sites  [VERIFIED]
const entry = {
  provider: p.name,
  model: p.model,
  tokensIn,
  tokensOut,
  durationMs,
  ok,
  batchSize,
  timestamp: Date.now(),
  runId: llmProgress.runId, // NEW — inherited from run boundary
  batchIndex: opts.batchIndex, // NEW — already threaded into the watchdog opts; pass through to the router call
};
updateProgress({ callHistory: [entry, ...(llmProgress.callHistory ?? [])].slice(0, 20) });
void appendCallHistory(entry); // NEW — dual-write to llm:calls:history (degrade-open)
```

> Note: `batchIndex` is currently known to `withBatchWatchdog` (its opts) but NOT to the `callLLM` router call. The planner must thread `batchIndex` from the extractor loop into the `callLLM`/`opts` so the writer can stamp it. Verify the call chain `processEventGroupsV3` → `withBatchWatchdog` → `callLLM` carries batch index.

### New Bearer-gated /llm-history route

```typescript
// Source: mirror server/routes/events.ts:384 (/llm-status registration)  [VERIFIED]
eventsRouter.get('/llm-history', dashboardAuth, async (req, res) => {
  await hydrateCallHistoryIfCold(); // OBS-FLIGHT-06
  await hydrateRunHistoryIfCold();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
  const runs = await listRunHistory(limit); // dedupe-by-runId inside
  let calls = await listCallHistory(limit);
  if (runId) calls = calls.filter((c) => c.runId === runId);
  res.json({ runs, calls });
});
```

## State of the Art

| Old Approach                                           | Current Approach                                         | When Changed                                        | Impact                                                        |
| ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| in-memory `callHistory` cap 20, lost on cold start     | Redis `llm:calls:history` 500/30d + cold-start hydration | This phase (39)                                     | Survives Fluid Compute warm-start gaps.                       |
| `NODE_ENV !== 'production'` gate on `/llm-status`      | `dashboardAuth` Bearer gate                              | Phase 27.4.4 Plan 02                                | New `/llm-history` uses Bearer, not NODE_ENV (D-03).          |
| `tokenSpend: {cerebras, groq}`, `pipelineVersion: 'v1' | 'v2'` (27.4.5 todo)                                      | `tokenSpend: {nvidia_nim}`, `pipelineVersion: 'v3'` | Phase 29 (v1/v2 del) + Phase 38 (Cerebras/Groq purge)         | All new shapes are v3/NIM-only (D-04). |
| `llmTokenBudget.incrDailyTokens` metered the cascade   | retired from v3 path (type-compat default)               | Phase 29 D-01                                       | `llm:tokens:nvidia_nim` may be 0 at runtime (Pitfall 2 / Q1). |

**Deprecated/outdated in CONTEXT:**

- "generation counter in `withBatchWatchdog` is the runId injection point" — INACCURATE; corrected to `runRefreshExtraction` run boundary (Pitfall 1).
- Contract-test path `server/__tests__/routes/operator-status.test.ts` — drifted; actual `server/routes/__tests__/operator-status.test.ts` (Pitfall 6).
- `LLMRunSummary` interface at `:275` described as "the shape to extend for OBS-FLIGHT-02" — it is the `/llm-status` last-run summary, a different artifact; define a new `RunHistoryEntry` rather than overload it.

## Assumptions Log

| #   | Claim                                                                                                                                                                 | Section                    | Risk if Wrong                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --- |
| A1  | BUDGET-01 "used vs cap" should read the dormant `llm:tokens:nvidia_nim` counter (will be 0/absent in v3) OR the live NIM rate-limit window — operator/planner decides | GA-4 caveat, Pitfall 2, Q1 | BudgetBlock shows a perpetually-empty bar (`0/1M ok`) that looks broken instead of informative.                                                                          |
| A2  | `crypto.randomUUID()` is available in the Vercel Node ≥20 runtime (it is, global since Node 19)                                                                       | Run boundary               | runId generation fails — but Node ≥20 is pinned (CLAUDE.md), so risk ~nil.                                                                                               |
| A3  | `batchIndex` can be threaded from the extractor loop through to the `callLLM` writer                                                                                  | Code Examples              | If the call chain doesn't carry batch index, `batchIndex` on calls is unavailable without a deeper refactor. Planner must verify `processEventGroupsV3`→`callLLM` chain. |
| A4  | `redis.hgetall` returns string-valued fields needing `Number()` coercion (HINCRBY stores integers; Upstash REST typing varies)                                        | Pattern 3                  | Cost numbers render as `NaN` if coercion is skipped — mitigated by `Number(x)                                                                                            |     | 0`. |
| A5  | Soft-cap pause maps to `outcome:'budget_hit'` (vs `breaker_paused`)                                                                                                   | Run Summary Shape          | Cosmetic — wrong badge color on a rare run state; not load-bearing.                                                                                                      |

## Open Questions

1. **BUDGET-01 data source for "used vs cap" (HIGH priority).**
   - What we know: `llm:tokens:nvidia_nim:{date}` exists and `getDailyTokens`/`budgetState` classify it, but `incrDailyTokens` is retired from the v3 path — so the counter is likely 0/absent. Cost-shadow (`events:llm-cost-shadow:v3`) IS actively written. The live NIM per-minute window is in `llmProgress.rateLimit.nvidia_nim`.
   - What's unclear: which source BUDGET-01's proximity bar should render.
   - Recommendation: Ship the `llm:tokens` counter source (matches REQUIREMENTS.md literal text + GA-4 extensibility shape) but add a one-line comment that it reads 0 in the v3-only era, and surface cost-shadow USD as the live signal. If the operator wants a live bar, switch the `used`/`cap` to `rateLimit.nvidia_nim.{used,cap}` in a follow-up — non-breaking (same map shape). Flag to operator at plan review.

2. **`batchIndex` availability at the callHistory writer (MEDIUM).**
   - What we know: `withBatchWatchdog` knows `batchIndex` (its opts); the `callLLM` router call (where callHistory is appended) may not.
   - What's unclear: whether the existing call chain passes batch index down to `callLLM`.
   - Recommendation: First plan task verifies the `processEventGroupsV3 → withBatchWatchdog → callLLM` chain and threads `batchIndex` into the router opts if absent. If genuinely unavailable, fall back to `batchIndex: -1` (unknown) rather than blocking.

3. **Run-record close on all five exit branches (LOW — mechanical).**
   - What we know: five exit branches in `runRefreshExtraction` (no-groups, paused, null-extraction, success, catch).
   - Recommendation: Wrap close-record in the existing `finally` block where possible so a missed branch still closes the run; otherwise add explicit closes per branch.

## Environment Availability

| Dependency                      | Required By                            | Available         | Version                    | Fallback                                              |
| ------------------------------- | -------------------------------------- | ----------------- | -------------------------- | ----------------------------------------------------- |
| Upstash Redis (REST)            | both lists, cost-shadow, token counter | ✓ (production)    | `@upstash/redis` installed | degrade-open: all reads return [] / null, blocks hide |
| Node ≥20 (`crypto.randomUUID`)  | runId generation                       | ✓                 | pinned `>=20` (CLAUDE.md)  | none needed                                           |
| Vercel Pro (`maxDuration: 800`) | full LLM run completes before kill     | ✓                 | locked Phase 29 D-08       | partial-run `running` record (GA-2) is the fallback   |
| `DASHBOARD_PASSWORD` env        | Bearer gate on `/llm-history`          | ✓ (set at deploy) | —                          | dev: bypass; prod-empty: 503 (fail-closed, by design) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking — all Redis reads are degrade-open.

## Security Domain

> `security_enforcement` default (enabled). This is a read-only observability surface with no new destructive actions.

### Applicable ASVS Categories

| ASVS Category         | Applies     | Standard Control                                                                                                                        |
| --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| V2 Authentication     | no          | No login flow; Bearer token only.                                                                                                       |
| V3 Session Management | no          | Stateless Bearer header.                                                                                                                |
| V4 Access Control     | yes         | `dashboardAuth` middleware on `/llm-history` + `tokenBudget` (Bearer-gated reads, D-03). Constant-time compare; prod-empty fail-closed. |
| V5 Input Validation   | yes         | `?runId` / `?limit` query params — coerce + clamp (`Math.min(Number(limit)                                                              |     | 200, 500)`); `runId` typeof-string guard before use as a filter (never as a Redis key). |
| V6 Cryptography       | yes (reuse) | `crypto.randomUUID` for runId (non-secret identifier); `timingSafeEqual` already in `dashboardAuth`. Do NOT hand-roll.                  |

### Known Threat Patterns for this stack

| Pattern                                                       | STRIDE                 | Standard Mitigation                                                                                                                                           |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt/response leakage via `/llm-history` Level 3 drill-down | Information Disclosure | Bearer gate (D-03); same sensitivity class as existing `/llm-status` which already exposes prompts. No new exposure surface.                                  |
| Unbounded `?limit` → Redis LRANGE DoS                         | DoS                    | Clamp `limit` to ≤500 (the LTRIM cap).                                                                                                                        |
| `runId` injection into a Redis key                            | Tampering              | `runId` is used ONLY as an in-memory `.filter()` predicate on already-fetched calls, never concatenated into a Redis key. Verified safe in the route example. |
| Cost-shadow / token numbers revealing infra cost              | Information Disclosure | Bearer-gated; operator-only; matches existing operator-status sensitivity.                                                                                    |

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** — all new modules; new optional fields on interfaces stay optional for read-compat.
- **Zustand** — N/A (no new store; DevApiStatus uses local React state per UI-SPEC).
- **Tailwind v4 CSS-first** — no `tailwind.config.js`; use `@theme` tokens. Operator console uses neutral `white/N` ramp + four `--color-accent-*` tokens ONLY (NOT the 24 entity colors) per UI-SPEC §Color.
- **Conventional commits** — `feat(39):`, `docs(39):`, `fix(39):`.
- **Branch per phase** — `feature/39-operator-visibility-...`; merge prior phase to main first.
- **Anti-pattern #17** — `/api/events` stays cache-only; do NOT re-introduce fire-and-forget. History writes belong to the cron-driven run body + per-call writers.
- **Redis key registry** — every new key MUST register in CLAUDE.md §"Active Redis keys" + `docs/architecture/redis-keys.md` (Phase 35 drift gate enforces three-surface parity). HARD gate.
- **Degrade-open** — every Redis read in the operator surface try/caught; route stays 200, block hides.
- **Fail-fast config** — if any new env var is introduced (none planned), it goes through Zod `parseEnv`.
- **Testing** — Vitest; `// @vitest-environment node` for server tests; mocks in `src/test/__mocks__/`.

## Sources

### Primary (HIGH confidence — verified in this session)

- `server/lib/llmTokenBudget.ts:32-93` — DAILY_LIMITS, todayKey, getDailyTokens, budgetState, SOFT/HARD ratios; v3-retirement comment :24-27.
- `server/lib/llmProgress.ts:24-263, 275-415, 469-588` — LLMPipelineProgress, callHistory shape, LLMRunSummary, INITIAL_PROGRESS, resetProgress/updateProgress write-through (`llm:lastProgress`).
- `server/lib/freeClaudeRouter.ts:441-535, 646-668` — callHistory writers (success/failure), accrueShadowCost + microcents pricing + `events:llm-cost-shadow:v3` HSET.
- `server/lib/llmExtractorWatchdog.ts:17-117` — withBatchWatchdog pure timing primitive (no generation counter; batchIndex only).
- `server/lib/llmExtractionPipeline.ts:290-510` — runRefreshExtraction run boundary, resetProgress, 5 exit branches, buildSummary writes.
- `server/lib/llmDLQ.ts:1-70` — bounded-list (SADD) + parseEntry string-or-object idiom; TTL/cap constants.
- `server/routes/operator-status.ts:380-492` — actorQuality degrade-open block + res.json shape.
- `server/routes/events.ts:384-457` — /llm-status registration (dashboardAuth) + Redis-summary fallback (hydration hook point).
- `server/middleware/dashboardAuth.ts:1-62` — Bearer gate semantics (503/401/dev-bypass).
- `src/components/ui/DevApiStatus.tsx:100-121, 810-817, 895-970` — ProgressBar, STATUS_PILL_CLASSES/TIER_BORDER_CLASSES, OperatorStatus type, fetchOpStatus poll.
- `src/__tests__/lib/redis-registry.test.ts:1-219` — drift gate three-surface parity + normalization regex.
- `docs/architecture/redis-keys.md:11-107` — table row format for each prefix family; existing `llm:*` rows.
- `server/routes/__tests__/operator-status.test.ts` (path verified) — contract-test structure (shape asserts, Bearer test).
- `.planning/todos/pending/phase-27.4.5-llm-pipeline-observability.md` — folded source spec + verification checklist.
- `.planning/REQUIREMENTS.md:73-84, 189-198` — BUDGET / OBS-FLIGHT requirement text + traceability.
- `.planning/ROADMAP.md:180-213` — Phase 39 SC39-1..4 + Phase 40 dependency.

### Secondary (MEDIUM)

- CLAUDE.md §"Active Redis keys", §"LLM Event Pipeline", §"Serverless Cache", §"Vercel Deployment" — conventions and existing key registry.

### Tertiary (LOW)

- None — no external/web sources needed; pure-codebase phase.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new packages; all modules verified present.
- Architecture: HIGH — run boundary, writers, aggregator, and UI host all read directly.
- Pitfalls: HIGH — each grounded in a specific verified line (esp. the watchdog/runId correction and the dormant-counter caveat).
- Gray-area resolutions: HIGH — each cross-checked against REQUIREMENTS / ROADMAP / UI-SPEC.
- Q1 (BUDGET-01 source): MEDIUM — needs an operator/planner decision (the only genuine open design choice).

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stable internal codebase; re-verify line anchors if Phase 38 merges land between now and planning — Phase 38/39 are interleave-permitted).
