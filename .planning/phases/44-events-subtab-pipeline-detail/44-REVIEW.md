---
phase: 44-events-subtab-pipeline-detail
reviewed: 2026-06-10T15:58:21Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server/openapi.yaml
  - server/routes/__tests__/operator-status.test.ts
  - server/routes/operator-status.ts
  - src/__tests__/DevApiStatusV3.test.tsx
  - src/__tests__/components/DevApiStatus.prune.test.tsx
  - src/__tests__/devApiStatusEventsSection.test.tsx
  - src/components/ui/DevApiStatus.tsx
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 44: Code Review Report

**Reviewed:** 2026-06-10T15:58:21Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 44 events-subtab pipeline-detail surface: the `countsByStatus` / `lastProbedAt` / `attemptCount` extension to the `/api/operator-status` prune block (server route + tests + OpenAPI), and the client-side EventsFiltersSectionV3 changes (presence-gated v2 block mounts, FlightRecorderBlock re-mount, the new events-tab-scoped operator-status fetch, and DeadLinkBucketsBlock).

The locked security decision (T-43-16 evidence-as-TEXT) is correctly implemented and well pinned: `evidence` and `url` render only as React text nodes / `title` attributes (default-escaped), the adversarial `<b>not found</b>` fixture in `DevApiStatus.prune.test.tsx` asserts both the literal text AND the absence of an injected `<b>` element, and no `dangerouslySetInnerHTML` appears anywhere in the diff. Bearer handling in the new fetch matches the established `dashboardAuthHeaders()` pattern. The no-double-fetch claim holds: the API-Health and events tabpanels are mutually exclusive `activeTab` branches, so only one operator-status poller and one FlightRecorderBlock mount at a time.

Six warnings remain. The most consequential: the new `countsByStatus` tally is silently truncated by the pre-existing `LIMIT_DRILL_DOWN=20` short-circuit (not only the documented `MAX_SCAN_KEYS=200` budget), which biases the sampled distribution exactly when the dead population spikes; and the events-tab fetch's failure handling does not match its documented degrade-open contract (stale data is retained, not nulled). Two contract-drift items between route, OpenAPI, and client interfaces round out the warnings.

## Warnings

### WR-01: `countsByStatus` tally is truncated by the LIMIT_DRILL_DOWN=20 short-circuit, not the documented MAX_SCAN_KEYS=200 budget

**Status:** fixed — sample cap no longer breaks the SCAN loop (`continue` past a full sample; `MAX_SCAN_KEYS` is the sole short-circuit); pinned by two new tally-beyond-cap test assertions.
**File:** `server/routes/operator-status.ts:271-296` (also `server/openapi.yaml:650-660`)
**Issue:** The Phase 44 D-01 tally is accumulated inside the existing SCAN loop, but that loop short-circuits (`cursor = 0; break;`) as soon as `sample.length >= LIMIT_DRILL_DOWN` (20). Trace: per key, tally → terminal-dead filter → push → break-at-20. So whenever the keyspace contains ≥20 terminal-dead entries early in encounter order, the tally stops at the 20th dead key — far below the 200-key budget. The inline comment ("Bounded by the unchanged `MAX_SCAN_KEYS=200` budget guard") and the OpenAPI description ("bounded by `MAX_SCAN_KEYS=200`") both overstate the actual sampling window. Worst case: 200 dead + 1,000 live keys could yield `{'404': 20}` "of 20 scanned" — the live/unknown buckets vanish from the distribution precisely when dead links spike, which is when the operator needs this signal. The UI stays honest only because the "of N scanned" denominator is computed from the sum, but the per-bucket _proportions_ are systematically dead-biased. No test pins this: the cap-at-20 test (`operator-status.test.ts:462-492`, 30 dead keys) never asserts `countsByStatus` (which would read 20, not 30).
**Fix:** Decouple the tally from the sample cap — continue SCANning up to `MAX_SCAN_KEYS` for the tally even after the sample is full:

```typescript
if (isTerminalDead(value.status) && sample.length < LIMIT_DRILL_DOWN) {
  sample.push({ ... });
}
// remove the `if (sample.length >= LIMIT_DRILL_DOWN) { cursor = 0; break; }` block;
// the existing `scanned >= MAX_SCAN_KEYS` guard remains the sole short-circuit
```

Then add a test asserting `countsByStatus['404'] === 30` for the 30-dead fixture. If the early exit is kept deliberately (to save ≤180 `cacheGetSafe` reads), correct the inline comment and the OpenAPI description to state the real bound.

### WR-02: Events-tab fetch failure handling contradicts its documented degrade-open contract (stale prune data retained)

