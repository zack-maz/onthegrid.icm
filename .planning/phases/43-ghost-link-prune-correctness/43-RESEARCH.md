# Phase 43: Ghost Link Prune Correctness - Research

**Researched:** 2026-06-09
**Domain:** Server-side URL-liveness probing (Node undici fetch, soft-404 body heuristics, Zod schema migration, Redis sidecar bookkeeping)
**Confidence:** HIGH (every claim grounded in the codebase under change; zero new dependencies; the 22 CONTEXT decisions are already prescriptive)

## Summary

Phase 43 amends one file — `server/lib/urlLiveness.ts` (901 lines) — plus its four test files, the operator-status drill-down type, and three contract surfaces (CLAUDE.md registry line, `redis-keys.md`, the schema-test shim). There are **no new runtime or dev dependencies**: the soft-404 heuristic uses the existing Node `fetch` (undici on Node 25.6.1) and a generalization of the `Range`-capped GET helper (`fetchOnce`) that already exists for the 405 fallback. The work is a surgical extension of a mature, well-tested module: 5 status-taxonomy/schema additions, one new field, two semantic tweaks (attemptCount reset rule + cron-only 403 exclusion), one new explicit-classification path for source-less events, and an evidence-string everywhere.

The CONTEXT decisions (D-01..D-22) are unusually complete and were gathered in auto-recommend mode — they already make every gray-area call. This research's job is therefore **verification, not exploration**: confirm the code-level integration points the decisions assume, confirm the "writer-only Zod-parse" claim that makes the schema migration safe, enumerate exactly which test assertions each decision forces to change, and pin the soft-404 body-heuristic mechanics against real-world publisher/CDN behavior so the planner can write precise task actions.

**Primary recommendation:** Implement as an in-place extension of `urlLiveness.ts` following the existing `__test__`-gated, degrade-open, `.strict()`-schema-pinned patterns. Extract the soft-404 body heuristic as a pure exported-for-test function (`classifySoft404(body, finalUrl, originalUrl) → {isSoft404, evidence}`) so it gets a dedicated table-driven test without going through `fetch`. Gate every new status and the new field behind the schema test + shim in the same commit (the `.strict()` schema fails the next `vitest run` otherwise). Treat the GHOST-09 403 decision as evidence-gated: pre-register demotion-to-manual-only as the expected outcome (D-14) but make the implementation a one-line `trigger === 'cron'` filter inside `pruneDeadUrlEvents`, NOT an `isTerminalDead` change.

## Architectural Responsibility Map

| Capability                        | Primary Tier                                                | Secondary Tier                          | Rationale                                                                                |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Soft-404 body heuristic           | API / Backend (`urlLiveness.ts` probe)                      | —                                       | Pure server-side HTML inspection; no client involvement; runs inside Vercel cron sandbox |
| Source-less event classification  | API / Backend (`buildProbeCandidates`)                      | —                                       | Candidate-builder owns event→probe-target mapping; no fetch issued for `no-url`          |
| attemptCount reset semantics      | API / Backend (`persistLiveness`)                           | Redis (storage of `attemptCount`)       | Writer derives next count from prior stored entry; Redis only stores                     |
| Cron-only 403 exclusion           | API / Backend (`pruneDeadUrlEvents` filter)                 | —                                       | Prune-filter-local discriminator on `opts.trigger`; deliberately NOT in `isTerminalDead` |
| Evidence string persistence       | API / Backend (`persistLiveness` writer)                    | Redis (`events:url-liveness:{eventId}`) | Writer composes the human string; Redis stores; Phase 44 (client) renders verbatim       |
| Evidence/soft-404 server exposure | API / Backend (`/api/operator-status` `DeadUrlSampleEntry`) | —                                       | Server-side type widening only; no client UI work this phase (D-19)                      |

**Tier note:** This is a 100%-backend phase. The only "client-adjacent" surface is the literal-path schema-test shim under `src/__tests__/` (a vitest discovery artifact, not client code) and the `DeadUrlSampleEntry` type widening that Phase 44's UI will later consume. No browser/SSR/CDN tier is touched.

## Standard Stack

**No new packages.** This phase adds zero runtime and zero dev dependencies. Every capability is built on what is already imported in `urlLiveness.ts`.

### Core (already present — verified by reading the import block)

