# Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 33-actor-metadata-audit-canonical-catalog-eval-expansion
**Mode:** `--auto` (no interactive prompts; recommended-default selections logged inline)
**Areas discussed (auto-selected ALL):** Audit methodology, Catalog data model + seeding, Canonicalization integration point, `actorConfidence` schema shape, Eval harness extension, Adversarial fixture scope, Dashboard surface, Backfill strategy

---

## [--auto] Gray-area selection

`[--auto] Selected all gray areas: Audit methodology, Catalog data model + seeding, Canonicalization integration point, actorConfidence schema shape, Eval harness extension, Adversarial fixture scope, Dashboard surface, Backfill strategy.`

---

## Audit methodology (ACTOR-01)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| One-shot script + report committed; deterministic detection for 3 of 4 buckets; bucket-d reserved for human spot-check          | Matches Phase 31 `watch:snapshot` style. Bucket (a)/(b)/(c) detection is regex + denylist. Bucket (d) source-disagreement requires LLM or human; spot-check rubric reserves operator time. | ✓ (recommended default) |
| Continuous test under `npm test` with assertion thresholds                                                                      | Audit becomes a regression check, not a one-time deliverable. Higher long-term overhead; ACTOR-01 says one-time.                                                                           |          |
| Second LLM pass to auto-detect bucket-d source-disagreement                                                                     | High cost; not budgeted by ACTOR-01. Defer.                                                                                                                                                |          |

**Auto-selected:** One-shot script + report; deterministic 3-of-4 buckets; spot-check for bucket-d.
**Notes:** `[auto] Audit methodology — Q: "How to detect failure buckets at scale?" → Selected: "Deterministic regex+denylist for null/raw-CAMEO/ambiguous; skip source-disagreement for human spot-check" (recommended default)`. Drives D-01..D-03.

---

## Catalog data model + seeding (ACTOR-02)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Static TS module at `server/data/actor-catalog.ts`; `alias→canonical` Map; affiliation reuses `Faction` enum                    | Mirrors `src/lib/factions.ts` / `src/lib/ethnicGroups.ts`. Single source of truth, no runtime config, contract test pins invariants.                                                       | ✓ (recommended default) |
| Redis-backed registry with operator mutation endpoint                                                                           | Allows runtime updates. Adds attack surface + auth + audit-log complexity. No driving need yet.                                                                                            |          |
| JSON file at `.planning/data/actor-catalog.json` loaded at startup                                                              | Avoids TypeScript compile coupling; but loses type safety + Zod parse + the test pattern's leverage.                                                                                       |          |

**Auto-selected:** Static TS module at `server/data/actor-catalog.ts` with alias→canonical Map.
**Notes:** `[auto] Catalog data model — Q: "Where + what shape?" → Selected: "server/data/actor-catalog.ts static TS module with alias→canonical Map, affiliation reuses Faction enum" (recommended default)`. Drives D-04..D-07.

---

## Canonicalization integration point (ACTOR-03)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Server-side post-mapping after Zod validate; prompt updated as best-effort hint                                                 | Deterministic, auditable. LLM compliance with prompt is non-binding; catalog is the enforcement point. Matches Phase 28.1 D-13 colorBridge "single source of truth" philosophy.            | ✓ (recommended default) |
| Prompt-side instruction only (LLM emits canonical names; server does NOT re-map)                                                | Smaller code change; but LLM compliance variance leaks into the cache. Audit trail is the LLM, not a deterministic catalog.                                                                |          |
| Both — prompt-side instruction AND server-side post-mapping with mismatch logging                                               | Strongest signal but adds logging surface + risk of false positives flagging acceptable variants. Defer.                                                                                   |          |

**Auto-selected:** Server-side post-mapping; prompt updated as best-effort hint.
**Notes:** `[auto] Canonicalization point — Q: "Prompt-side LLM instruction or server-side post-mapping?" → Selected: "Server-side post-mapping (deterministic, auditable); prompt updated as best-effort hint" (recommended default)`. Drives D-08, D-09.

---

## `actorConfidence` schema shape (ACTOR-03)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Parallel array `('high'\|'medium'\|'low')[]` index-locked to `actors[]`; stay at `events:llm:v3` (additive, forward-compat)     | Flat array matches `aliases: string[]` project pattern. Forward-compat default (`'low'`) repaired server-side. Cache key bump not needed because additive.                                 | ✓ (recommended default) |
| Per-actor object `Array<{actor, confidence}>`                                                                                   | Cleaner per-actor coupling; but breaks shape with existing `actors[]` and forces a wider refactor. Defer until additional per-actor fields demand it.                                       |          |
| Bump cache key to `events:llm:v3.1` for safety                                                                                  | Eliminates rollout-window risk but creates a 24h empty-cache period until next cron tick. Forward-compat is the smaller-blast-radius option.                                               |          |

**Auto-selected:** Parallel array, index-locked to `actors[]`; stay at `events:llm:v3`.
**Notes:** `[auto] actorConfidence shape — Q: "Per-actor object or parallel array? Cache key?" → Selected: "Parallel array of enum, index-locked to actors[]; stay at events:llm:v3 (forward-compatible)" (recommended default)`. Drives D-10..D-12. **Caveat raised inside D-11:** planner must verify strict() behavior on extend; fallback to optional() field if existing-no-actorConfidence entries fail validation during rollout.

---