**Status:** fixed — non-200 and network failures now null `eventsPrune` (block self-hides), and a per-effect monotonic request id guards every state write against out-of-order responses.
**File:** `src/components/ui/DevApiStatus.tsx:677-703`
**Issue:** The Phase 44 comment promises "degrades open on any failure (network / non-200 / missing Bearer → null → block self-hides)". The implementation does not do this: on `!res.ok` the function `return`s and on network failure the catch is empty — in both cases the previously fetched `eventsPrune` state is retained, not nulled. After one successful fetch, a Bearer expiry or server failure leaves the DeadLinkBucketsBlock rendering progressively staler data indefinitely (refreshed only by leaving the tab) with no staleness indicator. Additionally there is no out-of-order guard between the initial fetch and the 30s interval ticks: a slow first response resolving after a faster interval response will clobber newer data with older (the `cancelled` flag only covers unmount/tab-switch).
**Fix:** Either make the implementation match the comment:

```typescript
if (!res.ok) {
  if (!cancelled) setEventsPrune(null);
  return;
}
```

(and `if (!cancelled) setEventsPrune(null);` in the catch), or amend the comment to document the keep-last-good behavior. For the ordering race, a per-effect monotonically increasing request id checked before `setEventsPrune` closes the gap.

### WR-03: OpenAPI response schema for `/api/operator-status` omits the `tokenBudget` field the route emits

**Status:** fixed — `tokenBudget` added to the 200 schema as a nullable object documenting the Phase 39 GA-4 shape + degrade-open null; Redocly stays green.
**File:** `server/openapi.yaml:627-692` (route: `server/routes/operator-status.ts:621`)
**Issue:** The route responds with `{ audit24h, byBearer, advEval, prune, actorQuality, tokenBudget }`. The OpenAPI 200 schema documents `audit24h`, `byBearer`, `advEval`, `prune` (extended for Phase 44), and `actorQuality` — but not `tokenBudget` (shipped Phase 39, consumed by BudgetBlock and the hero budget field). Phase 44 edited this exact schema block and the drift persists. Any consumer generating clients or validating against the spec misses a live field.
**Fix:** Add to the response properties:

```yaml
tokenBudget:
  type: object
  nullable: true
  description: >-
    Phase 39 GA-4 — provider-keyed token budget map + today's cost-shadow
    roll-up. Null on degrade-open (Redis throw).
```

### WR-04: `url` nullability drift — server emits `string | null`, OpenAPI and both client interfaces declare `string`

**Status:** fixed — option (a): OpenAPI `url` marked `nullable: true` and both client interfaces widened to `string | null` (title attrs coerce null → undefined).
**File:** `server/routes/operator-status.ts:185-210` vs `server/openapi.yaml:669-670`, `src/components/ui/DevApiStatus.tsx:1158-1168` and `:3450-3462`
**Issue:** `DeadUrlSampleEntry.url` was widened to `string | null` (Phase 43 D-07, CR-01) and the route assigns `value.lastUrlProbed` directly. The OpenAPI sample schema declares `url: type: string` with no `nullable: true`, and both client shapes (`OperatorStatus.prune.deadUrlSample[].url` and module-level `PruneSummary.deadUrlSample[].url`) declare `url: string`. The server's own comment concedes the invariant ("no-url never reaches this sample") is enforced only by convention: the `cacheGetSafe<UrlLiveness>` read is a blind generic cast with no Zod parse, so a corrupt/partially-written entry with a terminal-dead status and `lastUrlProbed: null` flows straight through, producing `url: null` in the payload — violating the published contract. (Same blind-cast class applies to `lastProbedAt`/`attemptCount`: a malformed entry emits `undefined`, which JSON-drops the keys.) The client happens not to crash (`{entry.url}` renders nothing), so this is contract drift rather than a runtime defect.
**Fix:** Pick one side and align all three: either (a) mark `url` `nullable: true` in OpenAPI and `string | null` in both client interfaces, or (b) enforce the invariant at the route by skipping sample entries with `!value.lastUrlProbed` (one-line guard next to `isTerminalDead`), keeping `string` everywhere. (b) matches the documented intent.

### WR-05: DeadLinkBucketsBlock hides scan-derived buckets and sample whenever the sidecar count reads 0 — a documented sidecar failure mode

**Status:** fixed — buckets/sample now gate on their own data presence (`buckets.length` / `sample.length`), authoritative-total line unchanged (D-03); prune test evolved to pin buckets-visible at count=0 with non-empty tally.
**File:** `src/components/ui/DevApiStatus.tsx:3503` (`{prune.deadUrlCount > 0 && (...)}`)
**Issue:** Both the bucket list and the drill-down sample are gated on the sidecar `deadUrlCount > 0`. The sidecar is maintained by INCR/DECR transitions and has a known underflow mode (floored at 0 by the server — `Math.max(0, ...)`, T-32-11). When the sidecar legitimately reads 0 while the SCAN still finds terminal-dead entries (post-underflow, or sidecar drift between sweep and prune), the block displays "Dead URL events: 0" and suppresses the contradicting scan evidence — the operator loses the only signal that the sidecar has drifted. This also diverges from the sibling API-Health list, which gates the sample on `deadUrlSample.length > 0` regardless of the count (`DevApiStatus.tsx:2037`), so the two surfaces can disagree on identical data.
**Fix:** Gate the bucket list on `buckets.length > 0` and the sample on `sample.length > 0` independently of `deadUrlCount` (matching the API-Health list), keeping the authoritative-total line as-is. A count/sample disagreement then becomes visible instead of masked.

