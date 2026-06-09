# Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 14 (6 new code + 4 new tests + 6 modified)
**Analogs found:** 14 / 14 (all in-repo; zero new external patterns)

> RESEARCH.md already verified every integration anchor with line numbers and CORRECTED two CONTEXT inaccuracies (runId boundary is `runRefreshExtraction` NOT `withBatchWatchdog`; contract-test path is `server/routes/__tests__/operator-status.test.ts`). This map re-confirms each analog against current source and extracts the copy-from excerpts. Where RESEARCH and CONTEXT conflict, RESEARCH wins.

---

## File Classification

| New/Modified File                                                         | Role        | Data Flow                                                 | Closest Analog                                                             | Match Quality        |
| ------------------------------------------------------------------------- | ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------- |
| `server/lib/llmCallHistory.ts` (NEW)                                      | service/lib | event-driven (bounded ring write + LRANGE read + hydrate) | `server/lib/llmDLQ.ts`                                                     | exact (role + flow)  |
| `server/lib/llmRunHistory.ts` (NEW)                                       | service/lib | event-driven (open/close lifecycle + dedupe read)         | `server/lib/llmDLQ.ts` + `llmProgress.ts` write-through                    | exact (role + flow)  |
| `server/routes/events/llm-history.ts` _(or handler in `events.ts`)_ (NEW) | route       | request-response (Bearer-gated read aggregator)           | `server/routes/events.ts:384` `/llm-status` + `operator-status.ts`         | exact                |
| `src/components/ui/BudgetBlock.tsx` (NEW)                                 | component   | request-response (render of polled field)                 | `DevApiStatus.tsx` actorQuality render `:1681` + `ProgressBar :100`        | exact                |
| `src/components/ui/FlightRecorderBlock.tsx` (NEW)                         | component   | request-response (fetch + drill-down list)                | `DevApiStatus.tsx` expandable-row + `STATUS_PILL_CLASSES :810`             | role-match           |
| `server/lib/__tests__/llmCallHistory.test.ts` (NEW)                       | test        | unit                                                      | existing `llmDLQ`/redis tests + `// @vitest-environment node`              | role-match           |
| `server/lib/__tests__/llmRunHistory.test.ts` (NEW)                        | test        | unit                                                      | same                                                                       | role-match           |
| `server/routes/__tests__/llm-history.test.ts` (NEW)                       | test        | unit (route + Bearer)                                     | `server/routes/__tests__/operator-status.test.ts`                          | exact                |
| `src/components/ui/__tests__/BudgetBlock.test.tsx` (NEW)                  | test        | unit (component, jsdom)                                   | existing `src/components/ui/__tests__/*`                                   | role-match           |
| `server/routes/operator-status.ts` (MOD)                                  | route       | request-response                                          | self — `actorQuality` block `:419-486`                                     | exact (in-file copy) |
| `server/routes/__tests__/operator-status.test.ts` (MOD)                   | test        | contract                                                  | self — extend with Zod `.strict()` `tokenBudget` pin                       | exact                |
| `server/lib/llmProgress.ts` (MOD)                                         | service/lib | —                                                         | self — add `runId?` field + new `RunHistoryEntry`/`CallHistoryEntry` types | exact                |
| `server/lib/llmExtractionPipeline.ts` (MOD)                               | service/lib | event-driven (run boundary)                               | self — `runRefreshExtraction` `:306-311`                                   | exact                |
| `server/lib/freeClaudeRouter.ts` (MOD)                                    | service/lib | event-driven (call writers)                               | self — two callHistory append sites `:520`, `:520` success-region          | exact                |
| `CLAUDE.md` + `docs/architecture/redis-keys.md` (MOD)                     | config/docs | —                                                         | existing `llm:*` / `events:llm-dlq` registry rows                          | exact                |

---

## Pattern Assignments

### `server/lib/llmCallHistory.ts` (NEW — service, event-driven)

**Analog:** `server/lib/llmDLQ.ts` (VERIFIED current source).

**Module head + key constants + degrade-open contract** (`llmDLQ.ts:1-21`):