| Library                     | Version       | Purpose                                           | Why Standard                                                                                                                                  |
| --------------------------- | ------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod`                       | (project pin) | `.strict()` schema for `UrlLiveness`; status enum | Already the contract mechanism (D-22); schema test fails on drift `[VERIFIED: server/lib/urlLiveness.ts:35]`                                  |
| Node `fetch` (undici)       | Node 25.6.1   | HEAD/GET probe + capped body read                 | Built-in; `Response.body` is a `ReadableStream` so a manual reader + abort at the 16 KiB cap is viable `[VERIFIED: node --version → v25.6.1]` |
| `@upstash/redis`            | `^1.37.0`     | sidecar count, SCAN, DEL                          | Already used; SCAN signature `Promise<[string\|number, string[]]>` pinned inline `[VERIFIED: server/lib/urlLiveness.ts:793]`                  |
| `pino` (via `logger.child`) | (project pin) | degrade-open `log.warn`/`log.info`                | Module already binds `log = logger.child({module:'urlLiveness'})` `[VERIFIED: server/lib/urlLiveness.ts:163]`                                 |

### Alternatives Considered

| Instead of                               | Could Use                                           | Tradeoff                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual reader + abort on `Response.body` | `node-html-parser` / `cheerio` for title extraction | New dependency; CONTEXT D-20 forbids new surfaces and the heuristic is title-substring + length only — a DOM parser is overkill and slower. Use a cheap regex `<title>...</title>` capture against the decoded 16 KiB head. `[ASSUMED]` (regex-vs-parser is Claude's discretion per D-discretion) |
| Inline heuristic in `probeUrl`           | Pure exported `classifySoft404()` helper            | Pure function is far more testable (table-driven test with no `fetch` mock) — CONTEXT discretion explicitly prefers this "but follow what reads cleanest." Recommend the pure function.                                                                                                           |

**Installation:** None.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** All code is built on existing project dependencies (`zod`, `@upstash/redis`, `pino`, Node built-in `fetch`). No `npm install` step appears in any plan for this phase. Per the legitimacy protocol, a phase that installs nothing has nothing to audit.

## Architecture Patterns

### System Architecture Diagram

```
                          /api/cron/refresh-events  (daily 04:00 UTC, sole writer)
                                       │
                                       ▼
                      runRefreshExtraction()  ── finally block ──┐
                                                                 │
                          ┌──────────────────────────────────────┘
                          ▼
            ┌─────────────────────────────┐   reads events:llm:v3
            │  buildProbeCandidates()      │◄──────────────────────────┐
            │  ── NOW: emit `no-url` entry │                            │
            │     for source-less events   │   events:llm:v3 (cache)    │
            │     (write once, no fetch)   │                            │
            └──────────────┬──────────────┘                            │
                           │ [{eventId, url}]  (+ writes no-url keys)   │
                           ▼                                            │
            ┌─────────────────────────────┐                            │
            │  runProbeSweep()             │  createLimit(8) +          │
            │  per task:                   │  per-host 1req/s throttle  │
            │   probeUrl(url) ─────────────┼──► HEAD ──200──► capped GET (Range 16KiB)
            │   persistLiveness(...)       │       │ 404/403         │   │
            └──────────────┬──────────────┘       │ 3xx→home        ▼   │
                           │                       │           classifySoft404()
                           │ writes               ▼            (markers / redirect-home / near-empty)
                           ▼            events:url-liveness:{id}        │
            ┌─────────────────────────────┐  {status, evidence,        │
            │  persistLiveness writer      │   attemptCount, ...}       │
            │  ── NOW: evidence string     │      + sidecar count       │
            │  ── NOW: unknown PRESERVES   │      (events:url-liveness-count)
            │     attemptCount; live=0     │                            │
            └──────────────┬──────────────┘                            │
                           ▼                                            │
            ┌─────────────────────────────┐                            │
            │  pruneDeadUrlEvents()        │  reads liveness keys ──────┘
            │  ── isTerminalDead gate      │  splices events:llm:v3
            │  ── cron: attemptCount>=3    │  DELs liveness keys
            │  ── NOW: cron skips 403      │  DECRs sidecar
            │     (D-15, if demoted)       │  appends operator:audit-log
            └─────────────────────────────┘
                           │
                           ▼  (separate read path, no Zod parse)
            /api/operator-status → buildDeadUrlSample() → DeadUrlSampleEntry
                                   ── NOW: + evidence, + soft-404 in union
