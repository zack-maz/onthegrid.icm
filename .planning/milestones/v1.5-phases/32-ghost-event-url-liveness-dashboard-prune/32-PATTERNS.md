# Phase 32: Ghost Event URL Liveness, Dashboard & Prune — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 21 (new + modified)
**Analogs found:** 19 / 21 (2 files are net-new patterns — noted in §No Analog Found)

---

## File Classification

| New/Modified File                                           | Role                             | Data Flow                | Closest Analog                                                                           | Match Quality          |
| ----------------------------------------------------------- | -------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------- |
| `server/lib/urlLiveness.ts`                                 | service (probe + schema + sweep) | request-response + batch | `server/adapters/nominatim.ts` (fetch+timeout) + `server/lib/concurrencyLimit.ts` (FIFO) | role-match (composite) |
| `server/lib/pruneQuota.ts`                                  | service (quota counter)          | CRUD                     | `server/lib/replayQuota.ts`                                                              | exact                  |
| `server/lib/pruneDeadUrlEvents.ts`                          | service (helper)                 | CRUD                     | `server/lib/operatorAudit.ts` (SADD bounded write pattern)                               | role-match             |
| `server/routes/events.ts` (add prune route)                 | controller (operator endpoint)   | request-response         | `server/routes/events.ts:437-509` (`/llm-replay` handler)                                | exact                  |
| `server/routes/cron-refresh-events.ts` (extend)             | controller (cron handler)        | batch                    | `server/routes/refresh-events-cron.ts` (existing cron handler)                           | exact                  |
| `server/routes/operator-status.ts` (extend)                 | controller (aggregator)          | request-response         | `server/routes/operator-status.ts:77-154` (existing aggregator)                          | exact                  |
| `src/components/ui/DevApiStatus.tsx` (extend)               | component (operator UI)          | request-response         | `src/components/ui/DevApiStatus.tsx:1540-1549` (`replayProbe` + button)                  | exact                  |
| `server/__tests__/lib/urlLiveness.schema.test.ts`           | test (schema contract)           | —                        | `server/__tests__/scripts/snapshot-cron-watch.test.ts`                                   | role-match             |
| `src/__tests__/lib/urlLiveness.schema.test.ts`              | test (shim)                      | —                        | `server/__tests__/scripts/snapshot-cron-watch.test.ts`                                   | partial                |
| `server/__tests__/lib/urlLiveness.probe.test.ts`            | test (unit, mocked-fetch)        | —                        | `server/__tests__/lib/freeClaudeRouter.test.ts` (mock matrix)                            | role-match             |
| `server/__tests__/lib/urlLiveness.sweep.test.ts`            | test (unit, concurrency)         | —                        | `server/__tests__/lib/freeClaudeRouter.test.ts`                                          | role-match             |
| `server/__tests__/lib/urlLiveness.cronPrune.test.ts`        | test (unit)                      | —                        | `server/__tests__/lib/llmTokenBudget.test.ts`                                            | role-match             |
| `server/__tests__/lib/pruneQuota.test.ts`                   | test (quota)                     | —                        | `server/__tests__/routes/events.replayQuota.test.ts`                                     | exact                  |
| `server/__tests__/routes/events.prune.test.ts`              | test (integration)               | —                        | `server/__tests__/routes/events.replayQuota.test.ts`                                     | exact                  |
| `server/__tests__/routes/refresh-events-cron.prune.test.ts` | test (integration)               | —                        | `server/__tests__/routes/refresh-events-cron.test.ts`                                    | exact                  |
| `src/__tests__/components/DevApiStatus.prune.test.tsx`      | test (jsdom)                     | —                        | `src/__tests__/DevApiStatusV3.test.tsx`                                                  | role-match             |
| `server/__tests__/routes/operator-status.test.ts` (extend)  | test (integration)               | —                        | existing file (extend)                                                                   | exact                  |
| `server/__tests__/resilience/redis-death.test.ts` (extend)  | test (chaos)                     | —                        | existing file (extend)                                                                   | exact                  |
| `CLAUDE.md` §"Serverless Cache" (extend)                    | docs                             | —                        | existing CLAUDE.md entries                                                               | exact                  |

---

## Pattern Assignments

---

## Layer: Server-Side Library Code (New)

---

### `server/lib/urlLiveness.ts` (service, batch + request-response)

**Purpose:** Composite module — Zod schema + tiered TTL + single-URL probe (`probeUrl`) + multi-event sweep orchestrator (`runProbeSweep`) + sidecar count maintenance. Phase 32 builds everything into one module (per RESEARCH recommended project structure line 202-205).

**Analog 1 (probe fetch+timeout):** `server/adapters/nominatim.ts:20-29`

**Imports pattern** (nominatim:1-3 + logger shape from any lib file):

```typescript
// @vitest-environment node is NOT needed in the lib file — tests carry it
import { createLimit } from './concurrencyLimit.js';
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { logger } from './logger.js';
import { z } from 'zod';
```

**fetch-with-timeout pattern** (nominatim.ts:20-29 — confirmed):

```typescript
// nominatim.ts:20-29 is the template for fetchOnce():
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
// Phase 32 DIVERGES: sets `redirect: 'manual'` (D-17) so redirect hops are
// counted by urlLiveness.ts itself, not by fetch. nominatim does NOT do this.
// Phase 32 also adds GET-with-Range fallback on 405 (D-16) — not in nominatim.
```

**Analog 2 (concurrency bound):** `server/lib/concurrencyLimit.ts:35-75`

**createLimit API** (confirmed from reading the file):

- `createLimit(maxConcurrent: number): LimitWrapper`
- `LimitWrapper = <T>(fn: () => Promise<T>) => Promise<T>`
- FIFO ordering; error propagates through the returned Promise (no swallowing)
- Throws on `maxConcurrent < 1` or non-integer

**Core sweep pattern** (from concurrencyLimit.ts usage + RESEARCH Pattern 1):

```typescript
// Mirrors server/lib/llmEventExtractor.v3.ts (createLimit usage for batches)
const limit = createLimit(8); // D-18 concurrency bound
const tasks = candidates.map(({ eventId, url }) =>
  limit(async () => {
    if (Date.now() > opts.deadlineMs) {
      skippedBudget++;
      return;
    }
    const host = new URL(url).hostname;
    await waitForHostSlot(host); // per-host 1 req/s (D-18)
    const result = await probeUrl(url);
    await persistLiveness(eventId, url, result);
    probed++;
  }),
);
await Promise.all(tasks);
```

