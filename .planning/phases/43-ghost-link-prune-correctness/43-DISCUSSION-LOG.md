# Phase 43: Ghost Link Prune Correctness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 43-ghost-link-prune-correctness
**Areas discussed:** Soft-404 detection mechanics, Source-less event coverage, Flaky-host attempt-reset semantics, 403 auto-prune decision, Evidence string persistence
**Mode:** `--auto --chain` — operator requested Claude's recommendation for all gray areas; all five areas auto-selected, recommended option chosen for each question.

---

## Soft-404 detection mechanics (GHOST-06)

| Option                 | Description                                                                              | Selected |
| ---------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Capped GET on HEAD-200 | Keep HEAD-first; only when 200, fetch ≤16 KiB body for the heuristic                     | ✓        |
| GET-always             | Single GET per probe with capped read; simpler but downloads body even for hard 4xx      |          |
| No body read           | Headers-only heuristics (Content-Length, redirect target); misses marker-based soft-404s |          |

| Option                     | Description                                                                                               | Selected |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| New `soft-404` enum status | Distinct bucket; ripples through schema/isTerminalDead/TTL/dashboard but gives Phase 44 per-bucket counts | ✓        |
| Fold into `404`            | No schema change; evidence string disambiguates, but bucket counts lie about probe mechanism              |          |

**Auto-selected:** Capped GET on HEAD-200; all three signals (markers, redirect-to-home, near-empty) with precision-first tie-break (doubt → live); distinct `soft-404` status, terminal-dead, 24h TTL, cron-prunable under the ≥3 gate.
**Notes:** [auto] Asymmetric error budget from the phase goal ("without getting more aggressive") drove every threshold toward conservatism.

## Source-less event coverage (GHOST-07)

| Option                          | Description                                                                                        | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Per-event `no-url` status       | Liveness entry written per source-less event; `lastUrlProbed` becomes nullable; visible per-bucket | ✓        |
| Side counter only               | `sourcelessCount` in sweep stats; no per-event key; cheaper but events stay individually invisible |          |
| Make source-less prune-eligible | Treat no-URL as ghost evidence; rejected — makes prune MORE aggressive, violating the phase goal   |          |

**Auto-selected:** Per-event `no-url` status, NOT terminal-dead, excluded from prune + sidecar count, 24h TTL, `classifiedNoUrl` sweep counter.

## Flaky-host attempt-reset semantics (GHOST-08)

| Option                    | Description                                                                                  | Selected |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| `unknown` preserves count | Only `live` resets to 0; unknown neither increments nor resets — repeat offenders accumulate | ✓        |
| Decay on unknown          | Decrement instead of reset; more complex, no clear benefit                                   |          |
| Keep current reset        | Status quo; flaky hosts evade the ≥3 gate forever — the bug GHOST-08 names                   |          |

**Auto-selected:** `unknown` preserves; `live` resets; `unknown` prune-exclusion pinned with explicit test; ≥3 cron gate retained verbatim; prunedIds sample audit (~20 re-probes, browser UA) recorded in verification.

## 403 auto-prune decision (GHOST-09)

| Option                                   | Description                                                                                                         | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Evidence-gated demotion (pre-registered) | Sample prod 403s with browser UA; any live article confirms CDN false-positive → cron excludes 403, manual keeps it | ✓        |
| Demote immediately                       | Skip evidence; violates the requirement's "made with evidence" wording                                              |          |
| Keep 403 cron-prunable                   | Only if the sample shows 403s genuinely dead; record evidence either way                                            |          |

**Auto-selected:** Phase 42 D-03 pivot pattern — pre-register demotion as likely outcome, gate on the prunedIds/403-key sample. If demoted, 403 stays terminal-dead (count/dashboard/manual prune unchanged); only the cron filter excludes it.

## Evidence string persistence (GHOST-10)

| Option                               | Description                                                                                 | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| Compact nullable string (≤200 chars) | `evidence: z.string().max(200).nullable()`; Phase 44 renders verbatim                       | ✓        |
| Structured object                    | `{signal, detail}` shape; more parseable but over-engineered for a render-verbatim consumer |          |

**Auto-selected:** Required-but-nullable string, always set by the writer, old entries tolerated (≤7d TTL turnover); lockstep updates to both schema tests, redis-keys.md, CLAUDE.md registry line; server-side `DeadUrlSampleEntry.evidence` exposure only (UI is Phase 44).

## Claude's Discretion

- Exact marker list contents (small, curated, precision-first)
- Body-heuristic helper placement (pure function preferred)
- Sweep counter / log-line wording
- Evidence-sampling as checked-in script vs documented one-off

## Deferred Ideas

- Events-subtab rendering of buckets + evidence — Phase 44
- Headless-browser probing — excluded by GHOST-06
- Env-tunable probe knobs — only on incident demand
- Prune race mutex (T-32-07) — watch-only

## Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md`, `phase-27.4.3-deckgl-v9-type-drift.md` — keyword-noise matches (score 0.6), no scope overlap; deferred to Phase 46 review (same call as Phase 42).