```typescript
import { redis } from '../cache/redis.js';
import { logger } from './logger.js';
const log = logger.child({ module: 'llm-dlq' }); // → { module: 'llm-call-history' }
export const DLQ_KEY = 'events:llm-dlq'; // → const CALLS_KEY = 'llm:calls:history';
const DLQ_TTL_SEC = 7 * 24 * 3600; // → CALLS_TTL_SEC = 30 * 24 * 3600 (D-02)
const DLQ_MAX = 200; // → CALLS_MAX = 500 (D-02)
```

**parseEntry string-or-object guard — COPY VERBATIM** (`llmDLQ.ts:44-53`, Pitfall 3):

```typescript
function parseEntry(raw: unknown): DLQEntry | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as DLQEntry;
    if (raw && typeof raw === 'object') return raw as DLQEntry;
    return null;
  } catch {
    return null;
  }
}
```

**Bounded-ring WRITE — adapt SADD→LPUSH+LTRIM** (template `llmDLQ.ts:56-87`, RESEARCH Pattern 1):

```typescript
export async function appendCallHistory(entry: CallHistoryEntry): Promise<void> {
  try {
    await redis.lpush(CALLS_KEY, JSON.stringify(entry)); // newest at head
    await redis.ltrim(CALLS_KEY, 0, CALLS_MAX - 1); // native bounded-ring (no custom trim loop)
    await redis.expire(CALLS_KEY, CALLS_TTL_SEC);
  } catch (err) {
    log.warn({ err }, 'callHistory append failed'); // observability-only — NEVER throw (anti-pattern)
  }
}
```

**Bounded-ring READ** (template `llmDLQ.ts:90-102`, RESEARCH Pattern 2):

```typescript
export async function listCallHistory(limit = CALLS_MAX): Promise<CallHistoryEntry[]> {
  try {
    const raw = await redis.lrange(CALLS_KEY, 0, limit - 1);
    return raw.map((r) => parseEntry(r)).filter((x): x is CallHistoryEntry => x !== null);
  } catch {
    return [];
  }
}
```

**Cold-start hydration guard** (RESEARCH Pattern 4; module-level `hydrated` flag, OBS-FLIGHT-06):

```typescript
let callHistoryHydrated = false;
export async function hydrateCallHistoryIfCold(): Promise<void> {
  if (callHistoryHydrated) return;
  callHistoryHydrated = true; // set FIRST — best-effort, never retry-loop
  const fromRedis = await listCallHistory(20);
  if (fromRedis.length > 0 && (llmProgress.callHistory?.length ?? 0) === 0) {
    llmProgress.callHistory = fromRedis.slice(0, 20);
  }
}
```

---

### `server/lib/llmRunHistory.ts` (NEW — service, event-driven lifecycle)

**Analog:** `server/lib/llmDLQ.ts` (bounded list) + GA-2 re-LPUSH-dedupe semantics.

- Reuse the exact `parseEntry`, LPUSH+LTRIM+EXPIRE, degrade-open try/catch from `llmCallHistory.ts` above.
- `RUNS_KEY = 'llm:runs:history'`, `RUNS_MAX = 200`, `RUNS_TTL_SEC = 30 * 24 * 3600` (D-02).
- `openRunRecord({ runId, startedAt })` → LPUSH `{ outcome: 'running', completedAt: null, ... }`.
- `closeRunRecord({ runId, outcome, ... })` → **re-LPUSH** terminal record (NOT LSET-by-index — GA-2 rationale: LTRIM shifts indices, re-LPUSH is append-only and ordering-safe).
- `listRunHistory(limit)` → LRANGE then **dedupe by `runId`, first-wins** (head = newest = terminal):

```typescript
const seen = new Set<string>();
const deduped = parsed.filter((r) => (seen.has(r.runId) ? false : (seen.add(r.runId), true)));
```

- Mirror `hydrateRunHistoryIfCold()` flag pattern from call-history.

**`RunHistoryEntry` shape (define in `llmProgress.ts`, RESEARCH "Run Summary Shape", v3/NIM-adapted — do NOT overload existing `LLMRunSummary:275`):**

