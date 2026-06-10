---
phase: 44-events-subtab-pipeline-detail
verified: 2026-06-10T09:30:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: 'On the live prod dashboard with a Bearer key, switch to the Events subtab and confirm all mounted blocks render with real Redis data.'
    expected: "Waterfall/Histograms/CallLog/EvalScore/Dlq/Suspect render under a live NIM-only run; BudgetBarsBlock is absent (self-hidden — D-06, the correct outcome); FlightRecorderBlock shows run history; DeadLinkBucketsBlock shows authoritative deadUrlCount, per-status buckets labeled 'of N scanned', and drill-down sample rows with evidence as text, relativeTime, and dead-streak count."
    why_human: 'jsdom mocks fetch; real Bearer + live Redis state only verifiable on the deployed dashboard. BudgetBarsBlock self-hide under NIM-only must be observed as correct behavior, not a defect (D-06).'
---

# Phase 44: Events Subtab Pipeline Detail Verification Report

**Phase Goal:** The operator can read full LLM-pipeline detail and per-bucket dead-link state directly in the API-Health events subtab, using data that already exists in Redis — a pure presentational mount, no server changes (amended by CONTEXT D-01: one narrow read-only aggregator extension locked in).
**Verified:** 2026-06-10T09:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                                                                                    | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The 7 already-built LLM blocks (Waterfall, Histograms, CallLog, BudgetBars, EvalScore, Dlq, Suspect) are mounted into EventsFiltersSectionV3, fed from existing LLMStatus fields, with DLQ depth / breaker state / eval baseline+drift / run-history all visible                         | ✓ VERIFIED | `EventsFiltersSectionV3` body (lines 3671–3702) contains all 7 blocks presence-gated + FlightRecorderBlock re-mounted. Tests R12 (populated path) and R13 (self-hide empty path) pass. Full suite: 2607 passed 0 failed.                                                                                                                                                                            |
| 2   | The operator can read dead-link state per bucket — counts per liveness status labeled "of N scanned", authoritative deadUrlCount, last24hPrunes, and drill-down rows with lastProbedAt + attemptCount dead-streak depth (D-02 honest signal, not true firstSeenDead per locked decision) | ✓ VERIFIED | `DeadLinkBucketsBlock` exists at line 3522. `countsByStatus` tally assembled in `buildDeadUrlSample` (lines 254/277/304). WR-01 fix decouples tally from LIMIT_DRILL_DOWN sample cap. "of N scanned" caveat rendered (line 3559). DeadLinkBucketsBlock prune test suite: 7 tests pass including "of N scanned", self-hide, evidence-as-TEXT with adversarial `<b>` injection test.                  |
| 3   | The mount is data-wiring only — WAI-ARIA tablist DOM unchanged, every block degrade-open (self-hides when data absent), evidence renders as TEXT not HTML, no synthetic zero-defaults for purged providers                                                                               | ✓ VERIFIED | `role="tabpanel" aria-labelledby="tab-events"` count = 1 (unchanged). `dangerouslySetInnerHTML` = 0 occurrences (1 match is a comment). 5 pinning suites (ConsolidatedLayout.snapshot, tabMerge, diagnosticBlocks, operatorActions + pre-existing prune assertions) green with zero edits. No `cerebras: 0` zero-defaults added (BudgetBarsBlock self-hides under NIM-only — D-06 correct outcome). |

**Score:** 3/3 truths verified

### Deferred Items

None — all roadmap success criteria addressed in this phase.

### Required Artifacts

