# Phase 44: Events Subtab Pipeline Detail - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 7 (1 client modify, 1 server modify, 1 OpenAPI modify, 4 test extends)
**Analogs found:** 7 / 7 (all in-file or sibling-file — this is a mount-and-thread phase, every analog already exists in the target files)

## File Classification

| New/Modified File                                                                                                                                               | Role                             | Data Flow                                        | Closest Analog                                                                                                                      | Match Quality   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `src/components/ui/DevApiStatus.tsx` (modify — mount 7 blocks + FlightRecorder + new `DeadLinkBucketsBlock` into `EventsFiltersSectionV3`; thread `prune` prop) | component (composer + new block) | request-response (render of already-polled data) | `EventsFiltersSection` (legacy composer, same file ~3331) for wiring; `DlqBlock`/`SuspectBlock` (same file) for the new block idiom | exact (in-file) |
| `server/routes/operator-status.ts` (modify — `countsByStatus` tally + `lastProbedAt`/`attemptCount` on `DeadUrlSampleEntry`)                                    | route (read-only aggregator)     | transform (SCAN-loop reduce over Redis)          | `buildDeadUrlSample` itself (same file ~230) — extend the existing loop                                                             | exact (in-file) |
| `server/openapi.yaml` (modify — prune-block schema additions + close Phase 43 `evidence`/`soft-404` drift)                                                      | config (contract spec)           | n/a (schema)                                     | existing `prune.deadUrlSample` schema block (~639-661)                                                                              | exact (in-file) |
| `server/routes/__tests__/operator-status.test.ts` (extend)                                                                                                      | test (route contract)            | request-response                                 | existing `deadUrlSample` assertions (~372-530)                                                                                      | exact (in-file) |
| `src/__tests__/DevApiStatusV3.test.tsx` (extend — Pitfall 1)                                                                                                    | test (component)                 | request-response                                 | existing "6 v3 empty-state lines" assertion (~157-175)                                                                              | exact (in-file) |
| `src/__tests__/devApiStatusEventsSection.test.tsx` (extend)                                                                                                     | test (component)                 | request-response                                 | existing events-section render pins (~221-382)                                                                                      | exact (in-file) |
| `src/__tests__/components/DevApiStatus.prune.test.tsx` (extend)                                                                                                 | test (component)                 | request-response                                 | existing prune UI pin (~145-292)                                                                                                    | exact (in-file) |

## Pattern Assignments

### `src/components/ui/DevApiStatus.tsx` — V3 composer mounts + prune thread (component, request-response)

**Analog for prop wiring:** `EventsFiltersSection` (legacy composer), same file lines 3331-3389. Copy the BLOCK ORDER and PROP NAMES; do NOT copy its zero-default destructuring (lines 3335-3341 are the D-05 anti-pattern).

**Anti-pattern to NOT replicate** (lines 3335-3341):

```typescript
const tc = llmStatus.tokenCounters ?? { cerebras: 0, groq: 0 }; // synthetic zeros — dishonest under NIM-only
const bk = llmStatus.breakerState ?? { cerebras: 'ok' as const, groq: 'ok' as const }; // fabricated 'ok' for purged providers
```

**Current V3 composer to extend** (lines 3414-3446) — currently takes only `llmStatus`; v3-native blocks (Routing/Latency/RateLimit/Schema/Error/Cost/3×A9/DrillDown) stay UNCHANGED (D-07). `DrillDownBlock` is already mounted at line 3443 — do NOT mount twice.

```typescript
function EventsFiltersSectionV3({ llmStatus }: { llmStatus: LLMStatus }) {
  return (
    <section className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] text-white/60">Schema: v3 · Stage: {llmStatus.stage ?? 'idle'}</div>
      <RoutingTraceBlock trace={llmStatus.routingTrace} />
      ... (v3-native blocks unchanged) ...
      <DrillDownBlock llmStatus={llmStatus} />   // ALREADY HERE — do not re-add
    </section>
  );
}
```