```

### Recommended Project Structure

No new files. All edits land in:

```
server/lib/urlLiveness.ts                          # all probe/sweep/prune/schema logic
server/routes/operator-status.ts                   # DeadUrlSampleEntry widening (type only)
server/__tests__/lib/urlLiveness.schema.test.ts    # status enum + evidence field + TTL pins
server/__tests__/lib/urlLiveness.probe.test.ts     # soft-404 taxonomy cases + Range 16KiB assert
server/__tests__/lib/urlLiveness.sweep.test.ts     # attemptCount unknown-preserve + no-url classify
server/__tests__/lib/urlLiveness.cronPrune.test.ts # 403 cron-exclusion + unknown-excluded pin
src/__tests__/lib/urlLiveness.schema.test.ts       # literal-path shim (mirror new pins)
docs/architecture/redis-keys.md                    # value-shape + status-taxonomy + TTL doc
CLAUDE.md (§Serverless Cache registry line)        # status taxonomy / evidence / attemptCount semantics
```

Optionally (Claude's discretion D-discretion): `scripts/sample-pruned-urls.ts` for the GHOST-09 evidence sample (or document it as a one-off — the recorded results in the verification doc are what matter).

### Pattern 1: Pure heuristic helper exported for test

**What:** Extract soft-404 detection as `classifySoft404(bodyText, finalUrl, originalUrl): { soft404: boolean; evidence: string | null }`. Called inside `probeUrl`'s 200 branch after the capped GET.
**When to use:** Any deterministic transform that warrants table-driven tests without fetch mocking.
**Example:**

```typescript
// Source: pattern derived from existing __test__-gated export at urlLiveness.ts:897
// Three signals evaluated in CONTEXT D-02 order; precision-first tie-break (D-03).
export function classifySoft404(
  bodyText: string,
  finalUrl: string,
  originalUrl: string,
): { soft404: boolean; evidence: string | null } {
  // (a) not-found markers — case-insensitive against <title> + body head
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(bodyText)?.[1] ?? '';
  for (const marker of NOT_FOUND_MARKERS) {
    if (title.toLowerCase().includes(marker)) {
      return { soft404: true, evidence: `soft-404: matched "${marker}" in title` };
    }
  }
  // (b) redirect-to-home — final path is "/" or single-segment AND original was deeper
  const origDepth = new URL(originalUrl).pathname.split('/').filter(Boolean).length;
  const finalPath = new URL(finalUrl).pathname;
  const finalDepth = finalPath.split('/').filter(Boolean).length;
  if (origDepth >= 2 && finalDepth <= 1) {
    return {
      soft404: true,
      evidence: `redirect-to-home: ${new URL(originalUrl).pathname} → ${finalPath}`,
    };
  }
  // (c) near-empty content
  const contentLen = bodyText.replace(/<[^>]+>/g, '').trim().length;
  if (contentLen < NEAR_EMPTY_FLOOR_BYTES) {
    return { soft404: true, evidence: `near-empty: ${contentLen} bytes` };
  }
  // D-03 precision-first: no unambiguous signal → live, evidence null.
  return { soft404: false, evidence: null };
}
```

_(This is a recommended shape, `[ASSUMED]` exact wording — the planner/executor refine markers and the body-vs-title split. The `evidence` literal formats follow D-16's examples verbatim.)_

### Pattern 2: Capped GET body read (generalize existing `fetchOnce`)

**What:** The existing `fetchOnce` (`urlLiveness.ts:245-262`) already sets `Range: bytes=0-1023` for the 405-fallback GET. Soft-404 needs a 16 KiB (`0-16383`) read PLUS a manual `Response.body` reader that aborts at the cap for servers that ignore `Range`.
**Why the manual abort matters:** Some CDNs (Cloudflare, Fastly, many WordPress hosts) ignore `Range` on `text/html` and return the full body with `200 OK` (not `206 Partial Content`). Without a manual cap you download the whole article. Read chunks from `res.body!.getReader()`, accumulate into a byte budget, and `controller.abort()` / break once you cross 16384 bytes.
**Example:**

```typescript
// Source: generalized from urlLiveness.ts:245 fetchOnce; undici ReadableStream on Node 25
async function readCappedBody(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {}); // releases the connection for servers ignoring Range
  }
  // Charset: assume UTF-8 (TextDecoder default, fatal:false tolerates truncated multibyte at the cap).
  return new TextDecoder('utf-8', { fatal: false }).decode(concatU8(chunks).subarray(0, maxBytes));
}
```

**Charset pitfall:** Decode with `TextDecoder('utf-8', { fatal: false })` so a multibyte character split across the 16 KiB boundary doesn't throw — markers are ASCII so partial-tail garbling is harmless. Do NOT honor exotic `Content-Type; charset=` values; OSINT-scale title markers are English/ASCII and the conservative-precision posture (D-03) means a mis-decoded body simply yields no marker → `live`. `[VERIFIED: undici Response.body is a WHATWG ReadableStream on Node ≥18; confirmed Node 25.6.1]`

### Pattern 3: `no-url` explicit classification (GHOST-07 / D-06..D-09)

**What:** `buildProbeCandidates` currently _silently drops_ events with empty/missing `data.source` (`urlLiveness.ts:599-604`). Change: for each such event, call `persistLiveness` (or a thin no-fetch variant) once per tick to write a `no-url` entry, then continue. `no-url` is NOT terminal-dead and is excluded from the sidecar count and both prune paths.
**Schema implication:** `lastUrlProbed` must become `z.string().url().nullable()` (null for `no-url`); `lastHttpStatus` stays null; `attemptCount` 0.
**Key tension to resolve in planning:** `buildProbeCandidates` returns `Array<{eventId, url}>` and does NOT currently write anything. Writing `no-url` entries means either (a) `buildProbeCandidates` gains a side effect (write no-url keys for source-less events before returning), or (b) a new step. The cleanest fit is (a) — it already reads every event and already has `persistLiveness` in-module. The sweep counter `classifiedNoUrl` (D-09) then comes from `buildProbeCandidates`'s return, threaded into the cron log line at `llmExtractionPipeline.ts:651`.

### Anti-Patterns to Avoid

- **Folding `soft-404` into `404`:** D-04 mandates a distinct enum value so Phase 44 gets per-bucket counts for free and evidence stays honest. Do not collapse.
- **Putting the 403 cron-exclusion in `isTerminalDead`:** `isTerminalDead` is the shared predicate for the sidecar count, dashboard sample, AND prune. Changing it would silently drop 403 from the dashboard count and manual prune too. D-15 requires the exclusion be a prune-filter-local `trigger === 'cron'` check. `[VERIFIED: urlLiveness.ts:442 isTerminalDead is shared by count (528), prune (814), sample (operator-status.ts:237)]`
- **Pruning `no-url` events:** D-08 — pruning an event merely for lacking a URL makes prune MORE aggressive, which the phase goal forbids. Explicit classification ≠ prune eligibility.
- **Aggressive soft-404 marker list:** D-03 precision-first. A marker like just "error" or "not found" appearing anywhere in body text would false-positive on legitimate articles _about_ 404s or errors. Match markers against the `<title>` primarily; keep the body-text match list tiny and unambiguous.

## Don't Hand-Roll

| Problem                 | Don't Build                      | Use Instead                                                              | Why                                                                            |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Capped body download    | Custom socket-level byte limiter | Existing `fetchOnce` + `Response.body.getReader()` loop with byte budget | undici already gives a WHATWG stream; reuse the 405-fallback `fetchOnce` shape |
| HTML title extraction   | Full DOM parser (cheerio)        | Single regex `/<title[^>]*>([^<]*)<\/title>/i` over the 16 KiB head      | No new dep (D-20); markers are substring matches, not DOM queries              |
| Schema drift detection  | Manual review                    | The existing `.strict()` Zod schema + paired schema test + shim          | Already the project's mechanical drift gate (D-22 precedent)                   |
| Redis count consistency | New counter logic                | Existing sidecar INCR/DECR + floor-at-0 pattern in `persistLiveness`     | `soft-404` joins via `isTerminalDead`; no new bookkeeping                      |
| Cursor SCAN iteration   | New SCAN loop                    | Existing `pruneDeadUrlEvents` / `buildDeadUrlSample` SCAN pattern        | Upstash signature already pinned with `as` cast                                |

**Key insight:** Almost everything this phase needs already exists in `urlLiveness.ts` in adjacent form. The work is extension and re-wiring, not invention — which is exactly why the asymmetric error budget (never prune a live link) is achievable: the conservative machinery is already there and battle-tested by Phase 32's full test suite.

## Runtime State Inventory

> This is not a rename/refactor phase, but it IS a schema-migration phase touching stored Redis state. The categories below are answered for migration safety.

| Category            | Items Found                                                                                                                                                                                                                  | Action Required                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | `events:url-liveness:{eventId}` entries (~5000 in prod sample, per `redis-keys.md:29`) lack the new `evidence` field and use the old `attemptCount` reset rule. `lastUrlProbed` is currently non-null on every stored entry. | **No data migration needed.** D-17: all liveness TTLs are ≤7d so the entire population turns over within a week. Old entries lacking `evidence` are never re-parsed by a reader (see below), and the writer always sets it going forward. |
| Live service config | None — no external service stores this string.                                                                                                                                                                               | None.                                                                                                                                                                                                                                     |
| OS-registered state | None.                                                                                                                                                                                                                        | None.                                                                                                                                                                                                                                     |
| Secrets/env vars    | None — D-20 forbids new env surfaces; all thresholds are hard-coded module constants.                                                                                                                                        | None.                                                                                                                                                                                                                                     |
| Build artifacts     | None — server code is tsup-bundled to `api/vercel-entry.js` at deploy; no stale artifact carries the old schema.                                                                                                             | Normal `npm run build` redeploys.                                                                                                                                                                                                         |

**Critical migration-safety finding — "writer-only Zod-parse" CONFIRMED:**
The only place `UrlLivenessSchema.parse()` runs at runtime is the **writer** (`persistLiveness`, `urlLiveness.ts:519`). Both readers — `buildProbeCandidates` (`:605`) and `pruneDeadUrlEvents` (`:809`) plus the operator-status `buildDeadUrlSample` (`:234`) — read via `cacheGetSafe<UrlLiveness>(key, ...)`, which is a **TypeScript generic cast, not a runtime Zod parse** `[VERIFIED: grepped all UrlLivenessSchema/UrlLiveness usages — only operator-status.ts uses the type, and only as a generic; no reader calls .parse()]`. Therefore making `lastUrlProbed` nullable and adding a required-but-nullable `evidence` field will NOT break on old stored entries that lack `evidence` — no reader validates them. The schema change is purely a writer-side + compile-time contract. This validates D-07 and D-17.

**TypeScript unions that MUST widen (compile-time, not runtime):**

- `UrlLivenessStatusSchema` enum: add `'soft-404'` and `'no-url'` (`urlLiveness.ts:87`)
- `UrlLivenessSchema`: `lastUrlProbed` → `.nullable()`, add `evidence: z.string().max(200).nullable()` (`:113-114`)
- `TTL_SEC_BY_STATUS` Record: add `'soft-404': 24*3600` and `'no-url': 24*3600` (`:137`) — Record type forces this or TS errors
- `DeadUrlSampleEntry.status` union in `operator-status.ts:185`: add `'soft-404'` (NOT `no-url` — sample is terminal-dead only); add `evidence: string | null` field; widen the cast at `:246` and source `evidence` at `:241`
- `ProbeResult` interface (`:232`): add `evidence: string | null` (so `persistLiveness` can read it off the probe result rather than recompute)

## Common Pitfalls

### Pitfall 1: CDN HEAD vs GET vs Range behavior diverges across publishers

**What goes wrong:** A soft-404 page may return `200` on HEAD (no body to inspect), so the heuristic only fires on the follow-up GET. News-publisher CDNs (Cloudflare, Fastly, Akamai) commonly: (a) 405 on HEAD → triggers the existing GET fallback; (b) ignore `Range` on `text/html` and return the full 200 body; (c) serve a soft-404 "article unavailable" SPA shell with a 200.
**Why it happens:** CDNs optimize for cache-friendliness, not probe-friendliness. `Range` is honored for media/large static assets but frequently ignored for dynamically-rendered HTML.
**How to avoid:** Issue the capped GET on the 200 branch regardless of whether HEAD or the 405-fallback-GET produced it; rely on the **manual reader abort** (not `Range` alone) to cap the download. Respect the same per-host 1 req/s throttle for this extra GET (D-21) — it is the only added traffic.
**Warning signs:** Sweep wall-clock climbs (full bodies downloaded), or `skippedBudget` rises (bodies eat the deadline).

### Pitfall 2: SPA / JS-rendered publishers defeat the body heuristic

**What goes wrong:** Some publishers serve a near-empty HTML shell (`<div id="root"></div>`) for BOTH live and dead articles; content is hydrated by JS. The near-empty signal (D-02c) would false-positive every page on such a site as soft-404.
**Why it happens:** Client-side rendering. Headless browsing is explicitly out of scope (GHOST-06, REQUIREMENTS "Out of Scope").
**How to avoid:** This is exactly why D-03 is precision-first and the near-empty floor is conservative (~512 bytes of _actual_ content after stripping tags). A React shell with meta tags + script tags typically exceeds 512 bytes of markup; strip tags before measuring so the threshold measures text, and keep the floor low. Accept the recall miss (a dead SPA link survives) — the error budget permits it.
**Warning signs:** The GHOST-09/D-13 prunedIds sample shows soft-404 verdicts on a known-SPA publisher.

### Pitfall 3: redirect-to-home false positive on legitimate section pages

**What goes wrong:** Some live articles legitimately live at a shallow path (`/news/`), or a publisher 301s an old article URL to a _new_ canonical deep URL (not home). The redirect-to-home signal (D-02b) must not fire on these.
**Why it happens:** Path-depth heuristics are coarse.
**How to avoid:** Require BOTH conditions: original URL had a deep path (≥2 segments) AND final URL is `/` or a single-segment root. A redirect from deep→deep (canonical move) does not match. This is encoded in the Pattern 1 helper. Compare the existing `finalUrl` already tracked through the redirect loop (`probeUrl` already threads `finalUrl` per hop — `urlLiveness.ts:319,343` — no new plumbing per CONTEXT code_context note).
**Warning signs:** prunedIds sample shows soft-404 on URLs that resolve to live deep articles in a browser.

### Pitfall 4: attemptCount semantics change must update BOTH the comment and the schema-test table in lockstep

**What goes wrong:** D-10 changes the rule from "reset on any live-or-unknown" to "live resets to 0; unknown PRESERVES." The JSDoc at `urlLiveness.ts:100-111` and `:465-476` describes the OLD rule, and `sweep.test.ts:226` has an explicit `dead→unknown resets attemptCount to 0 and fires DECR` test that ASSERTS THE OLD BEHAVIOR and will now FAIL (correctly).
**Why it happens:** The semantics are documented in three places (two JSDoc blocks + a test) and asserted in a fourth (the test's expectations).
**How to avoid:** Update all four in the same commit: (1) the schema JSDoc `:100-111`, (2) the writer JSDoc `:465-476`, (3) the `persistLiveness` logic `:493-507` (the `!nextDead` branch must split: `live` → 0, `unknown` → preserve `prior?.attemptCount ?? 0`, _no DECR on unknown_), (4) `sweep.test.ts:226` must flip to assert preservation + NO DECR. **Subtle:** the sidecar DECR currently fires on dead→unknown (`urlLiveness.ts:530` `priorDead && !nextDead`). With "unknown preserves," does unknown still DECR the dead-count? Decision needed in planning: an `unknown` entry is NOT terminal-dead (excluded from sidecar count), so dead→unknown SHOULD still DECR the sidecar (the event is no longer counted as dead) while PRESERVING attemptCount. These are independent axes — attemptCount tracks consecutive-dead-tick history; the sidecar tracks current-dead membership. Keep the DECR; preserve the count. Add an explicit sweep test asserting both.
**Warning signs:** `urlLiveness.sweep.test.ts` fails on the dead→unknown case after the logic change (expected — flip the assertion).

### Pitfall 5: The `.strict()` schema + shim means new statuses fail FOUR test files until pinned

**What goes wrong:** Adding `soft-404`/`no-url` to the enum and `evidence` to the schema will, until the tests are updated, leave: `schema.test.ts:82` (the `for` loop over the 5 known statuses — still passes but is now incomplete), `schema.test.ts:31` `validEntry()` (missing `evidence` → strict() rejects → every test using it throws), the shim `src/__tests__/lib/urlLiveness.schema.test.ts:37` (same `validEntry` shape inline), and `probe.test.ts`/`sweep.test.ts`/`cronPrune.test.ts` fixtures (all construct `UrlLiveness` literals lacking `evidence`).
**Why it happens:** `.strict()` rejects missing fields; every fixture is now missing `evidence`.
**How to avoid:** Add `evidence` to every `UrlLiveness` test fixture in the same commit as the schema change. The `cronPrune.test.ts` `LIVENESS_BY_ID` fixtures (`:90-135`) and `sweep.test.ts` `cacheHit({...})` literals all need `evidence` added. The schema test's `validEntry()` and the shim's inline literal need `evidence: null` (or a string). Add new positive cases: parse a `soft-404` entry, parse a `no-url` entry with `lastUrlProbed: null`, TTL pins for both new statuses (24h ceiling).
**Warning signs:** `npx vitest run server/__tests__/lib/urlLiveness.*` and `npx vitest run src/__tests__/lib/urlLiveness.schema.test.ts` red.

### Pitfall 6: Forgetting the literal-path shim

**What goes wrong:** CONTEXT D-18 explicitly lists the `src/__tests__/lib/urlLiveness.schema.test.ts` shim as a lockstep surface. It independently re-asserts TTL ceilings + strict() rejection. New TTL tiers (`soft-404`, `no-url` → 24h) and the new field must be mirrored there or the shim's coverage silently lags the canonical test.
**How to avoid:** Mirror every schema-test pin into the shim. The shim is intentionally minimal (1 round-trip + 1 strict rejection + TTL bounds) — add `soft-404`/`no-url` TTL bound assertions and ensure its inline `validEntry` literal carries `evidence`.

## Code Examples

### attemptCount derivation under the NEW D-10 rule (the core GHOST-08 change)

```typescript
// Source: replaces urlLiveness.ts:493-507 (persistLiveness)
// OLD: any !nextDead → attemptCount = 0
// NEW (D-10): live → 0;  unknown → PRESERVE prior;  dead→dead → +1;  not-dead→dead → 1
const nextDead = isTerminalDead(probeResult.status);
const priorDead = prior !== null && isTerminalDead(prior.status);
let attemptCount: number;
if (probeResult.status === 'live') {
  attemptCount = 0; // live unambiguously resets
} else if (probeResult.status === 'unknown') {
  attemptCount = prior?.attemptCount ?? 0; // D-10: PRESERVE — transient never resets the run
} else if (probeResult.status === 'no-url') {
  attemptCount = 0; // D-07: no-url always 0
} else if (priorDead) {
  attemptCount = prior!.attemptCount + 1; // dead → dead monotonic
} else {
  attemptCount = 1; // not-dead → dead starts the run
}
// Sidecar: DECR still fires on dead→{live,unknown,no-url} membership exit; INCR on entry to dead.
// attemptCount (history) and sidecar membership (current) are independent — see Pitfall 4.
```

_Why this fixes the flaky-host bug:_ a host alternating `dead → unknown → dead → unknown → dead` previously reset to 0 on each `unknown`, so it never reached the `>= 3` cron gate. Now `unknown` holds the count steady and successive `dead` ticks accumulate past 3, so a genuine repeat offender is eventually cron-prunable — while a transient blip that recovers to `live` still fully resets. `[VERIFIED: CONTEXT D-10 + ROADMAP §specifics + reading persistLiveness:493-507]`

### Cron-only 403 exclusion (GHOST-09 / D-15, if demoted)

```typescript
// Source: insert into pruneDeadUrlEvents filter loop, after urlLiveness.ts:814
// D-15: 403 stays terminal-dead (count + sample + manual prune unchanged);
// ONLY the cron trigger skips it. NOT an isTerminalDead change.
if (!isTerminalDead(entry.status)) continue;
if (opts.trigger === 'cron' && entry.status === '403') continue; // D-15 cron demotion
if (opts.trigger === 'cron' && entry.attemptCount < 3) continue; // existing D-12 gate
```

_Evidence gate (D-14):_ pre-register demotion as expected, but confirm with the prunedIds sample + a browser-UA re-probe of current `403`-status prod keys before committing. If the sample shows 403s are genuinely dead (live articles serve in a browser → false-positive confirmed → demote; live articles 403 in browser too → genuinely dead → keep cron-prunable). Record the decision + evidence in the phase verification doc either way.

### GHOST-09 evidence-sample procedure (recommended approach)

```bash
# 1. Pull recent prune-dead-urls audit entries from prod (existing data, no new instrumentation).
#    operator:audit-log records {operation:'prune-dead-urls', args:{prunedIds}} — D-13.
#    Via the Bearer-gated aggregator:
curl -s -H "Authorization: Bearer $DASHBOARD_PASSWORD" \
  https://otg-iran-monitor.vercel.app/api/operator-status | jq '.prune'