**Logger child pattern** (from any existing lib file, e.g. operatorAudit.ts:31):

```typescript
const log = logger.child({ module: 'urlLiveness' });
```

**Zod schema pattern** (snapshot-cron-watch.ts:85-110 shape):

```typescript
// Use z.object({...}).strict() — extra keys THROW (contract-pinning purpose).
// Mirrors WatchRowSchema / WatchLogSchema in snapshot-cron-watch.ts.
export const UrlLivenessSchema = z
  .object({
    status: z.enum(['live', '404', '403', 'dead-host', 'unknown']),
    lastProbedAt: z.string().datetime(),
    attemptCount: z.number().int().nonnegative(),
    lastUrlProbed: z.string().url(),
    lastHttpStatus: z.number().int().nullable(),
  })
  .strict();
export type UrlLiveness = z.infer<typeof UrlLivenessSchema>;
```

**cacheSetSafe pattern** (redis.ts:234-242 — confirmed):

```typescript
// Every probe write goes through cacheSetSafe — NEVER redis.set directly.
// Rationale: redis.ts:238 has the 2s REDIS_OP_TIMEOUT_MS guard; chaos test
// (redis-death.test.ts:185-203) mocks the unsafe wrappers to throw and proves
// cacheGetSafe/cacheSetSafe catch it. Direct redis.set bypasses the guard.
await cacheSetSafe(
  `events:url-liveness:${eventId}`,
  entry satisfies UrlLiveness,
  ttlSecForStatus(entry.status),
);
```

**Sidecar count key pattern** (RESEARCH Pitfall 3 — no existing codebase analog for INCR/DECR):

```typescript
// The sidecar INCR/DECR is NOT covered by cacheSetSafe (RESEARCH Pitfall 6 note).
// Wrap raw redis.incr/redis.decr in try/catch. Floor at 0 after DECR.
try {
  if (wasDeadBeforeAndNowLive) await redis.decr('events:url-liveness-count');
  if (wasNotDeadAndNowDead) await redis.incr('events:url-liveness-count');
} catch {
  /* degrade-open: stale count is acceptable */
}
```

**SSRF guard pattern** (RESEARCH Security §"SSRF via stored URL"):

```typescript
// Add BEFORE any fetch call. Defense-in-depth per ASVS V11.
const PRIVATE_HOST_REGEX =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|fc|fd)/i;
function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_REGEX.test(hostname);
}
// In probeUrl: if (isPrivateHost(new URL(url).hostname)) return { status: 'unknown', ... }
```

**Named exports pattern** (follows any lib module — no default export):

- Export: `UrlLivenessSchema`, `UrlLivenessStatus`, `UrlLiveness` (type), `ttlSecForStatus`, `probeUrl`, `runProbeSweep`, `pruneDeadUrlEvents`, `URL_LIVENESS_KEY_PREFIX`, `URL_LIVENESS_COUNT_KEY`
- No default export — matches `concurrencyLimit.ts` (named only), `operatorAudit.ts` (named only)

**Pattern dimensions to clone from nominatim.ts:**

- `fetchWithTimeout` shape: `AbortController` + `clearTimeout` in `finally`
- Returns `null` on catch (not throw) — callers check for null
- `const timer = setTimeout(...)` with `clearTimeout(timer)` in finally

**Pattern dimensions to DIVERGE from nominatim.ts:**

- nominatim uses `redirect: 'follow'` (default); urlLiveness uses `redirect: 'manual'` (D-17)
- nominatim retries on some errors; urlLiveness has NO retry (D-18 explicit: "NO retry on transient")
- nominatim reads `NOMINATIM_FETCH_TIMEOUT_MS` env var; urlLiveness hardcodes `10_000` (D-18)

**Pattern dimensions to clone from concurrencyLimit.ts:**

- `createLimit(8)` instantiation in module scope or inside `runProbeSweep`
- Each `limit(async () => {...})` task returns a Promise; `Promise.all(tasks)` at the end
- Error propagation: task errors surface through the returned Promise (no swallowing inside the limit wrapper itself)

---

### `server/lib/pruneQuota.ts` (service, CRUD)

**Analog:** `server/lib/replayQuota.ts` (exact clone, key namespace change only)

**Confirmed from reading replayQuota.ts:1-87:**

**Full structure to clone:**

```typescript
// replayQuota.ts LINES 1-87 — clone verbatim, changing:
//   QUOTA_KEY_PREFIX = 'operator:prune-quota:'    (was 'operator:replay-quota:')
//   export interface PruneQuotaResult              (was ReplayQuotaResult)
//   export async function checkPruneQuota(...)     (was checkReplayQuota)
//   JSDoc: reference D-15, "prune-dead-urls" endpoint, "mirrors replayQuota.ts"
//
// ALL other values identical:
//   const CAP = 50;                 // D-15 — same 50/24h ceiling
//   const QUOTA_TTL_SEC = 48 * 3600; // 48h sliding TTL
//   INCR-then-EXPIRE-on-first idiom identical
//   UTC midnight reset calculation identical
//   ReturnType identical (allowed, used, cap, resetsAt, retryAfterSeconds)
```

**Lazy import pattern** (replayQuota.ts:61):

```typescript
// replayQuota.ts uses `await import('../cache/redis.js')` inside the function
// (not at top-level) so vi.mock in tests applies consistently.
// pruneQuota.ts must follow the SAME pattern.
const { redis } = await import('../cache/redis.js');
```

**Naming convention:** `checkPruneQuota` (mirrors `checkReplayQuota`). Return type `PruneQuotaResult` (mirrors `ReplayQuotaResult`).

**Pattern dimensions to DIVERGE from replayQuota.ts:**

- Key prefix changes from `'operator:replay-quota:'` to `'operator:prune-quota:'`
- All JSDoc references updated from "replay" to "prune"
- There is NO other behavioral divergence — this is intentional by D-15 ("Consistency-with-existing-pattern wins")

---

### `server/lib/pruneDeadUrlEvents.ts` (service helper, CRUD)

**Analog:** `server/lib/operatorAudit.ts:75-113` (SADD bounded-set write) + `server/routes/events.ts:467-477` (Redis read-then-splice pattern)