```typescript
interface RunHistoryEntry {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  outcome: 'running' | 'completed' | 'watchdog_aborted' | 'breaker_paused' | 'budget_hit' | 'error';
  batchCount: number;
  batchesCompleted: number;
  batchesFailed: number;
  tokenSpend: { nvidia_nim: number }; // D-04 single provider
  evalScore: LLMPipelineProgress['evalScore'];
  dlqDelta: number;
  watchdogTimeouts: number;
  durationMs: number;
  pipelineVersion: 'v3'; // D-04 fixed
}
```

---

### `server/routes/events/llm-history.ts` (NEW — route, Bearer-gated read)

**Analog:** `server/routes/events.ts:384` `/llm-status` registration (VERIFIED: `eventsRouter.get('/llm-status', dashboardAuth, ...)`, import `dashboardAuth` from `'../middleware/dashboardAuth.js'` at `:41`).

**Registration + hydrate-on-cold + clamp + filter** (RESEARCH Code Example; V5 input-validation clamp):

```typescript
eventsRouter.get('/llm-history', dashboardAuth, async (req, res) => {
  await hydrateCallHistoryIfCold(); // OBS-FLIGHT-06
  await hydrateRunHistoryIfCold();
  const limit = Math.min(Number(req.query.limit) || 200, 500); // clamp ≤ LTRIM cap (DoS)
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined; // typeof guard — NEVER a Redis key
  const runs = await listRunHistory(limit);
  let calls = await listCallHistory(limit);
  if (runId) calls = calls.filter((c) => c.runId === runId);
  res.json({ runs, calls });
});
```

**Bearer semantics** inherited from `dashboardAuth` middleware (constant-time `timingSafeEqual`; prod-empty→503, bad→401, dev→bypass) — do NOT hand-roll.

---

### `server/components/ui/BudgetBlock.tsx` (NEW — component)

**Analog:** `DevApiStatus.tsx` actorQuality render gate (`:1681`) + `ProgressBar` (`:100-121`) + `STATUS_PILL_CLASSES` (`:810`).

**Render gate (degrade-open — VERIFIED `:1681`):**

```tsx
{
  opStatus?.tokenBudget != null && (
    <div className="mt-2 border-t border-white/10 pt-2">
      {' '}
      {/* locked section idiom */}
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        TOKEN BUDGET
      </div>
      {/* ... */}
    </div>
  );
}
```

**ProgressBar — REUSE the existing `:100-121` component** (h-1 rounded-full track `bg-white/10`, `tabular-nums` pct). For the budget proximity bar pass `barColor` from the semantic band (green `<0.8` / yellow `<0.95` / red `≥0.95` per UI-SPEC). Overlay soft/hard ticks as 1px `bg-white/30` vertical marks.

**Color discipline (CLAUDE.md + UI-SPEC §Color):** ONLY `--color-accent-{blue,red,green,yellow}` + `white/N` ramp. NO entity colors. Tailwind utilities `text-accent-red` / `bg-accent-green/20` etc. matching `STATUS_PILL_CLASSES:811-814`.

**Pitfall 2 caveat:** `getDailyTokens('nvidia_nim')` is likely 0 in the v3 path (counter dormant). BudgetBlock will render `0/1000000 (ok)` — HONEST. cost-shadow USD is the live signal. (Open Q1 — planner picks `used` source.)

---

### `src/components/ui/FlightRecorderBlock.tsx` (NEW — component, drill-down)

**Analog:** `DevApiStatus.tsx` `fetchOpStatus` fetch idiom (`:938-961`), expandable-row pattern, `STATUS_PILL_CLASSES` badges, modal/copy-panel for Level 3.

**Bearer fetch + degrade-open** (mirror `fetchOpStatus:938`):

```tsx
const res = await fetch('/api/events/llm-history', { headers: { ...dashboardAuthHeaders() } });
if (!res.ok) return; // non-200 → block hides (degrade-open)
const data = (await res.json()) as { runs: RunHistoryEntry[]; calls: CallHistoryEntry[] };
```

**Three-level local-state drill-down** (UI-SPEC §B): run-list → `selectedRunId` inline expand → call-list (filter `runId`) → `selectedCall` Level-3 prompt/response reusing the existing copyable modal idiom. Outcome badges via `STATUS_PILL_CLASSES` semantics (running=blue, success=green, partial=yellow, timeout/error=red). Batch bar reuses `ProgressBar`. Relative time via host `formatAge`/`freshnessText`.