# 2. The current 403-status keys surface in the same aggregator's deadUrlSample (status:'403').
# 3. Re-probe a sample (~20 URLs) with a BROWSER-like User-Agent to test the
#    "bot-blocking CDN 403s unknown UA on live article" hypothesis:
#    curl -sI -A "Mozilla/5.0 (...)" "<url>"  → 200 in browser context but 403 to PROBE_UA = false positive.
# 4. Record live/dead verdicts in 43-VERIFICATION (or a SUMMARY block). Zero live in the prunedIds sample = pass.
```

_Discretion (D-discretion):_ a checked-in `scripts/sample-pruned-urls.ts` is justified only if reuse is expected; otherwise a documented one-off is fine — the recorded results are the deliverable. `[VERIFIED: operator:audit-log prunedIds shape at urlLiveness.ts:867-871; /api/operator-status exposes prune block]`

## State of the Art

| Old Approach                                             | Current Approach                               | When Changed           | Impact                                                           |
| -------------------------------------------------------- | ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| 5-status taxonomy (`live\|404\|403\|dead-host\|unknown`) | 7-status (`+soft-404 +no-url`)                 | This phase             | Per-bucket counts; explicit coverage                             |
| `attemptCount` resets on live OR unknown                 | `live` resets; `unknown` preserves             | This phase (D-10)      | Flaky-host repeat-offenders eventually cross the `>=3` cron gate |
| Source-less events silently dropped                      | Explicitly classified `no-url` (no fetch)      | This phase (D-06)      | Full pipeline coverage / accounting; NOT pruned                  |
| 403 cron-auto-prunable (under `>=3`)                     | Likely demoted to manual-only (evidence-gated) | This phase (D-14/D-15) | Bot-blocking-CDN false positives no longer unattended-pruned     |
| HEAD/GET status-code-only probe                          | + 16 KiB body heuristic on 200s                | This phase (D-01/D-02) | Catches soft-404s status codes miss                              |
| No "why flagged" surface                                 | `evidence` string persisted                    | This phase (D-16)      | Operator/Phase 44 sees the reason verbatim                       |

**Deprecated/outdated:** Nothing deleted. All Phase 32 machinery is retained and extended; the only behavioral _removals_ are the old attemptCount-reset-on-unknown rule and the silent source-less drop — both replaced, not removed.

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** — all new code typed; the `Record<UrlLivenessStatus, number>` TTL map forces exhaustive status coverage at compile time.
- **Vitest** — `npx vitest run server/` (server tests), `npx vitest run` (all). New cases extend the four existing `urlLiveness.*.test.ts` files + the `src/` shim.
- **Conventional commits** — `feat(43):` / `fix(43):` / `docs(43):`.
- **Branch per phase** — `feature/43-ghost-link-prune-correctness` from `main` after Phase 42 merges (per phase-boundary rule; current branch is `feature/42-water-filter-fix`).
- **Redis registry lockstep** — CLAUDE.md §Serverless Cache `events:url-liveness:{eventId}` line + `docs/architecture/redis-keys.md:29` MUST be updated in the SAME phase as the schema change (D-18). The `src/__tests__/lib/redis-registry.test.ts` gate pins only the key _name_ (prefix on `:` boundaries), NOT the value shape `[VERIFIED: grepped redis-registry.test.ts — no value-shape assertion for url-liveness]`, so D-18's "if it pins the value shape" condition resolves to **no change needed in redis-registry.test.ts** — but the prose registry surfaces (CLAUDE.md + redis-keys.md) still need the new statuses/field/semantics documented.
- **Degrade-open posture (D-22)** — probe/sweep/prune failures never break the extraction outcome; the cron post-step is already wrapped in its own try/catch (`llmExtractionPipeline.ts:644-669`). The extra capped GET must also degrade-open (a body-read throw → treat as `live`, evidence null, per precision-first D-03).

## Validation Architecture

> `workflow.nyquist_validation` not explicitly false in config → section included.

### Test Framework

| Property           | Value                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest (jsdom frontend / node server) `[VERIFIED: CLAUDE.md §Testing]`                                         |
| Config file        | `vite.config.ts` (test.alias map for map mocks)                                                                |
| Quick run command  | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts server/__tests__/lib/urlLiveness.sweep.test.ts` |
| Full suite command | `npx vitest run server/` (server) + `npx vitest run src/__tests__/lib/urlLiveness.schema.test.ts` (shim)       |