**Core operation sequence** (from RESEARCH Architecture Diagram lines 159-175):

```typescript
// 1. Read all url-liveness keys (SCAN or batch cacheGetSafe)
// 2. Filter: status in ['404', '403', 'dead-host'] AND
//            (trigger === 'manual' OR attemptCount >= 3)  ← D-12 gate
// 3. Read events:llm:v3 array (cacheGetSafe)
// 4. Splice matching eventIds out of array
// 5. cacheSetSafe('events:llm:v3', spliced, LLM_REDIS_TTL_SEC)  ← D-13
// 6. redis.del(...liveness keys for pruned IDs)                  ← D-13
// 7. try { redis.decr or decrby on count key } catch { }         ← Pitfall 3/6
// 8. appendOperatorAuditEntry({...})                             ← D-14
// Return: { prunedCount: number, prunedIds: string[] }
```

**Import pattern:**

```typescript
import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';
import { appendOperatorAuditEntry } from './operatorAudit.js';
import { logger } from './logger.js';
import type { UrlLiveness } from './urlLiveness.js';
```

**Error handling pattern** (mirrors operatorAudit.ts degrade-open):

```typescript
// Best-effort: never throw from pruneDeadUrlEvents itself.
// Errors are logged; caller (endpoint) wraps in try/catch for 503.
// appendOperatorAuditEntry already degrades-open (operatorAudit.ts:109-112).
```

**Audit entry shape** (operatorAudit.ts:43-57, widened per RESEARCH):

```typescript
// OperatorAuditEntry.operation union MUST be widened in operatorAudit.ts:49:
//   operation: 'pipeline-swap' | 'replay' | 'prune-dead-urls'
// Stash prunedCount + prunedIds in args (path b from RESEARCH Common Op 2):
await appendOperatorAuditEntry({
  timestamp: Date.now(),
  bearerFingerprint: trigger === 'cron' ? 'cron:refresh-events' : fingerprint,
  operation: 'prune-dead-urls',
  args: { trigger, prunedCount, prunedIds },
  result: 'ok',
});
```

**Naming convention:**

- Export: `pruneDeadUrlEvents(opts: { trigger: 'manual' | 'cron'; fingerprint?: string }): Promise<{ prunedCount: number; prunedIds: string[] }>`
- Module-level `const log = logger.child({ module: 'pruneDeadUrlEvents' })`
- No default export

**Pattern dimensions to DIVERGE from operatorAudit.ts:**

- operatorAudit never reads or mutates `events:llm:v3` — pruneDeadUrlEvents does both
- The GET→splice→SET race (RESEARCH Pitfall 4) must be documented in JSDoc; mutex is optional (planner picks, recommended: skip for v1)

---

## Layer: Server-Side Route Code (New + Modified)

---

### `server/routes/events.ts` — add `POST /api/events/prune-dead-urls` (controller, request-response)

**Analog:** `server/routes/events.ts:436-509` — the existing `POST /api/events/llm-replay/:groupKey` handler (same file, ~70 lines down)

**Confirmed imports already in the file** (grep output lines 24-34):

```typescript
import { appendOperatorAuditEntry, bearerFingerprint } from '../lib/operatorAudit.js';
import { checkReplayQuota } from '../lib/replayQuota.js';
import { dashboardAuth } from '../middleware/dashboardAuth.js';
```

**New imports to add:**

```typescript
import { pruneDeadUrlEvents } from '../lib/pruneDeadUrlEvents.js';
import { checkPruneQuota } from '../lib/pruneQuota.js';
```

**Handler structure** (mirrors llm-replay at events.ts:437-509):

```typescript
// Pattern from events.ts:436-438 — wrap in a block, always register (not conditional):
{
  eventsRouter.post('/prune-dead-urls', dashboardAuth, async (req, res) => {
    const trigger = req.body?.trigger === 'cron' ? 'cron' : 'manual';
    const fingerprint = bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '');

    // Quota check — cron bypass (D-15)
    if (trigger !== 'cron') {
      const quota = await checkPruneQuota(fingerprint);
      if (!quota.allowed) {
        res.set('Retry-After', String(quota.retryAfterSeconds));
        return res.status(429).json({
          error: 'prune_quota_exceeded',
          message: `Prune quota reached: ${quota.cap} of ${quota.cap} in last 24h.`,
          resetsAt: quota.resetsAt,
        });
      }
    }

    try {
      const result = await pruneDeadUrlEvents({ trigger, fingerprint });
      return res.json(result);
    } catch (err) {
      return res.status(503).json({ error: 'prune_failed', detail: String(err).slice(0, 200) });
    }
  });
}
```

**Key pattern differences vs llm-replay:**

- llm-replay is `POST /llm-replay/:groupKey` (parameterized); prune is `POST /prune-dead-urls` (no param)
- llm-replay triggers LLM extraction (expensive, NOT retried on 429); prune calls Redis-backed helper
- llm-replay returns 500 on extraction failure (events.ts:504); prune returns **503** (never 500) per chaos-test contract
- llm-replay has `appendOperatorAuditEntry` inline; prune delegates to `pruneDeadUrlEvents` helper which calls it internally
- Cron `trigger: 'cron'` BYPASSES quota (D-15); llm-replay has no cron bypass concept

**Pattern dimensions to clone:**

- `{...eventsRouter.post(..., dashboardAuth, async (req, res) => {...})}` block structure (events.ts:436)
- `bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '')` fingerprint derivation (events.ts:454)
- `checkReplayQuota` → `checkPruneQuota` pattern (events.ts:455-462)
- `res.set('Retry-After', ...)` + `res.status(429).json(...)` body shape (events.ts:457-463)
- Audit entry written BEFORE responding (events.ts:490-500 comment) — but here, delegated to helper

**Pattern dimensions to DIVERGE:**

- Error response is 503 not 500 (chaos test requires `200 | 503`, never `500`)
- No `:groupKey` param
- `req.body?.trigger` whitelist (not `req.params.groupKey`)
- Audit entry lives inside `pruneDeadUrlEvents` (not inline in the route handler)

---

### `server/routes/cron-refresh-events.ts` — extend (cron, batch)

**Analog:** Existing handler at `/Users/zackmaz/Desktop/otg-iran-monitor/server/routes/cron-refresh-events.ts` (the cron route that calls `runRefreshExtraction`)