**Correct presence-gated mount idiom** (D-05) — gate at the composer because the block bodies declare `NonNullable<...>` props:

```typescript
{llmStatus.callHistory && llmStatus.callHistory.length > 0 && (
  <HistogramsBlock provenanceCounts={llmStatus.provenanceCounts ?? {}} callHistory={llmStatus.callHistory} />
)}
{llmStatus.callHistory && <CallLogBlock callHistory={llmStatus.callHistory} />}
{llmStatus.tokenCounters && llmStatus.breakerState && (
  <BudgetBarsBlock tokenCounters={llmStatus.tokenCounters} breakerState={llmStatus.breakerState} />   // both required
)}
{llmStatus.evalScore && <EvalScoreBlock evalScore={llmStatus.evalScore} />}
{llmStatus.dlqRecent && <DlqBlock entries={llmStatus.dlqRecent} />}
{typeof llmStatus.suspectCount === 'number' && <SuspectBlock count={llmStatus.suspectCount} />}
<WaterfallBlock llmStatus={llmStatus} />   // self-guards every field with ?? 0 — mount unconditionally or gate on stage !== 'idle' (planner's call)
```

**New `DeadLinkBucketsBlock` idiom** — copy the visual + degrade-open shape of `DlqBlock` (lines 2933-2960) and `SuspectBlock` (lines 2968-2977):

