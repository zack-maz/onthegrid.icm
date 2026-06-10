# Phase 44: Events Subtab Pipeline Detail - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Mode:** Auto (--auto --chain; Claude selected the recommended option for every gray area)

<domain>
## Phase Boundary

The operator can read full LLM-pipeline detail and per-bucket dead-link state directly in the API-Health events subtab, using data that already exists in Redis. The work is overwhelmingly presentational: mount the 7 already-built v2-era blocks (Waterfall, Histograms, CallLog, BudgetBars, EvalScore, Dlq, Suspect) into the active `EventsFiltersSectionV3` composer, and add a per-bucket dead-link state block fed from the `/api/operator-status` prune data. One narrow, read-only server exception is locked below (D-01) to make EVENTS-TAB-02 satisfiable — no new Redis keys, no writers, no pipeline behavior changes.

Out of scope: any restyle/readability work (Phase 45 — tabular-nums, progressive disclosure, sparklines, history rings), new Redis fields or probe/sweep/prune behavior changes (Phase 43 territory is closed), headless probing, prose docs (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### EVENTS-TAB-02 data sourcing (the central tension)

- **D-01:** The roadmap goal gloss says "no server changes," but success criterion 2 requires per-liveness-status counts plus transition timestamps that `/api/operator-status` does not expose today (`prune` carries only `deadUrlCount`, `last24hPrunes`, and a terminal-dead-only `deadUrlSample` capped at 20). Resolution: a **minimal read-only extension of the existing aggregator** in `server/routes/operator-status.ts` — interpret "no server changes" as "no new Redis keys, no new writers, no pipeline changes," which this honors. Specifically:
  - Tally **`countsByStatus`** (all statuses encountered: `live`, `unknown`, `no-url`, `404`, `403`, `dead-host`, `soft-404`) inside the **existing** `buildDeadUrlSample` SCAN loop — the values are already loaded per key; no extra Redis reads.
  - Add **`lastProbedAt`** and **`attemptCount`** to `DeadUrlSampleEntry` — both already exist on the stored `UrlLiveness` value.
- **D-02:** "First-seen-dead" does **not** exist in Redis (the schema has only `lastProbedAt`). Do NOT add a new Redis field — that would re-open Phase 43's lockstep surfaces for a UI phase. Render the honest available signal instead: `lastProbedAt` + `attemptCount` ("dead on ≥N consecutive sweeps" — under the once-daily cron cadence, attemptCount is the dead-streak depth and the best available transition proxy). If the operator later needs a true first-seen timestamp, that is a deferred schema change (see Deferred Ideas).
- **D-03:** `countsByStatus` is a **sampled tally** bounded by the existing `MAX_SCAN_KEYS = 200` budget guard — label it as such in the UI (e.g., "of N scanned"). The `deadUrlCount` sidecar remains the authoritative terminal-dead total; never present the sampled tally as authoritative.
- **D-04:** Contract lockstep for the D-01 field additions, same commit: `server/routes/__tests__/operator-status.test.ts`, the client `opStatus` interface in `DevApiStatus.tsx` (forward-compat optional fields, Phase 32 D-10 pattern), and `server/openapi.yaml` `/api/operator-status` response schema (Redocly drift gate stays green).

### The 7 v2-era blocks under NIM-only data (EVENTS-TAB-01)

- **D-05:** Mount all 7 blocks (Waterfall, Histograms, CallLog, BudgetBars, EvalScore, Dlq, Suspect) into `EventsFiltersSectionV3`, **presence-gated** — each block renders only when its `LLMStatus` field is present/non-empty, and self-hides otherwise (success criterion 3's degrade-open requirement). Do NOT copy the legacy `EventsFiltersSection` zero-defaults (`tc = {cerebras: 0, groq: 0}` etc.) — synthetic defaults would render dishonest zeros for purged providers instead of hiding.
- **D-06:** `tokenCounters` / `breakerState` are v2-era shapes keyed `cerebras`/`groq` (providers purged from the runtime cascade in v1.5). Do NOT widen or rename these server fields in this phase. If the v3 pipeline doesn't populate them, `BudgetBarsBlock` self-hides — that is correct and honest; the live token-budget surface is Phase 39's `BudgetBlock` in the API-Health tab (GROUP 3), which stays where it is.
- **D-07:** The existing v3-native blocks (RoutingTrace, LatencyHistogram, RateLimitHeadroom, SchemaStrictFailure, ErrorTaxonomy, CostShadow, the three A9 cells, DrillDownBlock) stay mounted unchanged. `DrillDownBlock` is already in V3 — do not mount it twice.

### Run-history visibility (success criterion 1 "run-history all visible")

- **D-08:** Satisfy via the existing self-contained `FlightRecorderBlock` (Phase 39), re-mounted inside the events subtab. It fetches its own data (`/api/events/llm-history`), and tabpanels render conditionally on `activeTab` — only one instance mounts at a time, so no double fetch. The `lastRun` summary line in the V3 header stays as-is. Keep the API-Health-tab mount unchanged.

### Dead-link block composition + prop threading (EVENTS-TAB-02 UI)

- **D-09:** One new block component, `DeadLinkBucketsBlock` (name at planner's discretion), following the existing block pattern in `DevApiStatus.tsx`: per-status bucket counts (D-01 `countsByStatus`), the authoritative `deadUrlCount` sidecar total, `last24hPrunes`, and the `deadUrlSample` drill-down rows showing `url`, `status` badge, `evidence`, `lastProbedAt`, `attemptCount`.
- **D-10:** Data reaches it by **threading the existing top-level `opStatus.prune` fetch down as a prop** to `EventsFiltersSectionV3` — no second `/api/operator-status` fetch, no new hook. The block self-hides when `prune` is absent (older server, fetch failure, missing Bearer) — degrade-open.
- **D-11:** `evidence` renders as **TEXT, not HTML** — T-43-16 carried forward explicitly (the server comment in `operator-status.ts` already pins this expectation on Phase 44).
- **D-12:** The WAI-ARIA tablist contract is untouched: all mounting happens **inside** the existing `role="tabpanel" aria-labelledby="tab-events"` container; no tab ids, no tablist DOM, no roving-tabindex changes. The 5 pinning suites (snapshot, tabMerge, diagnosticBlocks, operatorActions) must stay green; the events-section tests (`src/__tests__/devApiStatusEventsSection.test.tsx`, `src/__tests__/DevApiStatusV3.test.tsx`) are expected to be **extended** in lockstep with the new mounts (test evolution, not contract breakage).
- **D-13:** No styling/readability work beyond what mounting requires — match the existing block visual idiom exactly (text-[9px], white/40 headers, etc.). Phase 45 restyles this file; keep the diff surface minimal so the restyle phase doesn't fight this one.

### Claude's Discretion

- Exact ordering of the newly mounted blocks within the V3 section (suggested: v3-native blocks unchanged first, then the 7 v2 blocks in their legacy order, then FlightRecorder, then DeadLinkBuckets — but readability judgment wins; Phase 45 will reorder anyway).
- Exact `DeadLinkBucketsBlock` component name and internal layout.
- Whether `countsByStatus` keys absent statuses as 0 or omits them (pick what reads cleanest in the contract test).
- How the "of N scanned" sampled-tally caveat is worded.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition

- `.planning/ROADMAP.md` §Phase 44 — goal, success criteria 1–3, dependency notes (wired before Phase 45 restyles the same file)
- `.planning/REQUIREMENTS.md` §Events Subtab Detail (EVENTS-TAB-01, EVENTS-TAB-02)

### Upstream phase contracts (what this phase surfaces)

- `.planning/phases/43-ghost-link-prune-correctness/43-CONTEXT.md` — D-04/D-06/D-16/D-19: the 7-status taxonomy, `evidence` string semantics, `no-url` exclusion from terminal-dead, attemptCount semantics this UI must render honestly
- `server/lib/urlLiveness.ts` — `UrlLivenessSchema` (status enum, `evidence`, `lastProbedAt`, `attemptCount`), `isTerminalDead`
- `CLAUDE.md` §Serverless Cache — `events:url-liveness:{eventId}` + `events:url-liveness-count` registry lines (TTL tiers, attemptCount semantics)

### Code under change

- `src/components/ui/DevApiStatus.tsx` — the whole surface: events tabpanel render switch (~907–922), `EventsFiltersSectionV3` (~3414–3446), the 7 legacy blocks (`WaterfallBlock` ~2529, `HistogramsBlock` ~2582, `CallLogBlock` ~2778, `BudgetBarsBlock` ~2833, `EvalScoreBlock` ~2879, `DlqBlock` ~2933, `SuspectBlock` ~2968), legacy composer `EventsFiltersSection` (~3331; reference for prop wiring, NOT for its zero-defaults), top-level `opStatus` fetch + `prune` interface (~1091–1145)
- `server/routes/operator-status.ts` — `DeadUrlSampleEntry` (~185–204), `buildDeadUrlSample` SCAN loop (~230+), `MAX_SCAN_KEYS` budget guard (~177); D-01 extension lands here
- `src/hooks/useLLMStatusPolling.ts` — `LLMStatus` interface (~185+): every field the 7 blocks consume (`callHistory`, `tokenCounters`, `breakerState`, `evalScore`, `dlqRecent`, `provenanceCounts`, `suspectCount`)
- `src/components/ui/FlightRecorderBlock.tsx` — self-contained run-history block re-mounted per D-08

### Tests (lockstep)

- `server/routes/__tests__/operator-status.test.ts` — server contract pin for the D-01 field additions
- `src/__tests__/devApiStatusEventsSection.test.tsx` + `src/__tests__/DevApiStatusV3.test.tsx` — events-section render pins; extend for new mounts
- `src/__tests__/components/DevApiStatus.prune.test.tsx` — existing prune UI pin
- `src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx`, `...DevApiStatusConsolidatedLayout.snapshot.test.tsx` + tabMerge/operatorActions suites — the 5 pinning suites that must stay green untouched

### Contract surfaces (drift gates must stay green)

- `server/openapi.yaml` `/api/operator-status` (~line 606) — response schema gains the D-01 fields; Redocly lint green
- `docs/architecture/redis-keys.md` — read-only reference; NO changes expected (no Redis shape changes in this phase)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- All 7 target blocks already exist as standalone function components in `DevApiStatus.tsx` — EVENTS-TAB-01 is genuinely a mount, not a build; the legacy `EventsFiltersSection` shows the exact prop wiring
- `EventsFiltersSectionV3` is the **default** events-tab body (v2 is the explicit override branch) — mounting there is the production path
- The top-level component already fetches `/api/operator-status` once (Bearer-gated) and holds `opStatus.prune`; the API-Health hero tile already reads `prune.deadUrlCount` — threading the same object down costs nothing
- `FlightRecorderBlock` is fully self-contained (own fetch, own drill-down) — re-mounting is one JSX line
- `buildDeadUrlSample` already loads every scanned key's value to test `isTerminalDead` — the per-status tally is a free side effect of the existing loop

### Established Patterns

- Degrade-open block idiom: every diagnostic block self-hides (or renders "—") when its data is absent; never crashes, never fabricates
- Forward-compat optional fields on the client `opStatus` interface (Phase 32 D-10) — older servers missing new fields must not break the dashboard
- Contract pins: server route test + OpenAPI + client interface move in the same commit (Phase 39 `tokenBudget` precedent: Zod `.strict()`-pinned, degrade-open)
- Visual idiom for blocks: `text-[9px]`, `uppercase tracking-wider text-white/40` headers, `border-t border-white/10 pt-2` separators — match exactly, restyle is Phase 45

### Integration Points

- Events tabpanel: `activeTab === 'events' && showEventsTab` → `EventsFiltersSectionV3` (schemaVersion v3/unknown default path)
- `EventsFiltersSectionV3` currently takes only `llmStatus`; gains an optional `prune` prop (D-10)
- `/api/events/llm-status` (Bearer via `dashboardAuth`) feeds `llmStatus`; `/api/operator-status` (Bearer) feeds `prune` — both already polled by this component

</code_context>

<specifics>
## Specific Ideas

- The server already documents the hand-off: `operator-status.ts` comments say "Phase 44 renders the badge color off this field" (status) and "Phase 44 must render this as TEXT, not HTML (T-43-16 carried forward)" (evidence) — honor both verbatim
- Roadmap SC-1 names the visible set explicitly: DLQ depth / breaker state / eval baseline+drift / run-history — breaker state may legitimately self-hide under NIM-only if the field is unpopulated (D-06); record that in verification rather than faking it
- attemptCount as dead-streak depth: "dead on N consecutive sweeps" is the operator-meaningful framing (one sweep per day)

</specifics>

<deferred>
## Deferred Ideas

- Readability restyle of everything mounted here (tabular-nums, right-aligned numerics, progressive disclosure, visual hierarchy) — Phase 45 (DASH-READ-01..04)
- Trend sparklines + small history rings for dead-link count / cron freshness — Phase 45 (DASH-READ-05)
- True `firstSeenDead` timestamp field on `UrlLiveness` — would re-open Phase 43's lockstep surfaces (schema test, shim, redis-keys.md, CLAUDE.md registry); only worth it if the operator finds the attemptCount proxy insufficient in practice
- Widening/renaming `tokenCounters`/`breakerState` to NIM-era provider keys — server-side observability cleanup, belongs with a future LLM-surface phase, not a UI mount

### Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md` — matched only on generic keywords (score 0.6); CI health is unrelated to this UI-mount phase. Third consecutive deferral (Phases 42, 43, 44) — candidate for Phase 46 (General Hardening) review.
- `phase-27.4.3-deckgl-v9-type-drift.md` — matched only on generic keywords (score 0.6); deck.gl layer typing is unrelated to the DevApiStatus dashboard. Candidate for Phase 46 review.
- (Deviation note: auto-mode rule says fold score ≥ 0.4, but both matches are keyword-noise with no scope overlap — folding them would violate the phase boundary, so they were reviewed-not-folded, matching the Phase 42/43 precedent.)

</deferred>

---

_Phase: 44-Events Subtab Pipeline Detail_
_Context gathered: 2026-06-10_
