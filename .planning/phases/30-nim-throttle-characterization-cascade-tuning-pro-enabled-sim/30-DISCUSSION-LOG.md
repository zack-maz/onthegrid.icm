# Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
**Areas discussed:** Telemetry capture strategy, Tuning method, Documentation home, Soft-warn watchdog fate

---

## Gray Area Selection

| Option                                  | Description                                                                                            | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Telemetry capture strategy              | How the NIM throttle window, RPM ceiling, and recovery signal are observed                             | ✓        |
| Tuning method (how we pick new numbers) | Single observation + analytical, multi-run grid sweep, single-run + commit, or bisection from baseline | ✓        |
| Documentation home for findings         | CLAUDE.md vs new `docs/architecture/llm-pipeline-reliability.md`                                       | ✓        |
| Soft-warn watchdog fate (SIMPLIFY-03)   | Eliminate, relax to throttle-sized defaults, or decide after Run 1                                     | ✓        |

**User selected:** all four areas.

---

## Telemetry capture strategy

| Option                                           | Description                                                                                                                                                                                     | Selected |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Reuse callHistory + add post-run analyzer script | Use existing per-attempt rows + capture `retry-after` header into new field. `scripts/analyze-llm-run.ts` computes throttle window, RPM, recovery interval. Lowest LOC, single source of truth. | ✓        |
| New throttle Redis sidecar key                   | Dedicated `events:llm-throttle:v3` with richer fields. Doubles the write surface; SIMPLIFY-02 already argues against extra observability keys.                                                  |          |
| Scrape vercel logs manually                      | Zero code change, unauditable, Phase 31 watch can't re-derive analysis.                                                                                                                         |          |

**User's choice:** Reuse callHistory + add post-run analyzer script (Recommended).

### Follow-up: Capture `Retry-After` header?

| Option                                           | Description                                                                                         | Selected |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------- |
| Add `retryAfterMs` to callHistory schema         | Source-of-truth throttle window length from NIM's response header. ~5 LOC in `freeClaudeRouter.ts`. | ✓        |
| Infer from elapsed time between 429 and next 200 | No schema bump but inferred number may overshoot true window under concurrency racing.              |          |
| Capture both (header + inferred recovery gap)    | Belt-and-suspenders if NIM's header lies; not needed at Phase 30's resolution.                      |          |

**User's choice:** Add `retryAfterMs` to callHistory schema (Recommended).

---

## Tuning method

| Option                                     | Description                                                                                   | Selected |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| Characterize → propose → validate (2 runs) | Run 1 at current defaults, derive analytically, Run 2 validate. Bisection fallback for Run 3. | ✓        |
| Multi-run grid sweep (4-6 runs)            | Pareto sweep across concurrency × batch_size grid. Highest confidence, highest cost.          |          |
| Single observation run + commit            | Defer validation to Phase 31's 7-day watch. Fastest, trusts one sample.                       |          |
| Bisection from current 12/2 baseline       | Data-driven step direction; 2-4 runs.                                                         |          |

**User's choice:** Characterize → propose → validate (Recommended).

---

## Documentation home

| Option                                                         | Description                                                                                                                      | Selected |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| New `docs/architecture/llm-pipeline-reliability.md`            | Standalone doc under existing 10-file architecture set. Phase 31 appends, ADR-0010 references. Keeps CLAUDE.md at trimmed shape. | ✓        |
| 5-line summary in CLAUDE.md + full doc in `docs/architecture/` | Compact CLAUDE.md pointer + deep-dive elsewhere.                                                                                 |          |
| Inside CLAUDE.md — new "LLM Pipeline Reliability" subsection   | Treat as invariant alongside Color Tokens / Env Vars; bumps CLAUDE.md by ~30-50 lines.                                           |          |

**User's choice:** New `docs/architecture/llm-pipeline-reliability.md` (Recommended).

---

## Soft-warn watchdog fate (SIMPLIFY-03)

| Option                                                    | Description                                                                                                              | Selected |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| Eliminate soft-warn entirely                              | Delete `softWarnMs` + `onSoftWarn` + soft-warn `setTimeout` + `skipReason` enum value. Only hard-kill (resized) remains. | ✓        |
| Relax to throttle-sized defaults (~120s/180s)             | Keep both tiers, bump numbers against measured throttle window. Preserves two-tier signal.                               |          |
| Decide after Run 1 — if zero fires, eliminate; else relax | Data-driven; adds a conditional branch to the phase plan.                                                                |          |

**User's choice:** Eliminate soft-warn entirely (Recommended).

---

## Final readiness check

| Option                  | Description                                                                                                                                                      | Selected |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| I'm ready for context   | Write CONTEXT.md; smaller items become Claude's Discretion with sensible defaults (eval tolerance ±3pp, env-tunable defaults, SIMPLIFY-01 single-test coverage). | ✓        |
| Explore more gray areas | Surface eval regression tolerance, env-tunable vs hardcoded defaults, SIMPLIFY-01 test scope as explicit questions.                                              |          |

**User's choice:** I'm ready for context (Recommended).

---

## Claude's Discretion

- Exact path/name of analyzer script (`scripts/analyze-llm-run.ts` recommended, follow existing `scripts/` conventions).
- Exact `retryAfterMs` field shape (`number | null` in ms recommended).
- Whether SIMPLIFY-01 regression test extends existing file or creates new one.
- Whether `LLM_BATCH_SIZE` env var introduction lands in the same commit as the value change or a separate promotion commit.
- Exact CLAUDE.md one-liner pointer wording.

## Deferred Ideas

- Provider expansion / v4 router — explicitly out of v1.5.
- Per-batch adaptive sizing (`V3_ADAPTIVE_BATCH`) — defer until data argues.
- `events:llm:v3:partial` retirement — Phase 34 SIMPLIFY-02.
- `freeClaudeRouter.ts` orphan caller audit — Phase 34 SIMPLIFY-05.
- CLAUDE.md "LLM Pipeline Reliability" subsection — revisit if Phase 31 watch demands it.
- Lineage-hash pre-filter — separate flag, out of scope.
- Adversarial eval gating — observed only this phase.
- Bundle-size delta — Phase 34 SIMPLIFY-07 captures cumulative v1.5 delta.
