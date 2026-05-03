# Roadmap: Iran Conflict Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- ✅ **v1.3 Data Quality & Layers** -- Phases 22-26.4 (shipped 2026-04-09) — [archive](milestones/v1.3-ROADMAP.md)
- **v1.4 GDELT Redo & Performance** -- Phases 27-28 (planned, 27.2-27.4 inserted)

## Phase Summary

| Phase | Name                            | Milestone | Plans | Completed  |
| ----- | ------------------------------- | --------- | ----- | ---------- |
| 1     | Project Scaffolding & Theme     | v0.9      | 1/1   | 2026-03-14 |
| 2     | Base Map                        | v0.9      | 3/3   | 2026-03-14 |
| 3     | API Proxy                       | v0.9      | 3/3   | 2026-03-15 |
| 4     | Flight Data Feed                | v0.9      | 2/2   | 2026-03-15 |
| 5     | Entity Rendering                | v0.9      | 2/2   | 2026-03-16 |
| 6     | ADS-B Exchange Data Source      | v0.9      | 2/3   | 2026-03-16 |
| 7     | adsb.lol Data Source            | v0.9      | 2/2   | 2026-03-16 |
| 8     | Ship & Conflict Data Feeds      | v0.9      | 1/2   | 2026-03-17 |
| 8.1   | GDELT Event Source              | v0.9      | 2/2   | 2026-03-17 |
| 9     | Layer Controls & News Toggle    | v0.9      | 1/2   | 2026-03-17 |
| 10    | Detail Panel                    | v0.9      | 2/2   | 2026-03-18 |
| 11    | Smart Filters                   | v0.9      | 3/3   | 2026-03-18 |
| 12    | Analytics Dashboard             | v0.9      | 1/1   | 2026-03-19 |
| 13    | Serverless Cache Migration      | v1.0      | 4/4   | 2026-03-20 |
| 14    | Vercel Deployment               | v1.0      | 2/2   | 2026-03-20 |
| 15    | Key Sites Overlay               | v1.1      | 2/2   | 2026-03-20 |
| 16    | News Feed                       | v1.1      | 3/3   | 2026-03-20 |
| 17    | Notification Center             | v1.1      | 4/4   | 2026-03-20 |
| 18    | Oil Markets Tracker             | v1.1      | 2/2   | 2026-03-21 |
| 19    | Search, Filter & UI Cleanup     | v1.1      | 4/4   | 2026-03-22 |
| 19.1  | Advanced Search                 | v1.1      | 5/5   | 2026-03-22 |
| 19.2  | Counter Entity Dropdowns        | v1.1      | 2/2   | 2026-03-22 |
| 20    | Layer Purpose Refactor          | v1.2      | 3/3   | 2026-03-23 |
| 20.1  | Geographical & Weather Layers   | v1.2      | 3/3   | 2026-03-23 |
| 20.2  | Threat Heatmap Layer            | v1.2      | 1/1   | 2026-03-23 |
| 20.3  | Political Boundaries Layer      | v1.2      | --    | Deferred   |
| 20.4  | Satellite Imagery Layer         | v1.2      | --    | Deferred   |
| 20.5  | Infrastructure Focus Layer      | v1.2      | --    | Deferred   |
| 21    | Production Review & Deploy Sync | v1.2      | 5/5   | 2026-03-25 |
| 21.1  | GDELT News Relevance Filtering  | v1.2      | 2/2   | 2026-03-26 |
| 21.2  | GDELT Event Quality Pipeline    | v1.2      | 2/2   | 2026-03-28 |
| 21.3  | Multi-User Load Testing         | v1.2      | 3/3   | 2026-03-29 |

**v0.9-v1.2 Totals:** 30 phases (27 shipped, 3 deferred) | 72/72 plans executed

<details>
<summary>✅ v1.3 Data Quality & Layers (Phases 22-26.4) — SHIPPED 2026-04-09</summary>

- [x] Phase 22: GDELT Event Quality & OSINT Integration (3/3 plans)
- [x] Phase 22.1: Fixing Dispersion & Camera Fly-To (2/2 plans)
- [x] Phase 23: Threat Density Improvements (2/2 plans)
- [x] Phase 23.1: Detail Panel Navigation Stack (2/2 plans)
- [x] Phase 23.2: Improving Threat Density Scatter Plots (2/2 plans)
- [x] Phase 24: Political Boundaries Layer (2/2 plans)
- [x] Phase 25: Ethnic Distribution Layer (2/2 plans)
- [x] Phase 26: Water Stress Layer (6/6 plans)
- [x] Phase 26.1: Water Layer Refinements (3/3 plans)
- [x] Phase 26.3: Production Code Cleanup (6/6 plans)
- [x] Phase 26.4: Documentation & External Presentation (6/6 plans)

