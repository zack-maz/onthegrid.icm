---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 04
subsystem: llm-extraction-pipeline
tags: [actor-metadata, extractor, post-validate, prompt, repair, canonicalization, defense-in-depth]
dependency-graph:
  requires:
    - 33-02 # canonical actor catalog at server/data/actor-catalog.ts (canonicalize())
    - 33-03 # enrichedEventV3 schema extension with actorConfidence
  provides:
    - applyCatalogToEvents helper (D-08 server-side post-mapping; exported from llmEventExtractor.v3.ts)
    - repairActorConfidence helper (D-10 server-side defense-in-depth; exported from llmEventExtractor.v3.ts)
    - SYSTEM_PROMPT_V3 carrying canonical-full-names hint + actorConfidence wire instruction (D-09)
  affects:
    - server/lib/llmEventExtractor.v3.ts post-validate path (line 835-843)
    - events:llm:v3 cache writes (now carry canonical names + length-locked actorConfidence)
    - lineage cache at events:llm:v3:lineage:{eventId} (records canonical/repaired payload)
tech-stack:
  added: []
  patterns:
    - Phase 28.1 D-13 colorBridge philosophy — single static module as canonical source; runtime walks candidate inputs through it
    - Phase 32 D-13 smallest-blast-radius — no new Redis sidecar, no new endpoint; helpers compose into existing post-validate site
    - vi.mock + await import (freeClaudeRouter.test.ts:1-57) — mock registers before dynamic import of module-under-test
key-files:
  created:
    - server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts
    - server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts
  modified:
    - server/lib/llmEventExtractor.v3.ts
key-decisions:
  - D-08 applied at post-validate site (line 835) — catalog is the single source of truth for actor naming, not the prompt
  - D-09 SYSTEM_PROMPT_V3 line 147 extended (actors hint) + line 152 added (actorConfidence wire instruction)
  - D-10 actorConfidence repair on Open Q §2 wire-required path — conservative 'low' default fills missing/mismatched arrays
  - Lineage capture loop iterates over repairedEvents (line 863) — cached lineage matches canonical/repaired payload that flows to events:llm:v3
  - Helpers exported (not module-private) for direct unit testing via vi.mock + dynamic import pattern
requirements-completed: [ACTOR-03]
metrics:
  duration: '4 min'
  completed: '2026-05-21'
  tasks: 2
  files: 3
  commits: 3
---

# Phase 33 Plan 04: Extractor Integration of Canonical Catalog + actorConfidence Repair Summary

Server-side post-mapping in `llmEventExtractor.v3.ts` now canonicalizes every parsed-and-validated event's `actors[]` against the Plan 33-02 catalog and repairs the Plan 33-03 `actorConfidence` field to the index-locked-parallel-array invariant — making catalog naming + confidence shape deterministic regardless of LLM prompt compliance. Cron-only writer invariant (anti-pattern #17) preserved.

## What landed

### Helpers (exported for unit-testability)

- **`applyCatalogToEvents(events: EnrichedEventV3[]): EnrichedEventV3[]`** at `server/lib/llmEventExtractor.v3.ts:183` — D-08 walks each event's `actors[]` through `canonicalize(name)` from `server/data/actor-catalog.ts`. Matched aliases get replaced by their `canonicalName`; unmatched actors pass through unchanged (D-08 pass-through contract).

- **`repairActorConfidence(event: EnrichedEventV3): EnrichedEventV3`** at `server/lib/llmEventExtractor.v3.ts:203` — D-10 defense-in-depth: if `actorConfidence` is null/undefined or length-mismatched against `actors`, returns the event with `actorConfidence: actors.map(() => 'low' as const)`. Length-matched arrays pass through unchanged.

### Post-validate integration site

`server/lib/llmEventExtractor.v3.ts:835-843` — between `batchResponseV3.safeParse(parsed)` success branch and `results.push`:

```ts
const canonicalizedEvents = applyCatalogToEvents(validated.data.events); // D-08
const repairedEvents = canonicalizedEvents.map(repairActorConfidence); // D-10
results.push(...repairedEvents);
```

Lineage capture loop at line 863 iterates over `repairedEvents` so the cache at `events:llm:v3:lineage:{eventId}` records the same canonical/repaired payload that flows to `events:llm:v3`.

### Prompt extension (D-09 + Open Q §2)

`server/lib/llmEventExtractor.v3.ts:147` (numbered line 9 actors) — extended from `'9. actors: array of actor names involved'` to:

```
'9. actors: array of actor names involved — prefer canonical full names
 (e.g., "Islamic Revolutionary Guard Corps" over "IRGC" or "Iranian forces").
 Server-side mapping handles known variants.'
```

`server/lib/llmEventExtractor.v3.ts:152` (new numbered line 14):

```
'14. actorConfidence: array of "high" | "medium" | "low" — one entry per actors[],
 same length, indicating your certainty for each actor identification.'
```