**Extension point** (RESEARCH line 869):

- Extend `runRefreshExtraction()` in `server/lib/llmExtractionPipeline.ts` with optional post-extraction steps, OR add sequential calls in the cron handler after `runRefreshExtraction` resolves inside the `safeWaitUntil` body
- **Recommended path** (RESEARCH Discretion §3): extend the existing `safeWaitUntil` IIFE body in `llmExtractionPipeline.ts:258-444` — keeps the `safeWaitUntil` envelope intact, easier to test via existing cron mock pattern

**safeWaitUntil contract** (safeWaitUntil.ts:63 — confirmed):

```typescript
// safeWaitUntil takes Promise<unknown>, returns void — NEVER await it.
// The cron handler already wraps runRefreshExtraction in safeWaitUntil.
// The probe sweep + prune run INSIDE that same promise, sequentially AFTER
// runRefreshExtraction resolves. No second safeWaitUntil call needed.
safeWaitUntil(
  (async () => {
    await runRefreshExtraction(opts); // existing
    // === PHASE 32 ADDITIONS ===
    const deadline = cronStart + 800_000 - 60_000; // SAFETY_MARGIN_MS=60s
    const { probed, skippedBudget } = await runProbeSweep({
      eventIdsWithUrls: await buildProbeCandidates(),
      deadlineMs: deadline,
    });
    log.info({ probed, skippedBudget }, 'probe sweep complete');
    if (Date.now() < deadline) {
      const pruneResult = await pruneDeadUrlEvents({ trigger: 'cron' });
      log.info(pruneResult, 'cron auto-prune complete');
    }
  })(),
);
```

**cron.lastTick write pattern** (RESEARCH CONTEXT:147):

```
// Per CLAUDE.md §Redis: `:refresh-events` cron tick key writes ONLY AFTER
// runRefreshExtraction resolves. Phase 32 must NOT move this write
// earlier. The cron:lastTick:refresh-events sentinel signals "run complete",
// not "run started".
```

**Pattern dimensions to clone from existing cron handler:**

- `timingSafeEqual` on `CRON_SECRET` (Bearer gate for cron — same as existing)
- `log = logger.child({ module: 'cronRefreshEvents' })` shape
- `cooldown` + `?force=true` bypass logic (existing; Phase 32 adds AFTER extraction only)
- `res.json({ dispatched, reason, ... })` response (existing; Phase 32 extends result fields)

**Pattern dimensions to DIVERGE:**

- Phase 32 adds wall-clock deadline plumbing: `const cronStart = Date.now()` at handler entry
- Phase 32 passes `deadlineMs` to `runProbeSweep` — existing extraction does not have a deadline parameter

---

### `server/routes/operator-status.ts` — extend (aggregator, request-response)

**Analog:** `server/routes/operator-status.ts:77-154` (entire existing file — extend the GET handler)

**Current response shape** (operator-status.ts:148 — confirmed):

```typescript
res.json({ audit24h, byBearer, advEval });
```

**Extended response shape** (D-14, D-23):

```typescript
res.json({ audit24h, byBearer, advEval, prune });
//                                       ^^^^ new sibling block
```

**prune block construction pattern** (mirrors advEval pattern at operator-status.ts:131-145):

```typescript
// Read sidecar count key (O(1) per Pitfall 3 mitigation):
let deadUrlCount = 0;
try {
  const raw = await redis.get<number | string>('events:url-liveness-count');
  deadUrlCount = Math.max(0, Number(raw) || 0);
} catch (err) {
  log.warn({ err }, 'failed to read events:url-liveness-count');
}

// Derive last24hPrunes from the same audit-log entries already parsed above:
const last24hPrunes = last24h.filter((e) => e.operation === 'prune-dead-urls').length;

const prune = { deadUrlCount, last24hPrunes };
```

**AuditEntry interface extension** (operator-status.ts:49-53 — confirmed):

```typescript
// Current:
interface AuditEntry {
  timestamp: number;
  bearerFingerprint: string;
  operation: 'pipeline-swap' | 'replay';
}
// After Phase 32:
interface AuditEntry {
  timestamp: number;
  bearerFingerprint: string;
  operation: 'pipeline-swap' | 'replay' | 'prune-dead-urls'; // ← add
}
```

**byBearer aggregator** (operator-status.ts:110-125 — must extend):

```typescript
// Current: cur.swaps / cur.replays
// After Phase 32: also count cur.prunes for prune-dead-urls entries
// Update Map value type + per-bearer result shape.
```

**Pattern dimensions to clone:**

- `try { const raw = await redis.get(...); } catch (err) { log.warn(...); }` error isolation per block
- `|| 0` + `Math.max(0, ...)` defensive coercion for numeric Redis values
- Type guard before use (matches advEval null check at operator-status.ts:135-145)

**Pattern dimensions to DIVERGE:**

- `deadUrlCount` uses `redis.get` directly (not `cacheGetSafe`) because it is an integer scalar, not a `CacheEntry<T>` shape. Tolerate stale count on Redis-death (degrade-open: count returns 0)
- `last24hPrunes` is derived from the already-read `entries` array — no second Redis call

---

## Layer: Frontend UI (Modified)

---

### `src/components/ui/DevApiStatus.tsx` — extend Operator Actions block (component, request-response)

**Analog:** `src/components/ui/DevApiStatus.tsx:1519-1549` (the existing `quotaAlert` block + `replayProbe` button, lines confirmed by read)

**Existing `OperatorStatus` interface** (DevApiStatus.tsx:887-895 — confirmed):

```typescript
interface OperatorStatus {
  audit24h: number;
  byBearer: Array<{
    bearerFingerprint: string;
    actions: number;
    swaps: number;
    replays: number;
  }>;
  advEval: { total: number; blocked: number; leaked: number } | null;
}
```

**Extension** (add `prune` field and update validation guard):

```typescript
interface OperatorStatus {
  // ... existing fields ...
  prune?: { deadUrlCount: number; last24hPrunes: number } | null;
}
// Update validation guard at DevApiStatus.tsx:912-918 to not gate on prune
// (it's optional — older server versions won't return it).
```

**fetchOpStatus pattern** (DevApiStatus.tsx:900-906 — confirmed, mirrors for prune button):

