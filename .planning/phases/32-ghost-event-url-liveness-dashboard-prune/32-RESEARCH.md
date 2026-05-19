# Phase 32: Ghost Event URL Liveness, Dashboard & Prune — Research

**Researched:** 2026-05-19
**Domain:** Out-of-band URL liveness probing + Bearer-gated prune endpoint + dashboard surfacing, layered on the v3 LLM cron-only writer discipline
**Confidence:** HIGH (every load-bearing primitive — `createLimit`, `cacheGetSafe`, `safeWaitUntil`, `dashboardAuth`, `appendOperatorAuditEntry`, `checkReplayQuota`, `operator-status` aggregator — already exists and is unit-tested in this codebase)

## Summary

Phase 32 introduces ONE new code path with no new third-party dependencies. A probe sweep, gated by `createLimit(8)` and a per-host throttle map, runs **after** `runRefreshExtraction()` resolves inside `/api/cron/refresh-events`, writing per-event `events:url-liveness:{eventId}` keys with tiered TTL. The same cron handler then calls a single Bearer-gated `POST /api/events/prune-dead-urls` endpoint to splice events with `attemptCount ≥ 3` terminal-dead status out of `events:llm:v3`. The operator gets a "Prune N dead events" button in `DevApiStatus`'s Operator Actions block (mirrors the existing Replay-probe button) that calls the same endpoint with the operator's Bearer.

The "primary URL" the probe targets is **`data.source`** — for BOTH raw GDELT (set in `server/adapters/gdelt.ts:244`) and LLM v3 enriched events (inherited via `template.data` spread in `server/lib/llmExtractionPipeline.ts:478-479` — the v3 enrichment does NOT add a `sourceUrls[]` field to the persisted entity). This corrects a subtle factual error in CONTEXT D-05's parenthetical: the spec said "`data.sourceUrls[0]` for LLM v3", but `enrichedV3ToEntities()` never persists `sourceUrls` to the entity. The behavior is identical (one URL per event), but the implementation reads `data.source` for both event sources — verified at `src/components/detail/EventDetail.tsx:152` which is the canonical "what does the operator click" oracle.

