---
status: pending
captured: 2026-04-19T23:20:00Z
source: Phase 27.3.1 post-execution verification
category: tech-debt
priority: low
blocking: false
---

# Phase 27 LLM pipeline TypeScript debt — ~30 strict-mode errors

Pre-existing strict-mode TypeScript errors in two Phase 27 files, surfaced
but **not introduced** by Phase 27.3.1 gap closure. Verified against pre-phase
commit `79b2210` — the same error pattern existed before any gap plan ran, so
this is carried debt not a regression.

## Files + error shapes

- `server/lib/llmEventExtractor.ts`
  - ~22 errors
  - `TS18048: 'g' / 'entity' / 'event' is possibly 'undefined'` (around lines 140-150, 247, 287-301)
  - `TS2345: resolvedLat/resolvedLng partial object not assignable to LLMExtractedEvent` (around lines 257, 280, 293)
- `server/routes/events.ts`
  - ~3 errors
  - `TS2345: ConflictEventEntity id: string | undefined vs string`
  - `TS18048: 'template' is possibly 'undefined'`

## Why it exists

These code paths iterate over LLM-extracted event arrays with `.map()` / `for`
loops where the compiler cannot prove the loop index returns a defined value
under strict optional-property checks. The types defined in
`server/schemas/llmEvent.ts` permit `undefined` on fields that the runtime
logic assumes non-null after validation.

## Why it's not urgent

- Runtime behavior is correct (Zod validation runs upstream; the undefined branch
  is unreachable at runtime).
- Tests pass (`npx vitest run server/` — 811/811).
- No consumer of these files depends on the TS error surface.
- Phase 27 has an active follow-up milestone (Phase 27.4 LLM Enrichment
  Improvements) that will revisit this pipeline and should clean this up as
  part of its scope.

## Recommended fix approach (whenever scheduled)

Two clean options:

1. **Narrow types at validation boundary**: after Zod parse returns, cast
   through a stricter interface that exactly-matches the non-optional shape.
   One-file change to `llmEventExtractor.ts` around the Zod parse.
2. **Add non-null assertions at the iteration boundary**: `const g = group!;`
   inside each hot loop with a short comment linking back to the upstream Zod
   schema. Cheaper but bluntly noisy.

Option 1 is preferred — it makes the invariant live at the type layer.

## Do not defer forever

If Phase 27.4 does not absorb this within the milestone, file it as an explicit
phase-pre-req so `tsc -b --noEmit` can be made a blocking CI gate (currently
advisory because of these known holdouts).

## Status update — 2026-04-22

Current error count re-verified on branch `feature/27.4-llm-enrichment-improvements`
(HEAD `712a2be`):

- `server/lib/llmEventExtractor.v1.ts` — 20 errors (same shapes as original todo;
  file renamed during Phase 27.4 v1/v2 split, errors migrated verbatim)
- `server/routes/events.ts` — 0 errors ✅ (cleaned up during 27.4)
- `src/hooks/useEntityLayers.ts` — 8 errors (`depthTest` unknown, deck.gl v9
  drift; out-of-scope for this todo)
- `server/adapters/llm-provider.ts` — 1 error (out-of-scope for this todo)

### Scope decision

Bundled into **Phase 27.4.1** (P0 v2 extractor watchdog + this cleanup) per
2026-04-22 session decision. When that phase opens, the in-scope work here is
the 20 errors in `llmEventExtractor.v1.ts` — apply Option 1 (narrow types at
the Zod parse boundary). Close this todo when that phase lands.

Note: `llmEventExtractor.v1.ts` is preserved as rollback code only; v2 is the
runtime default as of commit `712a2be`. Urgency is accordingly low, but the
cleanup still unblocks making `tsc -b --noEmit` a blocking CI gate.
