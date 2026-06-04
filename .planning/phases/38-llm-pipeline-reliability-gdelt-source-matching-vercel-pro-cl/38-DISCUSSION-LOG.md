# Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cleanup
**Areas discussed:** Scope shape + CRON-WATCH, Dead-code purge forks, Bug-fix approach, GDELT + Water + Vercel ambition

---

## Scope shape

| Option                                        | Description                                                                                                            | Selected |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| One phase, strand-aligned plans               | Keep Phase 38 intact; planner produces ~5–6 strand-aligned plans run in dependency waves. Honors roadmap-locked merge. | ✓        |
| Split WATER-LATIN + VERCEL-PRO into 38.1/38.2 | Carve the two least-coupled strands into sub-phases. More ceremony, separate branches.                                 |          |
| Split all 5 into sub-phases                   | Maximal decomposition (38.1–38.5). Contradicts roadmap-locked merge; 5x overhead.                                      |          |

**User's choice:** One phase, strand-aligned plans
**Notes:** Roadmap already locked the merged track; this was about plan decomposition only.

---

## CRON-WATCH

| Option                         | Description                                                                                                                | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Defer — don't gate phase close | 7-day calendar watch can't complete in a session; would block 39/40/41. Phase 31 has a Day-1 PASS already. SC38-7 unfired. | ✓        |
| Absorb — 7-day acceptance tail | Phase isn't done until 7 consecutive clean cron ticks; couples close to a calendar week.                                   |          |
| Absorb but non-blocking        | Stand up watch harness, don't gate close on 7/7.                                                                           |          |

**User's choice:** Defer — don't gate phase close
**Notes:** Ship the fixes now; full streak verified opportunistically / v1.7.

---

## pipelineAudit (LLM-PURGE-05)

| Option                                | Description                                                                                                   | Selected |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Path A — delete writer + UI + openapi | Delete appendPipelineAudit, narrow union to v3-only, remove PipelineFlipsBlock + render call + openapi entry. | ✓        |
| Path B — keep read-only audit shim    | Keep listPipelineAudit; drop writer's stale calls; let key drain. Lower blast radius but dead UI remains.     |          |

**User's choice:** Path A — delete writer + UI + openapi
**Notes:** Matches the dead-code-purge intent; no version flips exist in a v3-only pipeline.

---

## OpenRouter (LLM-PURGE-08)

| Option                                       | Description                                                                                                                             | Selected |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Path A — gate behind env, drop dead counter  | Gate behind env.OPENROUTER_API_KEY + remove incrOpenRouterDaily. Preserves ADR-0010 dormant semantics. Fixes skipOpenRouter line drift. | ✓        |
| Path B — delete OpenRouter from allProviders | Remove from cascade entirely; cleanest NIM-only but removes the re-enable door.                                                         |          |

**User's choice:** Path A — gate behind env, drop the dead counter
**Notes:** ADR-0010 declared OpenRouter "dormant" (not deleted); Path A honors that.

---

## Open-Meteo cache-write (LLM-FIX-02)

| Option                                 | Description                                                                                 | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Empty-result sentinel write            | Distinct sentinel on total-failure; audit reads fresh write, failure stays distinguishable. | ✓        |
| Unconditional write + staleness signal | Always cacheSet even empty; can mask persistent outage as fresh-but-empty.                  |          |
| You decide / planner picks             | Lock only the requirement; defer mechanism.                                                 |          |

**User's choice:** Empty-result sentinel write
**Notes:** Best fit for the "honest signals" theme; exact shape is planner's discretion.

---

## 33-AUDIT-REPORT (LLM-FIX-03)

| Option                                      | Description                                                                                                         | Selected |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Document the gap + make scorer honest       | actorMatchRate returns null/N-A (not silent 0); stub gets explicit "requires staging run" note. No operator action. | ✓        |
| Run run-audit.ts against staging + populate | Operator provides staging Redis; backfill expectedActor ground-truth; commit populated report.                      |          |
| Both — honest scorer now, run later         | Ship honest-scorer fix + capture follow-up todo.                                                                    |          |