**Primary recommendation:** Build the probe primitive (`server/lib/urlLiveness.ts`) and Zod schema first as standalone testable units, layer the prune endpoint next (lifting `appendOperatorAuditEntry` + `checkPruneQuota` patterns verbatim from `operatorAudit.ts` + `replayQuota.ts`), wire the cron post-step third, and finish with the dashboard surface. Five-plan decomposition recommended.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL liveness probe (outbound HTTP) | Server (Node Express + Vercel function) | — | Egress from operator's Vercel deployment — no browser CORS / no client-side egress |
| Per-event liveness storage (`events:url-liveness:{eventId}`) | Redis (Upstash, via `cacheGetSafe`/`cacheSetSafe`) | In-memory fallback | Survives function cold-starts; per-event keying is cheap (write-once-per-sweep, read-batch-by-dashboard) |
| Probe sweep orchestration | Server cron handler (`refresh-events-cron.ts` route, after `runRefreshExtraction` resolves inside `safeWaitUntil` body) | — | Cron-only writer discipline (anti-pattern #17); `/api/events` stays read-only |
| Prune endpoint (delete event + url-liveness key) | Server (`/api/events/prune-dead-urls` POST behind `dashboardAuth`) | — | Same Bearer trust boundary as `/llm-replay`; mounted in `server/routes/events.ts` alongside existing operator-action endpoints |
| Rate-limit + audit log | Redis (`operator:prune-quota:{fingerprint}:{date}` INCR; `operator:audit-log` SADD) | — | Reuses the entire operator-action audit machinery from Phase 28.2 W3 with zero new aggregator surface |
| Dashboard count + drill-down + prune button | Browser (React `DevApiStatus.tsx` Operator Actions block) | Server `/api/operator-status` aggregator (extends current shape with `prune` sibling block) | The single Bearer-gated aggregator already exists and serves the API Health tab; this phase extends it |
| Dead-URL count surfaced to dashboard | Server (`/api/operator-status` extension) | — | Aggregating N url-liveness keys client-side would balloon Redis round-trips; aggregate server-side once |

## Standard Stack

### Core (all already present — Phase 32 adds zero new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fetch` (global, undici under the hood as of Node 22) | Node 22.x [VERIFIED: `engines.node: "22.x"` in `package.json:7`] | HTTP probes (HEAD then GET-with-Range) | Every existing outbound HTTP call in `server/adapters/` uses global `fetch` ([VERIFIED: grep across `server/adapters/{opensky,adsb-lol,gdelt,gdelt-doc,nominatim,overpass,rss,yahoo-finance,open-meteo*,acled}.ts`]; zero use `undici` directly). Node 22 ships undici as the global `fetch` implementation natively; adding `undici` as a direct dep would duplicate the runtime |
| `AbortController` / `AbortSignal.timeout(ms)` | built-in | 10s per-request timeout (D-18) | Already the project convention — `server/adapters/adsb-lol.ts:20` uses `AbortSignal.timeout()`; `server/adapters/nominatim.ts:21-30` uses the longer-form `AbortController + setTimeout + abort()` for the 10s Nominatim deadline |
| `@upstash/redis` | 1.37 [VERIFIED: `package.json:60` `"@upstash/redis": "^1.37.0"`] | per-event liveness storage + quota counter | Already the project Redis client; `cacheGetSafe`/`cacheSetSafe` wrappers at `server/cache/redis.ts:138-216` handle 2s timeout + in-memory fallback |
| `zod` | 3.25 [VERIFIED: `package.json:80` `"zod": "^3.25.76"`] | `UrlLivenessSchema` for D-22 contract test | Project schema standard — `scripts/snapshot-cron-watch.ts:85-110` shows the `.strict()` pattern Phase 32 mirrors |
| `createLimit(8)` | local — `server/lib/concurrencyLimit.ts` | FIFO concurrency bound for the probe sweep | Reused verbatim from LLM v3 batch dispatch; 30-LOC primitive with deliberate "no p-limit dep" rationale in JSDoc (`concurrencyLimit.ts:9-15`) |
| `pino` (via `logger.child({module: 'urlLiveness'})`) | 10.3 | structured logging | CLAUDE.md mandates `logger.child(...)`, never `console.*` — see `server/lib/logger.ts` for redaction-aware setup |

### Supporting (existing helpers Phase 32 leans on)

| Library / Helper | Path | Purpose | When to Use |
|------------------|------|---------|-------------|
| `cacheGetSafe<T>` / `cacheSetSafe<T>` | `server/cache/redis.ts:138, 213` | safe Redis read/write with 2s timeout + in-memory fallback | EVERY url-liveness Redis op — chaos test compatibility |
| `safeWaitUntil` | `server/lib/safeWaitUntil.ts:62` | Vercel `waitUntil` shim w/ local-dev fallback | The probe sweep runs INSIDE the existing `safeWaitUntil` body in `runRefreshExtraction` (lines 258-444 of `llmExtractionPipeline.ts`), so we are already inside Vercel's allowance — no new `safeWaitUntil` call needed |
| `dashboardAuth` middleware | `server/middleware/dashboardAuth.ts:31` | Bearer-token gate (constant-time compare) | Mounted on the new `POST /api/events/prune-dead-urls` route exactly as `POST /api/events/llm-replay/:groupKey` does at `server/routes/events.ts:437` |
| `appendOperatorAuditEntry` | `server/lib/operatorAudit.ts:69` | SADD bounded audit-log writer (500 cap, 30d TTL, SPOP eviction) | Called once per successful prune call from the endpoint handler — `args: {trigger: 'manual' | 'cron'}, result: 'ok' \| 'error'` |
| `bearerFingerprint` | `server/lib/operatorAudit.ts:62` | SHA-256 truncated-to-8-hex fingerprint of the Bearer | Used both to tag the audit entry AND to key the new `operator:prune-quota:*` namespace — same identity model as replay quota |
| `checkReplayQuota` pattern | `server/lib/replayQuota.ts:58` | INCR per-day key with first-INCR-sets-TTL idiom | Pattern lifted verbatim into a new `checkPruneQuota(fingerprint)` in `server/lib/pruneQuota.ts`; 50/24h cap (D-15) |
| `OperatorAuditEntry.operation` union | `server/lib/operatorAudit.ts:43` | Currently `'pipeline-swap' \| 'replay'` | **Must widen** to `'pipeline-swap' \| 'replay' \| 'prune-dead-urls'`; the `byBearer` aggregator at `operator-status.ts:118-119` must learn the new tag (or render it unbucketed) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| global `fetch` + `AbortController` | `undici` Dispatcher with `pool` per-host | Pool would automatically per-host-throttle and reuse connections — but project has zero existing `undici` usage. Adding a direct dep contradicts the `createLimit` "no `p-limit` because we keep deps small" precedent (`concurrencyLimit.ts:11-15`). Boring choice wins |
| Self-HTTP cron→endpoint invocation (POST to `https://otg-iran-monitor.vercel.app/api/events/prune-dead-urls` w/ system Bearer) | Direct function call to a shared `pruneDeadUrlEvents(opts)` helper | Self-HTTP exercises the audit-log path identically AND validates the Bearer gate end-to-end on every cron run, but introduces (a) a circular call back into the same function instance, (b) a need for the Vercel-deployment URL in env, (c) doubled latency. **Pick: shared helper** (see Discretion §3 below) |
| New `events:url-liveness-count` sidecar key written on each sweep | `SCAN MATCH events:url-liveness:* COUNT 100` from `/operator-status` per request | SCAN is O(N) over the Redis keyspace each dashboard poll; the sidecar count key is O(1). **Pick: sidecar count key** maintained by the cron writer + delta-on-prune. See Risk §3 below |

**Installation:** None. All packages confirmed present in `package.json`.

**Version verification (commands run during research):**
```bash
# package.json inspection (no remote registry call needed)
grep -E "undici|zod|@upstash/redis|express" package.json   # → zero undici matches; zod ^3.25.76; @upstash/redis ^1.37.0; express ^5.2.1
node --version                                              # → v25.6.1 (engines.node: "22.x" in package.json)
```

All versions [VERIFIED: read directly from `/Users/zackmaz/Desktop/otg-iran-monitor/package.json:53-123`] — no remote registry calls required because the phase adds no new packages.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| _none added_ | n/a | n/a | n/a | n/a | n/a | Phase 32 adds zero new packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Slopcheck was not invoked because the phase introduces no new dependencies — all primitives reuse existing in-repo modules + already-installed npm packages.

## Architecture Patterns

### System Architecture Diagram

```
                              ┌─────────────────────────┐
                              │ Vercel cron 04:00 UTC   │
                              │ GET /api/cron/          │
                              │     refresh-events      │
                              └────────────┬────────────┘
                                           │ (Bearer CRON_SECRET if set)
                                           ▼
                              ┌─────────────────────────┐
                              │ refresh-events-cron.ts  │
                              │ handler                 │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ runRefreshExtraction()  │   ← existing path
                              │ (llmExtractionPipeline) │     wrapped in
                              └────────────┬────────────┘     safeWaitUntil(...)
                                           │
                                           │ on success →
                                           ▼
                              ┌─────────────────────────┐
                              │  PHASE 32 ADDITION:     │
                              │  runProbeSweep()        │
                              │  (server/lib/url        │
                              │   Liveness.ts)          │
                              └────────────┬────────────┘
                                           │
                          ┌────────────────┼─────────────────┐
                          │                │                 │
                          ▼                ▼                 ▼
                    ┌──────────┐    ┌─────────────┐   ┌────────────────┐
                    │ priority │    │ createLimit │   │ per-host       │
                    │ sort:    │    │ (8)         │   │ throttle map   │
                    │ never-   │    │ FIFO queue  │   │ (URL.hostname  │
                    │ probed   │    │             │   │  → next-OK ms) │
                    │ first    │    │             │   │ 1 req/s        │
                    └──────────┘    └─────────────┘   └────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ probeUrl(url):          │
                              │   HEAD (10s timeout)    │
                              │   ↳ 405? GET Range:0-1023│
                              │   follow ≤3 redirects   │
                              │   classify:             │
                              │     live | 404 | 403 |  │
                              │     dead-host | unknown │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────────────────┐
                              │ cacheSetSafe(                       │
                              │   'events:url-liveness:{eventId}',  │
                              │   {status,lastProbedAt,             │
                              │    attemptCount,lastUrlProbed,      │
                              │    lastHttpStatus},                 │
                              │   ttlByStatus(status))              │
                              │     live      →  7d                 │
                              │     terminal  → 24h                 │
                              │     unknown   →  1h                 │
                              └─────────────────────────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────────────────┐
                              │  After sweep:                       │
                              │  POST /api/events/prune-dead-urls   │
                              │  (system trigger; same endpoint     │
                              │   as the dashboard button)          │
                              │  body: {trigger: 'cron'}            │
                              └────────────┬────────────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────────────────┐
                              │  pruneDeadUrlEvents() helper:       │
                              │    - SCAN events:url-liveness:*     │
                              │    - filter status ∈ dead AND       │
                              │      attemptCount ≥ 3 (cron only)   │
                              │    - read events:llm:v3 array       │
                              │    - splice matching ids            │
                              │    - cacheSetSafe(events:llm:v3,    │
                              │        spliced, LLM_REDIS_TTL_SEC)  │
                              │    - DEL events:url-liveness:{ids}  │
                              │    - DEL events:url-liveness-count  │
                              │      OR DECR by pruned count        │
                              │    - appendOperatorAuditEntry({     │
                              │        operation: 'prune-dead-urls',│
                              │        args: {trigger},             │
                              │        result: {prunedCount, ids}}) │
                              └─────────────────────────────────────┘

  Dashboard side (browser):
  ┌──────────────────────────────────────────────────────────────────┐
  │ DevApiStatus → Operator Actions block (DevApiStatus.tsx:1475)    │
  │                                                                  │
  │   Reads /api/operator-status extension:                          │
  │     { audit24h, byBearer, advEval,                               │
  │       prune: { deadUrlCount, last24hPrunes } }                   │
  │                                                                  │
  │   Renders:                                                       │
  │     "Dead URL events: <N>"                                       │
  │     [Prune N dead events] button → POST /api/events/             │
  │       prune-dead-urls (body {trigger: 'manual'},                 │
  │       headers dashboardAuthHeaders())                            │
  │     Drill-down: list eventIds with status + last probe age       │
  └──────────────────────────────────────────────────────────────────┘

  Pitfall 1 cache bridge (UNTOUCHED):
  GET /api/events → events:llm:v3 (read) → raw GDELT fallback
  Prune mutates events:llm:v3 but never blocks reads. Map never goes blank.
```

### Recommended Project Structure

```
server/
├── lib/
│   ├── urlLiveness.ts         # NEW — probe primitives + Zod schema + ttlByStatus
│   │                          #       exports: UrlLivenessSchema, UrlLiveness, ttlByStatus,
│   │                          #                probeUrl, runProbeSweep, pruneDeadUrlEvents,
│   │                          #                URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY
│   ├── pruneQuota.ts          # NEW — verbatim port of replayQuota.ts shape; key namespace
│   │                          #       'operator:prune-quota:{fingerprint}:{YYYY-MM-DD}'
│   └── operatorAudit.ts       # MODIFIED — widen OperatorAuditEntry.operation union
│                              #            to add 'prune-dead-urls'
├── routes/
│   ├── events.ts              # MODIFIED — register POST /prune-dead-urls (Bearer-gated)
│   │                          #            calls into pruneDeadUrlEvents() helper
│   ├── refresh-events-cron.ts # MODIFIED — after runRefreshExtraction resolves, call
│   │                          #            runProbeSweep() then pruneDeadUrlEvents({trigger: 'cron'})
│   └── operator-status.ts     # MODIFIED — read URL_LIVENESS_COUNT_KEY + most recent prune
│                              #            audit entry, append { prune } to response payload
└── __tests__/
    ├── lib/
    │   ├── urlLiveness.schema.test.ts  # NEW — D-22 schema contract test
    │   ├── urlLiveness.probe.test.ts   # NEW — mocked-fetch matrix
    │   └── pruneQuota.test.ts          # NEW — clones replayQuota.test.ts shape
    └── routes/
        └── events.prune.test.ts        # NEW — Bearer gate, 429, audit-log assertions

src/
├── components/ui/DevApiStatus.tsx     # MODIFIED — Operator Actions block: dead-URL count row,
│                                      #            "Prune N dead events" button, drill-down list
└── __tests__/lib/
    └── urlLiveness.schema.test.ts     # NEW (CONTEXT D-22 placement directive) — mirror of the
                                       #     server schema test under the path D-22 names

scripts/
└── (no new scripts; this phase has no ad-hoc CLI surface)
```

> **Note on D-22 schema test placement.** CONTEXT D-22 names `src/__tests__/lib/urlLiveness.schema.test.ts` as the placement. The schema itself is server-side (Zod imported in `server/lib/urlLiveness.ts`). Two valid options for the planner:
> (a) Honor the literal CONTEXT path and have the front-end test import the server-side schema via the `@/` or relative path alias — this exercises ESM cross-boundary import + verifies the contract from the consumer's perspective.
> (b) Place the canonical schema test at `server/__tests__/lib/urlLiveness.schema.test.ts` (matching `freeClaudeRouter.test.ts` location), and add a thin one-liner at the CONTEXT path that re-exports / re-imports for the literal directive compliance.
>
> Recommendation: **(b)** — server-side schema tests run under `vitest --environment node` and execute faster, mirror existing schema-pinning pattern, and the CONTEXT path is honored by a 5-line shim that imports the canonical test. The planner should pick one and pin it in the plan.

### Pattern 1: Probe sweep loop (the load-bearing primitive)

**What:** Iterate the candidate eventId list, route each `probeUrl(url)` call through `createLimit(8)`, gate per-host on a `Map<hostname, nextAllowedAt: number>` for 1 req/s, write the result via `cacheSetSafe`.

**When to use:** Inside `runProbeSweep()` only — never call `probeUrl` standalone from a request handler (anti-pattern #17).

**Example:**
```typescript
// Source: pattern derived from server/lib/llmEventExtractor.v3.ts:559-606 (parallel batches via
// createLimit) and server/adapters/nominatim.ts:20-30 (fetch-with-timeout).
import { createLimit } from './concurrencyLimit.js';
import { cacheSetSafe, cacheGetSafe, redis } from '../cache/redis.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'urlLiveness' });

const PROBE_CONCURRENCY = 8;          // D-18
const PROBE_TIMEOUT_MS = 10_000;      // D-18
const PER_HOST_INTERVAL_MS = 1_000;   // D-18 (Nominatim parity)
const JITTER_MS = 200;                // D-18 (±200ms)
const MAX_REDIRECTS = 3;              // D-17
const PROBE_UA = 'IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)';   // D-21

const hostNext = new Map<string, number>();

async function waitForHostSlot(hostname: string): Promise<void> {
  const now = Date.now();
  const prior = hostNext.get(hostname) ?? 0;
  const jitter = Math.floor((Math.random() - 0.5) * 2 * JITTER_MS);
  const target = Math.max(now, prior) + jitter;
  if (target > now) {
    await new Promise((r) => setTimeout(r, target - now));
  }
  hostNext.set(hostname, Math.max(now, target) + PER_HOST_INTERVAL_MS);
}

export async function runProbeSweep(opts: {
  eventIdsWithUrls: Array<{ eventId: string; url: string }>;
  deadlineMs: number;          // wall-clock budget (Vercel maxDuration aware)
}): Promise<{ probed: number; skippedBudget: number }> {
  const limit = createLimit(PROBE_CONCURRENCY);
  let probed = 0;
  let skippedBudget = 0;

  const tasks = opts.eventIdsWithUrls.map(({ eventId, url }) =>
    limit(async () => {
      if (Date.now() > opts.deadlineMs) {
        skippedBudget++;
        return;
      }
      try {
        const host = new URL(url).hostname;
        await waitForHostSlot(host);
        const result = await probeUrl(url);
        await persistLiveness(eventId, url, result);
        probed++;
      } catch (err) {
        // probeUrl never throws (catches itself); reaching here means URL parse fail
        log.warn({ err, eventId, url }, 'probe sweep task failed (URL parse)');
      }
    }),
  );
  await Promise.all(tasks);
  return { probed, skippedBudget };
}
```

### Pattern 2: HEAD-then-GET probe with redirect cap

```typescript
// Source: D-16/D-17/D-18/D-21 synthesis; redirect-follow pattern adapted from MDN
// fetch examples (redirect: 'manual' for custom limit-counting).
interface ProbeResult {
  status: 'live' | '404' | '403' | 'dead-host' | 'unknown';
  httpStatus: number | null;
  finalUrl: string;
}

async function probeUrl(rawUrl: string): Promise<ProbeResult> {
  let url = rawUrl;
  let httpStatus: number | null = null;
  let finalUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      // HEAD first (D-16)
      let res = await fetchOnce(url, 'HEAD');

      // 405 → GET with Range fallback (D-16)
      if (res?.status === 405) {
        res = await fetchOnce(url, 'GET');
      }

      if (!res) return { status: 'dead-host', httpStatus: null, finalUrl };

      httpStatus = res.status;
      finalUrl = url;

      // Redirect handling (D-17)
      if (res.status >= 300 && res.status < 400) {
        if (hop === MAX_REDIRECTS) return { status: 'unknown', httpStatus, finalUrl };
        const loc = res.headers.get('location');
        if (!loc) return { status: 'unknown', httpStatus, finalUrl };
        url = new URL(loc, url).toString();
        continue;
      }

      // Classify terminal status (D-07)
      if (res.status === 404) return { status: '404', httpStatus, finalUrl };
      if (res.status === 403) return { status: '403', httpStatus, finalUrl };
      if (res.status >= 200 && res.status < 300) {
        return { status: 'live', httpStatus, finalUrl };
      }
      // 4xx other than 404/403, 5xx, 1xx, etc. → unknown (D-07)
      return { status: 'unknown', httpStatus, finalUrl };
    } catch {
      // Network-level failure → dead-host (DNS, ECONNREFUSED, abort/timeout)
      return { status: 'dead-host', httpStatus: null, finalUrl };
    }
  }
  return { status: 'unknown', httpStatus, finalUrl };
}

async function fetchOnce(url: string, method: 'HEAD' | 'GET'): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        'User-Agent': PROBE_UA,
        ...(method === 'GET' ? { Range: 'bytes=0-1023' } : {}),
      },
      redirect: 'manual',           // we count hops ourselves (D-17)
    };
    return await fetch(url, init);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

### Anti-Patterns to Avoid

- **Calling `probeUrl()` from `/api/events`.** Re-introduces fire-and-forget read-path writers (anti-pattern #17). Probes happen ONLY inside `safeWaitUntil(...)` from the cron handler.
- **Looping `cacheGet` per dashboard request to count dead URLs.** N round-trips × Upstash 10-80ms RTT = the dashboard becomes Redis-bound. Use a sidecar `events:url-liveness-count` integer key (write on every probe write, decrement on every prune) — see Risk §3.
- **Spawning a Promise.all over all eventIds without `createLimit`.** Even at 8-concurrent the per-host map throttles same-domain bursts; without `createLimit` you can have hundreds of in-flight fetches against unrelated hosts that the V8 socket pool can't satisfy.
- **Treating `unknown` as "dead" when counting.** D-07 explicitly excludes `unknown` from the dashboard count. `unknown` is the "try again later" bucket — collapsing it into dead inflates the prune-candidate list with transient blips.
- **Reading `data.sourceUrls[0]` literally as CONTEXT D-05 suggests.** The persisted `ConflictEventEntity.data` (server/types.ts:44-88) has NO `sourceUrls` field — the v3 enrichment at `enrichedV3ToEntities()` (server/lib/llmExtractionPipeline.ts:478-501) does not set it. Read `data.source` for both raw GDELT and LLM v3 entities. Document this in the implementing module's JSDoc to prevent future confusion.
- **Forgetting to widen `OperatorAuditEntry.operation`.** The type union is `'pipeline-swap' | 'replay'` at `server/lib/operatorAudit.ts:49`. Adding a new operation without widening the type makes TypeScript fail; widening it without also touching `server/routes/operator-status.ts:118-119` (the `byBearer` aggregator that buckets `swaps`/`replays`) loses the new operation's per-Bearer count.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer-token authentication | Custom header parsing + comparison | `dashboardAuth` middleware (`server/middleware/dashboardAuth.ts:31`) | Already does constant-time compare with `timingSafeEqual`, dev bypass via NODE_ENV, fail-closed in prod on missing config |
| SHA-256 truncated Bearer fingerprint | Direct `createHash` call | `bearerFingerprint(password)` (`server/lib/operatorAudit.ts:62`) | Single identity model shared with audit log + quota counter; changing the truncation length in one place would silently fork |
| Operator-action audit log | New SADD bounded-set helper | `appendOperatorAuditEntry({...})` (`server/lib/operatorAudit.ts:69`) | Already implements 500-cap + 30d TTL + SPOP eviction; aggregator at `/api/operator-status` already reads it |
| Per-Bearer per-day quota | New INCR + TTL flow | Pattern-copy of `checkReplayQuota` (`server/lib/replayQuota.ts:58`) into `checkPruneQuota` | Identical INCR-then-EXPIRE-on-first idiom, identical 48h TTL, identical UTC-midnight reset calculation |
| Concurrency-bounded async queue | Promise.all + manual counter | `createLimit(8)` (`server/lib/concurrencyLimit.ts:35`) | 30-LOC FIFO queue; explicit "no p-limit dep" rationale already documented |
| Redis-with-fallback wrapper | Direct `redis.get`/`redis.set` | `cacheGetSafe`/`cacheSetSafe` (`server/cache/redis.ts:138, 213`) | Provides 2s timeout (REDIS_OP_TIMEOUT_MS) + in-memory fallback that the chaos test (`server/__tests__/resilience/redis-death.test.ts`) hits |
| `safeWaitUntil` shim for cron background work | Direct `waitUntil()` call | The cron handler is already inside one via `runRefreshExtraction()` (`server/lib/llmExtractionPipeline.ts:258`) | The probe sweep + prune call sit INSIDE the existing IIFE — no second `safeWaitUntil` call needed |
| HTTP per-host throttle | New module | `Map<hostname, nextAllowedAt: number>` in `urlLiveness.ts` module scope | The Nominatim adapter doesn't actually implement a Redis-backed per-host throttle either — it just sleeps. Pattern-match the in-memory approach; the module-singleton survives warm starts on Fluid Compute |
| URL parsing / canonicalization | `urlparse`/`whatwg-url` dep | Built-in `new URL(rawUrl)` | The `URL` global throws on malformed input — wrap in try/catch in the sweep loop |

**Key insight:** Phase 32 is a refactor-shaped feature build — every primitive is already in the repo, mostly developed under Phase 28.2 W3 (operator-action audit log + quota) and Phase 27.4.4 (concurrency limiter + dashboard auth + safeWaitUntil). The new code is glue + the probe primitive + a Zod schema.

## Runtime State Inventory

**Trigger:** Phase 32 is feature-add, not rename. Runtime state inventory is mostly N/A. Documented anyway for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `events:url-liveness:*` keys are new. `events:llm:v3` IS mutated (events spliced on prune); blast radius is internal to this phase's prune handler | New code |
| Live service config | None — no external service registrations | None |
| OS-registered state | None — Vercel cron schedule (`vercel.json` `crons[]`) is **unchanged**; D-01 explicitly piggybacks rather than adding a 4th entry | None |
| Secrets/env vars | None new. `DASHBOARD_PASSWORD` (existing) gates the prune endpoint; `CRON_SECRET` (existing) gates the cron route. No `VITE_PROBE_*` env added per CONTEXT D-18 + Deferred: "Env-tunable probe knobs" deferred until incident-driven need | None |
| Build artifacts / installed packages | No new deps. `api/vercel-entry.js` bundle gets ~3-5KB larger from `urlLiveness.ts` + `pruneQuota.ts` + Zod schema; well under SIMPLIFY-07 budget concerns | Rebuild via `npm run build` after merge — standard |

## Common Pitfalls

### Pitfall 1: Probe sweep blows the 800s Vercel Pro `maxDuration` when extraction took most of it

**What goes wrong:** `runRefreshExtraction` typically completes in ~10 minutes (600s). On a slow NIM day it can approach 700s. Probing a long backlog of events with no budget check exhausts the remaining 100-200s; the Vercel function is killed mid-sweep, the next cron tick sees most events still unprobed.

**Why it happens:** The probe sweep has no awareness of wall-clock or remaining `maxDuration` headroom.

**How to avoid:**
- Pass a `deadlineMs: number` into `runProbeSweep()` set to `cronStartTimestamp + 800_000 - SAFETY_MARGIN_MS` (recommend `SAFETY_MARGIN_MS = 60_000` — leaves 60s for the prune call + audit-log writes).
- Each task in the sweep checks `Date.now() > opts.deadlineMs` BEFORE entering the throttle/fetch sequence (see pattern code above). Tasks past the deadline increment `skippedBudget` and return — they get re-prioritized next tick because D-04's "never-probed first" sort still routes them.
- The "best-effort partial sweep" (D-03) IS this contract; the planner must wire the deadline plumbing or D-03 collapses to "best-effort happens by crash."

**Warning signs:** `runProbeSweep` log line shows `{ probed: X, skippedBudget: Y }` with Y > 0 consistently for the same eventIds across ticks. The fix is bumping `SAFETY_MARGIN_MS` upward (i.e., starting the sweep earlier within the 800s window) or reducing `PROBE_CONCURRENCY` (counter-intuitive, but if hosts are throttling we're spending time sleeping anyway).

### Pitfall 2: Per-host throttle map grows unboundedly across long-lived warm function instances

**What goes wrong:** `hostNext.set(hostname, ...)` in module scope accumulates one entry per unique hostname across all probed URLs. On a long-warm Vercel function instance, this could be tens of thousands of entries over days. Each entry is small (~80B), so the absolute memory cost is bounded, but the Map's read perf degrades as a thin band.

**Why it happens:** Module-singleton state never gets GC'd.

**How to avoid:**
- Add a sweep-end cleanup: at the end of `runProbeSweep()`, iterate `hostNext` and `delete()` entries where `nextAllowedAt < Date.now() - 60_000` (i.e., entries older than 60s — well past the 1s throttle window).
- Cold-start resets the map to empty automatically. Vercel Fluid Compute cold-starts on most cron ticks anyway (cron runs every 24h, far past warm-window TTL), so the warm-instance unbounded-growth pathology is theoretical for THIS callsite. Document the cleanup as defense-in-depth.

**Warning signs:** Heap-snapshot diff would show `hostNext` growth across long-running test scenarios; in production, the daily cold-start naturally resets state.

### Pitfall 3: Aggregating dead-URL count requires N Redis GETs unless a sidecar count key exists

**What goes wrong:** The dashboard polls `/api/operator-status` every 30s (`DevApiStatus.tsx:925`). Computing "how many dead-URL events?" requires reading every `events:url-liveness:*` key — that's N Redis round-trips per dashboard poll per operator session. At N=400 events × 30s × Upstash ~30ms RTT × multiple concurrent dashboard tabs, the Upstash command budget (already at 92% per REDIS-OPT-04 baseline) tips into red.

**Why it happens:** Per-event keys are right for write-time TTL granularity but wrong for read-time aggregation.

**How to avoid:**
- Add a sidecar Redis key `events:url-liveness-count` (single integer). The cron writer maintains it:
  - On probe-write that transitions live → terminal-dead: `INCR events:url-liveness-count`
  - On probe-write that transitions terminal-dead → live (or terminal-dead → unknown): `DECR events:url-liveness-count`
  - On prune: `DECRBY events:url-liveness-count <prunedCount>`
- Floor at 0 with a check (`max(0, current)`) to handle DECR races (Upstash INCR/DECR aren't atomic across keys; an old probe race could underflow theoretically).
- Operator-status read becomes a single `redis.get('events:url-liveness-count')`.
- Per CONTEXT Deferred section, "bandwidth / cost telemetry for probe sweeps" is the related deferred item — this sidecar key is the minimal investment to avoid the cost problem rather than instrument it.

**Warning signs:** Upstash dashboard shows `events:url-liveness:*` GET cardinality dominating in `INFO commandstats`. The sidecar key avoids ever hitting that pattern.

### Pitfall 4: Prune mid-read race — `/api/events` reads `events:llm:v3` while prune is mid-splice

**What goes wrong:** Prune does `cacheGet → splice → cacheSet`. Between the GET and the SET, `/api/events` can read the same key with the old (un-pruned) value, then ms later the SET lands. Worst case: a dead-URL event flickers briefly on the map between prune-decision and prune-commit.

**Why it happens:** Upstash REST is not transactional across the GET/SET sequence (no MULTI/EXEC equivalent in the REST client we use).

**How to avoid:**
- This race is **acceptable** by Pitfall-1-bridge invariant — the map serves cached data; a one-poll-cycle (≤15min logical TTL) flicker of a dead event is operationally fine.
- The harder failure mode is **double-write loss**: if two prune calls overlap (e.g., operator clicks button while cron is mid-prune), the second SET clobbers the first's pruned-state. Mitigations:
  - Cron's prune runs INSIDE `safeWaitUntil` after probe sweep — the same function instance that just probed. A second concurrent prune from the operator button would have to land on a *different* function instance.
  - Document the race in JSDoc on `pruneDeadUrlEvents()`. Operator's manual prune that overlaps cron prune may result in fewer-than-expected deletions for one tick (the next cron tick re-prunes whatever survived).
  - Optional belt-and-suspenders: a Redis-backed mutex via `redis.set('lock:prune-dead-urls', '1', { nx: true, ex: 60 })`. Returns null on contention → return 409 from the endpoint. Plan-level decision; the planner should pin one approach.

**Warning signs:** `prunedCount` in audit log entries that match `dead-URL count drop` in dashboard polls. Discrepancies indicate the race fired.

### Pitfall 5: `operator:audit-log` 500-cap fills faster as Phase 32 adds prune entries

**What goes wrong:** The audit log SADD bounded set caps at 500 entries (`server/lib/operatorAudit.ts:36`). Today (replay-only) the rate is ~0-10 entries/day in normal operation; the cap is comfortable. Add a daily cron prune entry + occasional operator prunes and the eviction cadence shortens. Worse — if cron auto-prunes a non-zero count every day for a month, that's 30 entries/month from cron alone, plus operator manual prunes plus existing replay entries; oldest replay entries start evicting earlier than the 30d TTL would have rotated them.

**Why it happens:** Bounded set is bounded; new tags pull from the same pool.

**How to avoid:**
- This is **operationally acceptable** — the 30d TTL is a soft window, the 500 cap is a hard limit, and CONTEXT D-14 explicitly mirrors `/llm-replay`'s shape without a separate audit log. Documenting expected entry-rate change in the SUMMARY is enough.
- If the cap proves too tight, REDIS-OPT-03 (Phase 35) will already be re-classifying the audit log alongside other observability-only keys. Phase 32 doesn't need to pre-solve.
- DO NOT add a second audit-log set (`operator:prune-audit-log`) — defeats the unified `/api/operator-status` aggregator and forces the dashboard to merge two streams.

**Warning signs:** `/operator-status` `audit24h` rises noticeably; per-bearer entries skew toward the cron fingerprint.

### Pitfall 6: Chaos test (redis-death) fails unless every probe-write is wrapped in `cacheSetSafe`

**What goes wrong:** `server/__tests__/resilience/redis-death.test.ts` mocks the low-level Upstash client to throw on every call. Routes that hit Redis via `redis.set/get` directly return 500. Routes that use `cacheGetSafe/cacheSetSafe` succeed because the wrapper's `withTimeout` + try/catch falls through to the in-memory cache.

**Why it happens:** The 2s `REDIS_OP_TIMEOUT_MS` (`server/cache/redis.ts:107`) is the contract — anything that doesn't go through the safe wrapper bypasses it.

**How to avoid:**
- Every probe-write goes through `cacheSetSafe(key, value, ttlSec)`, never `redis.set(...)` directly.
- The sidecar count key (Pitfall 3) uses `redis.incr/decr` which is NOT covered by `cacheSetSafe`. Wrap those calls in try/catch + `Promise.race(... withTimeout(...))` manually OR accept that the count key degrades silently to "stale count" when Redis is unreachable (the dashboard shows the previous tick's count).
- The prune endpoint MUST tolerate Redis death — return 503 with `{ error: 'redis_unavailable' }` rather than 500. The chaos test will assert prune returns 200 OR 503, never 500 (line 19 of redis-death.test.ts).
- The schema test (D-22) does NOT exercise Redis; that's pure Zod.

**Warning signs:** Chaos test failure with status 500 on `POST /api/events/prune-dead-urls`. Fix is auditing every redis call site in the new handler for the safe-wrapper pattern.

## Code Examples

### Common Operation 1: Read `data.source` for a ConflictEventEntity (both raw GDELT and LLM v3)

```typescript
// Source: server/lib/llmExtractionPipeline.ts:471-501 (v3 path inherits via `...template`)
//         server/adapters/gdelt.ts:244 (raw GDELT writer)
//         src/components/detail/EventDetail.tsx:152 (UI oracle — what operator clicks)
// "Primary URL" definition for Phase 32:
function primaryUrl(entity: ConflictEventEntity): string | null {
  return entity.data.source && entity.data.source.length > 0 ? entity.data.source : null;
}
```

### Common Operation 2: Append a prune audit entry

```typescript
// Source: server/lib/operatorAudit.ts:69 + server/routes/events.ts:494-500
await appendOperatorAuditEntry({
  timestamp: Date.now(),
  bearerFingerprint: fingerprint,                  // for cron: literal 'cron:refresh-events' (D-11)
  operation: 'prune-dead-urls',                    // must widen union in operatorAudit.ts:49
  args: { trigger: 'cron' as const },              // D-14
  result: 'ok',
});
// D-14 strictly says `result: { prunedCount, prunedIds }` but the existing OperatorAuditEntry
// shape has `result: 'ok' | 'error'` + optional `errorMessage`. Two options for the planner:
//   (a) widen `result` to also accept `{ prunedCount: number; prunedIds: string[] }` — schema bump.
//   (b) stash prunedCount/Ids into `args` instead — preserves existing shape, contract test
//       at operator-status.ts still parses.
// Recommended: (b) — `args: { trigger, prunedCount, prunedIds }` — zero schema migration risk,
// satisfies D-14's intent (forensic record), and the `/operator-status` aggregator already
// passes `args` through to the dashboard via the broader entry shape.
```

### Common Operation 3: Bearer-gated endpoint shape (mirror of llm-replay)

```typescript
// Source: server/routes/events.ts:437-510 (llm-replay template)
eventsRouter.post('/prune-dead-urls', dashboardAuth, async (req, res) => {
  const fingerprint = bearerFingerprint(process.env.DASHBOARD_PASSWORD ?? '');
  const trigger = req.body?.trigger === 'cron' ? 'cron' : 'manual';

  // Cron caller (D-15 bypass) uses a synthetic fingerprint, skips quota.
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
    const result = await pruneDeadUrlEvents({ trigger });   // D-09 single helper
    await appendOperatorAuditEntry({
      timestamp: Date.now(),
      bearerFingerprint: trigger === 'cron' ? 'cron:refresh-events' : fingerprint,
      operation: 'prune-dead-urls',
      args: { trigger, prunedCount: result.prunedCount, prunedIds: result.prunedIds },
      result: 'ok',
    });
    return res.json(result);
  } catch (err) {
    return res.status(503).json({ error: 'prune_failed', detail: String(err).slice(0, 200) });
  }
});
```

### Common Operation 4: Zod schema with tiered TTL upper bound (D-22)

```typescript
// Source: scripts/snapshot-cron-watch.ts:85-110 pattern + D-19 + D-20
import { z } from 'zod';

export const UrlLivenessStatusSchema = z.enum(['live', '404', '403', 'dead-host', 'unknown']);
export type UrlLivenessStatus = z.infer<typeof UrlLivenessStatusSchema>;

export const UrlLivenessSchema = z
  .object({
    status: UrlLivenessStatusSchema,
    lastProbedAt: z.string().datetime(),
    /**
     * Monotonic accumulator across SUCCESSIVE probes where the status was
     * terminal-dead. Resets to 0 on any live or unknown transition.
     * Phase 32 D-12: cron auto-prune fires only when attemptCount >= 3.
     *
     * Researcher pick (Claude's Discretion §4): monotonic-with-reset-on-live
     * makes the "≥3 consecutive terminal-dead ticks" rule a one-line check
     * (`if (status terminal-dead && existing.attemptCount + 1 ...)`). Pure
     * monotonic-across-all-probes would conflate dead-then-live-then-dead
     * with three-in-a-row-dead and falsely auto-prune.
     */
    attemptCount: z.number().int().nonnegative(),
    lastUrlProbed: z.string().url(),
    lastHttpStatus: z.number().int().nullable(),
  })
  .strict();

export type UrlLiveness = z.infer<typeof UrlLivenessSchema>;

const TTL_SEC_BY_STATUS: Record<UrlLivenessStatus, number> = {
  live: 7 * 24 * 3600,         // 7d (D-20)
  '404': 24 * 3600,            // 24h (D-20)
  '403': 24 * 3600,            // 24h (D-20)
  'dead-host': 24 * 3600,      // 24h (D-20)
  unknown: 3600,               // 1h  (D-20)
};

export function ttlSecForStatus(status: UrlLivenessStatus): number {
  return TTL_SEC_BY_STATUS[status];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setInterval` cron in process | Vercel cron via `vercel.json crons[]` | Phase 13 (v1.0 deployment) | This phase piggybacks on the existing 04:00 UTC entry rather than adding a 4th — Hobby's 3-cron cap was lifted by Vercel Pro upgrade (Phase 29) but CONTEXT D-01 still chose piggyback for "minimal operational surface" |
| Fire-and-forget cache writes from `/api/events` | Cron-only writer discipline (anti-pattern #17) | Phase 27.4.6 | Phase 32 inherits the discipline; probe writes happen only inside the cron-handler `safeWaitUntil` IIFE |
| Direct `redis.get/set` in routes | `cacheGetSafe/cacheSetSafe` + in-memory fallback | Phase 13 + chaos test added Phase 28.2.7 | Phase 32 probe writes use `cacheSetSafe`; the chaos test will fail any new code that bypasses |
| `console.log` debug | `pino` via `logger.child(...)` | Phase 28.x | CLAUDE.md mandatory; phase code uses `logger.child({ module: 'urlLiveness' })` |
| Per-route handcoded auth | `dashboardAuth` middleware | Phase 27.4.4 | New prune endpoint mounts behind this verbatim |

**Deprecated/outdated:**

- The CONTEXT's reference to `data.sourceUrls[0]` for LLM v3 events (D-05). The persisted entity has `data.source` only — see Common Operation 1. Behavior is identical (one URL), implementation reads one field, not two.
- Any pattern of self-HTTP cron-to-endpoint invocation. Phase 27.4.6 explicitly removed the fire-and-forget IIFE from `/api/events` and routed everything through the shared helper. Phase 32 follows suit: cron calls `pruneDeadUrlEvents()` directly with `trigger: 'cron'`; the operator dashboard button POSTs the endpoint which then calls the same helper. See Discretion §3.

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** — every new module compiles under `tsc -b` with no errors; `type-coverage` ≥ 97% required.
- **Conventional commits** — `feat(32):` for new code, `fix(32):` for bug fixes, `docs(32):` for docs only, `chore(32):` for non-functional. CONTEXT carrying-forward §"Atomic per-decision commits" maps each D-N to its own commit.
- **Branch-per-phase from `main`** — `feature/32-ghost-event-url-liveness-dashboard-prune` cut from `main` before the first code commit. CONTEXT.md / DISCUSSION-LOG.md / RESEARCH.md may sit on the current branch as scaffold.
- **`logger.child({ module: ... })`** — never `console.*` in new code; `urlLiveness.ts` and `pruneQuota.ts` both get `const log = logger.child({ module: 'urlLiveness' })` / `{ module: 'pruneQuota' }`.
- **Active Redis key registry** — CLAUDE.md `## Serverless Cache` section must be updated to list `events:url-liveness:{eventId}` (per-event tiered-TTL), `events:url-liveness-count` (sidecar integer, recommended per Pitfall 3), and `operator:prune-quota:{fingerprint}:{date}` (INCR 48h). Land in the docs commit at end of phase.
- **Pitfall 1 cache bridge invariant** — `/api/events` continues to serve raw GDELT when `events:llm:v3` is empty. The prune handler mutates `events:llm:v3` (smaller); this does NOT break the bridge — bridge only triggers on empty.
- **No env-tunable probe knobs** (CONTEXT D-18 — domain constants for this phase). Don't add `VITE_PROBE_*` vars; don't extend `parseEnv()` Zod schema.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "primary URL" for LLM v3 events should be read from `entity.data.source` (the v1 template-inherited field), not `entity.data.sourceUrls[0]` | Summary, Common Operation 1, Anti-Patterns | If the planner reads CONTEXT D-05 literally and looks for `sourceUrls[0]`, the lookup returns `undefined` → entity skipped from probe sweep → silent zero-coverage of LLM v3 events. Surface this prominently in the plan |
| A2 | `attemptCount` semantics: monotonic-with-reset-on-live-or-unknown transition (Discretion §4) | D-22 code example, Common Operation 4 | If the planner picks pure-monotonic, the cron auto-prune rule (D-12 "≥3 consecutive ticks") fires after non-consecutive dead readings — false positives — and operator complains a flapping URL got auto-pruned |
| A3 | Sidecar `events:url-liveness-count` integer key is necessary (Pitfall 3) | Pitfall 3, Architecture diagram | If planner skips the sidecar, dashboard polls do N Redis GETs per session; Upstash command budget (already 92% per REDIS-OPT-04) tips into red. Alternative: dashboard polls less frequently than 30s, or computes count only on operator click |
| A4 | Cron's prune call uses the shared helper (`pruneDeadUrlEvents()` direct invocation), not self-HTTP (Discretion §3) | Discretion §3, Common Operation 3, Architecture diagram | If planner picks self-HTTP, audit-log shows two distinct call paths per cron tick (the probe + the self-call) and the deployment URL must be in env; testing requires either mocking `fetch` or running the local Express server. Direct invocation is simpler |
| A5 | D-22 schema test placement at `server/__tests__/lib/urlLiveness.schema.test.ts` (canonical) with a 5-line shim at `src/__tests__/lib/urlLiveness.schema.test.ts` for literal CONTEXT compliance | Recommended Project Structure note | If planner places ONLY at the `src/` path and runs jsdom env, the test is slower and exercises ESM cross-boundary imports that don't otherwise need testing. If planner places ONLY at server path, technically violates CONTEXT D-22 verbatim |
| A6 | The cron handler's wall-clock budget for the probe sweep is `cronStartTimestamp + 800_000 - 60_000` (Pitfall 1) | Pitfall 1, runProbeSweep signature | If the planner picks a smaller margin (e.g., 10s), the prune call after the probe sweep may itself get killed mid-`cacheSet`. Plan should pin the value with a comment tying it to the audit-log call + cacheSetSafe round-trip budget |
| A7 | Per-host throttle map (`Map<hostname, nextAllowedAt>`) is in-module memory, not Redis-backed | Pattern 1, Pitfall 2 | If planner Redis-backs it, each probe adds 2 round-trips (read prior + write new) — undoes the latency budget. In-module is fine for a once-daily cron; cold-start resets are acceptable |
| A8 | Cron auto-prune uses literal string `'cron:refresh-events'` as `bearerFingerprint` so audit-log entries unambiguously identify cron-vs-operator origin (D-11) | Common Operation 3 | If planner uses the operator's hashed fingerprint or skips the entry entirely, audit-log surface fails the "source unambiguous" intent of D-11 |
| A9 | Phase 32 introduces ZERO new npm dependencies (slopcheck N/A) | Package Legitimacy Audit | If planner sneaks in `linkinator`, `link-check`, or similar dead-link library, slopcheck must run AND the rationale (vs. the boring 30-LOC fetch we recommend) must defeat the existing "no `p-limit` because keep deps small" precedent. Default: keep boring |

## Open Questions

1. **Schema-test placement — server-side canonical with shim, or literal CONTEXT path?**
   - What we know: CONTEXT D-22 says `src/__tests__/lib/urlLiveness.schema.test.ts`. The codebase pattern is server-side (e.g., `server/__tests__/lib/freeClaudeRouter.test.ts`).
   - What's unclear: Did the operator intend the literal path or just "wherever schema tests live"?
   - Recommendation: Place canonical at `server/__tests__/lib/...` per established pattern, add a 5-line shim at the CONTEXT path that imports + re-runs the canonical assertions, comment cites D-22 + Phase 31's `snapshot-cron-watch.test.ts:1-15` precedent. Document in plan; ask operator to confirm at first review.

2. **Audit-log result shape — widen schema or stash in `args`?**
   - What we know: D-14 says `result: { prunedCount, prunedIds: string[] }`. Existing `OperatorAuditEntry.result` is `'ok' | 'error'`.
   - What's unclear: Does the planner have license to widen the type, or should the data live in `args`?
   - Recommendation: Stash in `args` (Common Operation 2 path b). Zero schema-migration risk to the existing audit-log, satisfies D-14's intent (the entry IS forensic — operator can drill in via `/operator-status` and see the IDs).

3. **Prune mutex — Redis-lock or accept the race?**
   - What we know: Pitfall 4 documents the GET→splice→SET race. Operator-click while cron-mid-prune scenario.
   - What's unclear: Operator's risk tolerance — silent partial-prune is acceptable to me as researcher; the planner should escalate.
   - Recommendation: Skip the mutex in v1, document the race in JSDoc + SUMMARY, add a "Phase 32 follow-up if a real overlap is observed" note. Per CONTEXT Deferred §"Soft-delete / tombstoning" — operator can re-extract via `/llm-replay` if a mis-prune happens, so the blast radius is recoverable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 runtime | All code | ✓ | 22.x [VERIFIED: `package.json:7` `"engines.node": "22.x"`] | — |
| Global `fetch` (undici under the hood) | Probe primitive | ✓ | built-in to Node 22 | — |
| `AbortController` | 10s timeout (D-18) | ✓ | built-in | — |
| Upstash Redis (REST) | All Redis ops | ✓ | `@upstash/redis ^1.37.0` | `cacheGetSafe`/`cacheSetSafe` in-memory fallback for reads; new code mirrors that |
| Vercel Pro `maxDuration: 800` | Probe sweep budget | ✓ | `vercel.json:18` confirmed | — (Pitfall 1: budget plumbing must respect deadline) |
| `dashboardAuth` middleware | Bearer gate | ✓ | `server/middleware/dashboardAuth.ts:31` | — |
| `appendOperatorAuditEntry` | Audit log | ✓ | `server/lib/operatorAudit.ts:69` | — |
| `checkReplayQuota` pattern | Quota counter | ✓ | `server/lib/replayQuota.ts:58` | Clone shape into `checkPruneQuota` |
| `createLimit` | Concurrency bound | ✓ | `server/lib/concurrencyLimit.ts:35` | — |
| `safeWaitUntil` | Cron background work | ✓ | `server/lib/safeWaitUntil.ts:62` (already wrapping the cron IIFE) | — |
| `pino` logger | Structured logging | ✓ | `^10.3.1` | — |
| `zod` for schema | D-22 contract test | ✓ | `^3.25.76` | — |
| Vitest + jsdom (frontend tests) | DevApiStatus button tests | ✓ | `vitest ^4.1.0`, `jsdom ^28.1.0` | — |
| `supertest` (route tests) | Endpoint integration tests | ✓ | `^7.2.2` | — |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** none

## Validation Architecture

> Required because `workflow.nyquist_validation` is not explicitly disabled (treat as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 (server: `--environment node`, frontend: `--environment jsdom`) |
| Config file | `vite.config.ts` (test config inline) |
| Quick run command | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts` |
| Full suite command | `npx vitest run` (covers all phase tests + existing 2193 baseline) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GHOST-02 | `events:url-liveness:{eventId}` schema (`{status, lastProbedAt, attemptCount, lastUrlProbed, lastHttpStatus}`) parses valid + rejects invalid | unit (zod schema) | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts` | ❌ Wave 0 — D-22 contract test |
| GHOST-02 | TTL upper bound per status (`live` ≤ 7d, dead ≤ 24h, unknown ≤ 1h) is asserted | unit | (same file as above) | ❌ Wave 0 |
| GHOST-05 | `createLimit(8)` correctly bounds in-flight requests (no more than 8 concurrent) | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "concurrency"` | ❌ Wave 0 |
| GHOST-05 | Per-host throttle waits ≥1s between requests to same hostname | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "per-host throttle"` | ❌ Wave 0 |
| GHOST-05 | 10s per-request timeout fires (mocked `fetch` returns hanging promise) | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "timeout"` | ❌ Wave 0 |
| GHOST-05 | HEAD → GET-with-Range fallback fires on 405 | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "HEAD then GET"` | ❌ Wave 0 |
| GHOST-05 | Redirect chain limit (≤3 hops; 4th hop returns `unknown`) | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "redirect"` | ❌ Wave 0 |
| GHOST-05 | User-Agent header is sent on every request | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "User-Agent"` | ❌ Wave 0 |
| GHOST-05 | DNS failure / ECONNREFUSED → `dead-host` (mocked `fetch` throws) | unit | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts -t "dead-host"` | ❌ Wave 0 |
| GHOST-04 | `POST /prune-dead-urls` returns 401 without Bearer in prod | integration (supertest) | `npx vitest run server/__tests__/routes/events.prune.test.ts -t "401 without bearer"` | ❌ Wave 0 |
| GHOST-04 | `POST /prune-dead-urls` returns 429 + Retry-After at 51st call/day per Bearer | integration | `npx vitest run server/__tests__/routes/events.prune.test.ts -t "quota"` | ❌ Wave 0 |
| GHOST-04 | Cron `trigger: 'cron'` bypasses quota | integration | `npx vitest run server/__tests__/routes/events.prune.test.ts -t "cron bypass"` | ❌ Wave 0 |
| GHOST-04 | Successful prune: events spliced from `events:llm:v3`; matching `events:url-liveness:*` keys DEL'd; audit entry written | integration | `npx vitest run server/__tests__/routes/events.prune.test.ts -t "splice and audit"` | ❌ Wave 0 |
| GHOST-04 | Cron auto-prune respects `attemptCount >= 3` (events with attemptCount < 3 not pruned) | integration | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts -t "attemptCount gate"` | ❌ Wave 0 |
| GHOST-03 | `/api/operator-status` response includes new `prune.deadUrlCount` field | integration (supertest) | `npx vitest run server/__tests__/routes/operator-status.test.ts -t "prune block"` | ❌ Wave 0 (extend existing) |
| GHOST-03 | DevApiStatus renders "Dead URL events: N" when `opStatus.prune.deadUrlCount > 0` | unit (jsdom) | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx -t "dead-url count"` | ❌ Wave 0 |
| GHOST-03 | Clicking "Prune N dead events" button issues `POST /api/events/prune-dead-urls` with operator Bearer | unit (jsdom) | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx -t "click prune"` | ❌ Wave 0 |
| GHOST-01 | Cron handler calls `runProbeSweep()` after `runRefreshExtraction` resolves AND then calls `pruneDeadUrlEvents({trigger:'cron'})` | integration | `npx vitest run server/__tests__/routes/refresh-events-cron.prune.test.ts -t "post-extraction sweep+prune"` | ❌ Wave 0 |
| GHOST-01, GHOST-04, GHOST-05 | Redis-death chaos: probe writes that throw don't crash cron handler; prune endpoint returns 503 not 500 | chaos | `npx vitest run server/__tests__/resilience/redis-death.test.ts -t "prune-dead-urls"` | ❌ Wave 0 (extend existing) |
| GHOST-02 | `pruneQuota` INCR-then-EXPIRE semantics (51st call returns allowed=false) | unit | `npx vitest run server/__tests__/lib/pruneQuota.test.ts` | ❌ Wave 0 (clone replayQuota.test.ts) |

### Sampling Rate
- **Per task commit:** `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts server/__tests__/lib/pruneQuota.test.ts` (~5s)
- **Per wave merge:** `npx vitest run server/__tests__/lib/urlLiveness.*.test.ts server/__tests__/routes/events.prune.test.ts server/__tests__/routes/refresh-events-cron.prune.test.ts` (~30s)
- **Phase gate:** `npx vitest run` (full suite green; ~3min on this codebase)

### Wave 0 Gaps

Wave 0 needs to create these test files **before** any production code lands:

- [ ] `server/__tests__/lib/urlLiveness.schema.test.ts` — D-22 contract test (Zod parse round-trip; TTL upper-bound assertion; rejects unknown status; rejects missing fields)
- [ ] `src/__tests__/lib/urlLiveness.schema.test.ts` — Literal CONTEXT D-22 path; 5-line shim that re-runs the server-side suite assertions (or full duplicate at planner's discretion)
- [ ] `server/__tests__/lib/urlLiveness.probe.test.ts` — Mocked-fetch matrix: 200/404/403/405-then-GET/3xx-chain/timeout/DNS-fail/User-Agent assertion
- [ ] `server/__tests__/lib/urlLiveness.sweep.test.ts` — `createLimit(8)` bound, per-host 1s throttle, deadline-skip, sweep priority sort (never-probed first, then oldest `lastProbedAt`)
- [ ] `server/__tests__/lib/urlLiveness.cronPrune.test.ts` — `attemptCount ≥ 3` gate for cron auto-prune, status taxonomy filtering
- [ ] `server/__tests__/lib/pruneQuota.test.ts` — Clone of `server/__tests__/lib/replayQuota.test.ts` structure (51st call → allowed:false; Retry-After header value; UTC-midnight reset)
- [ ] `server/__tests__/routes/events.prune.test.ts` — Supertest harness for Bearer gate, quota, cron-bypass, splice-and-audit-log assertion
- [ ] `server/__tests__/routes/refresh-events-cron.prune.test.ts` — Verify cron handler calls probe sweep + prune in the right order, inside `safeWaitUntil` envelope
- [ ] `src/__tests__/components/DevApiStatus.prune.test.tsx` — jsdom render test: dead-URL count display, button click → `fetch` POST assertion, in-flight state, 429 alert path
- [ ] Extend `server/__tests__/routes/operator-status.test.ts` — assert new `prune` field in response shape (or create if not present)
- [ ] Extend `server/__tests__/resilience/redis-death.test.ts` — add `POST /api/events/prune-dead-urls` to the asserted-routes list; assert 200 OR 503, never 500

No framework install needed — Vitest is already in `devDependencies` (`^4.1.0`).

## Security Domain

> `security_enforcement` is absent from config → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `dashboardAuth` middleware (`server/middleware/dashboardAuth.ts:31`) — constant-time Bearer compare via `timingSafeEqual` |
| V3 Session Management | no | Bearer is stateless; no server-side session |
| V4 Access Control | yes | Same Bearer gate; quota counter (`operator:prune-quota:*`) prevents abuse |
| V5 Input Validation | yes | Zod (`UrlLivenessSchema`) for read-side parse; `req.body?.trigger` whitelist for endpoint (only `'cron' \| 'manual'`) |
| V6 Cryptography | yes | `bearerFingerprint()` uses Node `createHash('sha256')` — built-in, never hand-roll. Bearer compare uses `timingSafeEqual` not `===` |
| V10 Configuration | yes | `DASHBOARD_PASSWORD` empty → 503 fail-closed (existing dashboardAuth behavior); `CRON_SECRET` empty → no auth on cron route (existing) |
| V11 SSRF (Server-Side Request Forgery) | **yes — load-bearing** | Probe makes outbound HTTP based on URL stored in cache. Threat: attacker controls a stored URL → probe issues request to internal infrastructure |
| V13 API & Web Service | yes | Endpoint is JSON in/out; no XML/SOAP parsing |

### Known Threat Patterns for {Node 22 + Express 5 + Upstash REST}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **SSRF via stored URL — probe hits localhost / internal IP / cloud metadata endpoint** | Tampering, Info Disclosure | `URL` parse + hostname allow-deny check: reject hosts that resolve to private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 incl. AWS/GCP metadata, ::1, fc00::/7). The probe runs INSIDE the Vercel sandbox — these private ranges shouldn't even be routable from Vercel's egress, but defense-in-depth. Skip the request entirely; tag as `unknown` |
| **Bearer brute force** | Spoofing | `dashboardAuth` already uses `timingSafeEqual`; `rateLimiters.public` 60/min bypassed only by valid Bearer (`server/middleware/rateLimit.ts:78-95`) so an unauthenticated brute-forcer is rate-limited by the public-tier limiter |
| **Replay-style DoS — operator clicks Prune 1000x to exhaust budget** | DoS | `operator:prune-quota:{fingerprint}:{date}` INCR-with-48h-TTL caps at 50/24h (D-15) — mirrors `/llm-replay` quota |
| **Cron replay (CRON_SECRET leak)** | Spoofing | Cron route at `server/routes/refresh-events-cron.ts:40-52` uses `timingSafeEqual` on `CRON_SECRET`; same pattern Phase 32 inherits without modification |
| **Audit log spoofing — caller sets bearerFingerprint** | Repudiation | `bearerFingerprint` is computed server-side from `DASHBOARD_PASSWORD` (`appendOperatorAuditEntry` caller controls the value but only one identity exists for the operator's Bearer); cron caller uses literal `'cron:refresh-events'` so source is unambiguous |
| **Prune endpoint deletes events maliciously** | Integrity | Bearer gate + audit log + 50/24h quota; prune is recoverable via `/llm-replay` against the source groupKey (CONTEXT Deferred §"Soft-delete") |
| **HEAD/GET request hangs probe forever** | DoS | 10s `AbortController` timeout (D-18) per request × 3 hops max = 30s upper bound per URL; deadline check in sweep loop caps the whole pass |
| **Probe-induced bandwidth exhaustion** | DoS | HEAD-first (zero body); GET fallback uses `Range: bytes=0-1023` (~1KB cap) |
| **Honest-citizen revolt — publisher blocks our IP after seeing too many probes** | Availability | Per-host 1 req/s throttle + ±200ms jitter + identifying User-Agent (D-21 — gives publishers a contact path to ask us to stop). 8-concurrent global cap means even a worst-case all-same-host backlog never exceeds 1 req/s/host |

**SSRF mitigation — recommended implementation:**

```typescript
// Source: defense-in-depth derived from V11 ASVS guidance.
// Add to urlLiveness.ts BEFORE the first fetch call.
const PRIVATE_HOST_REGEX = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|fc|fd)/i;
function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_REGEX.test(hostname);
}

// inside probeUrl:
const host = new URL(url).hostname;
if (isPrivateHost(host)) {
  return { status: 'unknown', httpStatus: null, finalUrl: url };
}
```

This is not a CONTEXT-locked decision — the planner should add it as a Wave 1 micro-task; the regex is intentionally over-conservative (false-positive risk: a legitimate `*.internal.example.com` would be skipped, but GDELT sources rarely have such hostnames).

## Suggested Wave/Plan Decomposition

Recommended **5 plans**, dependencies as labeled. Each plan is a wave-shaped slice (Wave 0 tests + Wave 1 production code + Wave 2 wire-up + Wave 3 docs commit).

### Plan 32-01 — Schema, Probe Primitive, Quota Helper (Wave 0 + foundational Wave 1)

**Scope:**
- D-19 Redis key shape + D-22 Zod schema (`UrlLivenessSchema`, `UrlLivenessStatus`)
- D-20 tiered TTL (`ttlSecForStatus`)
- D-22 contract test at both server canonical + CONTEXT path shim (resolves Open Question 1)
- D-15 prune quota helper (`server/lib/pruneQuota.ts`) — verbatim port of `replayQuota.ts` shape
- Tests for both modules
- Widen `OperatorAuditEntry.operation` union to add `'prune-dead-urls'` (single-line change + type-coverage check)

**Files touched:** `server/lib/urlLiveness.ts` (new, schema + ttl only), `server/lib/pruneQuota.ts` (new), `server/lib/operatorAudit.ts` (modify union), 4 new test files

**Why first:** Pure-function modules with zero Redis-network side effects. Contract test pins schema before any writer exists, so all subsequent plans compile against the locked shape.

**Decisions covered:** D-15, D-19, D-20, D-22, plus the audit-log union widening

**Commits:** `feat(32): UrlLiveness schema + ttl + contract test` / `feat(32): pruneQuota helper` / `chore(32): widen OperatorAuditEntry.operation union`

### Plan 32-02 — Probe Primitive (`probeUrl`, `runProbeSweep`)

**Scope:**
- D-16 HEAD → GET-with-Range fallback on 405
- D-17 redirect-follow ≤3 hops with terminal-status win
- D-18 polite-citizen knobs: 10s timeout, `createLimit(8)`, per-host 1s throttle, ±200ms jitter, no retry
- D-21 User-Agent header
- SSRF guard (researcher-added, not in CONTEXT)
- Sweep deadline budget plumbing (Pitfall 1 mitigation)
- Sweep priority sort (D-04 never-probed first, then oldest `lastProbedAt`)
- Mocked-fetch test matrix for all of the above

**Files touched:** `server/lib/urlLiveness.ts` (add `probeUrl`, `runProbeSweep`, host-throttle map), 2 new test files

**Dependencies:** Plan 32-01 (schema + ttl)

**Decisions covered:** D-03 (best-effort partial), D-04 (sweep priority), D-07 (status taxonomy), D-16, D-17, D-18, D-21

**Commits:** atomic per concern — `feat(32): probeUrl HEAD-then-GET with redirect cap` / `feat(32): runProbeSweep with createLimit(8) + per-host throttle` / `feat(32): SSRF guard for probe URLs` / `feat(32): sweep priority sort` / `feat(32): probe deadline budget`

### Plan 32-03 — Prune Endpoint + Cron Wire-Up

**Scope:**
- D-09 `POST /api/events/prune-dead-urls` route mounted behind `dashboardAuth` in `server/routes/events.ts`
- D-11 cron auto-prune call (direct helper invocation, not self-HTTP — Discretion §3)
- D-12 `attemptCount >= 3` gate inside `pruneDeadUrlEvents` when `trigger: 'cron'`
- D-13 delete scope (events array splice + url-liveness DEL only; nothing else touched)
- D-14 audit-log entry per call (with `args: {trigger, prunedCount, prunedIds}` per Common Operation 2 path b — Open Question 2)
- D-15 quota check on `trigger: 'manual'` only; cron bypass
- D-02 wire `runProbeSweep` + `pruneDeadUrlEvents({trigger:'cron'})` calls into the cron handler INSIDE the existing `safeWaitUntil` body in `runRefreshExtraction` — recommended approach is to extend `RunRefreshResult` with `probeResult` + `pruneResult` optional fields and add the sweep+prune steps in `llmExtractionPipeline.ts` itself rather than the route handler (keeps `safeWaitUntil` envelope intact)
- Supertest harness for the endpoint
- Cron integration test
- Redis-death chaos test extension

**Files touched:** `server/routes/events.ts` (add route), `server/lib/urlLiveness.ts` (add `pruneDeadUrlEvents`), `server/lib/llmExtractionPipeline.ts` (extend `safeWaitUntil` body with post-extraction probe+prune calls), 3 new test files + 1 extension

**Dependencies:** Plan 32-02 (sweep), Plan 32-01 (schema/quota/audit)

**Decisions covered:** D-02, D-09, D-11, D-12, D-13, D-14 (resolved via path b), D-15 (manual quota + cron bypass)

**Commits:** `feat(32): POST /api/events/prune-dead-urls behind dashboardAuth` / `feat(32): pruneDeadUrlEvents helper with attemptCount gate` / `feat(32): cron post-step calls runProbeSweep + auto-prune` / `test(32): redis-death chaos covers prune endpoint`

### Plan 32-04 — Operator-Status Extension + Dead-URL Count Sidecar

**Scope:**
- Add `events:url-liveness-count` sidecar integer key (Pitfall 3 mitigation; resolves Open Question / Assumption A3)
- Maintain it from the probe writer (INCR on live→terminal-dead transition, DECR on terminal-dead→non-terminal, DECR on prune)
- Extend `/api/operator-status` response with new `prune: { deadUrlCount, last24hPrunes }` block (siblings of existing `audit24h`, `byBearer`, `advEval`)
- Don't break existing aggregator contract test
- Test extension

**Files touched:** `server/lib/urlLiveness.ts` (count-key maintenance), `server/routes/operator-status.ts` (extend response), test extension

**Dependencies:** Plan 32-03

**Decisions covered:** D-08 (dashboard count = primary URL dead — surfaced via the count key; latest-status-wins implicit), D-14 (last24hPrunes derives from existing audit-log scan)

**Commits:** `feat(32): events:url-liveness-count sidecar key for O(1) dashboard count` / `feat(32): /api/operator-status prune block`

### Plan 32-05 — Dashboard Surface (DevApiStatus button + drill-down)

**Scope:**
- D-10 "Prune N dead events" button in Operator Actions block (`src/components/ui/DevApiStatus.tsx:1475-1540`)
- Dead-URL count row
- Drill-down list (operator can click to see which eventIds are flagged)
- In-flight state (button disabled + spinner) — mirror existing "Run replay probe" UX (line 1542 area)
- Result toast for success / 429 / 503
- Confirmation modal — Discretion §3: skip the modal, mirror replay probe's one-click model; surface result via the 24h-actions row updating on next poll cycle
- Re-use `dashboardAuthHeaders()` for the POST request
- jsdom test coverage

**Files touched:** `src/components/ui/DevApiStatus.tsx`, 1 new test file

**Dependencies:** Plan 32-04 (operator-status payload extension)

**Decisions covered:** D-10, plus the Discretion §3 UX mirror

**Commits:** `feat(32): DevApiStatus dead-URL count + drill-down` / `feat(32): Prune N dead events button` / `test(32): jsdom render + click flow`

### Plan 32-06 — Docs & Close

**Scope:**
- Update CLAUDE.md "Serverless Cache" key registry to add `events:url-liveness:{eventId}`, `events:url-liveness-count`, `operator:prune-quota:{fingerprint}:{date}`
- Update `.env.example` if any new env vars (NONE per D-18 — verify and confirm)
- `32-SUMMARY.md` with file changes, decisions executed, audit-log shape, runbook note (operator how-to: "If you see Dead URL events > 0 on the dashboard, click Prune; otherwise the daily cron handles it at 04:00 UTC")
- `32-VERIFICATION.md` mapping each D-N to its test
- ROADMAP `[ ] Phase 32` → `[x]` + REQUIREMENTS GHOST-01..05 → Complete
- STATE.md update

**Dependencies:** Plans 32-01..32-05

**Decisions covered:** All carrying-forward items + close artifact

**Commits:** `docs(32): CLAUDE.md Redis registry adds url-liveness keys` / `docs(32): phase summary` / `docs(32): phase verification` / `docs(32): roadmap + requirements + state`

### Plan dependency graph (ordering)

```
   01 ──┬──> 02 ──> 03 ──> 04 ──> 05 ──> 06
        │
        └─────────────> 03 (pruneQuota import only)
```

Plans 01 → 02 → 03 → 04 → 05 → 06 is the only viable order. Parallel-safe lanes: none (each plan depends on the previous). Estimated wall-clock under standard pace: 5-8 hours; under aggressive pace with strong test-first discipline: 4 hours.

## External docs (only what changes a decision)

- **IETF link-rot pragmatics** — no formal RFC covers the "polite link-checker" pattern; the de-facto convention (HEAD-first; identify in User-Agent with contact URL; per-host throttle; obey robots.txt where relevant) is what mainstream scanners like Lychee and Linkinator implement. Phase 32 does not implement robots.txt checking — out of scope per the CONTEXT lock; if a publisher blocks our User-Agent, we'll see `403` consistently and the operator can manually prune. [CITED: convention recap, not a specific RFC]
- **HTTP 405 on HEAD** — common on Cloudflare/Akamai-fronted endpoints, especially for `Range`-requested content; the HEAD-then-GET fallback (D-16) is the standard mitigation. [CITED: MDN HTTP/1.1 Methods reference + common CDN behavior; no new URL needed]
- **Node 22 `fetch`** — Node 22 ships undici under the hood as the global `fetch`, with full `AbortController` and `redirect: 'manual'` support; no shim needed. [VERIFIED via package.json `engines.node: "22.x"`]
- **Vercel `maxDuration: 800` cron behavior** — Vercel docs confirm that a Pro-plan cron invocation runs for up to `maxDuration` seconds; `waitUntil`-wrapped work survives `res.end()` and continues running inside the function instance until that wall-clock limit. [CITED: existing Phase 28.2.6 Plan 02 research recorded in `server/lib/safeWaitUntil.ts:1-50`]

These do not change any locked decision; they confirm the chosen approach is industry-standard.

## Sources

### Primary (HIGH confidence)
- `/Users/zackmaz/Desktop/otg-iran-monitor/.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-CONTEXT.md` — 22 locked decisions
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/middleware/dashboardAuth.ts:31` — Bearer middleware
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/operatorAudit.ts:62,69` — fingerprint + audit log
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/replayQuota.ts:58` — quota pattern template
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/concurrencyLimit.ts:35` — `createLimit`
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/cache/redis.ts:107-216` — safe wrapper with 2s timeout
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/safeWaitUntil.ts:62` — Vercel shim
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmExtractionPipeline.ts:171-444` — `runRefreshExtraction`
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/routes/events.ts:437-510` — `/llm-replay` template
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/routes/operator-status.ts:77-154` — aggregator
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/routes/refresh-events-cron.ts:34-80` — cron handler
- `/Users/zackmaz/Desktop/otg-iran-monitor/src/components/ui/DevApiStatus.tsx:1475-1540` — Operator Actions block
- `/Users/zackmaz/Desktop/otg-iran-monitor/src/components/detail/EventDetail.tsx:152-163` — "View source" canonical anchor
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmExtractionPipeline.ts:441-505` — `enrichedV3ToEntities` (confirms `sourceUrls` NOT persisted to entity)
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/adapters/gdelt.ts:244` — raw GDELT `source` field
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/types.ts:42-88` — `ConflictEventEntity.data` shape (no `sourceUrls` field)
- `/Users/zackmaz/Desktop/otg-iran-monitor/package.json:53-123` — dependency manifest
- `/Users/zackmaz/Desktop/otg-iran-monitor/vercel.json` — `maxDuration: 800`, cron schedules
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/__tests__/resilience/redis-death.test.ts` — chaos test contract
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/__tests__/scripts/snapshot-cron-watch.test.ts:1-110` — schema-pinning pattern (D-22 template)

### Secondary (MEDIUM confidence)
- IETF link-checker norms (no single canonical RFC; convention recap from Lychee/Linkinator docs)
- Vercel `waitUntil` semantics (re-confirmed from project's existing safeWaitUntil JSDoc)

### Tertiary (LOW confidence)
- None — Phase 32 is entirely covered by primary in-repo sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive is already in the repo, version-pinned
- Architecture: HIGH — five plans map 1:1 to existing pattern templates
- Pitfalls: HIGH — the six identified pitfalls are based on read of the existing chaos test, the SafeWaitUntil docstring's own pitfall list, and the operator-status aggregator's existing N-key-aggregation problem

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days for stable; project conventions are stable across the v1.5 milestone, no expected churn in dashboardAuth/audit-log/operator-status surfaces)

## RESEARCH COMPLETE
