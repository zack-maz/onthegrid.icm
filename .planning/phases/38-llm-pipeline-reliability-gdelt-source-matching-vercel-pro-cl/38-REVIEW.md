---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - scripts/audit-gdelt-corpus.ts
  - scripts/audit-water-names.ts
  - server/adapters/llm-provider.ts
  - server/adapters/overpass-water.ts
  - server/config.ts
  - server/lib/corroboration.ts
  - server/lib/eventGrouping.ts
  - server/lib/freeClaudeRouter.ts
  - server/lib/llmEvalHarness.ts
  - server/lib/llmEventExtractor.v3.ts
  - server/lib/llmExtractionPipeline.ts
  - server/lib/llmProgress.ts
  - server/lib/llmSchema.ts
  - server/lib/relevanceScorer.ts
  - server/lib/replayQuota.ts
  - server/lib/romanize.ts
  - server/routes/events.ts
  - server/routes/health.ts
  - server/routes/water.ts
  - server/types.ts
  - src/components/detail/WaterFacilityDetail.tsx
  - src/components/map/layers/WaterOverlay.tsx
  - src/components/ui/DevApiStatus.tsx
  - src/hooks/useLLMStatusPolling.ts
  - src/lib/searchUtils.ts
findings:
  critical: 1
  warning: 7
  info: 5
  total: 13
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 38 bundles five workstreams: LLM honest-signal fixes (degraded-not-unknown
sentinels, null-vs-0 actorMatchRate, degrade-open replay quota), LLM-PURGE
deletions (Cerebras/Groq env, v1/v2 schemas, pipeline-flip audit), GDELT
dedup/corroboration/composite-rescore, water-name romanization, and Vercel-Pro
reconciliation. The deletions are clean — every removed symbol is now a comment
tombstone with no live dangling imports (verified by grep across server/, src/,
scripts/).

The standout defect is in the GDELT-MATCH-04 read path: `applyCompositeOrdering`
in `events.ts` recomputes `compositeScore` from scratch with a hard-coded
`corroborationBoost = 0`, **overwriting** the stored composite score that
`enrichedV3ToEntities` carefully folded the strict three-gate corroboration boost
into. The corroboration feature this phase shipped is silently discarded for the
dashboard ordering it was built to drive. Its own code comment claims the opposite
of what the code does.

Secondary concerns cluster around error-message leakage on the Bearer-gated
operator endpoints (raw `String(err)` tails returned in 500/503 bodies while the
rest of the codebase has an established `sanitizeError`/pino-redact posture), and
an honest-signal inconsistency where the no-ground-truth `runEval` early-return
returns `actorMatchRate: 0` rather than the `null` that the very same phase's
LLM-FIX-03 spent effort introducing everywhere else.

## Critical Issues

### CR-01: Composite read-ordering discards stored corroboration boost (GDELT-MATCH-04 defeated)

**File:** `server/routes/events.ts:302-317`
**Issue:** `applyCompositeOrdering` is the read-path ranking step run on every
`/api/events` response. It IGNORES the already-stored `event.data.compositeScore`
and recomputes from scratch:

```ts
const corroborationBoost = 0; // <-- hard-coded
const compositeScore = computeCompositeScore({ tier, corroborationBoost, precision });
return { ...event, data: { ...event.data, compositeScore } };
```

The strict three-gate OSINT corroboration boost (0–0.25) that
`enrichedV3ToEntities` (`llmExtractionPipeline.ts:603-608`) computes via
`checkCorroboration` and folds into the persisted `compositeScore` is thrown away
and replaced with a tier+precision-only score. The dashboard top-of-list ordering
— the entire deliverable of GDELT-MATCH-03/04 — never reflects corroboration. The
function's own comment ("Preserve any corroboration boost a producer already
folded into the existing compositeScore") describes the intended behavior, which
the code contradicts.

**Fix:** Read the producer-stored score as the floor and only recompute when the
field is absent (cold/legacy entries self-heal):