**11 phases, 36 plans, 82/82 requirements satisfied, 12 scrapped → v1.4**
**Full archive:** [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

## Milestone v1.4: GDELT Redo & Performance

New milestone covering the GDELT pipeline redo (fresh approach after the NLP
scrap) and the performance & load testing work deferred from v1.3. The
renumbering happened on 2026-04-08 after v1.3 closed out — see STATE.md
Roadmap Evolution for the full history.

### Phase 27: Conflict Geolocation Improvement (GDELT Redo) — was Phase 26.2

**Goal:** Rearchitect the GDELT conflict event pipeline with LLM-based extraction (Cerebras/Groq), precise geolocation via Nominatim, a simplified 5-type event ontology (airstrike, on_ground, explosion, targeted, other), multi-source deduplication/merge, casualty extraction, and situation summaries. Graceful degradation to raw GDELT when LLM is unavailable.
**Depends on:** v1.3 closeout (Phases 26.3 + 26.4 complete)
**Requirements:** D-01 through D-20 (from 27-CONTEXT.md)
**Plans:** 9 plans (6 complete + 3 gap closure)

Plans:

- [x] 27-01-PLAN.md — Server-side type foundation: 5-type ConflictEventType, CAMEO remapping, config
- [x] 27-02-PLAN.md — LLM adapter, event grouping, LLM extractor, Nominatim forward geocoding
- [x] 27-03-PLAN.md — Events route integration: LLM processing path + cooldown + dual-cache + degradation
- [x] 27-04-PLAN.md — Client-side type cascade: toggles, severity, filters, counters, layers
- [x] 27-05-PLAN.md — UI features: master + 5 sub-toggles, EventDetail enrichment, precision rings
- [x] 27-06-PLAN.md — Architecture docs, CLAUDE.md update, human verification
- [ ] 27-07-PLAN.md — Gap closure: normalize old event types before Zod validation (blocker fix)
- [ ] 27-08-PLAN.md — Gap closure: remove duplicate event toggles from Layers panel (major fix)
- [ ] 27-09-PLAN.md — Gap closure: distinct event colors + precision from actionGeoType (UAT Tests 6/10/11)

**Historical note:** This phase was originally numbered 26.2 and attempted an NLP-based approach (title fetching + me-cities lexicon + NLP extraction wired into the GDELT adapter). That approach was scrapped in Phase 26.3 after roughly two weeks of work because it was patching downstream of a bad signal rather than fixing the input. See `docs/adr/0005-phase-26-2-nlp-approach-scrapped.md` for the honest retrospective and `.planning/phases/archive-26.2-nlp-scrapped/` for the preserved historical artifacts.

### Phase 27.1: Dev Observability and LLM Pipeline Status (INSERTED)

**Goal:** Enhance dev-only API status overlay with real-time LLM pipeline progress, per-source health metrics, error diagnostics, data quality indicators, and copy diagnostics. Server-side progress via dedicated endpoint.
**Requirements:** OBS-01 through OBS-17
**Depends on:** Phase 27
**Plans:** 2/3 plans executed

Plans:

- [x] 27.1-01-PLAN.md -- Server-side LLM progress tracking + /api/events/llm-status endpoint + callback injection
- [x] 27.1-02-PLAN.md -- Store instrumentation (8 stores + 9 hooks with observability fields)
- [ ] 27.1-03-PLAN.md -- useLLMStatusPolling hook + DevApiStatus rewrite with full metrics

### Phase 27.2: Event Quality and Water Data Improvements (INSERTED)

**Goal:** Improve event data quality (high-tier news sources, richer LLM enrichment, precision ring UX, zoom icon fix, date slider styling) and water facility coverage (more dams/treatment plants, full filter parity, icon sizing).
**Requirements:** EQ-01 through EQ-14
**Depends on:** Phase 27.1
**Plans:** 2/4 plans executed

Plans:

- [x] 27.2-01-PLAN.md — Source tier registry, news filter tier gating, entity sourceTier field, severity multiplier
- [ ] 27.2-02-PLAN.md — LLM batch size reduction (8->4), prompt enrichment with news article context
- [ ] 27.2-03-PLAN.md — Precision ring 5%/40% opacity, zoom icon fix, date slider styling
- [x] 27.2-04-PLAN.md — Water Overpass name filter removal, reverse geocode labels, filter parity, icon sizing, ships label

### Phase 27.3: Water Facility Filtering Improvements

**Goal:** Fix dam filtering (union tags + relaxed notability), reduce reservoir noise to 50-200 via HOLISTIC filter (wikidata OR wikipedia OR (named AND priority country)), remove treatment_plant type entirely, enrich facilities with capacity/population/river data via bbox-pre-filtered pipeline, preload facility data via dev file cache, fix the invisible-attacked-water-sites bug, and add dev filter diagnostics. Make the water layer Palantir-grade using only free/public APIs.
**Depends on:** Phase 27.2
**Requirements:** D-01 through D-08 (from 27.3-CONTEXT.md)
**Plans:** 5/5 plans complete

Plans:

- [x] 27.3-01-PLAN.md — Server-side: types, union dam query, holistic reservoir filter, bbox-pre-filtered enrichment (capacity/city/river), dev file cache, filter stats, tests
- [x] 27.3-02-PLAN.md — Client-side: treatment_plant removal cascade, Capacity + Watershed detail sections, Water Filters diagnostics in DevApiStatus, attacked-water-sites bug fix in useWaterLayers
- [x] 27.3-03-PLAN.md — Gap closure: water route test mock emptyStats fixture (G-01/WR-02), WATER_ATTACK_EVENT_TYPES shared constant across 3 consumers (WR-01 REV-5 consistency)
- [x] 27.3-04-PLAN.md — Gap closure: UAT Test 3 "Dam near unknown" — server filter tightening (no_city rejection bucket) + client getWaterFacilityDisplayName helper
- [x] 27.3-05-PLAN.md — Gap closure: UAT re-run tests 6/7/8 — scope no_city to reservoirs only (+ priority-country named exemption), name-based dam reclassification (Hub Dam), getWaterFacilityDisplayName generic-token sentinel, DevApiStatus cached-response placeholder

### Phase 27.3.1: Water Facility Retry and Cleanup (INSERTED) — COMPLETE (2026-04-19)

**Goal:** Verify + calibrate Package A filter counts (~100–500 dams / ~100–500 reservoirs / ~13 desal, every facility significant with a real OSM name), persist water facilities to a committed JSON snapshot so cold-starts don't depend on Overpass availability, audit sites for the same pattern, and clean up `overpass-water.ts` accumulated complexity from Plans 01–05 + two debug rounds. Architecture must scale to many concurrent users — Overpass never on the request path synchronously.
**Depends on:** Phase 27.3 (must be merged to main first) + Overpass API recovery (blocked 2026-04-18 15:15 PT)
**Requirements:** R-01 through R-08 (from 27.3.1-CONTEXT.md)
**Plans:** 12/12 complete (8/8 initial shipped; 4 gap-closure plans 09-12 shipped 2026-04-19 closing all 7 UAT gaps G1-G7)
**Verification:** 10/10 must-have truths code-verified; HUMAN-UAT.md 3/3 pass (Gap 1 resolved inline via commit 9705893 — Water/Sites tabs gated on layer toggles); Gap 2 queued as Phase 27.3.2 below

**Gap-closure plans (27.3.1-UAT.md → 27.3.1-DIAGNOSIS.md):**

- [x] 27.3.1-09-PLAN.md — G5: npm script .env loading (wave 1; unblocks refresh:water)
- [x] 27.3.1-10-PLAN.md — G1+G2: hasName tightening + drop Turkey from PRIORITY_COUNTRIES + excluded_turkey bucket + delete waterLabeling.ts + regenerate snapshot (wave 2); snapshot 602 → 436 facilities
- [x] 27.3.1-11-PLAN.md — G3+G4: Redis envelope persistence (water:facilities:v2 + sites:v3 key bump) so R-08 observability survives cache writes (wave 3)
- [x] 27.3.1-12-PLAN.md — G6+G7: DevApiStatus top-bar modal restructure + G7 data-reality closeout note (wave 4)

### Phase 27.3.2: Water Facility Admission Tightening — Drop City/Coord Fallbacks

**Goal:** Tighten water facility admission so every admitted non-desalination facility carries a real Latin OSM name. Drop any OSM element whose `name` / `name:en` / `operator` chain all fail the `isLatin` script check (kills river-match rescue too — rule is dead-simple). Desalination exempt (sparse OSM coverage; server synthesizes `"Desalination Plant near {city}"` / `"at {lat}°,{lng}°"` for the 5 non-Latin exempt desal). Client-side fallback chain in `src/lib/waterLabel.ts` collapsed to a single one-liner read — server owns all label synthesis. Redis key bumps `water:facilities:v2` → `v3` to flush stale caches on deploy.
**Depends on:** Phase 27.3.1 merged to main
**Requirements:** D-01 through D-18 (from 27.3.2-CONTEXT.md)
**Plans:** 10/10 plans complete
**Source:** 27.3.1-HUMAN-UAT.md → Gap 2. User feedback: "I want to remove city and coord fallbacks and just drop those facilities."
**Expected impact:** Snapshot drops from 436 → ~304 (240 dams + 49 reservoirs + 15 desalination). New `no_resolved_name` bucket added to `WaterFilterStats.rejections` + `byTypeRejections`. Romanization of dropped Persian/Arabic names deferred to Phase 27.3.3.

### Phase 27.3.3: Romanize Non-Latin Water Facility Names

**Goal:** Re-admit water facility OSM elements that Phase 27.3.2 dropped because their only usable name tags are non-Latin (Persian, Arabic, Georgian, Cyrillic). Add a transliteration step to `extractLabel` in `server/adapters/overpass-water.ts` so `سد سعد` becomes `Saad Dam` and clears the `hasLatinLabel` gate. Transliteration candidates: ICU4C (`full-icu` wrapper), `@sindresorhus/transliterate`, or a Cerebras/Groq LLM call during snapshot refresh for highest-quality Arabic/Persian proper-noun romanization.
**Depends on:** Phase 27.3.2 merged to main
**Requirements:** TBD — queued during 27.3.2 discussion per user directive ("deferring romanization of persian/arabic names and readding those facilities in pipeline for phase 27.3.3")
**Plans:** 0 plans (to author)
**Source:** 27.3.2 CONTEXT discussion — user explicitly deferred transliteration to a dedicated phase rather than synthesizing non-Latin-language labels client-side.
**Expected impact:** Snapshot admission count climbs from ~304 back toward ~430 as romanized names enter the filter under the existing D-01 Latin-label gate. `no_resolved_name` rejection counts drop as transliteration covers each script.

### Phase 27.4: LLM Enrichment Improvements

**Goal:** Raise the LLM-enriched event pipeline to Palantir-grade accuracy and observability. Layered geolocation resolver (own-snapshot → POI-amenity Nominatim → direct Nominatim → 2-pass LLM verify → Bellingcat coord passthrough → GDELT ActionGeo fallback); richer prompts (news + Bellingcat + temporal context blocks); extended output schema (structured place hierarchy, confidence, reasoning, weapon/target, time/duration); dedicated Events section in DevApiStatus (waterfall, histograms, drill-down, call log, budget bars, eval harness, DLQ); flag-gated rollout (LLM_PIPELINE_V2); bounded retry + DLQ + circuit breaker; tracked token budget; cache-version bump (events:llm → events:llm:v2).
**Depends on:** Phase 27.3
**Requirements:** D-01 through D-40 (from 27.4-CONTEXT.md)
**Plans:** 9/9 plans complete

Plans:

- [x] 27.4-01-PLAN.md — Flag + cache versioning + v1 preservation (LLM_PIPELINE_V2, llmEventExtractor.v1.ts rename, meBounds constants, dev-cache v2 filename, events.ts flag-gated cache keys + schemaVersion on summary)
- [x] 27.4-02-PLAN.md — Zod v2 schema + discriminated union + llmProgress extension (llmSchema.ts with enrichedEventV2, GeocodeProvenance enum, derivePrecision, deriveSuspect; llmProgress.ts gains callHistory/tokenCounters/dlqCount/breakerState/evalScore/provenanceCounts/suspectCount)
- [x] 27.4-03-PLAN.md — Resolver skeleton + provenance tagging (llmResolver.ts with 6-path dispatch; own-snapshot + direct + bellingcat + gdelt-fallback functional; POI + 2-pass verify stubs for Plan 05)
- [x] 27.4-04-PLAN.md — Nominatim extensions (forwardGeocodeConstrained with viewbox + 22 countrycodes + amenity mode + top-5; ME defaults hard-coded server-side)
- [x] 27.4-05-PLAN.md — POI specialist + 2-pass verify wiring (replaces Plan 03 stubs; sanity gate for city-precision or >250km distance; reranker LLM call with strict pick schema; 1-req/s throttle + Redis cache)
- [x] 27.4-06-PLAN.md — v2 extractor + enriched prompts (llmEventExtractor.v2.ts BATCH_SIZE=2; NEWS + BELLINGCAT + TEMPORAL context blocks; resolveLocation integration; barrel routes by LLM_PIPELINE_V2)
- [x] 27.4-07-PLAN.md — Reliability + budget + call-log (llmCircuitBreaker, llmDLQ, llmTokenBudget modules; llm-provider.ts retry + jitter + token incr + call history)
- [x] 27.4-08-PLAN.md — Eval harness + prompt replay (ground-truth-events.json curated with user sign-off; resolver-only eval per A6; /llm-replay dev-only endpoint with dual-gate; D-25 prod-flip gate visible in /llm-status)
- [x] 27.4-09-PLAN.md — DevApiStatus Events section (extends /llm-status with full v2 payload; Events tab + EventsFiltersSection 8 blocks: waterfall, provenance histogram, drill-down, call log, budget bars, eval score, DLQ, suspect count)

### Phase 27.4.1: V2 Extractor Watchdog + LLM Pipeline TS Cleanup (INSERTED)

**Goal:** Close Phase 27.4's known P0 architectural defect — v2 extractor writes `events:llm:v2` Redis cache only after all batches complete, so one hung Cerebras call loses 45+ min of LLM work (stall reproduced at batch 133/184). Introduce a per-batch `cacheSetSafe` with accumulating writes, a per-batch timeout watchdog (default 90s, 60s soft-warn in callHistory, env-var override via `LLM_BATCH_TIMEOUT_MS`) that DLQ-routes timed-out groups with `reason='timeout_watchdog'`, and a shared `server/lib/llmExtractorWatchdog.ts` helper applied symmetrically to both v1 and v2 extractors so the rollback path stays reliable. Bundle cleanup of the 20 pre-existing TS errors in `server/lib/llmEventExtractor.v1.ts` (narrow at the Zod parse boundary where Zod guarantees non-optionality; local-bind + early-continue where `noUncheckedIndexedAccess` is the culprit — audit 3 errors first before choosing). Also bundle three quick wins: 1 TS error in `server/adapters/llm-provider.ts:232`, 1 color test fix in `src/__tests__/entityLayers.test.ts` (expects `[190,170,168]`, code returns `[220,100,90]` post-27 commit `709fa15`), and strip click-to-swap from `PipelineVersionPill` in Topbar (pill stays as read-only served-version indicator; env var + POST /api/events/llm-pipeline endpoint remain the authoritative swap surface for operator/scripted use).
**Depends on:** Phase 27.4
**Requirements:** Derived from 27.4.1-SCOPE.md (P0 + v1.ts TS cleanup + quick wins 3a/3b/3c)
**Plans:** 4/4 plans complete

Plans:

- [x] 27.4.1-01-PLAN.md — Shared watchdog helper + DLQ reason extension + LLM_BATCH_TIMEOUT_MS env var + watchdogTimeoutCount progress field
- [x] 27.4.1-02-PLAN.md — Quick wins bundle: llm-provider.ts:232 TS fix, entityLayers.test.ts color update, PipelineVersionPill click-to-swap strip
- [x] 27.4.1-03-PLAN.md — V2 extractor P0 fix: LLMCachePayload envelope + per-batch cacheSetSafe + watchdog wrap
- [x] 27.4.1-04-PLAN.md — V1 extractor watchdog symmetry + 20 TS error cleanup (audit-first per D-14)

### Phase 27.4.2: CI Health + LLM v2 Quality Tuning (INSERTED)

**Goal:** Bundle two concerns — green `main` CI (32 filter-test fixture failures, 4 npm-audit vulns, ~25 prettier format-drift files, ~20 lint warnings) and raise v2 LLM enrichment to a measurable quality bar (one full 184-batch run completes under the new watchdog, captures eval baseline against the 50-event ground truth harness, then tuning iteration beats v1 eval score by ≥5pp AND drops `gdelt-actiongeo-fallback` provenance below 25%). Greening CI is the prerequisite so regression-watch during LLM tuning is trustworthy.
**Depends on:** Phase 27.4.1
**Requirements:** D-01 through D-17 (from 27.4.2-CONTEXT.md; phase has no formal REQ-IDs)
**Plans:** 7/10 plans complete

Plans:

- [x] 27.4.2-01-filter-test-fixture-PLAN.md — Wave 1: backfill enabledPrecisions in filters.test.ts makeDefaults() (D-03; greens 544 cascading failures from one root cause)
- [x] 27.4.2-02-npm-audit-fix-PLAN.md — Wave 1: npm audit fix without --force (D-04; clear high-severity advisories)
- [x] 27.4.2-03-prettier-mass-sweep-PLAN.md — Wave 1: prettier sweep ~56 canonical drift files (D-05; lands BEFORE Wave 2 to avoid merge-conflict thrash on server/lib/llm\*.ts)
- [x] 27.4.2-04-lint-sweep-and-ci-gate-PLAN.md — Wave 1: lint sweep (411 problems / 62 errors → 0 errors via .claude/\*\* worktree-isolation Rule-3 patch — all 62 errors lived in stale agent snapshots; live codebase had 0 errors); deferred vite.config.ts manualChunks fix absorbed; D-02 negotiated reading locked; all 4 D-02 gates GREEN; Wave 2 gate-keeper PASSED
- [x] 27.4.2-05-pre-commit-guard-verification-PLAN.md — Wave 1: verified .husky/pre-commit fires (3 live-fire tests: prettier drift → auto-fix; `any` lint error → BLOCK; gitleaks → ran on success); added .husky/pre-push for full-tree format:check + lint per RESEARCH Open Q #2 YES; CHECKPOINT auto-confirmed inline per Plan 04 precedent (gates exit-code-checkable); Wave 1 CLOSED, Wave 2 may begin
- [x] 27.4.2-06-tuning-baseline-and-helpers-PLAN.md — Wave 2: scripts/eval-replay.ts + setProviderOrderOverride + watchdogTimeoutCount surfacing + pre-tuning baseline capture (D-06/D-07/D-08/D-09/D-10) — COMPLETE 2026-04-25 (4 commits f13f0d7+8acdbb9+45a5dc4+64a4b02; resolver baseline 38/38/41/50 → +5pp target = 0.810 = ≥41/50; production fallback% = 9.7% ALREADY << 25%; D-13 stop only requires eval-at-20km uplift of 3 events)
- [x] 27.4.2-07-tuning-lever-1-poi-PLAN.md — Wave 2: D-11 lever 1 — Branch 2 fix (amenity= → q=<landmark>) — COMPLETE 2026-04-25 (single atomic commit `86136cf`; eval uplift +18pp at 20km 0.760 → 0.940 = 47/50, 3.6x the +5pp D-13 target; D-13 stop condition MET on both gates; Plans 08/09/10 deferred to Phase 27.5 backlog; spot-check audit revealed pre-fix Branch 2 was sending amenity= without place name per Nominatim spec violation, delivering wrong coords for 9/12 within-20km failures; wave-boundary production run abandoned mid-flight at ~26% due to Cerebras hangs — captured as Phase 27.4.3 backlog)
- [~] 27.4.2-08-tuning-lever-2-twopass-thresholds-PLAN.md — Wave 2 (DEFERRED post-D-13): D-11 lever 2 — 2-pass verify thresholds (250km gate + WR-04 single-candidate). Captured as Phase 27.5 backlog.
- [~] 27.4.2-09-tuning-lever-3-system-prompt-PLAN.md — Wave 2 (DEFERRED post-D-13): D-11 lever 3 — SYSTEM_PROMPT_V2 anti-fabrication tightening. Captured as Phase 27.5 backlog.
- [~] 27.4.2-10-tuning-lever-4-news-temporal-bellingcat-PLAN.md — Wave 2 (DEFERRED post-D-13): D-11 lever 4 — NEWS/TEMPORAL/BELLINGCAT block tuning. Captured as Phase 27.5 backlog. Phase close needs separate orchestration plan (or fold into Phase 27.4.3 follow-up).

**Wave structure:** Wave 1 (P1-P5) sequential; Wave 2 (P6-P10) sequential, P8/P9/P10 conditional on D-13 stop. P6 depends on P5 (D-02 strict CI gate before tuning).

**Explicitly out-of-scope:** Phase 27.4.5 (deck.gl v9 `depthTest` TS drift — TBD slot; renumber chain since 2026-04-26 has displaced original 27.4.5/27.4.6 references — flight-recorder Redis history now backlog/TBD), Phase 27.3.3 (romanization of non-Latin water names), Vercel preview deploy failure.

### Phase 27.4.3: free-claude-code Routing Evaluation (INSERTED)

**Goal:** Evaluate [free-claude-code](https://github.com/Alishahryar1/free-claude-code) as a replacement for the manual Cerebras/Groq routing in `server/adapters/llm-provider.ts`. Determine whether free-claude-code can serve as the primary LLM provider for the v2 enrichment pipeline (replacing the Cerebras-primary + Groq-fallback cascade) or fits as a third tier. Evaluation criteria: (1) **feasibility** — license/auth model fit; (2) **reliability** — avoids the Cerebras-style hangs that abandoned Plan 07's wave-boundary production run; (3) **cost/quota** — daily/per-call limits vs current Cerebras 1M TPD + Groq 200K TPD free tiers; (4) **integration shape** — drop-in OpenAI-compatible SDK or custom client; (5) **eval quality parity** — runs the 50-event ground-truth harness and scores within ±5pp of Plan 07 baseline (eval-at-20km 0.940). Phase 27.4.2 `HUMAN-UAT.md` tests 1+2 (full 184-batch production run + post-fix fallback% measurement) are blocked on this phase landing.
**Depends on:** Phase 27.4.2
**Requirements:** Derived from 27.4.3-CONTEXT.md D-01 through D-23 (no formal REQ-IDs assigned to this phase)
**Plans:** 6/6 plans complete

Plans:

- [x] 27.4.3-01-PLAN.md — Wave 1: Vendor freeClaudeRouter.ts (NVIDIA NIM + OpenRouter, RollingWindow, 429 backoff, <think> stripper) + env/config + Provider/DLQ type widening + 15 unit tests; classifyError exported for B-1
- [x] 27.4.3-02a-PLAN.md — Wave 2: Type foundations — enrichedEventV3 Zod branch + LLMRunSummary/LLMPipelineProgress v3 fields (latencyHistogram/rateLimit/errorTaxonomy/costShadow/routingTrace/schemaFailures) + RecentEnrichedEvent.reasoningTrace + .lineageHash (B-2) + A9 mirror in same atomic commit
- [x] 27.4.3-02b-PLAN.md — Wave 3: Runtime — pipelineAudit.ts canonical home (B-3 cyclic-import fix) + llmLineage.ts appendLineage helper (B-2) + freeClaudeRouter B-1 instrumentation (latency/headroom/error-taxonomy/shadow-cost) + v3 extractor near-clone of v2 + routes/events.ts v3 fallback chain + eval harness --model arg
- [x] 27.4.3-03-PLAN.md — Wave 4: D-08 multi-model bake-off — exercise >=3 NVIDIA NIM candidates, capture per-distance scores in 27.4.3-03-BAKEOFF.md, lock winner in NVIDIA_NIM_DEFAULT_MODEL (D-16 Gate A floor 0.890)
- [x] 27.4.3-04-PLAN.md — Wave 5 (re-sequenced from W-5; runs after Plan 03 winner-lock): DevApiStatus 7 v3 blocks (RoutingTrace, Latency, RateLimitHeadroom local-bind W-4, SchemaStrictFailure, ErrorTaxonomy, PipelineFlips, CostShadow) + LineageDrillDown extension (B-2 fields populated) + Topbar pill v3 (read-only blue) + regression tests (Partial<LLMStatus> mocks per W-6)
- [x] 27.4.3-05-PLAN.md — Wave 6 (re-sequenced from W-5): D-17 auto-rollback wiring (watchdog-recurrence + eval-drop, imports appendPipelineAudit from lib/pipelineAudit per B-3) + D-16 Gate A/B cutover + cutover POST + Topbar pill smoke + 27.4.2-HUMAN-UAT.md tests 1+2 close

### Phase 27.4.4: v3 Latency Remediation and Cutover

**Goal:** Solve the v3 production-latency blocker that caused Phase 27.4.3 Gate B to fail (qwen/qwen3.5-397b-a17b p99 929s, 11 watchdog timeouts, 218-min duration), then execute the deferred cutover (POST `/api/events/llm-pipeline {version: 'v3'}`) and close Phase 27.4.2 HUMAN-UAT tests 1+2. Reuses all infrastructure from 27.4.3 (vendored router, v3 extractor, observability dashboard, auto-rollback, eval harness, bake-off scripts). Approach TBD via discussion (candidate paths: alternative NIM model with lower long-tail latency, adaptive batching, provider racing, looser watchdog with cap). Success: Gate B PASS (watchdog=0, DLQ≤5, duration≤120min) + cutover live + UAT closed.
**Depends on:** Phase 27.4.3
**Requirements:** Derived from 27.4.4-CONTEXT.md (TBD)
**Plans:** Plan 01 (BAKEOFF + CUTOVER waves) shipped 2026-04-29; Plan 02 (Gate B closeout) deferred until NIM throttle clears.

### Phase 27.4.6: Cron-Driven Pipeline Trigger (INSERTED)

**Goal:** Move the LLM enrichment pipeline trigger out of `/api/events` and into a daily Vercel cron at 4am UTC. `/api/events` becomes a pure cache reader — first user no longer pays the ~95-min cold-start cost. Pipeline stays warm via server-side cron. Hobby plan compliance: drops dedicated `/api/cron/eval` schedule entry (eval-drift folds into the existing `/api/cron/health` handler per D-09 in CONTEXT.md), keeps `/api/cron/warm` (still needed for Overpass site/water pre-warm). Success: `/api/events` never triggers extraction; cron self-heals on cold cache; `?force=true` query param bypasses cooldown for ops; documented NIM-throttle fallback is "accept failure, raw GDELT bridge holds the line."
**Depends on:** Phase 27.4.4
**Requirements:** Derived from 27.4.6-CONTEXT.md (D-01 through D-11)
**Plans:** 1/1 plans complete

### Phase 28: Performance & Load Testing — was Phase 27 (UMBRELLA)

**Goal:** Close milestone v1.4 by sweeping the codebase, polishing the prod surface, and proving 1–300 concurrent users work end-to-end. Per CONTEXT.md D-01, this phase is split into three sequenced child phases (cleanup → sync → load). The umbrella retains the goal, deliverables inventory, and shared CONTEXT.md; each child carries its own PLAN train and merges to `main` before the next starts.
**Depends on:** Phase 27.4.6
**Requirements:** Derived from 28-CONTEXT.md (D-01 through D-21)
**Plans:** Delivered via children (see 28.1 / 28.2 / 28.3 below)

**Key deliverables (inventory, allocated across 28.1/28.2/28.3):**

- Ghost code + duplicate code sweep (knip + ts-prune + manual walk) → **28.1**
- Hardcode generalization: env-tunable operational levers, centralized domain constants, CSS @theme color migration → **28.1**
- UI bug fixes + remaining debugging items + normalization (TS strict, Zustand selectors, Redis key naming) → **28.1**
- Dev/prod feature promotion (per-field opt-in: event/OSM IDs, LLM confidence, EntityTooltip dev block graduate; severity score, MapDevExposer, notabilityScore stay dev-only) → **28.2**
- Domain rename to `otg-iran-monitor.vercel.app` → **28.2**
- Bearer-bypass for `rateLimiters.public` global tier (folds Phase 999.1) → **28.2**
- Bearer-gated graduation of operator endpoints (`POST /api/events/llm-pipeline`, `POST /api/events/llm-replay/:groupKey`) → **28.2**
- Edge cache + Redis fallback architecture (`s-maxage` per endpoint) → **28.3**
- k6 sweep 50/100/150/200/250/300 VU, full-browser-loop polling per VU → **28.3**
- PASS/FAIL bar at 300 VU: p95<500ms, p99<1500ms, error<1%, cache-hit>90% → **28.3**

**Historical note:** This phase was originally numbered 27 under v1.3. It was deferred to v1.4 on 2026-04-08 alongside the GDELT redo so both can run against the stabilized v1.3 codebase. Split into 28.1/28.2/28.3 on 2026-04-30 per 28-CONTEXT.md D-01 (regression-prone cleanup, prod-surface sync, and greenfield load test each get their own commit train so bisects stay tractable).

### Phase 28.1: Cleanup Sweep (umbrella child of 28)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (sequence position 1 of 3): kill regression risk before sync and load test land. Sweep ghost code, duplicate code, normalization gaps, UI bugs, and unresolved debugging items. Generalize hardcodes per D-10 (operator-tunable env vars: polling intervals, thresholds, radii) / D-11 (domain-definitional constants centralized in `src/lib/domain.ts`, NOT env-tunable: IRAN_BBOX, IRAN_CENTER, WAR_START, ADS-B 500NM radius) / D-13 (visual constants migrate to CSS custom properties + Tailwind v4 `@theme`). Methodology per D-14: `npx knip` + `npx ts-prune` for mechanical dead-export enumeration, then a manual codebase walk for logically-dead-but-type-reachable code. Triage doc committed before deletions, then atomic per-module deletion commits. Test suites must stay green at every wave boundary.
**Depends on:** Phase 27.4.6 (cron-driven pipeline trigger merged to main)
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-10 / D-11 / D-12 / D-13 / D-14 + 28.1-CONTEXT.md D-22 / D-23 / D-24 / D-25 / D-26 / D-27 / D-28 / D-29 (filtered + child-specific)
**Plans:** 7 plans (7-wave API-first serial per D-28)

Plans:

- [x] 28.1-01-W1-api-audit-PLAN.md — W1: hand-curated probe + fix every /api/\* endpoint and upstream adapter (D-22a, D-23) ✅ 2026-05-02 (audit `6876f87`, summary commits incoming; 0 BROKEN, 4 DRIFT items routed to W2 + W7 sub-4)
- [x] 28.1-02-W2-health-endpoint-PLAN.md — W2: /api/health aggregate endpoint + DevApiStatus All APIs tab + HealthBanner (D-22b, D-24, D-25, D-26) ✅ 2026-05-02 (8 RED→GREEN commits c59ab5a→7a75f64; 1975/1975 tests; lint/prettier/tsc clean; SOURCE_KEYS dedupe folds W7 sub-4 forward; live preview UAT skipped per pre-existing Phase 26.3 fail-fast `parseEnv` issue, user-approved Path B)
- [ ] 28.1-03-W3-knip-triage-PLAN.md — W3: knip + ts-prune triage doc with confidence tags; zero source modifications (D-14, D-29)
- [ ] 28.1-04-W4-deletions-PLAN.md — W4: atomic per-module deletion commits + manual UAT against CLAUDE.md feature inventory (D-14, D-29)
- [ ] 28.1-05-W5-hardcode-generalization-PLAN.md — W5: src/lib/domain.ts centralization + 11 D-12 env vars (D-11, D-12)
- [ ] 28.1-06-W6-css-theme-migration-PLAN.md — W6: CSS @theme migration + colorBridge.ts deck.gl bridge (D-13)
- [ ] 28.1-07-W7-normalization-PLAN.md — W7: 7-sub-category normalization (TS strict / lint / Zustand / Redis audit / vitest / imports / logging) (D-27)

### Phase 28.2: Dev/Prod Sync + Domain Rename + Rate-Limiter Fold-In (umbrella child of 28)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (sequence position 2 of 3): polish the prod surface so 28.3's load test runs against a coherent, operator-controllable deployment. Three concerns bundled because they all touch the prod surface: (a) Per-field dev/prod feature promotion per D-05/D-06/D-07 — graduate event/OSM IDs, LLM confidence + provenance, EntityTooltip dev block to Bearer-gated prod via `shouldRenderDashboard()`; keep severity score, MapDevExposer (`window.__map`), and `notabilityScore` dev-only forever. (b) Bearer-gated graduation of operator-control endpoints per D-08: `POST /api/events/llm-pipeline` (runtime v1/v2/v3 swap) and `POST /api/events/llm-replay/:groupKey` (single-group re-extraction with current prompt — Pitfall 6 dual-gate preserved, never writes cache). (c) Domain rename to `otg-iran-monitor.vercel.app` per D-03 — vercel.json, package.json, scripts/load-test.js BASE_URL, README.md, PROJECT_SPEC.md, PROJECT_STATUS.md, .planning/PROJECT.md, memory/reference_deployment.md. (d) Phase 999.1 fold-in per D-04: Bearer-bypass for `rateLimiters.public` global 6-req/min tier — when valid `DASHBOARD_PASSWORD` Bearer is present the global tier is skipped; per-endpoint limits still apply. Old-domain redirect strategy is Claude's discretion at planning time.
**Depends on:** Phase 28.1 (must merge to main first per D-01)
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-03 / D-04 / D-05 / D-06 / D-07 / D-08 / D-09 + Claude's-discretion items (redirect mechanic, `/api/sources` edge-cache classification handoff to 28.3)
**Plans:** 0 plans

### Phase 28.3: Performance Optimization + 1–300 VU Load Test (umbrella child of 28)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (sequence position 3 of 3): validate production handles 1–300 concurrent users with measurable PASS/FAIL signal against a clean codebase. Performance optimization layer per D-19: add `s-maxage` CDN headers to `/api/*` (flights 5s, ships 30s, markets 60s, events/news 900s, sites/water 86400s) so Vercel CDN absorbs bulk reads at 300 VU and Redis only fires on cache miss + warm-up cron. k6 sweep per D-15 (GitHub Actions runner, results land as PR artifacts) / D-16 (six discrete tiers 50/100/150/200/250/300 VU, 60s ramp + 5min steady, ~45min wall-time per sweep) / D-20 (full browser-loop per VU: t=0 fires site/water/sources/markets/flights/ships/events/news, then polls flights@5s, ships@30s, markets@60s, events@15min, news@15min — ~0.27 req/s/VU → ~81 RPS at 300 VU). PASS/FAIL bar per D-17 (measured at 300 VU steady-state): p95<500ms hot endpoints, p99<1500ms, error<1%, no 5xx spikes, cache-hit>90% (non-negotiable). Beyond PASS/FAIL per D-18: per-endpoint latency breakdown (p50/p95/p99 tagged), 429 count (validates D-04 Bearer-bypass), Vercel cold-start frequency (validates warm-up cron sufficiency), Upstash Redis cache hit ratio. Polling parity per D-21 (D-20 shape + D-19 edge cache eliminates user-A-vs-user-B divergence). Hobby cron cap = 3, load test does NOT consume a slot.
**Depends on:** Phase 28.2 (must merge to main first per D-01; D-03 domain rename must land before scripts/load-test.js BASE_URL update)
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-15 / D-16 / D-17 / D-18 / D-19 / D-20 / D-21 + Claude's-discretion items (k6 reporter artifact format, `/api/sources` edge-cache classification)
**Plans:** 0 plans

## Deferred Work

Carried from v1.2:

- **Satellite Imagery** -- ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:

- **GDELT BigQuery adapter** -- SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** -- GramJS/TGSTAT for OSINT early-warning signals

## Backlog

### Phase 999.1: Remove or relax `rateLimiters.public` global tier — FOLDED INTO PHASE 28.2

**Goal:** Resolve operator-blocking rate limit. The 6 req/min global tier in `server/middleware/rateLimit.ts` (applied at `server/index.ts:99` to all `/api/*`) blocks the operator's own browser — flights polling alone is 12 req/min. Three options scoped earlier: (a) remove global tier (per-endpoint limits already tuned for browser), (b) bump to 300/min to keep loose anti-scraper net, (c) bypass when `DASHBOARD_PASSWORD` Bearer present.
**Resolution:** Folded into Phase 28.2 on 2026-04-30 per 28-CONTEXT.md D-04 — option (c) Bearer-bypass selected. This entry remains for historical traceability.
**Requirements:** Subsumed by 28-CONTEXT.md D-04
**Plans:** 0 plans (delivered via Phase 28.2 plan train)

### Phase 999.2: `api/vercel-entry.js` build-artifact discipline (BACKLOG)

**Goal:** Eliminate manual rebuild-before-commit friction introduced in commit `155989f`. Today the 1.7MB tsup-bundled function is tracked in git so Vercel detects it as a serverless function. Two long-term options: (a) add a CI check that fails if `api/vercel-entry.js` is stale relative to `server/**/*`; (b) migrate to Vercel's Build Output API (`.vercel/output/functions/api/vercel-entry.func/`) so the function is generated into Vercel's expected location during build, eliminating the tracked artifact.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Phase 27.4.6 cron first-tick verification (BACKLOG)

**Goal:** Confirm the `/api/cron/refresh-events` cron actually fires at 4am UTC, populates `events:llm:v3`, and `/api/events/llm-status` reports `lastTriggerSource: "cron"`. Passive verification — happens automatically, but no current alarm if it doesn't. Watch `dlqCount` after the first tick: non-zero means NIM was throttled (D-08 path) and operator must `?force=true` after NIM recovers. If 24h pass with `lastTriggerSource` never flipping to "cron", run the 8-step PLAN.md Task 6 curl checklist for diagnosis.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
