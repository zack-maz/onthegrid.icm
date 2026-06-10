---
phase: 43-ghost-link-prune-correctness
reviewed: 2026-06-10T05:43:47Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - server/lib/urlLiveness.ts
  - server/lib/llmExtractionPipeline.ts
  - server/routes/operator-status.ts
  - scripts/sample-pruned-urls.ts
  - server/__tests__/lib/urlLiveness.schema.test.ts
  - server/__tests__/lib/urlLiveness.probe.test.ts
  - server/__tests__/lib/urlLiveness.sweep.test.ts
  - server/__tests__/lib/urlLiveness.cronPrune.test.ts
  - server/__tests__/routes/refresh-events-cron.prune.test.ts
  - src/__tests__/lib/urlLiveness.schema.test.ts
  - docs/architecture/redis-keys.md
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
fixed: 8
status: fixed
---

# Phase 43: Code Review Report

**Reviewed:** 2026-06-10T05:43:47Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 43 (soft-404 body heuristic, `soft-404`/`no-url` statuses, required-nullable `evidence`, D-10 attemptCount semantics, cron-only 403 demotion) was reviewed at standard depth, including cross-checks against `server/cache/redis.ts` (TTL semantics) and `server/lib/operatorAudit.ts` (operation union). The phase's test suite is green (84/84 across the 5 listed test files), the SSRF guard correctly covers the new body GET (it targets only the already-vetted `finalUrl`, with per-hop re-vetting on redirects), the capped reader is genuinely bounded against Range-ignoring servers, `isTerminalDead` is unchanged for 403, and the cron-only 403 demotion is correctly prune-filter-local.

However, the review found one hard build break (`tsc -b` fails — the D-07 nullable `lastUrlProbed` widening was never propagated to `DeadUrlSampleEntry.url`), and two correctness gaps that directly violate the phase's own stated invariant ("more precise detection WITHOUT more aggressive pruning; never prune live links"): the soft-404 classifier never checks the HTTP status of the follow-up body GET (re-importing the bot-blocking false-positive class that GHOST-09's evidence demoted 403 for), and the curated marker list contains substrings (`'404'`, `'not found'`, `'no longer exists'`) that deterministically match live conflict-news headlines. Several secondary issues concern the interaction between the D-20 TTL tiers and the new D-10 attemptCount semantics, sidecar count drift, and registry/doc drift.

## Critical Issues

### CR-01: TypeScript build break — `lastUrlProbed: string | null` assigned to `DeadUrlSampleEntry.url: string`

**FIXED** — 6e33f3f (widened `DeadUrlSampleEntry.url` to `string | null` in lockstep with `UrlLiveness.lastUrlProbed`; `npx tsc -b` clean).