```ts
function applyCompositeOrdering(events: ConflictEventEntity[]): ConflictEventEntity[] {
  const scored = events.map((event) => {
    const stored = event.data.compositeScore;
    if (typeof stored === 'number') {
      return event; // producer already folded tier+precision+corroboration
    }
    const tier = event.data.sourceTier ?? null;
    const precision = event.data.precision ?? 'region';
    const compositeScore = computeCompositeScore({ tier, corroborationBoost: 0, precision });
    return { ...event, data: { ...event.data, compositeScore } };
  });
  return scored.sort((a, b) => {
    const diff = (b.data.compositeScore ?? 0) - (a.data.compositeScore ?? 0);
    return diff !== 0 ? diff : b.timestamp - a.timestamp;
  });
}
```

## Warnings

### WR-01: Raw error tails leaked in operator-endpoint HTTP bodies

**File:** `server/routes/events.ts:509, 562, 631`
**Issue:** Three Bearer-gated handlers return `detail: String(err).slice(0, 200)`
directly in the JSON body (replay quota-unavailable 503, replay extract-failed
500, prune-failed 503). `@upstash/redis` and `OpenAI` SDK errors can embed the
REST URL (which carries the database identifier) and other infra detail. The
codebase already established a redaction posture — `health.ts:101 sanitizeError`
strips Bearer tokens / api_key / Upstash URLs, and `logger.ts` redacts on the log
path — but these response bodies bypass it. The prompt explicitly calls out "no
stack-trace/500 leaks" on these boundaries.
**Fix:** Route the tail through `sanitizeError` (export it from a shared util) before
returning, or return a fixed opaque detail string and log the real error:

```ts
return res.status(503).json({ error: 'replay_quota_unavailable', detail: sanitizeError(err) });
```

### WR-02: `runEval` no-ground-truth early return returns `actorMatchRate: 0` instead of `null`

**File:** `server/lib/llmEvalHarness.ts:288-294`
**Issue:** Phase 38 LLM-FIX-03 widened `actorMatchRate` to `number | null`
specifically so "not populated" reads as `null`, honestly distinct from a real
`0%` (see the extensive comment at lines 394-401 and the type change in
`llmProgress.ts`, `useLLMStatusPolling.ts`, `EvalScore`). But the
`if (!gt)` early-return still emits `actorMatchRate: 0`. When the ground-truth
fixture is absent (a documented prod state — fixtures aren't always bundled, see
`config.ts:104-107`), the audit/dashboard surface will read 0% actor accuracy
rather than "not applicable", which is precisely the misread LLM-FIX-03 set out to
eliminate.
**Fix:** Return `actorMatchRate: null` in the zero-score object at line 293
(the `EvalScore` type already permits it).

### WR-03: `jaccard` returns 1 for two empty token sets → blank-text events can over-merge

**File:** `server/lib/eventGrouping.ts:86-94` (consumed at `dedupHighConfidence:146`)
**Issue:** `jaccard(a, b)` returns `1` when both sets are empty. `titleTokens`
builds its set from `label + notes`; a GDELT row with empty/missing label and
notes yields an empty set. Two such rows sharing the same actor-pair, CAMEO root,
day-bucket and ≤5 km centroid will pass the Jaccard gate (1 ≥ 0.85) and be
collapsed as a "high-confidence duplicate" despite zero textual evidence of
sameness. The dedup pass is documented as preferring under-collapse; this is the
one path where it silently over-collapses.
**Fix:** Treat empty-vs-empty as non-matching for dedup purposes — either return
`0` from `jaccard` on the both-empty case, or guard at the call site:
`if (keptTokens[i]!.size === 0 && tokens.size === 0) continue;` before the Jaccard
check.

### WR-04: `checkReplayQuota` increments the counter then sets TTL non-atomically — leak + slot-burn on partial failure