---

### `server/routes/operator-status.ts` (MOD — add `tokenBudget` block)

**Analog (in-file):** the `actorQuality` degrade-open block `:419-486` (VERIFIED). **Copy the try/catch → null → `res.json` shape verbatim** (RESEARCH Pattern 3).

**Insertion point:** new `let tokenBudget ... try {...} catch {...}` block immediately before the final `res.json` at `:486`, and extend that line:

```typescript
res.json({ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget }); // was :486 — add tokenBudget
```

**Block body** reads `getDailyTokens('nvidia_nim')` + `DAILY_LIMITS.nvidia_nim` + `budgetState(...)` from `llmTokenBudget.ts` (no new math), HGETALL `events:llm-cost-shadow:v3:${todayKey()}`, microcents/1e6. Shape = GA-4 provider-keyed map:

```typescript
{ providers: { nvidia_nim: { used, cap, soft, hard, state } }, costShadow: { tokensIn, tokensOut, usd } }
```

Recommend exporting `SOFT_CAP_RATIO`/`HARD_CAP_RATIO` from `llmTokenBudget.ts:50-51` (currently module-private) to avoid magic-number drift. Coerce HSET fields with `Number(x) || 0` (A4).

---

### `server/routes/__tests__/operator-status.test.ts` (MOD — BUDGET-04 Zod `.strict()` pin)

**Analog (in-file):** existing structure (VERIFIED `:1-70`) — `vi.mock('../../cache/redis.js', ...)` with `mockRedis = { smembers, get, scan }`, `makeApp()` mounting `operatorStatusRouter`, Bearer 401/200 test. **Extend `mockRedis` with `hgetall`** for the tokenBudget cost-shadow read. Add `it('tokenBudget Zod .strict() pin', ...)` asserting the GA-4 shape rejects extra keys, plus a degrade-open test (redis throw → `tokenBudget === null`, route 200). Path is `server/routes/__tests__/operator-status.test.ts` (Pitfall 6 — NOT `server/__tests__/routes/...`).

---

### `server/lib/llmProgress.ts` (MOD — add `runId` + new types)

**Analog (in-file):** the `llm:lastProgress` write-through (`resetProgress:534-548`, `updateProgress:554-587`, VERIFIED). Add `runId?: string` to `LLMPipelineProgress` and to `INITIAL_PROGRESS`. Define new `RunHistoryEntry` + `CallHistoryEntry` interfaces here (do NOT overload `LLMRunSummary:275` — different artifact per RESEARCH). `CallHistoryEntry` = current callHistory row fields (`provider, model, tokensIn, tokensOut, durationMs, ok, batchSize, timestamp, retryAfterMs?`) + `runId` + `batchIndex` (D-02).

---

### `server/lib/llmExtractionPipeline.ts` (MOD — GA-2 run boundary)

**Analog (in-file):** `runRefreshExtraction` `safeWaitUntil` IIFE at `:306-311` (VERIFIED location, RESEARCH CORRECTION — NOT `withBatchWatchdog`). After `resetProgress()`: `const runId = crypto.randomUUID();` → `updateProgress({ ..., runId })` → `await openRunRecord(...)`. Close the record at all five exit branches (no-groups :338, paused :356, null-extraction :393, success :465, catch :475) mapped to outcomes — prefer a `finally` close where structurally possible (Open Q3). **Do NOT touch `withBatchWatchdog`** (Pitfall 1; it is deliberately dependency-free).

---

### `server/lib/freeClaudeRouter.ts` (MOD — stamp runId on call entries + dual-write)

**Analog (in-file):** the two callHistory append sites (VERIFIED: failure-path `updateProgress({ callHistory: [...] })` at `:519-535`; success path `return` at `:485` region where `accrueShadowCost:467` already fires). On each entry add `runId: llmProgress.runId` + `batchIndex: opts.batchIndex` and `void appendCallHistory(entry)` (degrade-open dual-write to `llm:calls:history`). **Pitfall 4: do NOT add a second `record(p.name,'err')`** — the single per-call breaker recording at `:481` is unchanged. Thread `batchIndex` from `processEventGroupsV3` → `callLLM` opts (Open Q2 / A3; fall back to `-1` if unavailable).