### Phase Requirements → Test Map

| Req ID   | Behavior                                                                  | Test Type     | Automated Command                                                         | File Exists?                                         |
| -------- | ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| GHOST-06 | soft-404 detected via body heuristic on 200s                              | unit          | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts`           | ✅ (extend)                                          |
| GHOST-06 | `classifySoft404` markers/redirect/near-empty + precision-first tie-break | unit          | same (or new `classifySoft404` describe block)                            | ✅ (extend)                                          |
| GHOST-07 | source-less event → `no-url` entry, no fetch                              | unit          | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts`           | ✅ (extend buildProbeCandidates block)               |
| GHOST-08 | `unknown` preserves attemptCount; `live` resets; no-DECR-loss invariant   | unit          | `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts`           | ✅ (flip `:226` + add cases)                         |
| GHOST-08 | `unknown` excluded from prune (BOTH triggers) — explicit pin              | unit          | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts`       | ✅ (already `:199` — keep + add no-status-widen pin) |
| GHOST-08 | `attemptCount >= 3` cron gate retained verbatim                           | unit          | cronPrune.test.ts                                                         | ✅ (already `:179`)                                  |
| GHOST-09 | cron skips `403`; manual still prunes `403`                               | unit          | `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts`       | ✅ (add cron-403-skip case; E is 403/ac=4)           |
| GHOST-09 | prunedIds evidence sample (live/dead verdicts)                            | manual        | recorded in 43-VERIFICATION                                               | ❌ Wave-0 doc artifact                               |
| GHOST-10 | `evidence` persisted in schema + writer; required-nullable                | unit          | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts` (+ shim) | ✅ (extend + shim)                                   |
| GHOST-10 | `DeadUrlSampleEntry` gains `evidence` + `soft-404`                        | unit/contract | operator-status route test (if present) + typecheck                       | ⚠️ check operator-status test coverage               |