| Artifact                                               | Expected                                                                                                                       | Status     | Details                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/routes/operator-status.ts`                     | countsByStatus tally + lastProbedAt/attemptCount on DeadUrlSampleEntry, assembled into the prune block                         | ✓ VERIFIED | `buildDeadUrlSample` returns `{ sample, countsByStatus }` (line 242–304). `DeadUrlSampleEntry` carries `lastProbedAt: string` (line 213) and `attemptCount: number` (line 214). Prune block spreads `countsByStatus` (line 489). WR-01 fix: tally decoupled from LIMIT_DRILL_DOWN cap.                                                                                         |
| `server/routes/__tests__/operator-status.test.ts`      | Contract pins for countsByStatus + lastProbedAt/attemptCount/evidence + soft-404/no-url buckets                                | ✓ VERIFIED | 23 tests pass including "prune.countsByStatus: tally continues past the LIMIT_DRILL_DOWN sample cap (WR-01)" and mixed-fixture tally assertions. Fixture carries `no-url` + `soft-404` entries.                                                                                                                                                                                |
| `server/openapi.yaml`                                  | prune schema gains countsByStatus + evidence + lastProbedAt + attemptCount; status enum gains soft-404                         | ✓ VERIFIED | Lines 650–694: `countsByStatus` object with `additionalProperties: integer`; `evidence nullable: true`; `lastProbedAt: string`; `attemptCount: integer`; `status` enum `[dead-host, '403', '404', soft-404]`. Redocly lint: valid, 37 pre-existing warnings, exit 0.                                                                                                           |
| `src/components/ui/DevApiStatus.tsx`                   | EventsFiltersSectionV3 gains presence-gated mounts of 7 v2 blocks + FlightRecorder + DeadLinkBucketsBlock; optional prune prop | ✓ VERIFIED | `DeadLinkBucketsBlock` at line 3522. `EventsFiltersSectionV3` signature gains `prune?: PruneSummary \| null` (line 3628). All 7 blocks presence-gated (lines 3671–3688). FlightRecorderBlock at line 3696. `{prune && <DeadLinkBucketsBlock prune={prune} />}` at line 3702. `eventsPrune` state + scoped fetch (lines 684–720) threads prune to the render switch (line 975). |
| `src/__tests__/DevApiStatusV3.test.tsx`                | Evolved V3 empty-state pins reflecting presence-gated mounts                                                                   | ✓ VERIFIED | New tests: "the 7 v2 blocks SELF-HIDE under an empty v3 llmStatus" and "the v2 blocks + FlightRecorder render under a populated v3 llmStatus". All 17 tests pass.                                                                                                                                                                                                              |
| `src/__tests__/devApiStatusEventsSection.test.tsx`     | R12 (mounts under data) + R13 (self-hide degrade-open)                                                                         | ✓ VERIFIED | R12 and R13 present and passing. 26 tests pass in combined events-section run.                                                                                                                                                                                                                                                                                                 |
| `src/__tests__/components/DevApiStatus.prune.test.tsx` | DeadLinkBucketsBlock assertions — bucket counts, sample rows, self-hide, evidence-as-TEXT                                      | ✓ VERIFIED | New `DeadLinkBucketsBlock describe` block (7 tests): authoritative total, "of N scanned", sample rows, evidence-as-TEXT with adversarial `<b>` literal rendering, self-hide on absent prune, WR-05 own-data gating. All 17 tests (10 pre-existing + 7 new) pass.                                                                                                               |

### Key Link Verification

| From                                         | To                                               | Via                                                                                                                                               | Status  | Details                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DevApiStatus events render switch (line 975) | EventsFiltersSectionV3                           | `prune={eventsPrune}` — events-tab-scoped `/api/operator-status` fetch (scoped deviation from plan's top-level assumption, auto-fixed per Rule 3) | ✓ WIRED | `eventsPrune` state at line 684; `prune={eventsPrune}` at line 975. Mutually-exclusive activeTab branches guarantee no concurrent double-fetch (D-10 intent honored). |
| EventsFiltersSectionV3                       | DeadLinkBucketsBlock                             | `{prune && <DeadLinkBucketsBlock prune={prune} />}`                                                                                               | ✓ WIRED | Line 3702. Self-hides when `prune` is null/absent.                                                                                                                    |
| EventsFiltersSectionV3                       | 7 v2 blocks (CallLogBlock et al.)                | Presence-gated mounts `llmStatus.<field> && <Block .../>`                                                                                         | ✓ WIRED | Lines 3671–3688. All 7 blocks wired with correct guards. No synthetic `cerebras:0/groq:0` zero-defaults.                                                              |
| buildDeadUrlSample                           | prune block assembly (line 489)                  | `return { sample, countsByStatus }` spread into prune                                                                                             | ✓ WIRED | Destructure at line 488: `const { sample: deadUrlSample, countsByStatus } = await buildDeadUrlSample();`. Prune block at line 489.                                    |
| server/openapi.yaml                          | `/api/operator-status` 200 response prune schema | Contract lockstep — Redocly drift gate                                                                                                            | ✓ WIRED | `soft-404` in enum (line 679), `countsByStatus` (line 650), `evidence` (line 680), `lastProbedAt` (line 686), `attemptCount` (line 689). Redocly exits 0.             |

### Data-Flow Trace (Level 4)

| Artifact                              | Data Variable                                                                                | Source                                                                                                                        | Produces Real Data                                                | Status    |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| `DeadLinkBucketsBlock`                | `prune.countsByStatus`, `prune.deadUrlSample`                                                | `eventsPrune` state ← scoped fetch `/api/operator-status` ← `buildDeadUrlSample` SCAN over `events:url-liveness:*` Redis keys | Yes — SCAN reads live Redis keys; degrade-open to null on failure | ✓ FLOWING |
| 7 v2 blocks in EventsFiltersSectionV3 | `llmStatus.*` (callHistory, tokenCounters, breakerState, evalScore, dlqRecent, suspectCount) | Existing `useLLMStatusPolling` hook feeding `llmStatus`                                                                       | Yes — existing wired polling; blocks just newly mounted           | ✓ FLOWING |
| `FlightRecorderBlock`                 | Self-contained own fetch                                                                     | `/api/events/llm-history`                                                                                                     | Yes — self-contained with degrade-open                            | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                                                        | Command                                                                                                 | Result                                                | Status |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Operator-status test suite passes with countsByStatus + sample field assertions | `npx vitest run server/routes/__tests__/operator-status.test.ts`                                        | 23 passed                                             | ✓ PASS |
| DeadLinkBucketsBlock prune test passes incl. evidence-as-TEXT adversarial check | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx`                                   | 17 passed (10 pre-existing + 7 new)                   | ✓ PASS |
| Events-section tests pass incl. R12 (data-fed mounts) + R13 (self-hide)         | `npx vitest run src/__tests__/DevApiStatusV3.test.tsx src/__tests__/devApiStatusEventsSection.test.tsx` | 26 passed                                             | ✓ PASS |
| 5 pinning suites green untouched                                                | `npx vitest run src/components/ui/__tests__/`                                                           | 84 passed (10 test files)                             | ✓ PASS |
| Full frontend + server test suite                                               | `npx vitest run`                                                                                        | 2607 passed, 0 failed (208 files, 19 skipped, 5 todo) | ✓ PASS |
| TypeScript no errors                                                            | `npm run typecheck`                                                                                     | 0 errors, 97.71% type-coverage                        | ✓ PASS |
| Redocly OpenAPI lint clean                                                      | `npm run openapi:lint`                                                                                  | valid, 37 pre-existing warnings, exit 0               | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared for this phase (presentational UI mount phase; no `scripts/*/tests/probe-*.sh` paths exist).