**User's choice:** Document the gap + make the scorer honest
**Notes:** Full staging run deferred to v1.7 backlog.

---

## GDELT ambition

| Option                                | Description                                                                                                                          | Selected |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Audit-gated + non-destructive         | GDELT-MATCH-01 audit runs first; conservative high-confidence dedup; additive composite score re-orders without mutating raw corpus. | ✓        |
| Aggressive upfront                    | Hard mention-collapse + replace ordering without audit calibration. Bigger savings, harder rollback.                                 |          |
| You decide / planner picks from audit | Lock only that the audit gates 02–04.                                                                                                |          |

**User's choice:** Audit-gated + non-destructive
**Notes:** Reversible, low-risk; dedup thresholds set by the planner from audit output.

---

## Romanization library (WATER-LATIN-02)

| Option                                  | Description                                                                                     | Selected |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| transliteration (pure-JS, multi-script) | Zero native deps, serverless-safe; audit samples validate Arabic/Persian/Hebrew before lock-in. | ✓        |
| ICU transliteration                     | Most accurate but pulls native ICU/full-icu weight; serverless bundle complication.             |          |
| You decide after audit samples          | Lock requirement; researcher picks lib after WATER-LATIN-01.                                    |          |

**User's choice:** transliteration (pure-JS, multi-script)
**Notes:** ICU is fallback only if `transliteration` fails the audit-sample quality bar.

---

## Vercel Pro

| Option                                       | Description                                                                                                                                | Selected |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Evaluate, default-defer the risky migrations | Always ship Fluid Compute verify (03) + docs-drift repair (04) + CLI bump; defer vercel.ts + Build Output API unless clear simplification. | ✓        |
| Commit to shipping both migrations           | Migrate vercel.ts + Build Output API; closes 999.2 but touches prod deploy path.                                                           |          |
| You decide from the evaluation               | Lock only the safe work; research drives ship/defer.                                                                                       |          |

**User's choice:** Evaluate, default-defer the risky migrations
**Notes:** 999.2 stays open unless Build Output API actually ships; record rationale either way.

---

## Todo folding

| Option                        | Description                                                   | Selected |
| ----------------------------- | ------------------------------------------------------------- | -------- |
| 27.4.2 CI health              | LLM-FIX strand greens CI anyway; natural companion to SC38-2. | ✓        |
| 27.4.3 deck.gl v9 type drift  | Frontend TS drift; no overlap — would be scope creep.         |          |
| None — leave all 3 in backlog | Keep Phase 38 strictly to roadmap REQ-IDs.                    |          |

**User's choice:** 27.4.2 CI health (folded)
**Notes:** 27.4.5 routes to Phase 39 (already tagged resolves_phase:39); 27.4.3 stays deferred. 27.4.2 carries a staleness caveat — verify current CI state vs the 2026-04-22 snapshot.

---

## Claude's Discretion

- Plan ordering / wave structure within the strand-aligned decomposition.
- Exact Open-Meteo sentinel shape.
- GDELT dedup thresholds + corroboration tuning (pending GDELT-MATCH-01 audit).
- Whether folded CI-health work is a dedicated plan or folded into the LLM-FIX test plan.
- Final ship/defer on VERCEL-PRO-01/02 based on the research evaluation.

## Deferred Ideas

- CRON-WATCH-01 7-day cron stability watch → v1.7 / opportunistic.
- Full 33-AUDIT-REPORT staging run → v1.7 backlog.
- vercel.ts + Build Output API migrations → default-deferred unless eval wins; Phase 999.2 stays open.
- `news:feed` cron warmer (punch-list #15) → include only if VERCEL-PRO cron work touches `/api/cron/warm`, else carry to v1.7.
- Reviewed-not-folded: 27.4.5 llm-pipeline-observability → Phase 39; 27.4.3 deck.gl v9 type drift → backlog.
  </content>