### Sampling Rate

- **Per task commit:** `npx vitest run server/__tests__/lib/urlLiveness.<changed>.test.ts`
- **Per wave merge:** `npx vitest run server/` + `npx vitest run src/__tests__/lib/urlLiveness.schema.test.ts`
- **Phase gate:** full server suite green + the literal-path shim green + `npm run build` (tsc typecheck catches the Record/union widenings) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `43-VERIFICATION` (or SUMMARY) section for the GHOST-09 prunedIds browser-UA re-probe evidence — must exist as a doc artifact; the decision (demote-or-keep) is recorded there.
- [ ] Confirm whether `server/__tests__/routes/operator-status*.test.ts` pins `DeadUrlSampleEntry` shape — if a contract test exists, widen it; if not, typecheck alone covers the union change. (Planner should grep `operator-status` test files during Wave 0.)
- [ ] No framework install needed — vitest already present.

_(All four `urlLiveness._.test.ts` files + the shim exist today; this phase extends them, it does not create test infrastructure.)\*

## Security Domain

> `security_enforcement` absent in config = enabled. Section included.

### Applicable ASVS Categories

| ASVS Category           | Applies                     | Standard Control                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication       | no                          | Probe path is unauthenticated outbound; manual prune is Bearer-gated (unchanged this phase)                                                                                                                                                                                                                    |
| V3 Session Management   | no                          | —                                                                                                                                                                                                                                                                                                              |
| V4 Access Control       | yes (unchanged)             | Manual prune Bearer-gated + per-Bearer quota (Phase 32 D-15); cron prune internal. This phase adds no new endpoints.                                                                                                                                                                                           |
| V5 Input Validation     | yes                         | The fetched HTML body is **untrusted external input**. Treat it as opaque bytes: substring-match ASCII markers only, never `eval`/parse-as-code, never render. `TextDecoder(fatal:false)` tolerates malformed bytes.                                                                                           |
| V6 Cryptography         | no                          | —                                                                                                                                                                                                                                                                                                              |
| **V11 SSRF (relevant)** | yes (existing, must extend) | The new capped GET reuses the SAME `currentUrl` already vetted by `isPrivateHost` in the redirect loop. **Ensure the body-fetch GET also runs only after the SSRF guard** — it does, because it fires on the already-followed `finalUrl` inside `probeUrl`. Do NOT introduce a fresh fetch to an unvetted URL. |