### Requirements Coverage

| Requirement   | Source Plan                  | Description                                                                                                                     | Status      | Evidence                                                                                                                                                                                                     |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EVENTS-TAB-01 | 44-02-PLAN.md                | Operator can see full LLM pipeline detail in the events subtab — the 7 already-built blocks mounted into EventsFiltersSectionV3 | ✓ SATISFIED | All 7 blocks + FlightRecorderBlock mounted presence-gated; R12/R13 test assertions pin the behavior; REQUIREMENTS.md marks Complete.                                                                         |
| EVENTS-TAB-02 | 44-01-PLAN.md, 44-02-PLAN.md | Operator can read dead-link state per bucket in the events subtab — counts per liveness status plus transition timestamps       | ✓ SATISFIED | `countsByStatus` tally on aggregator (Plan 01); `DeadLinkBucketsBlock` rendering it with "of N scanned" caveat (Plan 02); `lastProbedAt` + `attemptCount` on sample entries. REQUIREMENTS.md marks Complete. |

No orphaned requirements — REQUIREMENTS.md traceability table shows both EVENTS-TAB-01 and EVENTS-TAB-02 mapped to Phase 44 with status Complete.

### Anti-Patterns Found

| File                           | Line      | Pattern                                                                                        | Severity | Impact                                                                            |
| ------------------------------ | --------- | ---------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| No TBD/FIXME/XXX markers found | —         | —                                                                                              | —        | Clean                                                                             |
| `dangerouslySetInnerHTML`      | Line 3403 | Pre-existing comment `T-27.4-09-02/03: React escapes all strings — no dangerouslySetInnerHTML` | Info     | Not an anti-pattern — this is a security constraint comment. 0 actual JSX usages. |