## Eval harness extension (ACTOR-04)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Score actor predictions from the LIVE `events:llm:v3` cache (preserves resolver-only constraint)                                | Phase 27.4 D-25 resolver-only constraint preserved by NOT calling the LLM in eval. Live cache is the actual data the operator sees. Eval scoring rate depends on a recent cron run — acceptable. | ✓ (recommended default) |
| Bypass resolver-only constraint; call the LLM during eval for actor extraction                                                  | Most accurate signal; ~100x token cost. Rejected by Phase 27.4 D-27 (shadow mode rejected, same reasoning).                                                                                |          |
| Separate sub-harness with `EVAL_HARNESS_EXTRACT=true` env flag                                                                  | The flag already exists conceptually (see `llmEvalHarness.ts` header comment) but is intentionally not wired. Defer until budgeted.                                                        |          |

**Auto-selected:** Score live `events:llm:v3` against ground-truth `expectedActor{1,2}`.
**Notes:** `[auto] Eval extension — Q: "Resolver-only constraint vs full LLM extraction?" → Selected: "Score live events:llm:v3 cache against ground-truth expectedActor{1,2} — preserves resolver-only by NOT calling LLM in eval" (recommended default)`. Drives D-13, D-14.

---

## Adversarial fixture scope (ACTOR-04)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 3 injections covering side-swap, ambiguity, code-as-actor                                                                       | One per ACTOR-01 failure-bucket category. Larger sets add noise without signal. Existing fixture budget (under 10) preserved.                                                              | ✓ (recommended default) |
| 10+ injections with combinatorial coverage                                                                                      | Higher coverage but maintenance overhead; each injection has to be hand-curated against a real source pattern.                                                                              |          |
| 1 injection only (minimum viable)                                                                                               | Below the "at least one" bar from ACTOR-04 in spirit; doesn't exercise all three failure-bucket modes.                                                                                     |          |

**Auto-selected:** 3 injections: side-swap, ambiguity, code-as-actor.
**Notes:** `[auto] Adversarial fixtures — Q: "How many actor-confusion injections?" → Selected: "3 injections covering side-swap, ambiguity, code-as-actor" (recommended default)`. Drives D-15.

---

## Dashboard surface (ACTOR-05)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `/api/operator-status` gains `actorQuality` block (lazy compute, no new Redis sidecar); render in existing quality-metrics block | Matches Phase 32 D-13 smallest-blast-radius. Reuses operator-status's existing `events:llm:v3` deserialization. UI co-located with existing quality metrics.                              | ✓ (recommended default) |
| New dedicated `/api/actor-quality` endpoint with new Redis sidecar                                                              | More separation of concerns but adds endpoint surface + sidecar. Not justified by current load.                                                                                            |          |
| Embed in `/api/events/llm-status` response instead of `/api/operator-status`                                                    | Tighter coupling to extraction pipeline; but llm-status is a public-tier endpoint while operator-status is Bearer-gated. Actor drill-down should stay Bearer-gated.                        |          |

**Auto-selected:** `/api/operator-status` `actorQuality` block (lazy) + co-located render in DevApiStatus quality block.
**Notes:** `[auto] Dashboard surface — Q: "Where do counters live?" → Selected: "/api/operator-status actorQuality block (lazy computed; no new Redis sidecar) + co-located render in DevApiStatus quality block" (recommended default)`. Drives D-16, D-17.

---

## Backfill strategy (cross-cutting)

| Option                                                                                                                          | Description                                                                                                                                                                                | Selected |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Forward-only via daily 04:00 UTC cron; operator can `?force=true` for immediate refresh                                         | Preserves anti-pattern #17 (cron-only writer). No migration script. Cache rolls over within 24h naturally. Smallest blast radius.                                                          | ✓ (recommended default) |
| One-time migration script writes `actorConfidence` defaults + canonicalization to existing entries                              | Faster convergence; but writes to `events:llm:v3` from outside the cron — violates anti-pattern #17. Rejected.                                                                             |          |
| Lazy-on-read transformation in `/api/events`                                                                                    | Defers cost to read path; but `/api/events` is read-only and the transformation is non-trivial. Adds latency and write-on-read complexity. Rejected.                                       |          |

**Auto-selected:** Forward-only via daily cron; `?force=true` available for immediate refresh.
**Notes:** `[auto] Backfill strategy — Q: "Re-extract existing events?" → Selected: "Forward-only via daily cron; no migration script" (recommended default)`. Drives D-18.

---

## Claude's Discretion

Areas where the recommended default points to "researcher decides during plan-phase":

- **Audit script execution surface.** Standalone Node script (`tsx`) vs vitest `describe.skip` flipped on demand. Researcher picks based on what's simplest to commit alongside the report.
- **CAMEO codebook source + format.** `.txt` vs `.json`; GDELT-published snapshot vs internal constants in `server/adapters/gdelt.ts`. Researcher's call.
- **Canonicalize() ordering when multiple aliases match.** Recommended: longest-alias-wins; researcher confirms during impl.
- **`expectedActor1 AND expectedActor2` vs OR matching.** D-13 picks AND; researcher may relax to OR for ambiguous events during ground-truth backfill.
- **JSON Schema for `actorConfidence`: required vs optional at wire level.** Recommended: required with server-side repair as defense-in-depth. Researcher picks optional if NIM rejects the constraint.
- **Catalog `affiliation` field surfacing in dashboard.** Stored; not surfaced in Phase 33. Recommendation locks the choice; researcher confirms.

---

## Deferred Ideas

- LLM-driven source-disagreement detection (ACTOR-01 bucket d).
- Sub-faction breakdown beyond `us | iran | neutral`.
- Catalog editing via dashboard / operator endpoint.
- Per-actor object schema (`{actor, confidence}`).
- Retroactive backfill of `events:llm:v3` with `actorConfidence`.
- Actor catalog → frontend rendering layer.
- CAMEO codebook automatic re-sync.
- Confidence model refinement (numeric vs enum).

---

_Mode `--auto` recap: 8 gray areas auto-selected; recommended default chosen for each; CONTEXT.md committed as the canonical record. Auto-advancing to plan-phase._
