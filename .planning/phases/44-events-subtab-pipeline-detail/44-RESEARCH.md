# Phase 44: Events Subtab Pipeline Detail - Research

**Researched:** 2026-06-09
**Domain:** React presentational data-wiring inside an existing 3538-line dashboard component (`DevApiStatus.tsx`); one minimal read-only Express aggregator extension + its three lockstep contract surfaces (route test, OpenAPI, client interface)
**Confidence:** HIGH

## Summary

Phase 44 is overwhelmingly a **mount-and-thread** phase, not a build phase. All seven LLM-pipeline blocks (Waterfall, Histograms, CallLog, BudgetBars, EvalScore, Dlq, Suspect) already exist as standalone function components in `DevApiStatus.tsx` and are wired today only in the legacy `EventsFiltersSection` (the v2-explicit-override branch). The work is to mount them — presence-gated — into `EventsFiltersSectionV3` (the default/production path), re-mount the self-contained `FlightRecorderBlock`, add one new `DeadLinkBucketsBlock`, and thread the already-fetched `opStatus.prune` object down as a new prop. [VERIFIED: codebase grep — `src/components/ui/DevApiStatus.tsx` lines 3331–3389 (legacy composer with all 7 blocks wired), 3414–3446 (V3 composer), 916–920 (render switch)]

