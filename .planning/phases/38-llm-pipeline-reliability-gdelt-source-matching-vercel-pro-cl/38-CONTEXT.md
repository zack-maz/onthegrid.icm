# Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Five reliability/quality strands, merged into one phase by operator decision (2026-06-03), delivered together on one branch/PR:

1. **LLM-FIX** (6 REQ-IDs) — bug fixes from the v1.5-close punch-list: honest `lastErrorReason` token split, Open-Meteo cache-write policy, `33-AUDIT-REPORT` stub / `actorMatchRate:0` misread, chaos-mock coverage gap for raw-redis call sites, dedicated quota-path chaos test, `events.test.ts` v1→v3 mock drift.
2. **LLM-PURGE** (9 REQ-IDs) — Phase 29 finishing pass: delete v1/v2 extractor stub + Zod schemas, `llm-provider.ts` shim, stale headers, OpenRouter dead writer paths, Cerebras/Groq references; rewrite false docstrings.
3. **GDELT-MATCH** (4 REQ-IDs) — corpus quality: Phase-22-style audit, mention-collapse dedup before enrichment, OSINT corroboration, source-tier composite re-rank.
4. **WATER-LATIN** (4 REQ-IDs) — romanize non-Latin water-facility names so the Latin-label admission gate stops dropping legitimate infrastructure; preserve `name`, add `nameLatin`.
5. **VERCEL-PRO** (4 REQ-IDs) — reconcile Vercel Pro semantics across code + docs; Fluid Compute verification; CLI bump; Hobby→Pro docs-drift repair.

**This phase clarifies HOW to implement the 28 roadmap REQ-IDs — it does NOT add capabilities. The merged 5-strand scope is roadmap-locked; new capabilities belong in other phases.**

</domain>

<decisions>
## Implementation Decisions

### Scope shape & sequencing

- **D-01:** **Keep Phase 38 intact as one phase with strand-aligned plans.** The planner decomposes into ~5–6 strand-aligned plans (LLM-FIX, LLM-PURGE, GDELT-MATCH, WATER-LATIN, VERCEL-PRO), run in dependency waves. No sub-phase split (38.1/38.2 rejected). Honors the roadmap-locked merge, keeps one branch/PR. Parallelizable strands wave together per the roadmap hint (38+39 interleave; within 38, WATER-LATIN and VERCEL-PRO are largely independent of the LLM core).
- **D-02:** **CRON-WATCH-01 (optional 7-day watch) is DEFERRED — it does NOT gate phase close.** SC38-7 stays unfired. A 7-day calendar watch cannot complete inside an execution session and would hold Phase 38 open for a week, blocking 39/40/41. Phase 31 already captured a Day-1 natural PASS in v1.5. Route to v1.7 backlog / opportunistic watch.

### Dead-code purge forks

- **D-03 (LLM-PURGE-05 pipelineAudit):** **Path A — full delete.** Delete `appendPipelineAudit` writer, narrow the `from/to` union to v3-only, remove `PipelineFlipsBlock` (`src/components/ui/DevApiStatus.tsx:2841` + its render call `:3044`) and the `openapi.yaml:1841` entry. In a v3-only pipeline there are no version flips to record; the 90d-TTL key drains on its own (~2026-09-01).
- **D-04 (LLM-PURGE-08 OpenRouter):** **Path A — gate, don't delete.** Gate OpenRouter behind `env.OPENROUTER_API_KEY` presence AND remove `incrOpenRouterDaily` + the unreachable daily-cap writes. Preserves ADR-0010's deliberate "dormant, could wake if key set" semantics while killing the dead writer paths. Also fix the `skipOpenRouter` line drift — CLAUDE.md/ADR-0010 cite `622/929`; actual is **`v3.ts:629/951`** (confirmed by scout).

### Bug-fix approach

