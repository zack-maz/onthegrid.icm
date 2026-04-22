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
**Plans:** 4 plans

Plans:

- [ ] 27.4.1-01-PLAN.md — Shared watchdog helper + DLQ reason extension + LLM_BATCH_TIMEOUT_MS env var + watchdogTimeoutCount progress field
- [ ] 27.4.1-02-PLAN.md — Quick wins bundle: llm-provider.ts:232 TS fix, entityLayers.test.ts color update, PipelineVersionPill click-to-swap strip
- [ ] 27.4.1-03-PLAN.md — V2 extractor P0 fix: LLMCachePayload envelope + per-batch cacheSetSafe + watchdog wrap
- [ ] 27.4.1-04-PLAN.md — V1 extractor watchdog symmetry + 20 TS error cleanup (audit-first per D-14)

### Phase 28: Performance & Load Testing — was Phase 27

**Goal:** Optimize initial load time and validate production handles 250 concurrent users.
**Depends on:** Phase 27.4 (GDELT redo + water/LLM improvements complete before load testing)
**Requirements:** TBD
**Plans:** 0 plans

**Key deliverables:**

- Staggered API calls on mount (priority: flights -> ships/events -> rest)
- Lazy-load visualization layer components (only load when toggled)
- Code-splitting evaluation for maplibre chunk (282KB gzipped)
- k6 test scaled to 250 VUs with thundering herd mitigation
- Request coalescing for concurrent identical requests (flights especially)
- CDN cache tuning (s-maxage optimization per endpoint)
- Vercel warm-up cron frequency evaluation

**Historical note:** This phase was originally numbered 27 under v1.3. It was deferred to v1.4 on 2026-04-08 alongside the GDELT redo so both can run against the stabilized v1.3 codebase.

## Deferred Work

Carried from v1.2:

- **Satellite Imagery** -- ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:

- **GDELT BigQuery adapter** -- SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** -- GramJS/TGSTAT for OSINT early-warning signals