The single server change is locked by CONTEXT D-01: a minimal read-only extension of `buildDeadUrlSample`/the prune block in `server/routes/operator-status.ts` to (a) tally `countsByStatus` across all statuses inside the **existing** SCAN loop, and (b) add `lastProbedAt` + `attemptCount` to `DeadUrlSampleEntry`. Both reuse values already loaded per key — zero extra Redis reads, no new keys, no writers, no pipeline behavior change. This lands in lockstep with `operator-status.test.ts`, the client `OperatorStatus.prune` interface, and `server/openapi.yaml`. [VERIFIED: codebase — `server/routes/operator-status.ts` lines 230–279 (`buildDeadUrlSample` loop already loads every key's `value` and reads `lastProbedAt`/`attemptCount`-bearing object), 444–453 (prune block assembly)]

The dominant risk is **test lockstep**, not implementation difficulty. `src/__tests__/DevApiStatusV3.test.tsx` line 157 pins _exactly_ six v3 empty-state lines and explicitly asserts (lines 169–171) that `EventsFiltersSectionV3` does NOT render `CallLogBlock`'s "No LLM calls yet." copy — mounting the 7 v2 blocks directly contradicts that pinned assertion, so it must be extended in the same commit. The OpenAPI `deadUrlSample` schema is also **already drifted from Phase 43** (missing `evidence` and the `soft-404` enum member that the code emits) — Phase 44 should close that drift while it is editing the same schema block. [VERIFIED: codebase — `src/__tests__/DevApiStatusV3.test.tsx` lines 157–175; `server/openapi.yaml` lines 649–661 vs `server/routes/operator-status.ts` lines 198, 203, 266]

**Primary recommendation:** Two-task shape. Task 1 (server): extend the prune block + 3 lockstep surfaces (route test, client interface, OpenAPI — also closing the Phase-43 `evidence`/`soft-404` OpenAPI drift). Task 2 (client): mount the 7 blocks + `FlightRecorderBlock` + new `DeadLinkBucketsBlock` into `EventsFiltersSectionV3`, presence-gated, thread `prune` prop, extend the two events-section test files in lockstep. Keep the 5 pinning suites untouched-green. No new packages, no new Redis keys, no styling work.

## Architectural Responsibility Map

| Capability                                                      | Primary Tier                                 | Secondary Tier                                       | Rationale                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Render 7 LLM blocks in events subtab                            | Browser / Client (`DevApiStatus.tsx`)        | —                                                    | Pure presentation; data already on the client via `useLLMStatusPolling()`                                |
| Run-history block (Flight Recorder)                             | Browser / Client (`FlightRecorderBlock.tsx`) | API (`/api/events/llm-history`)                      | Self-contained block owns its own Bearer fetch + 30s poll                                                |
| Dead-link per-bucket counts                                     | Browser / Client (`DeadLinkBucketsBlock`)    | API (`/api/operator-status`)                         | Counts computed server-side in the existing SCAN; client only renders                                    |
| `countsByStatus` tally + `lastProbedAt`/`attemptCount` exposure | API / Backend (`operator-status.ts`)         | Database (Upstash SCAN over `events:url-liveness:*`) | The values are already loaded per key in the aggregator's SCAN loop; tier owns the read-only aggregation |
| Contract drift gates (OpenAPI / Redocly)                        | Build / CI                                   | —                                                    | `npm run openapi:lint` (Redocly) must stay green after schema additions                                  |

**Why this matters:** EVENTS-TAB-02's per-bucket counts are deliberately a backend aggregation (inside the existing SCAN), NOT a client-side recomputation — the client never SCANs Redis and must not try to. EVENTS-TAB-01 is entirely client-tier (the data is already polled). Mis-assigning the count tally to the client (e.g. trying to derive buckets from the 20-entry `deadUrlSample`) would produce wrong, sample-truncated numbers and is the one tier mistake to guard against.

## Standard Stack

No new libraries. This phase uses the project's existing stack exclusively.

### Core

| Library      | Version | Purpose                    | Why Standard                                         |
| ------------ | ------- | -------------------------- | ---------------------------------------------------- | ------------------------ |
| react        | ^19.1.0 | Component rendering        | Project standard; all blocks are function components | [VERIFIED: package.json] |
| typescript   | ~5.9.3  | Strict-mode typing         | Pinned per CLAUDE.md to avoid TS 6.0 breakage        | [VERIFIED: package.json] |
| vitest       | ^4.1.0  | Test runner (jsdom + node) | Project standard test framework                      | [VERIFIED: package.json] |
| vite         | ^6.3.5  | Build / dev                | Project standard                                     | [VERIFIED: package.json] |
| @redocly/cli | ^2.31.5 | OpenAPI lint drift gate    | `npm run openapi:lint` is the D-04 contract gate     | [VERIFIED: package.json] |

**Installation:** None required — no new dependencies.

**Version verification:** All versions read directly from `package.json` this session. [VERIFIED: codebase — `node -p` over package.json] No registry lookups needed because no packages are added.

## Architecture Patterns

### System Architecture Diagram

```
                       DevApiStatus.tsx (single component, 3538 lines)
                                    │
         ┌──────────────────────────┴───────────────────────────┐
         │  top-level state (already fetched, Bearer-gated)      │
         │   • llmStatus  ← useLLMStatusPolling()  /api/events/llm-status
         │   • opStatus   ← fetchOpStatus()        /api/operator-status
         │                  (held in `opStatus.prune`, read by hero tile)
         └──────────────────────────┬───────────────────────────┘
                                    │  activeTab render switch (~907–922)
        ┌─────────────────────┬──────┴───────────┬───────────────────────┐
        │ activeTab='api'     │ activeTab='events' && showEventsTab       │
        │ DevApiStatusAllApis │ <div role=tabpanel aria-labelledby=       │
        │ Tab                 │      "tab-events">   ← DOM UNCHANGED (D-12)│
        │  • FlightRecorder   │   schemaVersion==='v2' ? Legacy : V3       │
        │    Block (existing) │                              │             │
        └─────────────────────┘                              ▼             │
                              EventsFiltersSectionV3({ llmStatus, prune })  │
                              │  (prune is the NEW prop — D-10)             │
                              ├── existing v3-native blocks (UNCHANGED, D-7)│
                              │     Routing/Latency/RateLimit/Schema/Error/ │
                              │     Cost/3×A9 cells/DrillDownBlock          │
                              ├── 7 v2 blocks (NEW MOUNTS, presence-gated)  │
                              │     Waterfall│Histograms│CallLog│Budget│    │
                              │     Eval│Dlq│Suspect       (D-05)           │
                              ├── FlightRecorderBlock (RE-MOUNT, D-08)      │
                              │     self-contained → /api/events/llm-history│
                              └── DeadLinkBucketsBlock (NEW, D-09)          │
                                    renders prune.countsByStatus +          │
                                    deadUrlCount + deadUrlSample rows       │
```

The events tabpanel and the API-Health tab are **mutually exclusive** render branches keyed on `activeTab` — only one is mounted at any time. This is why `FlightRecorderBlock` can be mounted in both without a double fetch (D-08). [VERIFIED: codebase — render switch at lines 842–922; `activeTab === 'events'` vs the API-Health body are sibling conditionals]

### Recommended Project Structure

No new files required for the mounts. The single new server-facing concern is internal to existing files. Optional: extract `DeadLinkBucketsBlock` as a sibling function component inside `DevApiStatus.tsx` (matches the existing block-component idiom — every block today is a local function in this file, e.g. `WaterfallBlock`, `DlqBlock`). [VERIFIED: codebase — all 7 blocks are local `function XBlock(...)` declarations in `DevApiStatus.tsx`]

### Pattern 1: Presence-gated block mount (D-05 degrade-open)

**What:** Each newly mounted block renders only when its `LLMStatus` field is present/non-empty; self-hides otherwise. Do NOT copy the legacy composer's zero-defaults.
**When to use:** Every one of the 7 v2 blocks, plus `DeadLinkBucketsBlock`.
**The legacy composer's anti-pattern (do NOT replicate):**

```typescript
// Source: src/components/ui/DevApiStatus.tsx:3335-3341 (EventsFiltersSection — legacy)
const ch = llmStatus.callHistory ?? [];
const tc = llmStatus.tokenCounters ?? { cerebras: 0, groq: 0 }; // ← synthetic zeros: DISHONEST under NIM-only
const bk = llmStatus.breakerState ?? { cerebras: 'ok', groq: 'ok' }; // ← fabricated 'ok' for purged providers
```

**Correct V3 idiom (presence-gate at the composer, render the block only when populated):**

```typescript
// In EventsFiltersSectionV3, after the existing v3-native blocks:
{llmStatus.callHistory && llmStatus.callHistory.length > 0 && (
  <HistogramsBlock provenanceCounts={llmStatus.provenanceCounts ?? {}} callHistory={llmStatus.callHistory} />
)}
{llmStatus.callHistory && (
  <CallLogBlock callHistory={llmStatus.callHistory} />
)}
{llmStatus.tokenCounters && llmStatus.breakerState && (
  <BudgetBarsBlock tokenCounters={llmStatus.tokenCounters} breakerState={llmStatus.breakerState} />
)}
{llmStatus.evalScore && (
  <EvalScoreBlock evalScore={llmStatus.evalScore} />
)}
{llmStatus.dlqRecent && (
  <DlqBlock entries={llmStatus.dlqRecent} />
)}
{typeof llmStatus.suspectCount === 'number' && (
  <SuspectBlock count={llmStatus.suspectCount} />
)}
{/* WaterfallBlock takes the whole llmStatus and internally `?? 0`-guards every
    field — it is render-safe with an idle status, so it may mount unconditionally
    OR be gated on stage !== 'idle' for honesty. Planner's call. */}
<WaterfallBlock llmStatus={llmStatus} />
```

**Why each guard:** `HistogramsBlock`, `CallLogBlock`, `BudgetBarsBlock`, `DlqBlock` declare **`NonNullable<...>` props** (not optional) — the guard lives in the composer because the block bodies assume presence. `BudgetBarsBlock` requires both `tokenCounters` AND `breakerState`. [VERIFIED: codebase — `HistogramsBlock` prop `callHistory: NonNullable<LLMStatus['callHistory']>` line 2587; `CallLogBlock` line 2778; `DlqBlock` `entries: NonNullable<LLMStatus['dlqRecent']>` line 2933; `BudgetBarsBlock` requires both fields lines 2833–2839]

### Pattern 2: Thread existing fetch as prop (D-10 — no new hook/fetch)

**What:** `EventsFiltersSectionV3` gains an optional `prune` prop fed from the already-held `opStatus.prune`. The block self-hides when `prune` is absent.

```typescript
// Render switch (~916-920) — pass the already-fetched prune object down:
<EventsFiltersSectionV3 llmStatus={llmStatus} prune={opStatus?.prune ?? null} />

// Composer signature gains the optional prop:
function EventsFiltersSectionV3({
  llmStatus,
  prune,
}: {
  llmStatus: LLMStatus;
  prune?: OperatorStatus['prune'] | null;
}) { ... {prune && <DeadLinkBucketsBlock prune={prune} />} ... }
```

**Why:** `opStatus` is already fetched once at top level and `opStatus.prune.deadUrlCount` is already read by the hero tile (line 1498) — threading the same object costs nothing and avoids a second `/api/operator-status` round-trip. [VERIFIED: codebase — `opStatus` state line 1144; `heroDeadUrls = opStatus?.prune?.deadUrlCount` line 1498]

### Pattern 3: Server SCAN-loop tally (D-01 — free side effect)

**What:** Add a `countsByStatus` accumulator inside the existing `buildDeadUrlSample` SCAN loop, incremented for EVERY key's `value.status` **before** the `isTerminalDead` filter — so `live`/`unknown`/`no-url` are counted too. Add `lastProbedAt`/`attemptCount` to each pushed sample entry.

```typescript
// Source: server/routes/operator-status.ts:242-272 — the loop already loads
// `value` and reads `lastProbedAt`/`attemptCount`-shaped objects. Add:
const countsByStatus: Record<string, number> = {};
// ...inside the per-key loop, AFTER `const value = cached?.data; if (!value) continue;`
countsByStatus[value.status] = (countsByStatus[value.status] ?? 0) + 1; // counts ALL statuses (sampled, ≤MAX_SCAN_KEYS)
// ...the existing isTerminalDead push, now also carrying:
sample.push({ eventId, url: value.lastUrlProbed, status: ..., evidence: value.evidence ?? null,
              lastProbedAt: value.lastProbedAt, attemptCount: value.attemptCount });
// Return both: { sample, countsByStatus }  (or attach countsByStatus to the prune block).
```

**Critical:** `countsByStatus` is a **sampled tally bounded by `MAX_SCAN_KEYS = 200`** (D-03). The authoritative terminal-dead total stays `deadUrlCount` (the O(1) sidecar read at line 444–447). The UI must label the buckets "of N scanned" and never present them as authoritative. [VERIFIED: codebase — `MAX_SCAN_KEYS = 200` line 177; `deadUrlCount` sidecar line 444–447; the loop short-circuits at MAX_SCAN_KEYS lines 243–247]

### Anti-Patterns to Avoid

- **Synthetic zero-defaults (the legacy composer's `?? {cerebras:0, groq:0}`):** renders dishonest zeros for providers purged in v1.5. Use presence-gates that self-hide instead (D-05). [VERIFIED: codebase line 3336–3337]
- **Deriving per-bucket counts on the client from `deadUrlSample`:** the sample is capped at 20 terminal-dead entries and excludes `live`/`unknown`/`no-url` entirely — client-side counting would be wrong. Counts MUST come from the server `countsByStatus` (D-01/D-09).
- **Touching the tablist DOM:** all mounts go INSIDE the existing `role="tabpanel" aria-labelledby="tab-events"` container (line 908). No tab ids, no roving-tabindex, no tablist changes (D-12). The 5 pinning suites enforce this.
- **`dangerouslySetInnerHTML` for `evidence`:** render as TEXT — React escapes by default (T-43-16 carried forward, D-11). The server comment at `operator-status.ts:202` already pins this expectation.
- **Mounting `DrillDownBlock` twice:** it is already mounted in `EventsFiltersSectionV3` (line 3443). Do not re-add it (D-07). [VERIFIED: codebase line 3443]

## Don't Hand-Roll

| Problem                     | Don't Build                    | Use Instead                                   | Why                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run-history list/drill-down | A new run-history component    | `FlightRecorderBlock` re-mount (one JSX line) | Fully self-contained: own Bearer fetch of `/api/events/llm-history`, own 30s poll, own L1/L2/L3 drill-down, own degrade-open placeholder [VERIFIED: codebase — `FlightRecorderBlock.tsx` 191–219 (own fetch+interval), 243–252 (degrade-open)] |
| The 7 pipeline blocks       | New block components           | The existing `WaterfallBlock`…`SuspectBlock`  | Already built + tested; legacy composer (line 3331) is the exact prop-wiring reference                                                                                                                                                         |
| Second prune fetch / hook   | `useOperatorStatusPolling`     | Thread existing `opStatus.prune` prop         | The fetch already happens once at top level (line 1150)                                                                                                                                                                                        |
| Per-status bucket counting  | Client-side reduce over sample | Server `countsByStatus` in the existing SCAN  | Sample is truncated (cap 20, terminal-dead only); the SCAN already loads every value                                                                                                                                                           |

**Key insight:** EVENTS-TAB-01 is _genuinely_ a mount, not a build — the only net-new component in the entire phase is `DeadLinkBucketsBlock`, and even that follows the verbatim local-`function`-component idiom already used 15+ times in this file.

## Runtime State Inventory

Not a rename/refactor/migration phase. **No runtime state changes.** No new Redis keys, no writers, no schema changes, no OS-registered state, no env vars, no build-artifact renames. The one server edit is a read-only aggregation over existing `events:url-liveness:*` data. [VERIFIED: CONTEXT.md D-01 "no new Redis keys, no new writers, no pipeline changes"; `docs/architecture/redis-keys.md` listed as "NO changes expected" in CONTEXT canonical_refs]

## Common Pitfalls

### Pitfall 1: DevApiStatusV3 test pins exactly 6 v3 empty-state lines AND asserts CallLog is absent

**What goes wrong:** `src/__tests__/DevApiStatusV3.test.tsx` (line 157, "renders all 6 v3 empty-state lines") will fail the moment the 7 v2 blocks mount under v3 — line 169–171 explicitly comments that `EventsFiltersSectionV3` only renders the v3-native blocks and NOT `CallLogBlock`'s "No LLM calls yet." Mounting `CallLogBlock` directly contradicts the pinned assertion.
**Why it happens:** The test was written when V3 was a v3-native-only surface (Phase 27.4.3). D-05 changes that surface by design.
**How to avoid:** Extend this test in lockstep (CONTEXT D-12 explicitly authorizes test _evolution_ for these two events-section files). Update the "6 lines" assertion to reflect the new mounts and their presence-gated empty/hidden states. Note: under presence-gating, an _empty_ `llmStatus` (the test's empty-fields case) means the v2 blocks SELF-HIDE — so the test must assert the blocks are present only when fed data, and absent (not "No LLM calls yet.") when fields are empty.
**Warning signs:** `npx vitest run src/__tests__/DevApiStatusV3.test.tsx` red on the "6 empty-state lines" case. [VERIFIED: codebase — `src/__tests__/DevApiStatusV3.test.tsx` lines 157–175]

### Pitfall 2: OpenAPI `deadUrlSample` schema is already drifted from Phase 43

**What goes wrong:** `server/openapi.yaml` lines 649–661 still describe `deadUrlSample` items as `{eventId, url, status}` with `status` enum `[dead-host, '403', '404']` — but the Phase 43 code already emits `evidence` and the `soft-404` status (`operator-status.ts` lines 198, 203, 266). Adding the D-01 `lastProbedAt`/`attemptCount`/`countsByStatus` fields to the spec without also closing the existing `evidence`/`soft-404` gap leaves the spec wrong.
**Why it happens:** Phase 43 D-19 updated the TS type + route but the OpenAPI block was not synchronized (Phase 43 was scoped server-only; the spec sync apparently slipped or was deferred to this surfacing phase).
**How to avoid:** When editing the prune schema for D-01, also add `evidence` (string, nullable) and extend the `status` enum to include `soft-404`. Run `npm run openapi:lint` (Redocly) — it must stay green (D-04 gate).
**Warning signs:** Spec `status` enum lacks `soft-404`; spec items lack `evidence`. [VERIFIED: codebase — `server/openapi.yaml` lines 654–661 vs `server/routes/operator-status.ts` lines 198, 203]

### Pitfall 3: `operator-status.test.ts` asserts the deadUrlSample shape is exactly `{eventId, url, status}`

**What goes wrong:** The route test (line 411–426) destructures the sample as `{eventId, url, status}` and asserts `['dead-host','403','404']` contains the status. Adding `lastProbedAt`/`attemptCount`/`evidence` to the entry, and `soft-404` to the union, requires extending these assertions; the test fixtures (lines 392–399) already supply `lastProbedAt` and `attemptCount` in the stored value, so the data is available — only the assertions need updating.
**How to avoid:** Extend the existing tests in the same commit (D-04). Add a `countsByStatus` assertion covering live/unknown/no-url buckets (the fixture at line 378–387 already mixes live/unknown/terminal-dead — extend it with a `no-url`/`soft-404` entry to pin the new buckets).
**Warning signs:** `npx vitest run server/routes/__tests__/operator-status.test.ts` red. [VERIFIED: codebase — `server/routes/__tests__/operator-status.test.ts` lines 372–430]

### Pitfall 4: Production usage — the events tab is NOT dev-only-gated

**What goes wrong:** A mental model that "the events subtab only shows in dev" would lead to skipping production-path testing. In fact `showEventsTab = shouldRenderDashboard()` returns `import.meta.env.DEV || hasDashboardKey()` — so in production an operator with a stored Bearer key sees the full subtab. The blocks must render correctly (and the v2 blocks honestly self-hide) under real NIM-only prod data.
**Why it happens:** The block header comments (lines 2982, 3322, 3393) say "renders only when … `import.meta.env.DEV`" — that documents the _old_ dual gate, but the actual call-site gate (line 916–920) is `showEventsTab`, which is Bearer-OR-dev. The comments are stale relative to the runtime gate.
**How to avoid:** Treat the events subtab as a production operator surface. Verify presence-gating produces honest hides (not crashes, not fabricated zeros) when `tokenCounters`/`breakerState` are absent under NIM-only v3 (D-06: `BudgetBarsBlock` is EXPECTED to self-hide in prod). Record that expected self-hide in verification rather than treating it as a bug. [VERIFIED: codebase — `shouldRenderDashboard` `src/lib/dashboardAuth.ts:54-56`; render switch gate `DevApiStatus.tsx:907`; stale DEV-only comments lines 2982/3322/3393]

### Pitfall 5: `tree-shake` threat (T-27.4.3-04-01) — keep the production gate intact

**What goes wrong:** The V3 observability blocks are reachable in production (Pitfall 4). The original mitigation T-27.4.3-04-01 was "production tree-shake gate via parent `showEventsTab`" — but `showEventsTab` is true in prod for authed operators, so the blocks are NOT tree-shaken away. This is intended (operator observability), but it means any prompt/response or sensitive lineage text must stay behind its own gate.
**How to avoid:** The 7 v2 blocks render only telemetry (counts, durations, provider names) — no prompt/response text — so they are safe to mount in the prod-reachable surface. The lineage prompt/response copy stays inside `DrillDownRow`'s existing replay-button flow (already gated), which this phase does NOT touch. Do not add any new raw-prompt rendering. [VERIFIED: codebase — `DrillDownRow` copy flow lines 2636–2653 uses the replay endpoint, not inline prompt text]

### Pitfall 6: BudgetBarsBlock/breakerState/tokenCounters self-hide is the CORRECT outcome (not a regression)

**What goes wrong:** Success-criterion-1 names "breaker state … visible." Under NIM-only v3, `tokenCounters`/`breakerState` (keyed `cerebras`/`groq`, providers purged in v1.5) are likely unpopulated, so `BudgetBarsBlock` self-hides. A reviewer may flag this as a missing-requirement failure.
**Why it happens:** D-06: these are v2-era shapes for purged providers; the live token-budget surface is Phase 39's `BudgetBlock` in the API-Health tab, which stays put. The honest self-hide IS the degrade-open requirement (SC-3).
**How to avoid:** Document in the plan + verification that `BudgetBarsBlock` self-hiding under NIM-only is the expected, correct behavior — fabricating `cerebras:0/groq:0` bars would be the actual defect. [VERIFIED: CONTEXT.md D-06; `useLLMStatusPolling.ts` `tokenCounters?: {cerebras, groq}` line 228, `breakerState?` line 231 — both optional, v2-shaped]

## Code Examples

### Field-presence reference for the 7 blocks (drives D-05 gating)

```typescript
// Source: src/hooks/useLLMStatusPolling.ts:185-244 — LLMStatus interface
// All fields the 7 blocks consume are OPTIONAL on the wire:
callHistory?:    Array<{ provider; model; tokensIn; tokensOut; durationMs; ok; batchSize; timestamp; routingReason?; skipReason? }>;
tokenCounters?:  { cerebras: number; groq: number };          // v2-shaped → likely ABSENT under NIM-only
breakerState?:   { cerebras: 'ok'|'paused'; groq: 'ok'|'paused' }; // v2-shaped → likely ABSENT
evalScore?:      { within5km; within20km; within100km; total; actorMatchRate? };
dlqRecent?:      Array<{ id; reason; lastError; timestamp }>;
provenanceCounts?: Record<string, number>;
suspectCount?:   number;
recentEvents?:   RecentEnrichedEvent[];  // (DrillDownBlock — already mounted)
```

[VERIFIED: codebase — `src/hooks/useLLMStatusPolling.ts:185-247`]

### Block prop signatures (which need composer-side guards)

```typescript
// Source: src/components/ui/DevApiStatus.tsx
WaterfallBlock({ llmStatus: LLMStatus }); // self-guards every field with ?? 0 — safe unconditionally (line 2529)
HistogramsBlock({
  provenanceCounts: Record<string, number>,
  callHistory: NonNullable<LLMStatus['callHistory']>,
}); // GUARD callHistory (line 2582)
CallLogBlock({ callHistory: NonNullable<LLMStatus['callHistory']> }); // GUARD (line 2778)
BudgetBarsBlock({ tokenCounters: { cerebras, groq }, breakerState: { cerebras, groq } }); // GUARD BOTH (line 2833)
EvalScoreBlock({ evalScore: LLMStatus['evalScore'] }); // internally null-guards (line 2879) — safe, but gate for honesty
DlqBlock({ entries: NonNullable<LLMStatus['dlqRecent']> }); // GUARD (line 2933)
SuspectBlock({ count: number }); // needs a number — gate on typeof (line 2968)
```

[VERIFIED: codebase — line numbers as cited]

### Legacy composer = the exact wiring reference (read, do NOT copy its zero-defaults)

```typescript
// Source: src/components/ui/DevApiStatus.tsx:3364-3387 — EventsFiltersSection
// Block order + prop names are correct; the `?? {cerebras:0...}` defaults above
// it (3335-3341) are the anti-pattern D-05 forbids.
<WaterfallBlock llmStatus={llmStatus} />
<HistogramsBlock provenanceCounts={pc} callHistory={ch} />
<DrillDownBlock llmStatus={llmStatus} />   // ← SKIP: already in V3 (D-07)
<CallLogBlock callHistory={ch} />
<BudgetBarsBlock tokenCounters={tc} breakerState={bk} />
<EvalScoreBlock evalScore={es} />
<DlqBlock entries={dlq} />
<SuspectBlock count={sc} />
```

[VERIFIED: codebase — `DevApiStatus.tsx:3364-3387`]

## State of the Art

| Old Approach                             | Current Approach                                                                               | When Changed                                                                | Impact                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Events subtab = v3-native blocks only    | Events subtab = v3-native + 7 v2 blocks + flight recorder + dead-link buckets                  | Phase 44 (this)                                                             | DevApiStatusV3 test's "6 empty-state lines" assertion must evolve |
| `deadUrlSample` = `{eventId,url,status}` | + `evidence`, `lastProbedAt`, `attemptCount`; status enum + `soft-404`; `prune.countsByStatus` | Phase 43 (evidence/soft-404 in code) + Phase 44 (D-01 fields, OpenAPI sync) | OpenAPI + route test + client interface lockstep                  |
| `cerebras`/`groq` token+breaker active   | NIM-only; v2 provider fields unpopulated → blocks self-hide                                    | v1.5 (Phase 29–34)                                                          | `BudgetBarsBlock` honestly self-hides in prod (D-06)              |

**Deprecated/outdated:**

- The "renders only when … `import.meta.env.DEV`" comments on the V3 blocks (lines 2982, 3322, 3393) are stale — the real gate is `showEventsTab = shouldRenderDashboard()` = `DEV || hasDashboardKey()`. Treat the subtab as production-reachable. Do not "fix" the comments destructively, but do not trust them as the runtime contract.

## Assumptions Log

| #   | Claim                                                                                                      | Section                 | Risk if Wrong                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Under live NIM-only v3 runs, `tokenCounters`/`breakerState` are absent so `BudgetBarsBlock` self-hides     | Pitfall 6 / D-06        | If they ARE populated, the block renders cerebras/groq bars (harmless but stale labels); verification should observe the live `/api/events/llm-status` payload to confirm. The presence-gate is correct either way. |
| A2  | The Phase-43 `evidence`/`soft-404` OpenAPI gap is genuinely unsynced (not synced in a block I didn't read) | Pitfall 2               | If already synced elsewhere, the planner simply finds nothing to fix — no harm. I read lines 639–661 directly; the enum there lacks `soft-404`.                                                                     |
| A3  | `npx vitest run` (frontend) + `npx vitest run server/` are the validation commands                         | Validation Architecture | These are documented in CLAUDE.md §Testing; low risk.                                                                                                                                                               |

**Note:** A1 is the only assumption with real planning impact, and it is explicitly pre-decided by CONTEXT D-06 ("If the v3 pipeline doesn't populate them, BudgetBarsBlock self-hides — that is correct"). No user confirmation needed — the locked decision already covers both branches.

## Open Questions

1. **Exact `countsByStatus` return wiring — attach to the `prune` object or return a tuple from `buildDeadUrlSample`?**
   - What we know: the loop currently returns `DeadUrlSampleEntry[]`; the prune block is assembled at line 453 (`const prune = { deadUrlCount, last24hPrunes, deadUrlSample }`).
   - What's unclear: cleanest place to surface `countsByStatus` (CONTEXT leaves this to discretion).
   - Recommendation: change `buildDeadUrlSample` to return `{ sample, countsByStatus }` and spread into the prune block: `prune = { deadUrlCount, last24hPrunes, deadUrlSample: sample, countsByStatus }`. Single-responsibility, one SCAN.

2. **Should absent statuses key as 0 or be omitted in `countsByStatus`? (CONTEXT discretion D-50)**
   - Recommendation: omit absent statuses (sparse map) — reads cleaner in the contract test and the UI can `?? 0` per-status. Pick whichever the contract test pins; either is acceptable per CONTEXT.

## Validation Architecture

### Test Framework

| Property            | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Framework           | Vitest ^4.1.0 (jsdom for frontend, node for server) [VERIFIED: package.json] |
| Config file         | `vite.config.ts` (test block, with `test.alias` map mocks per CLAUDE.md)     |
| Quick run command   | `npx vitest run <path>` (single file)                                        |
| Full suite command  | `npx vitest run` (all) / `npx vitest run server/` (server only)              |
| Contract drift gate | `npm run openapi:lint` (Redocly) — D-04                                      |
| Typecheck gate      | `npm run typecheck` (`tsc -b && type-coverage`)                              |

### Phase Requirements → Test Map

| Req ID          | Behavior                                                                        | Test Type | Automated Command                                                     | File Exists?                   |
| --------------- | ------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- | ------------------------------ |
| EVENTS-TAB-01   | 7 v2 blocks mount in V3 subtab, presence-gated                                  | component | `npx vitest run src/__tests__/devApiStatusEventsSection.test.tsx`     | ✅ (extend)                    |
| EVENTS-TAB-01   | V3 empty-state behavior with new mounts                                         | component | `npx vitest run src/__tests__/DevApiStatusV3.test.tsx`                | ✅ (extend — Pitfall 1)        |
| EVENTS-TAB-01   | FlightRecorder re-mount renders + degrades open                                 | component | `npx vitest run src/__tests__/devApiStatusEventsSection.test.tsx`     | ✅ (extend)                    |
| EVENTS-TAB-02   | Server `countsByStatus`/`lastProbedAt`/`attemptCount` in prune                  | route     | `npx vitest run server/routes/__tests__/operator-status.test.ts`      | ✅ (extend)                    |
| EVENTS-TAB-02   | DeadLinkBucketsBlock renders counts + sample rows, self-hides when prune absent | component | `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` | ✅ (extend)                    |
| EVENTS-TAB-02   | `evidence` rendered as TEXT not HTML (D-11)                                     | component | new assertion in prune test                                           | ✅ (extend)                    |
| SC-3            | tablist DOM unchanged; 5 pinning suites green                                   | component | `npx vitest run src/components/ui/__tests__/`                         | ✅ (must stay green untouched) |
| SC-3 (contract) | OpenAPI prune schema valid after additions                                      | lint      | `npm run openapi:lint`                                                | ✅                             |

### Sampling Rate

- **Per task commit:** the single affected test file (e.g. `npx vitest run server/routes/__tests__/operator-status.test.ts` for the server task; `npx vitest run src/__tests__/DevApiStatusV3.test.tsx` for the client task).
- **Per wave merge:** `npx vitest run` (full) + `npm run openapi:lint` + `npm run typecheck`.
- **Phase gate:** Full suite green + Redocly green + typecheck green before `/gsd-verify-work`.

### Wave 0 Gaps

- None — every test file needed already exists; all five are extension targets, not net-new infrastructure. The new `DeadLinkBucketsBlock` assertions live inside the existing `DevApiStatus.prune.test.tsx`. The 5 pinning suites (snapshot, tabMerge, diagnosticBlocks, operatorActions) already exist and must stay green untouched.

_Net-new test code: assertions only (extend 5 existing files). No new test files, no new fixtures infrastructure, no framework install._

## Security Domain

> `security_enforcement` is not explicitly `false` in config — included.

### Applicable ASVS Categories

| ASVS Category         | Applies         | Standard Control                                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes             | Both feeding endpoints (`/api/operator-status`, `/api/events/llm-history`, `/api/events/llm-status`) are Bearer-gated via `dashboardAuth`; `FlightRecorderBlock` + `fetchOpStatus` use `dashboardAuthHeaders()`. No new auth surface added. [VERIFIED: codebase — `fetchOpStatus` line 1150–1153; `FlightRecorderBlock` fetch line 198–200] |
| V3 Session Management | no              | No session state introduced; Bearer in localStorage is pre-existing                                                                                                                                                                                                                                                                         |
| V4 Access Control     | yes (unchanged) | `showEventsTab = DEV \|\| hasDashboardKey()` — same gate as the rest of the dashboard. No new privileged action; all surfaces read-only                                                                                                                                                                                                     |
| V5 Input Validation   | yes             | `evidence` and all rendered strings go through React's default escaping — render as TEXT, never `dangerouslySetInnerHTML` (D-11 / T-43-16). [VERIFIED: codebase — no `dangerouslySetInnerHTML` in `DevApiStatus.tsx` per existing T-27.4-09-02/03 mitigation note line 3323]                                                                |
| V6 Cryptography       | no              | No crypto in this phase                                                                                                                                                                                                                                                                                                                     |

### Known Threat Patterns for React dashboard + read-only Express aggregator

| Pattern                                                                       | STRIDE                 | Standard Mitigation                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored-XSS via `evidence`/URL strings rendered from Redis                     | Tampering / Elevation  | React text-node escaping; NO `dangerouslySetInnerHTML` (D-11) — `evidence` is server-capped ≤200 chars (Phase 43 D-16)                                                                    |
| Info disclosure of LLM prompts in a prod-reachable surface                    | Information Disclosure | The 7 v2 blocks render telemetry only (counts/durations/provider names), no prompt/response text; lineage prompt-copy stays behind the existing replay-button gate, untouched (Pitfall 5) |
| Aggregator wall-clock DoS via runaway `url-liveness:*` keys                   | Denial of Service      | `MAX_SCAN_KEYS = 200` budget guard already bounds the SCAN; `countsByStatus` adds no extra reads, inherits the same cap (D-03) [VERIFIED: codebase — line 177, 243–247]                   |
| Degrade-open contract violation (one bad value crashes the aggregator/render) | Denial of Service      | Server `buildDeadUrlSample` try/catch returns `[]` on throw (line 275–278); client blocks self-hide on absent data (D-05/D-10)                                                            |

## Sources

### Primary (HIGH confidence)

- `src/components/ui/DevApiStatus.tsx` — render switch (907–922), 7 v2 blocks (2529–2977), legacy composer (3331–3389), V3 composer (3414–3446), opStatus/prune state (1101–1158), hero tile (1490–1498) [codebase, this session]
- `src/hooks/useLLMStatusPolling.ts` — `LLMStatus` interface (185–328) [codebase]
- `src/components/ui/FlightRecorderBlock.tsx` — full file (self-contained fetch + degrade-open) [codebase]
- `server/routes/operator-status.ts` — `DeadUrlSampleEntry` (185–204), `buildDeadUrlSample` (230–279), prune assembly (444–453), `MAX_SCAN_KEYS` (177) [codebase]
- `server/routes/__tests__/operator-status.test.ts` — deadUrlSample pins (372–530) [codebase]
- `src/__tests__/DevApiStatusV3.test.tsx` (157–280), `src/__tests__/devApiStatusEventsSection.test.tsx` (221–382), `src/__tests__/components/DevApiStatus.prune.test.tsx` (145–292) [codebase]
- `server/openapi.yaml` — `/api/operator-status` prune schema (639–661) [codebase]
- `src/lib/dashboardAuth.ts` — `shouldRenderDashboard` (54–56) [codebase]
- `.planning/phases/44-events-subtab-pipeline-detail/44-CONTEXT.md` (D-01..D-13), `.planning/phases/43-ghost-link-prune-correctness/43-CONTEXT.md` (taxonomy/evidence/attemptCount) [planning docs]
- `package.json` — versions + scripts [codebase]

### Secondary (MEDIUM confidence)

- None — every claim is grounded in directly-read project source this session.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all versions read from package.json
- Architecture: HIGH — every mount point, prop signature, and gate read directly from source
- Pitfalls: HIGH — each pitfall cites the specific pinned test assertion or stale comment that triggers it

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable; internal codebase, no fast-moving external dependency). Re-verify only if `DevApiStatus.tsx`, `operator-status.ts`, or the LLMStatus interface change before planning.