No debt markers, no stubs, no hardcoded empty data arrays that reach rendering (WR-05 fix correctly gates `buckets.length > 0` and `sample.length > 0` on their own data, not the sidecar).

**D-06 note (per phase instructions):** BudgetBarsBlock self-hides under NIM-only (absent `tokenCounters`/`breakerState`). This is the CORRECT, honest outcome per locked decision D-06. Not a defect.

### Human Verification Required

#### 1. Live Prod Events Subtab With Real Redis Data

**Test:** Open the production dashboard at `otg-iran-monitor.vercel.app` with a valid `DASHBOARD_PASSWORD` Bearer key, navigate to the Events tab.
**Expected:**

- All 7 v2-era LLM blocks render with real Redis data for whatever is present: Waterfall (if stage !== idle), Histograms + CallLog (if callHistory populated), EvalScore, Dlq, Suspect.
- BudgetBarsBlock is ABSENT (self-hides under NIM-only — this is the correct outcome, not a defect per D-06).
- FlightRecorderBlock shows run history from `/api/events/llm-history`.
- DeadLinkBucketsBlock renders the authoritative `deadUrlCount` total, per-status bucket rows labeled "of N scanned", and sample drill-down rows with status badges, urls, evidence (rendered as plain text — not HTML), `relativeTime(lastProbedAt)`, and `dead ×N` dead-streak depth.
- The block self-hides gracefully if Bearer is absent or the fetch fails (degrade-open).
- WAI-ARIA tablist structure is visually and functionally correct (tab focus, keyboard navigation unchanged).
  **Why human:** jsdom mocks `fetch`; real Bearer authentication + live Redis state (NIM-only run data, url-liveness records) is only verifiable on the deployed dashboard. BudgetBarsBlock self-hide behavior under NIM-only must be observed and recorded as the expected outcome.

### Gaps Summary

No automated gaps. The phase goal is achieved in the codebase:

- Plan 01 (server extension): All fields (`countsByStatus`, `lastProbedAt`, `attemptCount`) are present in `operator-status.ts`, the route test, OpenAPI spec, and client interface. WR-01 fix correctly decouples the tally from the drill-down sample cap so `countsByStatus` covers all scanned keys up to `MAX_SCAN_KEYS=200`. Zero extra Redis reads; `MAX_SCAN_KEYS=200` budget guard unchanged.
- Plan 02 (UI mount): All 7 v2 blocks + FlightRecorderBlock + DeadLinkBucketsBlock are wired into `EventsFiltersSectionV3`. Degrade-open contract holds. `evidence` renders as a React TEXT node (adversarial `<b>` injection test passes). WAI-ARIA tablist DOM has exactly 1 `role="tabpanel" aria-labelledby="tab-events"` occurrence.
- Post-review fixes (WR-01 through WR-06) are all present in HEAD (commits 2b03918, ece6455, ed7e374, b311800, 75f83ea, 0aff43a, b72b625 all verified).
- 5 frozen pinning suites: 0 edits, green.

One item requires human verification: visual confirmation of live Redis data rendering on the deployed dashboard with a Bearer key.

---

_Verified: 2026-06-10T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