- **D-05 (LLM-FIX-02 Open-Meteo cache-write, `water.ts:359`):** **Empty-result sentinel write.** On total batch failure, write a distinct sentinel (e.g. `{data:[], failed:true, fetchedAt}`) so the audit reads a fresh write (no false degrade) while the failure stays distinguishable from a genuinely-empty result. Honors the phase's "honest signals" theme. Exact shape is planner's discretion (see Claude's Discretion).
- **D-06 (LLM-FIX-03 `33-AUDIT-REPORT.md`):** **Document the gap + make the scorer honest.** Make `actorMatchRate` (`llmEvalHarness.ts:351-388`) return `null`/`N-A` (NOT a silent `0`) when ground-truth `expectedActor1/2` is absent, and replace the TBD stub with an explicit "not yet populated — requires staging run" note. No operator action required this phase. The full `run-audit.ts`-against-staging run is **deferred to v1.7 backlog.**

### GDELT corpus ambition

- **D-07:** **Audit-gated + non-destructive.** GDELT-MATCH-01 (Phase-22-style audit of the live `events:llm:v3` corpus) runs FIRST as the strand's Plan 1; its findings size 02–04. Dedup (GDELT-MATCH-02) collapses only **high-confidence** duplicates (conservative threshold; preserves genuinely distinct events). The composite score (GDELT-MATCH-04) is an **additive** field that re-orders the dashboard top-of-list WITHOUT mutating or dropping the raw corpus. Reversible, low-risk. Exact dedup thresholds are planner's discretion, informed by the audit.

### Water romanization

- **D-08 (WATER-LATIN-02 library):** **pure-JS `transliteration` npm package.** Zero native deps → serverless-safe on Vercel (avoids ICU/full-icu native-binary weight). WATER-LATIN-01 audit samples validate quality on Arabic/Persian/Hebrew BEFORE lock-in; per-script overrides added only where it falls short. ICU is the fallback ONLY if `transliteration` fails the audit-sample quality bar. Preserve original `name`, add `nameLatin`, romanize in `overpass-water.ts` BEFORE the Latin-label admission gate.

### Vercel Pro

- **D-09:** **Ship the safe work; default-defer the risky migrations.** Always ship: VERCEL-PRO-03 (Fluid Compute compat verification on `createApp()`), VERCEL-PRO-04 (Hobby→Pro docs-drift repair across CLAUDE.md/deployment/runbook/degradation/reliability-doc + CLI 52→latest). **Evaluate** VERCEL-PRO-01 (`vercel.json`→`vercel.ts`) + VERCEL-PRO-02 (Build Output API for `api/vercel-entry.js`) but **DEFAULT-DEFER both unless the evaluation shows a clear simplification win** — don't risk the production deploy path for cosmetics mid-cleanup-phase. Phase 999.2 stays open unless Build Output API actually ships.

### Claude's Discretion

- Plan ordering / wave structure within the strand-aligned decomposition (D-01).
- Exact Open-Meteo sentinel shape (D-05).
- GDELT dedup thresholds + corroboration tuning, pending GDELT-MATCH-01 audit output (D-07).
- Whether the folded CI-health work is a dedicated plan or folded into the LLM-FIX test plan.
- Final ship/defer on VERCEL-PRO-01/02 based on the research evaluation (D-09) — record rationale either way.

### Folded Todos

- **`phase-27.4.2-ci-health.md`** (CI Health — flip main red→green) — folded into Phase 38. The LLM-FIX strand already fixes `events.test.ts` v1→v3 drift and extends chaos mocks (SC38-2), so greening main CI is a natural companion. **Staleness caveat:** this todo was captured 2026-04-22 (pre-v1.4/v1.5 close); several items are likely already resolved (the 32 filter-test failures, `npm audit` vulns, and any reference to the now-deleted `llmEventExtractor.v1.ts`). The planner MUST verify current CI/lint/audit/format state against live `main`, not assume the 2026-04-22 snapshot.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/ROADMAP.md` §"Phase 38" — goal, 28 REQ-IDs, SC38-1..SC38-7.
- `.planning/REQUIREMENTS.md` §"LLM-FIX / LLM-PURGE / GDELT-MATCH / WATER-LATIN / VERCEL-PRO / CRON-WATCH" (lines ~19–63) — per-REQ-ID detail with exact file:line targets.
- `.planning/PROJECT.md` §"Current Milestone: v1.6" — Phase 38 strand breakdown + parallelization hint.

### LLM pipeline architecture (purge + fixes)

- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — Phase 29/30.1/34 rationale; OpenRouter **dormant** (not deleted) decision that D-04 preserves; `git revert <Phase 29 range>` rollback path; Cerebras/Groq deferral.
- `docs/architecture/llm-pipeline-reliability.md` — cascade-shape table, tuned defaults; §134 declares NIM-only while header §6 is inconsistent (VERCEL-PRO-04 drift target).
- `CLAUDE.md` §"LLM Event Pipeline" / "Serverless Cache" — Redis-key registry; the stale "Cerebras + Groq adapter source files remain importable for rollback" note (already false per scout) + `skipOpenRouter` 622/929 citation (drift) + "Hobby cap 3 entries" (`:101`).

### Vercel Pro docs-drift targets (VERCEL-PRO-04)

- `docs/architecture/deployment.md` `:56` ("Hobby 60s ceiling"), `:133` ("cap at 3 cron entries").
- `docs/runbook.md` `:539-547` ("10-second limit").
- `docs/degradation.md` `:329` ("Vercel function 10s timeout").
- `vercel.json` — current config (rewrites, headers, crons, `functions.maxDuration: 800`) to port for the VERCEL-PRO-01 `vercel.ts` evaluation.

### Auto-memory inputs (not in repo; context for the researcher)

- Auto-memory `project-v1-6-cleanup-punchlist` — the 29-item code punch-list this phase implements (findings 1–18 + 2nd-pass 24–29), with confidence scores and verification notes.
- Auto-memory `project-v1-6-docs-drift` — companion docs-drift audit (Phase 41 absorbs most; VERCEL-PRO-04 + reliability-doc header overlap here).
- Auto-memory `project-v1-6-priorities` — operator-locked priority order (this is #1) + anti-priorities (no single bundled "Phase 29 finishing pass" PR).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `server/lib/sourceTiers.ts` + `server/lib/relevanceScorer.ts` — tier 1/2/3 multipliers already applied post-NLP; the extension point for GDELT-MATCH-04's per-event composite score (tier × corroboration × specificity). Both have existing test files.
- Bellingcat three-gate corroboration (temporal AND geographic AND keyword) from Phase 22 — the pattern GDELT-MATCH-03 extends to general OSINT sources.
- `DevApiStatus.tsx` `actorQuality` block + `/api/operator-status` Bearer-gated read pattern — the mirror template if any new surfacing is needed (mostly relevant to Phase 39, but referenced here for the PipelineFlipsBlock deletion).
- `server/routes/refresh-events-cron.ts` post-step probe sweep + auto-prune `finally` (`llmExtractionPipeline.ts:460-507`) — correctly wired per punch-list; no fix needed (do NOT re-touch).

### Established Patterns

- NIM-only cascade is the runtime reality; `freeClaudeRouter.ts` header still claims "NIM → OpenRouter" but v3 opts out every call — D-04 narrows the public claim, doesn't change runtime behavior.
- `cacheGetSafe` degrade-open (returns empty set, never throws) — the reason the current quota-path chaos test passes for the WRONG reason (LLM-FIX-05); the fix must exercise `redis.incr` under chaos.
- Phase-22-style corpus audit methodology — reuse for GDELT-MATCH-01.

### Integration Points

- `server/lib/llmExtractionPipeline.ts:38-42` — rewire to import `processEventGroupsV3` directly after the `llmEventExtractor.ts` stub deletion (LLM-PURGE-01).
- `server/lib/llmSchema.ts:212` `enrichedEventAny` — collapse to v3 passthrough (LLM-PURGE-04).
- `server/lib/llmResolver.ts` — last importer of `freeClaudeRouter.callLLM`; inline/replace at call site (LLM-PURGE-02).
- `server/__tests__/resilience/redis-death.test.ts:192-203` — chaos mock currently exposes only `{ping,get,set,del}`; extend to `incr/sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire` as `vi.fn(redisDeath)` and add `/api/operator-status` to route coverage (LLM-FIX-04/05).
- `server/adapters/overpass-water.ts` — romanization injection point, BEFORE the Latin-label admission gate (WATER-LATIN-03).
- `server/routes/health.ts:170` (generic `cache-fallback-active:`) vs `:284` (LLM-only `llm-optional-fallback-active:`) — the token split for LLM-FIX-01; update `health.test.ts:314,368` to assert exact tokens (currently `/fallback-active/` regex passes accidentally).

</code_context>

<specifics>
## Specific Ideas

- **Scout finding (important):** `server/adapters/` has ZERO Cerebras/Groq references — the adapter source files are **already gone.** LLM-PURGE-07 therefore reduces to docs/reference cleanup: delete the stale CLAUDE.md "adapters remain importable for rollback" note; the live env-var + test references are LLM-PURGE-06's job (`config.ts:31-32,217-218,241-245` + `llmTokenBudget.test.ts` + `llmCircuitBreaker.test.ts`; `llmProgress.test.ts` verified clean). The planner should VERIFY current state and not plan a no-op file deletion.
- **"Honest signals" is the unifying theme** for LLM-FIX — every fix (D-05 sentinel, D-06 null-not-0, LLM-FIX-01 token split) makes a probe/audit/eval signal mean what it says.
- `pipelineAudit.ts` writer + `PipelineFlipsBlock` UI both confirmed present in current code → D-03 Path A is a real deletion, not a no-op.
- `vercel.json` exists and `@vercel/config` is NOT installed → VERCEL-PRO-01 is a genuine fresh evaluation.

</specifics>

<deferred>
## Deferred Ideas

- **CRON-WATCH-01 7-day cron stability watch** → v1.7 backlog / opportunistic watch (D-02). SC38-7 stays unfired; phase close does not wait on it.
- **Full `33-AUDIT-REPORT.md` staging run** (`run-audit.ts` against staging Redis + `expectedActor1/2` ground-truth backfill) → v1.7 backlog (D-06). This phase only makes the scorer honest + documents the gap.
- **`vercel.ts` migration (VERCEL-PRO-01) + Build Output API (VERCEL-PRO-02)** → default-deferred unless the research evaluation shows a clear simplification win (D-09). Phase 999.2 stays open unless Build Output API ships.
- **`news:feed` cron warmer** (punch-list finding #15) — roadmap says "folds into Phase 38 if scope allows; otherwise carries." Not selected for discussion; planner may include if the VERCEL-PRO cron work touches `/api/cron/warm` anyway, else carry to v1.7.

### Reviewed Todos (not folded)

- **`phase-27.4.5-llm-pipeline-observability.md`** — NOT folded. Already tagged `resolves_phase: 39`; the LLM Flight Recorder / budget observability work is Phase 39's scope, not 38.
- **`phase-27.4.3-deckgl-v9-type-drift.md`** — NOT folded. Frontend deck.gl v9 `depthTest` TypeScript drift; no overlap with Phase 38's LLM/GDELT/water/Vercel strands. Stays in backlog for later triage.

</deferred>

---

_Phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cleanup_
_Context gathered: 2026-06-04_
</content>
</invoke>