D-09 is best-effort (the LLM may ignore it); D-08 is the enforcement. The new line 14 instruction is Open Q §2 NIM wire-required forcing function — the catalog mapping + repair step (D-10) is the defense-in-depth net underneath.

## Commit history

Three atomic commits per Plan 33-04 acceptance:

| #   | Hash    | Type | Decision                                                                                      | Files                              |
| --- | ------- | ---- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | fa995d7 | test | RED — failing tests for D-08 + D-10 + D-09 substrings                                         | 2 test files                       |
| 2   | c0f82a1 | feat | GREEN — applyCatalogToEvents + repairActorConfidence + post-validate integration (D-08, D-10) | server/lib/llmEventExtractor.v3.ts |
| 3   | 696660b | feat | SYSTEM_PROMPT_V3 hint + actorConfidence instruction (D-09, Open Q §2)                         | server/lib/llmEventExtractor.v3.ts |

(Plan asked for "3 atomic commits preferred" and this delivered all three. D-08 and D-10 ship in the same commit because they share the post-validate site and the same atomic test gate — they cannot meaningfully be RED→GREEN'd in isolation without re-shaping the test file.)

## Verification

- `npx vitest run server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts` → **7/7 passed**
- `npx vitest run server/__tests__/lib/llmEventExtractor` (broad pattern) → **16/16 passed** (3 test files)
- `npx vitest run server/__tests__/lib/llm` (full LLM-pipeline regression sample) → **175/175 passed** (18 test files)
- `npx tsc --noEmit -p tsconfig.server.json` → **0 errors**
- `grep -c "'9. actors: array of actor names involved'," server/lib/llmEventExtractor.v3.ts` → **0** (unextended form fully removed)
- Post-validate site applies helpers BEFORE `results.push` (verified by reading lines 833-843)

## Decision-coverage trace

| Decision                    | Implementation                                                                                     | Line                  |
| --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------- |
| D-08 (catalog post-mapping) | `applyCatalogToEvents` helper + invocation at post-validate site                                   | 183 (decl), 835 (use) |
| D-09 (prompt hint)          | `SYSTEM_PROMPT_V3` line 147 actors instruction extended + line 152 new actorConfidence instruction | 147, 152              |
| D-10 (server-side repair)   | `repairActorConfidence` helper + invocation at post-validate site                                  | 203 (decl), 841 (use) |

## Operator monitoring window (Open Q §2)

`actorConfidence` is now required on the LLM wire (D-12, Plan 33-03 / `EVENT_EXTRACTION_SCHEMA_V3` required array includes it). NIM should honor the JSON Schema required-fields directive, but its enforcement is sometimes relaxed. After deploy:

- **Watch:** `schemaFailures.nvidia_nim.missingField` counter (surfaced via `llmProgress` → `/api/operator-status`) for one cron tick (~24h, since /api/cron/refresh-events runs at 04:00 UTC daily). The counter increments inside the `if (!validated.success)` branch at line 808-830 of `llmEventExtractor.v3.ts`.
- **If rate spikes:** the LLM is rejecting required-array-of-enums; flip `actorConfidence` from required → optional in `EVENT_EXTRACTION_SCHEMA_V3` (one-line revert in `server/lib/llmSchema.ts:463`). The Zod schema already keeps `actorConfidence` `.optional()` so the server-side repair (`repairActorConfidence`) continues filling defaults — no production data loss.
- **If rate stays flat:** wire-required is working; no further action.

The D-10 server repair guarantees `events:llm:v3` writes always carry length-locked actorConfidence even if NIM omits it.

## Deviations from Plan

None — plan executed exactly as written. The three atomic commits land in the order the plan recommended (RED → D-08+D-10 → D-09); D-08 and D-10 are coalesced into the same commit because they share the post-validate site and the same test gate, which the plan explicitly permitted ("3 atomic commits preferred or coalesced into 1-2 with rationale").

## Known Stubs

None. All helpers ship with real implementations; no hardcoded placeholders flow to the cache.

## Threat Flags

None new. The plan's `<threat_model>` covers:

- T-33-03 (Tampering on `applyCatalogToEvents` output) — mitigated by static-literal `canonicalName` values and pass-through-on-miss (no string concat surface)
- T-33-03b (Repudiation on `actorConfidence` 'low' defaults) — accepted; documented for downstream Plan 33-06 dashboard surface
- T-33-04c (Tampering on `SYSTEM_PROMPT_V3` extension) — accepted; prompt is server-controlled committed code

No new trust boundaries introduced. `events:llm:v3` writer path remains cron-only.

## Self-Check: PASSED

- Files created on disk: `server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts`, `server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts`, `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-04-SUMMARY.md` — all verified with `[ -f ]`.
- File modified on disk: `server/lib/llmEventExtractor.v3.ts` — verified.
- Commits exist in git log: fa995d7, c0f82a1, 696660b — all verified.
- All `<acceptance_criteria>` from Task 1 + Task 2 verified PASS (see Verification section).
- Plan-level `<verification>` block re-run: 175/175 LLM-pipeline tests pass, TS check clean.