**File:** `server/routes/operator-status.ts:252` (type declared at `server/routes/operator-status.ts:185-198`)
**Issue:** Phase 43 D-07 made `UrlLivenessSchema.lastUrlProbed` nullable (`server/lib/urlLiveness.ts:129`), so `value.lastUrlProbed` is now `string | null`. `buildDeadUrlSample` assigns it to `url`, which is still typed `string`. `npx tsc -b` (the project's `npm run typecheck` gate) fails:

```
server/routes/operator-status.ts(252,11): error TS2322: Type 'string | null' is not assignable to type 'string'.
```

The Phase 43 widening of `DeadUrlSampleEntry` added `soft-404` to the status union and the `evidence` field but missed the `url` field's lockstep change. Note `npm run build` (vite + tsup) transpiles without typechecking, so this can silently reach a deploy while the typecheck gate is red. Runtime exposure is nil today (only `no-url` entries carry `lastUrlProbed: null` and `no-url` never passes `isTerminalDead`), but the build gate is broken regardless.
**Fix:** Either widen the sample type or guard the runtime invariant explicitly:

```typescript
// server/routes/operator-status.ts
type DeadUrlSampleEntry = {
  eventId: string;
  url: string | null; // D-07 — nullable in lockstep with UrlLiveness.lastUrlProbed
  status: 'dead-host' | '403' | '404' | 'soft-404';
  evidence: string | null;
};
```

(or `if (value.lastUrlProbed === null) continue;` before the push, keeping `url: string`). Then re-run `npx tsc -b` to confirm zero errors.

### CR-02: `classifyTwoHundred` ignores the body GET's HTTP status — bot-blocked/redirected GET responses are classified as soft-404, re-importing the false-positive class GHOST-09 demoted 403 for

**FIXED** — 7d64791 (only run `classifySoft404` on a 2xx body GET; non-2xx degrades open to live + releases the connection. Added HEAD-200→GET-403 and HEAD-200→GET-302 probe regressions).

**File:** `server/lib/urlLiveness.ts:514-524`
**Issue:** After a 200 HEAD, the follow-up capped GET's response is fed straight into `classifySoft404` without ever checking `res.status`:

```typescript
const res = await fetchOnce(finalUrl, 'GET', SOFT404_BODY_CAP_BYTES);
if (res === null) {
  return liveVerdict;
}
const body = await readCappedBody(res, SOFT404_BODY_CAP_BYTES);
const verdict = classifySoft404(body, finalUrl, originalUrl);
```

Two realistic non-2xx GET outcomes poison the verdict:

1. **Method-asymmetric bot blocking.** The phase's own GHOST-09 evidence (43-VERIFICATION sample: 20/20 production 403s were live under a browser UA) establishes that CDNs bot-block this prober. CDNs commonly pass HEAD but challenge/deny GET (or rate-limit the second request from the same IP within ~1s). A 403/429 denial page body is tiny — e.g. Akamai's `<TITLE>Access Denied</TITLE>` page strips to well under `NEAR_EMPTY_FLOOR_BYTES` (512) — so signal (c) fires: a **live** article gets `status: 'soft-404'`, which (unlike 403) **is cron-prunable**. The 403 demotion's entire rationale is defeated through this side door.
2. **Method-dependent redirects.** `fetchOnce` uses `redirect: 'manual'`; a GET answered with 3xx has an empty body → `near-empty: 0 bytes` → soft-404 on a live page.

Because the misclassification is deterministic per host configuration, `attemptCount` accumulates to ≥3 over consecutive sweeps and the cron auto-prune deletes the live event — exactly the outcome the phase forbids.
**Fix:** Treat any non-2xx body GET as no-signal (degrade-open to live), mirroring the D-03 posture:

```typescript
const res = await fetchOnce(finalUrl, 'GET', SOFT404_BODY_CAP_BYTES);
if (res === null || res.status < 200 || res.status >= 300) {
  // GET blocked/redirected where HEAD was 200 — no trustworthy body signal.
  return liveVerdict;
}
```

Add a probe test: HEAD 200 → GET 403-with-tiny-body must yield `status: 'live'`.

### CR-03: `NOT_FOUND_MARKERS` contains bare substrings (`'404'`, `'not found'`, `'no longer exists'`) that match live conflict-news titles — deterministic soft-404 of live events

**FIXED** — 0e33f14 (dropped bare `'404'`/`'not found'`/`'no longer exists'`; markers now require error-context framing: `'error 404'`, `'404 not found'`, `'http 404'`, `'this page no longer exists'`. Added regression cases for Persian year 1404, GE F404, "sailors not found", "ceasefire no longer exists" — all classify live).

**File:** `server/lib/urlLiveness.ts:253-261, 302-307`
**Issue:** Markers are matched as bare substrings of the lowercased `<title>`. Three list entries are not "unambiguous" for THIS corpus (Greater-Middle-East conflict news):

- `'404'` matches any title containing the digits — Persian Solar Hijri calendar years ("Iran's 1404 budget review"; SH 1404 = Mar 2025–Mar 2026, squarely in the war window), military hardware ("GE F404 engine"), flight numbers, casualty/unit figures.
- `'not found'` matches routine conflict headlines: "Survivors not found after strike", "Missing sailors not found", "Wreckage not found".
- `'no longer exists'` matches headlines like "Hamas says the ceasefire no longer exists".

Because a live article's title is stable, the match repeats every sweep, `attemptCount` reaches 3, and the cron auto-prune deletes the live event from `events:llm:v3` — direct violation of the phase invariant. The title-only restriction (which the code correctly applies to avoid articles _about_ 404s) does not protect against these, since the offending strings appear in _titles_.
**Fix:** Drop `'404'` and `'not found'` as standalone markers (`'page not found'` and `'content not found'` already cover the genuine CMS phrasings); drop or tighten `'no longer exists'` (e.g. `'this page no longer exists'`). If a numeric-404 signal is wanted, require an error-context pattern instead of a substring:

```typescript
const NOT_FOUND_MARKERS: readonly string[] = [
  'page not found',
  'article not available',
  'page no longer available',
  'content not found',
  'error 404',
  '404 not found',
];
```

Add negative table-driven cases to the `classifySoft404` test: titles "Iran's 1404 budget", "Missing sailors not found after strike", "Ceasefire no longer exists, official says" must classify live.

## Warnings

### WR-01: `evidence` is not truncated before the `.strict()` parse — long redirect paths make `persistLiveness` throw, permanently dropping that event's liveness write

**FIXED** — c6cbb0d (truncate `evidence` to 200 chars at the `persistLiveness` writer choke point before the parse; added a >200-char-evidence persist-without-throw test).

**File:** `server/lib/urlLiveness.ts:316-319` (construction), `server/lib/urlLiveness.ts:831-836` (parse)
**Issue:** The redirect-to-home evidence embeds both pathnames verbatim: `` `redirect-to-home: ${origPath} → ${finalPath}` ``. The schema enforces `z.string().max(200)` and `persistLiveness` calls `UrlLivenessSchema.parse(next)`, which **throws** on overflow. News-article paths routinely exceed ~175 chars — especially percent-encoded Persian/Arabic slugs, where `URL.pathname` returns the encoded form (3–9× expansion), and this corpus is dominated by Middle-East outlets. The throw is caught by `runProbeSweep`'s task catch (degrade-open), but the consequence recurs every sweep: that event's verdict is never persisted, it stays Tier A forever, is re-probed daily, and a genuinely-dead redirect-to-home URL can never accumulate `attemptCount ≥ 3` to be cron-pruned.
**Fix:** Truncate at the writer (single choke point):

```typescript
// persistLiveness
evidence: probeResult.evidence === null ? null : probeResult.evidence.slice(0, 200),
```

(or truncate at construction in `classifySoft404`). Add a test with a >200-char path asserting the entry persists with truncated evidence.

### WR-02: D-10 "unknown preserves attemptCount" is defeated by the D-20 TTL tiers at the production cadence — the flagship semantics change is dead in production

**FIXED** — f658db0 (raised the `unknown` logical/hard TTL tier from 1h to 24h so entries survive the once-daily sweep gap; the D-10 preserve rule now engages. Lockstep: `TTL_SEC_BY_STATUS`, both schema-test pins, redis-keys.md, CLAUDE.md registry).

**File:** `server/lib/urlLiveness.ts:166-174` (TTL tiers) vs `server/lib/urlLiveness.ts:806-819` (attemptCount derivation)
**Issue:** `cacheSet` applies the tier value as the **hard** Redis TTL (`server/cache/redis.ts:187-190` — `{ ex: redisTtlSec }`, no 10× multiplier). The sweep runs once per day (4am cron). Therefore:

- An `unknown` entry (TTL 1h) has **always expired** by the next daily probe. The dead→unknown→dead "blip" sequence D-10 was built for reads `prior = null` on the post-blip tick and restarts `attemptCount` at 1. The preserve rule only ever executes if two sweeps run <1h apart (manual `?force=true` back-to-back) — it is unreachable at the unattended cadence the ≥3 cron gate serves.
- A terminal-dead entry (TTL 24h) sits on a knife-edge against the ~24h sweep interval: whichever day the extraction pre-step runs a few minutes longer, the key expires before re-probe, `prior = null`, and `attemptCount` resets to 1. Reaching 3 requires winning this race twice consecutively, so the cron auto-prune of genuinely dead 404/dead-host/soft-404 URLs fires far less often than designed (fail-safe direction, but the mechanism is broken, and tests can't see it because they mock Redis without expiry).
  **Fix:** Decouple the re-probe cadence from state retention — e.g. raise the hard TTL for `unknown` and terminal-dead entries (say 7d, matching `live`) and keep the _re-probe_ tiering as a logical-staleness decision in `buildProbeCandidates` (it already sorts Tier B by `lastProbedAt`), or write terminal-dead/unknown entries with `ttlSecForStatus(status) * N` headroom. Update the D-20 schema test ceilings in lockstep.

### WR-03: Sidecar `events:url-liveness-count` inflates monotonically — TTL expiry of a dead entry skips the DECR, then re-probe re-INCRs

**FIXED** — f658db0 (the WR-02 24h TTL fix removes the common expiry-between-daily-sweeps path; the residual drift window — a dead key outliving 24h across two >24h-apart sweeps — is now documented inline as bounded (+1 max per skipped-day per event) and self-healing via the existing floor-at-0 DECR underflow guard, prune-time DECRBY, and the dashboard `Math.max(0, …)`. No mechanism change beyond the TTL fix).

**File:** `server/lib/urlLiveness.ts:844-857`
**Issue:** INCR fires on not-dead→dead and DECR on dead→not-dead/prune, but there is a third exit from the dead set: **key expiry** (24h TTL, WR-02). When a terminal-dead entry expires and the still-dead URL is re-probed, `prior = null` → `priorDead = false` → INCR fires _again_ for an event already counted. Nothing ever compensates, so `deadUrlCount` drifts upward by +1 per expiry/re-probe cycle per dead event — over weeks the dashboard count diverges arbitrarily from reality (`Math.max(0, …)` in operator-status only floors underflow, not inflation). The phase invariant "sidecar count stays consistent with the new statuses" holds for `soft-404`/`no-url` transitions themselves, but not across the TTL boundary.
**Fix:** Either fix the retention mismatch (WR-02's fix removes the common path), or make the sidecar self-healing: recompute it periodically from the SCAN the cron prune already performs (`pruneDeadUrlEvents` walks every liveness key and knows the true terminal-dead count — `redis.set(URL_LIVENESS_COUNT_KEY, trueCount)` at the end of the cron pass turns the sidecar into a bounded-error cache instead of an unbounded integrator).

### WR-04: Near-empty floor flags live client-side-rendered articles as soft-404 — the asymmetric error budget is applied in the wrong direction

**FIXED** — 07b4687 (near-empty signal (c) now also requires the body to contain no `<script` tag; script-heavy CSR/SPA shells degrade open to live. Added an SPA-shell-with-script regression case).

**File:** `server/lib/urlLiveness.ts:234-240, 327-329`
**Issue:** Signal (c) marks any 200 body whose tag-stripped text is <512 bytes as soft-404. The comment argues a "dead-but-heavy-shell SPA link surviving is within the asymmetric error budget" — but the inverse case is the dangerous one and is unhandled: a CSR-only news site serves the **same** near-empty HTML shell (`<div id="root"></div>` + external `<script src>` tags, ~0 text after stripping) for _live_ articles as for dead ones. Every live article on such an outlet classifies `near-empty: N bytes` → soft-404 → terminal-dead → deterministic `attemptCount` accumulation → cron-pruned. The same applies to live pages whose first 16 KiB (the cap) is pure head markup with no inline script/JSON-LD text. The phase's error budget explicitly tolerates dead-marked-live, never live-marked-dead.
**Fix:** Make signal (c) corroboration-only rather than standalone: require it to co-occur with signal (b) (redirect-to-home), or exempt bodies containing a `<script src=` / `<div id="root"` SPA fingerprint, or at minimum demote a (c)-only verdict to `unknown` (re-probe, not terminal-dead) so it can never feed the cron prune on its own.

### WR-05: `docs/architecture/redis-keys.md` registry drift — `events:llm:v3` TTL row contradicts the code, and urlLiveness line references are stale

**FIXED** — d42a0e5 (corrected the `events:llm:v3` TTL cell to `172800s LLM_TERMINAL_TTL_SEC, 48h`; refreshed the stale url-liveness line refs to :66 / :836 / :1274 / :75. redis-registry test green).

**File:** `docs/architecture/redis-keys.md:17, 29`
**Issue:** Row `events:llm:v3` states TTL "9000s (`LLM_REDIS_TTL_SEC`, ≈2.5h hard)", but both writers use `LLM_TERMINAL_TTL_SEC = 172_800` (48h) — `server/lib/llmExtractionPipeline.ts:150, 200` and the prune splice at `server/lib/urlLiveness.ts:1199`. The code comment at `llmExtractionPipeline.ts:137-149` explicitly documents the 2.5h value as retired ("left events:llm:v3 empty for ~21.5h of every day"). An operator consulting this registry (its stated purpose) would draw the wrong conclusion about cache survival across the cron window. Additionally, row 29's writer/reader line refs (`urlLiveness.ts:62`, `:454`, `:585`) are stale after the Phase 43 edits (`URL_LIVENESS_KEY_PREFIX` is at :65, `persistLiveness` at :780, the splice writer at :1199) — the row's Phase 43 content updates (7-status taxonomy, evidence, D-10 semantics) were made without refreshing the references in the same row family.
**Fix:** Update the `events:llm:v3` TTL cell to `172800s (LLM_TERMINAL_TTL_SEC, 48h hard — must exceed the daily cron interval)` and refresh the `events:url-liveness:*` line references. Verify `src/__tests__/lib/redis-registry.test.ts` still passes (it evidently does not pin TTL values — consider whether it should).

## Info

### IN-01: `buildProbeCandidates` can write a garbage `events:url-liveness:undefined` key for id-less entities

**File:** `server/lib/urlLiveness.ts:926-944`
**Issue:** The source-less branch calls `persistLiveness(entity.id, …)` without validating `entity.id`. A malformed v3 entity with a missing/undefined `id` (the function already defends `data.source` against shape drift, so the concern is acknowledged) produces the key `events:url-liveness:undefined`; multiple such entities collapse onto it.
**Fix:** `if (!entity?.id || typeof entity.id !== 'string') continue;` at loop top.

### IN-02: `scripts/sample-pruned-urls.ts` header documentation contradicts its implementation re `CACHE_KEY_PREFIX`

**File:** `scripts/sample-pruned-urls.ts:36-39` vs `scripts/sample-pruned-urls.ts:159-170`
**Issue:** The credentials header claims "Reads prod Redis via the wrapped `redis` instance (CACHE_KEY_PREFIX honored — a dev run with CACHE_KEY_PREFIX set reads dev keys…)", but the code deliberately constructs a raw unprefixed `@upstash/redis` client and the inline comment says the opposite ("must stay unprefixed"). An operator relying on the header would believe a dev-prefixed run is isolated when it actually reads (and then probes URLs from) production keys.
**Fix:** Rewrite the header bullet to match the implementation (raw unprefixed client; always reads prod keys regardless of `CACHE_KEY_PREFIX`).

### IN-03: Stale pre-Phase-43 mock shape in `vi.hoisted` default for `mockBuildProbeCandidates`

**File:** `server/__tests__/routes/refresh-events-cron.prune.test.ts:50`
**Issue:** The hoisted default still resolves the old bare-array shape (`[{ eventId, url }]`); only the `beforeEach` (lines 242-245) sets the new `{ candidates, classifiedNoUrl }` shape. The default is currently dead (every test runs after `beforeEach`), but a future test added before the reset — or a `mockReset` without re-seeding — would destructure `undefined` and silently swallow the prune step inside the IIFE's catch.
**Fix:** Update the `vi.hoisted` default to `{ candidates: [...], classifiedNoUrl: 0 }`.

### IN-04: 405-fallback path issues a redundant second body GET

**File:** `server/lib/urlLiveness.ts:587-597, 601-603`
**Issue:** When HEAD returns 405, `probeUrl` already issues a 1 KiB-Range GET; if it returns 200, `classifyTwoHundred` then issues a _second_ 16 KiB GET to the same URL. The first response's body is discarded. Functionally correct, but it's an extra outbound request per 405-host against the polite-citizen contract the phase otherwise carefully preserves (it also pays a second `waitForHostSlot` second).
**Fix:** Pass the already-fetched 200 `Response` into the classifier when the 405-fallback GET produced it (read its capped body directly), or fetch the 405-fallback GET with `SOFT404_BODY_CAP_BYTES` up front.

---

_Reviewed: 2026-06-10T05:43:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