```typescript
// Prune POST call mirrors replayProbe() at DevApiStatus.tsx:983-1001:
const pruneHandler = async (): Promise<void> => {
  try {
    const res = await fetch('/api/events/prune-dead-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
      body: JSON.stringify({ trigger: 'manual' }),
    });
    if (res.status === 429) {
      const body = (await res.json()) as { resetsAt?: string };
      setPruneQuotaAlert({ resetsAt: body.resetsAt ?? '' });
    } else if (res.ok) {
      setPruneQuotaAlert(null);
      void fetchOpStatus(); // refresh count after successful prune
    }
  } catch {
    /* degrade-open */
  }
};
```

**Button render pattern** (mirrors DevApiStatus.tsx:1540-1549):

```tsx
{
  /* Phase 32 — dead-URL count + prune button */
}
{
  opStatus?.prune != null && (
    <>
      <div className="mt-1 text-text-muted" data-testid="dead-url-count">
        Dead URL events: {opStatus.prune.deadUrlCount}
      </div>
      {opStatus.prune.deadUrlCount > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => void pruneHandler()}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="prune-dead-urls-trigger"
          >
            Prune {opStatus.prune.deadUrlCount} dead events
          </button>
        </div>
      )}
    </>
  );
}
{
  pruneQuotaAlert && (
    <div
      className="mb-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-400"
      data-testid="prune-quota-alert"
    >
      Prune quota reached: 50 of 50 in last 24h. Resets at {pruneQuotaAlert.resetsAt}.
    </div>
  );
}
```

**Tailwind className pattern:** Clone exactly from `replayProbe` button (DevApiStatus.tsx:1544-1548): `"rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"`. All spacing uses multiples of 4 per project convention.

**dashboardAuthHeaders import** (DevApiStatus.tsx:8 — already imported):

```typescript
import { shouldRenderDashboard, dashboardAuthHeaders } from '@/lib/dashboardAuth';
// No new import needed for the prune button.
```

**Pattern dimensions to clone:**

- `useState<{ resetsAt: string } | null>(null)` for `pruneQuotaAlert` (mirrors `quotaAlert` at DevApiStatus.tsx:977)
- `data-testid="prune-dead-urls-trigger"` + `data-testid="dead-url-count"` + `data-testid="prune-quota-alert"` (mirrors `replay-test-trigger` + `replay-quota-alert` naming convention)
- `void pruneHandler()` invocation (matches `void replayProbe()` pattern)
- `...dashboardAuthHeaders()` spread in fetch headers (confirmed at DevApiStatus.tsx:989)

**Pattern dimensions to DIVERGE:**

- `replayProbe` button always renders; prune button renders ONLY when `deadUrlCount > 0` (D-10 — operator can only prune when something is flagged dead)
- Button label is dynamic: `Prune {N} dead events` (not static text)
- `fetchOpStatus()` is re-invoked after successful prune to refresh the count — `replayProbe` does NOT refresh `opStatus`

---

## Layer: Test Files (New + Modified)

---

### `server/__tests__/lib/urlLiveness.schema.test.ts` (test, schema contract)

**Analog:** `server/__tests__/scripts/snapshot-cron-watch.test.ts:1-110` (canonical schema-pinning pattern)

**Pattern to clone** (snapshot-cron-watch.test.ts:1-80):

```typescript
// @vitest-environment node            ← line 1, mandatory for server tests
import { describe, it, expect } from 'vitest';
import { UrlLivenessSchema, ttlSecForStatus } from '../../../lib/urlLiveness.js';

describe('Phase 32 urlLiveness schema contract', () => {
  describe('UrlLivenessSchema', () => {
    it('parses a valid live entry', () => {
      // snapshot-cron-watch pattern: construct a validRow() factory
      expect(() => UrlLivenessSchema.parse(validEntry())).not.toThrow();
    });
    it('rejects missing fields (e.g., attemptCount)', () => {
      const { attemptCount: _, ...rest } = validEntry();
      expect(() => UrlLivenessSchema.parse(rest as unknown)).toThrow();
    });
    it('rejects extra keys (strict mode)', () => {
      expect(() => UrlLivenessSchema.parse({ ...validEntry(), extra: true } as unknown)).toThrow();
    });
    it('rejects unknown status value', () => {
      expect(() =>
        UrlLivenessSchema.parse({ ...validEntry(), status: 'gone' } as unknown),
      ).toThrow();
    });
  });

  describe('ttlSecForStatus — D-20 TTL upper bounds', () => {
    it('live ≤ 7 days', () => expect(ttlSecForStatus('live')).toBeLessThanOrEqual(7 * 86400));
    it('404 ≤ 24h', () => expect(ttlSecForStatus('404')).toBeLessThanOrEqual(86400));
    it('403 ≤ 24h', () => expect(ttlSecForStatus('403')).toBeLessThanOrEqual(86400));
    it('dead-host ≤ 24h', () => expect(ttlSecForStatus('dead-host')).toBeLessThanOrEqual(86400));
    it('unknown ≤ 1h', () => expect(ttlSecForStatus('unknown')).toBeLessThanOrEqual(3600));
  });
});
```

**Pattern dimensions to clone:**

- `// @vitest-environment node` on line 1
- `.strict()` schema on the module-under-test (not in the test; test verifies the strictness via extra-key rejection)
- TTL upper-bound assertions (mirrors RESEARCH §Validation Architecture "TTL upper bound per status asserted")
- No mock imports (pure Zod schema + pure function — no Redis, no fetch)

---

### `src/__tests__/lib/urlLiveness.schema.test.ts` (test, CONTEXT D-22 literal-path shim)

**Analog:** None (5-line shim, unique pattern)

**Pattern (RESEARCH Recommendation b)**:

```typescript
// @vitest-environment node
/**
 * D-22 CONTEXT path shim. Canonical schema test lives at
 * server/__tests__/lib/urlLiveness.schema.test.ts.
 * This file satisfies the literal path from CONTEXT D-22 by re-running
 * the same assertions via a cross-boundary import.
 */
import '../../../server/__tests__/lib/urlLiveness.schema.test.js';
// If relative cross-boundary import isn't supported by tsconfig paths,
// duplicate the 5 TTL assertions directly — no other content.
```

