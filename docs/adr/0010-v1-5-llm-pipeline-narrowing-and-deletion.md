# ADR-0010: v1.5 LLM pipeline narrowing and deletion

**Status:** Accepted
**Date:** 2026-05-11
**Deciders:** solo author

## Context

The v1.5 milestone brief opened with the position that the active LLM cascade
had drifted: 4 providers configured (Cerebras, Groq, NIM, OpenRouter) but
only 2 actually used (NIM + OpenRouter via the v3 extractor's `freeClaudeRouter`
path). The v1 + v2 extractor modules had been preserved per Phase 27.4 D-26/D-40
as deep-rollback safety; ~2 weeks of stable v3 production (since Phase 27.4
shipped 2026-04-21) plus the Pitfall 1 cache bridge (which provides
"map-never-blank" independent of which extractor wrote the cache) made that
preservation no longer earn its keep.

Phase 29 (the first phase of the v1.5 milestone) opens the simplification
sweep. Cascade-narrowing, v1+v2 deletion, the LLM-optional architecture
proof, and a Vercel Pro upgrade all land in the same phase so subsequent
v1.5 work tunes against a smaller, sharper code surface and the new 800s
maxDuration ceiling.

## Decision

1. **Narrow the active cascade.** Cerebras + Groq removed from
   `server/adapters/llm-provider.ts` runtime path. Adapter source files
   left importable for emergency-only reference; no production code path
   references them.

2. **Delete v1 + v2 extractor modules.** `server/lib/llmEventExtractor.v1.ts`
   and `server/lib/llmEventExtractor.v2.ts` deleted along with their
   Redis cache keys (`events:llm`, `events:llm:v2`, `events:llm:v2:partial`,
   `events:llm-summary`, `events:llm-summary:v2`), their pipeline-version
   toggle (`isPipelineV2`, `setPipelineOverride`, the
   `events:llm-pipeline-override` key + endpoint), and the Pitfall 1
   bridge that read them. v3 is now the only extractor; the cache bridge
   collapses to "serve `events:llm:v3` or raw GDELT."

3. **Prove the LLM-optional architecture.** A new integration test
   exercises the `/api/events` path with all LLM credentials unset and
   asserts the route serves the raw-GDELT fallback. The runbook is
   extended with the unset-credentials recovery procedure so the
   degrade-open posture is auditable, not just folkloric.

4. **Vercel Pro upgrade landed in the same phase** so subsequent v1.5
   phases (30, 31) tune against the 800s maxDuration ceiling. The cron
   triad (`/api/cron/health`, `/api/cron/warm`, `/api/cron/refresh-events`)
   no longer sits at the 60s Hobby-tier wall, removing the cascade-timeout
   class of failure from the cron-warm and refresh-events runs.

<expand_at_36>

## Consequences

### Positive

- Smaller bundle, fewer code paths.
- Rollback path simplified: `git revert <Phase 29 range>`.
- The active code path is obviously the active code path — no flag-gated
  branches, no preserved-for-rollback modules to triage during incidents.

### Negative

- The Phase 27.4 D-26/D-40 deep-rollback lock is superseded. If a
  v3-only defect surfaces that v1 or v2 would have masked, the recovery
  path is git-revert the Phase 29 deletion range and redeploy — not
  flip a runtime flag.
- ADR-0009 (the two-key-split for partial vs terminal v2 reads) becomes
  partially historical — the v2 keys it documents are deletion targets
  here. The reasoning preserved in ADR-0009 stays load-bearing for the
  v3 partial-key pattern (`events:llm:v3:partial`), which inherits the
  same writer/reader-shape-isolation discipline.

### Neutral

- `shouldPauseNewEvents()` soft-cap pause becomes unreachable
  post-narrowing (it gated v2-vs-v3 racing in the events route).
  Documented as Phase 30 cleanup work.

## Alternatives Considered

- **Archive v1.ts + v2.ts to `attic/`** (original SIMPLIFY-06 plan).
  Rejected per CONTEXT D-02: archived code creates the same triage
  burden as preserved code — operators see the files, wonder if they
  are still load-bearing, and the simplification gain evaporates. Git
  history is the archive.
- **Add `LLM_PIPELINE_ENABLED` env-var kill-switch.** Rejected per
  D-05: "unset both `CEREBRAS_API_KEY` + `OPENROUTER_API_KEY`" is the
  kill switch. A dedicated env var would duplicate that mechanism and
  add a configuration surface to keep in sync.

## References

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md`
  (D-01 through D-11)
- Phase 27.4 D-26/D-40 lock (v1+v2 deep-rollback preservation —
  superseded here)
- ADR-0009 — Two-key split for LLM partial progress vs terminal reads
  (partially superseded — v2 keys it documents are deletion targets in
  Phase 29; the writer/reader-shape-isolation principle is preserved
  in the v3 partial-key pattern)
- Commit range: <filled in at PR merge time>

---

_Template source: Michael Nygard, "Documenting Architecture Decisions"
(2011). Short format, immutable once Accepted — supersede with a new
ADR rather than editing the body. The status line may be updated._