### Known Threat Patterns for {Node fetch / untrusted HTML body}

| Pattern                                                                         | STRIDE                      | Standard Mitigation                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSRF via stored event `source` URL or hostile redirect                          | Tampering / Info Disclosure | Existing `isPrivateHost` guard at probe entry + per-redirect-hop (`urlLiveness.ts:289,350`); the body GET inherits the vetted `finalUrl`                                                                |
| Decompression / large-body DoS (publisher returns multi-MB body ignoring Range) | DoS                         | Manual reader abort at 16 KiB cap (Pattern 2) — never buffer the full body                                                                                                                              |
| Malicious body content (XSS markers) influencing classification                 | Tampering                   | Body is substring-scanned for ASCII markers only and stored as a ≤200-char `evidence` string; never rendered as HTML this phase. Phase 44 must render `evidence` as text, not HTML (note for Phase 44). |
| Probe used as an amplifier / scanner                                            | Repudiation / abuse         | Polite-citizen contract unchanged (D-21): `createLimit(8)`, per-host 1 req/s, 10s timeout, 3-hop cap, identifying UA. The extra GET respects the same per-host throttle.                                |

## Assumptions Log

| #   | Claim                                                                                                        | Section                    | Risk if Wrong                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | A regex `<title>` capture (not a DOM parser) is sufficient for marker matching                               | Standard Stack / Pattern 1 | Low — markers are title substrings; if a publisher's title is malformed, the near-empty/redirect signals still cover; precision-first means a miss → `live` (safe)                                                                                                |
| A2  | `evidence` literal formats follow D-16's examples verbatim                                                   | Pattern 1 / Code Examples  | Low — D-16 gives exact examples; executor matches them                                                                                                                                                                                                            |
| A3  | Near-empty floor of ~512 bytes of _stripped_ content is conservative enough to not false-positive SPA shells | Pitfall 2                  | Medium — a heavy-shell SPA could exceed 512 bytes (safe) but a minimal one could fall under; the prunedIds sample (GHOST-09 evidence) is the backstop                                                                                                             |
| A4  | dead→unknown should still DECR the sidecar while preserving attemptCount (independent axes)                  | Pitfall 4 / Code Examples  | Medium — if planning decides unknown should NOT DECR (keep counting as dead), the sidecar semantics differ. Recommend confirming in discuss/planning: an `unknown` entry is excluded from the dead-count by definition, so DECR-on-exit is the consistent choice. |
| A5  | `operator-status` has no runtime Zod-parse of stored entries (writer-only parse)                             | Runtime State Inventory    | Low — VERIFIED by grep; only a TS generic cast at `:234`                                                                                                                                                                                                          |
| A6  | redis-registry.test.ts pins only the key name, not value shape → no change needed there                      | Project Constraints        | Low — VERIFIED by grep; prose surfaces still need updating                                                                                                                                                                                                        |
| A7  | Browser-like UA re-probe is a valid test of the bot-blocking-CDN hypothesis                                  | GHOST-09 procedure         | Low — operator-stated hypothesis (ROADMAP §specifics); standard OSINT technique                                                                                                                                                                                   |

**Note:** Most of this research is `[VERIFIED]` against the codebase. The `[ASSUMED]` items above are threshold/format judgment calls that CONTEXT explicitly delegates to Claude's discretion (marker list contents, helper placement, sweep-counter shape) or that the GHOST-09 evidence sample will empirically settle. None require user confirmation before planning — they are precisely the "Claude's Discretion" gray areas the operator pre-approved in auto-recommend mode.