**Alternative (if cross-boundary import fails in jsdom):** Duplicate only the 5 TTL assertions from the server canonical test. Do NOT import the Zod schema directly — keep it minimal.

---

### `server/__tests__/lib/urlLiveness.probe.test.ts` (test, mocked-fetch matrix)

**Analog:** `server/__tests__/lib/freeClaudeRouter.test.ts:1-57` (mock matrix setup + vi.hoisted + `// @vitest-environment node`)

**Mock setup pattern** (freeClaudeRouter.test.ts:1-57 — confirmed):

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist fetch mock
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock); // OR: vi.mock('node-fetch', ...) depending on runtime

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn(async () => null),
  cacheSetSafe: vi.fn(async () => {}),
  redis: { get: vi.fn(), incr: vi.fn(), decr: vi.fn() },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
```

**Test cases** (maps to RESEARCH §Validation Architecture test matrix):

- `'live'`: HEAD 200 → `{ status: 'live', httpStatus: 200 }`
- `'404'`: HEAD 404 → `{ status: '404' }`
- `'403'`: HEAD 403 → `{ status: '403' }`
- `'405 → GET 200'`: HEAD 405, GET 200 → `{ status: 'live' }`
- `'redirect chain ≤3'`: HEAD 301 → 301 → 301 → 200 → `{ status: 'live' }`
- `'redirect chain >3'`: 4 hops → `{ status: 'unknown' }`
- `'timeout'`: fetch hangs past 10s (vi.useFakeTimers) → `{ status: 'dead-host' }`
- `'DNS fail'`: fetch throws → `{ status: 'dead-host', httpStatus: null }`
- `'User-Agent'`: assert `'IranMonitor-LinkCheck/1.0'` in `fetch` call headers
- `'SSRF guard'`: `probeUrl('http://localhost/secret')` → `{ status: 'unknown' }`

**Pattern dimensions to clone from freeClaudeRouter.test.ts:**

- `vi.useFakeTimers()` / `vi.useRealTimers()` in `beforeEach`/`afterEach` for timeout tests
- `vi.mock` hoisted before dynamic imports
- `const { callLLM } = await import('../../lib/...')` — dynamic import AFTER mocks registered

---

### `server/__tests__/lib/urlLiveness.sweep.test.ts` (test, concurrency + throttle)

**Analog:** `server/__tests__/lib/freeClaudeRouter.test.ts` (vi.hoisted + parallel async test pattern) + `server/__tests__/lib/llmTokenBudget.test.ts` (Redis mock + `// @vitest-environment node`)

**Key test cases:**

- `createLimit(8)` bound: fire 16 probe tasks simultaneously; assert no more than 8 active concurrently (use a counter incremented inside the task, asserting `max === 8`)
- Per-host 1s throttle: two events sharing the same hostname; assert second probe fires ≥ 900ms after first (vi.useFakeTimers)
- Deadline-skip: `deadlineMs = Date.now()` (already elapsed); assert all tasks increment `skippedBudget`, none call fetch
- Sweep priority: events with no liveness key get sorted before events with old `lastProbedAt` (unit test on the sort function, not the full sweep)

**vi.useFakeTimers pattern** (freeClaudeRouter.test.ts:80):

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
// For per-host throttle test: vi.advanceTimersByTime(1100) to simulate 1.1s elapsed
```

---

### `server/__tests__/lib/urlLiveness.cronPrune.test.ts` (test, unit)

**Analog:** `server/__tests__/lib/llmTokenBudget.test.ts:1-60` (Redis mock + `// @vitest-environment node` + module-under-test tests without HTTP)

**Key test cases:**

- `attemptCount >= 3 gate`: event with `attemptCount: 2` and `status: '404'` NOT pruned by cron call
- `attemptCount >= 3 gate`: event with `attemptCount: 3` and `status: '404'` IS pruned by cron call
- `manual bypass gate`: event with `attemptCount: 1` and `status: '404'` IS pruned by manual trigger
- `unknown status NOT pruned`: event with `status: 'unknown'` and `attemptCount: 5` NOT pruned (D-07)
- `live status NOT pruned`: event with `status: 'live'` never pruned regardless of attemptCount

**Redis mock pattern** (llmTokenBudget.test.ts:3-33):

```typescript
vi.mock('../../cache/redis.js', () => {
  const getMock = vi.fn();
  const setMock = vi.fn();
  const delMock = vi.fn();
  return { redis: { get: getMock, set: setMock, del: delMock }, cacheGetSafe: ..., cacheSetSafe: ... };
});
```

---

### `server/__tests__/lib/pruneQuota.test.ts` (test, quota)

**Analog:** `server/__tests__/routes/events.replayQuota.test.ts:1-416` (exact structural clone)

**This test is a near-verbatim clone.** Key differences:

- Import `checkPruneQuota` instead of going through the HTTP route
- Key prefix is `operator:prune-quota:` (not `operator:replay-quota:`)
- Test 5 (Pitfall 6 — no events:llm:v3 write) is NOT applicable; omit it
- All quota behaviors (INCR, 50-cap, 51st → allowed:false, Retry-After, UTC midnight reset) are identical

**Mock setup** (events.replayQuota.test.ts:28-91 — use the same `vi.hoisted` pattern for `mockIncr`, `mockExpire`):

```typescript
// @vitest-environment node
const { mockIncr, mockExpire } = vi.hoisted(() => ({
  mockIncr: vi.fn(async () => 1),
  mockExpire: vi.fn(async () => 1),
}));
vi.mock('../../cache/redis.js', () => ({
  redis: { incr: (...a) => mockIncr(...a), expire: (...a) => mockExpire(...a) },
}));
```

---

### `server/__tests__/routes/events.prune.test.ts` (test, integration)

**Analog:** `server/__tests__/routes/events.replayQuota.test.ts:1-416` (closest match — same supertest harness, same mock boilerplate, same 7-test matrix structure)

**Confirmed mock boilerplate** (events.replayQuota.test.ts:96-250 — copy verbatim, update module paths):

- `vi.mock('../../middleware/rateLimit.js', ...)` pass-through
- `vi.mock('../../config.js', ...)` minimal config
- `vi.mock('../../cache/redis.js', ...)` with `cacheStore` Map + mockIncr/mockSadd etc.
- All adapter mocks (identical to replayQuota.test.ts since `createApp()` mounts all routes)