**File:** `server/lib/replayQuota.ts:68-72`
**Issue:** `await redis.incr(key)` followed by `await redis.expire(key, ...)` is
two round trips. If `incr` succeeds but `expire` throws (Redis flap), the caller's
new try/catch (`events.ts:504-511`) returns 503 — but the counter has already been
incremented with NO TTL, so the key persists indefinitely and the operator was
charged a quota slot for a call that 503'd before doing any work. Over repeated
flaps the per-Bearer counter monotonically climbs against a never-resetting key.
**Fix:** Make first-of-day atomic, e.g. `SET key 1 EX ttl NX` then `INCR` on the
existing-key path, or accept the leak but document it. At minimum, only EXPIRE when
`used === 1` is already the intent — wrap the incr+expire so a failed expire
re-issues on the next call (`if (used === 1 || (await redis.ttl(key)) < 0) await redis.expire(...)`).

### WR-05: `geocodeEnrichedEventsV3` swallows a missing group as centroid (0,0) over the Gulf of Guinea

**File:** `server/lib/llmEventExtractor.v3.ts:1040-1052`
**Issue:** `const group = groupsByKey.get(ev.groupKey)` can be `undefined` (e.g.,
lineage-prefilter cache hit injected an event whose group is not in
`prioritizedGroups`, since the prefilter drops groups from the LLM queue but the
cached event still flows into geocoding). When undefined, `ctx.centroidLat/Lng`
default to `0/0`. If `resolveLocation` then falls back to the GDELT centroid
(branch 6) or throws into the catch fallback (lines 1066-1072), the event is
placed at lat 0, lng 0 — open ocean off West Africa — and rendered on the map.
**Fix:** When `group` is undefined, skip the event or carry the cached entity's own
resolved coord instead of seeding (0,0). At minimum, guard the fallback:
`if (!group) { continue; }` or use `ev`'s prior persisted lat/lng.

### WR-06: Lineage-prefilter hit path can produce duplicate event IDs / no group context

**File:** `server/lib/llmEventExtractor.v3.ts:528-547`
**Issue:** When `V3_LINEAGE_PREFILTER` is on and a group hits a fresh cache entry,
the cached `EnrichedEventV3` is pushed to `results` and the group is removed from
`groupsToProcess` (so it never enters `prioritizedGroups`). Downstream,
`geocodeEnrichedEventsV3` and `enrichedV3ToEntities` both look the group up by key
in maps built only from the processed groups (`groupsByKey`,
`groupMap`/`groupSourceUrls`). For a prefilter-hit event, `groupMap.get(key)` is
`undefined`, so `enrichedV3ToEntities` `continue`s and silently DROPS the event
(line 575-576) — the prefilter "hit" never reaches the cache it was meant to
populate, wasting the optimization and miscounting `hitCount` vs. actually-served
events. (Default-OFF mitigates impact, but the path is reachable when operators
flip the flag.)
**Fix:** Either keep prefilter-hit groups in `groupsByKey`/`prioritizedGroups`
(carry them through as already-geocoded), or have the hit path emit a fully-formed
ConflictEventEntity directly rather than relying on the post-geocode adapter that
requires the group to be present.

### WR-07: `processEventGroupsV3` returns `events: null` when ALL groups are prefilter hits

**File:** `server/lib/llmEventExtractor.v3.ts:476-477, 553, 881-885`
**Issue:** `allFailed` starts `true` and is only cleared on a successful batch OR a
prefilter hit (line 537 sets `allFailed = false`). That part is fine. But when
`groupsToProcess` becomes empty after the prefilter loop (every group hit cache),
`totalBatches = 0`, the `tasks` loop runs zero iterations, and the only thing that
cleared `allFailed` was the hit path — OK. However, if the prefilter is OFF and
`groups` is non-empty but every batch fails parse/timeout, `allFailed` stays true
and the function returns `events: null`; `runRefreshExtraction` then logs "LLM
returned null for all batches" and writes a `stage:'error'` summary even though
some events may have been enqueued to DLQ for retry. This conflates "all batches
failed" with a hard pipeline error in the honest-signal surface. Lower severity
than CR-01 but worth aligning with the phase's honest-signal theme.
**Fix:** Distinguish "0 groups to process" (return `events: []`) from "all batches
errored" (return `null`) — the empty-prefilter-queue case should return `[]`, not
inherit `allFailed === true` semantics, so the summary reads `done` not `error`.