## Open Questions (RESOLVED)

1. **Does dead→unknown DECR the sidecar count?** (see A4)
   - What we know: `unknown` is not terminal-dead, so it's excluded from the count by `isTerminalDead`. Current code DECRs on `priorDead && !nextDead` (`:530`).
   - What's unclear: D-10 only specifies attemptCount preservation; it's silent on the sidecar.
   - RESOLVED: Keep the DECR (event exits dead-membership) while preserving attemptCount (history) — the two are independent axes. An explicit sweep test asserts both; Plan 43-03 implements this as a one-line decision.

2. **Is there an `operator-status` route contract test pinning `DeadUrlSampleEntry`?**
   - What we know: the type is defined inline in the route (`:185`); the aggregator builds the sample degrade-open.
   - What's unclear: whether a `.strict()` Zod contract test pins the response shape (like Phase 39's `tokenBudget` block).
   - RESOLVED: No dedicated route contract test pins `DeadUrlSampleEntry`; the plans widen the inline type and rely on `npx tsc --noEmit` (with a Wave-0 grep guard in Plan 43-05 to widen any test found at execution time).

3. **Where exactly does the `no-url` write happen?**
   - What we know: `buildProbeCandidates` reads all events and currently drops source-less ones; it returns `{eventId,url}[]` and writes nothing today.
   - What's unclear: whether to give `buildProbeCandidates` a write side-effect or add a step.
   - RESOLVED: Side-effect inside `buildProbeCandidates` (it already imports `persistLiveness` machinery and reads every event) + return a `classifiedNoUrl` count for the cron log line (D-09). Cleanest fit, no new wiring; Plan 43-03 implements it.

## Environment Availability

> The phase runs entirely inside the existing Vercel/Node runtime against external HTTP. No new tools.

| Dependency                        | Required By      | Available     | Version                          | Fallback                                 |
| --------------------------------- | ---------------- | ------------- | -------------------------------- | ---------------------------------------- |
| Node `fetch` (undici)             | capped body read | ✓             | Node 25.6.1 (prod pinned `>=20`) | — (built-in since Node 18)               |
| `@upstash/redis`                  | sidecar/SCAN/DEL | ✓             | `^1.37.0`                        | degrade-open already                     |
| Vitest                            | tests            | ✓             | project pin                      | —                                        |
| Outbound HTTPS to news publishers | live probing     | ✓ (prod cron) | —                                | local tests mock `fetch` (no live calls) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — all local tests stub `fetch` via `vi.stubGlobal`.

## Sources

### Primary (HIGH confidence — codebase, read this session)

- `server/lib/urlLiveness.ts:1-901` — full module under change (schema, probe, throttle, persist, candidates, sweep, prune, `__test__` export)
- `server/lib/llmExtractionPipeline.ts:600-679` — cron post-step wiring (sweep → prune; no wiring change needed)
- `server/routes/operator-status.ts:170-259` — `DeadUrlSampleEntry` + `buildDeadUrlSample` (reader; TS-generic only, no Zod parse)
- `server/__tests__/lib/urlLiveness.schema.test.ts` — D-22 strict-schema + TTL pins (the 14-test matrix to extend)
- `server/__tests__/lib/urlLiveness.probe.test.ts` — probeUrl taxonomy + Range-header assertion (`:97` pins `bytes=0-1023`)
- `server/__tests__/lib/urlLiveness.sweep.test.ts` — throttle + attemptCount semantics (`:226` asserts the OLD reset rule — will flip)
- `server/__tests__/lib/urlLiveness.cronPrune.test.ts` — prune filter + cron gate + unknown-never-pruned (`:90-135` fixtures need `evidence`)
- `server/__tests__/routes/events.prune.test.ts` — manual prune route (mocks helper; pins trigger:'manual', quota; CR-01 spoof guard)
- `server/__tests__/routes/refresh-events-cron.prune.test.ts` — cron post-step order (mocks the three helpers; no behavior coupling)
- `src/__tests__/lib/urlLiveness.schema.test.ts` — literal-path shim (mirror new pins)
- `docs/architecture/redis-keys.md:29-30` — registry value-shape + TTL doc (update)
- `src/__tests__/lib/redis-registry.test.ts` — pins key NAME only, not value shape (no change needed)
- `.planning/phases/43-ghost-link-prune-correctness/43-CONTEXT.md` — D-01..D-22 (prescriptive)
- `.planning/REQUIREMENTS.md` §Ghost Links GHOST-06..GHOST-10 + Out-of-Scope table
- `.planning/ROADMAP.md` §Phase 43 (goal, SC 1-5, dependency note)
- `CLAUDE.md` §Serverless Cache (registry line for `events:url-liveness:{eventId}` + `events:url-liveness-count`)
- `node --version` → v25.6.1 (undici fetch + ReadableStream body) `[VERIFIED: tool]`

### Secondary (MEDIUM confidence)

- undici/WHATWG `Response.body` ReadableStream semantics (Node ≥18) — standard Node behavior `[CITED: training + Node version confirm]`
- CDN HEAD/GET/Range divergence for news publishers — general OSINT/probing domain knowledge `[ASSUMED — corroborated by existing 405-fallback GET design in fetchOnce:308]`

### Tertiary (LOW confidence)

- None — no WebSearch was required; this phase is fully codebase-grounded with prescriptive CONTEXT.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new deps; every library read in the import block.
- Architecture / integration points: HIGH — every callsite, line number, and shared predicate verified by reading the file.
- Schema-migration safety: HIGH — "writer-only Zod-parse" confirmed by grepping all readers.
- Soft-404 heuristic mechanics: MEDIUM — the design is sound and CONTEXT-prescribed, but threshold tuning (near-empty floor, marker list) and CDN edge-case behavior are empirically settled by the GHOST-09 prunedIds sample, not provable a priori.
- Pitfalls: HIGH — derived directly from existing test assertions that will break (Pitfall 4/5) and from the shared-predicate analysis (Pitfall: isTerminalDead).

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable — internal module, no fast-moving external API; the only external variable is publisher/CDN behavior, which the runtime sample re-validates)