**Test cases** (D-09, D-10, D-15):

1. No Bearer in prod → 401 (matches replayQuota test 1 logic)
2. `trigger: 'manual'`, under cap (mockIncr returns 1) → 200 + `{ prunedCount, prunedIds }`
3. `trigger: 'manual'`, 50th INCR → 200 (cap inclusive)
4. `trigger: 'manual'`, 51st INCR → 429 + `Retry-After` + `resetsAt` body
5. `trigger: 'cron'` → 200 WITHOUT calling `checkPruneQuota` (cron bypass D-15)
6. Successful prune → audit-log SADD called with `operation: 'prune-dead-urls'`
7. Quota-exceeded 429 → audit-log SADD NOT called

**supertest vs fetch:** events.replayQuota.test.ts uses `fetch` (line 322) not `supertest`, despite the harness. Match the existing pattern in that file.

---

### `server/__tests__/routes/refresh-events-cron.prune.test.ts` (test, integration)

**Analog:** `server/__tests__/routes/refresh-events-cron.test.ts:1-80+` (exact pattern)

**Pattern to clone** (refresh-events-cron.test.ts:16-79):

```typescript
// @vitest-environment node
// Uses vi.hoisted + module-level mock setup (no supertest — lightweight mock pattern)
// Uses createReqRes() factory (refresh-events-cron.test.ts:37-63)
// Uses extractHandler() to pull the GET handler from the Router (lines 66-74)

const mockRunRefresh = vi.fn();
const mockRunProbeSweep = vi.fn();
const mockPruneDeadUrlEvents = vi.fn();

vi.mock('../../lib/llmExtractionPipeline.js', () => ({
  runRefreshExtraction: (...args) => mockRunRefresh(...args),
}));
vi.mock('../../lib/urlLiveness.js', () => ({
  runProbeSweep: (...args) => mockRunProbeSweep(...args),
  pruneDeadUrlEvents: (...args) => mockPruneDeadUrlEvents(...args),
}));
```

**Test cases:**

1. After `runRefreshExtraction` resolves, `runProbeSweep` is called with `deadlineMs` in future
2. After probe sweep, `pruneDeadUrlEvents({ trigger: 'cron' })` is called
3. If budget exhausted (Date.now() > deadlineMs before prune), prune is NOT called
4. Response shape still includes `dispatched: true` (existing contract preserved)

---

### `src/__tests__/components/DevApiStatus.prune.test.tsx` (test, jsdom)

**Analog:** `src/__tests__/DevApiStatusV3.test.tsx:1-316` (jsdom, React render, fireEvent, vi.mock hooks)

**Pattern to clone** (DevApiStatusV3.test.tsx:1-155):

```typescript
// @vitest-environment jsdom     ← NOT needed (vite.config.ts:56 default is jsdom)
// but DO NOT add // @vitest-environment node — would break React render
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
// Store resets per beforeEach (mirrors resetAllStores() pattern in DevApiStatusV3.test.tsx:35-105)
```

**fetch mock for operator-status** (mirrors DevApiStatusV3.test.tsx implicit global fetch):

```typescript
// Mock global fetch to return the operator-status payload with prune block:
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      audit24h: 1,
      byBearer: [],
      advEval: null,
      prune: { deadUrlCount: 3, last24hPrunes: 1 },
    }),
  });
});
```

**Test cases** (RESEARCH §Validation Architecture jsdom tests):

1. `dead-url-count` renders "Dead URL events: 3" when `prune.deadUrlCount = 3`
2. `prune-dead-urls-trigger` button is present when `deadUrlCount > 0`
3. Button is NOT rendered when `deadUrlCount === 0`
4. Clicking `prune-dead-urls-trigger` issues `POST /api/events/prune-dead-urls` with `body: { trigger: 'manual' }`
5. 429 response → `prune-quota-alert` renders with `resetsAt`
6. 200 response → `pruneQuotaAlert` clears; `fetchOpStatus` re-runs (mockFetch called twice)

**openAndSelectApiHealthTab helper** (mirrors DevApiStatusV3.test.tsx:107-112):

```typescript
function openAndSelectApiHealthTab() {
  useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' });
}
```

---

### `server/__tests__/routes/operator-status.test.ts` — extend (integration)

**Analog:** `server/__tests__/routes/operator-status.test.ts` (the file to extend — read it before modifying)

**Extension pattern:** Add a new `describe` block at the end of the file or add assertions to the existing shape test:

```typescript
it('response includes prune block with deadUrlCount and last24hPrunes', async () => {
  // Seed: mock redis.get('events:url-liveness-count') to return 5
  // Seed: audit log has one 'prune-dead-urls' entry in last 24h
  const res = await request(baseUrl).get('/api/operator-status');
  expect(res.status).toBe(200);
  expect(res.body.prune).toBeDefined();
  expect(typeof res.body.prune.deadUrlCount).toBe('number');
  expect(typeof res.body.prune.last24hPrunes).toBe('number');
});
```

---

### `server/__tests__/resilience/redis-death.test.ts` — extend (chaos)

**Analog:** Existing file — extend `cachedRoutes` array (redis-death.test.ts:257)

**Extension** (lines 257+ — add to `cachedRoutes` array):

```typescript
const cachedRoutes: { name: string; path: string; method?: string; body?: unknown }[] = [
  // ... existing entries ...
  {
    name: 'prune-dead-urls',
    path: '/api/events/prune-dead-urls',
    method: 'POST',
    body: { trigger: 'manual' },
  },
];
// Test assertion stays identical:
// expect([200, 503]).toContain(res.status) — never 500
```

**Key point from chaos test pattern** (redis-death.test.ts:185-203 — confirmed):

- The chaos mock throws on `redis.get`, `redis.set`, `redis.del`, `cacheGet`, `cacheSet`
- `cacheGetSafe` and `cacheSetSafe` are NOT mocked (they are the system under test)
- Phase 32's prune handler must use ONLY `cacheGetSafe`/`cacheSetSafe` for the events:llm:v3 mutation, or wrap direct `redis.*` calls in try/catch returning 503 on error

---

## Layer: Documentation (Modified)

---

### `CLAUDE.md` §"Serverless Cache" active Redis keys registry — extend

**Analog:** Existing entries in `CLAUDE.md` (lines following `## Serverless Cache`)