### WR-06: DrillDownRow renders `<a href>` from LLM-extracted source URLs without scheme validation

**Status:** fixed — `/^https?:\/\//i` scheme guard added; non-http(s) sources render as inert text spans instead of anchors.
**File:** `src/components/ui/DevApiStatus.tsx:2748-2757`
**Issue:** `ev.sources` originates from LLM-extracted article URLs (GDELT/news content — externally influenceable). They are rendered as `<a href={u} target="_blank" rel="noopener noreferrer">` with no scheme check, so a `javascript:` or `data:` URL passes through to the DOM (React only console-warns on `javascript:` hrefs; it does not block them). Mitigations in place — `target="_blank"` + `noopener` prevents same-origin script execution on modern browsers, and the surface is Bearer-gated dev/operator-only — keep this a hardening warning rather than a blocker. Noting it because this file was in review scope and the same per-row link pattern is the obvious template for any future "open dead URL" affordance in DeadLinkBucketsBlock, where the URLs are _specifically_ the dead/suspicious ones. (DeadLinkBucketsBlock itself correctly renders `url` as text only.)
**Fix:** Guard the scheme before rendering an anchor:

```tsx
const isHttp = /^https?:\/\//i.test(u);
return isHttp ? <a href={u} ...>[{i + 1}]</a> : <span className="text-white/40">[{i + 1}]</span>;
```

## Info

### IN-01: Three hand-synchronized copies of the prune payload shape

**File:** `src/components/ui/DevApiStatus.tsx:1150-1169` (component-scope `OperatorStatus.prune`), `:3450-3462` (module-scope `PruneSummary`), `src/__tests__/components/DevApiStatus.prune.test.tsx:132-153` and `:487-506` (test-local copies)
**Issue:** The Phase 44 comment acknowledges `PruneSummary` is a "module-level mirror" of the component-closure interface. Four near-identical declarations now drift independently (they already disagree on `url` nullability — see WR-04). **Fix:** Export `PruneSummary` from one location (e.g., a small `src/lib/operatorStatusTypes.ts` or hoist it above the component and reference it from `OperatorStatus`), and import it in the tests.

### IN-02: Events-tab fetch skips the defensive shape validation its sibling performs

**File:** `src/components/ui/DevApiStatus.tsx:689-690` vs `:1206-1218`
**Issue:** `fetchOpStatus` validates `audit24h`/`byBearer`/`advEval` before accepting a payload (guarding against test fetch spies and mid-deploy schema regressions). The new events-tab fetch accepts `data?.prune ?? null` with no shape check; a truthy non-object `prune` (e.g., a string from a mismatched spy) passes the `{prune && <DeadLinkBucketsBlock/>}` gate and renders a block of blanks rather than self-hiding. No crash (all reads degrade via `??`), but the degrade path is render-garbage instead of hide. **Fix:** `if (typeof data?.prune !== 'object') { setEventsPrune(null); return; }` (or reuse the sibling's audit24h/byBearer gate).

### IN-03: Inconsistent presence gates for the mounted v2 blocks — empty arrays render zero-state copy, duplicating v3 empty-state text

**File:** `src/components/ui/DevApiStatus.tsx:3639-3656`
**Issue:** `HistogramsBlock` is gated on `callHistory.length > 0`, but `CallLogBlock` and `DlqBlock` are gated on field presence only. A server payload with `callHistory: []` (plausible for an idle run summary) renders "LLM Call Log (0) / No LLM calls yet." — the exact string `LatencyHistogramBlock` uses for its v3 empty state, producing duplicate copy and breaking the "exactly one match" assumption documented in `DevApiStatusV3.test.tsx:168-173` (that test only passes because its fixture omits the field entirely). Same for `dlqRecent: []` → "DLQ: 0 entries", which the D-05 self-hide test asserts absent only for the `undefined` case. **Fix:** Gate both on `length > 0` to match HistogramsBlock, or accept zero-state rendering and pin the empty-array case in a test.

### IN-04: First describe block in operator-status.test.ts exercises buildDeadUrlSample only through its catch path

**File:** `server/routes/__tests__/operator-status.test.ts:52-157`
**Issue:** Tests 1/2/4 never mock `redis.scan` (the `beforeEach` only sets `smembers`/`get`), so `await redis.scan(...)` resolves `undefined`, `reply[0]` throws, and `buildDeadUrlSample` degrades open — the tests pass incidentally through the error path while appearing to exercise the happy path. Harmless today (degrade-open is the contract) but fragile: a future change that makes the SCAN failure non-isolated would surface here as confusing 500s in unrelated shape tests. **Fix:** Hoist `mockRedis.scan.mockResolvedValue([0, []])` (and `hgetall` default) into the first describe's `beforeEach`, mirroring the later describes.

---

_Reviewed: 2026-06-10T15:58:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
