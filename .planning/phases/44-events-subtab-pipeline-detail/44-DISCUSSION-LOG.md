# Phase 44: Events Subtab Pipeline Detail - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 44-Events Subtab Pipeline Detail
**Mode:** --auto --chain (Claude auto-selected the recommended option for every question; no interactive prompts)
**Areas discussed:** EVENTS-TAB-02 data sourcing, stale-provider fields under NIM-only, run-history visibility, dead-link block composition + prop threading

---

## EVENTS-TAB-02 Data Sourcing (per-bucket counts + timestamps vs "no server changes")

| Option                                 | Description                                                                                                                                                                                                                                    | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Minimal read-only aggregator extension | Tally `countsByStatus` inside the existing `buildDeadUrlSample` SCAN (values already loaded); add `lastProbedAt` + `attemptCount` to `DeadUrlSampleEntry`. No new Redis keys/writers/pipeline changes — honors "data already exists in Redis." | ✓        |
| Client-side derivation only            | Derive bucket badges from the terminal-dead-only `deadUrlSample` (cap 20). Honors "no server changes" literally but cannot show live/unknown/no-url counts or any timestamps — fails EVENTS-TAB-02's letter.                                   |          |
| New Redis sweep-summary key            | Persist per-status counts at sweep time. Full data but adds a writer + registry/lockstep churn — a genuine server behavior change, clearly outside the phase goal.                                                                             |          |

**Auto-selected rationale:** SC-2 is unsatisfiable without exposing data the API doesn't return; the chosen option is the narrowest read-path change consistent with the goal's spirit. "First-seen-dead" doesn't exist in Redis — rendered honestly as lastProbedAt + attemptCount dead-streak depth instead of inventing a schema field.

---

## Stale-Provider Fields Under NIM-Only (the 7 v2-era blocks)

| Option                                      | Description                                                                                                                                                                                          | Selected |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Presence-gate every block, no zero-defaults | Each block mounts only when its `LLMStatus` field is present/non-empty; `BudgetBarsBlock` self-hides if `tokenCounters` (cerebras/groq keys) is unpopulated under v3. Honest, degrade-open per SC-3. | ✓        |
| Copy legacy zero-defaults                   | Mirror `EventsFiltersSection`'s `tc = {cerebras: 0, groq: 0}` fallbacks. Renders dishonest zeros for purged providers.                                                                               |          |
| Widen server fields to NIM keys             | Rename/extend `tokenCounters`/`breakerState` server-side. Server observability change outside a UI-mount phase.                                                                                      |          |

---

## Run-History Visibility (SC-1 "run-history all visible")

| Option                                                       | Description                                                                                                                                       | Selected |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Re-mount existing FlightRecorderBlock in the events tabpanel | Self-contained (own fetch + drill-down); conditional tabpanel rendering means only one instance mounts at a time — no double fetch. One JSX line. | ✓        |
| Build a slim run-summary line from `llmStatus.lastRun`       | Less detail than SC-1's "run-history all visible" implies; duplicates what FlightRecorderBlock already does well.                                 |          |
| Link/CTA pointing at the API-Health tab                      | Doesn't satisfy "visible in the events subtab."                                                                                                   |          |

---

## Dead-Link Block Composition + Prop Threading

| Option                                                               | Description                                                                                                                   | Selected |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Thread `opStatus.prune` down as a prop; one new DeadLinkBucketsBlock | Reuses the existing top-level operator-status fetch; block self-hides when prune absent; evidence rendered as TEXT (T-43-16). | ✓        |
| New hook/fetch inside the events section                             | Second `/api/operator-status` poll for the same data — wasteful, drifts from the single-fetch pattern.                        |          |
| Extend an existing block (e.g., DrillDownBlock)                      | Mixes LLM lineage drill-down with URL liveness concerns; harder for Phase 45 to restyle cleanly.                              |          |

---

## Claude's Discretion

- Exact ordering of newly mounted blocks within `EventsFiltersSectionV3` (Phase 45 will reorder anyway)
- `DeadLinkBucketsBlock` component name and internal layout
- Whether `countsByStatus` zero-fills absent statuses or omits them
- Wording of the "of N scanned" sampled-tally caveat

## Deferred Ideas

- Readability restyle + sparklines/history rings → Phase 45 (DASH-READ-01..05)
- True `firstSeenDead` field on `UrlLiveness` → only if attemptCount proxy proves insufficient (re-opens Phase 43 lockstep)
- NIM-era provider-key cleanup of `tokenCounters`/`breakerState` → future LLM-surface phase
- Reviewed-not-folded todos (third consecutive deferral): `phase-27.4.2-ci-health.md`, `phase-27.4.3-deckgl-v9-type-drift.md` → Phase 46 review candidates