**Pattern:** Each entry is a single bullet following the format:

```
- **`key-name`** — description (TTL, writer, reader).
```

**Three new entries to add** (mirroring existing entry style):

```markdown
- **`events:url-liveness:{eventId}`** — per-event URL liveness probe result; JSON `{status, lastProbedAt, attemptCount, lastUrlProbed, lastHttpStatus}`. Tiered TTL: `live` 7d, terminal dead (`404`/`403`/`dead-host`) 24h, `unknown` 1h. Writer: cron probe sweep (`runProbeSweep`); reader: prune helper + `/api/operator-status` aggregator. Phase 32 D-19.
- **`events:url-liveness-count`** — sidecar integer; count of events whose primary URL has terminal-dead status. O(1) read for dashboard polls. INCR on live→dead transitions, DECR on dead→non-dead and on prune. No TTL (persistent sidecar). Writer: `server/lib/urlLiveness.ts` probe writes + prune; reader: `/api/operator-status`. Phase 32 Pitfall 3 mitigation.
- **`operator:prune-quota:{bearerFingerprint}:{YYYY-MM-DD}`** — INCR counter; per-Bearer per-day prune quota (50/24h). 48h TTL set on first INCR of each UTC day. Writer/reader: `server/lib/pruneQuota.ts`. Phase 32 D-15.
```

---

## Shared Patterns

### Bearer Gate + Audit Log (cross-cutting — all operator endpoints)

**Source:** `server/middleware/dashboardAuth.ts:31-67` + `server/lib/operatorAudit.ts:75-113`

**Apply to:** `POST /api/events/prune-dead-urls`

```typescript
// dashboardAuth.ts:31-67 (confirmed):
// - NODE_ENV !== 'production' → next() (dev bypass)
// - prod + empty DASHBOARD_PASSWORD → 503
// - prod + bad Bearer → 401
// - prod + matching Bearer → next()
// Uses timingSafeEqual from 'node:crypto' (constant-time compare)
// No `res.locals.bearerInfo` attachment (confirmed — middleware does NOT attach to locals)
// Caller derives fingerprint via: bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '')
```

### cacheGetSafe / cacheSetSafe Wrapper (cross-cutting — all Redis reads/writes)

**Source:** `server/cache/redis.ts:199-242` (confirmed)

**Apply to:** All Redis operations in `urlLiveness.ts`, `pruneDeadUrlEvents.ts`

- `REDIS_OP_TIMEOUT_MS = 2000` (redis.ts:147)
- `cacheGetSafe` returns `CacheResponse<T> | null` (with `degraded: true` on fallback)
- `cacheSetSafe` always writes `memCache` first, then tries Redis — swallows Redis error
- Direct `redis.incr`/`redis.decr` calls (sidecar count key) must be wrapped in `try/catch` manually since `cacheSetSafe` only handles `CacheEntry<T>` shapes

### Logger Child Pattern (cross-cutting — all new modules)

**Source:** `server/lib/operatorAudit.ts:31` + `server/lib/safeWaitUntil.ts:46`

```typescript
const log = logger.child({ module: 'urlLiveness' }); // urlLiveness.ts
const log = logger.child({ module: 'pruneQuota' }); // pruneQuota.ts
const log = logger.child({ module: 'pruneDeadUrlEvents' }); // pruneDeadUrlEvents.ts
// NEVER console.log / console.warn / console.error in any new module.
```

### Degrade-Open Error Envelope (cross-cutting — all operator-tier operations)

**Source:** `server/lib/operatorAudit.ts:109-112`

```typescript
// Pattern: never throw; log.error and return gracefully.
// Applied to: audit-log writes, sidecar count INCR/DECR, cron probe sweep partial failures.
} catch (err) {
  log.error({ err, operation: ... }, 'description of what failed');
}
```

### Test Mock Boilerplate — Route Integration Tests (cross-cutting — all `// @vitest-environment node` route tests)

**Source:** `server/__tests__/routes/events.replayQuota.test.ts:96-250` (confirmed — most complete boilerplate)

Includes: `vi.mock('../../middleware/rateLimit.js', ...)` pass-through, `vi.mock('../../config.js', ...)`, all adapter mocks, `vi.mock('../../cache/redis.js', ...)` with `cacheStore` Map + `mockIncr`, `mockExpire`, `mockSadd`, `mockScard`, `mockSpop`, `mockSrem`.

### React Component Test Mock Boilerplate (cross-cutting — all jsdom component tests)

**Source:** `src/__tests__/DevApiStatusV3.test.tsx:35-151` (confirmed — resetAllStores + store setState pattern)

All tests that render `<DevApiStatus>` must call `resetAllStores()` in `beforeEach` and `useUIStore.setState(...)` to control tab/open state. Missing store resets cause flaky tests due to cross-test state leakage.

---

## No Analog Found

| File                                                  | Role                | Data Flow | Reason                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/urlLiveness.ts` — SSRF guard              | utility (security)  | N/A       | No existing outbound HTTP probe with private-IP block exists in the codebase. Pattern derived from RESEARCH Security §V11 + ASVS guidance. Implement as a module-scope regex check before every `probeUrl` call.                                                                                                                                                                 |
| `events:url-liveness-count` sidecar increment pattern | cache write pattern | CRUD      | No existing integer sidecar key maintained by writes in the codebase. Existing INCR usage (`replayQuota.ts:67`) is quota-only; sidecar count pattern (INCR on state-transition, DECR on prune, floor at 0) is novel to Phase 32. Closest is `redis.incr` in `replayQuota.ts:67` — use the same lazy import + try/catch shape, but the state-transition-conditional logic is new. |

---

## Metadata

**Analog search scope:** `server/lib/`, `server/routes/`, `server/middleware/`, `server/__tests__/`, `src/components/ui/DevApiStatus.tsx`, `src/__tests__/`
**Files scanned:** 28 source files, 21 test files
**Pattern extraction date:** 2026-05-19
**Primary risk:** `OperatorAuditEntry.operation` union widening (`server/lib/operatorAudit.ts:49`) must happen in the same commit as the first call to `appendOperatorAuditEntry` with `operation: 'prune-dead-urls'` — TypeScript strict mode will refuse to compile otherwise. Also widen the local `AuditEntry` interface in `server/routes/operator-status.ts:52` and its `byBearer` aggregator loop.
