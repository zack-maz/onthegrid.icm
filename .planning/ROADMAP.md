# Roadmap: Iran Conflict Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- ✅ **v1.3 Data Quality & Layers** -- Phases 22-26.4 (shipped 2026-04-09) — [archive](milestones/v1.3-ROADMAP.md)
- **v1.4 GDELT Redo & Performance** -- Phases 27-28 (planned)

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

### Phase 28: Performance & Load Testing — was Phase 27

**Goal:** Optimize initial load time and validate production handles 250 concurrent users.
**Depends on:** Phase 27 (GDELT redo — to ensure load tests hit a stable event pipeline)
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