## Info

### IN-01: Dead `tokenCounters: { cerebras, groq }` shape persists after LLM-PURGE-06

**File:** `server/lib/llmProgress.ts:102, 287; src/hooks/useLLMStatusPolling.ts:25, 228`
**Issue:** Cerebras + Groq were purged from the runtime cascade and env, but the
`tokenCounters` field is still typed `{ cerebras: number; groq: number }` on both
the server progress singleton and the client wire contract. It is now always
`undefined` in practice (no writer). Harmless but misleading dead shape.
**Fix:** Drop the field or retype to the active provider (`{ nvidia_nim: number }`)
in a future cleanup; out of scope to change the wire contract here.

### IN-02: `breakerState` client type still `{ cerebras, groq }` while server widened to 4 providers

**File:** `src/hooks/useLLMStatusPolling.ts:231`
**Issue:** Server `breakerState` is `Record<Provider, ...>` (4 providers incl.
nvidia_nim/openrouter), but the client `LLMStatus.breakerState` is narrowly typed
`{ cerebras: ...; groq: ... }`. The actual JSON carries nvidia_nim/openrouter keys
that the client type doesn't model. No runtime crash (extra keys ignored) but the
dashboard cannot read the live breaker state under TS strict.
**Fix:** Widen the client type to the four-provider record to match the wire.

### IN-03: `stripReasoningBlocks` ignores its `reasoningContent` parameter

**File:** `server/lib/freeClaudeRouter.ts:265-274`
**Issue:** The `_reasoningContent` parameter is accepted and documented as
"reserved for downstream observability sinks" but is never used; NIM's
`reasoning_content` is read at the call site (line 471-474) and passed in but
discarded. The v3 lineage `reasoningTrace` is consequently always `''`
(extractor line 819). Documented as acceptable per D-13 "if present", so this is a
known gap, not a regression — flagging for visibility.
**Fix:** None required this phase; wire `reasoningContent` into the lineage trace if
the drill-down ever needs it.

### IN-04: `audit-water-names.ts` live path reconstructs tags from post-gate corpus → audit understates rejections

**File:** `scripts/audit-water-names.ts:180-223`
**Issue:** The live Redis path reads `water:facilities:v3` (already past the
Latin-label gate) and rebuilds a tag bag from `label`/`operator`. Since admitted
facilities by definition have a Latin label, the live audit will report ~0
gate-rejections — the docstring acknowledges this and steers to `--snapshot`, but
an operator running the default `npm run audit:water` gets a misleadingly empty
report. Read-only / non-destructive contract is honored.
**Fix:** Print a louder warning (or exit non-zero) on the live path so the
post-gate caveat isn't missed; already partially done via console.error.

### IN-05: `overpass-water.toTitleCase` double-`replace` chain does not lowercase the tail

**File:** `server/adapters/overpass-water.ts:449-456`
**Issue:** The chained `.replace(/\b\w/, upper).replace(/\b(\w)(\w*)/, first+rest)`
uppercases the first letter but leaves the remainder as-is, so an all-caps OSM
operator ("SAUDI WATER AUTHORITY") stays uppercase. `romanize.ts` has its own
correct `toTitleCase` (lowercases via `cleanupArtifacts` first), so romanized
tokens are fine; this only affects raw-OSM Latin labels and is pre-existing
behavior. Cosmetic.
**Fix:** Lowercase the tail: `.replace(/\b(\w)(\w*)/g, (_m, f, r) => f.toUpperCase() + r.toLowerCase())`.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