```typescript
function DlqBlock({ entries }: { entries: NonNullable<LLMStatus['dlqRecent']> }) {
  if (entries.length === 0) return <div className="mt-2 text-[9px] text-white/40">DLQ: 0 entries</div>;
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-red-400">DLQ ({entries.length})</div>
      <div className="mt-1 max-h-20 overflow-y-auto">
        {entries.slice(0, 10).map((e) => (
          <div key={e.id + e.timestamp} className="flex items-center gap-1 text-[9px] text-white/60">
            <span className="text-red-400">●</span> <span className="text-white/80">{e.reason}</span>
            <span className="ml-auto tabular-nums text-white/30">{relativeTime(...)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Visual idiom to match exactly (D-13): `text-[9px]`, `font-bold uppercase tracking-wider text-white/40` headers, `mt-2`, `tabular-nums` for numbers, `max-h-20 overflow-y-auto` for scrollable row lists, `●` status dots. Render `evidence` as a TEXT node (D-11 / T-43-16) — never `dangerouslySetInnerHTML`. Label bucket counts "of N scanned" (D-03 sampled-tally caveat). Authoritative total is `prune.deadUrlCount` (sidecar), NOT the summed buckets.

**Prune-prop threading** (D-10) — render switch lines 916-920, pass already-fetched object down:

```typescript
{llmStatus?.schemaVersion === 'v2' ? (
  <EventsFiltersSection llmStatus={llmStatus} />
) : (
  <EventsFiltersSectionV3 llmStatus={llmStatus} prune={opStatus?.prune ?? null} />   // NEW prop
)}
```

The composer gains `prune?: OperatorStatus['prune'] | null` and self-hides the block when absent: `{prune && <DeadLinkBucketsBlock prune={prune} />}`. The tabpanel container (line 908, `role="tabpanel" aria-labelledby="tab-events"`) stays untouched (D-12) — all mounts go INSIDE it.

**FlightRecorder re-mount** (D-08) — `FlightRecorderBlock` is self-contained (own `/api/events/llm-history` fetch + 30s poll + degrade-open). One JSX line inside `EventsFiltersSectionV3`. Mutually-exclusive `activeTab` branches mean no double fetch with the API-Health-tab mount.

**Client interface extension** (D-04) — `OperatorStatus.prune` interface, lines 1111-1119. Forward-compat optional pattern (Phase 32 D-10 — older servers omit fields). Add `evidence`/`lastProbedAt`/`attemptCount` to the sample entry, extend the status union with `'soft-404'`, add `countsByStatus`:

```typescript
prune?: {
  deadUrlCount: number;
  last24hPrunes: number;
  countsByStatus?: Record<string, number>;          // NEW (D-01) — sampled tally, optional fwd-compat
  deadUrlSample: Array<{
    eventId: string;
    url: string;
    status: 'dead-host' | '403' | '404' | 'soft-404';  // + soft-404 (Phase 43 drift close)
    evidence?: string | null;                            // NEW
    lastProbedAt?: string;                               // NEW
    attemptCount?: number;                               // NEW
  }>;
} | null;
```

Precedent for "route + Zod/contract pin + client interface + OpenAPI same commit": the `tokenBudget` field (lines 1137-1142) — degrade-open, optional, gate hides on absence.

---

### `server/routes/operator-status.ts` — SCAN-loop tally + entry fields (route, transform)

**Analog:** `buildDeadUrlSample` itself, lines 230-279 — extend the existing loop, do NOT add a second SCAN.

**Type to extend** (`DeadUrlSampleEntry`, lines 185-204):

```typescript
type DeadUrlSampleEntry = {
  eventId: string;
  url: string | null;
  status: 'dead-host' | '403' | '404' | 'soft-404'; // already has soft-404 (Phase 43 D-19)
  evidence: string | null; // already present (Phase 43 D-19)
  // ADD: lastProbedAt: string; attemptCount: number;   (both already on stored UrlLiveness value)
};
```

**Loop to extend** (lines 242-272) — the per-key `value` already carries `lastProbedAt`/`attemptCount`; the SCAN already loads it. Tally BEFORE the `isTerminalDead` filter so live/unknown/no-url are counted:

```typescript
const value = cached?.data;
if (!value) continue;
// ADD: countsByStatus[value.status] = (countsByStatus[value.status] ?? 0) + 1;  // counts ALL statuses, ≤MAX_SCAN_KEYS
if (!isTerminalDead(value.status)) continue;
sample.push({
  eventId,
  url: value.lastUrlProbed,
  status: value.status as DeadUrlSampleEntry['status'],
  evidence: value.evidence ?? null,
  // ADD: lastProbedAt: value.lastProbedAt, attemptCount: value.attemptCount,
});
```

**Budget guard (inherit, do not change)** — `MAX_SCAN_KEYS = 200` (line 177), short-circuit at lines 243-247. `countsByStatus` is a SAMPLED tally bounded by this cap (D-03) — adds zero extra Redis reads.

**Degrade-open contract (preserve)** — the helper's outer `try/catch` returns `[]` on throw (lines 275-278). Change the return type to `{ sample, countsByStatus }` (research Open Question 1 recommendation) and have the catch return `{ sample: [], countsByStatus: {} }`.

**Prune assembly** (line 453): `const prune = { deadUrlCount, last24hPrunes, deadUrlSample: sample, countsByStatus };` — `deadUrlCount` stays the authoritative O(1) sidecar read (lines 444-447).

---

### `server/openapi.yaml` — prune schema (config)

**Analog:** existing `/api/operator-status` `prune.deadUrlSample` schema, lines ~639-661. ALREADY DRIFTED from Phase 43 (Pitfall 2): items still `{eventId, url, status}` with enum `[dead-host, '403', '404']`. While editing for D-01: add `evidence` (string, nullable), extend `status` enum with `soft-404`, add `lastProbedAt`/`attemptCount` to items, add `countsByStatus` (object / additionalProperties: integer) to the prune block. Gate: `npm run openapi:lint` (Redocly) stays green (D-04).

---

### Test files (extend in lockstep — test evolution per D-12, not contract breakage)

- `server/routes/__tests__/operator-status.test.ts` (~372-530): the deadUrlSample assertion currently destructures `{eventId, url, status}` and pins enum `['dead-host','403','404']`. Extend to assert `evidence`/`lastProbedAt`/`attemptCount` and a `countsByStatus` block; fixture already supplies `lastProbedAt`/`attemptCount` — add a `no-url`/`soft-404` fixture entry to pin the new buckets.
- `src/__tests__/DevApiStatusV3.test.tsx` (~157-175): the "6 v3 empty-state lines" + "CallLog absent" assertions DIRECTLY contradict the new mounts (Pitfall 1). Update: under an EMPTY `llmStatus`, the v2 blocks SELF-HIDE — assert presence only when fed data, absence (not "No LLM calls yet.") when fields empty.
- `src/__tests__/devApiStatusEventsSection.test.tsx` (~221-382): extend for the new mounts + FlightRecorder re-mount + degrade-open.
- `src/__tests__/components/DevApiStatus.prune.test.tsx` (~145-292): add `DeadLinkBucketsBlock` assertions — bucket counts, sample rows, self-hide when `prune` absent, and `evidence`-rendered-as-TEXT (D-11).
- **MUST STAY GREEN UNTOUCHED** (5 pinning suites, D-12): `DevApiStatus.diagnosticBlocks.test.tsx`, `DevApiStatusConsolidatedLayout.snapshot.test.tsx`, plus the tabMerge / operatorActions suites under `src/components/ui/__tests__/`.

## Shared Patterns

### Degrade-open block (self-hide, never fabricate)

**Source:** `DlqBlock` (DevApiStatus.tsx:2933-2960) — empty-state `<div className="mt-2 text-[9px] text-white/40">…</div>`; server `buildDeadUrlSample` try/catch → `[]` (operator-status.ts:275-278).
**Apply to:** all 7 mounted blocks, `DeadLinkBucketsBlock`, the prune-prop gate. Absent data → self-hide or "—"; never crash, never synthesize zeros.

### Forward-compat optional client fields (Phase 32 D-10)

**Source:** `OperatorStatus.prune` (DevApiStatus.tsx:1111-1119) and `tokenBudget` (1137-1142) — optional fields, older servers omit them, render gate hides on absence.
**Apply to:** the D-01 client interface additions.

### Contract lockstep, same commit (Phase 39 `tokenBudget` precedent)

**Source:** `tokenBudget` shipped across server route + Zod `.strict()` pin + client interface + OpenAPI in one commit, degrade-open.
**Apply to:** D-01 → `operator-status.ts` + `operator-status.test.ts` + `OperatorStatus` interface + `openapi.yaml` move together; `npm run openapi:lint` + `npx vitest run` green.

### Block visual idiom (D-13 — restyle is Phase 45)

**Source:** all blocks in DevApiStatus.tsx — `text-[9px]`, `font-bold uppercase tracking-wider text-white/40` headers, `border-t border-white/10 pt-2` separators, `tabular-nums`, `●` dots, `max-h-20 overflow-y-auto` lists.
**Apply to:** `DeadLinkBucketsBlock`. Match exactly; minimize diff surface.

### evidence/URL as TEXT (D-11 / T-43-16, V5 input validation)

**Source:** server comment `operator-status.ts:202` ("Phase 44 must render this as TEXT, not HTML"); no `dangerouslySetInnerHTML` anywhere in DevApiStatus.tsx.
**Apply to:** every rendered Redis-sourced string in `DeadLinkBucketsBlock` — React default text-node escaping only.

## No Analog Found

None. Every file under change has an exact in-file or sibling-file analog. The only net-new component, `DeadLinkBucketsBlock`, follows the verbatim local-`function XBlock(...)` idiom used 15+ times in `DevApiStatus.tsx` (closest: `DlqBlock`, `SuspectBlock`).

## Metadata

**Analog search scope:** `src/components/ui/DevApiStatus.tsx`, `src/components/ui/FlightRecorderBlock.tsx`, `src/hooks/useLLMStatusPolling.ts`, `server/routes/operator-status.ts`, `server/openapi.yaml`, the 4 extend-target test files + 5 pinning suites.
**Files scanned:** 7 primary (all in CONTEXT/RESEARCH scope; line numbers verified by direct Read this session).
**Pattern extraction date:** 2026-06-10