---

### `CLAUDE.md` + `docs/architecture/redis-keys.md` (MOD — register 2 keys)

**Analog:** existing `events:llm-dlq` bullet in CLAUDE.md §"Active Redis keys" + the `llm:*` rows in `redis-keys.md`. **Drift gate `src/__tests__/lib/redis-registry.test.ts` requires 3-surface parity** (backticked key in CLAUDE.md subsection + backticked key in a redis-keys.md table row + string literal in non-test `.ts`). Both keys static (no `{...}` placeholder) → verbatim in all three. redis-keys.md row format (RESEARCH §"EXACT registration format"):

```
| `llm:calls:history` | <writer file:line> | <reader + /api/events/llm-history> | 30d (LTRIM 500) | JSON CallHistoryEntry[] | <purpose> | ≤500 (capped) | observability |
| `llm:runs:history`  | <writer file:line> | <reader + /api/events/llm-history> | 30d (LTRIM 200) | JSON RunHistoryEntry[]  | <purpose> | ≤200 (capped) | observability |
```

---

## Shared Patterns

### Bounded Redis ring (LPUSH + LTRIM + EXPIRE)

**Source:** `server/lib/llmDLQ.ts:56-102` (SADD variant → LPUSH for ordered ring).
**Apply to:** `llmCallHistory.ts`, `llmRunHistory.ts`. Native LTRIM eviction — never a custom trim loop.

### Upstash dual-shape parse (`parseEntry`)

**Source:** `server/lib/llmDLQ.ts:44-53` (VERIFIED). **Apply to:** every list read in both new lib modules + hydration. Upstash REST may auto-deserialize members → `JSON.parse` alone throws (Pitfall 3).

### Degrade-open (observability never throws / route stays 200)

**Source:** `operator-status.ts:419-484` actorQuality try/catch → `null`; `llmDLQ.ts` every redis call try/caught; `accrueShadowCost`. **Apply to:** every Redis read in `tokenBudget` block, both history modules, `/llm-history` route, both UI blocks (non-200 → hide).

### Cold-start write-through / hydration

**Source:** `llmProgress.ts:534-587` `cacheSetSafe(LLM_LASTPROGRESS_KEY, ...)`. **Apply to:** `hydrateCallHistoryIfCold` / `hydrateRunHistoryIfCold` (module-level `hydrated` flag, set-first; OBS-FLIGHT-06, D-05).

### Bearer gate (reads)

**Source:** `events.ts:384` `dashboardAuth` middleware; `operator-status.ts` precedent. **Apply to:** `/llm-history`. Client side: `dashboardAuthHeaders()` (`src/lib/dashboardAuth.ts`) — used by `fetchOpStatus:941`.

### UI render idioms (host-locked)

**Source:** `DevApiStatus.tsx` `ProgressBar:100`, `STATUS_PILL_CLASSES:810`, `TIER_BORDER_CLASSES:817`, actorQuality render gate `:1681`, `fetchOpStatus:938`. **Apply to:** both new blocks. Dense console scale, `font-mono text-[10px]`, `tabular-nums`, accent-as-status only (UI-SPEC).

---

## No Analog Found

None. Every artifact has a strong in-repo analog — this is a ~95% wiring-existing-primitives phase (RESEARCH). The only genuinely new logic is `runId` generation/threading + run-record open/close lifecycle, both modeled on existing write-through + bounded-list idioms.

---

## Metadata

**Analog search scope:** `server/lib/`, `server/routes/`, `server/routes/__tests__/`, `src/components/ui/`, `src/__tests__/lib/`.
**Files scanned (read or grepped):** `llmDLQ.ts`, `operator-status.ts`, `operator-status.test.ts`, `llmProgress.ts`, `llmTokenBudget.ts`, `freeClaudeRouter.ts`, `events.ts`, `DevApiStatus.tsx`.
**Key inherited from RESEARCH:** runId boundary = `runRefreshExtraction` (NOT watchdog); contract-test path = `server/routes/__tests__/operator-status.test.ts`; do not overload `LLMRunSummary:275`.
**Pattern extraction date:** 2026-06-04
