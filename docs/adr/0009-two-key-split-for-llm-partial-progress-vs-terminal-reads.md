# ADR-0009: Two-key split for LLM partial progress vs terminal reads

**Status:** Accepted
**Date:** 2026-04-24
**Deciders:** solo author

## Context

Phase 27.4 shipped a flag-gated v2 LLM enrichment pipeline that writes the
final geocoded `ConflictEventEntity[]` payload to Redis at
`events:llm:v2`. The terminal write happens after the full extract +
geocode pipeline completes, inside `server/routes/events.ts:~1016`. The
`/api/events` reader at `:675` reads this key as
`ConflictEventEntity[]`, hands it to `normalizeEventTypes.map(...)`, then
to `sendValidated` → client.

Phase 27.4 had a P0 durability defect: the v2 extractor wrote to Redis
only AFTER all 184 batches completed. One hung Cerebras call (observed
at batch 133/184 on 2026-04-21) cost ~45 minutes of LLM work when the
server restarted — nothing had been persisted.

Phase 27.4.1 was opened to fix this. Plan 03's original design added a
`writePartialCache(events, completed, total, complete)` helper that
wrote a new envelope shape `{events, progress: 'N/M', complete, generatedAt}`
(the `LLMCachePayload` type, with `events: EnrichedEventV2[]` — the
pre-geocode shape). The planner routed partial writes to the SAME Redis
key `events:llm:v2`, accepting this as a "rollout window" risk on the
assumption that the Pitfall 1 bridge (serve v1 when v2 is empty) would
protect users.

This assumption was structurally incoherent. The writer's shape change
and the reader's assumed type cannot disagree — there is no "window"
where the mismatch is acceptable because any read that sees the envelope
crashes before the bridge can kick in. The shape-collision comment in
`writePartialCache` itself acknowledged the reader would see a non-array
and break.

The bug shipped. `/api/events` began returning HTTP 500 with
`TypeError: events.map is not a function` (symptomatic of the
sync HTTP path) and later `llmCachedRef.data is not iterable`
(symptomatic of the async fire-and-forget background task). Both
errors came from the same root cause — envelope-shaped data stored at
a key typed for array.

We need a fix that:

1. Preserves the Phase 27.4.1 durability goal (per-batch flush so one
   hung call doesn't lose 45 min of work).
2. Preserves the Pitfall 1 graceful-degradation contract (map never goes
   blank — fall back to v1 or raw GDELT if v2 is unavailable).
3. Makes the writer/reader contract explicit and enforceable so a
   future regression cannot reintroduce this class of bug silently.

## Decision

We will use **two distinct Redis keys** for the two distinct concerns
previously muxed onto `events:llm:v2`:

- **`events:llm:v2`** — terminal cache. `ConflictEventEntity[]` only.
  Written exclusively by `server/routes/events.ts:~1016` after the full
  extract + geocode pipeline completes. Read by `/api/events`,
  `loadRecentEnrichedEvents`, and the `/llm-replay` dev endpoint.
- **`events:llm:v2:partial`** — observability-only cache.
  `LLMCachePayload` envelope (`{events: EnrichedEventV2[], progress,
complete, generatedAt}`). Written per-batch by
  `writePartialCache` in `server/lib/llmEventExtractor.v2.ts`. Read
  only by DevApiStatus / `/llm-status` for progress display. Never
  served to users.

Additionally, we will add defense-in-depth at the three `events:llm:v2`
read sites (`toEntityArray` + `coerceCachedEvents` helpers in
`server/routes/events.ts`) so any future regression that reintroduces
shape drift on the terminal key degrades to "serve empty array" rather
than HTTP 500.

## Consequences

### Positive

- **Writer/reader contracts are now physically isolated.** Each key has
  a single writer and a clearly-defined reader set. There is no "shared
  key with timing-dependent shape" to reason about.
- **The Pitfall 1 bridge actually works.** When the v2 extractor is
  still mid-run (partial key populated, terminal key empty or stale),
  `/api/events` falls back to v1 cache because the terminal key has no
  fresh data. Map renders v1 enriched events throughout the v2 run.
  When the v2 run completes, the route-level terminal write populates
  `events:llm:v2` with the correct `ConflictEventEntity[]` shape and
  subsequent requests serve the fresh data.
- **Durability goal preserved.** Per-batch flush to the partial key
  survives server restart. If we ever add resumption logic (read the
  partial key on startup, skip completed batches), the data is already
  shaped correctly for that use case.
- **Defense-in-depth guards catch regressions.** If a future writer
  mistakenly targets `events:llm:v2` with an envelope shape,
  `toEntityArray(cached?.data)` coerces to `[]` at the read boundary
  rather than propagating into `.map()` and throwing. Pitfall 1 bridge
  takes over.

### Negative

- **One extra Redis key to reason about.** `events:llm:v2:partial` has
  its own TTL (9000s, matching the terminal key) and its own lifecycle.
  Documentation must keep both keys and their contracts aligned.
- **Slightly more Redis traffic.** Each successful batch now triggers
  one `cacheSetSafe` call (previously: one terminal write only).
  At ~184 batches per run, that's ~184 extra writes per run. At our
  scale (per-batch payload < 200KB, Upstash REST latency ~50-200ms),
  this is negligible — but it does consume Upstash command budget.
- **Terminal write gap remains.** There is still a window between the
  last successful batch write and the route-level terminal write where
  the terminal key may be stale. This is acceptable — the Pitfall 1
  bridge covers this window by serving v1 cache. Partial-v2-to-user
  serving is explicitly deferred to a future phase.

### Neutral

- **Observability semantics clarified.** DevApiStatus can now read
  `events:llm:v2:partial` to show progress (batches 0 through N-1) even
  while the terminal key still holds the previous complete run. This is
  a user-facing improvement for dev visibility, though it was not the
  primary motivator for the split.
- **Phase 27.4's D-09 claim ("reader semantics preserved") is now
  retroactively true.** The reader code is literally untouched by the
  writer-side partial flush logic because they operate on different
  keys. The D-09 claim was originally asserted under the single-key
  shared design, where it was structurally false; under the two-key
  split, it holds trivially.

## Alternatives Considered

- **Option A — Adapt the reader to unwrap the envelope in place.**
  Initial fix direction proposed during the live debug session. The
  reader would detect envelope-vs-array at the read site and unwrap
  to `.events`. Rejected because the envelope's inner `events` field
  carries `EnrichedEventV2[]` (pre-geocode shape) while the downstream
  consumers expect `ConflictEventEntity[]` (post-geocode, flat shape
  with `.id`, `.lat`, `.lng`). Unwrapping alone doesn't fix the type
  mismatch; the entity converter `enrichedV2ToEntities` is called only
  in the route-level terminal write, not in the extractor.
- **Option B — Revert Plan 03 entirely.** Delete the per-batch flush
  logic, accept that hung Cerebras calls cost 45+ minutes. Rejected
  because this regresses the P0 Phase 27.4 defect that 27.4.1 exists
  to fix. The envelope shape is legitimate; only the key target was
  wrong.
- **Option C — Single key with shape versioning (e.g., a discriminator
  field).** Rejected because it couples two otherwise-unrelated
  concerns (durable progress tracking vs user-facing payload cache)
  into one cache surface and creates a lifecycle coupling where a
  partial-write failure could corrupt the terminal read contract.
- **Option D — Partial-to-user serving threshold (e.g., serve v2 once
  ≥75% complete).** An attractive UX idea but out of scope for this
  fix. Logged as a deferred concern for a future phase. It requires
  answering questions (threshold, entity-conversion cost, UX for
  progressive rendering) that are orthogonal to the durability fix.

## References

- `server/lib/llmEventExtractor.v2.ts` — `EVENTS_LLM_V2_PARTIAL_KEY`
  constant, `writePartialCache` helper, `LLMCachePayload` type export.
- `server/routes/events.ts` — `toEntityArray`, `coerceCachedEvents`
  helpers; 3 read-site applications at `loadRecentEnrichedEvents`,
  `/llm-replay`, main `/api/events`.
- `server/__tests__/lib/llmEventExtractor.v2.test.ts` — 3 watchdog +
  per-batch cache integration tests that now assert against the
  `events:llm:v2:partial` key.
- Commit `a5c8846` — initial partial-key split.
- Commit `e26ceca` — reader defense-in-depth.
- `.planning/phases/27.4.1-v2-extractor-watchdog/27.4.1-CONTEXT.md` —
  D-07, D-08, D-09, D-10 locked decisions.
- `docs/runbook.md` section 10 — diagnosis + recovery for
  `/api/events` 500 errors from shape drift on either key.
- ADR-0001 — Upstash Redis over traditional Redis. This ADR inherits
  the graceful-degradation posture established there (chaos test
  validates the Promise.race timeout path; the two-key split extends
  the same "fail loud at boundaries, degrade gracefully at consumers"
  principle to the LLM pipeline cache surface).

---

_Template source: Michael Nygard, "Documenting Architecture Decisions"
(2011). Short format, immutable once Accepted — supersede with a new
ADR rather than editing the body. The status line may be updated._
