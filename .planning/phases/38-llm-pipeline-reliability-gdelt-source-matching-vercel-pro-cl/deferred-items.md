# Phase 38 — Deferred Items

Out-of-scope discoveries logged during execution (per SCOPE BOUNDARY rule). Not fixed in the originating plan.

## 38-02 (LLM-PURGE)

- **`npm run check:env` exits 1 (pre-existing)** — `scripts/check-env-example.ts` reports 15 `VITE_*` + `LLM_PIPELINE_V2`/`LLM_PIPELINE_V3` keys as "EXTRA in .env.example (not in schema)". These are client-tier (`VITE_*`, exposed via Vite, not parsed by the server `parseEnv()` Zod schema) and the two pipeline rollout flags. Confirmed present at the branch base commit (`af3bbbe`) — NOT introduced by 38-02. The 38-02 Cerebras/Groq env-key removal kept the server schema and `.env.example` consistent (neither `CEREBRAS_API_KEY` nor `GROQ_API_KEY` appears in the drift list). Fix would be either whitelisting client-tier vars in the drift checker or splitting the checker into server/client tiers — out of scope for the LLM-PURGE deletion plan.

## 38 code review (38-REVIEW.md) — deferred warnings/info

Resolved in commit `05bf712`: CR-01 (blocker) + WR-01/02/03/04. The remaining findings are deferred (pre-existing, default-off, or wire-contract changes scoped out of this phase):

- **WR-05 — `geocodeEnrichedEventsV3` (0,0) centroid on missing group** (`llmEventExtractor.v3.ts:1040-1052`). Reachable only when `V3_LINEAGE_PREFILTER` is ON (default OFF): a prefilter-hit event whose group isn't in `prioritizedGroups` defaults `centroidLat/Lng` to 0/0, risking a Gulf-of-Guinea map placement. Pre-existing prefilter path (Phase 27.4.4).
- **WR-06 — lineage-prefilter hit drops the event** (`llmEventExtractor.v3.ts:528-547`). With `V3_LINEAGE_PREFILTER` ON, a cache-hit group is removed from `groupsToProcess`, so `enrichedV3ToEntities` can't find it in `groupMap` and silently `continue`s — the "hit" never reaches the cache it was meant to serve. Default-OFF; the prefilter write-side is already noted as incomplete (Plan 02 Gate B follow-up, CLAUDE.md `events:llm:v3:group-lineage`).
- **WR-07 — `processEventGroupsV3` returns `events:null` when all groups are prefilter hits** (`llmEventExtractor.v3.ts:476-553`). Conflates "0 groups to process" with "all batches errored", surfacing `stage:'error'` in the honest-signal summary. Same default-OFF prefilter cluster.
- **IN-01/IN-02 — dead `tokenCounters`/`breakerState {cerebras,groq}` client wire shape** (`llmProgress.ts`, `useLLMStatusPolling.ts`). Cerebras/Groq purged from runtime but the client wire types still model them; IN-02 also means the client can't read the live 4-provider breaker state under TS strict. Wire-contract change — reviewer scoped it out of this phase.
- **IN-03 — `stripReasoningBlocks` ignores `_reasoningContent`** (`freeClaudeRouter.ts:265-274`), so v3 lineage `reasoningTrace` is always `''`. Observability nicety, not a correctness issue.
- **IN-04/IN-05** — minor; see 38-REVIEW.md.

Suggested home: a small v1.6 follow-up phase (or fold WR-05/06/07 into whichever phase finally wires the prefilter write-side).
